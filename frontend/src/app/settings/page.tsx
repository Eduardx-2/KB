"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Copy, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";
import { fetchPlans, fetchUsage, inviteMember } from "@/lib/api";
import { AUTH_DISABLED } from "@/lib/supabase";
import type { MembershipRole, Plan, UsageSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

type Tab = "workspace" | "members" | "usage";

const ROLE_OPTIONS: MembershipRole[] = ["admin", "member", "viewer"];

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const teamId = useAuthStore((s) => s.teamId);
  const role = useAuthStore((s) => s.role);
  const teams = useAuthStore((s) => s.teams);
  const activeTeam = teams.find((t) => t.id === teamId) ?? teams[0] ?? null;

  const [tab, setTab] = useState<Tab>("workspace");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MembershipRole>("member");
  const [inviting, setInviting] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(false);

  const canInvite = role === "owner" || role === "admin" || AUTH_DISABLED;

  const loadBilling = useCallback(async () => {
    setLoadingUsage(true);
    try {
      const [u, p] = await Promise.all([fetchUsage(), fetchPlans()]);
      setUsage(u);
      setPlans(p);
    } finally {
      setLoadingUsage(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "usage") void loadBilling();
  }, [tab, loadBilling, teamId]);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const result = await inviteMember(inviteEmail.trim(), inviteRole);
      if (!result) {
        toast.error("No se pudo enviar la invitación");
        return;
      }
      const url = `${window.location.origin}/invite/${result.token}`;
      setLastInviteUrl(url);
      setInviteEmail("");
      toast.success(`Invitación creada para ${result.email}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al invitar");
    } finally {
      setInviting(false);
    }
  }

  function copyInvite() {
    if (!lastInviteUrl) return;
    void navigator.clipboard.writeText(lastInviteUrl);
    toast.success("Link copiado");
  }

  const meetingsUsed = (usage?.usage?.meetings ?? 0);
  const tokensUsed =
    (usage?.usage?.tokens ?? 0) +
    (usage?.usage?.tokens_in ?? 0) +
    (usage?.usage?.tokens_out ?? 0);
  const meetingsCap = usage?.team?.max_meetings_per_month;
  const tokensCap = usage?.team?.max_tokens_per_month;

  return (
    <div>
      <PageHeader
        title="Configuración"
        description="Workspace, miembros e uso del plan."
      />

      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
        <div className="flex gap-1 border-b border-[var(--border)]">
          {(
            [
              ["workspace", "Workspace"],
              ["members", "Miembros"],
              ["usage", "Uso y plan"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium transition-colors",
                tab === id
                  ? "border-b-2 border-neutral-900 text-neutral-900 dark:border-neutral-100 dark:text-neutral-100"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "workspace" && (
          <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Workspace activo</h2>
            {activeTeam ? (
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-[var(--muted)]">Nombre</dt>
                  <dd className="mt-0.5 font-medium text-[var(--foreground)]">{activeTeam.name}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Slug</dt>
                  <dd className="mt-0.5 font-mono text-[var(--foreground)]">{activeTeam.slug}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Plan</dt>
                  <dd className="mt-0.5 capitalize text-[var(--foreground)]">
                    {activeTeam.plan_tier ?? usage?.team?.plan_tier ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Tu rol</dt>
                  <dd className="mt-0.5 capitalize text-[var(--foreground)]">{role ?? "—"}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[var(--muted)]">Tu cuenta</dt>
                  <dd className="mt-0.5 text-[var(--foreground)]">{user?.email ?? "—"}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-[var(--muted)]">
                {AUTH_DISABLED
                  ? "Modo demo: no hay workspace SaaS activo."
                  : "No hay workspace seleccionado."}
              </p>
            )}
          </section>
        )}

        {tab === "members" && (
          <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-[var(--muted)]" />
              <h2 className="text-sm font-semibold text-[var(--foreground)]">Invitar miembro</h2>
            </div>

            {!canInvite ? (
              <p className="text-sm text-[var(--muted)]">
                Solo owners y admins pueden invitar miembros.
              </p>
            ) : (
              <form onSubmit={onInvite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label htmlFor="invite-email" className="mb-1 block text-xs font-medium text-[var(--muted)]">
                    Email
                  </label>
                  <input
                    id="invite-email"
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-neutral-500"
                    placeholder="colegá@empresa.com"
                  />
                </div>
                <div>
                  <label htmlFor="invite-role" className="mb-1 block text-xs font-medium text-[var(--muted)]">
                    Rol
                  </label>
                  <select
                    id="invite-role"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as MembershipRole)}
                    className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm outline-none"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="submit" loading={inviting} disabled={!teamId && !AUTH_DISABLED}>
                  Invitar
                </Button>
              </form>
            )}

            {lastInviteUrl && (
              <div className="flex items-center gap-2 rounded-lg bg-[var(--surface-raised)] px-3 py-2">
                <code className="flex-1 truncate text-xs text-[var(--muted)]">{lastInviteUrl}</code>
                <Button type="button" variant="ghost" size="sm" onClick={copyInvite}>
                  <Copy className="size-3.5" />
                  Copiar
                </Button>
              </div>
            )}
          </section>
        )}

        {tab === "usage" && (
          <section className="space-y-5">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[var(--foreground)]">Uso del mes</h2>
                <Button variant="outline" size="sm" onClick={() => void loadBilling()} loading={loadingUsage}>
                  Actualizar
                </Button>
              </div>
              {usage ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <UsageBar
                    label="Reuniones"
                    used={meetingsUsed}
                    cap={typeof meetingsCap === "number" ? meetingsCap : null}
                  />
                  <UsageBar
                    label="Tokens"
                    used={tokensUsed}
                    cap={typeof tokensCap === "number" ? tokensCap : null}
                  />
                </div>
              ) : (
                <p className="text-sm text-[var(--muted)]">
                  {loadingUsage ? "Cargando…" : "No hay datos de uso disponibles."}
                </p>
              )}
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <h2 className="mb-4 text-sm font-semibold text-[var(--foreground)]">Planes</h2>
              {plans.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No hay planes cargados.</p>
              ) : (
                <ul className="space-y-3">
                  {plans.map((plan) => {
                    const isCurrent =
                      (activeTeam?.plan_tier ?? usage?.team?.plan_tier) === plan.code;
                    return (
                      <li
                        key={plan.id}
                        className={cn(
                          "flex items-center justify-between rounded-lg border px-4 py-3",
                          isCurrent
                            ? "border-neutral-900 dark:border-neutral-100"
                            : "border-[var(--border)]"
                        )}
                      >
                        <div>
                          <p className="text-sm font-medium text-[var(--foreground)]">{plan.name}</p>
                          <p className="text-xs text-[var(--muted)]">
                            {plan.max_meetings_per_month != null
                              ? `${plan.max_meetings_per_month} reuniones/mes`
                              : "Sin límite de reuniones"}
                            {plan.max_members != null ? ` · ${plan.max_members} miembros` : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-[var(--foreground)]">
                            {plan.price_cents_monthly == null || plan.price_cents_monthly === 0
                              ? "Gratis"
                              : `$${(plan.price_cents_monthly / 100).toFixed(0)}/mes`}
                          </p>
                          {isCurrent && (
                            <span className="text-[11px] font-medium text-[var(--muted)]">Actual</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function UsageBar({
  label,
  used,
  cap,
}: {
  label: string;
  used: number;
  cap: number | null;
}) {
  const pct = cap && cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-xs">
        <span className="font-medium text-[var(--foreground)]">{label}</span>
        <span className="text-[var(--muted)]">
          {used}
          {cap != null ? ` / ${cap}` : ""}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-raised)]">
        <div
          className="h-full rounded-full bg-neutral-900 transition-all dark:bg-neutral-100"
          style={{ width: `${cap != null ? pct : Math.min(100, used > 0 ? 20 : 0)}%` }}
        />
      </div>
    </div>
  );
}
