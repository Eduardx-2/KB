"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Bot, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ReorgProposalCard } from "@/components/knowledge/reorg-proposal-card";
import { useAppStore } from "@/lib/store";
import { fetchReorgProposals, triggerReorgAgent, fetchMemberAbsences } from "@/lib/api";
import type { ReorgProposal, MemberAbsence } from "@/lib/types";

export default function MemberReorgHistoryPage() {
  const params = useParams<{ id: string }>();
  const hydrated = useAppStore((s) => s.hydrated);
  const members = useAppStore((s) => s.members);
  const member = members.find((m) => m.id === params.id);

  const [proposals, setProposals] = useState<ReorgProposal[]>([]);
  const [absences, setAbsences] = useState<MemberAbsence[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  async function load() {
    setLoading(true);
    const [all, abs] = await Promise.all([
      fetchReorgProposals(),
      fetchMemberAbsences(params.id),
    ]);
    setProposals(all.proposals.filter((p) => p.member_id === params.id));
    setAbsences(abs.absences);
    setLoading(false);
  }

  useEffect(() => {
    if (hydrated) void load();
  }, [hydrated, params.id]);

  async function handleTrigger(absenceId?: string) {
    setTriggering(true);
    const { proposal } = await triggerReorgAgent(params.id, absenceId);
    if (proposal) {
      toast.success("Agente de reorganización ejecutado");
      await load();
    } else {
      toast.error("No se pudo ejecutar el agente");
    }
    setTriggering(false);
  }

  if (!hydrated || loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`Reorganización — ${member?.name ?? "Miembro"}`}
        description="Historial de propuestas de reorganización por ausencia o sobrecarga"
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void handleTrigger()} loading={triggering}>
              <Bot className="size-4" />
              Ejecutar agente
            </Button>
            <Link href={`/equipo/${params.id}/perfil`}>
              <Button size="sm" variant="ghost">
                <ArrowLeft className="size-4" />
                Perfil
              </Button>
            </Link>
          </div>
        }
      />

      <div className="mx-auto max-w-3xl space-y-8 p-4 sm:p-8">
        {absences.length > 0 && (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Ausencias activas o recientes</p>
            <ul className="mt-2 space-y-1">
              {absences.slice(0, 3).map((a) => (
                <li key={a.id} className="flex items-center justify-between text-xs text-amber-700 dark:text-amber-400">
                  <span>{a.start_date} → {a.end_date} · {a.reason}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => void handleTrigger(a.id)}
                    loading={triggering}
                  >
                    Reorg por ausencia
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Propuestas ({proposals.length})
            </h2>
            <Button size="sm" variant="ghost" onClick={() => void load()}>
              <RefreshCw className="size-4" />
            </Button>
          </div>
          {proposals.length === 0 ? (
            <EmptyState
              title="Sin propuestas"
              description="Ejecutá el agente de reorganización cuando haya ausencia o sobrecarga."
            />
          ) : (
            <div className="space-y-4">
              {proposals.map((p) => (
                <ReorgProposalCard
                  key={p.id}
                  proposal={p}
                  memberName={member?.name}
                  showActions={false}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
