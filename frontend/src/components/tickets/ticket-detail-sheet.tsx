"use client";

import { Clock, Calendar, TriangleAlert } from "lucide-react";
import { Sheet } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/avatar";
import { PriorityBadge } from "@/components/tickets/priority-badge";
import { RiskBadge } from "@/components/tickets/risk-badge";
import { STATUS_LABELS, SKILL_LABELS, riskColorClasses } from "@/lib/utils";
import type { Member, Ticket, TicketStatus } from "@/lib/types";

const STATUS_OPTIONS: TicketStatus[] = ["backlog", "todo", "in_progress", "done"];

const inputCls =
  "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-neutral-400 focus:ring-4 focus:ring-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-neutral-500 dark:focus:ring-neutral-800";

export function TicketDetailSheet({
  ticket,
  members,
  onClose,
  onUpdate,
}: {
  ticket: Ticket | null;
  members: Member[];
  onClose: () => void;
  onUpdate: (patch: Partial<Pick<Ticket, "status" | "assignee_id" | "deadline">>) => void;
}) {
  const assignee = ticket ? members.find((m) => m.id === ticket.assignee_id) : undefined;
  const risk = ticket ? riskColorClasses(ticket.risk_pct) : null;

  return (
    <Sheet open={Boolean(ticket)} onClose={onClose}>
      {ticket && (
        <div className="flex h-full flex-col overflow-y-auto bg-white p-6 pt-14 dark:bg-neutral-950">
          <div className="flex flex-wrap items-center gap-1.5">
            <PriorityBadge priority={ticket.priority} />
            <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              {SKILL_LABELS[ticket.required_skill]}
            </span>
            {ticket.risk_pct > 0 && <RiskBadge pct={ticket.risk_pct} />}
          </div>

          <h2 className="mt-3 text-lg font-semibold text-neutral-900 dark:text-neutral-100">{ticket.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">{ticket.description}</p>

          <div className="mt-5 flex items-center gap-4 text-sm text-neutral-500 dark:text-neutral-400">
            <div className="flex items-center gap-1.5">
              <Clock className="size-4" />
              {ticket.estimate_hours}h estimadas
            </div>
          </div>

          {ticket.reasoning && risk && (
            <div className={`mt-5 flex gap-2.5 rounded-xl ${risk.bg} p-3.5 ring-1 ${risk.ring}`}>
              <TriangleAlert className={`mt-0.5 size-4 shrink-0 ${risk.text}`} />
              <div>
                <p className={`text-sm font-medium ${risk.text}`}>Razonamiento del Assignment Agent</p>
                <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-300">{ticket.reasoning}</p>
              </div>
            </div>
          )}

          <div className="mt-6 space-y-4 border-t border-neutral-100 pt-5 dark:border-neutral-800">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Estado
              </label>
              <select
                value={ticket.status}
                onChange={(e) => onUpdate({ status: e.target.value as TicketStatus })}
                className={inputCls}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Asignado a
              </label>
              <div className="flex items-center gap-2">
                {assignee && <Avatar name={assignee.name} size="sm" />}
                <select
                  value={ticket.assignee_id ?? ""}
                  onChange={(e) => onUpdate({ assignee_id: e.target.value || null })}
                  className={inputCls}
                >
                  <option value="">Sin asignar</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} · {m.role} ({m.current_load}% carga)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Fecha límite
              </label>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
                <input
                  type="date"
                  value={ticket.deadline ?? ""}
                  onChange={(e) => onUpdate({ deadline: e.target.value || null })}
                  className={`${inputCls} pl-9`}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}
