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
    "Eres un analista de requerimientos. Del transcript en español extrae: "
    "(1) resumen de 2-3 frases, (2) tickets accionables. "
    "Cada ticket: título corto, descripción de 1-2 frases, priority, "
    "estimate_hours (entero realista) y required_skill. "
    "No inventes tickets que no estén en el transcript."
)

ASSIGNMENT_SYSTEM_PROMPT = (
    "Eres un PM técnico. Recibes tickets y miembros con skills y current_load (0-100). "
    "Asigna cada ticket al miembro cuya skill coincida con required_skill. "
    "Si su current_load > 70, sube risk_pct proporcionalmente. "
    "Si nadie tiene la skill, asigna al de menor carga con risk_pct >= 70. "
    "reasoning: máximo 1 frase."
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

def run_meeting_agent(transcript: str) -> MeetingAgentOutput:
    """Transcript → MeetingAgentOutput. Schema garantizado por Structured Outputs.

    Seguridad: el transcript SIEMPRE viaja como mensaje `user`, nunca concatenado
    al system prompt (mitiga prompt injection accidental).
    """
    client = get_openai()
    start = time.perf_counter()
    ok = False
    try:
        completion = client.beta.chat.completions.parse(
            model=get_settings().OPENAI_MODEL,
            temperature=0,
            messages=[
                {"role": "system", "content": MEETING_SYSTEM_PROMPT},
                {"role": "user", "content": transcript},
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
