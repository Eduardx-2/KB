"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Users2, TriangleAlert, CheckCircle2, Hourglass, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { MemberCard } from "@/components/team/member-card";
import { StatCard } from "@/components/dashboard/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";

export default function EquipoPage() {
  const hydrated = useAppStore((s) => s.hydrated);
  const members = useAppStore((s) => s.members);
  const tickets = useAppStore((s) => s.tickets);

  const stats = useMemo(() => {
    if (!hydrated) return null;
    const avgLoad = Math.round(members.reduce((a, m) => a + m.current_load, 0) / (members.length || 1));
    const overloaded = members.filter((m) => m.current_load > 80).length;
    const done = tickets.filter((t) => t.status === "done").length;
    const inProgress = tickets.filter((t) => t.status === "in_progress").length;
    const highRisk = tickets.filter((t) => t.risk_pct > 70).length;
    return { avgLoad, overloaded, done, inProgress, highRisk };
  }, [hydrated, members, tickets]);

  return (
    <div>
      <PageHeader
        title="Equipo"
        description="Carga, skills y rendimiento. Hacé clic en un developer para ver su dashboard completo."
        actions={
          <Link href="/reuniones/nueva">
            <Button size="sm" variant="outline">
              <Plus className="size-4" />
              Nueva reunión
            </Button>
          </Link>
        }
      />

      <div className="mx-auto max-w-6xl space-y-8 p-4 sm:p-8">
        {/* Métricas del equipo */}
        {!hydrated ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard
              label="Miembros"
              value={members.length}
              hint="en el equipo de IT"
              icon={Users2}
            />
            <StatCard
              label="Carga promedio"
              value={`${stats!.avgLoad}%`}
              hint={stats!.overloaded > 0 ? `${stats!.overloaded} sobrecargado(s)` : "todo en rango"}
              icon={Hourglass}
              tone={stats!.overloaded > 0 ? "amber" : "emerald"}
            />
            <StatCard
              label="Tickets completados"
              value={stats!.done}
              hint={`${stats!.inProgress} en progreso`}
              icon={CheckCircle2}
              tone="emerald"
            />
            <StatCard
              label="Tickets en riesgo alto"
              value={stats!.highRisk}
              hint="riesgo > 70%"
              icon={TriangleAlert}
              tone={stats!.highRisk > 0 ? "red" : "emerald"}
            />
          </div>
        )}

        {/* Grid de developers */}
        {!hydrated ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-52" />)}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Equipo — {members.length} miembros
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {members.map((m) => (
                <MemberCard
                  key={m.id}
                  member={m}
                  tickets={tickets.filter((t) => t.assignee_id === m.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
