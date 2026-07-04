"use client";

import { useEffect, useState } from "react";
import { checkHealth, HAS_LIVE_BACKEND } from "@/lib/api";
import type { HealthState } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ConnectionBadge({ compact = false }: { compact?: boolean }) {
  const [health, setHealth] = useState<HealthState | null>(null);

  useEffect(() => {
    let alive = true;
    checkHealth().then((h) => alive && setHealth(h));
    const interval = setInterval(() => {
      checkHealth().then((h) => alive && setHealth(h));
    }, 30000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  const ok = health?.status === "ok";
  const dotClass = !health ? "bg-neutral-500" : ok ? "bg-emerald-400" : "bg-red-400";
  const label = !health
    ? "Verificando…"
    : HAS_LIVE_BACKEND
      ? ok
        ? "Backend en vivo"
        : "Backend sin respuesta"
      : "Modo demo (mock)";

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-neutral-300",
        compact && "border-none bg-transparent p-0"
      )}
    >
      <span className={cn("size-1.5 rounded-full", dotClass, health && "animate-pulse-dot")} />
      <span>{label}</span>
    </div>
  );
}
