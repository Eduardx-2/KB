"""Backfill member_knowledge_chunks + embeddings from seeded developer_profile sources.

Usage (from backend/ with venv):
  set PYTHONPATH=.
  python scripts/backfill_member_embeddings.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import knowledge  # noqa: E402
from services import get_supabase  # noqa: E402


def main() -> None:
    sb = get_supabase()
    sources = (
        sb.table("member_knowledge_sources")
        .select("id, team_id, member_id, title, raw_content, source_type")
        .eq("source_type", "developer_profile")
        .execute()
    ).data or []
    if not sources:
        print("No member_knowledge_sources found. Apply seed/012_member_knowledge.sql first.")
        return

    ok = 0
    for src in sources:
        md = src.get("raw_content") or ""
        if not md.strip():
            print(f"skip empty {src['member_id']}")
            continue
        source_id = knowledge.ingest_member_markdown(
            src["team_id"],
            src["member_id"],
            title=src.get("title") or "Perfil",
            md_body=md,
        )
        print(f"{'OK' if source_id else 'FAIL'} member={src['member_id']} source={source_id}")
        if source_id:
            ok += 1
    print(f"Done: {ok}/{len(sources)} profiles ingested")


if __name__ == "__main__":
    main()
