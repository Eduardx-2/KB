"""AI Meeting-to-Tickets PM — Backend FastAPI.

Correr:  uvicorn main:app --reload
Docs:    http://localhost:8000/docs
"""
from __future__ import annotations

import logging
import re
import secrets
import traceback
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from openai import OpenAIError

try:
    from . import audit, billing, capacity, knowledge, quotas, services, tenancy
    from .auth import AuthContext, get_auth_context, require_role, require_team
    from .config import get_settings
    from .knowledge_routes import router as knowledge_router
    from .llm_firewall import scan_prompt
    from .rate_limit import RateLimitMiddleware
    from .schemas import (
        ApproveResponse,
        AssignmentAgentOutput,
        AssignmentAgentRequest,
        AuthMeResponse,
        ClientErrorReport,
        CreateRequirementRequest,
        CreateRequirementResponse,
        CreateTeamRequest,
        CreateTicketRequest,
        CreateProjectRequest,
        HealthResponse,
        InviteAcceptRequest,
        InviteRequest,
        MeetingAgentOutput,
        MeetingAgentRequest,
        PlanOut,
        TeamOut,
        TicketCommentRequest,
        TicketCommentResponse,
        TicketPatch,
        TranscribeResponse,
        UsageResponse,
    )
except ImportError:  # Permite `uvicorn main:app` desde backend/.
    import audit
    import billing
    import capacity
    import knowledge
    import quotas
    import services
    import tenancy
    from auth import AuthContext, get_auth_context, require_role, require_team
    from config import get_settings
    from knowledge_routes import router as knowledge_router
    from llm_firewall import scan_prompt
    from rate_limit import RateLimitMiddleware
    from schemas import (
        ApproveResponse,
        AssignmentAgentOutput,
        AssignmentAgentRequest,
        AuthMeResponse,
        ClientErrorReport,
        CreateRequirementRequest,
        CreateRequirementResponse,
        CreateTeamRequest,
        CreateTicketRequest,
        CreateProjectRequest,
        HealthResponse,
        InviteAcceptRequest,
        InviteRequest,
        MeetingAgentOutput,
        MeetingAgentRequest,
        PlanOut,
        TeamOut,
        TicketCommentRequest,
        TicketCommentResponse,
        TicketPatch,
        TranscribeResponse,
        UsageResponse,
    )

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("app")

app = FastAPI(title="AI Meeting-to-Tickets PM", version=get_settings().APP_VERSION)
app.include_router(knowledge_router)

# ---------- CORS ----------
_cors_raw = (get_settings().CORS_ORIGINS or "*").strip()
_cors_origins = ["*"] if _cors_raw == "*" else [o.strip() for o in _cors_raw.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "Retry-After"],
)

app.add_middleware(RateLimitMiddleware)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


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
    team_id = request.headers.get("x-team-id")
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
        team_id=team_id,
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

AuthDep = Annotated[AuthContext, Depends(get_auth_context)]
TeamAuth = Annotated[AuthContext, Depends(require_team)]


def _slugify(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "team"
    return f"{base}-{secrets.token_hex(3)}"


def _get_requirement_or_404(requirement_id: str, team_id: str | None = None) -> dict:
    if team_id:
        return tenancy.assert_team_owns_requirement(services.get_supabase(), team_id, requirement_id)
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


def _enrich_requirements_with_transcripts(
    sb, requirements: list[dict]
) -> list[dict]:
    """Join meetings.raw_transcript onto requirements for frontend transcript dialog."""
    if not requirements:
        return []
    meeting_ids = [r["meeting_id"] for r in requirements if r.get("meeting_id")]
    transcripts: dict[str, str] = {}
    if meeting_ids:
        rows = (
            sb.table("meetings")
            .select("id, raw_transcript")
            .in_("id", meeting_ids)
            .execute()
        ).data or []
        transcripts = {
            row["id"]: row.get("raw_transcript") or ""
            for row in rows
        }
    out: list[dict] = []
    for req in requirements:
        mid = req.get("meeting_id")
        out.append(
            {
                **req,
                "raw_transcript": transcripts.get(mid, "") if mid else "",
            }
        )
    return out


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
    member_ids = [m["id"] for m in members]
    if not member_ids:
        return [{**m, "skills": []} for m in members]

    member_skills = (
        services.get_supabase()
        .table("member_skills")
        .select("member_id, skill_id")
        .in_("member_id", member_ids)
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


def _tickets_with_skill_codes(
    project_id: str | None = None,
    requirement_id: str | None = None,
    project_ids: list[str] | None = None,
) -> list[dict]:
    """Load tickets with skill codes + hierarchy fields from tickets table (not stale view)."""
    sb = services.get_supabase()
    select_full = (
        "id, requirement_id, project_id, title, description, priority, estimate_hours, "
        "required_skill_id, risk_pct, assignee_id, assignment_reasoning, status, deadline, "
        "kanban_order, created_at, updated_at, work_phase, acceptance_criteria, "
        "parent_ticket_id, scheduled_date, is_greenfield, related_db_tables, depends_on_ticket_ids"
    )
    select_basic = (
        "id, requirement_id, project_id, title, description, priority, estimate_hours, "
        "required_skill_id, risk_pct, assignee_id, assignment_reasoning, status, deadline, "
        "kanban_order, created_at, updated_at"
    )

    def _query(select_cols: str):
        q = sb.table("tickets").select(select_cols).order("created_at", desc=True)
        if project_id:
            q = q.eq("project_id", project_id)
        elif project_ids is not None:
            if not project_ids:
                return []
            q = q.in_("project_id", project_ids)
        if requirement_id:
            q = q.eq("requirement_id", requirement_id)
        return q.execute().data or []

    try:
        rows = _query(select_full)
    except Exception:  # noqa: BLE001 — older schema without hierarchy cols
        logger.debug("tickets hierarchy select failed; using basic columns", exc_info=True)
        rows = _query(select_basic)

    skill_by_id = {v: k for k, v in _get_skill_ids_by_code().items()}
    member_ids = [r["assignee_id"] for r in rows if r.get("assignee_id")]
    name_by_id: dict[str, str] = {}
    if member_ids:
        mems = (
            sb.table("members")
            .select("id, name")
            .in_("id", list(set(member_ids)))
            .execute()
        ).data or []
        name_by_id = {m["id"]: m["name"] for m in mems}

    project_ids_seen = list({r["project_id"] for r in rows if r.get("project_id")})
    project_name_by_id: dict[str, str] = {}
    if project_ids_seen:
        projs = (
            sb.table("projects")
            .select("id, name")
            .in_("id", project_ids_seen)
            .execute()
        ).data or []
        project_name_by_id = {p["id"]: p["name"] for p in projs}

    out: list[dict] = []
    for r in rows:
        skill_id = r.get("required_skill_id")
        out.append(
            {
                **r,
                "required_skill": skill_by_id.get(skill_id) if skill_id else None,
                "assignee_name": name_by_id.get(r["assignee_id"]) if r.get("assignee_id") else None,
                "project_name": project_name_by_id.get(r["project_id"]) if r.get("project_id") else None,
            }
        )
    return out


def _members_with_dynamic_load(members: list[dict]) -> list[dict]:
    member_ids = [m["id"] for m in members]
    active: list[dict] = []
    if member_ids:
        active = (
            services.get_supabase()
            .table("tickets")
            .select("assignee_id,estimate_hours,status")
            .in_("status", ["todo", "in_progress"])
            .in_("assignee_id", member_ids)
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
        # 80h activas ~= carga completa; solo tickets activos (ignora current_load seed/HR en DB).
        computed_load = min(100, round((stats["hours"] / 80) * 100))
        enriched.append(
            {
                **member,
                "active_hours": stats["hours"],
                "active_ticket_count": stats["count"],
                "effective_load": computed_load,
                "current_load": computed_load,
            }
        )
    enriched_members = capacity.enrich_member_load(enriched)
    # Sincronizar current_load con effective_load (tickets + duties + ausencias).
    return [
        {**m, "current_load": m.get("effective_load", m.get("current_load", 0))}
        for m in enriched_members
    ]


def _build_member_context(sb, team_id: str) -> dict:
    """Duties, absences, module ownership for assignment agent."""
    try:
        duties = (
            sb.table("member_duties")
            .select("member_id, title, duty_type, load_pct, is_active")
            .eq("team_id", team_id)
            .eq("is_active", True)
            .execute()
        ).data or []
        absences = (
            sb.table("member_absences")
            .select("member_id, start_date, end_date, reason, status")
            .eq("team_id", team_id)
            .in_("status", ["approved", "pending"])
            .execute()
        ).data or []
        stakeholders = (
            sb.table("project_stakeholders")
            .select("member_id, project_id, role_in_project, importance_pct")
            .execute()
        ).data or []
        project_ids = tenancy.project_ids_for_team(sb, team_id)
        modules: list[dict] = []
        if project_ids:
            modules = (
                sb.table("project_modules")
                .select("id, project_id, name, owner_member_id, status")
                .in_("project_id", project_ids)
                .eq("status", "active")
                .execute()
            ).data or []
        return {"duties": duties, "absences": absences, "stakeholders": stakeholders, "modules": modules}
    except Exception:  # noqa: BLE001 — tables may not exist in old DBs
        logger.debug("member context unavailable", exc_info=True)
        return {"duties": [], "absences": [], "stakeholders": [], "modules": []}


def _fetch_team(team_id: str) -> dict | None:
    try:
        rows = (
            services.get_supabase()
            .table("teams")
            .select("id, name, slug, plan_tier, status, billing_email, created_at, max_meetings_per_month, max_tokens_per_month, max_members")
            .eq("id", team_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        return rows[0] if rows else None
    except Exception:  # noqa: BLE001 — columnas SaaS aún no migradas
        rows = (
            services.get_supabase()
            .table("teams")
            .select("id, name, slug, created_at")
            .eq("id", team_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        return rows[0] if rows else None


# ---------- Auth / SaaS ----------

@app.get("/api/me", response_model=AuthMeResponse)
def me(auth: AuthDep):
    team = _fetch_team(auth.team_id) if auth.team_id else None
    return AuthMeResponse(
        user_id=auth.user_id,
        email=auth.email,
        team_id=auth.team_id,
        role=auth.role,
        team=team,
        is_authenticated=auth.is_authenticated,
    )


@app.get("/api/teams", response_model=list[TeamOut])
def list_teams(auth: AuthDep):
    sb = services.get_supabase()
    if get_settings().AUTH_DISABLED:
        if not auth.team_id:
            return []
        team = _fetch_team(auth.team_id)
        if not team:
            return []
        return [
            TeamOut(
                id=team["id"],
                name=team["name"],
                slug=team["slug"],
                role=auth.role,
                plan_tier=team.get("plan_tier"),
                status=team.get("status"),
                created_at=team.get("created_at"),
            )
        ]

    memberships = (
        sb.table("team_memberships")
        .select("team_id, role, teams(id, name, slug, plan_tier, status, created_at)")
        .eq("user_id", auth.user_id)
        .eq("status", "active")
        .execute()
        .data
        or []
    )
    out: list[TeamOut] = []
    for m in memberships:
        t = m.get("teams") or {}
        if isinstance(t, list):
            t = t[0] if t else {}
        if not t.get("id"):
            continue
        out.append(
            TeamOut(
                id=t["id"],
                name=t.get("name") or "",
                slug=t.get("slug") or "",
                role=m.get("role"),
                plan_tier=t.get("plan_tier"),
                status=t.get("status"),
                created_at=t.get("created_at"),
            )
        )
    return out


@app.post("/api/teams", response_model=TeamOut, status_code=201)
def create_team(body: CreateTeamRequest, auth: AuthDep):
    if not get_settings().AUTH_DISABLED and not auth.is_authenticated:
        raise HTTPException(status_code=401, detail="Autenticación requerida")

    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nombre requerido")

    slug = (body.slug or _slugify(name)).strip().lower()
    sb = services.get_supabase()

    payload: dict = {"name": name, "slug": slug}
    if body.billing_email:
        payload["billing_email"] = body.billing_email

    try:
        res = sb.table("teams").insert(payload).execute()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"No se pudo crear el team: {exc}") from exc

    team = res.data[0]

    if not get_settings().AUTH_DISABLED:
        try:
            sb.table("team_memberships").insert(
                {
                    "team_id": team["id"],
                    "user_id": auth.user_id,
                    "role": "owner",
                    "status": "active",
                }
            ).execute()
        except Exception as exc:  # noqa: BLE001
            logger.exception("Team creado pero membership falló")
            raise HTTPException(status_code=500, detail=f"Team creado pero membership falló: {exc}") from exc

    audit.log_audit(
        team_id=team["id"],
        user_id=auth.user_id,
        action="team.create",
        resource_type="team",
        resource_id=team["id"],
        meta={"name": team.get("name"), "slug": team.get("slug")},
    )

    return TeamOut(
        id=team["id"],
        name=team["name"],
        slug=team["slug"],
        role="owner",
        plan_tier=team.get("plan_tier"),
        status=team.get("status"),
        created_at=team.get("created_at"),
    )


@app.post("/api/teams/{team_id}/invitations", status_code=201)
def create_invitation(
    team_id: str,
    body: InviteRequest,
    auth: Annotated[AuthContext, Depends(require_role("owner", "admin"))],
):
    if auth.team_id and auth.team_id != team_id and not get_settings().AUTH_DISABLED:
        raise HTTPException(status_code=403, detail="Solo puedes invitar a tu team activo")

    email = body.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email requerido")

    token = secrets.token_urlsafe(32)
    expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    sb = services.get_supabase()

    row = {
        "team_id": team_id,
        "email": email,
        "role": body.role,
        "token": token,
        "invited_by": auth.user_id if auth.is_authenticated else None,
        "expires_at": expires_at,
    }
    try:
        res = sb.table("team_invitations").insert(row).execute()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"Invitaciones no disponibles: {exc}") from exc

    invite = res.data[0]
    audit.log_audit(
        team_id=team_id,
        user_id=auth.user_id,
        action="invite.send",
        resource_type="invitation",
        resource_id=invite.get("id"),
        meta={"email": email, "role": body.role},
    )
    return {
        "id": invite["id"],
        "team_id": team_id,
        "email": email,
        "role": body.role,
        "token": token,
        "expires_at": expires_at,
    }


@app.post("/api/invitations/accept")
def accept_invitation(body: InviteAcceptRequest, auth: AuthDep):
    if not get_settings().AUTH_DISABLED and not auth.is_authenticated:
        raise HTTPException(status_code=401, detail="Autenticación requerida")

    sb = services.get_supabase()
    try:
        rows = (
            sb.table("team_invitations")
            .select("*")
            .eq("token", body.token.strip())
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"Invitaciones no disponibles: {exc}") from exc

    if not rows:
        raise HTTPException(status_code=404, detail="Invitación no encontrada")

    invite = rows[0]
    if invite.get("accepted_at"):
        raise HTTPException(status_code=400, detail="Invitación ya aceptada")

    expires = invite.get("expires_at")
    if expires:
        try:
            exp_dt = datetime.fromisoformat(str(expires).replace("Z", "+00:00"))
            if exp_dt < datetime.now(timezone.utc):
                raise HTTPException(status_code=400, detail="Invitación expirada")
        except HTTPException:
            raise
        except Exception:  # noqa: BLE001
            pass

    role = invite.get("role") or "member"
    sb.table("team_memberships").upsert(
        {
            "team_id": invite["team_id"],
            "user_id": auth.user_id,
            "role": role,
            "status": "active",
        },
        on_conflict="team_id,user_id",
    ).execute()

    sb.table("team_invitations").update(
        {"accepted_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", invite["id"]).execute()

    audit.log_audit(
        team_id=invite["team_id"],
        user_id=auth.user_id,
        action="invite.accept",
        resource_type="invitation",
        resource_id=invite.get("id"),
        meta={"role": role},
    )

    return {"accepted": True, "team_id": invite["team_id"], "role": role}


@app.get("/api/usage", response_model=UsageResponse)
def usage(auth: TeamAuth):
    summary = quotas.get_usage_summary(auth.team_id)  # type: ignore[arg-type]
    return UsageResponse(**summary)


@app.get("/api/billing/plans", response_model=list[PlanOut])
def list_plans(auth: AuthDep):
    _ = auth  # auth required except health; demo still hits this
    try:
        rows = (
            services.get_supabase()
            .table("subscription_plans")
            .select("id, code, name, price_cents_monthly, max_members, max_meetings_per_month, max_tokens_per_month, features")
            .order("price_cents_monthly")
            .execute()
            .data
            or []
        )
        return [PlanOut(**r) for r in rows]
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"Planes no disponibles: {exc}") from exc


@app.post("/api/billing/checkout")
def billing_checkout(body: dict, auth: TeamAuth):
    plan_code = (body.get("plan_code") or "").strip().lower()
    if not plan_code:
        raise HTTPException(status_code=400, detail="plan_code requerido")

    result = billing.create_checkout_session(auth.team_id, plan_code)  # type: ignore[arg-type]
    audit.log_audit(
        team_id=auth.team_id,
        user_id=auth.user_id,
        action="billing.checkout",
        resource_type="plan",
        resource_id=plan_code,
        meta={"has_url": bool(result.get("url"))},
    )
    if result.get("url") is None and result.get("detail"):
        raise HTTPException(status_code=501, detail=result["detail"])
    return result


@app.post("/api/billing/webhook")
async def billing_webhook(request: Request):
    payload = await request.body()
    signature = request.headers.get("stripe-signature")
    verified = billing.verify_webhook_stub(payload, signature)
    audit.log_audit(
        team_id=None,
        user_id=None,
        action="billing.webhook",
        resource_type="stripe",
        meta=verified,
    )
    return {"received": True, **verified}


@app.get("/api/billing/subscription")
def billing_subscription(auth: TeamAuth):
    row = billing.get_team_subscription(auth.team_id)  # type: ignore[arg-type]
    if not row:
        return {"subscription": None}
    return {"subscription": row}


# ---------- 0. Crear requirement ----------

@app.post("/api/requirements", response_model=CreateRequirementResponse, status_code=201)
def create_requirement(body: CreateRequirementRequest, auth: TeamAuth):
    sb = services.get_supabase()
    project_id = body.project_id
    if project_id:
        tenancy.assert_team_owns_project(sb, auth.team_id, project_id)  # type: ignore[arg-type]
    else:
        project_id = services.get_default_project_id(auth.team_id)
    if not project_id:
        raise HTTPException(status_code=400, detail="No hay proyecto disponible en la base de datos")
    row = services.create_requirement(
        project_id=project_id, title=body.title, team_id=auth.team_id
    )
    return CreateRequirementResponse(
        id=row["id"],
        project_id=row["project_id"],
        title=row.get("title"),
        status=row["status"],
    )


# ---------- 1. Transcripción ----------

@app.post("/api/transcribe", response_model=TranscribeResponse)
def transcribe(
    auth: TeamAuth,
    file: UploadFile = File(...),
    project_id: str | None = Form(default=None),
):
    settings = get_settings()
    content = file.file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Archivo de audio vacío")
    if len(content) > settings.MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Archivo demasiado grande (máx {settings.MAX_UPLOAD_BYTES} bytes)",
        )

    quotas.check_quota(auth.team_id, "meetings")  # type: ignore[arg-type]

    sb = services.get_supabase()
    if project_id:
        tenancy.assert_team_owns_project(sb, auth.team_id, project_id)  # type: ignore[arg-type]

    text = services.transcribe_audio(file.filename or "audio", content, file.content_type)
    if not text:
        raise HTTPException(status_code=502, detail="ElevenLabs no devolvió texto")

    # Firewall post-STT antes de persistir
    result_dat = scan_prompt(text)
    if not result_dat.is_content_safe:
        raise HTTPException(
            status_code=400,
            detail=f"Transcript no seguro: {result_dat.compres_hilos_detect}",
        )
    safe_text = result_dat.prompt_data

    resolved_project_id = project_id or services.get_default_project_id(auth.team_id)
    meeting_id = None
    if resolved_project_id:
        meeting_id = services.create_meeting(
            project_id=resolved_project_id,
            transcript=safe_text,
            source="upload",
            title=file.filename,
            team_id=auth.team_id,
        )
        quotas.record_usage(auth.team_id, "meetings", 1, meta={"meeting_id": meeting_id})  # type: ignore[arg-type]
    else:
        logger.warning("No hay project_id disponible; el transcript no se guardó en meetings")

    return TranscribeResponse(text=safe_text, meeting_id=meeting_id)


# ---------- 2. Meeting Agent ----------

@app.post("/api/agents/meeting", response_model=MeetingAgentOutput)
def meeting_agent(body: MeetingAgentRequest, auth: TeamAuth):
    if not body.transcript.strip():
        raise HTTPException(status_code=400, detail="Transcript vacío")

    quotas.check_quota(auth.team_id, "tokens")  # type: ignore[arg-type]

    result_dat = scan_prompt(body.transcript)
    if not result_dat.is_content_safe:
        raise HTTPException(
            status_code=400,
            detail=f"Transcript no seguro: {result_dat.compres_hilos_detect}",
        )

    safe_transcript = result_dat.prompt_data

    requirement = _get_requirement_or_404(body.requirement_id, auth.team_id)
    meeting_id = services.save_meeting_transcript(
        requirement_id=body.requirement_id,
        project_id=requirement["project_id"],
        meeting_id=requirement.get("meeting_id"),
        transcript=safe_transcript,
    )

    existing_tickets = _tickets_with_skill_codes(project_id=body.project_id or requirement["project_id"])
    project_id = body.project_id or requirement["project_id"]

    rag_context = knowledge.retrieve_context(
        auth.team_id,  # type: ignore[arg-type]
        project_id,
        safe_transcript,
        k=8,
    )

    org_roster = _members_with_dynamic_load(
        tenancy.members_for_team(services.get_supabase(), auth.team_id)  # type: ignore[arg-type]
    )

    output = services.run_meeting_agent(
        safe_transcript,
        existing_tickets=existing_tickets,
        rag_context=rag_context,
        team_id=auth.team_id,
        org_roster=org_roster,
    )
    # Reescribir skills mal etiquetados (Cayena/Exactus UI ≠ Filament/web).
    normalized_tickets = []
    for t in output.tickets:
        fixed = services.normalize_ticket_skill(t.model_dump())
        if fixed.get("required_skill") != t.required_skill:
            t = t.model_copy(update={"required_skill": fixed["required_skill"]})
        normalized_tickets.append(t)
    output = output.model_copy(update={"tickets": normalized_tickets})

    sb = services.get_supabase()

    sb.table("requirements").update(
        {"summary": output.summary, "status": "extracted"}
    ).eq("id", body.requirement_id).execute()

    services.mark_meeting_processed(meeting_id)

    if output.tickets:
        skill_ids_by_code = _get_skill_ids_by_code()
        services.persist_granular_tickets(
            sb,
            body.requirement_id,
            project_id,
            output.tickets,
            rag_chunks=rag_context.get("chunks"),
            skill_ids_by_code=skill_ids_by_code,
        )

        mentioned: list[str] = []
        for t in output.tickets:
            mentioned.extend(t.related_db_tables or [])
            if t.knowledge_evidence:
                mentioned.append(t.title)
        knowledge.link_meeting_to_graph(
            meeting_id,
            project_id,
            auth.team_id,  # type: ignore[arg-type]
            output.summary,
            mentioned,
        )

    return output


# ---------- 3. Assignment Agent ----------

@app.post("/api/agents/assignment", response_model=AssignmentAgentOutput)
def assignment_agent(body: AssignmentAgentRequest, auth: TeamAuth):
    sb = services.get_supabase()
    _get_requirement_or_404(body.requirement_id, auth.team_id)
    quotas.check_quota(auth.team_id, "tokens")  # type: ignore[arg-type]

    tickets = _hydrate_tickets_with_skills(_get_tickets_by_requirement(body.requirement_id))
    if not tickets:
        raise HTTPException(status_code=404, detail="No hay tickets para ese requirement_id")

    tickets = [services.normalize_ticket_skill(t) for t in tickets]
    # Si hay jerarquía, asignar solo subtareas (hojas); las épicas son contenedores.
    if any(t.get("parent_ticket_id") for t in tickets):
        tickets = [t for t in tickets if t.get("parent_ticket_id")]
        if not tickets:
            raise HTTPException(
                status_code=400,
                detail="Hay épicas sin subtareas; creá subtareas antes de asignar",
            )
    # Persistir skill corregido si cambió (p.ej. filament → erp_exactus).
    skill_ids = _get_skill_ids_by_code()
    for t in tickets:
        original = t.get("required_skill")
        # normalize already applied in place via new dict
        code = t.get("required_skill")
        skill_id = skill_ids.get(code) if code else None
        if skill_id and skill_id != t.get("required_skill_id"):
            sb.table("tickets").update({"required_skill_id": skill_id}).eq("id", t["id"]).execute()
            t["required_skill_id"] = skill_id

    members = _members_with_dynamic_load(tenancy.members_for_team(sb, auth.team_id))  # type: ignore[arg-type]
    if not members:
        raise HTTPException(status_code=404, detail="No hay miembros en la tabla members")

    member_context = _build_member_context(sb, auth.team_id)  # type: ignore[arg-type]
    member_knowledge = services.build_member_knowledge_context(
        auth.team_id,  # type: ignore[arg-type]
        members,
        tickets,
    )
    output = services.run_assignment_agent(
        tickets,
        members,
        member_context=member_context,
        member_knowledge=member_knowledge,
        team_id=auth.team_id,
    )

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
def patch_ticket(ticket_id: str, body: TicketPatch, auth: TeamAuth):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Nada que actualizar")

    sb = services.get_supabase()
    current = tenancy.assert_team_owns_ticket(sb, auth.team_id, ticket_id)  # type: ignore[arg-type]
    previous_status = current.get("status") if "status" in updates else None

    res = sb.table("tickets").update(updates).eq("id", ticket_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")

    ticket_row = res.data[0]
    if "status" in updates:
        services.log_ticket_status_event(
            ticket_id, previous_status, updates["status"], source="web"
        )
        # Cuando un ticket pasa a done, appendeá la función al MD del proyecto (changelog).
        if (
            updates["status"] == "done"
            and previous_status != "done"
            and ticket_row.get("project_id")
            and auth.team_id
        ):
            try:
                knowledge.append_ticket_to_project_md(
                    auth.team_id,
                    ticket_row["project_id"],
                    ticket_row,
                    created_by_id=auth.user_id,
                )
            except Exception:  # noqa: BLE001
                logger.exception("Failed to sync ticket %s into project MD", ticket_id)

    return ticket_row


# ---------- 5. Aprobar ----------

@app.post("/api/approve/{requirement_id}", response_model=ApproveResponse)
def approve(requirement_id: str, auth: TeamAuth):
    sb = services.get_supabase()
    _get_requirement_or_404(requirement_id, auth.team_id)

    update_payload: dict = {
        "status": "approved",
        "approved_at": datetime.now(timezone.utc).isoformat(),
    }
    # approved_by_id espera members.id; solo setear si el user_id parece un member uuid.
    # En demo usamos demo-user; en prod se puede linkear vía members.user_id.

    req_res = (
        sb.table("requirements")
        .update(update_payload)
        .eq("id", requirement_id)
        .execute()
    )
    if not req_res.data:
        raise HTTPException(status_code=404, detail="Requirement no encontrado")

    tickets = _get_tickets_by_requirement(requirement_id)
    payload = {
        "requirement": req_res.data[0],
        "tickets": tickets,
        "approved_by": {"user_id": auth.user_id, "email": auth.email},
    }
    notified = services.notify_n8n(payload)

    approval_id = services.record_approval(
        requirement_id, n8n_notified=notified, n8n_ok=notified, webhook_payload=payload
    )
    services.create_notifications(approval_id, tickets)

    audit.log_audit(
        team_id=auth.team_id,
        user_id=auth.user_id,
        action="plan.approve",
        resource_type="requirement",
        resource_id=requirement_id,
        meta={"n8n_notified": notified},
    )

    return ApproveResponse(status="approved", requirement_id=requirement_id, n8n_notified=notified)


# ---------- 6. Miembros del equipo ----------

@app.get("/api/members")
def list_members(auth: TeamAuth):
    """Lista los miembros del equipo (con sus skills) para la vista de Equipo del frontend."""
    rows = tenancy.members_for_team(services.get_supabase(), auth.team_id)  # type: ignore[arg-type]
    return _members_with_dynamic_load(rows)


# ---------- 7. Proyectos disponibles ----------

@app.get("/api/projects")
def list_projects(auth: TeamAuth):
    """Lista proyectos del team activo."""
    return tenancy.projects_for_team(services.get_supabase(), auth.team_id)  # type: ignore[arg-type]


@app.post("/api/projects", status_code=201)
def create_project(body: CreateProjectRequest, auth: TeamAuth):
    """Crea un proyecto en el team activo."""
    sb = services.get_supabase()
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nombre de proyecto requerido")
    code = (body.code or "").strip() or None
    if body.owner_id:
        tenancy.assert_team_owns_member(sb, auth.team_id, body.owner_id)  # type: ignore[arg-type]
    payload = {
        "team_id": auth.team_id,
        "name": name,
        "code": code,
        "description": body.description,
        "business_area": body.business_area,
        "status": body.status,
        "owner_id": body.owner_id,
    }
    try:
        res = sb.table("projects").insert(payload).execute()
    except Exception as exc:  # noqa: BLE001
        logger.exception("create_project failed")
        detail = str(exc)
        if "unique" in detail.lower() or "duplicate" in detail.lower():
            raise HTTPException(status_code=409, detail="Ya existe un proyecto con ese código") from exc
        raise HTTPException(status_code=500, detail="No se pudo crear el proyecto") from exc
    project = res.data[0]
    if body.owner_id:
        try:
            sb.table("project_members").upsert(
                {
                    "project_id": project["id"],
                    "member_id": body.owner_id,
                    "role": "owner",
                }
            ).execute()
        except Exception:  # noqa: BLE001
            logger.debug("project_members upsert skipped", exc_info=True)
    return project


# ---------- 8. Workspace/proyecto/tickets/comentarios ----------

@app.get("/api/workspace")
def workspace(auth: TeamAuth):
    """Snapshot completo para hidratar el frontend desde Supabase (scoped por team)."""
    sb = services.get_supabase()
    team_id = auth.team_id  # type: ignore[assignment]
    members = _members_with_dynamic_load(tenancy.members_for_team(sb, team_id))
    projects = tenancy.projects_for_team(sb, team_id)
    project_ids = [p["id"] for p in projects]

    requirements: list[dict] = []
    if project_ids:
        requirements = (
            sb.table("requirements")
            .select("id, project_id, meeting_id, title, summary, status, created_at")
            .in_("project_id", project_ids)
            .order("created_at", desc=True)
            .execute()
            .data
            or []
        )
        requirements = _enrich_requirements_with_transcripts(sb, requirements)
    tickets = _tickets_with_skill_codes(project_ids=project_ids)
    return {"members": members, "projects": projects, "requirements": requirements, "tickets": tickets}


@app.get("/api/projects/{project_id}/work")
def project_work(project_id: str, auth: TeamAuth):
    sb = services.get_supabase()
    project = tenancy.assert_team_owns_project(sb, auth.team_id, project_id)  # type: ignore[arg-type]
    requirements = (
        sb.table("requirements")
        .select("id, project_id, meeting_id, title, summary, status, created_at")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    requirements = _enrich_requirements_with_transcripts(sb, requirements)
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
    return {"project": project, "requirements": requirements, "meetings": meetings, "tickets": tickets}


@app.post("/api/tickets")
def create_ticket(body: CreateTicketRequest, auth: TeamAuth):
    sb = services.get_supabase()
    requirement = _get_requirement_or_404(body.requirement_id, auth.team_id)
    project_id = body.project_id or requirement["project_id"]
    tenancy.assert_team_owns_project(sb, auth.team_id, project_id)  # type: ignore[arg-type]
    if body.assignee_id:
        tenancy.assert_team_owns_member(sb, auth.team_id, body.assignee_id)  # type: ignore[arg-type]
    if body.parent_ticket_id:
        parent = tenancy.assert_team_owns_ticket(sb, auth.team_id, body.parent_ticket_id)  # type: ignore[arg-type]
        if parent.get("requirement_id") != body.requirement_id:
            raise HTTPException(status_code=400, detail="La subtarea debe pertenecer al mismo requirement")
        project_id = parent.get("project_id") or project_id
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
        "parent_ticket_id": body.parent_ticket_id,
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
def list_ticket_comments(ticket_id: str, auth: TeamAuth):
    tenancy.assert_team_owns_ticket(services.get_supabase(), auth.team_id, ticket_id)  # type: ignore[arg-type]
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
def create_ticket_comment(ticket_id: str, body: TicketCommentRequest, auth: TeamAuth):
    sb = services.get_supabase()
    ticket = tenancy.assert_team_owns_ticket(sb, auth.team_id, ticket_id)  # type: ignore[arg-type]
    text = body.body.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Comentario vacío")
    # Prefer explicit author_id; fall back to auth user when it looks like a member id.
    author_id = body.author_id
    res = sb.table("project_knowledge_sources").insert(
        {
            "project_id": ticket["project_id"],
            "title": f"Comentario: {(ticket.get('title') or '')[:60]}",
            "source_type": "manual_note",
            "raw_content": text,
            "summary": text[:240],
            "created_by_id": author_id,
            "metadata": {
                "ticket_id": ticket_id,
                "kind": "ticket_comment",
                "auth_user_id": auth.user_id,
            },
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
def report_client_error(body: ClientErrorReport, request: Request, auth: AuthDep):
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
        team_id=auth.team_id,
    )
    return {"logged": True}


@app.get("/api/errors")
def list_errors(
    auth: Annotated[AuthContext, Depends(require_role("owner", "admin"))],
    limit: int = 50,
    source: str | None = None,
):
    """Últimos errores registrados (backend + frontend) para el panel de Sistema."""
    return services.list_error_logs(limit=limit, source=source, team_id=auth.team_id)
