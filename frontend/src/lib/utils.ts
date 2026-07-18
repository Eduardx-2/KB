import { clsx, type ClassValue } from "clsx";
import type { Priority, TicketStatus, Skill } from "./types";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export const WORK_PHASE_LABELS: Record<import("./types").WorkPhase, string> = {
  discovery: "Discovery",
  ux: "UX",
  design: "Diseño",
  frontend: "Frontend",
  backend: "Backend",
  db: "Base de datos",
  qa: "QA",
  deploy: "Deploy",
};

export const DUTY_TYPE_LABELS: Record<import("./types").DutyType, string> = {
  recurring: "Recurrente",
  monitoring: "Monitoreo",
  oncall: "On-call",
  admin: "Admin",
};

export const REORG_STATUS_LABELS: Record<import("./types").ReorgStatus, string> = {
  draft: "Borrador",
  pending_boss: "Pendiente jefe",
  approved: "Aprobada",
  rejected: "Rechazada",
  applied: "Aplicada",
};

export function riskLevel(pct: number): "low" | "medium" | "high" {
  if (pct < 40) return "low";
  if (pct <= 70) return "medium";
  return "high";
}

export function riskColorClasses(pct: number) {
  const level = riskLevel(pct);
  switch (level) {
    case "low":
      return {
        dot: "bg-emerald-500",
        text: "text-emerald-700 dark:text-emerald-300",
        bg: "bg-emerald-50 dark:bg-emerald-950",
        ring: "ring-emerald-200 dark:ring-emerald-800",
        label: "Riesgo bajo",
      };
    case "medium":
      return {
        dot: "bg-amber-500",
        text: "text-amber-700 dark:text-amber-300",
        bg: "bg-amber-50 dark:bg-amber-950",
        ring: "ring-amber-200 dark:ring-amber-800",
        label: "Riesgo medio",
      };
    default:
      return {
        dot: "bg-red-500",
        text: "text-red-700 dark:text-red-300",
        bg: "bg-red-50 dark:bg-red-950",
        ring: "ring-red-200 dark:ring-red-800",
        label: "Riesgo alto",
      };
  }
}

export function priorityLabel(p: Priority) {
  return { low: "Baja", medium: "Media", high: "Alta" }[p];
}

export function priorityClasses(p: Priority) {
  switch (p) {
    case "high":
      return "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900";
    case "medium":
      return "bg-neutral-200 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-200";
    default:
      return "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400";
  }
}

export const STATUS_LABELS: Record<TicketStatus, string> = {
  backlog: "Backlog",
  todo: "Por hacer",
  in_progress: "En progreso",
  done: "Hecho",
};

export const SKILL_LABELS: Record<Skill, string> = {
  frontend: "Frontend",
  backend: "Backend",
  data: "Data",
  qa: "QA",
  devops: "DevOps",
  csharp: "C# / .NET",
  sql: "SQL",
  erp_exactus: "ERP Exactus",
  erp_softland: "ERP Softland",
  filament: "Filament",
  metabase: "Metabase",
  networking: "Redes",
  docker: "Docker",
  apps: "Apps internas",
  web_design: "Web design",
  maxxi_web: "Maxxi Web",
};

/** Label seguro si llega un skill nuevo desde el backend. */
export function skillLabel(skill: string | null | undefined): string {
  if (!skill) return "—";
  return (SKILL_LABELS as Record<string, string>)[skill] ?? skill;
}

export function loadColorClasses(load: number) {
  if (load < 40) return { bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" };
  if (load <= 70) return { bar: "bg-amber-400", text: "text-amber-600 dark:text-amber-400" };
  return { bar: "bg-red-500", text: "text-red-600 dark:text-red-400" };
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function formatRelativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "justo ahora";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  return `hace ${diffD} d`;
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
