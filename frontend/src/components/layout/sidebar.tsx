"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Sparkles,
  Plus,
  Sun,
  Moon,
  LogOut,
  ChevronDown,
  Check,
} from "lucide-react";
import { NAV_ITEMS } from "./nav-items";
import { ConnectionBadge } from "./connection-badge";
import { useTheme } from "./theme-provider";
import { useAuthStore } from "@/lib/auth-store";
import { AUTH_DISABLED } from "@/lib/supabase";
import { fetchWorkspace, HAS_LIVE_BACKEND } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const user = useAuthStore((s) => s.user);
  const teams = useAuthStore((s) => s.teams);
  const teamId = useAuthStore((s) => s.teamId);
  const setTeamId = useAuthStore((s) => s.setTeamId);
  const logout = useAuthStore((s) => s.logout);
  const members = useAppStore((s) => s.members);
  const [teamOpen, setTeamOpen] = useState(false);

  const showReorgNav = !HAS_LIVE_BACKEND || members.some((m) => m.is_manager);
  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if ("managerOnly" in item && item.managerOnly) return showReorgNav;
    return true;
  });

  const activeTeam = teams.find((t) => t.id === teamId) ?? teams[0];

  async function switchTeam(id: string) {
    setTeamId(id);
    setTeamOpen(false);
    try {
      const { members, projects, requirements, tickets, mode } = await fetchWorkspace();
      if (mode === "live") {
        useAppStore.getState().setWorkspace({ members, projects, requirements, tickets });
      }
    } catch {
      // silencioso
    }
    onNavigate?.();
  }

  async function handleLogout() {
    await logout();
    onNavigate?.();
    router.replace("/login");
  }

  return (
    <div className="flex h-full w-64 flex-col bg-neutral-950 text-neutral-100">
      <div className="flex items-center gap-2.5 px-5 pb-2 pt-6">
        <div className="flex size-8 items-center justify-center rounded-lg bg-white text-neutral-900">
          <Sparkles className="size-4" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">Meeting → Tickets</p>
          <p className="text-[11px] text-neutral-500">AI PM Copilot</p>
        </div>
      </div>

      {!AUTH_DISABLED && teams.length > 0 && (
        <div className="relative px-3 pt-4">
          <button
            type="button"
            onClick={() => setTeamOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-sm transition hover:bg-white/10"
          >
            <span className="truncate font-medium">{activeTeam?.name ?? "Workspace"}</span>
            <ChevronDown className={cn("size-3.5 shrink-0 text-neutral-500 transition", teamOpen && "rotate-180")} />
          </button>
          {teamOpen && (
            <div className="absolute left-3 right-3 z-20 mt-1 overflow-hidden rounded-lg border border-white/10 bg-neutral-900 shadow-lg">
              {teams.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => void switchTeam(t.id)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-neutral-300 hover:bg-white/5"
                >
                  <span className="truncate">{t.name}</span>
                  {t.id === teamId && <Check className="size-3.5 text-white" />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="px-3 pt-5">
        <Link
          href="/reuniones/nueva"
          onClick={onNavigate}
          className="flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-200"
        >
          <Plus className="size-4" />
          Nueva reunión
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-3 pt-6">
        <p className="px-2.5 pb-2 text-[11px] font-medium uppercase tracking-wider text-neutral-600">
          Navegación
        </p>
        {visibleNavItems.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-white/10 text-white"
                  : "text-neutral-400 hover:bg-white/5 hover:text-neutral-100"
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-white/10 p-4">
        <ConnectionBadge />

        <button
          onClick={toggle}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-neutral-400 transition hover:bg-white/5 hover:text-neutral-200"
          aria-label="Cambiar tema"
        >
          {theme === "dark" ? (
            <>
              <Sun className="size-3.5" />
              Modo claro
            </>
          ) : (
            <>
              <Moon className="size-3.5" />
              Modo oscuro
            </>
          )}
        </button>

        {!AUTH_DISABLED && user && (
          <div className="space-y-1.5 px-1">
            <p className="truncate text-xs text-neutral-400" title={user.email}>
              {user.email}
            </p>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-xs font-medium text-neutral-500 transition hover:bg-white/5 hover:text-neutral-200"
            >
              <LogOut className="size-3.5" />
              Cerrar sesión
            </button>
          </div>
        )}

        <p className="px-1 text-[11px] leading-relaxed text-neutral-600">
          Meeting-to-Tickets · SaaS
        </p>
      </div>
    </div>
  );
}
