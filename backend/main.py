"""AI Meeting-to-Tickets PM — Backend FastAPI.

Correr:  uvicorn main:app --reload
Docs:    http://localhost:8000/docs
"""
import logging

from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from openai import OpenAIError

try:
    from . import services
    from .config import get_settings
    from .schemas import (
        ApproveResponse,
        AssignmentAgentOutput,
        AssignmentAgentRequest,
        HealthResponse,
        MeetingAgentOutput,
        MeetingAgentRequest,
        TicketPatch,
        TranscribeResponse,
    )
except ImportError:  # Permite `uvicorn main:app` desde backend/.
    import services
    from config import get_settings
    from schemas import (
        ApproveResponse,
        AssignmentAgentOutput,
        AssignmentAgentRequest,
        HealthResponse,
        MeetingAgentOutput,
        MeetingAgentRequest,
        TicketPatch,
        TranscribeResponse,
    )

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("app")

app = FastAPI(title="AI Meeting-to-Tickets PM", version=get_settings().APP_VERSION)

# CORS abierto — es un hackathon.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Manejo global de errores: nunca crashea Uvicorn ----------

@app.exception_handler(OpenAIError)
async def openai_error_handler(request: Request, exc: OpenAIError):
    logger.error("OpenAI error en %s: %s", request.url.path, exc)
    return JSONResponse(status_code=500, content={"detail": f"Error del LLM: {type(exc).__name__}"})


@app.exception_handler(RuntimeError)
async def config_error_handler(request: Request, exc: RuntimeError):
    # Errores de configuración/estado controlado (p.ej. falta una API key).
    logger.warning("RuntimeError en %s: %s", request.url.path, exc)
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.exception_handler(Exception)
async def global_error_handler(request: Request, exc: Exception):
    logger.exception("Error no manejado en %s", request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Error interno del servidor"})


# ---------- Helpers de datos ----------

def _get_requirement_or_404(requirement_id: str) -> dict:
    res = (
        services.get_supabase()
        .table("requirements")
        .select("id, project_id, meeting_id")
        .eq("id", requirement_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Requirement no encontrado")
    return res.data[0]


def _get_tickets_by_requirement(requirement_id: str) -> list[dict]:
    res = (
        services.get_supabase()
        .table("tickets")
        .select("*")
        .eq("requirement_id", requirement_id)
        .execute()
    )
    return res.data or []


def _get_skill_codes_by_id() -> dict[str, str]:
    rows = (services.get_supabase().table("skills").select("id, code").execute()).data or []
    return {row["id"]: row["code"] for row in rows}


def _get_skill_ids_by_code() -> dict[str, str]:
    return {code: skill_id for skill_id, code in _get_skill_codes_by_id().items()}


def _hydrate_tickets_with_skills(tickets: list[dict]) -> list[dict]:
    skill_codes_by_id = _get_skill_codes_by_id()
    return [
        {
            **ticket,
            "required_skill": skill_codes_by_id.get(ticket.get("required_skill_id")),
        }
        for ticket in tickets
    ]


def _hydrate_members_with_skills(members: list[dict]) -> list[dict]:
    skill_codes_by_id = _get_skill_codes_by_id()
    member_skills = (
        services.get_supabase()
        .table("member_skills")
        .select("member_id, skill_id")
        .execute()
    ).data or []

    skills_by_member: dict[str, list[str]] = {}
    for row in member_skills:
        skill_code = skill_codes_by_id.get(row["skill_id"])
        if skill_code:
            skills_by_member.setdefault(row["member_id"], []).append(skill_code)

    return [
        {
            **member,
            "skills": skills_by_member.get(member["id"], []),
        }
        for member in members
    ]


# ---------- 1. Transcripción ----------

@app.post("/api/transcribe", response_model=TranscribeResponse)
def transcribe(file: UploadFile = File(...), project_id: str | None = Form(default=None)):
    content = file.file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Archivo de audio vacío")
    text = services.transcribe_audio(file.filename or "audio", content, file.content_type)
    if not text:
        raise HTTPException(status_code=502, detail="ElevenLabs no devolvió texto")

    # Guardar el transcript crudo en meetings. Si no mandan project_id, se usa
    # un proyecto por defecto para no perder el transcript.
    resolved_project_id = project_id or services.get_default_project_id()
    meeting_id = None
    if resolved_project_id:
        meeting_id = services.create_meeting(
            project_id=resolved_project_id,
            transcript=text,
            source="upload",
            title=file.filename,
        )
    else:
        logger.warning("No hay project_id disponible; el transcript no se guardó en meetings")

    return TranscribeResponse(text=text, meeting_id=meeting_id)


# ---------- 2. Meeting Agent ----------

@app.post("/api/agents/meeting", response_model=MeetingAgentOutput)
def meeting_agent(body: MeetingAgentRequest):
    if not body.transcript.strip():
        raise HTTPException(status_code=400, detail="Transcript vacío")

    requirement = _get_requirement_or_404(body.requirement_id)
    meeting_id = services.save_meeting_transcript(
        requirement_id=body.requirement_id,
        project_id=requirement["project_id"],
        meeting_id=requirement.get("meeting_id"),
        transcript=body.transcript,
    )

    output = services.run_meeting_agent(body.transcript)
    sb = services.get_supabase()

    # Guardar summary en el requirement.
    sb.table("requirements").update(
        {"summary": output.summary, "status": "extracted"}
    ).eq("id", body.requirement_id).execute()

    services.mark_meeting_processed(meeting_id)

    # Insertar tickets vinculados al requirement
    if output.tickets:
        skill_ids_by_code = _get_skill_ids_by_code()
        rows = [
            {
                "requirement_id": body.requirement_id,
                "project_id": requirement["project_id"],
                "title": t.title,
                "description": t.description,
                "priority": t.priority,
                "estimate_hours": t.estimate_hours,
                "required_skill_id": skill_ids_by_code.get(t.required_skill),
                "status": "backlog",
                "risk_pct": 0,
            }
            for t in output.tickets
        ]
        sb.table("tickets").insert(rows).execute()

    return output


# ---------- 3. Assignment Agent ----------

@app.post("/api/agents/assignment", response_model=AssignmentAgentOutput)
def assignment_agent(body: AssignmentAgentRequest):
    sb = services.get_supabase()

    tickets = _hydrate_tickets_with_skills(_get_tickets_by_requirement(body.requirement_id))
    if not tickets:
        raise HTTPException(status_code=404, detail="No hay tickets para ese requirement_id")

    members = _hydrate_members_with_skills((sb.table("members").select("*").execute()).data or [])
    if not members:
        raise HTTPException(status_code=404, detail="No hay miembros en la tabla members")

    output = services.run_assignment_agent(tickets, members)

    # Índices para mapear nombres → ids (el LLM habla en nombres)
    member_by_name = {m["name"].strip().lower(): m for m in members}
    ticket_by_title = {t["title"].strip().lower(): t for t in tickets}

    for rec in output.recommendations:
        ticket = ticket_by_title.get(rec.ticket_title.strip().lower())
        member = member_by_name.get(rec.assignee_name.strip().lower())
        if not ticket or not member:
            logger.warning(
                "Recomendación sin match exacto (ticket=%r, member=%r) — se omite",
                rec.ticket_title,
                rec.assignee_name,
            )
            continue
        sb.table("tickets").update(
            {"assignee_id": member["id"], "risk_pct": rec.risk_pct, "status": "todo"}
        ).eq("id", ticket["id"]).execute()

    return output


# ---------- 4. PATCH ticket ----------

@app.patch("/api/tickets/{ticket_id}")
def patch_ticket(ticket_id: str, body: TicketPatch):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Nada que actualizar")
    res = services.get_supabase().table("tickets").update(updates).eq("id", ticket_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    return res.data[0]


# ---------- 5. Aprobar ----------

@app.post("/api/approve/{requirement_id}", response_model=ApproveResponse)
def approve(requirement_id: str):
    sb = services.get_supabase()

    req_res = sb.table("requirements").update({"status": "approved"}).eq("id", requirement_id).execute()
    if not req_res.data:
        raise HTTPException(status_code=404, detail="Requirement no encontrado")

    tickets = _get_tickets_by_requirement(requirement_id)
    notified = services.notify_n8n({"requirement": req_res.data[0], "tickets": tickets})

    return ApproveResponse(status="approved", requirement_id=requirement_id, n8n_notified=notified)


# ---------- 6. Health ----------

@app.get("/api/health", response_model=HealthResponse)
def health():
    return HealthResponse(status="ok", version=get_settings().APP_VERSION)


@app.get("/api/health/db")
def health_db():
    res = services.get_supabase().table("teams").select("id").limit(1).execute()
    return {"status": "ok", "supabase": True, "rows_checked": len(res.data or [])}
