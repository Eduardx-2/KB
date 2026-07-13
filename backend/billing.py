"""Stripe-ready billing stubs (work without Stripe key → 501)."""
from __future__ import annotations

import logging
from typing import Any, Optional

import httpx
from fastapi import HTTPException

try:
    from .config import get_settings
    from . import services
except ImportError:
    from config import get_settings
    import services

logger = logging.getLogger("app.billing")


def create_checkout_session(
    team_id: str,
    plan_code: str,
    success_url: str = "https://example.com/billing/success",
    cancel_url: str = "https://example.com/billing/cancel",
) -> dict[str, Any]:
    """Create a Stripe Checkout session, or return a stub 501 payload."""
    settings = get_settings()
    key = (settings.STRIPE_SECRET_KEY or "").strip()
    if not key:
        return {"url": None, "detail": "Configure STRIPE_SECRET_KEY"}

    price_map = {
        "starter": settings.STRIPE_PRICE_STARTER,
        "pro": settings.STRIPE_PRICE_PRO,
    }
    price_id = (price_map.get(plan_code) or "").strip()
    if not price_id:
        raise HTTPException(
            status_code=400,
            detail=f"No Stripe price configured for plan '{plan_code}'",
        )

    # Minimal Checkout Session via Stripe REST API (no stripe SDK required).
    try:
        with httpx.Client(timeout=20.0) as client:
            resp = client.post(
                "https://api.stripe.com/v1/checkout/sessions",
                auth=(key, ""),
                data={
                    "mode": "subscription",
                    "success_url": success_url,
                    "cancel_url": cancel_url,
                    "line_items[0][price]": price_id,
                    "line_items[0][quantity]": "1",
                    "client_reference_id": team_id,
                    "metadata[team_id]": team_id,
                    "metadata[plan_code]": plan_code,
                },
            )
        if resp.status_code >= 400:
            logger.error("Stripe checkout error: %s", resp.text)
            raise HTTPException(status_code=502, detail="Stripe checkout failed")
        data = resp.json()
        return {"url": data.get("url"), "id": data.get("id")}
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Stripe checkout request failed")
        raise HTTPException(status_code=502, detail=f"Stripe error: {exc}") from exc


def verify_webhook_stub(payload: bytes, signature: Optional[str]) -> dict[str, Any]:
    """Stub webhook verification. Requires STRIPE_WEBHOOK_SECRET when set."""
    settings = get_settings()
    secret = (settings.STRIPE_WEBHOOK_SECRET or "").strip()
    if not (settings.STRIPE_SECRET_KEY or "").strip():
        raise HTTPException(status_code=501, detail="Configure STRIPE_SECRET_KEY")
    if secret and not signature:
        raise HTTPException(status_code=400, detail="Missing Stripe-Signature header")
    # Full crypto verification left for production Stripe SDK wiring.
    return {"verified": True, "stub": True, "bytes": len(payload or b"")}


def get_team_subscription(team_id: str) -> Optional[dict[str, Any]]:
    """Return current team_subscriptions row, or None."""
    if not team_id:
        return None
    try:
        rows = (
            services.get_supabase()
            .table("team_subscriptions")
            .select("*")
            .eq("team_id", team_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        return rows[0] if rows else None
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=503, detail=f"Suscripción no disponible: {exc}"
        ) from exc
