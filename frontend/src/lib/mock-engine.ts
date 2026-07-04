import { GOLDEN_TRANSCRIPT, REALISTIC_TRANSCRIPT, SEED_MEMBERS } from "./mock-data";
import type { Member, MeetingAgentOutput, Skill, TicketDraft, AssignmentAgentOutput } from "./types";

/**
 * Simulador local de los agentes de IA (Meeting Agent / Assignment Agent).
 * Se usa cuando no hay backend real conectado (NEXT_PUBLIC_API_URL vacío)
 * para poder demostrar el flujo completo end-to-end sin depender de nadie más.
 * Reproduce fielmente los mocks del CONTRATO (sección 4.4) para los transcripts
 * de ejemplo, y genera una extracción heurística razonable para texto libre.
 */

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
    },
    {
      title: "API de carga de Excel históricos",
      description: "Endpoint que recibe archivos Excel y los normaliza.",
      priority: "high",
      estimate_hours: 24,
      required_skill: "backend",
    },
    {
      title: "Pantalla de conciliación de inventario",
      description: "Vista para cuadrar inventario contra registros.",
      priority: "medium",
      estimate_hours: 20,
      required_skill: "frontend",
    },
    {
      title: "Plan de pruebas del módulo de costos",
      description: "Casos de prueba de cálculos y cargas.",
      priority: "medium",
      estimate_hours: 8,
      required_skill: "qa",
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
    },
    {
      title: "Tablero de funnel de ventas con gráficas",
      description: "Vista de embudo por etapa con export para gerencia.",
      priority: "high",
      estimate_hours: 22,
      required_skill: "frontend",
    },
    {
      title: "Historial de interacciones por cliente",
      description: "Timeline de llamadas, correos y reuniones por cliente.",
      priority: "medium",
      estimate_hours: 12,
      required_skill: "backend",
    },
    {
      title: "Plan de pruebas de reportes de funnel",
      description: "Validar cálculos del embudo y alertas de seguimiento.",
      priority: "low",
      estimate_hours: 6,
      required_skill: "qa",
    },
  ],
};

const SKILL_KEYWORDS: Record<Skill, string[]> = {
  frontend: ["pantalla", "vista", "tablero", "dashboard", "interfaz", "ui", "reporte visual"],
  backend: ["api", "endpoint", "integración", "servicio", "migración", "carga de", "webhook"],
  data: ["modelo de datos", "esquema", "base de datos", "tabla", "reportes", "datos históricos"],
  qa: ["prueba", "pruebas", "validar", "calidad", "testing"],
  devops: ["infraestructura", "servidor", "despliegue", "red", "seguridad", "monitoreo"],
};

function guessSkill(sentence: string): Skill {
  const lower = sentence.toLowerCase();
  let best: Skill = "backend";
  let bestScore = 0;
  (Object.keys(SKILL_KEYWORDS) as Skill[]).forEach((skill) => {
    const score = SKILL_KEYWORDS[skill].filter((kw) => lower.includes(kw)).length;
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

/** Extracción heurística para transcripts libres (no son ninguno de los 2 de ejemplo). */
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
    };
  });

  const summary =
    transcript.split(/(?<=[.!?])\s+/)[0]?.slice(0, 220) ??
    "Resumen generado automáticamente a partir del transcript proporcionado.";

  return { summary, tickets: tickets.length ? tickets : GOLDEN_OUTPUT.tickets, };
}

export function simulateMeetingAgent(transcript: string): MeetingAgentOutput {
  const normalized = transcript.trim();
  if (normalized === GOLDEN_TRANSCRIPT.trim()) return GOLDEN_OUTPUT;
  if (normalized === REALISTIC_TRANSCRIPT.trim()) return REALISTIC_OUTPUT;
  if (normalized.length < 30) return GOLDEN_OUTPUT;
  return heuristicExtraction(normalized);
}

/**
 * Replica las reglas del Assignment Agent (sección 4.6):
 * - matchea por skill
 * - si current_load > 70, sube el riesgo
 * - si nadie tiene la skill, asigna al de menor carga con riesgo >= 70
 */
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
