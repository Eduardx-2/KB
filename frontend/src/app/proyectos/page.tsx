"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2, Clock, ChevronDown, ChevronUp, ChevronRight,
  Layers, TriangleAlert, Users2, TrendingUp, ExternalLink, Plus,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { RequirementStatusBadge } from "@/components/requirements/status-badge";
import { PriorityBadge } from "@/components/tickets/priority-badge";
import { useAppStore } from "@/lib/store";
import { createProject } from "@/lib/api";
import { SKILL_LABELS, STATUS_LABELS, loadColorClasses, cn } from "@/lib/utils";
import type { Member, Requirement, Ticket } from "@/lib/types";

/* ─── Colores por estado ─────────────────────────────────────────────────── */
const STATUS_DOT: Record<Ticket["status"], string> = {
  done: "bg-emerald-500",
  in_progress: "bg-sky-500",
  todo: "bg-amber-400",
  backlog: "bg-neutral-300 dark:bg-neutral-600",
};
const STATUS_BAR: Record<Ticket["status"], string> = {
  done: "bg-emerald-500",
  in_progress: "bg-sky-400",
  todo: "bg-amber-400",
  backlog: "bg-neutral-200 dark:bg-neutral-700",
};
const STATUS_PILL: Record<Ticket["status"], string> = {
  done: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  in_progress: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  todo: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  backlog: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
};

/* ─── Barra de progreso multi-segmento ──────────────────────────────────── */
function MultiBar({ tickets }: { tickets: Ticket[] }) {
  const total = tickets.length;
  if (total === 0) return <div className="h-2 w-full rounded-full bg-neutral-100 dark:bg-neutral-800" />;
  const segments = (["done", "in_progress", "todo", "backlog"] as const)
    .map((s) => ({ s, n: tickets.filter((t) => t.status === s).length }))
    .filter((x) => x.n > 0);

  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full">
      {segments.map(({ s, n }) => (
        <div
          key={s}
          className={cn("transition-all", STATUS_BAR[s])}
          style={{ width: `${(n / total) * 100}%` }}
          title={`${STATUS_LABELS[s]}: ${n}`}
        />
      ))}
    </div>
  );
}

/* ─── Tarjeta de proyecto real (Supabase) ─────────────────────────────────── */
function RealProjectCard({
  project,
  requirements,
  tickets,
}: {
  project: import("@/lib/types").Project;
  requirements: Requirement[];
  tickets: Ticket[];
}) {
  const [expanded, setExpanded] = useState(false);
  const done = tickets.filter((t) => t.status === "done").length;
  const pct = tickets.length > 0 ? Math.round((done / tickets.length) * 100) : 0;
  const highRisk = tickets.filter((t) => t.risk_pct > 70);

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex w-full items-start gap-4 p-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/proyectos/${project.id}`} className="text-sm font-semibold text-neutral-900 hover:underline dark:text-neutral-100">
              {project.name}
            </Link>
            {project.status && (
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                {project.status}
              </span>
            )}
            {highRisk.length > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600 dark:bg-red-950 dark:text-red-400">
                <TriangleAlert className="size-3" /> {highRisk.length} en riesgo
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {requirements.length} reunión{requirements.length !== 1 ? "es" : ""} · {tickets.length} tickets · {pct}% completado
          </p>
          <div className="mt-3">
            <MultiBar tickets={tickets} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/reuniones/nueva?project_id=${project.id}`}
            className="rounded-lg px-2 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800"
          >
            + Reunión
          </Link>
          <button onClick={() => setExpanded((v) => !v)} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        </div>
      </div>
      {expanded && requirements.length > 0 && (
        <div className="border-t border-neutral-100 px-5 py-3 dark:border-neutral-800">
          {requirements.slice(0, 5).map((req) => (
            <Link key={req.id} href={`/reuniones/${req.id}`} className="flex items-center justify-between py-2 text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200">
              <span className="truncate">{req.title}</span>
              <RequirementStatusBadge status={req.status} />
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ─── Tarjeta de proyecto ────────────────────────────────────────────────── */
function ProjectCard({
  requirement,
  tickets,
  members,
}: {
  requirement: Requirement;
  tickets: Ticket[];
  members: Member[];
}) {
  const [expanded, setExpanded] = useState(true);

  const done = tickets.filter((t) => t.status === "done").length;
  const inProgress = tickets.filter((t) => t.status === "in_progress").length;
  const totalHours = tickets.reduce((a, t) => a + t.estimate_hours, 0);
  const doneHours = tickets.filter((t) => t.status === "done").reduce((a, t) => a + t.estimate_hours, 0);
  const pct = tickets.length > 0 ? Math.round((done / tickets.length) * 100) : 0;
  const highRisk = tickets.filter((t) => t.risk_pct > 70);

  // agrupar tickets por asignado
  const assigneeGroups = useMemo(() => {
    const map = new Map<string | null, Ticket[]>();
    for (const t of tickets) {
      const key = t.assignee_id ?? "__unassigned__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [tickets]);

  return (
    <Card className="overflow-hidden p-0">
      {/* ── Cabecera del proyecto ── */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-4 p-5 text-left hover:bg-neutral-50/60 dark:hover:bg-neutral-800/30"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{requirement.title}</span>
            <RequirementStatusBadge status={requirement.status} />
            {highRisk.length > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600 dark:bg-red-950 dark:text-red-400">
                <TriangleAlert className="size-3" /> {highRisk.length} en riesgo
              </span>
            )}
          </div>

          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-500 dark:text-neutral-400">
                {done}/{tickets.length} tickets · {doneHours}/{totalHours}h entregadas
              </span>
              <span className={cn("font-semibold", pct === 100 ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-600 dark:text-neutral-300")}>
                {pct}%
              </span>
            </div>
            <MultiBar tickets={tickets} />
          </div>

          {/* Mini leyenda + avatares del equipo */}
          <div className="mt-3 flex items-center justify-between">
            <div className="flex gap-3">
              {(["done", "in_progress", "todo", "backlog"] as const).map((s) => {
                const n = tickets.filter((t) => t.status === s).length;
                if (n === 0) return null;
                return (
                  <span key={s} className="flex items-center gap-1 text-xs text-neutral-400 dark:text-neutral-500">
                    <span className={cn("size-2 rounded-full", STATUS_DOT[s])} />
                    {n}
                  </span>
                );
              })}
            </div>
            <div className="flex -space-x-1.5">
              {[...new Set(tickets.map((t) => t.assignee_id).filter(Boolean))].slice(0, 5).map((id) => {
                const m = members.find((x) => x.id === id);
                return m ? <Avatar key={id} name={m.name} size="sm" className="ring-2 ring-white dark:ring-neutral-900" /> : null;
              })}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          <Link
            href={`/reuniones/${requirement.id}`}
            onClick={(e) => e.stopPropagation()}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            title="Abrir board"
          >
            <ExternalLink className="size-4" />
          </Link>
          {expanded ? (
            <ChevronUp className="size-4 text-neutral-400" />
          ) : (
            <ChevronDown className="size-4 text-neutral-400" />
          )}
        </div>
      </button>

      {/* ── Detalle: filas por developer ── */}
      {expanded && tickets.length > 0 && (
        <div className="border-t border-neutral-100 dark:border-neutral-800">
          {[...assigneeGroups.entries()].map(([assigneeId, assigneeTickets]) => {
            const member = assigneeId === "__unassigned__"
              ? null
              : members.find((m) => m.id === assigneeId);

            return (
              <div key={assigneeId} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800">
                {/* Sub-cabecera del developer */}
                <div className="flex items-center gap-3 bg-neutral-50/40 px-5 py-2.5 dark:bg-neutral-800/20">
                  {member ? (
                    <>
                      <Avatar name={member.name} size="sm" />
                      <Link
                        href={`/equipo/${member.id}`}
                        className="flex items-center gap-1 text-xs font-semibold text-neutral-700 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100"
                      >
                        {member.name}
                        <ChevronRight className="size-3" />
                      </Link>
                      <span className="text-xs text-neutral-400 dark:text-neutral-500">{member.role}</span>
                    </>
                  ) : (
                    <span className="text-xs font-semibold text-neutral-400">Sin asignar</span>
                  )}
                  <span className="ml-auto rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                    {assigneeTickets.length} ticket{assigneeTickets.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Tickets del developer en este proyecto */}
                {assigneeTickets.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-neutral-50/50 dark:hover:bg-neutral-800/20">
                    <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[t.status])} />
                    <p className="min-w-0 flex-1 truncate text-sm text-neutral-700 dark:text-neutral-300">{t.title}</p>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="hidden text-xs text-neutral-400 sm:block dark:text-neutral-500">
                        {SKILL_LABELS[t.required_skill]}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-neutral-400 dark:text-neutral-500">
                        <Clock className="size-3" />{t.estimate_hours}h
                      </span>
                      <PriorityBadge priority={t.priority} />
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_PILL[t.status])}>
                        {STATUS_LABELS[t.status]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ─── Vista cruzada: developer → proyectos ──────────────────────────────── */
function TeamCrossView({ members, tickets, requirements, projects }: {
  members: Member[];
  tickets: Ticket[];
  requirements: Requirement[];
  projects: import("@/lib/types").Project[];
}) {
  return (
    <div className="space-y-3">
      {members.map((m) => {
        const myTickets = tickets.filter((t) => t.assignee_id === m.id);
        const projectIds = [...new Set(myTickets.map((t) => t.project_id).filter(Boolean) as string[])];
        const active = myTickets.filter((t) => t.status === "in_progress").length;
        const lc = loadColorClasses(m.current_load);
        const loadLabel = m.active_hours != null
          ? `${m.current_load}% · ${m.active_hours}h activas`
          : `${m.current_load}%`;

        return (
          <Link key={m.id} href={`/equipo/${m.id}`}>
            <div className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-3.5 transition hover:border-neutral-300 hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700">
              <Avatar name={m.name} size="md" />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{m.name}</span>
                  <span className="text-xs text-neutral-400 dark:text-neutral-500">{m.role}</span>
                  {active > 0 && (
                    <span className="hidden rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 sm:inline dark:bg-sky-950 dark:text-sky-300">
                      {active} en progreso
                    </span>
                  )}
                </div>

                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {projectIds.length === 0 ? (
                    <span className="text-xs text-neutral-400 dark:text-neutral-600">Sin proyectos asignados — disponible</span>
                  ) : (
                    projectIds.map((pid) => {
                      const proj = projects.find((p) => p.id === pid);
                      const n = myTickets.filter((t) => t.project_id === pid).length;
                      return (
                        <span key={pid} className="flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-0.5 text-[11px] text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                          {(proj?.name ?? "Proyecto").slice(0, 22)}
                          <span className="font-semibold text-neutral-900 dark:text-neutral-100">·{n}</span>
                        </span>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="hidden w-32 shrink-0 sm:block">
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-neutral-400 dark:text-neutral-500">Carga</span>
                  <span className={cn("font-semibold", lc.text)}>{loadLabel}</span>
                </div>
                <ProgressBar value={m.current_load} barClassName={lc.bar} />
              </div>

              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{projectIds.length}</p>
                <p className="text-[11px] text-neutral-400 dark:text-neutral-500">proyecto{projectIds.length !== 1 ? "s" : ""}</p>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/* ─── Página principal ───────────────────────────────────────────────────── */
export default function ProyectosPage() {
  const hydrated = useAppStore((s) => s.hydrated);
  const projects = useAppStore((s) => s.projects);
  const requirements = useAppStore((s) => s.requirements);
  const tickets = useAppStore((s) => s.tickets);
  const members = useAppStore((s) => s.members);
  const setWorkspace = useAppStore((s) => s.setWorkspace);

  const [view, setView] = useState<"projects" | "team">("projects");
  const [createOpen, setCreateOpen] = useState(false);
  const [projName, setProjName] = useState("");
  const [projCode, setProjCode] = useState("");
  const [projDesc, setProjDesc] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreateProject() {
    if (!projName.trim()) return;
    setCreating(true);
    try {
      const { project } = await createProject({
        name: projName.trim(),
        code: projCode.trim() || undefined,
        description: projDesc.trim() || undefined,
      });
      if (project) {
        setWorkspace({ projects: [project, ...projects.filter((p) => p.id !== project.id)] });
        toast.success("Proyecto creado");
        setCreateOpen(false);
        setProjName("");
        setProjCode("");
        setProjDesc("");
      } else {
        toast.error("No se pudo crear el proyecto (¿backend vivo?)");
      }
    } finally {
      setCreating(false);
    }
  }

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")),
    [projects]
  );

  const sortedRequirements = useMemo(
    () => [...requirements].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [requirements]
  );

  const stats = useMemo(() => {
    if (!hydrated) return null;
    const totalTickets = tickets.length;
    const done = tickets.filter((t) => t.status === "done").length;
    const inProgress = tickets.filter((t) => t.status === "in_progress").length;
    const highRisk = tickets.filter((t) => t.risk_pct > 70).length;
    const pct = totalTickets > 0 ? Math.round((done / totalTickets) * 100) : 0;
    const projectCount = projects.length > 0 ? projects.length : requirements.length;
    return { totalTickets, done, inProgress, highRisk, pct, projectCount };
  }, [hydrated, tickets, projects.length, requirements.length]);

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-8">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Vista de proyectos"
        description="Estado real de cada proyecto: quién hace qué, cuánto falta y dónde está el riesgo."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Nuevo proyecto
          </Button>
        }
      />

      <div className="mx-auto max-w-5xl space-y-8 p-4 sm:p-8">

        {/* ── Resumen global ── */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "Proyectos", value: stats!.projectCount, icon: Layers, sub: `${sortedRequirements.filter(r => r.status === "approved").length} reuniones aprobadas`, tone: "neutral" },
            { label: "Progreso global", value: `${stats!.pct}%`, icon: TrendingUp, sub: `${stats!.done}/${stats!.totalTickets} tickets`, tone: stats!.pct > 60 ? "emerald" : "amber" },
            { label: "En progreso", value: stats!.inProgress, icon: CheckCircle2, sub: "tickets activos", tone: "sky" },
            { label: "Riesgo alto", value: stats!.highRisk, icon: TriangleAlert, sub: "tickets >70%", tone: stats!.highRisk > 0 ? "red" : "emerald" },
          ].map(({ label, value, icon: Icon, sub, tone }) => {
            const iconBg = {
              neutral: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
              emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
              amber: "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
              red: "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400",
              sky: "bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-400",
            }[tone as string] ?? "";
            return (
              <Card key={label} className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{label}</p>
                  <div className={cn("flex size-7 items-center justify-center rounded-lg", iconBg)}>
                    <Icon className="size-3.5" />
                  </div>
                </div>
                <p className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{value}</p>
                <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">{sub}</p>
              </Card>
            );
          })}
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 self-start rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800">
          {(["projects", "team"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                view === v
                  ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100"
                  : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
              )}
            >
              {v === "projects" ? <><Layers className="size-4" />Proyectos</> : <><Users2 className="size-4" />Equipo cruzado</>}
            </button>
          ))}
        </div>

        {/* ── Vista proyectos ── */}
        {view === "projects" && (
          <section className="space-y-5">
            {sortedProjects.length > 0 ? (
              sortedProjects.map((project) => (
                <RealProjectCard
                  key={project.id}
                  project={project}
                  requirements={requirements.filter((r) => r.project_id === project.id)}
                  tickets={tickets.filter((t) => t.project_id === project.id)}
                />
              ))
            ) : sortedRequirements.length === 0 ? (
              <EmptyState
                icon={<Layers className="size-5" />}
                title="Sin proyectos todavía"
                description="Procesá una reunión y aquí verás el estado completo de cada proyecto."
              />
            ) : (
              sortedRequirements.map((req) => (
                <ProjectCard
                  key={req.id}
                  requirement={req}
                  tickets={tickets.filter((t) => t.requirement_id === req.id)}
                  members={members}
                />
              ))
            )}
          </section>
        )}

        {view === "team" && (
          <section>
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Carga cruzada por developer</h2>
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                Cuántos proyectos simultáneos tiene cada persona y en qué está trabajando ahora.
              </p>
            </div>
            <TeamCrossView members={members} tickets={tickets} requirements={requirements} projects={projects} />
          </section>
        )}
      </div>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} className="max-w-md">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Nuevo proyecto</h2>
        <p className="mt-1 text-sm text-neutral-500">Creá un contenedor de trabajo antes de la reunión.</p>
        <div className="mt-4 space-y-3">
          <input
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900"
            placeholder="Nombre (ej. Cayena producción)"
            value={projName}
            onChange={(e) => setProjName(e.target.value)}
          />
          <input
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900"
            placeholder="Código corto (opcional, ej. CAYENA)"
            value={projCode}
            onChange={(e) => setProjCode(e.target.value)}
          />
          <textarea
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900"
            rows={3}
            placeholder="Descripción (opcional)"
            value={projDesc}
            onChange={(e) => setProjDesc(e.target.value)}
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleCreateProject} loading={creating} disabled={!projName.trim()}>
            Crear
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
