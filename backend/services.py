"""Servicios externos: Supabase, OpenAI (Structured Outputs), ElevenLabs STT y webhook n8n.

Todo es síncrono a propósito: los endpoints se declaran con `def` (no `async def`)
y FastAPI los corre en su threadpool — cero riesgo de bloquear el event loop y
código más simple para un hackathon.
"""
import time
import logging
from functools import lru_cache

import httpx
from openai import OpenAI
from supabase import create_client, Client

try:
    from .config import get_settings
    from .schemas import (
        AssignmentAgentOutput,
        AssignmentRecommendation,
        GranularTicket,
        MeetingAgentOutput,
    )
except ImportError:  # Permite `uvicorn main:app` desde backend/.
    from config import get_settings
    from schemas import (
        AssignmentAgentOutput,
        AssignmentRecommendation,
        GranularTicket,
        MeetingAgentOutput,
    )

logger = logging.getLogger("app.services")

MEETING_SYSTEM_PROMPT = (
    "Eres un Product Manager técnico senior de Maxxi Group (IT interno El Salvador). "
    "Del transcript en español producís: (1) resumen 2-4 frases, (2) tickets con JERARQUÍA.\n"
    "\n"
    "JERARQUÍA (obligatorio):\n"
    "- 2–5 ÉPICAS raíz (parent_title=null): entregables grandes del stakeholder.\n"
    "- Debajo de cada épica, 1–3 SUBTAREAS con parent_title = título exacto de la épica "
    "(discovery, implementación, QA, etc.).\n"
    "- Total 4–16 ítems. PROHIBIDO inundar el board con 12+ tickets sueltos sin padre.\n"
    "- Ejemplo Cayena: épica 'Documento de producción Exactus' + subtareas "
    "(layout bodega/artículos, existencias, guardar→transacción, QA digitadores).\n"
    "\n"
    "CALIDAD:\n"
    "- PROHIBIDO títulos vagos: 'hacer API', 'mejorar Exactus', 'ajustar UI', 'implementar ERP'.\n"
    "- description: proceso AS-IS → TO-BE, sistema (Exactus / Softland / Cayena / web Maxxi), "
    "quién lo usa (digitación, producción, finanzas) y entregable medible.\n"
    "- acceptance_criteria: checklist con ≥3 bullets '- ...'.\n"
    "- knowledge_evidence: cita corta casi literal del transcript o del RAG.\n"
    "- related_db_tables en snake_case si aplica; depends_on_titles entre tickets de la misma cadena.\n"
    "- Normalizá 'Exacto'/'Exactos' → Exactus cuando el contexto sea el ERP.\n"
    "\n"
    "SKILLS (elegí el MÁS ESPECÍFICO):\n"
    "- erp_exactus: pantallas, transacciones, costos, existencias, pedidos, reversiones, reportes Exactus/Cayena ERP.\n"
    "- erp_softland: Softland / conciliación Softland.\n"
    "- csharp / sql / apps: lógica C#, jobs SQL, apps internas (si no es pantalla Exactus pura).\n"
    "- filament / maxxi_web / web_design / frontend: web corporativa / Filament / UI web NO-Exactus.\n"
    "- metabase / data: BI / tableros (NO reportes nativos de Exactus/Cayena).\n"
    "- networking / docker / devops: solo si el transcript habla de redes, DNS, Docker o despliegue.\n"
    "- NO uses 'backend' genérico si el trabajo es Exactus → usa erp_exactus o csharp.\n"
    "- NO marques UI de Exactus/Cayena ERP como frontend/filament/web: es erp_exactus "
    "(digitación de pedidos, bodega, existencias, consumos).\n"
    "- Pedido de Cayena = módulo ERP Exactus → skill erp_exactus en UI y en lógica.\n"
    "\n"
    "ORG (si viene EQUIPO_ORG en el mensaje): respetá dominios; el jefe/DevOps NO es ejecutor por defecto.\n"
    "Si hay CONTEXTO_RAG o tickets existentes, evitá duplicar; creá solo trabajo nuevo o complementario."
)

ASSIGNMENT_SYSTEM_PROMPT = (
    "Eres el ayudante de asignación del Jefe de IT (Maxxi). "
    "Proponés assignee por ticket; el jefe aprueba el plan después.\n"
    "\n"
    "REGLAS DURAS:\n"
    "1) NUNCA asignes a is_manager=true (Juan / Jefe IT / DevOps) si existe CUALQUIER otro "
    "miembro no-manager viable (skill match, skill afín o menor carga). "
    "Manager solo como ÚLTIMO RECURSO con risk_pct >= 85 y reasoning que diga 'último recurso'.\n"
    "2) Match exacto de required_skill en members.skills primero; luego skills afines "
    "(erp_exactus↔csharp/sql/apps; frontend↔filament/web_design/maxxi_web; data↔metabase).\n"
    "3) Tickets erp_exactus / Exactus / Cayena ERP → solo developers con erp_exactus "
    "(típicamente Iván o Erick). NO Christopher (web/BI) ni Jaime (redes).\n"
    "4) Si is_absent=true o effective_load > 70 → subí risk_pct.\n"
    "5) No sobrecargues a una sola persona si hay otra viable. reasoning: 1 frase en español.\n"
    "6) Usá MEMBER_KNOWLEDGE (perfil MD) para respetar proyectos, stack y restricciones de cada integrante."
)


# ---------- Clientes (singletons) ----------

@lru_cache
def get_supabase() -> Client:
    s = get_settings()
    return create_client(s.SUPABASE_URL, s.SUPABASE_SERVICE_ROLE_KEY)


@lru_cache
def get_openai() -> OpenAI:
    api_key = get_settings().OPENAI_API_KEY
    if not api_key:
        raise RuntimeError("Falta OPENAI_API_KEY en backend/.env")
    return OpenAI(api_key=api_key)


# ---------- Persistencia de meetings ----------

def get_default_project_id(team_id: str | None = None) -> str | None:
    """Devuelve un project_id de respaldo (el primero disponible) para guardar el meeting."""
    query = get_supabase().table("projects").select("id")
    if team_id:
        query = query.eq("team_id", team_id)
    res = query.limit(1).execute()
    return res.data[0]["id"] if res.data else None


def create_meeting(
    *,
    project_id: str,
    transcript: str,
    source: str = "upload",
    title: str | None = None,
    team_id: str | None = None,  # noqa: ARG001 — reserved for future meetings.team_id
) -> str:
    """Crea un registro en meetings con el transcript crudo y devuelve su id."""
    payload = {
        "primary_project_id": project_id,
        "raw_transcript": transcript,
        "status": "transcribed",
        "source": source,
        "title": title,
    }
    res = get_supabase().table("meetings").insert(payload).execute()
    return res.data[0]["id"]


def create_requirement(
    *,
    project_id: str,
    title: str | None = None,
    origin_project_id: str | None = None,
    team_id: str | None = None,  # noqa: ARG001 — scoped via project_id
) -> dict:
    """Crea un requirement en estado 'draft' y devuelve la fila (id, project_id, ...)."""
    res = get_supabase().table("requirements").insert(
        {
            "project_id": project_id,
            "origin_project_id": origin_project_id,
            "title": title,
            "status": "draft",
        }
    ).execute()
    return res.data[0]


def save_meeting_transcript(
    *,
    requirement_id: str,
    project_id: str,
    meeting_id: str | None,
    transcript: str,
    source: str = "paste",
) -> str:
    """Guarda el transcript en meetings.raw_transcript y enlaza requirements.meeting_id."""
    sb = get_supabase()
    payload = {
        "raw_transcript": transcript,
        "status": "transcribed",
        "source": source,
    }

    if meeting_id:
        sb.table("meetings").update(payload).eq("id", meeting_id).execute()
        return meeting_id

    res = sb.table("meetings").insert(
        {"primary_project_id": project_id, **payload}
    ).execute()
    new_meeting_id = res.data[0]["id"]
    sb.table("requirements").update({"meeting_id": new_meeting_id}).eq("id", requirement_id).execute()
    return new_meeting_id


def mark_meeting_processed(meeting_id: str) -> None:
    get_supabase().table("meetings").update({"status": "processed"}).eq("id", meeting_id).execute()


# ---------- Trazabilidad del flujo (best-effort) ----------

def record_assignment(ticket_id: str, assignee_id: str, risk_pct: int, reasoning: str | None) -> None:
    """Historial de asignaciones. El trigger de la DB marca esta como la única current."""
    try:
        get_supabase().table("ticket_assignments").insert(
            {
                "ticket_id": ticket_id,
                "assignee_id": assignee_id,
                "risk_pct": risk_pct,
                "reasoning": reasoning,
                "source": "agent",
                "is_current": True,
            }
        ).execute()
    except Exception:  # noqa: BLE001 — la trazabilidad jamás tumba el endpoint
        logger.exception("No se pudo escribir ticket_assignments (ignorado)")


def log_ticket_status_event(
    ticket_id: str, from_status: str | None, to_status: str, source: str = "api"
) -> None:
    """Bitácora de cambios de estado de un ticket."""
    if from_status == to_status:
        return
    try:
        get_supabase().table("ticket_status_events").insert(
            {
                "ticket_id": ticket_id,
                "from_status": from_status,
                "to_status": to_status,
                "source": source,
            }
        ).execute()
    except Exception:  # noqa: BLE001
        logger.exception("No se pudo escribir ticket_status_events (ignorado)")


def record_approval(
    requirement_id: str, n8n_notified: bool, n8n_ok: bool | None, webhook_payload: dict | None
) -> str | None:
    """Registra la aprobación en approvals. Devuelve el id o None si falló."""
    try:
        res = get_supabase().table("approvals").insert(
            {
                "requirement_id": requirement_id,
                "n8n_notified": n8n_notified,
                "n8n_ok": n8n_ok,
                "webhook_payload": webhook_payload,
            }
        ).execute()
        return res.data[0]["id"]
    except Exception:  # noqa: BLE001
        logger.exception("No se pudo escribir approvals (ignorado)")
        return None


def create_notifications(approval_id: str | None, tickets: list[dict]) -> None:
    """Crea una notificación por cada assignee de los tickets aprobados."""
    rows = [
        {
            "approval_id": approval_id,
            "ticket_id": t["id"],
            "member_id": t["assignee_id"],
            "channel": "email",
            "template": "assignee_notice",
            "status": "sent",
        }
        for t in tickets
        if t.get("assignee_id")
    ]
    if not rows:
        return
    try:
        get_supabase().table("notifications").insert(rows).execute()
    except Exception:  # noqa: BLE001
        logger.exception("No se pudo escribir notifications (ignorado)")


# ---------- Error logging (backend + frontend) ----------

def log_error(
    *,
    message: str,
    source: str = "backend",
    severity: str = "error",
    error_type: str | None = None,
    http_status: int | None = None,
    http_method: str | None = None,
    path: str | None = None,
    stack: str | None = None,
    context: dict | None = None,
    request_id: str | None = None,
    user_agent: str | None = None,
    team_id: str | None = None,
) -> None:
    """Registra un error en error_logs. Best-effort: nunca rompe el request.

    Se usa tanto para errores del backend (desde los exception handlers) como
    para errores del frontend reportados vía POST /api/client-errors.
    """
    try:
        payload = {
            "source": source,
            "severity": severity,
            "error_type": error_type,
            "http_status": http_status,
            "http_method": http_method,
            "path": path,
            # recortes defensivos para no guardar payloads gigantes
            "message": (message or "")[:8000],
            "stack": stack[:20000] if stack else None,
            "context": context,
            "request_id": request_id,
            "user_agent": user_agent[:1000] if user_agent else None,
        }
        if team_id:
            payload["team_id"] = team_id
        get_supabase().table("error_logs").insert(payload).execute()
    except Exception:  # noqa: BLE001 — el logging jamás tumba el endpoint
        logger.exception("No se pudo escribir error_logs (ignorado)")


def list_error_logs(
    limit: int = 50,
    source: str | None = None,
    team_id: str | None = None,
) -> list[dict]:
    """Lee los últimos errores (para el panel de Sistema del frontend)."""
    query = (
        get_supabase()
        .table("error_logs")
        .select("*")
        .order("created_at", desc=True)
        .limit(max(1, min(limit, 200)))
    )
    if source:
        query = query.eq("source", source)
    if team_id:
        try:
            query = query.eq("team_id", team_id)
        except Exception:  # noqa: BLE001
            pass
    return query.execute().data or []


# ---------- Logging de agentes ----------

def log_agent(agent: str, latency_ms: int, ok: bool, team_id: str | None = None) -> None:
    """Escribe en agent_logs. Nunca rompe el request si falla."""
    try:
        payload = {
            "agent": agent,
            "latency_ms": latency_ms,
            "model": get_settings().OPENAI_MODEL,
            "ok": ok,
        }
        if team_id:
            payload["team_id"] = team_id
        get_supabase().table("agent_logs").insert(payload).execute()
    except Exception:  # noqa: BLE001 — el log jamás tumba el endpoint
        # Reintento sin team_id si la columna no existe aún.
        if team_id:
            try:
                get_supabase().table("agent_logs").insert(
                    {
                        "agent": agent,
                        "latency_ms": latency_ms,
                        "model": get_settings().OPENAI_MODEL,
                        "ok": ok,
                    }
                ).execute()
                return
            except Exception:  # noqa: BLE001
                pass
        logger.exception("No se pudo escribir agent_logs (ignorado)")


def _record_token_usage(completion, team_id: str | None) -> None:
    """Si el completion trae usage, lo registra (best-effort)."""
    if not team_id:
        return
    try:
        usage = getattr(completion, "usage", None)
        if not usage:
            return
        total = int(getattr(usage, "total_tokens", 0) or 0)
        prompt = int(getattr(usage, "prompt_tokens", 0) or 0)
        completion_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
        try:
            from .quotas import record_usage
        except ImportError:
            from quotas import record_usage
        if prompt:
            record_usage(team_id, "tokens_in", prompt)
        if completion_tokens:
            record_usage(team_id, "tokens_out", completion_tokens)
        elif total:
            record_usage(team_id, "tokens", total)
    except Exception:  # noqa: BLE001
        logger.exception("No se pudo registrar usage de tokens (ignorado)")


# ---------- LLM: agentes con Structured Outputs ----------

# ---------- LLM: agentes con Structured Outputs ----------

_SKILL_AFFINITY: dict[str, list[str]] = {
    "erp_exactus": ["erp_exactus", "csharp", "sql", "apps", "backend"],
    "erp_softland": ["erp_softland", "csharp", "sql", "apps", "backend"],
    "csharp": ["csharp", "backend", "apps", "erp_exactus"],
    "sql": ["sql", "data", "backend", "erp_exactus"],
    "backend": ["backend", "csharp", "apps", "erp_exactus"],
    "frontend": ["frontend", "filament", "web_design", "maxxi_web"],
    "filament": ["filament", "frontend", "maxxi_web", "web_design"],
    "maxxi_web": ["maxxi_web", "frontend", "web_design", "filament"],
    "web_design": ["web_design", "frontend", "maxxi_web"],
    "data": ["data", "metabase", "sql"],
    "metabase": ["metabase", "data", "sql"],
    "devops": ["devops", "docker"],
    "docker": ["docker", "devops"],
    "networking": ["networking", "dns", "routing_maxxi", "cabling", "cameras"],
    "apps": ["apps", "csharp", "backend"],
    "qa": ["qa"],
}

_EXACTUS_HINTS = (
    "exactus",
    "exacto",
    "cayena",
    "existencia",
    "existencias",
    "bodega",
    "pedido",
    "consumo",
    "consumos",
    "reversi",
    "digitaci",
)


def _text_blob(ticket: dict) -> str:
    return " ".join(
        str(ticket.get(k) or "")
        for k in ("title", "description", "acceptance_criteria", "knowledge_evidence")
    ).lower()


def normalize_ticket_skill(ticket: dict) -> dict:
    """Rewrite mislabeled skills when the ticket is clearly Exactus/Cayena ERP work."""
    blob = _text_blob(ticket)
    skill = (ticket.get("required_skill") or "").strip()
    if any(h in blob for h in _EXACTUS_HINTS):
        # UI/reportes de Exactus/Cayena no son Filament/web Maxxi.
        if skill in {"frontend", "filament", "web_design", "maxxi_web", "metabase", "data", "backend", ""}:
            return {**ticket, "required_skill": "erp_exactus"}
    return ticket


def _load_of(member: dict) -> float:
    return float(member.get("effective_load", member.get("current_load", 0)) or 0)


def resolve_assignee(
    ticket: dict,
    members: list[dict],
) -> tuple[dict | None, int, str]:
    """Deterministic assignee picker. Managers are last resort only."""
    ticket = normalize_ticket_skill(ticket)
    skill = (ticket.get("required_skill") or "backend").strip()
    non_managers = [
        m for m in members
        if not m.get("is_manager") and not m.get("is_absent")
    ]
    managers = [m for m in members if m.get("is_manager") and not m.get("is_absent")]

    affinity = _SKILL_AFFINITY.get(skill, [skill])

    def pool_with_skills(pool: list[dict], wanted: list[str]) -> list[dict]:
        out: list[dict] = []
        for m in pool:
            skills = set(m.get("skills") or [])
            if any(s in skills for s in wanted):
                out.append(m)
        return out

    # 1) Exact skill among non-managers
    exact = [m for m in non_managers if skill in (m.get("skills") or [])]
    if exact:
        pick = min(exact, key=_load_of)
        risk = 15 + int(_load_of(pick) * 0.4)
        return pick, min(risk, 70), f"Match exacto {skill}; carga {_load_of(pick):.0f}%."

    # 2) Affinity among non-managers
    related = pool_with_skills(non_managers, affinity)
    if related:
        pick = min(related, key=_load_of)
        risk = 35 + int(_load_of(pick) * 0.4)
        return pick, min(risk, 80), f"Skill afín a {skill}; carga {_load_of(pick):.0f}%."

    # 3) Any non-manager (wrong skill) — high risk
    if non_managers:
        pick = min(non_managers, key=_load_of)
        return pick, 75, f"Sin dueño de {skill}; menor carga no-manager (revisar)."

    # 4) Manager last resort
    if managers:
        pick = min(managers, key=_load_of)
        return pick, 90, "Último recurso: jefe/DevOps (nadie más disponible)."

    return None, 100, "Sin miembros disponibles."


def apply_assignment_guardrails(
    llm_output: AssignmentAgentOutput,
    tickets: list[dict],
    members: list[dict],
) -> AssignmentAgentOutput:
    """Override LLM picks that violate org rules (esp. assigning the manager)."""
    by_name = {m["name"].strip().lower(): m for m in members}
    by_title = {t["title"].strip().lower(): normalize_ticket_skill(t) for t in tickets}
    fixed: list[AssignmentRecommendation] = []

    for rec in llm_output.recommendations:
        ticket = by_title.get(rec.ticket_title.strip().lower())
        member = by_name.get(rec.assignee_name.strip().lower())
        if not ticket:
            continue

        must_override = False
        if member is None:
            must_override = True
        elif member.get("is_manager"):
            alt, _, _ = resolve_assignee(ticket, members)
            if alt and not alt.get("is_manager"):
                must_override = True
        else:
            skill = ticket.get("required_skill")
            skills = set(member.get("skills") or [])
            if skill and skill not in skills:
                affinity = set(_SKILL_AFFINITY.get(skill, [skill]))
                if skills.isdisjoint(affinity):
                    alt, _, _ = resolve_assignee(ticket, members)
                    if alt and alt["id"] != member["id"]:
                        must_override = True
            # Extra: Exactus domain never to web-only people
            if any(h in _text_blob(ticket) for h in _EXACTUS_HINTS):
                if "erp_exactus" not in skills and "csharp" not in skills:
                    alt, _, _ = resolve_assignee(ticket, members)
                    if alt and alt["id"] != member["id"]:
                        must_override = True

        if must_override:
            pick, risk, reason = resolve_assignee(ticket, members)
            if pick:
                fixed.append(
                    AssignmentRecommendation(
                        ticket_title=ticket["title"],
                        assignee_name=pick["name"],
                        risk_pct=risk,
                        reasoning=reason,
                    )
                )
                continue

        fixed.append(rec)

    covered = {r.ticket_title.strip().lower() for r in fixed}
    for t in tickets:
        nt = normalize_ticket_skill(t)
        if nt["title"].strip().lower() in covered:
            continue
        pick, risk, reason = resolve_assignee(nt, members)
        if pick:
            fixed.append(
                AssignmentRecommendation(
                    ticket_title=nt["title"],
                    assignee_name=pick["name"],
                    risk_pct=risk,
                    reasoning=reason,
                )
            )

    return AssignmentAgentOutput(recommendations=fixed)


def run_meeting_agent(
    transcript: str,
    existing_tickets: list[dict] | None = None,
    rag_context: dict | None = None,
    team_id: str | None = None,
    org_roster: list[dict] | None = None,
) -> MeetingAgentOutput:
    """Transcript → MeetingAgentOutput. Schema garantizado por Structured Outputs.

    Seguridad: el transcript SIEMPRE viaja como mensaje `user`, nunca concatenado
    al system prompt (mitiga prompt injection accidental).
    """
    client = get_openai()
    existing_ctx = [
        {
            "title": t.get("title"),
            "status": t.get("status"),
            "required_skill": t.get("required_skill") or t.get("skills", {}).get("code"),
            "work_phase": t.get("work_phase"),
        }
        for t in (existing_tickets or [])
    ]
    parts: list[str] = []
    if org_roster:
        roster_lines = []
        for m in org_roster:
            roster_lines.append(
                f"- {m.get('name')}: {m.get('role')} | skills={m.get('skills', [])} "
                f"| is_manager={bool(m.get('is_manager'))}"
            )
        parts.append(
            "EQUIPO_ORG (dominios; el manager NO es ejecutor por defecto):\n"
            + "\n".join(roster_lines)
        )
    if rag_context:
        chunks = rag_context.get("chunks") or []
        if chunks:
            chunk_text = "\n---\n".join(
                c.get("content", "")[:800] for c in chunks[:8] if c.get("content")
            )
            parts.append(f"CONTEXTO_RAG (knowledge base del proyecto):\n{chunk_text}")
        prior = rag_context.get("prior_meetings") or []
        if prior:
            parts.append(
                "REUNIONES_PREVIAS:\n"
                + "\n".join(
                    f"- {m.get('title') or m.get('id')}: {(m.get('summary') or '')[:300]}"
                    for m in prior[:3]
                )
            )
    if existing_ctx:
        parts.append(f"TICKETS_EXISTENTES_DEL_PROYECTO (evita duplicar):\n{existing_ctx}")
    parts.append(f"TRANSCRIPT_NUEVO:\n{transcript}")
    user_content = "\n\n".join(parts)

    start = time.perf_counter()
    ok = False
    try:
        completion = client.beta.chat.completions.parse(
            model=get_settings().OPENAI_MODEL,
            temperature=0.2,
            messages=[
                {"role": "system", "content": MEETING_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            response_format=MeetingAgentOutput,
        )
        result = completion.choices[0].message.parsed
        if result is None:  # p.ej. refusal — tratarlo como fallo controlado
            raise RuntimeError("El modelo no devolvió un objeto parseado")
        _record_token_usage(completion, team_id)
        ok = True
        return result
    finally:
        log_agent("meeting", int((time.perf_counter() - start) * 1000), ok, team_id=team_id)


def build_member_knowledge_context(
    team_id: str,
    members: list[dict],
    tickets: list[dict],
) -> dict[str, list[str]]:
    """Compact RAG: global profile (k=2) + project notes only for ticket projects."""
    try:
        from . import knowledge
    except ImportError:
        import knowledge  # type: ignore[no-redef]

    sb = get_supabase()
    project_ids = list({t["project_id"] for t in tickets if t.get("project_id")})
    query_parts = [
        f"{t.get('title', '')} {(t.get('description') or '')[:80]}"
        for t in tickets[:4]
    ]
    query = " ".join(query_parts).strip() or "asignación stack"

    # Batch stakeholder notes for ticket projects (1 query).
    notes_by_member: dict[str, list[str]] = {}
    if project_ids:
        try:
            rows = (
                sb.table("project_stakeholders")
                .select("member_id, project_id, md_notes, role_in_project")
                .in_("project_id", project_ids)
                .execute()
            ).data or []
            proj_names: dict[str, str] = {}
            projs = (
                sb.table("projects").select("id, name, code").in_("id", project_ids).execute()
            ).data or []
            for p in projs:
                proj_names[p["id"]] = p.get("code") or p.get("name") or p["id"]
            for row in rows:
                md = (row.get("md_notes") or "").strip()
                if not md or (len(md) < 100 and "## Mi rol" in md):
                    continue  # skip empty templates
                label = proj_names.get(row["project_id"], "proyecto")
                snippet = f"[{label}] {row.get('role_in_project') or ''}: {md[:350]}"
                notes_by_member.setdefault(row["member_id"], []).append(snippet)
        except Exception:  # noqa: BLE001
            logger.debug("stakeholder notes for assignment skipped", exc_info=True)

    context: dict[str, list[str]] = {}
    for member in members:
        if member.get("is_manager"):
            continue
        mid = member["id"]
        snippets: list[str] = []
        # Project-scoped first (highest signal, low tokens)
        for s in notes_by_member.get(mid, [])[:2]:
            snippets.append(s)
        # Global profile only if we still have room
        if len(snippets) < 2:
            try:
                global_snips = knowledge.retrieve_member_context(team_id, mid, query, k=2)
                for g in global_snips[: 2 - len(snippets)]:
                    snippets.append(g[:300])
            except Exception:  # noqa: BLE001
                pass
        if snippets:
            context[member["name"]] = snippets
    return context


def run_assignment_agent(
    tickets: list[dict],
    members: list[dict],
    member_context: dict | None = None,
    member_knowledge: dict[str, list[str]] | None = None,
    team_id: str | None = None,
) -> AssignmentAgentOutput:
    """Tickets + members → recomendaciones de asignación con % de riesgo."""
    client = get_openai()
    # Contexto compacto: solo los campos que el modelo necesita.
    tickets_ctx = [
        {
            "title": t["title"],
            "required_skill": t.get("required_skill"),
            "priority": t.get("priority"),
            "estimate_hours": t.get("estimate_hours"),
            "work_phase": t.get("work_phase"),
            "description": (t.get("description") or "")[:240],
        }
        for t in tickets
    ]
    members_ctx = [
        {
            "name": m["name"],
            "role": m.get("role"),
            "skills": m.get("skills", []),
            "is_manager": bool(m.get("is_manager")),
            "current_load": m.get("current_load", 0),
            "effective_load": m.get("effective_load", m.get("current_load", 0)),
            "duty_load_pct": m.get("duty_load_pct", 0),
            "is_absent": m.get("is_absent", False),
            "active_ticket_count": m.get("active_ticket_count", 0),
            "active_hours": m.get("active_hours", 0),
        }
        for m in members
    ]
    user_payload = (
        "REGLA: is_manager=true solo como último recurso.\n\n"
        f"TICKETS:\n{tickets_ctx}\n\nMIEMBROS DEL EQUIPO:\n{members_ctx}"
    )
    if member_context:
        user_payload += f"\n\nMEMBER_CONTEXT (duties/absences):\n{member_context}"
    if member_knowledge:
        user_payload += (
            "\n\nMEMBER_KNOWLEDGE (perfil MD por integrante — proyectos, stack, restricciones):\n"
            f"{member_knowledge}"
        )

    start = time.perf_counter()
    ok = False
    try:
        completion = client.beta.chat.completions.parse(
            model=get_settings().OPENAI_MODEL,
            temperature=0,
            messages=[
                {"role": "system", "content": ASSIGNMENT_SYSTEM_PROMPT},
                {"role": "user", "content": user_payload},
            ],
            response_format=AssignmentAgentOutput,
        )
        result = completion.choices[0].message.parsed
        if result is None:
            raise RuntimeError("El modelo no devolvió un objeto parseado")
        _record_token_usage(completion, team_id)
        result = apply_assignment_guardrails(result, tickets, members)
        ok = True
        return result
    finally:
        log_agent("assignment", int((time.perf_counter() - start) * 1000), ok, team_id=team_id)


def persist_granular_tickets(
    sb: Client,
    requirement_id: str,
    project_id: str,
    tickets: list[GranularTicket],
    rag_chunks: list[dict] | None = None,
    skill_ids_by_code: dict[str, str] | None = None,
) -> list[str]:
    """Insert granular tickets and link ticket_context_references to RAG chunks."""
    if not tickets:
        return []

    skill_map = skill_ids_by_code or {}
    title_to_id: dict[str, str] = {}
    inserted_ids: list[str] = []

    rows = []
    for t in tickets:
        rows.append(
            {
                "requirement_id": requirement_id,
                "project_id": project_id,
                "title": t.title,
                "description": t.description,
                "priority": t.priority,
                "estimate_hours": t.estimate_hours,
                "required_skill_id": skill_map.get(t.required_skill),
                "status": "backlog",
                "risk_pct": 0,
                "work_phase": t.work_phase,
                "acceptance_criteria": t.acceptance_criteria,
                "is_greenfield": t.is_greenfield,
                "related_db_tables": t.related_db_tables or None,
            }
        )

    res = sb.table("tickets").insert(rows).execute()
    inserted = res.data or []
    for row in inserted:
        title_to_id[row["title"].strip().lower()] = row["id"]
        inserted_ids.append(row["id"])

    # Resolve parent_title → parent_ticket_id and depends_on_titles → depends_on_ticket_ids
    for ticket_obj, row in zip(tickets, inserted, strict=False):
        patch: dict = {}
        parent_title = (ticket_obj.parent_title or "").strip().lower()
        if parent_title and parent_title in title_to_id and title_to_id[parent_title] != row["id"]:
            patch["parent_ticket_id"] = title_to_id[parent_title]
        dep_ids = [
            title_to_id[d.strip().lower()]
            for d in (ticket_obj.depends_on_titles or [])
            if d.strip().lower() in title_to_id
        ]
        if dep_ids:
            patch["depends_on_ticket_ids"] = dep_ids
        if patch:
            try:
                sb.table("tickets").update(patch).eq("id", row["id"]).execute()
            except Exception:  # noqa: BLE001 — columns may not exist
                logger.debug("ticket hierarchy update skipped", exc_info=True)

    # ticket_context_references from RAG chunks + knowledge_evidence
    ref_rows: list[dict] = []
    chunks = rag_chunks or []
    for ticket_obj, row in zip(tickets, inserted, strict=False):
        ticket_id = row["id"]
        if chunks:
            for chunk in chunks[:3]:
                ref_rows.append(
                    {
                        "ticket_id": ticket_id,
                        "knowledge_chunk_id": chunk.get("id"),
                        "project_id": project_id,
                        "evidence_text": (ticket_obj.knowledge_evidence or chunk.get("content", ""))[:500],
                        "relevance_pct": int((chunk.get("similarity") or 0.7) * 100)
                        if chunk.get("similarity") is not None
                        else 75,
                    }
                )
        elif ticket_obj.knowledge_evidence:
            ref_rows.append(
                {
                    "ticket_id": ticket_id,
                    "project_id": project_id,
                    "evidence_text": ticket_obj.knowledge_evidence[:500],
                    "relevance_pct": 60,
                }
            )

    if ref_rows:
        try:
            sb.table("ticket_context_references").insert(ref_rows).execute()
        except Exception:  # noqa: BLE001
            logger.exception("No se pudo escribir ticket_context_references (ignorado)")

    return inserted_ids


# ---------- ElevenLabs STT (Scribe) ----------

def transcribe_audio(filename: str, content: bytes, content_type: str | None) -> str:
    """Manda el audio a ElevenLabs Speech-to-Text y devuelve el texto plano."""
    s = get_settings()
    if not s.ELEVENLABS_API_KEY:
        raise RuntimeError("Falta ELEVENLABS_API_KEY en backend/.env")
    resp = httpx.post(
        "https://api.elevenlabs.io/v1/speech-to-text",
        headers={"xi-api-key": s.ELEVENLABS_API_KEY},
        data={"model_id": s.ELEVENLABS_STT_MODEL, "language_code": s.STT_LANGUAGE},
        files={"file": (filename, content, content_type or "audio/mpeg")},
        timeout=120.0,
    )
    resp.raise_for_status()
    return resp.json().get("text", "")


# ---------- n8n webhook ----------

def notify_n8n(payload: dict) -> bool:
    """POST al webhook de n8n. Devuelve True/False; nunca lanza excepción."""
    settings = get_settings()
    if not settings.N8N_WEBHOOK_URL:
        logger.warning("Falta N8N_WEBHOOK_URL en backend/.env; se omite notificación")
        return False
    try:
        headers = {}
        if settings.N8N_WEBHOOK_SECRET:
            headers["X-Webhook-Secret"] = settings.N8N_WEBHOOK_SECRET
        resp = httpx.post(settings.N8N_WEBHOOK_URL, json=payload, headers=headers, timeout=15.0)
        resp.raise_for_status()
        return True
    except Exception:  # noqa: BLE001
        logger.exception("Fallo notificando a n8n (la aprobación sigue siendo válida)")
        return False
