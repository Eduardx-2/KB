/**
 * Tipos alineados al CONTRATO congelado en PROYECTO.md (sección 4).
 * Cualquier cambio de forma acá debe reflejar un cambio acordado por el equipo.
 */

export type Skill = "frontend" | "backend" | "data" | "qa" | "devops";

export type Priority = "low" | "medium" | "high";

export type TicketStatus = "backlog" | "todo" | "in_progress" | "done";

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
