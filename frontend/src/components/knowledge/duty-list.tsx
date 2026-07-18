"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DUTY_TYPE_LABELS, cn } from "@/lib/utils";
import type { MemberDuty } from "@/lib/types";

export function DutyList({
  duties,
  onDelete,
  deletingId,
}: {
  duties: MemberDuty[];
  onDelete?: (id: string) => void;
  deletingId?: string | null;
}) {
  if (duties.length === 0) {
    return (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Sin responsabilidades recurrentes registradas.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {duties.map((d) => (
        <li
          key={d.id}
          className={cn(
            "flex items-start justify-between gap-3 rounded-xl border border-neutral-200 p-3.5 dark:border-neutral-800",
            !d.is_active && "opacity-60"
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{d.title}</p>
              <Badge className="bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                {DUTY_TYPE_LABELS[d.duty_type]}
              </Badge>
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">{d.load_pct}% carga</span>
            </div>
            {d.description && (
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{d.description}</p>
            )}
            {d.hours_per_week != null && d.hours_per_week > 0 && (
              <p className="mt-1 text-[11px] text-neutral-400">{d.hours_per_week}h / semana</p>
            )}
          </div>
          {onDelete && (
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0 text-neutral-400 hover:text-red-600"
              onClick={() => onDelete(d.id)}
              loading={deletingId === d.id}
              aria-label="Eliminar responsabilidad"
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
