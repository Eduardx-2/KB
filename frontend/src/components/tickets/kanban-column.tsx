"use client";

import { useDroppable } from "@dnd-kit/core";
import { TicketCard } from "./ticket-card";
import { cn } from "@/lib/utils";
import type { Member, Ticket, TicketStatus } from "@/lib/types";

export function KanbanColumn({
  status,
  label,
  tickets,
  members,
  onOpenTicket,
}: {
  status: TicketStatus;
  label: string;
  tickets: Ticket[];
  members: Member[];
  onOpenTicket: (ticket: Ticket) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div className="flex w-72 shrink-0 flex-col sm:w-80">
      <div className="mb-3 flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold text-neutral-800">{label}</h3>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">
          {tickets.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[120px] flex-1 flex-col gap-2.5 rounded-xl border border-transparent p-1.5 transition-colors",
          isOver && "border-neutral-300 bg-neutral-100/70"
        )}
      >
        {tickets.map((t) => (
          <TicketCard
            key={t.id}
            ticket={t}
            assignee={members.find((m) => m.id === t.assignee_id)}
            onOpen={() => onOpenTicket(t)}
          />
        ))}
        {tickets.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-neutral-200 py-6 text-xs text-neutral-300">
            Sin tickets
          </div>
        )}
      </div>
    </div>
  );
}
