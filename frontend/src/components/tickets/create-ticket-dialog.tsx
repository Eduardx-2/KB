"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { CreateTicketInput, Member, Priority, Requirement, Skill, TicketStatus } from "@/lib/types";
import { SKILL_LABELS } from "@/lib/utils";

const inputCls =
  "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-neutral-400 focus:ring-4 focus:ring-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-neutral-500";

interface CreateTicketDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: CreateTicketInput) => Promise<void>;
  requirements: Requirement[];
  members: Member[];
  defaultRequirementId?: string;
  defaultStatus?: TicketStatus;
  defaultAssigneeId?: string | null;
  loading?: boolean;
}

export function CreateTicketDialog({
  open,
  onClose,
  onSubmit,
  requirements,
  members,
  defaultRequirementId,
  defaultStatus = "backlog",
  defaultAssigneeId,
  loading = false,
}: CreateTicketDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [requirementId, setRequirementId] = useState(defaultRequirementId ?? requirements[0]?.id ?? "");
  const [priority, setPriority] = useState<Priority>("medium");
  const [estimateHours, setEstimateHours] = useState(4);
  const [requiredSkill, setRequiredSkill] = useState<Skill>("frontend");
  const [status, setStatus] = useState<TicketStatus>(defaultStatus);
  const [assigneeId, setAssigneeId] = useState(defaultAssigneeId ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!title.trim() || !requirementId) return;
    setSubmitting(true);
    try {
      await onSubmit({
        requirement_id: requirementId,
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        estimate_hours: estimateHours,
        required_skill: requiredSkill,
        status,
        assignee_id: assigneeId || null,
      });
      setTitle("");
      setDescription("");
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} className="max-w-lg">
      <div className="flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-lg bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900">
          <Plus className="size-4" />
        </div>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Nuevo ticket</h2>
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-neutral-500">Título</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej. Mapeo de flujos en Figma"
            className={inputCls}
            disabled={loading || submitting}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-neutral-500">Descripción</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Detalle concreto de la tarea…"
            className={`${inputCls} resize-none`}
            disabled={loading || submitting}
          />
        </div>

        {requirements.length > 1 && (
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-neutral-500">Reunión / requirement</label>
            <select
              value={requirementId}
              onChange={(e) => setRequirementId(e.target.value)}
              className={inputCls}
              disabled={loading || submitting}
            >
              {requirements.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-neutral-500">Prioridad</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={inputCls} disabled={loading || submitting}>
              <option value="low">Baja</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-neutral-500">Horas est.</label>
            <input
              type="number"
              min={1}
              value={estimateHours}
              onChange={(e) => setEstimateHours(Number(e.target.value) || 1)}
              className={inputCls}
              disabled={loading || submitting}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-neutral-500">Skill</label>
            <select value={requiredSkill} onChange={(e) => setRequiredSkill(e.target.value as Skill)} className={inputCls} disabled={loading || submitting}>
              {(Object.keys(SKILL_LABELS) as Skill[]).map((s) => (
                <option key={s} value={s}>
                  {SKILL_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-neutral-500">Estado inicial</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as TicketStatus)} className={inputCls} disabled={loading || submitting}>
              <option value="backlog">Backlog</option>
              <option value="todo">Por hacer</option>
              <option value="in_progress">En progreso</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-neutral-500">Asignar a</label>
          <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={inputCls} disabled={loading || submitting}>
            <option value="">Sin asignar</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {m.current_load}% carga
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={submitting}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} loading={submitting || loading} disabled={!title.trim() || !requirementId}>
          Crear ticket
        </Button>
      </div>
    </Dialog>
  );
}
