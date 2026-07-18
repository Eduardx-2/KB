"""Schema validation for reorg agent structured outputs."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from schemas import ReorgProposalItem, ReorgProposalOutput  # noqa: E402


def test_reorg_output_parses():
    out = ReorgProposalOutput(
        summary_md="Beto ausente el lunes; reasignar ticket crítico.",
        overall_risk_pct=35,
        items=[
            ReorgProposalItem(
                ticket_title="API costos",
                action="reassign",
                new_assignee_name="Carla",
                rationale="Carla conoce el módulo",
            ),
            ReorgProposalItem(
                ticket_title="Landing copy",
                action="postpone",
                new_scheduled_date="2026-07-20",
                rationale="No bloqueante",
            ),
        ],
    )
    assert out.overall_risk_pct == 35
    assert len(out.items) == 2
    assert out.items[0].action == "reassign"


def test_reorg_decide_request():
    from schemas import ReorgDecideRequest  # noqa: E402

    body = ReorgDecideRequest(decision="approved", note="OK")
    assert body.decision == "approved"
