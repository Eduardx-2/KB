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
    from .schemas import MeetingAgentOutput, AssignmentAgentOutput
except ImportError:  # Permite `uvicorn main:app` desde backend/.
    from config import get_settings
    from schemas import MeetingAgentOutput, AssignmentAgentOutput

logger = logging.getLogger("app.services")

MEETING_SYSTEM_PROMPT = (
    "Eres un Product Manager técnico senior. Del transcript en español extrae: "
    "(1) resumen de 2-3 frases, (2) tickets accionables y GRANULARES. "
    "No generes tickets genéricos como 'hacer landing'. Divide cada feature en fases ejecutables: "
    "descubrimiento/mapeo, Figma/UX, diseño visual, frontend, backend/API, base de datos/inventario, QA, deploy. "
    "Cada ticket debe tener título corto, descripción concreta, priority, estimate_hours realista y required_skill. "
    "Si recibes tickets existentes en el contexto, evita duplicarlos; crea solo trabajo nuevo o complementario."
)

ASSIGNMENT_SYSTEM_PROMPT = (
    "Eres un PM técnico. Recibes tickets y miembros con skills y effective_load (0-100), "
    "que ya considera tickets activos y horas pendientes. Asigna cada ticket al miembro cuya skill coincida "
    "con required_skill y que tenga menor carga efectiva. Si su effective_load > 70, sube risk_pct proporcionalmente. "
    "Si nadie tiene la skill, asigna al de menor carga con risk_pct >= 70. "
    "No sobrecargues al mismo developer si hay otra persona viable. reasoning: máximo 1 frase."
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

def get_default_project_id() -> str | None:
    """Devuelve un project_id de respaldo (el primero disponible) para guardar el meeting."""
    res = get_supabase().table("projects").select("id").limit(1).execute()
    return res.data[0]["id"] if res.data else None


def create_meeting(
    *,
    project_id: str,
    transcript: str,
    source: str = "upload",
    title: str | None = None,
) -> str:
    """Crea un registro en meetings con el transcript crudo y devuelve su id."""
    res = get_supabase().table("meetings").insert(
        {
            "primary_project_id": project_id,
            "raw_transcript": transcript,
            "status": "transcribed",
            "source": source,
            "title": title,
        }
    ).execute()
    return res.data[0]["id"]


def create_requirement(
    *,
    project_id: str,
    title: str | None = None,
    origin_project_id: str | None = None,
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
) -> None:
    """Registra un error en error_logs. Best-effort: nunca rompe el request.

    Se usa tanto para errores del backend (desde los exception handlers) como
    para errores del frontend reportados vía POST /api/client-errors.
    """
    try:
        get_supabase().table("error_logs").insert(
            {
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
        ).execute()
    except Exception:  # noqa: BLE001 — el logging jamás tumba el endpoint
        logger.exception("No se pudo escribir error_logs (ignorado)")


def list_error_logs(limit: int = 50, source: str | None = None) -> list[dict]:
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
    return query.execute().data or []


# ---------- Logging de agentes ----------

def log_agent(agent: str, latency_ms: int, ok: bool) -> None:
    """Escribe en agent_logs. Nunca rompe el request si falla."""
    try:
        get_supabase().table("agent_logs").insert(
            {
                "agent": agent,
                "latency_ms": latency_ms,
                "model": get_settings().OPENAI_MODEL,
                "ok": ok,
            }
        ).execute()
    except Exception:  # noqa: BLE001 — el log jamás tumba el endpoint
        logger.exception("No se pudo escribir agent_logs (ignorado)")


# ---------- LLM: agentes con Structured Outputs ----------

def run_meeting_agent(transcript: str, existing_tickets: list[dict] | None = None) -> MeetingAgentOutput:
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
        }
        for t in (existing_tickets or [])
    ]
    user_content = transcript
    if existing_ctx:
        user_content = (
            f"TICKETS_EXISTENTES_DEL_PROYECTO (evita duplicar):\n{existing_ctx}\n\n"
            f"TRANSCRIPT_NUEVO:\n{transcript}"
        )
    start = time.perf_counter()
    ok = False
    try:
        completion = client.beta.chat.completions.parse(
            model=get_settings().OPENAI_MODEL,
            temperature=0,
            messages=[
                {"role": "system", "content": MEETING_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            response_format=MeetingAgentOutput,
        )
        result = completion.choices[0].message.parsed
        if result is None:  # p.ej. refusal — tratarlo como fallo controlado
            raise RuntimeError("El modelo no devolvió un objeto parseado")
        ok = True
        return result
    finally:
        log_agent("meeting", int((time.perf_counter() - start) * 1000), ok)


def run_assignment_agent(tickets: list[dict], members: list[dict]) -> AssignmentAgentOutput:
    """Tickets + members → recomendaciones de asignación con % de riesgo."""
    client = get_openai()
    # Contexto compacto: solo los campos que el modelo necesita.
    tickets_ctx = [
        {
            "title": t["title"],
            "required_skill": t.get("required_skill"),
            "priority": t.get("priority"),
            "estimate_hours": t.get("estimate_hours"),
        }
        for t in tickets
    ]
    members_ctx = [
        {
            "name": m["name"],
            "role": m.get("role"),
            "skills": m.get("skills", []),
            "current_load": m.get("current_load", 0),
            "effective_load": m.get("effective_load", m.get("current_load", 0)),
            "active_ticket_count": m.get("active_ticket_count", 0),
            "active_hours": m.get("active_hours", 0),
        }
        for m in members
    ]
    user_payload = f"TICKETS:\n{tickets_ctx}\n\nMIEMBROS DEL EQUIPO:\n{members_ctx}"

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
        ok = True
        return result
    finally:
        log_agent("assignment", int((time.perf_counter() - start) * 1000), ok)


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
    if not get_settings().N8N_WEBHOOK_URL:
        logger.warning("Falta N8N_WEBHOOK_URL en backend/.env; se omite notificación")
        return False
    try:
        resp = httpx.post(get_settings().N8N_WEBHOOK_URL, json=payload, timeout=15.0)
        resp.raise_for_status()
        return True
    except Exception:  # noqa: BLE001
        logger.exception("Fallo notificando a n8n (la aprobación sigue siendo válida)")
        return False
