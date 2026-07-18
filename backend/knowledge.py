"""Project knowledge base: chunking, embeddings, ingestion, retrieval, graph linking."""
from __future__ import annotations

import hashlib
import logging
import re
from typing import Any
try:
    from .services import get_openai, get_supabase
except ImportError:  # Permite `uvicorn main:app` desde backend/.
    from services import get_openai, get_supabase

logger = logging.getLogger("app.knowledge")

_HEADING_RE = re.compile(r"^##\s+(.+)$", re.MULTILINE)
_TABLE_RE = re.compile(r"`([a-z][a-z0-9_]{1,62})`", re.IGNORECASE)
_EMBEDDING_MODEL = "text-embedding-3-small"
_UPSERT_SOURCE_TYPES = frozenset({"project_overview", "developer_profile"})


def _content_hash(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def _store_chunks(
    sb: Any,
    *,
    table: str,
    source_id: str,
    scope_id: str,
    scope_field: str,
    md_body: str,
) -> None:
    """Delete prior chunks for source_id and insert fresh chunks + embeddings."""
    sb.table(table).delete().eq("source_id", source_id).execute()
    chunks = chunk_markdown(md_body)
    embeddings: list[list[float]] = []
    if chunks:
        try:
            embeddings = embed_texts(chunks)
        except Exception:  # noqa: BLE001
            logger.warning("Embedding failed during ingest; storing chunks without vectors")

    chunk_rows = []
    for idx, content in enumerate(chunks):
        row: dict = {
            "source_id": source_id,
            scope_field: scope_id,
            "chunk_index": idx,
            "content": content,
        }
        if idx < len(embeddings):
            row["embedding"] = embeddings[idx]
        chunk_rows.append(row)

    if chunk_rows:
        sb.table(table).insert(chunk_rows).execute()


def chunk_markdown(md: str, max_chars: int = 3000) -> list[str]:
    """Split markdown by ## headings; subdivide oversized sections at max_chars."""
    text = (md or "").strip()
    if not text:
        return []

    parts = _HEADING_RE.split(text)
    if len(parts) == 1:
        return _split_long(text, max_chars)

    chunks: list[str] = []
    preamble = parts[0].strip()
    if preamble:
        chunks.extend(_split_long(preamble, max_chars))

    for i in range(1, len(parts), 2):
        heading = parts[i].strip()
        body = parts[i + 1].strip() if i + 1 < len(parts) else ""
        section = f"## {heading}\n{body}".strip()
        chunks.extend(_split_long(section, max_chars))

    return [c for c in chunks if c.strip()]


def _split_long(text: str, max_chars: int) -> list[str]:
    if len(text) <= max_chars:
        return [text]
    out: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + max_chars, len(text))
        if end < len(text):
            break_at = text.rfind("\n\n", start, end)
            if break_at > start:
                end = break_at
        out.append(text[start:end].strip())
        start = end
    return [c for c in out if c]


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed texts with OpenAI text-embedding-3-small."""
    if not texts:
        return []
    client = get_openai()
    resp = client.embeddings.create(model=_EMBEDDING_MODEL, input=texts)
    return [item.embedding for item in resp.data]


def _extract_graph_labels(md: str) -> tuple[list[str], list[str]]:
    headings = [h.strip() for h in _HEADING_RE.findall(md or "")]
    tables = sorted(set(_TABLE_RE.findall(md or "")))
    return headings, tables


def _upsert_knowledge_nodes(
    sb: Any,
    *,
    team_id: str,
    project_id: str,
    source_id: str,
    md_body: str,
) -> None:
    headings, tables = _extract_graph_labels(md_body)
    rows: list[dict] = []

    for heading in headings[:20]:
        key = re.sub(r"[^a-z0-9]+", "-", heading.lower()).strip("-")[:80]
        rows.append(
            {
                "team_id": team_id,
                "project_id": project_id,
                "node_type": "concept",
                "label": heading,
                "canonical_key": f"heading-{key}" if key else None,
                "source_ref_type": "knowledge_source",
                "source_ref_id": source_id,
            }
        )

    for table in tables[:30]:
        rows.append(
            {
                "team_id": team_id,
                "project_id": project_id,
                "node_type": "table",
                "label": table,
                "canonical_key": f"table-{table.lower()}",
                "source_ref_type": "knowledge_source",
                "source_ref_id": source_id,
            }
        )

    if not rows:
        return

    try:
        sb.table("knowledge_nodes").upsert(rows, on_conflict="team_id,canonical_key").execute()
    except Exception:  # noqa: BLE001 — unique index / table may be missing
        try:
            sb.table("knowledge_nodes").insert(rows).execute()
        except Exception:
            logger.debug("Could not upsert knowledge_nodes", exc_info=True)


def ingest_markdown(
    team_id: str,
    project_id: str,
    title: str,
    md_body: str,
    source_type: str,
    created_by_id: str | None = None,
) -> str | None:
    """Upsert source + chunks with embeddings; create graph nodes. Best-effort."""
    try:
        sb = get_supabase()
        source_id: str | None = None
        if source_type in _UPSERT_SOURCE_TYPES:
            existing = (
                sb.table("project_knowledge_sources")
                .select("id")
                .eq("project_id", project_id)
                .eq("source_type", source_type)
                .order("updated_at", desc=True)
                .limit(1)
                .execute()
            ).data
            if existing:
                source_id = existing[0]["id"]
                sb.table("project_knowledge_sources").update(
                    {
                        "title": title,
                        "raw_content": md_body,
                        "summary": (md_body or "")[:500],
                        "metadata": {"team_id": team_id},
                    }
                ).eq("id", source_id).execute()

        if not source_id:
            source_payload = {
                "project_id": project_id,
                "title": title,
                "source_type": source_type,
                "raw_content": md_body,
                "summary": (md_body or "")[:500],
                "created_by_id": created_by_id,
                "metadata": {"team_id": team_id},
            }
            source_res = sb.table("project_knowledge_sources").insert(source_payload).execute()
            source_id = source_res.data[0]["id"]

        _store_chunks(
            sb,
            table="project_knowledge_chunks",
            source_id=source_id,
            scope_id=project_id,
            scope_field="project_id",
            md_body=md_body,
        )

        _upsert_knowledge_nodes(
            sb, team_id=team_id, project_id=project_id, source_id=source_id, md_body=md_body
        )
        return source_id
    except Exception:  # noqa: BLE001 — never crash API callers
        logger.exception("ingest_markdown failed (best-effort)")
        return None


def ingest_member_markdown(
    team_id: str,
    member_id: str,
    title: str,
    md_body: str,
    source_type: str = "developer_profile",
) -> str | None:
    """Upsert canonical member profile MD + chunks with embeddings. Best-effort."""
    try:
        sb = get_supabase()
        content_hash = _content_hash(md_body)
        source_id: str | None = None
        existing = (
            sb.table("member_knowledge_sources")
            .select("id, content_hash")
            .eq("member_id", member_id)
            .eq("source_type", source_type)
            .limit(1)
            .execute()
        ).data
        if existing:
            source_id = existing[0]["id"]
            if existing[0].get("content_hash") == content_hash:
                return source_id
            sb.table("member_knowledge_sources").update(
                {
                    "title": title,
                    "raw_content": md_body,
                    "content_hash": content_hash,
                }
            ).eq("id", source_id).execute()
        else:
            source_res = (
                sb.table("member_knowledge_sources")
                .insert(
                    {
                        "team_id": team_id,
                        "member_id": member_id,
                        "title": title,
                        "source_type": source_type,
                        "raw_content": md_body,
                        "content_hash": content_hash,
                    }
                )
                .execute()
            )
            source_id = source_res.data[0]["id"]

        _store_chunks(
            sb,
            table="member_knowledge_chunks",
            source_id=source_id,
            scope_id=member_id,
            scope_field="member_id",
            md_body=md_body,
        )
        return source_id
    except Exception:  # noqa: BLE001
        logger.exception("ingest_member_markdown failed (best-effort)")
        return None


def get_member_profile_md(member_id: str) -> tuple[str, str | None]:
    """Return (raw_content, updated_at) for developer_profile or empty."""
    try:
        sb = get_supabase()
        row = (
            sb.table("member_knowledge_sources")
            .select("raw_content, updated_at")
            .eq("member_id", member_id)
            .eq("source_type", "developer_profile")
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
        ).data
        if not row:
            return "", None
        return row[0].get("raw_content") or "", row[0].get("updated_at")
    except Exception:  # noqa: BLE001
        logger.debug("get_member_profile_md failed", exc_info=True)
        return "", None


def retrieve_member_context(
    team_id: str,
    member_id: str,
    query: str,
    k: int = 4,
) -> list[str]:
    """Retrieve top-k member profile chunks for assignment context."""
    _ = team_id  # reserved for future team-scoped filters
    sb = get_supabase()
    snippets: list[str] = []
    try:
        query_embedding = embed_texts([query])[0]
        rpc = sb.rpc(
            "match_member_knowledge_chunks",
            {
                "query_embedding": query_embedding,
                "p_member_id": member_id,
                "match_count": k,
            },
        ).execute()
        for row in rpc.data or []:
            content = (row.get("content") or "").strip()
            if content:
                snippets.append(content[:600])
    except Exception:  # noqa: BLE001
        logger.debug("Member vector search unavailable; falling back to raw profile", exc_info=True)

    if not snippets:
        md, _ = get_member_profile_md(member_id)
        if md and md.strip() and "Mis proyectos y stack" not in md[:80]:
            for chunk in chunk_markdown(md)[:k]:
                snippets.append(chunk[:600])
        elif md and md.strip():
            # Template or thin profile — still inject a short slice so assignment has something.
            snippets.append(md[:600])
    return snippets


def retrieve_context(
    team_id: str,
    project_id: str,
    query: str,
    k: int = 8,
) -> dict:
    """Retrieve RAG chunks, 1-hop graph neighbors, and prior meeting summaries."""
    sb = get_supabase()
    result: dict = {
        "chunks": [],
        "graph_neighbors": {"nodes": [], "edges": []},
        "prior_meetings": [],
    }

    chunks: list[dict] = []
    try:
        query_embedding = embed_texts([query])[0]
        rpc = sb.rpc(
            "match_knowledge_chunks",
            {
                "query_embedding": query_embedding,
                "p_project_id": project_id,
                "match_count": k,
            },
        ).execute()
        chunks = rpc.data or []
    except Exception:  # noqa: BLE001 — RPC or embeddings unavailable
        logger.debug("Vector search unavailable; falling back to ilike", exc_info=True)
        try:
            pattern = f"%{query[:120]}%"
            res = (
                sb.table("project_knowledge_chunks")
                .select("id, source_id, project_id, chunk_index, content")
                .eq("project_id", project_id)
                .ilike("content", pattern)
                .limit(k)
                .execute()
            )
            chunks = [
                {**row, "similarity": None}
                for row in (res.data or [])
            ]
        except Exception:
            logger.debug("Text search fallback failed", exc_info=True)

    result["chunks"] = chunks

    node_ids: set[str] = set()
    try:
        nodes_res = (
            sb.table("knowledge_nodes")
            .select("id, team_id, project_id, node_type, label, canonical_key")
            .eq("team_id", team_id)
            .eq("project_id", project_id)
            .limit(50)
            .execute()
        )
        nodes = nodes_res.data or []
        node_ids = {n["id"] for n in nodes}
        result["graph_neighbors"]["nodes"] = nodes

        if node_ids:
            from_ids = list(node_ids)
            edges_res = (
                sb.table("knowledge_edges")
                .select("id, team_id, from_node_id, to_node_id, relation, evidence_text, confidence_pct")
                .eq("team_id", team_id)
                .in_("from_node_id", from_ids)
                .limit(100)
                .execute()
            )
            result["graph_neighbors"]["edges"] = edges_res.data or []
    except Exception:  # noqa: BLE001
        logger.debug("Graph fetch failed", exc_info=True)

    try:
        meetings_res = (
            sb.table("meetings")
            .select("id, title, recorded_at, status, primary_project_id")
            .eq("primary_project_id", project_id)
            .order("recorded_at", desc=True)
            .limit(5)
            .execute()
        )
        meetings = meetings_res.data or []
        meeting_ids = [m["id"] for m in meetings]
        summaries_by_meeting: dict[str, str] = {}
        if meeting_ids:
            req_res = (
                sb.table("requirements")
                .select("meeting_id, summary, title")
                .in_("meeting_id", meeting_ids)
                .execute()
            )
            for req in req_res.data or []:
                mid = req.get("meeting_id")
                if mid and req.get("summary"):
                    summaries_by_meeting[mid] = req["summary"]

        result["prior_meetings"] = [
            {
                **m,
                "summary": summaries_by_meeting.get(m["id"]),
            }
            for m in meetings
        ]
    except Exception:  # noqa: BLE001
        logger.debug("Prior meetings fetch failed", exc_info=True)

    return result


def link_meeting_to_graph(
    meeting_id: str,
    project_id: str,
    team_id: str,
    summary: str,
    mentioned_labels: list[str],
) -> None:
    """Create a meeting node and edges to mentioned labels (best-effort)."""
    try:
        sb = get_supabase()
        meeting_node_res = (
            sb.table("knowledge_nodes")
            .insert(
                {
                    "team_id": team_id,
                    "project_id": project_id,
                    "node_type": "meeting",
                    "label": f"Meeting {meeting_id[:8]}",
                    "canonical_key": f"meeting-{meeting_id}",
                    "source_ref_type": "meeting",
                    "source_ref_id": meeting_id,
                    "metadata": {"summary": (summary or "")[:2000]},
                }
            )
            .execute()
        )
        meeting_node_id = meeting_node_res.data[0]["id"]

        if not mentioned_labels:
            return

        labels = [lbl.strip() for lbl in mentioned_labels if lbl and lbl.strip()]
        if not labels:
            return

        targets_res = (
            sb.table("knowledge_nodes")
            .select("id, label")
            .eq("team_id", team_id)
            .eq("project_id", project_id)
            .in_("label", labels)
            .execute()
        )
        target_by_label = {row["label"]: row["id"] for row in (targets_res.data or [])}

        edge_rows = []
        for label in labels:
            to_id = target_by_label.get(label)
            if not to_id:
                continue
            edge_rows.append(
                {
                    "team_id": team_id,
                    "from_node_id": meeting_node_id,
                    "to_node_id": to_id,
                    "relation": "derived_from_meeting",
                    "evidence_text": (summary or "")[:500],
                    "confidence_pct": 75,
                    "created_by": "agent",
                }
            )

        if edge_rows:
            sb.table("knowledge_edges").insert(edge_rows).execute()
    except Exception:  # noqa: BLE001
        logger.exception("link_meeting_to_graph failed (best-effort)")
