"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, Calendar, ChevronRight, Layers, Mic, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { RequirementStatusBadge } from "@/components/requirements/status-badge";
import { KanbanBoard } from "@/components/tickets/kanban-board";
import { TicketDetailSheet } from "@/components/tickets/ticket-detail-sheet";
import { CreateTicketDialog } from "@/components/tickets/create-ticket-dialog";
import { useAppStore } from "@/lib/store";
import {
  createTicket, fetchProjectWork, fetchWorkspace, patchTicket,
} from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { CreateTicketInput, Project, Requirement, Ticket, TicketStatus } from "@/lib/types";

function findDuplicateWarnings(tickets: Ticket[]): string[] {
  const warnings: string[] = [];
  const titles = tickets.map((t) => t.title.toLowerCase().trim());
  for (let i = 0; i < titles.length; i++) {
    for (let j = i + 1; j < titles.length; j++) {
      const a = titles[i];
      const b = titles[j];
      if (a === b || a.includes(b) || b.includes(a)) {
        warnings.push(`Posible duplicado: "${tickets[i].title}" y "${tickets[j].title}"`);
      }
    }
  }
  return [...new Set(warnings)].slice(0, 5);
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const hydrated = useAppStore((s) => s.hydrated);
  const storeProjects = useAppStore((s) => s.projects);
  const storeRequirements = useAppStore((s) => s.requirements);
  const storeTickets = useAppStore((s) => s.tickets);
  const members = useAppStore((s) => s.members);
  const updateTicket = useAppStore((s) => s.updateTicket);
  const addTicket = useAppStore((s) => s.addTicket);
  const setWorkspace = useAppStore((s) => s.setWorkspace);

  const [project, setProject] = useState<Project | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [meetings, setMeetings] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDefaultStatus, setCreateDefaultStatus] = useState<TicketStatus>("backlog");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const fromStore = storeProjects.find((p) => p.id === params.id);
      if (fromStore) {
        setProject(fromStore);
        setRequirements(storeRequirements.filter((r) => r.project_id === params.id));
        setTickets(storeTickets.filter((t) => t.project_id === params.id));
      }
      const data = await fetchProjectWork(params.id);
      if (data.project) {
        setProject(data.project);
        setRequirements(data.requirements);
        setTickets(data.tickets);
        setMeetings(data.meetings);
      }
      setLoading(false);
    }
    if (hydrated) load();
  }, [hydrated, params.id, storeProjects, storeRequirements, storeTickets]);

  const duplicateWarnings = useMemo(() => findDuplicateWarnings(tickets), [tickets]);
  const selected = tickets.find((t) => t.id === selectedTicket?.id) ?? null;

  const stats = useMemo(() => {
    const done = tickets.filter((t) => t.status === "done").length;
    const totalHours = tickets.reduce((a, t) => a + t.estimate_hours, 0);
    return { done, total: tickets.length, totalHours, pct: tickets.length ? Math.round((done / tickets.length) * 100) : 0 };
  }, [tickets]);

  async function handleMove(ticketId: string, status: TicketStatus) {
    updateTicket(ticketId, { status });
    setTickets((prev) => prev.map((t) => (t.id === ticketId ? { ...t, status } : t)));
    await patchTicket(ticketId, { status });
  }

  async function handleUpdate(patch: Partial<Pick<Ticket, "status" | "assignee_id" | "deadline">>) {
    if (!selected) return;
    updateTicket(selected.id, patch);
    setTickets((prev) => prev.map((t) => (t.id === selected.id ? { ...t, ...patch } : t)));
    await patchTicket(selected.id, patch);
  }

  async function handleCreateTicket(input: CreateTicketInput) {
    const { ticket, mode } = await createTicket({ ...input, project_id: params.id });
    if (ticket) {
      addTicket(ticket);
      setTickets((prev) => [ticket, ...prev.filter((t) => t.id !== ticket.id)]);
      toast.success("Ticket creado");
      if (mode === "live") {
        const workspace = await fetchWorkspace();
        if (workspace.mode === "live") setWorkspace(workspace);
      }
    } else {
      toast.error("No se pudo crear el ticket");
    }
  }

  if (!hydrated || loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-8">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-32" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <EmptyState
          title="Proyecto no encontrado"
          description="Revisá la URL o volvé al listado de proyectos."
          action={
            <Link href="/proyectos">
              <Button size="sm" variant="outline">
                <ArrowLeft className="size-4" />
                Volver a proyectos
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={project.name}
        description={project.description ?? project.business_area ?? "Proyecto del equipo"}
        actions={
          <>
            <Link href="/proyectos">
              <Button size="sm" variant="ghost">
                <ArrowLeft className="size-4" />
                Proyectos
              </Button>
            </Link>
            <Link href={`/reuniones/nueva?project_id=${project.id}`}>
              <Button size="sm">
                <Mic className="size-4" />
                Nueva reunión
              </Button>
            </Link>
          </>
        }
      />

      <div className="mx-auto max-w-6xl space-y-8 p-4 sm:p-8">
        {/* Resumen */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Reuniones</p>
            <p className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{requirements.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Tickets</p>
            <p className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{stats.total}</p>
          </Card>
          <Card className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Progreso</p>
            <p className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{stats.pct}%</p>
          </Card>
          <Card className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Horas est.</p>
            <p className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{stats.totalHours}h</p>
          </Card>
        </div>

        {duplicateWarnings.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Posibles solapamientos detectados</p>
                <ul className="mt-2 space-y-1 text-xs text-amber-700 dark:text-amber-400">
                  {duplicateWarnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Reuniones del proyecto */}
        <section>
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            <Layers className="size-4" />
            Reuniones y requirements
          </h2>
          {requirements.length === 0 ? (
            <EmptyState
              title="Sin reuniones todavía"
              description="Creá la primera reunión para este proyecto y la IA generará tickets granulares."
              action={
                <Link href={`/reuniones/nueva?project_id=${project.id}`}>
                  <Button size="sm">
                    <Mic className="size-4" />
                    Nueva reunión
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="space-y-2">
              {requirements.map((req) => (
                <Link key={req.id} href={`/reuniones/${req.id}`}>
                  <Card className="flex items-center justify-between p-4 transition hover:border-neutral-300 dark:hover:border-neutral-700">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{req.title}</span>
                        <RequirementStatusBadge status={req.status} />
                      </div>
                      <p className="mt-1 line-clamp-1 text-xs text-neutral-500">
                        {req.summary || "Sin resumen"} · {formatRelativeTime(req.created_at)}
                      </p>
                    </div>
                    <ChevronRight className="size-4 text-neutral-400" />
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Kanban acumulado del proyecto */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Kanban del proyecto ({tickets.length} tickets)
            </h2>
            <Button
              size="sm"
              variant="outline"
              disabled={requirements.length === 0}
              onClick={() => { setCreateDefaultStatus("backlog"); setCreateOpen(true); }}
            >
              Agregar ticket manual
            </Button>
          </div>
          {tickets.length === 0 ? (
            <EmptyState title="Sin tickets" description="Procesá una reunión o creá tickets manualmente." />
          ) : (
            <KanbanBoard
              tickets={tickets}
              members={members}
              onOpenTicket={setSelectedTicket}
              onMove={handleMove}
              onAddTicket={(status) => { setCreateDefaultStatus(status); setCreateOpen(true); }}
            />
          )}
        </section>

        {/* Meetings registrados */}
        {meetings.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-neutral-900 dark:text-neutral-100">Meetings en Supabase</h2>
            <div className="space-y-2">
              {meetings.map((m) => (
                <div key={String(m.id)} className="flex items-center gap-3 rounded-lg border border-neutral-200 px-4 py-3 text-sm dark:border-neutral-800">
                  <Calendar className="size-4 text-neutral-400" />
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">{String(m.title ?? "Meeting")}</span>
                  <span className="text-xs text-neutral-400">{String(m.status ?? "")}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <TicketDetailSheet
        ticket={selected}
        members={members}
        onClose={() => setSelectedTicket(null)}
        onUpdate={handleUpdate}
      />

      <CreateTicketDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreateTicket}
        requirements={requirements}
        members={members}
        defaultRequirementId={requirements[0]?.id}
        defaultStatus={createDefaultStatus}
      />
    </div>
  );
}
