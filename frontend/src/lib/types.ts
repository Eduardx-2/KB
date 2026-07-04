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
}

export interface Requirement {
  id: string;
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

export type RunMode = "mock" | "live";

export interface HealthState {
  status: "ok" | "error" | "unknown";
  version?: string;
  mode: RunMode;
  checked_at: string | null;
}
