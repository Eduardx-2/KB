"""Modelos Pydantic — el CONTRATO congelado. Se usan en FastAPI y en OpenAI Structured Outputs."""
from typing import Literal, Optional

from pydantic import BaseModel, Field


# ---------- Salidas de agentes (van a OpenAI Structured Outputs) ----------

class Ticket(BaseModel):
    title: str
    description: str
    priority: Literal["low", "medium", "high"]
    estimate_hours: int
    required_skill: Literal["frontend", "backend", "data", "qa", "devops"]


class MeetingAgentOutput(BaseModel):
    summary: str
    tickets: list[Ticket]


class AssignmentRecommendation(BaseModel):
    ticket_title: str
    assignee_name: str
    risk_pct: int = Field(ge=0, le=100)
    reasoning: str


class AssignmentAgentOutput(BaseModel):
    recommendations: list[AssignmentRecommendation]


# ---------- Requests / responses de la API ----------

class TranscribeResponse(BaseModel):
    text: str
    meeting_id: Optional[str] = None


class MeetingAgentRequest(BaseModel):
    transcript: str
    requirement_id: str
    project_id: Optional[str] = None


class AssignmentAgentRequest(BaseModel):
    requirement_id: str


class CreateRequirementRequest(BaseModel):
    title: Optional[str] = None
    project_id: Optional[str] = None


class CreateRequirementResponse(BaseModel):
    id: str
    project_id: str
    title: Optional[str] = None
    status: str


class TicketPatch(BaseModel):
    """Todos opcionales: solo se actualiza lo que venga."""
    status: Optional[Literal["backlog", "todo", "in_progress", "done"]] = None
    assignee_id: Optional[str] = None
    deadline: Optional[str] = None  # ISO date "YYYY-MM-DD"


class CreateTicketRequest(BaseModel):
    requirement_id: str
    project_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    priority: Literal["low", "medium", "high"] = "medium"
    estimate_hours: int = Field(default=4, gt=0)
    required_skill: Literal["frontend", "backend", "data", "qa", "devops"] = "frontend"
    status: Literal["backlog", "todo", "in_progress", "done"] = "backlog"
    assignee_id: Optional[str] = None
    deadline: Optional[str] = None


class TicketCommentRequest(BaseModel):
    body: str
    author_id: Optional[str] = None


class TicketCommentResponse(BaseModel):
    id: str
    ticket_id: str
    body: str
    author_id: Optional[str] = None
    created_at: Optional[str] = None


class TicketOut(BaseModel):
    id: str
    requirement_id: str
    project_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    priority: Optional[str] = None
    estimate_hours: Optional[int] = None
    required_skill: Optional[str] = None
    risk_pct: Optional[int] = None
    assignee_id: Optional[str] = None
    status: Optional[str] = None
    deadline: Optional[str] = None
    assignment_reasoning: Optional[str] = None


class ProjectWorkResponse(BaseModel):
    project: dict
    requirements: list[dict]
    meetings: list[dict]
    tickets: list[dict]


class ApproveResponse(BaseModel):
    status: str
    requirement_id: str
    n8n_notified: bool


class HealthResponse(BaseModel):
    status: str
    version: str


# ---------- Error tracking ----------

class ClientErrorReport(BaseModel):
    """Error del frontend reportado al backend (el front no escribe directo a la DB)."""
    message: str
    error_type: Optional[str] = None
    severity: Optional[Literal["info", "warning", "error", "critical"]] = "error"
    http_status: Optional[int] = None
    http_method: Optional[str] = None
    path: Optional[str] = None
    stack: Optional[str] = None
    context: Optional[dict] = None
    request_id: Optional[str] = None


# ---------- SaaS auth / billing ----------

class AuthMeResponse(BaseModel):
    user_id: str
    email: Optional[str] = None
    team_id: Optional[str] = None
    role: Optional[str] = None
    team: Optional[dict] = None
    is_authenticated: bool = False


class CreateTeamRequest(BaseModel):
    name: str
    slug: Optional[str] = None
    billing_email: Optional[str] = None


class TeamOut(BaseModel):
    id: str
    name: str
    slug: str
    role: Optional[str] = None
    plan_tier: Optional[str] = None
    status: Optional[str] = None
    created_at: Optional[str] = None


class InviteRequest(BaseModel):
    email: str
    role: Literal["owner", "admin", "member", "viewer"] = "member"


class InviteAcceptRequest(BaseModel):
    token: str


class UsageResponse(BaseModel):
    team_id: str
    period_start: str
    team: dict
    usage: dict


class PlanOut(BaseModel):
    id: str
    code: str
    name: str
    price_cents_monthly: Optional[int] = None
    max_members: Optional[int] = None
    max_meetings_per_month: Optional[int] = None
    max_tokens_per_month: Optional[int] = None
    features: Optional[dict] = None
