"""AI Meeting-to-Tickets PM — Backend FastAPI.

Correr:  uvicorn main:app --reload
Docs:    http://localhost:8000/docs
"""
import logging
import traceback
import uuid
from llm_firewall import scan_prompt
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
        ClientErrorReport,
        CreateRequirementRequest,
        CreateRequirementResponse,
        CreateTicketRequest,
        HealthResponse,
        MeetingAgentOutput,
        MeetingAgentRequest,
        TicketPatch,
        TicketCommentRequest,
        TicketCommentResponse,
        TranscribeResponse,
    )
except ImportError:  # Permite `uvicorn main:app` desde backend/.
    import services
    from config import get_settings
    from schemas import (
        ApproveResponse,
        AssignmentAgentOutput,
        AssignmentAgentRequest,
        ClientErrorReport,
        CreateRequirementRequest,
        CreateRequirementResponse,
        CreateTicketRequest,
        HealthResponse,
        MeetingAgentOutput,
        MeetingAgentRequest,
        TicketPatch,
        TicketCommentRequest,
        TicketCommentResponse,
        TranscribeResponse,
    )

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("app")

app = FastAPI(title="AI Meeting-to-Tickets PM", version=get_settings().APP_VERSION)

# CORS abierto — es un hackathon. Exponemos X-Request-ID para correlacionar
# errores del navegador con filas en error_logs.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    """Asigna un request_id a cada request y lo devuelve en X-Request-ID."""
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


# ---------- Manejo global de errores: nunca crashea Uvicorn ----------

def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", None) or uuid.uuid4().hex


def _error_response(request: Request, *, status: int, detail: str, exc: Exception, severity: str) -> JSONResponse:
    """Registra el error en error_logs y responde incluyendo el request_id."""
    request_id = _request_id(request)
    services.log_error(
        message=str(exc) or detail,
        source="backend",
        severity=severity,
        error_type=type(exc).__name__,
        http_status=status,
        http_method=request.method,
        path=request.url.path,
        stack=traceback.format_exc(),
        request_id=request_id,
        user_agent=request.headers.get("user-agent"),
    )
    return JSONResponse(
        status_code=status,
        content={"detail": detail, "request_id": request_id},
        headers={"X-Request-ID": request_id},
    )


@app.exception_handler(OpenAIError)
async def openai_error_handler(request: Request, exc: OpenAIError):
    logger.error("OpenAI error en %s: %s", request.url.path, exc)
    return _error_response(
        request, status=500, detail=f"Error del LLM: {type(exc).__name__}", exc=exc, severity="error"
    )


@app.exception_handler(RuntimeError)
async def config_error_handler(request: Request, exc: RuntimeError):
    logger.warning("RuntimeError en %s: %s", request.url.path, exc)
    return _error_response(request, status=503, detail=str(exc), exc=exc, severity="warning")


@app.exception_handler(Exception)
async def global_error_handler(request: Request, exc: Exception):
    logger.exception("Error no manejado en %s", request.url.path)
    return _error_response(
        request, status=500, detail="Error interno del servidor", exc=exc, severity="critical"
    )


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


def _tickets_with_skill_codes(project_id: str | None = None, requirement_id: str | None = None) -> list[dict]:
    query = (
        services.get_supabase()
        .table("board_tickets")
        .select("*")
        .order("created_at", desc=True)
    )
    if project_id:
        query = query.eq("project_id", project_id)
    if requirement_id:
        query = query.eq("requirement_id", requirement_id)
    return query.execute().data or []


def _members_with_dynamic_load(members: list[dict]) -> list[dict]:
    active = (
        services.get_supabase()
        .table("tickets")
        .select("assignee_id,estimate_hours,status")
        .in_("status", ["todo", "in_progress"])
        .execute()
    ).data or []
    by_member: dict[str, dict[str, int]] = {}
    for ticket in active:
        assignee_id = ticket.get("assignee_id")
        if not assignee_id:
            continue
        stats = by_member.setdefault(assignee_id, {"hours": 0, "count": 0})
        stats["hours"] += int(ticket.get("estimate_hours") or 0)
        stats["count"] += 1

    hydrated = _hydrate_members_with_skills(members)
    enriched = []
    for member in hydrated:
        stats = by_member.get(member["id"], {"hours": 0, "count": 0})
        # 80h activas ~= carga completa; se combina con current_load seed/HR.
        computed_load = min(100, round((stats["hours"] / 80) * 100))
        effective_load = max(int(member.get("current_load") or 0), computed_load)
        enriched.append(
            {
                **member,
                "active_hours": stats["hours"],
                "active_ticket_count": stats["count"],
                "effective_load": effective_load,
                "current_load": effective_load,
            }
        )
    return enriched


# ---------- 0. Crear requirement (para que el frontend obtenga un id real) ----------

@app.post("/api/requirements", response_model=CreateRequirementResponse, status_code=201)
def create_requirement(body: CreateRequirementRequest):
    project_id = body.project_id or services.get_default_project_id()
    if not project_id:
        raise HTTPException(status_code=400, detail="No hay proyecto disponible en la base de datos")
    row = services.create_requirement(project_id=project_id, title=body.title)
    return CreateRequirementResponse(
        id=row["id"],
        project_id=row["project_id"],
        title=row.get("title"),
        status=row["status"],
    )


# ---------- 1. Transcripción ----------

@app.post("/api/transcribe", response_model=TranscribeResponse)
def transcribe(file: UploadFile = File(...), project_id: str | None = Form(default=None)):
    content = file.file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Archivo de audio vacío")
    text = services.transcribe_audio(file.filename or "audio", content, file.content_type)
    if not text:
        raise HTTPException(status_code=502, detail="ElevenLabs no devolvió texto")

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

    result_dat = scan_prompt(body.transcript)
    if not result_dat.is_content_safe:
        raise HTTPException(
            status_code=400,
            detail=f"Transcript no seguro: {result_dat.compres_hilos_detect}",
        )

    safe_transcript = result_dat.prompt_data

    requirement = _get_requirement_or_404(body.requirement_id)
    meeting_id = services.save_meeting_transcript(
        requirement_id=body.requirement_id,
        project_id=requirement["project_id"],
        meeting_id=requirement.get("meeting_id"),
        transcript=safe_transcript,
    )

    existing_tickets = _tickets_with_skill_codes(project_id=body.project_id or requirement["project_id"])

    output = services.run_meeting_agent(safe_transcript, existing_tickets=existing_tickets)
    sb = services.get_supabase()

    sb.table("requirements").update(
        {"summary": output.summary, "status": "extracted"}
    ).eq("id", body.requirement_id).execute()

    services.mark_meeting_processed(meeting_id)

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

    members = _members_with_dynamic_load((sb.table("members").select("*").execute()).data or [])
    if not members:
        raise HTTPException(status_code=404, detail="No hay miembros en la tabla members")

    output = services.run_assignment_agent(tickets, members)

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
        previous_status = ticket.get("status")
        sb.table("tickets").update(
            {"assignee_id": member["id"], "risk_pct": rec.risk_pct, "status": "todo"}
        ).eq("id", ticket["id"]).execute()

        services.record_assignment(ticket["id"], member["id"], rec.risk_pct, rec.reasoning)
        services.log_ticket_status_event(ticket["id"], previous_status, "todo", source="agent")

    return output


# ---------- 4. PATCH ticket ----------

@app.patch("/api/tickets/{ticket_id}")
def patch_ticket(ticket_id: str, body: TicketPatch):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Nada que actualizar")

    sb = services.get_supabase()

    previous_status = None
    if "status" in updates:
        current = sb.table("tickets").select("status").eq("id", ticket_id).execute().data
        if current:
            previous_status = current[0].get("status")

    res = sb.table("tickets").update(updates).eq("id", ticket_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")

    if "status" in updates:
        services.log_ticket_status_event(ticket_id, previous_status, updates["status"], source="web")

    return res.data[0]


# ---------- 5. Aprobar ----------

@app.post("/api/approve/{requirement_id}", response_model=ApproveResponse)
def approve(requirement_id: str):
    sb = services.get_supabase()

    req_res = (
        sb.table("requirements")
        .update({"status": "approved", "approved_at": "now()"})
        .eq("id", requirement_id)
        .execute()
    )
    if not req_res.data:
        raise HTTPException(status_code=404, detail="Requirement no encontrado")

    tickets = _get_tickets_by_requirement(requirement_id)
    payload = {"requirement": req_res.data[0], "tickets": tickets}
    notified = services.notify_n8n(payload)

    approval_id = services.record_approval(
        requirement_id, n8n_notified=notified, n8n_ok=notified, webhook_payload=payload
    )
    services.create_notifications(approval_id, tickets)

    return ApproveResponse(status="approved", requirement_id=requirement_id, n8n_notified=notified)


# ---------- 6. Miembros del equipo ----------

@app.get("/api/members")
def list_members():
    """Lista los miembros del equipo (con sus skills) para la vista de Equipo del frontend."""
    rows = (
        services.get_supabase()
        .table("members")
        .select("id, team_id, name, role, email, current_load, is_manager")
        .order("is_manager")
        .order("name")
        .execute()
    ).data or []
    return _members_with_dynamic_load(rows)


# ---------- 7. Proyectos disponibles ----------

@app.get("/api/projects")
def list_projects():
    """Lista proyectos disponibles. Permite que el frontend ofrezca
    un selector al crear un requirement en vez de usar el default."""
    rows = (
        services.get_supabase()
        .table("projects")
        .select("id, name, status, business_area, target_date")
        .order("name")
        .execute()
    ).data or []
    return rows


# ---------- 8. Workspace/proyecto/tickets/comentarios ----------

@app.get("/api/workspace")
def workspace():
    """Snapshot completo para hidratar el frontend desde Supabase."""
    sb = services.get_supabase()
    members = _members_with_dynamic_load(
        sb.table("members")
        .select("id, team_id, name, role, email, current_load, is_manager")
        .order("is_manager")
        .order("name")
        .execute()
        .data
        or []
    )
    projects = (
        sb.table("projects")
        .select("id, team_id, code, name, description, business_area, status, owner_id, target_date, created_at")
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    requirements = (
        sb.table("requirements")
        .select("id, project_id, meeting_id, title, summary, status, created_at")
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    tickets = _tickets_with_skill_codes()
    return {"members": members, "projects": projects, "requirements": requirements, "tickets": tickets}


@app.get("/api/projects/{project_id}/work")
def project_work(project_id: str):
    sb = services.get_supabase()
    project = (
        sb.table("projects")
        .select("id, team_id, code, name, description, business_area, status, owner_id, target_date, created_at")
        .eq("id", project_id)
        .execute()
        .data
    )
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    requirements = (
        sb.table("requirements")
        .select("id, project_id, meeting_id, title, summary, status, created_at")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    meetings = (
        sb.table("meetings")
        .select("id, primary_project_id, title, status, source, recorded_at, created_at")
        .eq("primary_project_id", project_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    tickets = _tickets_with_skill_codes(project_id=project_id)
    return {"project": project[0], "requirements": requirements, "meetings": meetings, "tickets": tickets}


@app.post("/api/tickets")
def create_ticket(body: CreateTicketRequest):
    sb = services.get_supabase()
    requirement = _get_requirement_or_404(body.requirement_id)
    project_id = body.project_id or requirement["project_id"]
    skill_id = _get_skill_ids_by_code().get(body.required_skill)
    payload = {
        "requirement_id": body.requirement_id,
        "project_id": project_id,
        "title": body.title.strip(),
        "description": body.description,
        "priority": body.priority,
        "estimate_hours": body.estimate_hours,
        "required_skill_id": skill_id,
        "status": body.status,
        "assignee_id": body.assignee_id,
        "deadline": body.deadline,
        "risk_pct": 0,
        "assignment_reasoning": "Creado manualmente por el manager.",
    }
    if not payload["title"]:
        raise HTTPException(status_code=400, detail="Título requerido")
    res = sb.table("tickets").insert(payload).execute()
    ticket = res.data[0]
    if body.assignee_id:
        services.record_assignment(ticket["id"], body.assignee_id, 0, "Asignado manualmente por el manager.")
    services.log_ticket_status_event(ticket["id"], None, body.status, source="web")
    rows = _tickets_with_skill_codes(requirement_id=body.requirement_id)
    return next((row for row in rows if row["id"] == ticket["id"]), ticket)


@app.get("/api/tickets/{ticket_id}/comments", response_model=list[TicketCommentResponse])
def list_ticket_comments(ticket_id: str):
    rows = (
        services.get_supabase()
        .table("project_knowledge_sources")
        .select("id, raw_content, created_by_id, created_at, metadata")
        .eq("source_type", "manual_note")
        .contains("metadata", {"ticket_id": ticket_id, "kind": "ticket_comment"})
        .order("created_at")
        .execute()
        .data
        or []
    )
    return [
        TicketCommentResponse(
            id=row["id"],
            ticket_id=ticket_id,
            body=row.get("raw_content") or "",
            author_id=row.get("created_by_id"),
            created_at=row.get("created_at"),
        )
        for row in rows
    ]


@app.post("/api/tickets/{ticket_id}/comments", response_model=TicketCommentResponse)
def create_ticket_comment(ticket_id: str, body: TicketCommentRequest):
    sb = services.get_supabase()
    ticket = sb.table("tickets").select("id, project_id, title").eq("id", ticket_id).execute().data
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    text = body.body.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Comentario vacío")
    res = sb.table("project_knowledge_sources").insert(
        {
            "project_id": ticket[0]["project_id"],
            "title": f"Comentario: {ticket[0]['title'][:60]}",
            "source_type": "manual_note",
            "raw_content": text,
            "summary": text[:240],
            "created_by_id": body.author_id,
            "metadata": {"ticket_id": ticket_id, "kind": "ticket_comment"},
        }
    ).execute()
    row = res.data[0]
    return TicketCommentResponse(
        id=row["id"],
        ticket_id=ticket_id,
        body=row.get("raw_content") or text,
        author_id=row.get("created_by_id"),
        created_at=row.get("created_at"),
    )


# ---------- 9. Health ----------

@app.get("/api/health", response_model=HealthResponse)
def health():
    return HealthResponse(status="ok", version=get_settings().APP_VERSION)


@app.get("/api/health/db")
def health_db():
    res = services.get_supabase().table("teams").select("id").limit(1).execute()
    return {"status": "ok", "supabase": True, "rows_checked": len(res.data or [])}


# ---------- 10. Error tracking ----------

@app.post("/api/client-errors", status_code=201)
def report_client_error(body: ClientErrorReport, request: Request):
    """El frontend reporta acá sus errores (no escribe directo a Supabase)."""
    services.log_error(
        message=body.message,
        source="frontend",
        severity=body.severity or "error",
        error_type=body.error_type,
        http_status=body.http_status,
        http_method=body.http_method,
        path=body.path,
        stack=body.stack,
        context=body.context,
        request_id=body.request_id or _request_id(request),
        user_agent=request.headers.get("user-agent"),
    )
    return {"logged": True}


@app.get("/api/errors")
def list_errors(limit: int = 50, source: str | None = None):
    """Últimos errores registrados (backend + frontend) para el panel de Sistema."""
    return services.list_error_logs(limit=limit, source=source)
