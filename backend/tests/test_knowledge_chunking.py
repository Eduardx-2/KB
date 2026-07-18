"""Unit tests for markdown chunking (Knowledge Ops)."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from knowledge import chunk_markdown  # noqa: E402


def test_chunk_empty():
    assert chunk_markdown("") == []
    assert chunk_markdown("   ") == []


def test_chunk_by_headings():
    md = "## Intro\nHello\n\n## API\nEndpoints here"
    chunks = chunk_markdown(md)
    assert len(chunks) >= 2
    assert any("Intro" in c for c in chunks)
    assert any("API" in c for c in chunks)


def test_chunk_splits_long_sections():
    body = "word " * 900
    md = f"## Section\n{body}"
    chunks = chunk_markdown(md, max_chars=500)
    assert len(chunks) >= 2
    assert all(len(c) <= 520 for c in chunks)
