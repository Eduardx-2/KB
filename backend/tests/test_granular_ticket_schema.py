"""Granular ticket schema used by Meeting Agent."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from schemas import GranularTicket, MeetingAgentOutput  # noqa: E402


def test_granular_ticket_fields():
    t = GranularTicket(
        title="Definir paleta de marca landing",
        description="Extraer colores del brand book y documentar tokens CSS",
        priority="high",
        estimate_hours=4,
        required_skill="frontend",
        work_phase="design",
        acceptance_criteria="Tokens en Figma y variables CSS documentadas",
        depends_on_titles=["Kickoff discovery"],
        knowledge_evidence="El PM mencionó colores corporativos en la reunión",
        is_greenfield=False,
        related_db_tables=["brand_tokens"],
    )
    assert t.work_phase == "design"
    assert "brand_tokens" in t.related_db_tables


def test_meeting_agent_output_uses_granular():
    out = MeetingAgentOutput(
        summary="Reunión ERP landing",
        tickets=[
            GranularTicket(
                title=f"Ticket granular {i}",
                description="Redactar headline y subhead con AS-IS TO-BE",
                priority="medium",
                estimate_hours=2,
                required_skill="frontend",
                work_phase="ux",
                acceptance_criteria="- Copy listo\n- Revisado por PM\n- Publicado",
                parent_title=None if i < 2 else "Ticket granular 0",
            )
            for i in range(4)
        ],
    )
    assert len(out.tickets) == 4
    assert out.tickets[0].work_phase == "ux"
    assert out.tickets[2].parent_title == "Ticket granular 0"
