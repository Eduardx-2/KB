import { clsx, type ClassValue } from "clsx";
import type { Priority, TicketStatus, Skill } from "./types";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

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
        text: "text-emerald-700",
        bg: "bg-emerald-50",
        ring: "ring-emerald-200",
        label: "Riesgo bajo",
      };
    case "medium":
      return {
        dot: "bg-amber-500",
        text: "text-amber-700",
        bg: "bg-amber-50",
        ring: "ring-amber-200",
        label: "Riesgo medio",
      };
    default:
      return {
        dot: "bg-red-500",
        text: "text-red-700",
        bg: "bg-red-50",
        ring: "ring-red-200",
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
      return "bg-neutral-900 text-white";
    case "medium":
      return "bg-neutral-200 text-neutral-800";
    default:
      return "bg-neutral-100 text-neutral-500";
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
};

export function loadColorClasses(load: number) {
  if (load < 40) return { bar: "bg-emerald-500", text: "text-emerald-700" };
  if (load <= 70) return { bar: "bg-amber-500", text: "text-amber-700" };
  return { bar: "bg-red-500", text: "text-red-700" };
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
