"""Unit tests for member knowledge helpers."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from knowledge import _content_hash, chunk_markdown  # noqa: E402


def test_content_hash_stable():
    md = "## Proyectos\nExactus"
    assert _content_hash(md) == _content_hash(md)
    assert _content_hash(md) != _content_hash(md + " ")


def test_member_profile_chunks_by_headings():
    md = """# Iván — ERP

## Proyectos
- Exactus ↔ Apps
- Cayena

## Stack
- C#, SQL Server

## Restricciones
- No Filament
"""
    chunks = chunk_markdown(md)
    assert len(chunks) >= 3
    joined = "\n".join(chunks)
    assert "Exactus" in joined
    assert "Restricciones" in joined
