"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, Calendar, TriangleAlert, MessageSquare, Send, ListTree, Plus } from "lucide-react";
import { toast } from "sonner";
import { Sheet } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PriorityBadge } from "@/components/tickets/priority-badge";
import { RiskBadge } from "@/components/tickets/risk-badge";
import { createTicket, createTicketComment, fetchTicketComments } from "@/lib/api";
import { STATUS_LABELS, SKILL_LABELS, riskColorClasses, formatRelativeTime, WORK_PHASE_LABELS } from "@/lib/utils";
import type { Member, Ticket, TicketComment, TicketStatus } from "@/lib/types";
import { useAppStore } from "@/lib/store";

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
  const allTickets = useAppStore((s) => s.tickets);
  const addTicket = useAppStore((s) => s.addTicket);
  const assignee = ticket ? members.find((m) => m.id === ticket.assignee_id) : undefined;
  const risk = ticket ? riskColorClasses(ticket.risk_pct) : null;

  const [comments, setComments] = useState<TicketComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const [subTitle, setSubTitle] = useState("");
  const [addingSub, setAddingSub] = useState(false);

  const children = useMemo(
    () => (ticket ? allTickets.filter((t) => t.parent_ticket_id === ticket.id) : []),
    [allTickets, ticket]
  );

  useEffect(() => {
    if (!ticket) {
      setComments([]);
      return;
    }
    setLoadingComments(true);
    fetchTicketComments(ticket.id)
      .then(setComments)
      .finally(() => setLoadingComments(false));
  }, [ticket?.id]);

  async function handleAddComment() {
    if (!ticket || !commentText.trim()) return;
    setPostingComment(true);
    try {
      const manager = members.find((m) => m.is_manager);
      const created = await createTicketComment(ticket.id, commentText.trim(), manager?.id);
      if (created) {
        setComments((prev) => [...prev, created]);
        setCommentText("");
        toast.success("Comentario agregado");
      } else {
        toast.error("No se pudo guardar el comentario");
      }
    } finally {
      setPostingComment(false);
    }
  }

  async function handleAddSubtask() {
    if (!ticket || !subTitle.trim()) return;
    setAddingSub(true);
    try {
      const { ticket: created } = await createTicket({
        requirement_id: ticket.requirement_id,
        project_id: ticket.project_id,
        title: subTitle.trim(),
        priority: ticket.priority,
        estimate_hours: 2,
        required_skill: ticket.required_skill,
        status: "backlog",
        parent_ticket_id: ticket.id,
      });
      if (created) {
        addTicket(created);
        setSubTitle("");
        toast.success("Subtarea creada");
      } else {
        toast.error("No se pudo crear la subtarea");
      }
    } finally {
      setAddingSub(false);
    }
  }

  return (
    <Sheet open={Boolean(ticket)} onClose={onClose}>
      {ticket && (
        <div className="flex h-full flex-col overflow-y-auto bg-white p-6 pt-14 dark:bg-neutral-950">
          <div className="flex flex-wrap items-center gap-1.5">
            <PriorityBadge priority={ticket.priority} />
            <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              {SKILL_LABELS[ticket.required_skill]}
            </span>
            {ticket.work_phase && (
              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                {WORK_PHASE_LABELS[ticket.work_phase]}
              </span>
            )}
            {ticket.parent_ticket_id && (
              <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                Subtarea
              </span>
            )}
            {ticket.risk_pct > 0 && <RiskBadge pct={ticket.risk_pct} />}
          </div>

          <h2 className="mt-3 text-lg font-semibold text-neutral-900 dark:text-neutral-100">{ticket.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">{ticket.description}</p>

          {ticket.acceptance_criteria && (
            <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Criterios de aceptación</p>
              <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">{ticket.acceptance_criteria}</p>
            </div>
          )}

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

          {!ticket.parent_ticket_id && (
            <div className="mt-6 border-t border-neutral-100 pt-5 dark:border-neutral-800">
              <div className="mb-3 flex items-center gap-2">
                <ListTree className="size-4 text-neutral-400" />
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Subtareas</h3>
                <span className="text-xs text-neutral-400">({children.length})</span>
              </div>
              {children.length === 0 ? (
                <p className="mb-3 text-sm text-neutral-400">
                  Sin subtareas. Partí el trabajo aquí en vez de crear tickets sueltos.
                </p>
              ) : (
                <ul className="mb-3 space-y-2">
                  {children.map((c) => {
                    const childAssignee = members.find((m) => m.id === c.assignee_id);
                    return (
                      <li
                        key={c.id}
                        className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
                      >
                        <span className="font-medium text-neutral-800 dark:text-neutral-200">{c.title}</span>
                        <span className="text-xs text-neutral-400">
                          {STATUS_LABELS[c.status]}
                          {childAssignee ? ` · ${childAssignee.name}` : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="flex gap-2">
                <input
                  value={subTitle}
                  onChange={(e) => setSubTitle(e.target.value)}
                  placeholder="Nueva subtarea…"
                  className={inputCls}
                  disabled={addingSub}
                />
                <Button
                  size="sm"
                  className="shrink-0 self-center"
                  onClick={handleAddSubtask}
                  loading={addingSub}
                  disabled={!subTitle.trim()}
                >
                  <Plus className="size-4" />
                </Button>
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

          <div className="mt-8 border-t border-neutral-100 pt-5 dark:border-neutral-800">
            <div className="mb-3 flex items-center gap-2">
              <MessageSquare className="size-4 text-neutral-400" />
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Comentarios</h3>
              <span className="text-xs text-neutral-400">({comments.length})</span>
            </div>

            {loadingComments ? (
              <p className="text-sm text-neutral-400">Cargando comentarios…</p>
            ) : comments.length === 0 ? (
              <p className="text-sm text-neutral-400 dark:text-neutral-500">
                Sin comentarios todavía. Agregá decisiones, bloqueos o seguimiento.
              </p>
            ) : (
              <ul className="mb-4 space-y-3">
                {comments.map((c) => {
                  const author = members.find((m) => m.id === c.author_id);
                  return (
                    <li key={c.id} className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-900">
                      <div className="mb-1 flex items-center gap-2 text-xs text-neutral-500">
                        {author && <Avatar name={author.name} size="sm" />}
                        <span className="font-medium text-neutral-700 dark:text-neutral-300">
                          {author?.name ?? "Equipo"}
                        </span>
                        {c.created_at && (
                          <span className="text-neutral-400">{formatRelativeTime(c.created_at)}</span>
                        )}
                      </div>
                      <p className="text-sm text-neutral-700 dark:text-neutral-300">{c.body}</p>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex gap-2">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                rows={2}
                placeholder="Escribí un comentario…"
                className={`${inputCls} flex-1 resize-none`}
                disabled={postingComment}
              />
              <Button
                size="sm"
                className="self-end"
                onClick={handleAddComment}
                loading={postingComment}
                disabled={!commentText.trim()}
              >
                <Send className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}
