"""Assignment guardrails: managers are last resort; Exactus stays with Exactus owners."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from schemas import AssignmentAgentOutput, AssignmentRecommendation  # noqa: E402
from services import apply_assignment_guardrails, resolve_assignee  # noqa: E402


def _team():
    return [
        {
            "id": "1",
            "name": "Juan",
            "role": "Jefe de IT / DevOps",
            "is_manager": True,
            "skills": ["devops", "docker", "erp_exactus", "backend"],
            "effective_load": 0,
        },
        {
            "id": "2",
            "name": "Iván",
            "role": "Desarrollador ERP (C# / Exactus)",
            "is_manager": False,
            "skills": ["erp_exactus", "csharp", "sql", "backend"],
            "effective_load": 10,
        },
        {
            "id": "3",
            "name": "Christopher",
            "role": "Desarrollador Web / BI / Filament",
            "is_manager": False,
            "skills": ["frontend", "filament", "metabase", "maxxi_web"],
            "effective_load": 5,
        },
    ]


def test_exactus_goes_to_ivan_not_christopher_or_juan():
    ticket = {"title": "Guardar pedido en Exactus", "required_skill": "erp_exactus"}
    pick, risk, reason = resolve_assignee(ticket, _team())
    assert pick is not None
    assert pick["name"] == "Iván"
    assert risk < 85
    assert "último recurso" not in reason.lower()


def test_manager_only_when_nobody_else():
    team = [
        {
            "id": "1",
            "name": "Juan",
            "is_manager": True,
            "skills": ["devops"],
            "effective_load": 0,
        }
    ]
    pick, risk, reason = resolve_assignee({"title": "Deploy", "required_skill": "devops"}, team)
    assert pick["name"] == "Juan"
    assert risk >= 85
    assert "último recurso" in reason.lower()


def test_guardrail_overrides_llm_manager_pick():
    tickets = [{"title": "Revertir consumo Exactus", "required_skill": "erp_exactus"}]
    llm = AssignmentAgentOutput(
        recommendations=[
            AssignmentRecommendation(
                ticket_title="Revertir consumo Exactus",
                assignee_name="Juan",
                risk_pct=20,
                reasoning="Tiene Exactus",
            )
        ]
    )
    fixed = apply_assignment_guardrails(llm, tickets, _team())
    assert len(fixed.recommendations) == 1
    assert fixed.recommendations[0].assignee_name == "Iván"


def test_guardrail_overrides_christopher_on_exactus():
    tickets = [{"title": "Existencias Exactus", "required_skill": "erp_exactus"}]
    llm = AssignmentAgentOutput(
        recommendations=[
            AssignmentRecommendation(
                ticket_title="Existencias Exactus",
                assignee_name="Christopher",
                risk_pct=30,
                reasoning="Frontend",
            )
        ]
    )
    fixed = apply_assignment_guardrails(llm, tickets, _team())
    assert fixed.recommendations[0].assignee_name == "Iván"


def test_normalize_filament_cayena_to_exactus_owner():
    tickets = [
        {
            "title": "Separar bodega y artículos en pedido de Cayena",
            "description": "UI digitación Exactus",
            "required_skill": "filament",
        }
    ]
    llm = AssignmentAgentOutput(
        recommendations=[
            AssignmentRecommendation(
                ticket_title="Separar bodega y artículos en pedido de Cayena",
                assignee_name="Christopher",
                risk_pct=20,
                reasoning="Filament",
            )
        ]
    )
    fixed = apply_assignment_guardrails(llm, tickets, _team())
    assert fixed.recommendations[0].assignee_name == "Iván"
