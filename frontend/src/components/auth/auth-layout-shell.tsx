"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { AuthGate } from "@/components/auth/auth-gate";

const BARE_PREFIXES = ["/login", "/signup", "/invite", "/auth", "/onboarding"];

function isBarePath(pathname: string) {
  return BARE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Decide si renderizar AppShell + AuthGate o solo children (páginas de auth).
 */
export function AuthLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (isBarePath(pathname)) {
    return <>{children}</>;
  }

  return (
    <AuthGate>
      <AppShell>{children}</AppShell>
    </AuthGate>
  );
}
