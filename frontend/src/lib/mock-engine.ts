import {
  GOLDEN_TRANSCRIPT,
  REALISTIC_TRANSCRIPT,
  SEED_MEMBERS,
  SEED_DUTIES,
  SEED_ABSENCES,
  SEED_CAPACITY,
  SEED_MODULES,
  SEED_STAKEHOLDERS,
  SEED_GRAPH_NODES,
  SEED_GRAPH_EDGES,
  SEED_PROJECT_OVERVIEW,
  SEED_REORG_PROPOSALS,
} from "./mock-data";
import type {
  Member,
  MeetingAgentOutput,
  Skill,
  TicketDraft,
  AssignmentAgentOutput,
  MemberDuty,
  MemberAbsence,
  MemberCapacity,
  ProjectModule,
  ProjectStakeholder,
  KnowledgeSummary,
  ReorgProposal,
  GraphNode,
  GraphEdge,
} from "./types";

/**
 * Simulador local de los agentes de IA (Meeting Agent / Assignment Agent).
 * Se usa cuando no hay backend real conectado (NEXT_PUBLIC_API_URL vacío)
 * para poder demostrar el flujo completo end-to-end sin depender de nadie más.
 */

function uid(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Estado mutable en memoria para Knowledge Ops en modo demo. */
let mockDuties = clone(SEED_DUTIES);
let mockAbsences = clone(SEED_ABSENCES);
let mockCapacity = clone(SEED_CAPACITY);
let mockModules = clone(SEED_MODULES);
let mockStakeholders = clone(SEED_STAKEHOLDERS);
let mockGraphNodes = clone(SEED_GRAPH_NODES);
let mockGraphEdges = clone(SEED_GRAPH_EDGES);
let mockOverview = SEED_PROJECT_OVERVIEW;
let mockReorgProposals = clone(SEED_REORG_PROPOSALS);
let mockMemberProfiles: Record<string, string> = {
  "60000000-0000-0000-0000-000000000002": `# Iván — ERP Exactus

## Proyectos
- Integración Exactus ↔ Apps
- Cayena: módulos contables

## Stack
- C#, SQL Server, Exactus

## Restricciones
- No Filament ni redes`,
};

const MEMBER_PROFILE_TEMPLATE = `# Mis proyectos y stack

## Proyectos
- (lista de proyectos donde participo y mi rol)

## Stack
- (lenguajes, ERP, herramientas)

## Runbooks
- (cómo despliego, dónde está la doc)

## Restricciones
- (qué no toco / cuándo escalar)
`;

export function resetMockKnowledgeState() {
  mockDuties = clone(SEED_DUTIES);
  mockAbsences = clone(SEED_ABSENCES);
  mockCapacity = clone(SEED_CAPACITY);
  mockModules = clone(SEED_MODULES);
  mockStakeholders = clone(SEED_STAKEHOLDERS);
  mockGraphNodes = clone(SEED_GRAPH_NODES);
  mockGraphEdges = clone(SEED_GRAPH_EDGES);
  mockOverview = SEED_PROJECT_OVERVIEW;
  mockReorgProposals = clone(SEED_REORG_PROPOSALS);
  mockMemberProfiles = {};
}

export function mockFetchMemberDocs(memberId: string): { member_id: string; overview_md: string; updated_at: string | null } {
  return {
    member_id: memberId,
    overview_md: mockMemberProfiles[memberId] ?? MEMBER_PROFILE_TEMPLATE,
    updated_at: mockMemberProfiles[memberId] ? new Date().toISOString() : null,
  };
}

export function mockSaveMemberDocs(memberId: string, mdBody: string): { member_id: string; overview_md: string; updated_at: string } {
  mockMemberProfiles[memberId] = mdBody;
  return {
    member_id: memberId,
    overview_md: mdBody,
    updated_at: new Date().toISOString(),
  };
}

export function mockGetMemberDuties(memberId: string): MemberDuty[] {
  return mockDuties.filter((d) => d.member_id === memberId);
}

export function mockCreateMemberDuty(
  memberId: string,
  input: Pick<MemberDuty, "title" | "description" | "duty_type" | "load_pct" | "hours_per_week">
): MemberDuty {
  const duty: MemberDuty = {
    id: uid("duty"),
    member_id: memberId,
    team_id: "demo",
    title: input.title,
    description: input.description,
    duty_type: input.duty_type,
    load_pct: input.load_pct,
    hours_per_week: input.hours_per_week,
    is_active: true,
    created_at: new Date().toISOString(),
  };
  mockDuties = [duty, ...mockDuties];
  return duty;
}

export function mockDeleteMemberDuty(dutyId: string): boolean {
  const before = mockDuties.length;
  mockDuties = mockDuties.filter((d) => d.id !== dutyId);
  return mockDuties.length < before;
}

export function mockGetMemberAbsences(memberId: string): MemberAbsence[] {
  return mockAbsences.filter((a) => a.member_id === memberId);
}

export function mockCreateMemberAbsence(
  memberId: string,
  input: Pick<MemberAbsence, "start_date" | "end_date" | "reason">
): MemberAbsence {
  const absence: MemberAbsence = {
    id: uid("abs"),
    member_id: memberId,
    team_id: "demo",
    start_date: input.start_date,
    end_date: input.end_date,
    reason: input.reason,
    status: "pending",
    created_at: new Date().toISOString(),
  };
  mockAbsences = [absence, ...mockAbsences];
  return absence;
}

export function mockGetMemberCapacity(memberId: string): MemberCapacity {
  return (
    mockCapacity.find((c) => c.member_id === memberId) ?? {
      member_id: memberId,
      team_id: "demo",
      weekly_hours: 40,
    }
  );
}

export function mockUpdateMemberCapacity(memberId: string, weeklyHours: number): MemberCapacity {
  const existing = mockGetMemberCapacity(memberId);
  const updated: MemberCapacity = {
    ...existing,
    weekly_hours: weeklyHours,
    updated_at: new Date().toISOString(),
  };
  mockCapacity = mockCapacity.filter((c) => c.member_id !== memberId).concat(updated);
  return updated;
}

export function mockGetProjectModules(projectId: string): ProjectModule[] {
  return mockModules.filter((m) => m.project_id === projectId);
}

export function mockCreateProjectModule(
  projectId: string,
  input: Pick<ProjectModule, "name" | "code" | "summary" | "md_body" | "expected_outcomes">
): ProjectModule {
  const mod: ProjectModule = {
    id: uid("mod"),
    project_id: projectId,
    team_id: "demo",
    name: input.name,
    code: input.code,
    summary: input.summary,
    md_body: input.md_body ?? "",
    expected_outcomes: input.expected_outcomes,
    status: "planned",
    created_at: new Date().toISOString(),
  };
  mockModules = [mod, ...mockModules];
  return mod;
}

export function mockUpdateProjectModule(moduleId: string, patch: Partial<ProjectModule>): ProjectModule | null {
  let updated: ProjectModule | null = null;
  mockModules = mockModules.map((m) => {
    if (m.id !== moduleId) return m;
    updated = { ...m, ...patch, updated_at: new Date().toISOString() };
    return updated;
  });
  return updated;
}

export function mockGetProjectStakeholders(projectId: string): ProjectStakeholder[] {
  return mockStakeholders.filter((s) => s.project_id === projectId);
}

export function mockCreateProjectStakeholder(
  projectId: string,
  input: Pick<ProjectStakeholder, "member_id" | "role_in_project" | "importance_pct" | "md_notes">
): ProjectStakeholder {
  const stk: ProjectStakeholder = {
    id: uid("stk"),
    project_id: projectId,
    member_id: input.member_id,
    role_in_project: input.role_in_project,
    importance_pct: input.importance_pct,
    md_notes: input.md_notes,
    created_at: new Date().toISOString(),
  };
  mockStakeholders = [stk, ...mockStakeholders];
  return stk;
}

export function mockUploadProjectDoc(projectId: string, mdBody: string): void {
  if (projectId === "proj-erp") mockOverview = mdBody;
}

export function mockFetchProjectKnowledge(projectId: string): KnowledgeSummary {
  return {
    project_id: projectId,
    overview_md: projectId === "proj-erp" ? mockOverview : "",
    modules: mockGetProjectModules(projectId),
    stakeholders: mockGetProjectStakeholders(projectId),
    nodes: mockGraphNodes.filter((n) => n.project_id === projectId || !n.project_id),
    edges: mockGraphEdges,
  };
}

export function mockGetReorgProposals(status?: string): ReorgProposal[] {
  let list = mockReorgProposals;
  if (status) list = list.filter((p) => p.status === status);
  return clone(list);
}

export function mockDecideReorgProposal(
  id: string,
  decision: "approved" | "rejected",
  note?: string
): ReorgProposal | null {
  let result: ReorgProposal | null = null;
  mockReorgProposals = mockReorgProposals.map((p) => {
    if (p.id !== id) return p;
    result = {
      ...p,
      status: decision,
      boss_decision_note: note ?? null,
      decided_at: new Date().toISOString(),
    };
    return result;
  });
  return result;
}

export function mockTriggerReorgAgent(memberId: string, absenceId?: string): ReorgProposal {
  const member = SEED_MEMBERS.find((m) => m.id === memberId);
  const proposal: ReorgProposal = {
    id: uid("reorg"),
    team_id: "demo",
    member_id: memberId,
    member_name: member?.name,
    triggered_by: absenceId ? "absence" : "overload",
    reason_md: `## Propuesta generada\n\nReorganización sugerida para **${member?.name ?? memberId}**${absenceId ? " por ausencia registrada" : " por sobrecarga detectada"}.`,
    status: "pending_boss",
    proposed_by_agent: true,
    created_at: new Date().toISOString(),
    items: [],
  };
  mockReorgProposals = [proposal, ...mockReorgProposals];
  return proposal;
}

export function mockGetGraph(projectId: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const knowledge = mockFetchProjectKnowledge(projectId);
  return { nodes: knowledge.nodes, edges: knowledge.edges };
}

const GOLDEN_OUTPUT: MeetingAgentOutput = {
  summary:
    "Finanzas necesita un ERP con módulo de costos e inventario, migrando la data histórica de Excel, en un plazo de 3 a 6 meses.",
  tickets: [
    {
      title: "Diseñar esquema de datos del módulo de costos",
      description: "Modelar tablas de costos y rentabilidad por producto.",
      priority: "high",
      estimate_hours: 16,
      required_skill: "data",
      work_phase: "db",
      acceptance_criteria: "Diagrama ER aprobado por data lead; tablas cost_centers y product_costs definidas",
    },
    {
      title: "API de carga de Excel históricos",
      description: "Endpoint que recibe archivos Excel y los normaliza.",
      priority: "high",
      estimate_hours: 24,
      required_skill: "backend",
      work_phase: "backend",
      acceptance_criteria: "POST /import/excel acepta .xlsx; devuelve filas normalizadas; tests de integración verdes",
    },
    {
      title: "Pantalla de conciliación de inventario",
      description: "Vista para cuadrar inventario contra registros.",
      priority: "medium",
      estimate_hours: 20,
      required_skill: "frontend",
      work_phase: "frontend",
      acceptance_criteria: "UI muestra diff inventario vs contabilidad; export CSV funcional",
    },
    {
      title: "Plan de pruebas del módulo de costos",
      description: "Casos de prueba de cálculos y cargas.",
      priority: "medium",
      estimate_hours: 8,
      required_skill: "qa",
      work_phase: "qa",
      acceptance_criteria: "Suite de pruebas cubre cálculos de rentabilidad y casos borde de carga Excel",
    },
  ],
};

const REALISTIC_OUTPUT: MeetingAgentOutput = {
  summary:
    "Ventas necesita un CRM ligero que centralice contactos y oportunidades, con un funnel visual y alertas de seguimiento, en 8 semanas.",
  tickets: [
    {
      title: "Modelo de datos de contactos y oportunidades",
      description: "Definir entidades de clientes, contactos y pipeline de ventas.",
      priority: "high",
      estimate_hours: 14,
      required_skill: "data",
      work_phase: "discovery",
      acceptance_criteria: "Entidades contact, opportunity y stage documentadas con relaciones",
    },
    {
      title: "Tablero de funnel de ventas con gráficas",
      description: "Vista de embudo por etapa con export para gerencia.",
      priority: "high",
      estimate_hours: 22,
      required_skill: "frontend",
      work_phase: "frontend",
      acceptance_criteria: "Embudo por etapa con drill-down; export PDF para gerencia",
    },
    {
      title: "Historial de interacciones por cliente",
      description: "Timeline de llamadas, correos y reuniones por cliente.",
      priority: "medium",
      estimate_hours: 12,
      required_skill: "backend",
      work_phase: "backend",
      acceptance_criteria: "API GET /clients/:id/timeline devuelve eventos ordenados cronológicamente",
    },
    {
      title: "Plan de pruebas de reportes de funnel",
      description: "Validar cálculos del embudo y alertas de seguimiento.",
      priority: "low",
      estimate_hours: 6,
      required_skill: "qa",
      work_phase: "qa",
      acceptance_criteria: "Tests validan totales por etapa y alertas a 15 días sin movimiento",
    },
  ],
};

const SKILL_KEYWORDS: Partial<Record<Skill, string[]>> = {
  frontend: ["pantalla", "vista", "tablero", "dashboard", "interfaz", "ui", "reporte visual"],
  backend: ["api", "endpoint", "integración", "servicio", "migración", "carga de", "webhook"],
  data: ["modelo de datos", "esquema", "base de datos", "tabla", "reportes", "datos históricos"],
  qa: ["prueba", "pruebas", "validar", "calidad", "testing"],
  devops: ["infraestructura", "servidor", "despliegue", "red", "seguridad", "monitoreo"],
  erp_exactus: ["exactus", "exacto", "cayena", "existencia", "bodega", "pedido"],
  erp_softland: ["softland"],
  csharp: ["c#", "csharp", ".net"],
  sql: ["sql", "query"],
  filament: ["filament"],
  metabase: ["metabase"],
  networking: ["red", "dns", "cableado"],
  docker: ["docker"],
  apps: ["app interna"],
  web_design: ["diseño"],
  maxxi_web: ["maxxi web", "sitio"],
};

const PHASE_BY_SKILL: Partial<Record<Skill, import("./types").WorkPhase>> = {
  frontend: "frontend",
  backend: "backend",
  data: "db",
  qa: "qa",
  devops: "deploy",
  erp_exactus: "backend",
  erp_softland: "backend",
  csharp: "backend",
  sql: "db",
  filament: "frontend",
  metabase: "backend",
  networking: "deploy",
  docker: "deploy",
  apps: "backend",
  web_design: "design",
  maxxi_web: "frontend",
};

function guessSkill(sentence: string): Skill {
  const lower = sentence.toLowerCase();
  let best: Skill = "backend";
  let bestScore = 0;
  (Object.keys(SKILL_KEYWORDS) as Skill[]).forEach((skill) => {
    const kws = SKILL_KEYWORDS[skill] || [];
    const score = kws.filter((kw) => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      best = skill;
    }
  });
  return best;
}

function splitSentences(transcript: string): string[] {
  return transcript
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40 && s.length < 260);
}

function heuristicExtraction(transcript: string): MeetingAgentOutput {
  const sentences = splitSentences(transcript);
  const picked = sentences.slice(0, Math.min(5, Math.max(3, sentences.length)));

  const tickets: TicketDraft[] = picked.map((s, idx) => {
    const skill = guessSkill(s);
    const priority = idx === 0 ? "high" : idx < picked.length - 1 ? "medium" : "low";
    const words = s.split(" ").slice(0, 8).join(" ");
    return {
      title: words.replace(/[,.:;]+$/, "") + (words.length < s.length ? "…" : ""),
      description: s,
      priority,
      estimate_hours: [8, 12, 16, 20, 24][idx % 5],
      required_skill: skill,
      work_phase: PHASE_BY_SKILL[skill] ?? "backend",
      acceptance_criteria: `Criterio verificable: ${s.slice(0, 120)}…`,
    };
  });

  const summary =
    transcript.split(/(?<=[.!?])\s+/)[0]?.slice(0, 220) ??
    "Resumen generado automáticamente a partir del transcript proporcionado.";

  return { summary, tickets: tickets.length ? tickets : GOLDEN_OUTPUT.tickets };
}

export function simulateMeetingAgent(transcript: string): MeetingAgentOutput {
  const normalized = transcript.trim();
  if (normalized === GOLDEN_TRANSCRIPT.trim()) return GOLDEN_OUTPUT;
  if (normalized === REALISTIC_TRANSCRIPT.trim()) return REALISTIC_OUTPUT;
  if (normalized.length < 30) return GOLDEN_OUTPUT;
  return heuristicExtraction(normalized);
}

export function simulateAssignmentAgent(
  tickets: TicketDraft[],
  members: Member[] = SEED_MEMBERS
): AssignmentAgentOutput {
  const recommendations = tickets.map((ticket) => {
    const candidates = members.filter((m) => m.skills.includes(ticket.required_skill));

    if (candidates.length > 0) {
      const chosen = candidates.reduce((best, m) => (m.current_load < best.current_load ? m : best));
      let risk = Math.round(15 + chosen.current_load * 0.5);
      let reasoning = `Skill de ${ticket.required_skill} y carga ${
        chosen.current_load < 40 ? "baja" : chosen.current_load <= 70 ? "media" : "alta"
      }.`;
      if (chosen.current_load > 70) {
        risk = Math.max(risk, 75);
        reasoning = `Único con skill de ${ticket.required_skill} pero está al ${chosen.current_load}% de carga.`;
      }
      return {
        ticket_title: ticket.title,
        assignee_name: chosen.name,
        risk_pct: Math.min(risk, 95),
        reasoning,
      };
    }

    const fallback = members.reduce((least, m) => (m.current_load < least.current_load ? m : least));
    return {
      ticket_title: ticket.title,
      assignee_name: fallback.name,
      risk_pct: 78,
      reasoning: `Nadie del equipo tiene skill de ${ticket.required_skill}; se asigna a ${fallback.name} (menor carga) con riesgo alto.`,
    };
  });

  return { recommendations };
}
