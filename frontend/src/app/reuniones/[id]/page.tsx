"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, FileText, ShieldCheck, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { RequirementStatusBadge } from "@/components/requirements/status-badge";
import { ApproveDialog } from "@/components/requirements/approve-dialog";
import { KanbanBoard } from "@/components/tickets/kanban-board";
import { TicketDetailSheet } from "@/components/tickets/ticket-detail-sheet";
import { useAppStore } from "@/lib/store";
import { approveRequirement as approveRequirementApi, patchTicket } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import type { Ticket, TicketStatus } from "@/lib/types";
import Link from "next/link";

export default function RequirementBoardPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const hydrated = useAppStore((s) => s.hydrated);
  const requirements = useAppStore((s) => s.requirements);
  const allTickets = useAppStore((s) => s.tickets);
  const members = useAppStore((s) => s.members);
  const updateTicket = useAppStore((s) => s.updateTicket);
  const approveRequirementInStore = useAppStore((s) => s.approveRequirement);

  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  const requirement = requirements.find((r) => r.id === params.id);
  const tickets = useMemo(
    () => allTickets.filter((t) => t.requirement_id === params.id),
    [allTickets, params.id]
  );

  const selected = tickets.find((t) => t.id === selectedTicket?.id) ?? null;

  const assignees = useMemo(() => {
    const ids = new Set(tickets.map((t) => t.assignee_id).filter(Boolean) as string[]);
    return members.filter((m) => ids.has(m.id));
  }, [tickets, members]);

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-8">
        <Skeleton className="h-8 w-80" />
        <div className="flex gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-96 w-72" />
          ))}
        </div>
      </div>
    );
  }

  if (!requirement) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <EmptyState
          title="No encontramos esa reunión"
          description="Puede que el enlace esté mal o que los datos de demo se hayan reiniciado."
          action={
            <Link href="/">
              <Button size="sm" variant="outline">
                <ArrowLeft className="size-4" />
                Volver al panel
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  async function handleMove(ticketId: string, status: TicketStatus) {
    updateTicket(ticketId, { status });
    await patchTicket(ticketId, { status });
  }

  async function handleUpdate(patch: Partial<Pick<Ticket, "status" | "assignee_id" | "deadline">>) {
    if (!selected) return;
    updateTicket(selected.id, patch);
    await patchTicket(selected.id, patch);
  }

  async function handleApprove() {
    if (!requirement) return;
    setApproving(true);
    try {
      const { n8n_notified } = await approveRequirementApi(requirement.id);
      approveRequirementInStore(requirement.id);
      setApproveOpen(false);
      toast.success("Plan aprobado", {
        description: n8n_notified
          ? `Se notificó por email a ${assignees.length || "todo"} el equipo.`
          : "Aprobado, pero el webhook de notificaciones no respondió.",
      });
    } catch {
      toast.error("No se pudo aprobar. Intentá de nuevo.");
    } finally {
      setApproving(false);
    }
  }

  const isExtracted = requirement.status !== "draft";
  const isApproved = requirement.status === "approved";

  return (
    <div>
      <PageHeader
        title={requirement.title}
        description={requirement.summary || "Todavía no hay resumen — esperando extracción de la IA."}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setTranscriptOpen(true)}>
              <FileText className="size-4" />
              Transcript
            </Button>
            {isApproved ? (
              <span className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                <ShieldCheck className="size-4" />
                Aprobado
              </span>
            ) : (
              <Button size="sm" disabled={!isExtracted} onClick={() => setApproveOpen(true)}>
                <ShieldCheck className="size-4" />
                Aprobar plan
              </Button>
            )}
          </>
        }
      />

      <div className="border-b border-neutral-200 bg-white px-4 pb-4 sm:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <RequirementStatusBadge status={requirement.status} />
          <span className="text-xs text-neutral-400">
            creado {formatRelativeTime(requirement.created_at)} · {tickets.length} tickets
          </span>
        </div>
      </div>

      <div className="p-4 sm:p-8">
        {!isExtracted ? (
          <EmptyState
            icon={<Sparkles className="size-5" />}
            title="Esta reunión todavía no tiene tickets"
            description="Volvé a procesarla desde 'Nueva reunión' para generar el resumen y los tickets."
          />
        ) : (
          <KanbanBoard
            tickets={tickets}
            members={members}
            onOpenTicket={setSelectedTicket}
            onMove={handleMove}
          />
        )}
      </div>

      <TicketDetailSheet
        ticket={selected}
        members={members}
        onClose={() => setSelectedTicket(null)}
        onUpdate={handleUpdate}
      />

      <ApproveDialog
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        onConfirm={handleApprove}
        loading={approving}
        assignees={assignees}
      />

      <Dialog open={transcriptOpen} onClose={() => setTranscriptOpen(false)} className="max-w-2xl">
        <h2 className="text-lg font-semibold text-neutral-900">Transcript original</h2>
        <div className="mt-3 max-h-[60vh] overflow-y-auto rounded-xl bg-neutral-50 p-4 text-sm leading-relaxed text-neutral-600">
          {requirement.raw_transcript || "Sin transcript disponible."}
        </div>
      </Dialog>
    </div>
  );
}
