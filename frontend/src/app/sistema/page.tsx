"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { HealthCard } from "@/components/system/health-card";
import { ArchitectureDiagram } from "@/components/system/architecture-diagram";
import { AgentLogsTable } from "@/components/system/agent-logs-table";
import { ErrorLogsTable } from "@/components/system/error-logs-table";
import { fetchErrorLogs, HAS_LIVE_BACKEND } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import type { ErrorLog } from "@/lib/types";

export default function SistemaPage() {
  const agentLogs = useAppStore((s) => s.agentLogs);
  const resetDemo = useAppStore((s) => s.resetDemo);

  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [loadingErrors, setLoadingErrors] = useState(false);

  const refreshErrors = useCallback(async () => {
    if (!HAS_LIVE_BACKEND) return;
    setLoadingErrors(true);
    try {
      setErrorLogs(await fetchErrorLogs(50));
    } finally {
      setLoadingErrors(false);
    }
  }, []);

  useEffect(() => {
    void refreshErrors();
  }, [refreshErrors]);

  return (
    <div>
      <PageHeader
        title="Sistema"
        description="Salud del backend, arquitectura y actividad reciente de los agentes de IA."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              resetDemo();
              toast.success("Datos de demo reiniciados");
            }}
          >
            <RotateCcw className="size-4" />
            Reiniciar demo
          </Button>
        }
      />

      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <HealthCard />
          <ArchitectureDiagram />
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Actividad de los agentes</h2>
          <AgentLogsTable logs={agentLogs} />
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">Errores registrados</h2>
            {HAS_LIVE_BACKEND && (
              <Button variant="outline" size="sm" onClick={() => void refreshErrors()} disabled={loadingErrors}>
                <RefreshCw className={loadingErrors ? "size-4 animate-spin" : "size-4"} />
                Actualizar
              </Button>
            )}
          </div>
          {HAS_LIVE_BACKEND ? (
            <ErrorLogsTable logs={errorLogs} />
          ) : (
            <p className="rounded-lg border border-dashed border-neutral-200 px-4 py-6 text-center text-sm text-neutral-400">
              Conectá <code>NEXT_PUBLIC_API_URL</code> para ver los errores del backend y del frontend.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
