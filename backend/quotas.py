"""Monthly usage quotas per team."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException

try:
    from . import audit, services
except ImportError:
    import audit
    import services

logger = logging.getLogger("app.quotas")

# metric name → teams column with monthly cap
_METRIC_CAPS = {
    "meetings": "max_meetings_per_month",
    "tokens": "max_tokens_per_month",
    "tokens_in": "max_tokens_per_month",
    "tokens_out": "max_tokens_per_month",
}


def _month_start_iso() -> str:
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()


def _usage_this_month(team_id: str, metrics: list[str]) -> int:
    sb = services.get_supabase()
    try:
        rows = (
            sb.table("usage_events")
            .select("quantity, metric")
            .eq("team_id", team_id)
            .in_("metric", metrics)
            .gte("created_at", _month_start_iso())
            .execute()
            .data
            or []
        )
        return sum(int(r.get("quantity") or 0) for r in rows)
    except Exception:  # noqa: BLE001
        logger.exception("No se pudo leer usage_events (se omite quota check)")
        return 0


def check_quota(team_id: str, metric: str) -> None:
    """Raise 402 if the team exceeded its monthly cap for `metric`."""
    if not team_id:
        return

    cap_col = _METRIC_CAPS.get(metric)
    if not cap_col:
        return

    sb = services.get_supabase()
    try:
        team_rows = (
            sb.table("teams")
            .select(f"id, {cap_col}")
            .eq("id", team_id)
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception:  # noqa: BLE001 — columnas aún no migradas
        logger.warning("teams.%s no disponible; se omite quota", cap_col)
        return

    if not team_rows:
        return

    cap = team_rows[0].get(cap_col)
    if cap is None:
        return

    if metric in ("tokens", "tokens_in", "tokens_out"):
        used = _usage_this_month(team_id, ["tokens", "tokens_in", "tokens_out"])
        label = "tokens"
    else:
        used = _usage_this_month(team_id, [metric])
        label = metric

    if used >= int(cap):
        audit.log_audit(
            team_id=team_id,
            user_id=None,
            action="quota.exceeded",
            resource_type="quota",
            resource_id=label,
            meta={"metric": metric, "used": used, "cap": int(cap)},
        )
        raise HTTPException(
            status_code=402,
            detail=f"Cuota mensual de {label} agotada ({used}/{cap})",
        )


def record_usage(
    team_id: str,
    metric: str,
    quantity: int,
    meta: Optional[dict[str, Any]] = None,
) -> None:
    """Best-effort usage event insert."""
    if not team_id or quantity <= 0:
        return
    try:
        services.get_supabase().table("usage_events").insert(
            {
                "team_id": team_id,
                "metric": metric,
                "quantity": quantity,
                "meta": meta,
            }
        ).execute()
    except Exception:  # noqa: BLE001
        logger.exception("No se pudo escribir usage_events (ignorado)")


def get_usage_summary(team_id: str) -> dict[str, Any]:
    """Current-month usage totals + team caps."""
    sb = services.get_supabase()
    caps: dict[str, Any] = {}
    try:
        rows = (
            sb.table("teams")
            .select("id, name, plan_tier, max_meetings_per_month, max_tokens_per_month, max_members")
            .eq("id", team_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if rows:
            caps = rows[0]
    except Exception:  # noqa: BLE001
        try:
            rows = sb.table("teams").select("id, name").eq("id", team_id).limit(1).execute().data or []
            caps = rows[0] if rows else {"id": team_id}
        except Exception:  # noqa: BLE001
            caps = {"id": team_id}

    totals: dict[str, int] = {}
    try:
        events = (
            sb.table("usage_events")
            .select("metric, quantity")
            .eq("team_id", team_id)
            .gte("created_at", _month_start_iso())
            .execute()
            .data
            or []
        )
        for ev in events:
            m = ev.get("metric") or "unknown"
            totals[m] = totals.get(m, 0) + int(ev.get("quantity") or 0)
    except Exception:  # noqa: BLE001
        logger.exception("No se pudo agregar usage_events")

    return {
        "team_id": team_id,
        "period_start": _month_start_iso(),
        "team": caps,
        "usage": totals,
    }
