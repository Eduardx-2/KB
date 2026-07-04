import type { Member, Requirement, Ticket, AgentLog } from "./types";

/** Seed de equipo ficticio — sección 4.5 de PROYECTO.md */
export const SEED_MEMBERS: Member[] = [
  { id: "m-ana", name: "Ana", role: "Frontend Dev", skills: ["frontend"], current_load: 40, team_id: "demo" },
  { id: "m-beto", name: "Beto", role: "Backend Dev", skills: ["backend"], current_load: 85, team_id: "demo" },
  { id: "m-carla", name: "Carla", role: "Data Analyst", skills: ["data"], current_load: 30, team_id: "demo" },
  { id: "m-david", name: "David", role: "QA Engineer", skills: ["qa"], current_load: 60, team_id: "demo" },
  { id: "m-elena", name: "Elena", role: "Redes", skills: ["devops"], current_load: 20, team_id: "demo" },
];

export const GOLDEN_TRANSCRIPT = `Buenas, gracias por el espacio. Vengo de parte de Finanzas y necesitamos con cierta urgencia un ERP para poder controlar los costos y el inventario de la compañía, porque ahorita todo lo llevamos en Excel y ya no da abasto. Necesitamos un módulo de costos que nos permita ver la rentabilidad por producto, con el detalle de materiales, mano de obra y gastos indirectos. También necesitamos un módulo de inventario que se pueda conciliar contra los registros contables, porque hemos tenido diferencias importantes en los últimos cortes. Uno de los puntos más críticos es la migración de la data histórica: tenemos como cuatro años de información en hojas de Excel que hay que subir al sistema nuevo sin perder el detalle, así que necesitamos algo que permita cargar esos archivos y normalizarlos automáticamente. En cuanto a tiempos, el comité nos está pidiendo tener esto funcionando en un plazo de tres a seis meses, y nos gustaría empezar por el diseño del modelo de datos de costos porque de ahí se desprende todo lo demás. También va a ser clave tener un plan de pruebas serio para los cálculos, porque cualquier error en costos nos puede generar un problema con auditoría externa. Si se puede automatizar parte de la conciliación entre inventario físico y lo que arroja el sistema, sería un enorme ahorro de tiempo para el equipo, que ahorita lo hace a mano cada mes.`;

export const REALISTIC_TRANSCRIPT = `Este... buenas tardes a todos, gracias por conectarse. Bueno, eh, la idea de esta reunión es explicarles lo que necesita el área comercial, o sea, el equipo de ventas, para el próximo trimestre. Mire, ahorita nosotros manejamos los clientes en como tres hojas de cálculo distintas y, este, la verdad es un caos, porque un vendedor actualiza una y el otro actualiza otra y al final nadie sabe cuál es la buena. Entonces lo que nosites... lo que necesitamos, perdón, es como un mini CRM, algo sencillo, no tiene que ser complicadísimo, pero que centralice los contactos, las oportunidades de venta y en qué etapa va cada una. Ah, y algo importante, muy importante: necesitamos poder ver un embudo, o sea un funnel de ventas, con gráficas, para poder reportarle a la gerencia cada semana, porque ahorita eso lo armamos a mano en PowerPoint y nos toma como medio día cada vez. También, bueno, esto es más para después tal vez, pero sería ideal que se pudiera mandar un correo automático cuando una oportunidad lleva más de quince días sin movimiento, para que el vendedor no se le olvide dar seguimiento. Ah y perdón, se me olvidaba, necesitamos que quede un historial de todas las interacciones con el cliente, llamadas, correos, reuniones, todo, porque a veces entra un vendedor nuevo y no tiene ni idea de la relación que ya se tenía con el cliente. En cuanto a tiempos, nos urge tener al menos una primera versión funcionando en unas ocho semanas, porque el trimestre ya casi arranca. Y ojalá se pueda probar bien antes de lanzarlo, porque la última vez que sacamos algo así tuvimos varios problemas con los reportes y quedamos mal con la gerencia.`;

interface SeedRequirementConfig {
  id: string;
  title: string;
  transcript: string;
  status: Requirement["status"];
  createdAtOffsetHours: number;
  tickets: Array<Omit<Ticket, "id" | "requirement_id" | "team_id">>;
}

const now = Date.now();
const hoursAgo = (h: number) => new Date(now - h * 60 * 60 * 1000).toISOString();

const SEED_REQUIREMENTS_CONFIG: SeedRequirementConfig[] = [
  {
    id: "req-erp-finanzas",
    title: "ERP de Finanzas — costos e inventario",
    transcript: GOLDEN_TRANSCRIPT,
    status: "approved",
    createdAtOffsetHours: 6,
    tickets: [
      {
        title: "Diseñar esquema de datos del módulo de costos",
        description: "Modelar tablas de costos y rentabilidad por producto.",
        priority: "high",
        estimate_hours: 16,
        required_skill: "data",
        risk_pct: 25,
        reasoning: "Skill de data y carga baja.",
        assignee_id: "m-carla",
        status: "in_progress",
        deadline: null,
      },
      {
        title: "API de carga de Excel históricos",
        description: "Endpoint que recibe archivos Excel y los normaliza.",
        priority: "high",
        estimate_hours: 24,
        required_skill: "backend",
        risk_pct: 80,
        reasoning: "Único backend pero está al 85% de carga.",
        assignee_id: "m-beto",
        status: "todo",
        deadline: null,
      },
      {
        title: "Pantalla de conciliación de inventario",
        description: "Vista para cuadrar inventario contra registros.",
        priority: "medium",
        estimate_hours: 20,
        required_skill: "frontend",
        risk_pct: 35,
        reasoning: "Frontend con carga media.",
        assignee_id: "m-ana",
        status: "todo",
        deadline: null,
      },
      {
        title: "Plan de pruebas del módulo de costos",
        description: "Casos de prueba de cálculos y cargas.",
        priority: "medium",
        estimate_hours: 8,
        required_skill: "qa",
        risk_pct: 50,
        reasoning: "QA con carga moderada.",
        assignee_id: "m-david",
        status: "backlog",
        deadline: null,
      },
    ],
  },
  {
    id: "req-crm-ventas",
    title: "Mini CRM para el equipo comercial",
    transcript: REALISTIC_TRANSCRIPT,
    status: "extracted",
    createdAtOffsetHours: 1.5,
    tickets: [
      {
        title: "Modelo de datos de contactos y oportunidades",
        description: "Definir entidades de clientes, contactos y pipeline de ventas.",
        priority: "high",
        estimate_hours: 14,
        required_skill: "data",
        risk_pct: 30,
        reasoning: "Skill de data y carga baja.",
        assignee_id: "m-carla",
        status: "backlog",
        deadline: null,
      },
      {
        title: "Tablero de funnel de ventas con gráficas",
        description: "Vista de embudo por etapa con export para gerencia.",
        priority: "high",
        estimate_hours: 22,
        required_skill: "frontend",
        risk_pct: 40,
        reasoning: "Frontend con carga media, único disponible.",
        assignee_id: "m-ana",
        status: "backlog",
        deadline: null,
      },
      {
        title: "Historial de interacciones por cliente",
        description: "Timeline de llamadas, correos y reuniones por cliente.",
        priority: "medium",
        estimate_hours: 12,
        required_skill: "backend",
        risk_pct: 82,
        reasoning: "Único backend pero está al 85% de carga.",
        assignee_id: "m-beto",
        status: "backlog",
        deadline: null,
      },
      {
        title: "Plan de pruebas de reportes de funnel",
        description: "Validar cálculos del embudo y alertas de seguimiento.",
        priority: "low",
        estimate_hours: 6,
        required_skill: "qa",
        risk_pct: 55,
        reasoning: "QA con carga moderada.",
        assignee_id: "m-david",
        status: "backlog",
        deadline: null,
      },
    ],
  },
];

export function buildSeedData(): { requirements: Requirement[]; tickets: Ticket[] } {
  const requirements: Requirement[] = [];
  const tickets: Ticket[] = [];

  for (const cfg of SEED_REQUIREMENTS_CONFIG) {
    requirements.push({
      id: cfg.id,
      title: cfg.title,
      raw_transcript: cfg.transcript,
      summary:
        cfg.id === "req-erp-finanzas"
          ? "Finanzas necesita un ERP con módulo de costos e inventario, migrando la data histórica de Excel, en un plazo de 3 a 6 meses."
          : "Ventas necesita un CRM ligero que centralice contactos y oportunidades, con un funnel visual y alertas de seguimiento, en 8 semanas.",
      status: cfg.status,
      created_at: hoursAgo(cfg.createdAtOffsetHours),
      team_id: "demo",
    });

    cfg.tickets.forEach((t, idx) => {
      tickets.push({
        id: `${cfg.id}-t${idx + 1}`,
        requirement_id: cfg.id,
        team_id: "demo",
        ...t,
      });
    });
  }

  return { requirements, tickets };
}

export const SEED_AGENT_LOGS: AgentLog[] = [
  { id: "log-1", agent: "meeting", latency_ms: 2140, model: "gpt-4o-mini", ok: true, created_at: hoursAgo(6) },
  { id: "log-2", agent: "assignment", latency_ms: 1380, model: "gpt-4o-mini", ok: true, created_at: hoursAgo(6) },
  { id: "log-3", agent: "transcribe", latency_ms: 3210, model: "scribe_v1", ok: true, created_at: hoursAgo(1.6) },
  { id: "log-4", agent: "meeting", latency_ms: 1890, model: "gpt-4o-mini", ok: true, created_at: hoursAgo(1.5) },
  { id: "log-5", agent: "assignment", latency_ms: 1510, model: "gpt-4o-mini", ok: true, created_at: hoursAgo(1.5) },
];
