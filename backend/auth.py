"""Supabase JWT auth + tenant context for SaaS multi-tenancy."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Annotated, Callable, Literal, Optional

import jwt
from fastapi import Depends, HTTPException, Request

try:
    from .config import get_settings
    from . import services
except ImportError:  # Permite `uvicorn main:app` desde backend/.
    from config import get_settings
    import services

logger = logging.getLogger("app.auth")

Role = Literal["owner", "admin", "member", "viewer"]
ROLE_RANK = {"viewer": 0, "member": 1, "admin": 2, "owner": 3}


@dataclass
class AuthContext:
    user_id: str
    email: Optional[str]
    team_id: Optional[str]
    role: Role
    is_authenticated: bool


def _decode_supabase_jwt(token: str) -> dict:
    secret = get_settings().SUPABASE_JWT_SECRET
    if not secret:
        raise HTTPException(status_code=503, detail="SUPABASE_JWT_SECRET no configurado")
    try:
        return jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience="authenticated",
            options={"require": ["sub", "exp"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="Token expirado") from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail="Token inválido") from exc


def _membership_for_user(user_id: str, team_id: str | None) -> dict | None:
    """Resuelve membership activa; si no hay team_id, usa la primera."""
    sb = services.get_supabase()
    query = (
        sb.table("team_memberships")
        .select("team_id, role, status")
        .eq("user_id", user_id)
        .eq("status", "active")
    )
    if team_id:
        query = query.eq("team_id", team_id)
    rows = query.limit(1).execute().data or []
    return rows[0] if rows else None


def get_auth_context(request: Request) -> AuthContext:
    """Dependencia principal: demo mode o JWT + membership."""
    settings = get_settings()

    if settings.AUTH_DISABLED:
        team_id = request.headers.get("x-team-id") or settings.DEFAULT_TEAM_ID or None
        return AuthContext(
            user_id="demo-user",
            email="demo@local",
            team_id=team_id or None,
            role="owner",
            is_authenticated=False,
        )

    auth_header = request.headers.get("authorization") or ""
    if not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Authorization Bearer requerido")

    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Token vacío")

    claims = _decode_supabase_jwt(token)
    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token sin sub")

    email = claims.get("email")
    requested_team = request.headers.get("x-team-id") or None
    membership = _membership_for_user(user_id, requested_team)

    if requested_team and not membership:
        raise HTTPException(status_code=403, detail="No eres miembro de ese team")

    if not membership:
        # Usuario autenticado sin team aún (puede crear uno).
        return AuthContext(
            user_id=user_id,
            email=email,
            team_id=None,
            role="viewer",
            is_authenticated=True,
        )

    role = membership.get("role") or "member"
    if role not in ROLE_RANK:
        role = "member"

    return AuthContext(
        user_id=user_id,
        email=email,
        team_id=membership["team_id"],
        role=role,  # type: ignore[arg-type]
        is_authenticated=True,
    )


def require_auth(auth: Annotated[AuthContext, Depends(get_auth_context)]) -> AuthContext:
    """Exige JWT real (no demo) salvo AUTH_DISABLED."""
    if get_settings().AUTH_DISABLED:
        return auth
    if not auth.is_authenticated:
        raise HTTPException(status_code=401, detail="Autenticación requerida")
    return auth


def require_role(*roles: Role) -> Callable:
    """Factory: exige que el rol del usuario esté en `roles`."""
    allowed = set(roles)

    def _dep(auth: Annotated[AuthContext, Depends(get_auth_context)]) -> AuthContext:
        if get_settings().AUTH_DISABLED:
            return auth
        if not auth.is_authenticated:
            raise HTTPException(status_code=401, detail="Autenticación requerida")
        if auth.role not in allowed:
            raise HTTPException(
                status_code=403,
                detail=f"Rol insuficiente (requiere {', '.join(sorted(allowed))})",
            )
        return auth

    return _dep


def require_team(auth: Annotated[AuthContext, Depends(get_auth_context)]) -> AuthContext:
    """Exige team_id resuelto (header, DEFAULT_TEAM_ID o membership)."""
    if not auth.team_id:
        raise HTTPException(
            status_code=400,
            detail="Team requerido: envía X-Team-Id o configura DEFAULT_TEAM_ID",
        )
    return auth
