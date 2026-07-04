"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Server, Wifi, WifiOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { checkHealth, HAS_LIVE_BACKEND, API_BASE } from "@/lib/api";
import type { HealthState } from "@/lib/types";
import { cn } from "@/lib/utils";

export function HealthCard() {
  const [health, setHealth] = useState<HealthState | null>(null);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    const h = await checkHealth();
    setHealth(h);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  const ok = health?.status === "ok";

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "flex size-9 items-center justify-center rounded-lg",
              ok ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
            )}
          >
            {ok ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-900">
              {HAS_LIVE_BACKEND ? "Backend FastAPI" : "Modo demo (sin backend)"}
            </p>
            <p className="text-xs text-neutral-500">
              {HAS_LIVE_BACKEND ? API_BASE : "Usando simulación local fiel al contrato"}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={refresh} loading={loading}>
          <RefreshCw className="size-4" />
        </Button>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2.5 text-xs text-neutral-500">
        <Server className="size-3.5" />
        {health
          ? `status: ${health.status} · versión: ${health.version ?? "n/a"} · modo: ${health.mode}`
          : "Verificando…"}
      </div>
    </Card>
  );
}
