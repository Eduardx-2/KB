/**
 * Tipos alineados al CONTRATO congelado en PROYECTO.md (sección 4).
 * Cualquier cambio de forma acá debe reflejar un cambio acordado por el equipo.
 */

export type Skill =
  | "frontend"
  | "backend"
  | "data"
  | "qa"
  | "devops"
  | "csharp"
  | "sql"
  | "erp_exactus"
  | "erp_softland"
  | "filament"
  | "metabase"
  | "networking"
  | "docker"
  | "apps"
  | "web_design"
  | "maxxi_web";

export type Priority = "low" | "medium" | "high";

export type TicketStatus = "backlog" | "todo" | "in_progress" | "done";

export type WorkPhase =
  | "discovery"
  | "ux"
  | "design"
  | "frontend"
  | "backend"
  | "db"
  | "qa"
  | "deploy";

export type DutyType = "recurring" | "monitoring" | "oncall" | "admin";

export type AbsenceStatus = "pending" | "approved" | "cancelled";

export type ReorgStatus = "draft" | "pending_boss" | "approved" | "rejected" | "applied";

export type ReorgAction = "keep" | "reschedule" | "reassign" | "postpone" | "drop";

export type RequirementStatus = "draft" | "extracted" | "approved";

export interface Member {
  id: string;
  name: string;
  role: string;
  skills: Skill[];
  current_load: number; // 0-100
  team_id: string;
  is_manager?: boolean; // presente cuando los miembros vienen del backend real
  active_hours?: number;
  active_ticket_count?: number;
  effective_load?: number;
}

export interface Project {
  id: string;
  team_id: string;
  code?: string | null;
  name: string;
  description?: string | null;
  business_area?: string | null;
  status?: string | null;
  owner_id?: string | null;
  target_date?: string | null;
  created_at?: string | null;
}

export interface Requirement {
  id: string;
  project_id?: string;
  meeting_id?: string | null;
  title: string;
  raw_transcript: string;
  summary: string;
  status: RequirementStatus;
  created_at: string;
  team_id: string;
}

export interface Ticket {
  id: string;
  requirement_id: string;
  project_id?: string;
  project_name?: string;
  title: string;
  description: string;
  priority: Priority;
  estimate_hours: number;
  required_skill: Skill;
  risk_pct: number; // 0-100
  reasoning?: string;
  assignee_id: string | null;
  status: TicketStatus;
  deadline: string | null;
  team_id: string;
  work_phase?: WorkPhase | null;
  acceptance_criteria?: string | null;
  parent_ticket_id?: string | null;
  scheduled_date?: string | null;
  is_greenfield?: boolean;
  related_db_tables?: string[] | null;
}

export interface TicketComment {
  id: string;
  ticket_id: string;
  body: string;
  author_id?: string | null;
  created_at?: string | null;
}

export interface CreateTicketInput {
  requirement_id: string;
  project_id?: string;
  title: string;
  description?: string;
  priority: Priority;
  estimate_hours: number;
  required_skill: Skill;
  status: TicketStatus;
  assignee_id?: string | null;
  deadline?: string | null;
  parent_ticket_id?: string | null;
}

export interface CreateProjectInput {
  name: string;
  code?: string;
  description?: string;
  business_area?: string;
  owner_id?: string | null;
}

export interface AgentLog {
  id: string;
  agent: "meeting" | "assignment" | "transcribe" | "approve";
  latency_ms: number;
  model: string;
  ok: boolean;
  created_at: string;
}

export interface TicketDraft {
  title: string;
  description: string;
  priority: Priority;
  estimate_hours: number;
  required_skill: Skill;
  work_phase?: WorkPhase;
  acceptance_criteria?: string;
}

export interface MeetingAgentOutput {
  summary: string;
  tickets: TicketDraft[];
}

export interface AssignmentRecommendation {
  ticket_title: string;
  assignee_name: string;
  risk_pct: number;
  reasoning: string;
}

export interface AssignmentAgentOutput {
  recommendations: AssignmentRecommendation[];
}

export interface ErrorLog {
  id: string;
  source: "backend" | "frontend" | "worker";
  severity: "info" | "warning" | "error" | "critical";
  request_id: string | null;
  http_status: number | null;
  http_method: string | null;
  path: string | null;
  error_type: string | null;
  message: string;
  stack: string | null;
  context: Record<string, unknown> | null;
  user_agent: string | null;
  created_at: string;
}

export type RunMode = "mock" | "live";

export interface HealthState {
  status: "ok" | "error" | "unknown";
  version?: string;
  mode: RunMode;
  checked_at: string | null;
}

/** Roles de membresía SaaS (team_memberships.role). */
export type MembershipRole = "owner" | "admin" | "member" | "viewer";

export interface Team {
  id: string;
  name: string;
  slug: string;
  role?: MembershipRole | string | null;
  plan_tier?: string | null;
  status?: string | null;
  created_at?: string | null;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  price_cents_monthly?: number | null;
  max_members?: number | null;
  max_meetings_per_month?: number | null;
  max_tokens_per_month?: number | null;
  features?: Record<string, unknown> | null;
}

export interface UsageSummary {
  team_id: string;
  period_start: string;
  team: {
    id?: string;
    name?: string;
    plan_tier?: string | null;
    max_meetings_per_month?: number | null;
    max_tokens_per_month?: number | null;
    max_members?: number | null;
    [key: string]: unknown;
  };
  usage: Record<string, number>;
}

export interface MemberDuty {
  id: string;
  member_id: string;
  team_id: string;
  title: string;
  description?: string | null;
  duty_type: DutyType;
  hours_per_week?: number | null;
  load_pct: number;
  is_active: boolean;
  created_at?: string | null;
}

export interface MemberAbsence {
  id: string;
  member_id: string;
  team_id: string;
  start_date: string;
  end_date: string;
  reason?: string | null;
  status: AbsenceStatus;
  created_at?: string | null;
}

export interface MemberCapacity {
  member_id: string;
  team_id: string;
  weekly_hours: number;
  available_from?: string | null;
  available_to?: string | null;
  absence_note?: string | null;
  updated_at?: string | null;
}

export interface ProjectModule {
  id: string;
  project_id: string;
  team_id: string;
  code?: string | null;
  name: string;
  summary?: string | null;
  md_body: string;
  expected_outcomes?: string | null;
  status?: "planned" | "active" | "deprecated" | null;
  owner_member_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ProjectStakeholder {
  id: string;
  project_id: string;
  member_id: string;
  role_in_project: string;
  importance_pct: number;
  md_notes?: string | null;
  created_at?: string | null;
}

export interface GraphNode {
  id: string;
  team_id?: string;
  project_id?: string | null;
  node_type: string;
  label: string;
  canonical_key?: string | null;
  source_ref_type?: string | null;
  source_ref_id?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
}

export interface GraphEdge {
  id: string;
  team_id?: string;
  from_node_id: string;
  to_node_id: string;
  relation: string;
  weight?: number | null;
  evidence_text?: string | null;
  confidence_pct?: number | null;
  created_by?: string | null;
  created_at?: string | null;
}

export interface KnowledgeSummary {
  project_id: string;
  overview_md: string;
  modules: ProjectModule[];
  stakeholders: ProjectStakeholder[];
  sources?: Array<{ id: string; title: string; source_type: string; summary?: string | null }>;
  chunks_count?: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface MemberDocs {
  member_id: string;
  overview_md: string;
  updated_at?: string | null;
}

export interface MemberProjectNote {
  project_id: string;
  project_name: string;
  project_code?: string | null;
  role_in_project: string;
  md_notes: string;
  importance_pct: number;
}

export interface ReorgProposalItem {
  id: string;
  proposal_id: string;
  ticket_id: string;
  ticket_title?: string;
  action: ReorgAction;
  new_assignee_id?: string | null;
  new_scheduled_date?: string | null;
  new_deadline?: string | null;
  rationale?: string | null;
}

export interface ReorgProposal {
  id: string;
  team_id: string;
  member_id: string;
  member_name?: string;
  triggered_by: "absence" | "overload" | "deadline_risk";
  reason_md: string;
  status: ReorgStatus;
  proposed_by_agent?: boolean;
  boss_decision_note?: string | null;
  decided_by_id?: string | null;
  decided_at?: string | null;
  created_at?: string | null;
  items?: ReorgProposalItem[];
}
