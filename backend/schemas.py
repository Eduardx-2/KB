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


# ---------- Nuevos endpoints de contexto ----------

class CreateRequirementRequest(BaseModel):
    title: str
    project_id: Optional[str] = None


class CreateRequirementResponse(BaseModel):
    id: str
    title: str
    project_id: str
    status: str


class MemberOut(BaseModel):
    id: str
    name: str
    role: Optional[str] = None
    email: Optional[str] = None
    current_load: int = 0
    is_manager: bool = False
    skills: list[str] = []


class ProjectOut(BaseModel):
    id: str
    name: str
    status: Optional[str] = None
    business_area: Optional[str] = None
    target_date: Optional[str] = None
