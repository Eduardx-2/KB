"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft, CheckCircle2, Clock, Hourglass, TriangleAlert,
  TrendingUp, AlertCircle, Layers, ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PriorityBadge } from "@/components/tickets/priority-badge";
import { RiskBadge } from "@/components/tickets/risk-badge";
import { RequirementStatusBadge } from "@/components/requirements/status-badge";
import { useAppStore } from "@/lib/store";
import { SKILL_LABELS, STATUS_LABELS, loadColorClasses, cn } from "@/lib/utils";
import type { Ticket } from "@/lib/types";

const STATUS_COLORS: Record<Ticket["status"], string> = {
  done: "bg-emerald-500",
  in_progress: "bg-sky-500",
  todo: "bg-amber-400",
  backlog: "bg-neutral-300 dark:bg-neutral-600",
};

const STATUS_BG: Record<Ticket["status"], string> = {
  done: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  in_progress: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  todo: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  backlog: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};

function MiniStatCard({
  label, value, sub, icon: Icon, tone = "neutral",
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  tone?: "neutral" | "emerald" | "red" | "amber" | "sky";
}) {
  const iconBg = {
    neutral: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
    red: "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
    sky: "bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-400",
  }[tone];

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{label}</p>
        <div className={cn("flex size-7 items-center justify-center rounded-lg", iconBg)}>
          <Icon className="size-3.5" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{sub}</p>}
    </Card>
  );
}

function StatusBar({ tickets }: { tickets: Ticket[] }) {
  const total = tickets.length;
  if (total === 0) return null;
  const groups = (["done", "in_progress", "todo", "backlog"] as const).map((s) => ({
    status: s,
    count: tickets.filter((t) => t.status === s).length,
  }));

  return (
    <div className="space-y-3">
      <div className="flex h-3 overflow-hidden rounded-full">
        {groups.map(({ status, count }) =>
          count > 0 ? (
            <div
              key={status}
              className={cn("transition-all", STATUS_COLORS[status])}
              style={{ width: `${(count / total) * 100}%` }}
              title={`${STATUS_LABELS[status]}: ${count}`}
            />
          ) : null
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        {groups.map(({ status, count }) => (
          <div key={status} className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
            <span className={cn("size-2 rounded-full", STATUS_COLORS[status])} />
            {STATUS_LABELS[status]}
            <span className="font-medium text-neutral-700 dark:text-neutral-200">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RiskBar({ value, label }: { value: number; label: string }) {
  const barColor = value > 70 ? "bg-red-500" : value > 40 ? "bg-amber-400" : "bg-emerald-500";
  const textColor = value > 70 ? "text-red-600 dark:text-red-400" : value > 40 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-neutral-600 dark:text-neutral-400">{label}</span>
        <span className={cn("font-semibold", textColor)}>{value}%</span>
      </div>
      <ProgressBar value={value} barClassName={barColor} />
    </div>
  );
}

export default function DevDashboardPage() {
  const params = useParams<{ id: string }>();
  const hydrated = useAppStore((s) => s.hydrated);
  const members = useAppStore((s) => s.members);
  const allTickets = useAppStore((s) => s.tickets);
  const requirements = useAppStore((s) => s.requirements);

  const member = members.find((m) => m.id === params.id);
  const myTickets = useMemo(
    () => allTickets.filter((t) => t.assignee_id === params.id),
    [allTickets, params.id]
  );

  const metrics = useMemo(() => {
    const total = myTickets.length;
    const done = myTickets.filter((t) => t.status === "done").length;
    const inProgress = myTickets.filter((t) => t.status === "in_progress").length;
    const todo = myTickets.filter((t) => t.status === "todo").length;
    const backlog = myTickets.filter((t) => t.status === "backlog").length;
    const totalHours = myTickets.reduce((a, t) => a + t.estimate_hours, 0);
    const doneHours = myTickets.filter((t) => t.status === "done").reduce((a, t) => a + t.estimate_hours, 0);
    const pendingHours = totalHours - doneHours;
    const avgRisk = total > 0 ? Math.round(myTickets.reduce((a, t) => a + t.risk_pct, 0) / total) : 0;
    const highRisk = myTickets.filter((t) => t.risk_pct > 70).length;
    const completionPct = total > 0 ? Math.round((done / total) * 100) : 0;
    // Velocidad aproximada: hrs completadas vs total
    const velocityPct = totalHours > 0 ? Math.round((doneHours / totalHours) * 100) : 0;

    return {
      total, done, inProgress, todo, backlog,
      totalHours, doneHours, pendingHours,
      avgRisk, highRisk, completionPct, velocityPct,
    };
  }, [myTickets]);

  // Agrupar tickets por reunión/requisito
  const byRequirement = useMemo(() => {
    const reqIds = [...new Set(myTickets.map((t) => t.requirement_id))];
    return reqIds.map((rid) => ({
      requirement: requirements.find((r) => r.id === rid),
      tickets: myTickets.filter((t) => t.requirement_id === rid),
    }));
  }, [myTickets, requirements]);

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 p-8">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <EmptyState
          title="Developer no encontrado"
          description="Revisá la URL o volvé al panel de equipo."
          action={
            <Link href="/equipo">
              <Button size="sm" variant="outline">
                <ArrowLeft className="size-4" />
                Volver al equipo
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  const lc = loadColorClasses(member.current_load);
  const overloaded = member.current_load > 80;

  return (
    <div>
      <PageHeader
        title={member.name}
        description={member.role}
        actions={
          <Link href="/equipo">
            <Button size="sm" variant="ghost">
              <ArrowLeft className="size-4" />
              Equipo
            </Button>
          </Link>
        }
      />

      <div className="mx-auto max-w-5xl space-y-8 p-4 sm:p-8">

        {/* ── Perfil ── */}
        <Card className="p-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Avatar name={member.name} size="lg" className="size-14 text-lg" />
              <div>
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{member.name}</h2>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">{member.role}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {member.skills.map((s) => (
                    <span key={s} className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                      {SKILL_LABELS[s]}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Gauge de carga */}
            <div className="min-w-[180px] space-y-2 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-neutral-600 dark:text-neutral-400">Carga actual</span>
                <span className={cn("font-bold text-sm", lc.text)}>{member.current_load}%</span>
              </div>
              <ProgressBar value={member.current_load} barClassName={lc.bar} />
              {overloaded && (
                <p className="flex items-center gap-1 text-[11px] text-red-500 dark:text-red-400">
                  <AlertCircle className="size-3" />
                  Sobrecargado — asignar con cuidado
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* ── Métricas clave ── */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MiniStatCard
            label="Total tickets"
            value={metrics.total}
            sub={`${metrics.totalHours}h estimadas`}
            icon={Layers}
          />
          <MiniStatCard
            label="Completados"
            value={metrics.done}
            sub={`${metrics.completionPct}% del total`}
            icon={CheckCircle2}
            tone="emerald"
          />
          <MiniStatCard
            label="En progreso"
            value={metrics.inProgress}
            sub={`${metrics.todo} en cola`}
            icon={TrendingUp}
            tone="sky"
          />
          <MiniStatCard
            label="Horas restantes"
            value={`${metrics.pendingHours}h`}
            sub={`${metrics.doneHours}h entregadas`}
            icon={Hourglass}
            tone={metrics.pendingHours > 40 ? "amber" : "neutral"}
          />
        </div>

        {/* ── Estado de tickets + riesgo ── */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Distribución por estado</CardTitle>
            </CardHeader>
            <CardContent>
              {metrics.total === 0 ? (
                <p className="text-sm text-neutral-400 dark:text-neutral-600">Sin tickets asignados.</p>
              ) : (
                <StatusBar tickets={myTickets} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Exposición al riesgo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {metrics.total === 0 ? (
                <p className="text-sm text-neutral-400 dark:text-neutral-600">Sin datos.</p>
              ) : (
                <>
                  <RiskBar value={metrics.avgRisk} label="Riesgo promedio" />
                  <RiskBar value={metrics.velocityPct} label="Velocidad de entrega (hrs)" />
                  <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2.5 dark:bg-neutral-800">
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">Tickets riesgo alto (&gt;70%)</span>
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-semibold",
                      metrics.highRisk > 0
                        ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                    )}>
                      {metrics.highRisk} {metrics.highRisk === 0 ? "✓" : "⚠"}
                    </span>
                  </div>

                  {/* Proyección */}
                  <div className="mt-1 rounded-xl border border-dashed border-neutral-200 p-3 dark:border-neutral-700">
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">Proyección</p>
                    <p className="text-sm text-neutral-700 dark:text-neutral-300">
                      {member.current_load > 80
                        ? "⚠ Sobrecargado — alta probabilidad de demoras."
                        : member.current_load > 60
                        ? "Carga moderada — monitorear si se suman tickets."
                        : "Capacidad disponible — puede absorber más trabajo."}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Tickets por proyecto ── */}
        <section>
          <h2 className="mb-4 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Tickets por proyecto
          </h2>

          {byRequirement.length === 0 ? (
            <EmptyState
              icon={<Layers className="size-5" />}
              title="Sin tickets asignados"
              description="Cuando se procese una reunión y el Assignment Agent asigne tickets a este developer, aparecerán acá."
            />
          ) : (
            <div className="space-y-5">
              {byRequirement.map(({ requirement, tickets: reqTickets }) => (
                <Card key={requirement?.id ?? "unknown"} className="overflow-hidden p-0">
                  {/* Cabecera del proyecto */}
                  <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50/60 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-800/40">
                    <div className="flex items-center gap-2.5">
                      <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                        {requirement?.title ?? "Reunión desconocida"}
                      </p>
                      {requirement && <RequirementStatusBadge status={requirement.status} />}
                    </div>
                    {requirement && (
                      <Link
                        href={`/reuniones/${requirement.id}`}
                        className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                      >
                        Ver board <ChevronRight className="size-3" />
                      </Link>
                    )}
                  </div>

                  {/* Lista de tickets */}
                  <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {reqTickets.map((ticket) => (
                      <div key={ticket.id} className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-50/60 dark:hover:bg-neutral-800/30">
                        <span className={cn("size-2 shrink-0 rounded-full", STATUS_COLORS[ticket.status])} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-neutral-800 dark:text-neutral-200">{ticket.title}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-400 dark:text-neutral-500">
                            <span className="flex items-center gap-1">
                              <Clock className="size-3" /> {ticket.estimate_hours}h
                            </span>
                            <span>{SKILL_LABELS[ticket.required_skill]}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <PriorityBadge priority={ticket.priority} />
                          {ticket.risk_pct > 0 && <RiskBadge pct={ticket.risk_pct} />}
                          <Badge className={STATUS_BG[ticket.status]}>
                            {STATUS_LABELS[ticket.status]}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pie resumen del proyecto */}
                  <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50/40 px-4 py-2 text-xs text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/20 dark:text-neutral-400">
                    <span>{reqTickets.length} tickets · {reqTickets.reduce((a, t) => a + t.estimate_hours, 0)}h estimadas</span>
                    <span>{reqTickets.filter((t) => t.status === "done").length} completados</span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
