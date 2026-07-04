"use client";

import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { KanbanColumn } from "./kanban-column";
import { STATUS_LABELS } from "@/lib/utils";
import type { Member, Ticket, TicketStatus } from "@/lib/types";

const COLUMNS: TicketStatus[] = ["backlog", "todo", "in_progress", "done"];

export function KanbanBoard({
  tickets,
  members,
  onOpenTicket,
  onMove,
}: {
  tickets: Ticket[];
  members: Member[];
  onOpenTicket: (ticket: Ticket) => void;
  onMove: (ticketId: string, status: TicketStatus) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const newStatus = over.id as TicketStatus;
    const ticket = tickets.find((t) => t.id === active.id);
    if (ticket && ticket.status !== newStatus) {
      onMove(ticket.id, newStatus);
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            label={STATUS_LABELS[status]}
            tickets={tickets.filter((t) => t.status === status)}
            members={members}
            onOpenTicket={onOpenTicket}
          />
        ))}
      </div>
    </DndContext>
  );
}
