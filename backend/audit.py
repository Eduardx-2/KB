"""Best-effort audit event logging."""
from __future__ import annotations

import logging
from typing import Any, Optional

try:
    from . import services
except ImportError:
    import services

logger = logging.getLogger("app.audit")


def log_audit(
    team_id: Optional[str],
    user_id: Optional[str],
    action: str,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    meta: Optional[dict[str, Any]] = None,
    ip: Optional[str] = None,
) -> None:
    """Insert into audit_events; never raises to callers."""
    if not action:
        return
    try:
        row: dict[str, Any] = {
            "action": action,
            "meta": meta or {},
        }
        if team_id:
            row["team_id"] = team_id
        if user_id:
            row["user_id"] = user_id
        if resource_type:
            row["resource_type"] = resource_type
        if resource_id:
            row["resource_id"] = str(resource_id)
        if ip:
            row["ip"] = ip
        services.get_supabase().table("audit_events").insert(row).execute()
    except Exception:  # noqa: BLE001
        logger.exception("No se pudo escribir audit_events (ignorado)")
