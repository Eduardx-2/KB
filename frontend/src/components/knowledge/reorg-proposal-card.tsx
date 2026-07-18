"use client";

import { Check, X, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MarkdownPreview } from "@/components/knowledge/markdown-editor";
import { REORG_STATUS_LABELS, cn, formatRelativeTime } from "@/lib/utils";
import type { ReorgProposal } from "@/lib/types";

const STATUS_TONE: Record<string, string> = {
  pending_boss: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  approved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  rejected: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  draft: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  applied: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
};

const ACTION_LABELS: Record<string, string> = {
  keep: "Mantener",
  reschedule: "Reprogramar",
  reassign: "Reasignar",
  postpone: "Postergar",
  drop: "Eliminar",
};

export function ReorgProposalCard({
  proposal,
  memberName,
  onDecide,
  deciding,
  showActions = true,
}: {
  proposal: ReorgProposal;
  memberName?: string;
  onDecide?: (decision: "approved" | "rejected", note?: string) => void;
  deciding?: boolean;
  showActions?: boolean;
}) {
  const name = memberName ?? proposal.member_name ?? proposal.member_id;
  const canDecide = showActions && proposal.status === "pending_boss" && onDecide;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="size-4 text-neutral-400" />
              Reorganización — {name}
            </CardTitle>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-500">
              {proposal.proposed_by_agent && (
                <>
                  <Bot className="size-3.5" />
                  Propuesta del agente ·
                </>
              )}
              Disparada por {proposal.triggered_by === "absence" ? "ausencia" : proposal.triggered_by === "overload" ? "sobrecarga" : "riesgo de deadline"}
              {proposal.created_at && <> · {formatRelativeTime(proposal.created_at)}</>}
            </p>
          </div>
          <Badge className={cn("text-xs", STATUS_TONE[proposal.status] ?? STATUS_TONE.draft)}>
            {REORG_STATUS_LABELS[proposal.status]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <MarkdownPreview content={proposal.reason_md} />

        {proposal.items && proposal.items.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">Acciones propuestas</p>
            <ul className="space-y-1.5">
              {proposal.items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-lg bg-neutral-50 px-3 py-2 text-sm dark:bg-neutral-900"
                >
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">
                    {ACTION_LABELS[item.action] ?? item.action}
                  </span>
                  {" — "}
                  <span className="text-neutral-600 dark:text-neutral-400">
                    {item.ticket_title ?? item.ticket_id}
                  </span>
                  {item.rationale && (
                    <p className="mt-0.5 text-xs text-neutral-500">{item.rationale}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {proposal.boss_decision_note && (
          <div className="rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800">
            <p className="text-xs font-medium text-neutral-500">Nota del jefe</p>
            <p className="mt-1 text-neutral-700 dark:text-neutral-300">{proposal.boss_decision_note}</p>
          </div>
        )}

        {canDecide && (
          <div className="flex flex-wrap gap-2 border-t border-neutral-100 pt-4 dark:border-neutral-800">
            <Button
              size="sm"
              onClick={() => onDecide!("approved")}
              loading={deciding}
            >
              <Check className="size-4" />
              Aprobar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onDecide!("rejected", "Rechazada por el manager")}
              loading={deciding}
            >
              <X className="size-4" />
              Rechazar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
