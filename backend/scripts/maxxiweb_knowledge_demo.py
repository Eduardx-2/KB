#!/usr/bin/env python3
"""Demo / pruebas del knowledge graph + RAG para MAXXI-WEB (Maxxi Group KB).

Muestra el flujo completo sin tocar el frontend:
  1. Estado actual (documentos, chunks, nodos)
  2. Ingesta de .md -> chunks + embeddings + nodos del grafo
  3. Preview local de chunking (sin DB)
  4. Consultas RAG (como las usa el agente de asignacion)

Requisitos:
  - backend/.env con SUPABASE_* y OPENAI_API_KEY
  - venv activado en backend/

Uso (desde backend/):
  set PYTHONPATH=.
  python scripts/maxxiweb_knowledge_demo.py status
  python scripts/maxxiweb_knowledge_demo.py ingest --file "%USERPROFILE%\\Downloads\\DOCUMENTACION-COMPLETA.md"
  python scripts/maxxiweb_knowledge_demo.py chunk-preview --file ruta\\al\\archivo.md
  python scripts/maxxiweb_knowledge_demo.py rag --query "Filament portal digitadores"
  python scripts/maxxiweb_knowledge_demo.py demo
  python scripts/maxxiweb_knowledge_demo.py demo --api   # vía HTTP (backend en :8003)
"""
from __future__ import annotations

import argparse
import json
import sys
import textwrap
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Consola Windows: evitar crash con flechas / acentos en cp1252
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import knowledge  # noqa: E402
from services import get_supabase  # noqa: E402

# --- Maxxi Group demo IDs (seed 011) ---
TEAM_ID = "00000000-0000-0000-0000-000000000001"
MAXXI_WEB_PROJECT_ID = "61000000-0000-0000-0000-000000000004"
MAXXI_WEB_CODE = "MAXXI-WEB"
DEFAULT_API = "http://127.0.0.1:8003"

DEFAULT_MD_FILES = [
    Path.home() / "Downloads" / "DOCUMENTACION-COMPLETA.md",
    Path.home() / "Downloads" / "PROJECT_CONTEXT.md",
]


def _hr(title: str = "") -> None:
    print("\n" + "=" * 72)
    if title:
        print(f"  {title}")
        print("=" * 72)


def _truncate(s: str, n: int = 280) -> str:
    s = (s or "").replace("\r\n", "\n").strip()
    if len(s) <= n:
        return s
    return s[: n - 3] + "..."


def cmd_status() -> None:
    """Lista documentos, chunks y nodos del grafo en Supabase."""
    sb = get_supabase()
    _hr(f"Estado knowledge — {MAXXI_WEB_CODE}")

    proj = (
        sb.table("projects")
        .select("id, code, name")
        .eq("id", MAXXI_WEB_PROJECT_ID)
        .limit(1)
        .execute()
    ).data or []
    if proj:
        p = proj[0]
        print(f"Proyecto: {p.get('code')} — {p.get('name')}")
    else:
        print(f"Proyecto ID: {MAXXI_WEB_PROJECT_ID}")

    sources = (
        sb.table("project_knowledge_sources")
        .select("id, title, source_type, summary, updated_at")
        .eq("project_id", MAXXI_WEB_PROJECT_ID)
        .order("created_at", desc=True)
        .execute()
    ).data or []

    chunks_res = (
        sb.table("project_knowledge_chunks")
        .select("id", count="exact")
        .eq("project_id", MAXXI_WEB_PROJECT_ID)
        .execute()
    )
    chunk_count = chunks_res.count or 0

    nodes = (
        sb.table("knowledge_nodes")
        .select("id, label, node_type, source_ref_id")
        .eq("project_id", MAXXI_WEB_PROJECT_ID)
        .order("label")
        .limit(200)
        .execute()
    ).data or []

    edges = (
        sb.table("knowledge_edges")
        .select("id", count="exact")
        .eq("team_id", TEAM_ID)
        .execute()
    )
    edge_count = edges.count or 0

    print(f"\nDocumentos: {len(sources)}  |  Chunks RAG: {chunk_count}  |  Nodos: {len(nodes)}  |  Aristas: {edge_count}")
    print("\n--- Fuentes ---")
    for s in sources:
        sid = s["id"]
        title = s.get("title") or "(sin título)"
        stype = s.get("source_type") or "?"
        n_chunks = (
            sb.table("project_knowledge_chunks")
            .select("id", count="exact")
            .eq("source_id", sid)
            .execute()
        ).count or 0
        print(f"  • [{stype}] {title}")
        print(f"    id={sid[:8]}…  chunks={n_chunks}  updated={s.get('updated_at', '')[:19]}")

    if nodes:
        print("\n--- Nodos del grafo (muestra) ---")
        for n in nodes[:25]:
            print(f"  • [{n.get('node_type')}] {n.get('label')}")
        if len(nodes) > 25:
            print(f"  … y {len(nodes) - 25} más")


def cmd_ingest(paths: list[Path], source_type: str = "document") -> None:
    """Ingesta uno o más .md al proyecto MAXXI-WEB."""
    if not paths:
        print("No hay archivos. Usá --file o dejá los defaults en Downloads.")
        return

    _hr("Ingesta MD → Supabase")
    for path in paths:
        if not path.exists():
            print(f"SKIP (no existe): {path}")
            continue
        text = path.read_text(encoding="utf-8")
        title = path.stem.replace("-", " ").replace("_", " ")
        print(f"\nArchivo: {path.name}")
        print(f"  Título: {title}")
        print(f"  Tamaño: {len(text):,} chars, ~{text.count(chr(10)) + 1} líneas")

        local_chunks = knowledge.chunk_markdown(text)
        print(f"  Chunks locales (preview): {len(local_chunks)}")

        source_id = knowledge.ingest_markdown(
            TEAM_ID,
            MAXXI_WEB_PROJECT_ID,
            title=title,
            md_body=text,
            source_type=source_type,
            created_by_id=None,
            mode="replace",
        )
        if source_id:
            print(f"  OK -> source_id={source_id}")
        else:
            print("  FAIL — revisá logs del backend / OPENAI / Supabase")


def cmd_chunk_preview(path: Path, max_show: int = 3) -> None:
    """Solo muestra cómo se parte un MD en chunks (sin escribir en DB)."""
    if not path.exists():
        print(f"No existe: {path}")
        return
    text = path.read_text(encoding="utf-8")
    chunks = knowledge.chunk_markdown(text)
    headings, tables = knowledge._extract_graph_labels(text)  # noqa: SLF001 — script de demo

    _hr(f"Preview chunking — {path.name}")
    print(f"Líneas: {text.count(chr(10)) + 1}  |  Chunks: {len(chunks)}")
    print(f"Headings ## detectados: {len(headings)} (-> nodos concept)")
    print(f"Tablas `sql` detectadas: {len(tables)} (-> nodos table)")
    if headings:
        print("\nPrimeros headings → nodos:")
        for h in headings[:12]:
            print(f"  • {h}")
        if len(headings) > 12:
            print(f"  … +{len(headings) - 12}")

    print(f"\n--- Primeros {max_show} chunks ---")
    for i, c in enumerate(chunks[:max_show]):
        print(f"\n[chunk {i}] ({len(c)} chars)")
        print(textwrap.indent(_truncate(c, 400), "  "))


def cmd_rag(query: str, k: int = 5) -> None:
    """Ejecuta retrieve_context como el agente de meeting/asignación."""
    _hr(f"RAG — query: «{query}»")
    ctx = knowledge.retrieve_context(TEAM_ID, MAXXI_WEB_PROJECT_ID, query, k=k)

    chunks = ctx.get("chunks") or []
    nodes = (ctx.get("graph_neighbors") or {}).get("nodes") or []
    edges = (ctx.get("graph_neighbors") or {}).get("edges") or []
    meetings = ctx.get("prior_meetings") or []

    print(f"Chunks recuperados: {len(chunks)}  |  Nodos grafo: {len(nodes)}  |  Aristas: {len(edges)}")
    print("\n--- Top chunks (contexto que vería el LLM) ---")
    for i, ch in enumerate(chunks):
        sim = ch.get("similarity")
        sim_s = f" sim={sim:.3f}" if isinstance(sim, (int, float)) else ""
        print(f"\n[{i + 1}]{sim_s} chunk_index={ch.get('chunk_index')}")
        print(textwrap.indent(_truncate(ch.get("content") or "", 500), "  "))

    if nodes:
        print("\n--- Nodos del proyecto (contexto grafo) ---")
        for n in nodes[:15]:
            print(f"  • {n.get('label')} ({n.get('node_type')})")

    if meetings:
        print(f"\n--- Reuniones previas relacionadas: {len(meetings)} ---")


def cmd_ticket_append_demo() -> None:
    """Simula qué MD se agrega cuando un ticket pasa a done."""
    fake_ticket = {
        "id": "demo-ticket-0001",
        "title": "Widget promocional en homepage",
        "description": "Agregar banner dinámico desde Filament en la homepage Maxxi Splash.",
        "acceptance_criteria": "El banner se edita desde /admin y se ve en la home sin deploy.",
        "required_skill": "frontend",
    }
    section = knowledge.build_ticket_changelog_section(fake_ticket)
    _hr("Demo: sección MD al marcar ticket como done")
    print(section)
    print("\n(Esto se appendea al doc «Changelog de tickets» vía append_ticket_to_project_md)")


def _api_get(path: str, api_base: str) -> dict:
    req = urllib.request.Request(
        f"{api_base.rstrip('/')}{path}",
        headers={"X-Team-Id": TEAM_ID},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


def _api_post_docs(api_base: str, title: str, md_body: str) -> dict:
    body = json.dumps(
        {"title": title, "md_body": md_body, "source_type": "document", "mode": "replace"}
    ).encode()
    req = urllib.request.Request(
        f"{api_base.rstrip('/')}/api/projects/{MAXXI_WEB_PROJECT_ID}/docs",
        data=body,
        headers={"Content-Type": "application/json", "X-Team-Id": TEAM_ID},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read().decode())


def cmd_demo(use_api: bool, api_base: str) -> None:
    """Recorrido completo para ver el pipeline de punta a punta."""
    _hr(f"DEMO MAXXI-WEB knowledge ({'HTTP API' if use_api else 'Python directo'})")

    if use_api:
        try:
            health = _api_get("/api/health", api_base)
            print("Backend:", health)
        except urllib.error.URLError as e:
            print(f"Backend no disponible en {api_base}: {e}")
            print("Levantá: uvicorn main:app --reload --port 8003")
            return

        k = _api_get(f"/api/projects/{MAXXI_WEB_PROJECT_ID}/knowledge", api_base)
        print(f"\nEstado API: {len(k.get('sources') or [])} docs, {k.get('chunks_count')} chunks, {len(k.get('nodes') or [])} nodos")
        for s in (k.get("sources") or [])[:8]:
            print(f"  • [{s.get('source_type')}] {s.get('title')}")

        for path in DEFAULT_MD_FILES:
            if not path.exists():
                continue
            text = path.read_text(encoding="utf-8")
            title = path.stem.replace("-", " ").replace("_", " ")
            print(f"\nIngesta vía API: {path.name} …")
            res = _api_post_docs(api_base, title, text)
            print("  ->", res)

        k2 = _api_get(f"/api/projects/{MAXXI_WEB_PROJECT_ID}/knowledge", api_base)
        print(f"\nDespués de ingest: {len(k2.get('sources') or [])} docs, {k2.get('chunks_count')} chunks")
    else:
        cmd_status()
        existing = []
        sb = get_supabase()
        for path in DEFAULT_MD_FILES:
            if path.exists():
                title = path.stem.replace("-", " ").replace("_", " ")
                rows = (
                    sb.table("project_knowledge_sources")
                    .select("id, title")
                    .eq("project_id", MAXXI_WEB_PROJECT_ID)
                    .eq("source_type", "document")
                    .execute()
                ).data or []
                if any((r.get("title") or "").lower() == title.lower() for r in rows):
                    existing.append(path.name)
        if existing:
            print(f"\nYa existen en DB (mismo título): {', '.join(existing)}")
            print("Re-ingesta actualizará por título. Continuando…")
        cmd_ingest([p for p in DEFAULT_MD_FILES if p.exists()])

    print("\n")
    cmd_chunk_preview(DEFAULT_MD_FILES[0]) if DEFAULT_MD_FILES[0].exists() else None

    sample_queries = [
        "Filament admin panel promociones",
        "portal digitadores entrega premios",
        "stack Laravel React GSAP",
        "Power BI Metabase dashboards",
    ]
    for q in sample_queries:
        cmd_rag(q, k=3)

    cmd_ticket_append_demo()
    _hr("Fin demo — abrí /equipo/…/perfil o /proyectos/…/grafo en el frontend")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Pruebas del knowledge graph + RAG para MAXXI-WEB",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""
        Ejemplos rápidos:
          python scripts/maxxiweb_knowledge_demo.py status
          python scripts/maxxiweb_knowledge_demo.py demo
          python scripts/maxxiweb_knowledge_demo.py rag -q "Filament portal"
        """),
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("status", help="Ver documentos, chunks y nodos actuales")

    p_ingest = sub.add_parser("ingest", help="Subir .md a MAXXI-WEB")
    p_ingest.add_argument(
        "--file",
        action="append",
        type=Path,
        dest="files",
        help="Ruta al .md (repetible). Default: Downloads/DOCUMENTACION-COMPLETA + PROJECT_CONTEXT",
    )
    p_ingest.add_argument("--type", default="document", dest="source_type")

    p_prev = sub.add_parser("chunk-preview", help="Ver chunking local sin DB")
    p_prev.add_argument("--file", type=Path, required=True)
    p_prev.add_argument("--show", type=int, default=3)

    p_rag = sub.add_parser("rag", help="Consulta RAG como el agente")
    p_rag.add_argument("--query", "-q", required=True)
    p_rag.add_argument("-k", type=int, default=5)

    sub.add_parser("ticket-demo", help="Muestra MD que genera un ticket done")

    p_demo = sub.add_parser("demo", help="Recorrido completo (recomendado)")
    p_demo.add_argument("--api", action="store_true", help="Usar HTTP en vez de Python directo")
    p_demo.add_argument("--api-base", default=DEFAULT_API)

    args = parser.parse_args()

    try:
        if args.cmd == "status":
            cmd_status()
        elif args.cmd == "ingest":
            files = args.files or [p for p in DEFAULT_MD_FILES if p.exists()]
            cmd_ingest(files, args.source_type)
        elif args.cmd == "chunk-preview":
            cmd_chunk_preview(args.file, args.show)
        elif args.cmd == "rag":
            cmd_rag(args.query, args.k)
        elif args.cmd == "ticket-demo":
            cmd_ticket_append_demo()
        elif args.cmd == "demo":
            cmd_demo(args.api, args.api_base)
    except KeyboardInterrupt:
        print("\nInterrumpido.")
        return 130
    except Exception as e:
        print(f"\nError: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
