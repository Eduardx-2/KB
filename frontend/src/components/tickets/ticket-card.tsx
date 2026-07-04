"use client";

import { useDraggable } from "@dnd-kit/core";
import { Clock, GripVertical } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PriorityBadge } from "@/components/tickets/priority-badge";
import { RiskBadge } from "@/components/tickets/risk-badge";
import { SKILL_LABELS, cn } from "@/lib/utils";
import type { Member, Ticket } from "@/lib/types";

export function TicketCard({
  ticket,
  assignee,
  onOpen,
}: {
  ticket: Ticket;
  assignee?: Member;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: ticket.id,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group rounded-xl border border-neutral-200 bg-white p-3.5 shadow-sm transition",
        isDragging ? "z-50 opacity-90 shadow-lg" : "hover:border-neutral-300 hover:shadow-md"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="line-clamp-2 text-sm font-medium text-neutral-900">{ticket.title}</p>
        </button>
        <button
          {...attributes}
          {...listeners}
          className="shrink-0 cursor-grab touch-none rounded p-1 text-neutral-300 opacity-0 group-hover:opacity-100 active:cursor-grabbing"
          aria-label="Mover ticket"
        >
          <GripVertical className="size-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <PriorityBadge priority={ticket.priority} />
        <Badge className="bg-neutral-100 text-neutral-600">{SKILL_LABELS[ticket.required_skill]}</Badge>
        {ticket.risk_pct > 0 && <RiskBadge pct={ticket.risk_pct} reasoning={ticket.reasoning} />}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-neutral-400">
          <Clock className="size-3.5" />
          {ticket.estimate_hours}h
        </div>
        {assignee ? (
          <Avatar name={assignee.name} size="sm" />
        ) : (
          <span className="rounded-full border border-dashed border-neutral-300 px-2 py-0.5 text-[10px] text-neutral-400">
            Sin asignar
          </span>
        )}
      </div>
    </div>
  );
}
