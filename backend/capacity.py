"""Member capacity: duties, absences, and effective load enrichment."""
from __future__ import annotations

import logging
from datetime import date

try:
    from .services import get_supabase
except ImportError:  # Permite `uvicorn main:app` desde backend/.
    from services import get_supabase

logger = logging.getLogger("app.capacity")


def _parse_date(value: date | str | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def get_duty_load_pct(member_id: str) -> int:
    """Sum of load_pct for active duties assigned to the member."""
    try:
        res = (
            get_supabase()
            .table("member_duties")
            .select("load_pct")
            .eq("member_id", member_id)
            .eq("is_active", True)
            .execute()
        )
        return sum(int(row.get("load_pct") or 0) for row in (res.data or []))
    except Exception:  # noqa: BLE001 — table may not exist yet
        logger.debug("member_duties unavailable for %s", member_id, exc_info=True)
        return 0


def get_absence_overlap(member_id: str, start: date | str, end: date | str) -> bool:
    """True if the member has an approved/pending absence overlapping [start, end]."""
    start_d = _parse_date(start)
    end_d = _parse_date(end)
    if not start_d or not end_d:
        return False
    try:
        res = (
            get_supabase()
            .table("member_absences")
            .select("id, start_date, end_date, status")
            .eq("member_id", member_id)
            .in_("status", ["approved", "pending"])
            .lte("start_date", end_d.isoformat())
            .gte("end_date", start_d.isoformat())
            .limit(1)
            .execute()
        )
        return bool(res.data)
    except Exception:  # noqa: BLE001
        logger.debug("member_absences unavailable for %s", member_id, exc_info=True)
        return False


def enrich_member_load(members: list[dict], *, as_of: date | None = None) -> list[dict]:
    """Add duty_load_pct, is_absent, and effective_load (ticket load + duties)."""
    today = as_of or date.today()
    enriched: list[dict] = []
    for member in members:
        member_id = member.get("id")
        if not member_id:
            enriched.append(member)
            continue

        duty_load = get_duty_load_pct(member_id)
        is_absent = get_absence_overlap(member_id, today, today)
        base_load = int(member.get("effective_load", member.get("current_load", 0)) or 0)
        effective_load = min(100, base_load + duty_load)
        if is_absent:
            effective_load = 100

        enriched.append(
            {
                **member,
                "duty_load_pct": duty_load,
                "is_absent": is_absent,
                "effective_load": effective_load,
            }
        )
    return enriched
