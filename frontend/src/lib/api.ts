import { useAuthStore } from "./auth-store";
import { getAccessToken } from "./supabase";
import { useAppStore } from "./store";
import { simulateAssignmentAgent, simulateMeetingAgent } from "./mock-engine";
import {
  mockGetMemberDuties,
  mockCreateMemberDuty,
  mockDeleteMemberDuty,
  mockGetMemberAbsences,
  mockCreateMemberAbsence,
  mockGetMemberCapacity,
  mockUpdateMemberCapacity,
  mockGetProjectModules,
  mockCreateProjectModule,
  mockUpdateProjectModule,
  mockGetProjectStakeholders,
  mockCreateProjectStakeholder,
  mockUploadProjectDoc,
  mockFetchProjectKnowledge,
  mockGetReorgProposals,
  mockDecideReorgProposal,
  mockTriggerReorgAgent,
  mockFetchMemberDocs,
  mockSaveMemberDocs,
} from "./mock-engine";
import { sleep } from "./utils";
import type {
  AssignmentAgentOutput,
  CreateTicketInput,
  CreateProjectInput,
  ErrorLog,
  HealthState,
  MeetingAgentOutput,
  Member,
  Plan,
  Project,
  Requirement,
  RunMode,
  Team,
  Ticket,
  TicketComment,
  UsageSummary,
  MemberDuty,
  MemberAbsence,
  MemberCapacity,
  ProjectModule,
  ProjectStakeholder,
  KnowledgeSummary,
  MemberDocs,
  MemberProjectNote,
  ReorgProposal,
  DutyType,
} from "./types";

/**
 * Capa de acceso a datos. Sigue la regla del CONTRATO: el frontend nunca
 * habla directo con OpenAI/ElevenLabs; siempre pasa por el backend FastAPI.
 *
 * Si `NEXT_PUBLIC_API_URL` está configurada, se usa el backend real.
 * Si no responde (o no está configurada), cae a una simulación local
 * fiel al contrato — así el equipo puede demostrar el flujo completo
 * aunque el backend de R1 no esté disponible en ese momento.
 */

export const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "";
export const HAS_LIVE_BACKEND = Boolean(API_BASE);

/** Headers de auth SaaS: Bearer JWT + X-Team-Id del store. */
export async function authHeaders(extra?: HeadersInit): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};

  if (extra) {
    const normalized = new Headers(extra);
    normalized.forEach((value, key) => {
      headers[key] = value;
    });
  }

  try {
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // sin token
  }

  try {
    const teamId = useAuthStore.getState().teamId;
    if (teamId) headers["X-Team-Id"] = teamId;
  } catch {
    // store no disponible
  }

  return headers;
}

async function fetchWithTimeout(input: string, init: RequestInit = {}, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = await authHeaders(init.headers);
    // FormData: no forzar Content-Type (el browser pone el boundary)
    if (init.body instanceof FormData) {
      delete headers["Content-Type"];
    }
    return await fetch(input, { ...init, headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function normalizeMember(raw: Record<string, unknown>): Member {
  return {
    id: String(raw.id),
    name: String(raw.name ?? "Sin nombre"),
    role: String(raw.role ?? ""),
    skills: (Array.isArray(raw.skills) ? raw.skills : []) as Member["skills"],
    current_load: Number(raw.current_load ?? raw.effective_load ?? 0),
    team_id: String(raw.team_id ?? "live"),
    is_manager: Boolean(raw.is_manager),
    active_hours: raw.active_hours != null ? Number(raw.active_hours) : undefined,
    active_ticket_count: raw.active_ticket_count != null ? Number(raw.active_ticket_count) : undefined,
    effective_load: raw.effective_load != null ? Number(raw.effective_load) : undefined,
  };
}

function normalizeTicket(raw: Record<string, unknown>): Ticket {
  return {
    id: String(raw.id),
    requirement_id: String(raw.requirement_id),
    project_id: raw.project_id ? String(raw.project_id) : undefined,
    project_name: raw.project_name ? String(raw.project_name) : undefined,
    title: String(raw.title ?? "Ticket sin título"),
    description: String(raw.description ?? ""),
    priority: (raw.priority as Ticket["priority"]) ?? "medium",
    estimate_hours: Number(raw.estimate_hours ?? 4),
    required_skill: (raw.required_skill as Ticket["required_skill"]) ?? "frontend",
    risk_pct: Number(raw.risk_pct ?? 0),
    reasoning: (raw.assignment_reasoning as string | undefined) ?? (raw.reasoning as string | undefined),
    assignee_id: raw.assignee_id ? String(raw.assignee_id) : null,
    status: (raw.status as Ticket["status"]) ?? "backlog",
    deadline: raw.deadline ? String(raw.deadline) : null,
    team_id: String(raw.team_id ?? "live"),
    work_phase: (raw.work_phase as Ticket["work_phase"]) ?? null,
    acceptance_criteria: raw.acceptance_criteria ? String(raw.acceptance_criteria) : null,
    parent_ticket_id: raw.parent_ticket_id ? String(raw.parent_ticket_id) : null,
    scheduled_date: raw.scheduled_date ? String(raw.scheduled_date) : null,
    is_greenfield: raw.is_greenfield != null ? Boolean(raw.is_greenfield) : undefined,
    related_db_tables: Array.isArray(raw.related_db_tables) ? (raw.related_db_tables as string[]) : null,
  };
}

function normalizeRequirement(raw: Record<string, unknown>): Requirement {
  return {
    id: String(raw.id),
    project_id: raw.project_id ? String(raw.project_id) : undefined,
    meeting_id: raw.meeting_id ? String(raw.meeting_id) : null,
    title: String(raw.title ?? "Reunión sin título"),
    raw_transcript: String(raw.raw_transcript ?? ""),
    summary: String(raw.summary ?? ""),
    status: (raw.status as Requirement["status"]) ?? "draft",
    created_at: String(raw.created_at ?? new Date().toISOString()),
    team_id: String(raw.team_id ?? "live"),
  };
}

export async function checkHealth(): Promise<HealthState> {
  const checked_at = new Date().toISOString();
  if (!HAS_LIVE_BACKEND) {
    return { status: "ok", version: "mock", mode: "mock", checked_at };
  }
  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/health`, {}, 3500);
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    return { status: data.status === "ok" ? "ok" : "error", version: data.version, mode: "live", checked_at };
  } catch {
    return { status: "error", mode: "live", checked_at };
  }
}

async function readErrorDetail(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.detail === "string") return data.detail;
    if (Array.isArray(data?.detail)) return JSON.stringify(data.detail);
    return JSON.stringify(data);
  } catch {
    return res.statusText || String(res.status);
  }
}

export async function transcribeAudio(file: Blob): Promise<{ text: string; mode: RunMode }> {
  const start = performance.now();
  if (HAS_LIVE_BACKEND) {
    const form = new FormData();
    form.append("file", file, "grabacion.webm");
    // Audio largo (~8–15 min) puede tardar >20s en ElevenLabs; no abortar antes.
    const res = await fetchWithTimeout(`${API_BASE}/api/transcribe`, { method: "POST", body: form }, 180000);
    if (!res.ok) {
      useAppStore.getState().pushAgentLog({
        agent: "transcribe",
        latency_ms: Math.round(performance.now() - start),
        model: "scribe_v1",
        ok: false,
      });
      throw new Error(`Transcripción falló (${res.status}): ${await readErrorDetail(res)}`);
    }
    const data = await res.json();
    useAppStore.getState().pushAgentLog({
      agent: "transcribe",
      latency_ms: Math.round(performance.now() - start),
      model: "scribe_v1",
      ok: true,
    });
    return { text: data.text, mode: "live" };
  }

  await sleep(1400);
  useAppStore.getState().pushAgentLog({
    agent: "transcribe",
    latency_ms: Math.round(performance.now() - start),
    model: "scribe_v1 (mock)",
    ok: true,
  });
  return {
    text:
      "[Transcripción simulada — conectá NEXT_PUBLIC_API_URL para usar ElevenLabs real] " +
      "El audio grabado se procesaría acá con la misma calidad que un transcript pegado a mano.",
    mode: "mock",
  };
}

export async function runMeetingAgent(
  transcript: string,
  requirementId: string,
  projectId?: string
): Promise<{ output: MeetingAgentOutput; mode: RunMode }> {
  const start = performance.now();
  if (HAS_LIVE_BACKEND) {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/agents/meeting`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, requirement_id: requirementId, project_id: projectId }),
      },
      120000
    );
    if (!res.ok) {
      useAppStore.getState().pushAgentLog({
        agent: "meeting",
        latency_ms: Math.round(performance.now() - start),
        model: "gpt-4o-mini",
        ok: false,
      });
      throw new Error(`Meeting Agent falló (${res.status}): ${await readErrorDetail(res)}`);
    }
    const output: MeetingAgentOutput = await res.json();
    useAppStore.getState().pushAgentLog({
      agent: "meeting",
      latency_ms: Math.round(performance.now() - start),
      model: "gpt-4o-mini",
      ok: true,
    });
    return { output, mode: "live" };
  }

  await sleep(1700);
  const output = simulateMeetingAgent(transcript);
  useAppStore.getState().pushAgentLog({
    agent: "meeting",
    latency_ms: Math.round(performance.now() - start),
    model: "gpt-4o-mini (mock)",
    ok: true,
  });
  return { output, mode: "mock" };
}

export async function runAssignmentAgent(
  requirementId: string
): Promise<{ output: AssignmentAgentOutput; mode: RunMode }> {
  const start = performance.now();
  if (HAS_LIVE_BACKEND) {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/agents/assignment`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirement_id: requirementId }),
      },
      90000
    );
    if (!res.ok) {
      useAppStore.getState().pushAgentLog({
        agent: "assignment",
        latency_ms: Math.round(performance.now() - start),
        model: "gpt-4o-mini",
        ok: false,
      });
      throw new Error(`Assignment Agent falló (${res.status}): ${await readErrorDetail(res)}`);
    }
    const output: AssignmentAgentOutput = await res.json();
    useAppStore.getState().pushAgentLog({
      agent: "assignment",
      latency_ms: Math.round(performance.now() - start),
      model: "gpt-4o-mini",
      ok: true,
    });
    return { output, mode: "live" };
  }

  await sleep(1300);
  const state = useAppStore.getState();
  const tickets = state.ticketsFor(requirementId);
  const output = simulateAssignmentAgent(
    tickets.map((t) => ({
      title: t.title,
      description: t.description,
      priority: t.priority,
      estimate_hours: t.estimate_hours,
      required_skill: t.required_skill,
    })),
    state.members
  );
  useAppStore.getState().pushAgentLog({
    agent: "assignment",
    latency_ms: Math.round(performance.now() - start),
    model: "gpt-4o-mini (mock)",
    ok: true,
  });
  return { output, mode: "mock" };
}

export async function patchTicket(
  ticketId: string,
  patch: Record<string, unknown>
): Promise<{ mode: RunMode }> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/api/tickets/${ticketId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
        8000
      );
      if (!res.ok) throw new Error(String(res.status));
      return { mode: "live" };
    } catch {
      // sigue a la simulación
    }
  }
  await sleep(220);
  return { mode: "mock" };
}

/** Crea un requirement en Supabase via backend y devuelve el ID real. */
export async function createRequirementInBackend(
  title: string,
  projectId?: string
): Promise<{ id: string; mode: RunMode }> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/api/requirements`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, project_id: projectId }),
        },
        8000
      );
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      return { id: data.id, mode: "live" };
    } catch {
      // sigue a mock
    }
  }
  // fallback: genera un ID local
  const id = `req-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
  return { id, mode: "mock" };
}

/** Carga miembros reales desde el backend (Supabase → FastAPI → frontend). */
export async function fetchMembers(): Promise<{ members: Member[]; mode: RunMode }> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/members`, {}, 6000);
      if (!res.ok) throw new Error(String(res.status));
      const raw: Array<{
        id: string; name: string; role: string; email?: string;
        current_load: number; is_manager: boolean; skills: string[];
      }> = await res.json();
      const members: Member[] = raw.map((m) =>
        normalizeMember(m as unknown as Record<string, unknown>)
      );
      return { members, mode: "live" };
    } catch {
      // sigue a mock
    }
  }
  return { members: [], mode: "mock" };
}

/** Snapshot completo para que el frontend use Supabase como fuente real. */
export async function fetchWorkspace(): Promise<{
  members: Member[];
  projects: Project[];
  requirements: Requirement[];
  tickets: Ticket[];
  mode: RunMode;
}> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/workspace`, {}, 12000);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      return {
        members: (data.members ?? []).map(normalizeMember),
        projects: (data.projects ?? []) as Project[],
        requirements: (data.requirements ?? []).map(normalizeRequirement),
        tickets: (data.tickets ?? []).map(normalizeTicket),
        mode: "live",
      };
    } catch {
      // cae a mock
    }
  }
  return { members: [], projects: [], requirements: [], tickets: [], mode: "mock" };
}

/** Carga proyectos disponibles desde el backend. */
export async function fetchProjects(): Promise<{ projects: Array<{ id: string; name: string }>; mode: RunMode }> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/projects`, {}, 6000);
      if (!res.ok) throw new Error(String(res.status));
      const projects = await res.json();
      return { projects, mode: "live" };
    } catch {
      // sigue a mock
    }
  }
  return { projects: [], mode: "mock" };
}

export async function fetchProjectWork(projectId: string): Promise<{
  project: Project | null;
  requirements: Requirement[];
  tickets: Ticket[];
  meetings: Array<Record<string, unknown>>;
  mode: RunMode;
}> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/projects/${projectId}/work`, {}, 10000);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      return {
        project: data.project ?? null,
        requirements: (data.requirements ?? []).map(normalizeRequirement),
        tickets: (data.tickets ?? []).map(normalizeTicket),
        meetings: data.meetings ?? [],
        mode: "live",
      };
    } catch {
      // cae a mock
    }
  }
  return { project: null, requirements: [], tickets: [], meetings: [], mode: "mock" };
}

export async function createTicket(input: CreateTicketInput): Promise<{ ticket: Ticket | null; mode: RunMode }> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/api/tickets`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
        10000
      );
      if (!res.ok) throw new Error(String(res.status));
      return { ticket: normalizeTicket(await res.json()), mode: "live" };
    } catch {
      // cae a mock
    }
  }
  return { ticket: null, mode: "mock" };
}

export async function createProject(input: CreateProjectInput): Promise<{ project: Project | null; mode: RunMode }> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/api/projects`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
        10000
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || String(res.status));
      }
      return { project: (await res.json()) as Project, mode: "live" };
    } catch {
      // cae a mock
    }
  }
  await sleep(200);
  const project: Project = {
    id: `proj-${Date.now()}`,
    team_id: "demo",
    name: input.name,
    code: input.code ?? null,
    description: input.description ?? null,
    business_area: input.business_area ?? null,
    status: "active",
    owner_id: input.owner_id ?? null,
  };
  return { project, mode: "mock" };
}

export async function fetchTicketComments(ticketId: string): Promise<TicketComment[]> {
  if (!HAS_LIVE_BACKEND) return [];
  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/tickets/${ticketId}/comments`, {}, 8000);
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as TicketComment[];
  } catch {
    return [];
  }
}

export async function createTicketComment(ticketId: string, body: string, authorId?: string | null): Promise<TicketComment | null> {
  if (!HAS_LIVE_BACKEND) return null;
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/tickets/${ticketId}/comments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, author_id: authorId }),
      },
      8000
    );
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as TicketComment;
  } catch {
    return null;
  }
}

/** Lee los últimos errores registrados en Supabase vía backend. */
export async function fetchErrorLogs(limit = 50): Promise<ErrorLog[]> {
  if (!HAS_LIVE_BACKEND) return [];
  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/errors?limit=${limit}`, {}, 6000);
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    return Array.isArray(data) ? (data as ErrorLog[]) : [];
  } catch {
    return [];
  }
}

export async function approveRequirement(
  requirementId: string
): Promise<{ n8n_notified: boolean; mode: RunMode }> {
  const start = performance.now();
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/approve/${requirementId}`, { method: "POST" }, 10000);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      useAppStore.getState().pushAgentLog({
        agent: "approve",
        latency_ms: Math.round(performance.now() - start),
        model: "n8n webhook",
        ok: true,
      });
      return { n8n_notified: Boolean(data.n8n_notified), mode: "live" };
    } catch {
      // sigue a la simulación
    }
  }

  await sleep(1100);
  useAppStore.getState().pushAgentLog({
    agent: "approve",
    latency_ms: Math.round(performance.now() - start),
    model: "n8n webhook (mock)",
    ok: true,
  });
  return { n8n_notified: true, mode: "mock" };
}

// ─── SaaS auth / tenancy helpers ─────────────────────────────────────────────

export async function fetchMe(): Promise<{
  user_id: string;
  email: string | null;
  team_id: string | null;
  role: string | null;
  team: Record<string, unknown> | null;
  is_authenticated: boolean;
} | null> {
  if (!HAS_LIVE_BACKEND) return null;
  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/me`, {}, 6000);
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchTeams(): Promise<Team[]> {
  if (!HAS_LIVE_BACKEND) return [];
  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/teams`, {}, 6000);
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as Team[];
  } catch {
    return [];
  }
}

export async function createTeam(name: string, slug?: string): Promise<Team | null> {
  if (!HAS_LIVE_BACKEND) {
    const id = `team-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
    return {
      id,
      name,
      slug: slug || name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
      role: "owner",
      plan_tier: "free",
    };
  }
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/teams`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug }),
      },
      8000
    );
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as Team;
  } catch {
    return null;
  }
}

export async function inviteMember(
  email: string,
  role: string = "member"
): Promise<{ id: string; token: string; email: string; role: string; expires_at: string } | null> {
  const teamId = useAuthStore.getState().teamId;
  if (!HAS_LIVE_BACKEND || !teamId) return null;
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/teams/${teamId}/invitations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      },
      8000
    );
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } catch {
    return null;
  }
}

export async function acceptInvite(token: string): Promise<{ accepted: boolean; team_id: string; role: string } | null> {
  if (!HAS_LIVE_BACKEND) return null;
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/invitations/accept`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      },
      8000
    );
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchUsage(): Promise<UsageSummary | null> {
  if (!HAS_LIVE_BACKEND) return null;
  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/usage`, {}, 6000);
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as UsageSummary;
  } catch {
    return null;
  }
}

export async function fetchPlans(): Promise<Plan[]> {
  if (!HAS_LIVE_BACKEND) return [];
  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/billing/plans`, {}, 6000);
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as Plan[];
  } catch {
    return [];
  }
}

// ─── Knowledge Ops ───────────────────────────────────────────────────────────

export async function fetchMemberDocs(memberId: string): Promise<{ docs: MemberDocs; mode: RunMode }> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/members/${memberId}/docs`, {}, 8000);
      if (!res.ok) throw new Error(String(res.status));
      return { docs: (await res.json()) as MemberDocs, mode: "live" };
    } catch {
      // mock
    }
  }
  await sleep(200);
  return { docs: mockFetchMemberDocs(memberId), mode: "mock" };
}

export async function saveMemberDocs(
  memberId: string,
  mdBody: string
): Promise<{ docs: MemberDocs; mode: RunMode }> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/api/members/${memberId}/docs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ md_body: mdBody }),
        },
        12000
      );
      if (!res.ok) throw new Error(String(res.status));
      return { docs: (await res.json()) as MemberDocs, mode: "live" };
    } catch {
      // mock
    }
  }
  await sleep(250);
  return { docs: mockSaveMemberDocs(memberId, mdBody), mode: "mock" };
}

export async function fetchMemberProjectNotes(
  memberId: string
): Promise<{ notes: MemberProjectNote[]; mode: RunMode }> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/members/${memberId}/project-notes`, {}, 8000);
      if (!res.ok) throw new Error(String(res.status));
      return { notes: (await res.json()) as MemberProjectNote[], mode: "live" };
    } catch {
      // mock
    }
  }
  await sleep(150);
  return { notes: [], mode: "mock" };
}

export async function saveMemberProjectNote(
  memberId: string,
  projectId: string,
  input: { md_notes: string; role_in_project?: string; importance_pct?: number }
): Promise<{ note: MemberProjectNote | null; mode: RunMode }> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/api/members/${memberId}/project-notes/${projectId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
        10000
      );
      if (!res.ok) throw new Error(String(res.status));
      return { note: (await res.json()) as MemberProjectNote, mode: "live" };
    } catch {
      // mock
    }
  }
  await sleep(200);
  return {
    note: {
      project_id: projectId,
      project_name: "Proyecto",
      role_in_project: input.role_in_project || "contributor",
      md_notes: input.md_notes,
      importance_pct: input.importance_pct ?? 50,
    },
    mode: "mock",
  };
}

export async function assignMemberToProject(
  memberId: string,
  projectId: string,
  role: "owner" | "contributor" | "stakeholder" = "contributor",
  roleInProject?: string
): Promise<{ note: MemberProjectNote | null; mode: RunMode }> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/api/members/${memberId}/projects`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: projectId,
            role,
            role_in_project: roleInProject,
          }),
        },
        10000
      );
      if (!res.ok) throw new Error(String(res.status));
      return { note: (await res.json()) as MemberProjectNote, mode: "live" };
    } catch {
      // mock
    }
  }
  await sleep(200);
  return { note: null, mode: "mock" };
}

export async function unassignMemberFromProject(
  memberId: string,
  projectId: string
): Promise<{ ok: boolean; mode: RunMode }> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/api/members/${memberId}/projects/${projectId}`,
        { method: "DELETE" },
        8000
      );
      if (!res.ok && res.status !== 204) throw new Error(String(res.status));
      return { ok: true, mode: "live" };
    } catch {
      // mock
    }
  }
  await sleep(150);
  return { ok: true, mode: "mock" };
}

export async function fetchMemberDuties(memberId: string): Promise<{ duties: MemberDuty[]; mode: RunMode }> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/members/${memberId}/duties`, {}, 6000);
      if (!res.ok) throw new Error(String(res.status));
      return { duties: (await res.json()) as MemberDuty[], mode: "live" };
    } catch {
      // mock
    }
  }
  await sleep(180);
  return { duties: mockGetMemberDuties(memberId), mode: "mock" };
}

export async function createMemberDuty(
  memberId: string,
  input: { title: string; description?: string; duty_type: DutyType; load_pct: number; hours_per_week?: number }
): Promise<{ duty: MemberDuty | null; mode: RunMode }> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/api/members/${memberId}/duties`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
        8000
      );
      if (!res.ok) throw new Error(String(res.status));
      return { duty: (await res.json()) as MemberDuty, mode: "live" };
    } catch {
      // mock
    }
  }
  await sleep(220);
  return { duty: mockCreateMemberDuty(memberId, input), mode: "mock" };
}

export async function deleteMemberDuty(dutyId: string): Promise<{ ok: boolean; mode: RunMode }> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/member-duties/${dutyId}`, { method: "DELETE" }, 8000);
      if (!res.ok) throw new Error(String(res.status));
      return { ok: true, mode: "live" };
    } catch {
      // mock
    }
  }
  await sleep(180);
  return { ok: mockDeleteMemberDuty(dutyId), mode: "mock" };
}

export async function fetchMemberAbsences(memberId: string): Promise<{ absences: MemberAbsence[]; mode: RunMode }> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/members/${memberId}/absences`, {}, 6000);
      if (!res.ok) throw new Error(String(res.status));
      return { absences: (await res.json()) as MemberAbsence[], mode: "live" };
    } catch {
      // mock
    }
  }
  await sleep(180);
  return { absences: mockGetMemberAbsences(memberId), mode: "mock" };
}

export async function createMemberAbsence(
  memberId: string,
  input: { start_date: string; end_date: string; reason?: string }
): Promise<{ absence: MemberAbsence | null; mode: RunMode }> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/api/members/${memberId}/absences`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
        8000
      );
      if (!res.ok) throw new Error(String(res.status));
      return { absence: (await res.json()) as MemberAbsence, mode: "live" };
    } catch {
      // mock
    }
  }
  await sleep(220);
  return { absence: mockCreateMemberAbsence(memberId, input), mode: "mock" };
}

export async function fetchMemberCapacity(memberId: string): Promise<{ capacity: MemberCapacity; mode: RunMode }> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/members/${memberId}/capacity`, {}, 6000);
      if (!res.ok) throw new Error(String(res.status));
      return { capacity: (await res.json()) as MemberCapacity, mode: "live" };
    } catch {
      // mock
    }
  }
  await sleep(150);
  return { capacity: mockGetMemberCapacity(memberId), mode: "mock" };
}

export async function updateMemberCapacity(
  memberId: string,
  weeklyHours: number
): Promise<{ capacity: MemberCapacity; mode: RunMode }> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/api/members/${memberId}/capacity`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weekly_hours: weeklyHours }),
        },
        8000
      );
      if (!res.ok) throw new Error(String(res.status));
      return { capacity: (await res.json()) as MemberCapacity, mode: "live" };
    } catch {
      // mock
    }
  }
  await sleep(200);
  return { capacity: mockUpdateMemberCapacity(memberId, weeklyHours), mode: "mock" };
}

export async function fetchProjectModules(projectId: string): Promise<{ modules: ProjectModule[]; mode: RunMode }> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/projects/${projectId}/modules`, {}, 6000);
      if (!res.ok) throw new Error(String(res.status));
      return { modules: (await res.json()) as ProjectModule[], mode: "live" };
    } catch {
      // mock
    }
  }
  await sleep(180);
  return { modules: mockGetProjectModules(projectId), mode: "mock" };
}

export async function createProjectModule(
  projectId: string,
  input: Pick<ProjectModule, "name" | "code" | "summary" | "md_body" | "expected_outcomes">
): Promise<{ module: ProjectModule | null; mode: RunMode }> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/api/projects/${projectId}/modules`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
        8000
      );
      if (!res.ok) throw new Error(String(res.status));
      return { module: (await res.json()) as ProjectModule, mode: "live" };
    } catch {
      // mock
    }
  }
  await sleep(220);
  return { module: mockCreateProjectModule(projectId, input), mode: "mock" };
}

export async function updateProjectModule(
  moduleId: string,
  patch: Partial<Pick<ProjectModule, "name" | "summary" | "md_body" | "expected_outcomes" | "status">>
): Promise<{ module: ProjectModule | null; mode: RunMode }> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/api/project-modules/${moduleId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
        8000
      );
      if (!res.ok) throw new Error(String(res.status));
      return { module: (await res.json()) as ProjectModule, mode: "live" };
    } catch {
      // mock
    }
  }
  await sleep(200);
  return { module: mockUpdateProjectModule(moduleId, patch), mode: "mock" };
}

export async function fetchProjectStakeholders(
  projectId: string
): Promise<{ stakeholders: ProjectStakeholder[]; mode: RunMode }> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/projects/${projectId}/stakeholders`, {}, 6000);
      if (!res.ok) throw new Error(String(res.status));
      return { stakeholders: (await res.json()) as ProjectStakeholder[], mode: "live" };
    } catch {
      // mock
    }
  }
  await sleep(150);
  return { stakeholders: mockGetProjectStakeholders(projectId), mode: "mock" };
}

export async function createProjectStakeholder(
  projectId: string,
  input: Pick<ProjectStakeholder, "member_id" | "role_in_project" | "importance_pct" | "md_notes">
): Promise<{ stakeholder: ProjectStakeholder | null; mode: RunMode }> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/api/projects/${projectId}/stakeholders`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
        8000
      );
      if (!res.ok) throw new Error(String(res.status));
      return { stakeholder: (await res.json()) as ProjectStakeholder, mode: "live" };
    } catch {
      // mock
    }
  }
  await sleep(200);
  return { stakeholder: mockCreateProjectStakeholder(projectId, input), mode: "mock" };
}

export async function uploadProjectDoc(
  projectId: string,
  title: string,
  mdBody: string,
  sourceType: string = "project_overview",
  opts?: { sourceId?: string; mode?: "replace" | "append" }
): Promise<{ ok: boolean; mode: RunMode; error?: string; sourceId?: string }> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/api/projects/${projectId}/docs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            md_body: mdBody,
            source_type: sourceType,
            source_id: opts?.sourceId,
            mode: opts?.mode ?? "replace",
          }),
        },
        120000
      );
      if (!res.ok) {
        let detail = String(res.status);
        try {
          const body = (await res.json()) as { detail?: unknown };
          if (typeof body.detail === "string") detail = body.detail;
        } catch {
          /* ignore */
        }
        return { ok: false, mode: "live", error: detail };
      }
      const data = (await res.json()) as { source_id?: string };
      return { ok: true, mode: "live", sourceId: data.source_id };
    } catch (err) {
      return {
        ok: false,
        mode: "live",
        error: err instanceof Error ? err.message : "Error de red al subir MD",
      };
    }
  }
  await sleep(250);
  mockUploadProjectDoc(projectId, mdBody);
  return { ok: true, mode: "mock" };
}

export async function fetchProjectDoc(
  projectId: string,
  sourceId: string
): Promise<{ doc: { id: string; title: string; source_type: string; raw_content: string } | null; mode: RunMode }> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/api/projects/${projectId}/docs/${sourceId}`,
        {},
        10000
      );
      if (!res.ok) throw new Error(String(res.status));
      return { doc: await res.json(), mode: "live" };
    } catch {
      // fall through
    }
  }
  return { doc: null, mode: "mock" };
}

export async function updateProjectDoc(
  projectId: string,
  sourceId: string,
  input: { title?: string; md_body?: string; mode?: "replace" | "append" }
): Promise<{ ok: boolean; mode: RunMode; error?: string }> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/api/projects/${projectId}/docs/${sourceId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: input.title,
            md_body: input.md_body,
            mode: input.mode ?? "replace",
          }),
        },
        120000
      );
      if (!res.ok) {
        let detail = String(res.status);
        try {
          const body = (await res.json()) as { detail?: unknown };
          if (typeof body.detail === "string") detail = body.detail;
        } catch {
          /* ignore */
        }
        return { ok: false, mode: "live", error: detail };
      }
      return { ok: true, mode: "live" };
    } catch (err) {
      return {
        ok: false,
        mode: "live",
        error: err instanceof Error ? err.message : "Error de red al actualizar MD",
      };
    }
  }
  return { ok: false, mode: "mock", error: "Sin backend live" };
}

export async function fetchProjectKnowledge(projectId: string): Promise<{ knowledge: KnowledgeSummary; mode: RunMode }> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/projects/${projectId}/knowledge`, {}, 8000);
      if (!res.ok) throw new Error(String(res.status));
      return { knowledge: (await res.json()) as KnowledgeSummary, mode: "live" };
    } catch {
      // mock
    }
  }
  await sleep(200);
  return { knowledge: mockFetchProjectKnowledge(projectId), mode: "mock" };
}

export async function fetchReorgProposals(
  status?: string
): Promise<{ proposals: ReorgProposal[]; mode: RunMode }> {
  if (HAS_LIVE_BACKEND) {
    try {
      const qs = status ? `?status=${encodeURIComponent(status)}` : "";
      const res = await fetchWithTimeout(`${API_BASE}/api/reorg/proposals${qs}`, {}, 8000);
      if (!res.ok) throw new Error(String(res.status));
      return { proposals: (await res.json()) as ReorgProposal[], mode: "live" };
    } catch {
      // mock
    }
  }
  await sleep(220);
  return { proposals: mockGetReorgProposals(status), mode: "mock" };
}

export async function decideReorgProposal(
  id: string,
  decision: "approved" | "rejected",
  note?: string
): Promise<{ proposal: ReorgProposal | null; mode: RunMode }> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/api/reorg/proposals/${id}/decide`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, note }),
        },
        8000
      );
      if (!res.ok) throw new Error(String(res.status));
      return { proposal: (await res.json()) as ReorgProposal, mode: "live" };
    } catch {
      // mock
    }
  }
  await sleep(300);
  return { proposal: mockDecideReorgProposal(id, decision, note), mode: "mock" };
}

export async function triggerReorgAgent(
  memberId: string,
  absenceId?: string
): Promise<{ proposal: ReorgProposal | null; mode: RunMode }> {
  if (HAS_LIVE_BACKEND) {
    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/api/reorg/trigger`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ member_id: memberId, absence_id: absenceId }),
        },
        12000
      );
      if (!res.ok) throw new Error(String(res.status));
      return { proposal: (await res.json()) as ReorgProposal, mode: "live" };
    } catch {
      // mock
    }
  }
  await sleep(900);
  return { proposal: mockTriggerReorgAgent(memberId, absenceId), mode: "mock" };
}
