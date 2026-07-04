"use client";

import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { HealthCard } from "@/components/system/health-card";
import { ArchitectureDiagram } from "@/components/system/architecture-diagram";
import { AgentLogsTable } from "@/components/system/agent-logs-table";
import { useAppStore } from "@/lib/store";

export default function SistemaPage() {
  const agentLogs = useAppStore((s) => s.agentLogs);
  const resetDemo = useAppStore((s) => s.resetDemo);

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
      </div>
    </div>
  );
}
