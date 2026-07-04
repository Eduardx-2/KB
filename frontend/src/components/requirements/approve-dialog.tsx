"use client";

import { Mail, ShieldCheck } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import type { Member } from "@/lib/types";

export function ApproveDialog({
  open,
  onClose,
  onConfirm,
  loading,
  assignees,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  assignees: Member[];
}) {
  return (
    <Dialog open={open} onClose={onClose}>
      <div className="flex size-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <ShieldCheck className="size-5" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-neutral-900">¿Aprobar este plan de trabajo?</h2>
      <p className="mt-1.5 text-sm text-neutral-500">
        Se notificará por correo a cada persona asignada (vía n8n) y quedará marcado como aprobado.
      </p>

      {assignees.length > 0 && (
        <div className="mt-4 space-y-2 rounded-xl bg-neutral-50 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-neutral-500">
            <Mail className="size-3.5" /> Se enviará email a
          </p>
          {assignees.map((m) => (
            <div key={m.id} className="flex items-center gap-2.5 text-sm text-neutral-700">
              <Avatar name={m.name} size="sm" />
              {m.name} <span className="text-neutral-400">· {m.role}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button className="flex-1" onClick={onConfirm} loading={loading}>
          Aprobar y notificar
        </Button>
      </div>
    </Dialog>
  );
}
