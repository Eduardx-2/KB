"""Unit tests for project MD update helpers (no network)."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from knowledge import (  # noqa: E402
    _normalize_title,
    build_ticket_changelog_section,
)


def test_normalize_title():
    assert _normalize_title("  Frontend  Filament ") == "frontend filament"
    assert _normalize_title("Power-BI") == "power-bi"


def test_build_ticket_changelog_section():
    md = build_ticket_changelog_section(
        {
            "id": "abc-123",
            "title": "Filtro por sucursal",
            "description": "Agrega filtro en Metabase.",
            "acceptance_criteria": "Se puede filtrar por store_id",
            "required_skill": "bi",
        }
    )
    assert "## Filtro por sucursal" in md
    assert "`abc-123`" in md
    assert "Metabase" in md
    assert "store_id" in md
    assert "Estado: done" in md
