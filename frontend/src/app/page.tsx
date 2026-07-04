"use client";

import Link from "next/link";
import { ClipboardList, TriangleAlert, Users2, Gauge, Plus, ArrowRight } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { RequirementRow } from "@/components/dashboard/requirement-row";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardPage() {
  const hydrated = useAppStore((s) => s.hydrated);
  const requirements = useAppStore((s) => s.requirements);
  const tickets = useAppStore((s) => s.tickets);
  const members = useAppStore((s) => s.members);

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-8">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const pending = requirements.filter((r) => r.status !== "approved").length;
  const highRiskTickets = tickets.filter((t) => t.risk_pct > 70).length;
  const avgLoad = Math.round(members.reduce((acc, m) => acc + m.current_load, 0) / (members.length || 1));

  const sorted = [...requirements].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div>
      <PageHeader
        title="Panel general"
        description="De la reunión al plan de trabajo aprobado, en un solo lugar."
        actions={
          <Link href="/reuniones/nueva">
            <Button>
              <Plus className="size-4" />
              Nueva reunión
            </Button>
          </Link>
        }
      />

      <div className="mx-auto max-w-6xl space-y-8 p-4 sm:p-8">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Reuniones procesadas" value={requirements.length} icon={ClipboardList} />
          <StatCard
            label="Pendientes de aprobar"
            value={pending}
            hint={pending > 0 ? "esperando revisión" : "todo al día"}
            icon={Gauge}
            tone={pending > 0 ? "amber" : "emerald"}
          />
          <StatCard
            label="Tickets en riesgo alto"
            value={highRiskTickets}
            hint="riesgo > 70%"
            icon={TriangleAlert}
            tone={highRiskTickets > 0 ? "red" : "emerald"}
          />
          <StatCard label="Carga promedio del equipo" value={`${avgLoad}%`} icon={Users2} />
        </div>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">Reuniones recientes</h2>
            {sorted.length > 0 && (
              <Link
                href="/reuniones/nueva"
                className="flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-900"
              >
                Procesar otra <ArrowRight className="size-3.5" />
              </Link>
            )}
          </div>

          {sorted.length === 0 ? (
            <EmptyState
              icon={<ClipboardList className="size-5" />}
              title="Todavía no procesás ninguna reunión"
              description="Subí o pegá el transcript de una reunión de requerimientos y dejá que la IA arme el plan de trabajo."
              action={
                <Link href="/reuniones/nueva">
                  <Button size="sm">
                    <Plus className="size-4" />
                    Empezar ahora
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="space-y-2">
              {sorted.map((r) => (
                <RequirementRow key={r.id} requirement={r} tickets={tickets.filter((t) => t.requirement_id === r.id)} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
