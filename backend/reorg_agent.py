"""Reorg agent: propose ticket reshuffling when capacity/absence risks arise."""
from __future__ import annotations

import logging
import time
from typing import Any

try:
    from .config import get_settings
    from .schemas import ReorgProposalItem, ReorgProposalOutput
    from .services import get_openai, log_agent
except ImportError:  # Permite `uvicorn main:app` desde backend/.
    from config import get_settings
    from schemas import ReorgProposalItem, ReorgProposalOutput
    from services import get_openai, log_agent

logger = logging.getLogger("app.reorg_agent")

REORG_SYSTEM_PROMPT = (
    "Eres un PM técnico senior. Ante ausencias, sobrecarga o riesgo de deadline, "
    "propones una reorganización concreta de tickets. Para cada ticket activo del miembro "
    "afectado indica action (keep, reschedule, reassign, postpone, drop), fechas nuevas si aplica, "
    "new_assignee_name si reassign, y rationale breve. "
    "Prioriza continuidad del proyecto y distribución justa de carga. "
    "overall_risk_pct refleja el riesgo residual tras aplicar la propuesta."
)


def run_reorg_agent(
    member_id: str,
    team_id: str,
    trigger: str,
    reason_md: str,
    tickets: list[dict],
    members: list[dict],
    duties: list[dict] | None = None,
    absences: list[dict] | None = None,
) -> ReorgProposalOutput:
    """Generate a structured reorg proposal via OpenAI."""
    client = get_openai()
    user_payload = {
        "member_id": member_id,
        "team_id": team_id,
        "trigger": trigger,
        "reason_md": reason_md,
        "tickets": [
            {
                "title": t.get("title"),
                "status": t.get("status"),
                "priority": t.get("priority"),
                "estimate_hours": t.get("estimate_hours"),
                "deadline": t.get("deadline"),
                "assignee_id": t.get("assignee_id"),
            }
            for t in tickets
        ],
        "members": [
            {
                "name": m.get("name"),
                "role": m.get("role"),
                "effective_load": m.get("effective_load", m.get("current_load", 0)),
                "is_absent": m.get("is_absent", False),
                "duty_load_pct": m.get("duty_load_pct", 0),
            }
            for m in members
        ],
        "duties": duties or [],
        "absences": absences or [],
    }

    start = time.perf_counter()
    ok = False
    try:
        completion = client.beta.chat.completions.parse(
            model=get_settings().OPENAI_MODEL,
            temperature=0,
            messages=[
                {"role": "system", "content": REORG_SYSTEM_PROMPT},
                {"role": "user", "content": str(user_payload)},
            ],
            response_format=ReorgProposalOutput,
        )
        result = completion.choices[0].message.parsed
        if result is None:
            raise RuntimeError("El modelo no devolvió un objeto parseado")
        ok = True
        return result
    finally:
        log_agent("reorg", int((time.perf_counter() - start) * 1000), ok, team_id=team_id)


def persist_proposal(
    sb: Any,
    team_id: str,
    member_id: str,
    trigger: str,
    output: ReorgProposalOutput,
) -> str | None:
    """Persist proposal header + items. Returns proposal_id or None on failure."""
    try:
        prop_res = (
            sb.table("reorg_proposals")
            .insert(
                {
                    "team_id": team_id,
                    "member_id": member_id,
                    "triggered_by": trigger,
                    "reason_md": output.summary_md,
                    "status": "pending_boss",
                    "proposed_by_agent": True,
                }
            )
            .execute()
        )
        proposal_id = prop_res.data[0]["id"]

        ticket_rows = (
            sb.table("tickets")
            .select("id, title")
            .eq("assignee_id", member_id)
            .in_("status", ["backlog", "todo", "in_progress"])
            .execute()
        ).data or []
        ticket_by_title = {t["title"].strip().lower(): t["id"] for t in ticket_rows}

        member_rows = (
            sb.table("members")
            .select("id, name")
            .eq("team_id", team_id)
            .execute()
        ).data or []
        member_by_name = {m["name"].strip().lower(): m["id"] for m in member_rows}

        item_rows = []
        for item in output.items:
            ticket_id = ticket_by_title.get(item.ticket_title.strip().lower())
            if not ticket_id:
                continue
            new_assignee_id = None
            if item.new_assignee_name:
                new_assignee_id = member_by_name.get(item.new_assignee_name.strip().lower())
            item_rows.append(
                {
                    "proposal_id": proposal_id,
                    "ticket_id": ticket_id,
                    "action": item.action,
                    "new_assignee_id": new_assignee_id,
                    "new_scheduled_date": item.new_scheduled_date,
                    "new_deadline": item.new_deadline,
                    "rationale": item.rationale,
                }
            )

        if item_rows:
            sb.table("reorg_proposal_items").insert(item_rows).execute()

        return proposal_id
    except Exception:  # noqa: BLE001
        logger.exception("persist_proposal failed")
        return None


def apply_proposal(sb: Any, proposal_id: str, decided_by_id: str | None = None) -> bool:
    """Apply approved proposal items to tickets."""
    try:
        prop_res = (
            sb.table("reorg_proposals")
            .select("id, status")
            .eq("id", proposal_id)
            .limit(1)
            .execute()
        )
        if not prop_res.data:
            return False

        items_res = (
            sb.table("reorg_proposal_items")
            .select("*")
            .eq("proposal_id", proposal_id)
            .execute()
        )
        items = items_res.data or []

        for item in items:
            action = item.get("action")
            ticket_id = item.get("ticket_id")
            if not ticket_id or action == "keep":
                continue

            patch: dict = {}
            if action == "reassign" and item.get("new_assignee_id"):
                patch["assignee_id"] = item["new_assignee_id"]
            if action in ("reschedule", "postpone", "reassign") and item.get("new_scheduled_date"):
                patch["scheduled_date"] = item["new_scheduled_date"]
            if item.get("new_deadline"):
                patch["deadline"] = item["new_deadline"]
            if action == "postpone":
                patch["status"] = "backlog"
            if action == "drop":
                patch["status"] = "backlog"
                patch["assignee_id"] = None

            if patch:
                sb.table("tickets").update(patch).eq("id", ticket_id).execute()

        sb.table("reorg_proposals").update(
            {
                "status": "applied",
                "decided_by_id": decided_by_id,
            }
        ).eq("id", proposal_id).execute()
        return True
    except Exception:  # noqa: BLE001
        logger.exception("apply_proposal failed")
        return False
