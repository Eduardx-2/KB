"""Modelos Pydantic — el CONTRATO congelado. Se usan en FastAPI y en OpenAI Structured Outputs."""
from typing import Literal, Optional

from pydantic import BaseModel, Field


# Skills de dominio (Maxxi + genéricos). Preferir el más específico (erp_exactus > backend).
RequiredSkill = Literal[
    "frontend",
    "backend",
    "data",
    "qa",
    "devops",
    "csharp",
    "sql",
    "erp_exactus",
    "erp_softland",
    "filament",
    "metabase",
    "networking",
    "docker",
    "apps",
    "web_design",
    "maxxi_web",
]


# ---------- Salidas de agentes (van a OpenAI Structured Outputs) ----------

class Ticket(BaseModel):
    title: str
    description: str
    priority: Literal["low", "medium", "high"]
    estimate_hours: int
    required_skill: RequiredSkill


WorkPhase = Literal["discovery", "ux", "design", "frontend", "backend", "db", "qa", "deploy"]


class GranularTicket(BaseModel):
    title: str
    description: str = Field(
        description="Proceso AS-IS → TO-BE, sistema afectado, quién lo usa y entregable concreto"
    )
    priority: Literal["low", "medium", "high"]
    estimate_hours: int = Field(ge=1, le=40)
    required_skill: RequiredSkill
    work_phase: WorkPhase
    acceptance_criteria: str = Field(
        description="Checklist verificable con al menos 3 bullets (- item)"
    )
    depends_on_titles: list[str] = Field(default_factory=list)
    parent_title: Optional[str] = Field(
        default=None,
        description="Si es subtarea, título exacto del ticket padre (épica). Null = ticket raíz.",
    )
    knowledge_evidence: str = Field(
        default="",
        description="Cita corta literal del transcript o RAG que justifica el ticket",
    )
    is_greenfield: bool = False
    related_db_tables: list[str] = Field(default_factory=list)


class MeetingAgentOutput(BaseModel):
    summary: str
    tickets: list[GranularTicket] = Field(
        min_length=4,
        max_length=24,
        description=(
            "2–5 épicas raíz (parent_title=null) + subtareas con parent_title. "
            "Total 4–16 ítems; no saturar el board con acciones atómicas sueltas."
        ),
    )


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
    required_skill: RequiredSkill = "frontend"
    status: Literal["backlog", "todo", "in_progress", "done"] = "backlog"
    assignee_id: Optional[str] = None
    deadline: Optional[str] = None
    parent_ticket_id: Optional[str] = None


class CreateProjectRequest(BaseModel):
    name: str
    code: Optional[str] = None
    description: Optional[str] = None
    business_area: Optional[str] = None
    owner_id: Optional[str] = None
    status: Literal["active", "on_hold", "completed", "archived"] = "active"


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


# ---------- Knowledge Ops: capacity / duties / absences ----------

class MemberDutyIn(BaseModel):
    title: str
    description: Optional[str] = None
    duty_type: Literal["recurring", "monitoring", "oncall", "admin"] = "recurring"
    hours_per_week: Optional[float] = None
    load_pct: int = Field(default=0, ge=0, le=100)
    is_active: bool = True


class MemberDutyOut(MemberDutyIn):
    id: str
    member_id: str
    team_id: str
    created_at: Optional[str] = None


class MemberAbsenceIn(BaseModel):
    start_date: str  # ISO date YYYY-MM-DD
    end_date: str
    reason: Optional[str] = None
    status: Literal["pending", "approved", "cancelled"] = "pending"


class MemberAbsenceOut(MemberAbsenceIn):
    id: str
    member_id: str
    team_id: str
    created_at: Optional[str] = None


class MemberCapacityIn(BaseModel):
    weekly_hours: int = Field(default=40, gt=0)
    available_from: Optional[str] = None
    available_to: Optional[str] = None
    absence_note: Optional[str] = None


class MemberCapacityOut(MemberCapacityIn):
    member_id: str
    team_id: str
    updated_at: Optional[str] = None


# ---------- Knowledge Ops: project structure ----------

class ProjectModuleIn(BaseModel):
    code: Optional[str] = None
    name: str
    summary: Optional[str] = None
    md_body: str = ""
    expected_outcomes: Optional[str] = None
    status: Literal["planned", "active", "deprecated"] = "active"
    owner_member_id: Optional[str] = None


class ProjectModuleOut(ProjectModuleIn):
    id: str
    project_id: str
    team_id: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ProjectModulePatch(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    summary: Optional[str] = None
    md_body: Optional[str] = None
    expected_outcomes: Optional[str] = None
    status: Optional[Literal["planned", "active", "deprecated"]] = None
    owner_member_id: Optional[str] = None


class ProjectStakeholderIn(BaseModel):
    member_id: str
    role_in_project: str
    importance_pct: int = Field(default=50, ge=0, le=100)
    md_notes: Optional[str] = None


class ProjectStakeholderOut(ProjectStakeholderIn):
    id: str
    project_id: str
    created_at: Optional[str] = None


class ProjectDocIn(BaseModel):
    title: str
    md_body: str
    source_type: Literal[
        "manual_note",
        "meeting_recap",
        "document",
        "url",
        "ticket_history",
        "decision",
        "project_overview",
        "module_spec",
        "expected_outcomes",
        "stakeholders",
        "db_schema",
        "architecture",
    ] = "document"
    source_id: Optional[str] = None
    mode: Literal["replace", "append"] = "replace"


class ProjectDocUpdateIn(BaseModel):
    title: Optional[str] = None
    md_body: Optional[str] = None
    mode: Literal["replace", "append"] = "replace"


class ProjectDocOut(BaseModel):
    id: str
    project_id: str
    title: str
    source_type: str
    raw_content: str = ""
    summary: Optional[str] = None
    updated_at: Optional[str] = None
    created_at: Optional[str] = None


# ---------- Knowledge Ops: graph / retrieval ----------

class GraphNodeOut(BaseModel):
    id: str
    team_id: str
    project_id: Optional[str] = None
    node_type: str
    label: str
    canonical_key: Optional[str] = None
    source_ref_type: Optional[str] = None
    source_ref_id: Optional[str] = None
    metadata: Optional[dict] = None


class GraphEdgeOut(BaseModel):
    id: str
    team_id: str
    from_node_id: str
    to_node_id: str
    relation: str
    weight: Optional[float] = None
    evidence_text: Optional[str] = None
    confidence_pct: Optional[int] = None
    created_by: Optional[str] = None


class KnowledgeSummaryOut(BaseModel):
    project_id: str
    overview_md: str = ""
    modules: list[ProjectModuleOut] = Field(default_factory=list)
    stakeholders: list[ProjectStakeholderOut] = Field(default_factory=list)
    sources: list[dict] = Field(default_factory=list)
    chunks_count: int = 0
    nodes: list[GraphNodeOut] = Field(default_factory=list)
    edges: list[GraphEdgeOut] = Field(default_factory=list)


class MemberDocsIn(BaseModel):
    md_body: str


class MemberDocsOut(BaseModel):
    member_id: str
    overview_md: str = ""
    updated_at: Optional[str] = None


class MemberProjectNoteOut(BaseModel):
    project_id: str
    project_name: str
    project_code: Optional[str] = None
    role_in_project: str = "contributor"
    md_notes: str = ""
    importance_pct: int = 50


class MemberProjectNoteIn(BaseModel):
    md_notes: str = ""
    role_in_project: Optional[str] = None
    importance_pct: Optional[int] = Field(default=None, ge=0, le=100)


class MemberProjectAssignIn(BaseModel):
    project_id: str
    role: Literal["owner", "contributor", "stakeholder"] = "contributor"
    role_in_project: Optional[str] = None


# ---------- Knowledge Ops: reorg agent ----------

ReorgTrigger = Literal["absence", "overload", "deadline_risk"]
ReorgAction = Literal["keep", "reschedule", "reassign", "postpone", "drop"]
ReorgStatus = Literal["draft", "pending_boss", "approved", "rejected", "applied"]


class ReorgProposalItem(BaseModel):
    """Structured output item from the reorg agent."""
    ticket_title: str
    action: ReorgAction
    new_assignee_name: Optional[str] = None
    new_scheduled_date: Optional[str] = None  # ISO date
    new_deadline: Optional[str] = None
    rationale: str


class ReorgProposalOutput(BaseModel):
    """Structured output from the reorg agent."""
    summary_md: str
    overall_risk_pct: int = Field(ge=0, le=100)
    items: list[ReorgProposalItem]


class ReorgProposalItemOut(BaseModel):
    id: str
    proposal_id: str
    ticket_id: str
    action: ReorgAction
    new_assignee_id: Optional[str] = None
    new_scheduled_date: Optional[str] = None
    new_deadline: Optional[str] = None
    rationale: Optional[str] = None


class ReorgProposalOut(BaseModel):
    id: str
    team_id: str
    member_id: str
    triggered_by: ReorgTrigger
    reason_md: str
    status: ReorgStatus
    proposed_by_agent: bool = True
    boss_decision_note: Optional[str] = None
    decided_by_id: Optional[str] = None
    decided_at: Optional[str] = None
    created_at: Optional[str] = None
    items: list[ReorgProposalItemOut] = Field(default_factory=list)


class ReorgDecideIn(BaseModel):
    status: Literal["approved", "rejected"]
    boss_decision_note: Optional[str] = None
    decided_by_id: Optional[str] = None


class ReorgDecideRequest(BaseModel):
    """Frontend-facing decide payload."""
    decision: Literal["approved", "rejected"]
    note: Optional[str] = None


class ReorgTriggerRequest(BaseModel):
    member_id: str
    absence_id: Optional[str] = None


class ReorgAgentRequest(BaseModel):
    member_id: str
    trigger: ReorgTrigger
    reason_md: str
