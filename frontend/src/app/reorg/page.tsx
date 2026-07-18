"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Inbox, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { ReorgProposalCard } from "@/components/knowledge/reorg-proposal-card";
import { useAppStore } from "@/lib/store";
import { fetchReorgProposals, decideReorgProposal } from "@/lib/api";
import type { ReorgProposal } from "@/lib/types";

export default function ReorgInboxPage() {
  const hydrated = useAppStore((s) => s.hydrated);
  const members = useAppStore((s) => s.members);

  const [pending, setPending] = useState<ReorgProposal[]>([]);
  const [all, setAll] = useState<ReorgProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [p, a] = await Promise.all([
      fetchReorgProposals("pending_boss"),
      fetchReorgProposals(),
    ]);
    setPending(p.proposals);
    setAll(a.proposals);
    setLoading(false);
  }

  useEffect(() => {
    if (hydrated) void load();
  }, [hydrated]);

  async function handleDecide(id: string, decision: "approved" | "rejected", note?: string) {
    setDecidingId(id);
    const { proposal } = await decideReorgProposal(id, decision, note);
    if (proposal) {
      toast.success(decision === "approved" ? "Propuesta aprobada" : "Propuesta rechazada");
      await load();
    } else {
      toast.error("No se pudo procesar la decisión");
    }
    setDecidingId(null);
  }

  const resolved = all.filter((p) => p.status !== "pending_boss" && p.status !== "draft");

  return (
    <div>
      <PageHeader
        title="Bandeja de reorganización"
        description="Propuestas del agente pendientes de aprobación del jefe"
        actions={
          <Button size="sm" variant="outline" onClick={() => void load()}>
            <RefreshCw className="size-4" />
            Actualizar
          </Button>
        }
      />

      <div className="mx-auto max-w-3xl space-y-8 p-4 sm:p-8">
        {!hydrated || loading ? (
          <>
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </>
        ) : (
          <>
            <section>
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                <Inbox className="size-4" />
                Pendientes ({pending.length})
              </h2>
              {pending.length === 0 ? (
                <EmptyState
                  title="Bandeja vacía"
                  description="No hay propuestas de reorganización pendientes de aprobación."
                />
              ) : (
                <div className="space-y-4">
                  {pending.map((p) => (
                    <ReorgProposalCard
                      key={p.id}
                      proposal={p}
                      memberName={members.find((m) => m.id === p.member_id)?.name}
                      onDecide={(d, n) => handleDecide(p.id, d, n)}
                      deciding={decidingId === p.id}
                    />
                  ))}
                </div>
              )}
            </section>

            {resolved.length > 0 && (
              <section>
                <h2 className="mb-4 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Historial reciente
                </h2>
                <div className="space-y-4">
                  {resolved.map((p) => (
                    <ReorgProposalCard
                      key={p.id}
                      proposal={p}
                      memberName={members.find((m) => m.id === p.member_id)?.name}
                      showActions={false}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
