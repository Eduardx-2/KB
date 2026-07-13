"""In-memory sliding-window rate limiter (single-instance)."""
from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Deque

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

try:
    from .config import get_settings
except ImportError:
    from config import get_settings


class SlidingWindowLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, Deque[float]] = defaultdict(deque)

    def check(self, key: str, limit: int, window_seconds: float = 60.0) -> tuple[bool, int]:
        """Returns (allowed, retry_after_seconds)."""
        now = time.monotonic()
        window = self._hits[key]
        cutoff = now - window_seconds
        while window and window[0] < cutoff:
            window.popleft()
        if len(window) >= limit:
            retry_after = max(1, int(window_seconds - (now - window[0])) + 1)
            return False, retry_after
        window.append(now)
        return True, 0


_limiter = SlidingWindowLimiter()


def _limit_for_path(path: str, default: int) -> int:
    if path.startswith("/api/transcribe"):
        return 10
    if path.startswith("/api/agents/"):
        return 20
    return default


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Key = IP + optional user/team headers. Skip health endpoints."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path in ("/api/health", "/api/health/db", "/docs", "/openapi.json", "/redoc"):
            return await call_next(request)

        settings = get_settings()
        limit = _limit_for_path(path, settings.RATE_LIMIT_PER_MINUTE)
        ip = _client_ip(request)
        # Auth middleware no ha corrido aún; usamos headers como hint.
        user_hint = request.headers.get("authorization", "")[-16:] or "anon"
        team_hint = request.headers.get("x-team-id") or "noteam"
        key = f"{ip}:{user_hint}:{team_hint}:{path.split('/')[2] if path.startswith('/api/') else path}"

        allowed, retry_after = _limiter.check(key, limit)
        if not allowed:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded", "retry_after": retry_after},
                headers={"Retry-After": str(retry_after)},
            )
        return await call_next(request)
