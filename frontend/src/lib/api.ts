import { useAuthStore } from "./auth-store";
import { getAccessToken } from "./supabase";
import { useAppStore } from "./store";
import { simulateAssignmentAgent, simulateMeetingAgent } from "./mock-engine";
import { sleep } from "./utils";
import type {
  AssignmentAgentOutput,
  CreateTicketInput,
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

export async function transcribeAudio(file: Blob): Promise<{ text: string; mode: RunMode }> {
  const start = performance.now();
  if (HAS_LIVE_BACKEND) {
    try {
      const form = new FormData();
      form.append("file", file, "grabacion.webm");
      const res = await fetchWithTimeout(`${API_BASE}/api/transcribe`, { method: "POST", body: form }, 20000);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      useAppStore.getState().pushAgentLog({
        agent: "transcribe",
        latency_ms: Math.round(performance.now() - start),
        model: "scribe_v1",
        ok: true,
      });
      return { text: data.text, mode: "live" };
    } catch {
      // sigue a la simulación de abajo
    }
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
    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/api/agents/meeting`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript, requirement_id: requirementId, project_id: projectId }),
        },
        15000
      );
      if (!res.ok) throw new Error(String(res.status));
      const output: MeetingAgentOutput = await res.json();
      useAppStore.getState().pushAgentLog({
        agent: "meeting",
        latency_ms: Math.round(performance.now() - start),
        model: "gpt-4o-mini",
        ok: true,
      });
      return { output, mode: "live" };
    } catch {
      // sigue a la simulación
    }
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
    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/api/agents/assignment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requirement_id: requirementId }),
        },
        15000
      );
      if (!res.ok) throw new Error(String(res.status));
      const output: AssignmentAgentOutput = await res.json();
      useAppStore.getState().pushAgentLog({
        agent: "assignment",
        latency_ms: Math.round(performance.now() - start),
        model: "gpt-4o-mini",
        ok: true,
      });
      return { output, mode: "live" };
    } catch {
      // sigue a la simulación
    }
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
