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
