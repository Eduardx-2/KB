"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AUTH_DISABLED } from "@/lib/supabase";
import { useAuthStore } from "@/lib/auth-store";

const PUBLIC_PREFIXES = ["/login", "/signup", "/invite", "/auth"];

function isPublicPath(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Gate de autenticación client-side (más fiable que cookies sin @supabase/ssr).
 * Redirige a /login si no hay sesión; a /onboarding si no hay team.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const loading = useAuthStore((s) => s.loading);
  const user = useAuthStore((s) => s.user);
  const teamId = useAuthStore((s) => s.teamId);
  const teams = useAuthStore((s) => s.teams);

  useEffect(() => {
    if (AUTH_DISABLED) return;
    if (loading) return;
    if (isPublicPath(pathname)) return;

    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    // Usuario autenticado sin workspace → onboarding
    if (!teamId && teams.length === 0 && pathname !== "/onboarding") {
      router.replace("/onboarding");
    }
  }, [loading, user, teamId, teams.length, pathname, router]);

  if (AUTH_DISABLED) return <>{children}</>;

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--background)]">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900 dark:border-neutral-700 dark:border-t-neutral-100" />
          <p className="text-sm text-[var(--muted)]">Cargando sesión…</p>
        </div>
      </div>
    );
  }

  if (!user && !isPublicPath(pathname)) {
    return null;
  }

  return <>{children}</>;
}
