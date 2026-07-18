"""Contract tests for KnowledgeSummaryOut (docs page)."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from schemas import KnowledgeSummaryOut  # noqa: E402


def test_knowledge_summary_defaults():
    summary = KnowledgeSummaryOut(project_id="proj-1")
    assert summary.project_id == "proj-1"
    assert summary.overview_md == ""
    assert summary.modules == []
    assert summary.stakeholders == []
    assert summary.sources == []
    assert summary.chunks_count == 0
    assert summary.nodes == []
    assert summary.edges == []


def test_knowledge_summary_with_overview():
    summary = KnowledgeSummaryOut(
        project_id="proj-1",
        overview_md="# Visión\nContenido",
        modules=[{"id": "m1", "project_id": "proj-1", "team_id": "t1", "name": "API", "md_body": ""}],
    )
    assert summary.overview_md.startswith("# Visión")
    assert len(summary.modules) == 1
    assert summary.modules[0].name == "API"
