import { CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/utils";
import type { AgentLog } from "@/lib/types";

const AGENT_LABELS: Record<AgentLog["agent"], string> = {
  meeting: "Meeting Agent",
  assignment: "Assignment Agent",
  transcribe: "Transcripción",
  approve: "Aprobación (n8n)",
};

export function AgentLogsTable({ logs }: { logs: AgentLog[] }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-100 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Agente</th>
              <th className="px-4 py-3 font-medium">Modelo</th>
              <th className="px-4 py-3 font-medium">Latencia</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Cuándo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-neutral-50/60">
                <td className="px-4 py-3 font-medium text-neutral-800">{AGENT_LABELS[log.agent]}</td>
                <td className="px-4 py-3 text-neutral-500">{log.model}</td>
                <td className="px-4 py-3 tabular-nums text-neutral-500">{log.latency_ms} ms</td>
                <td className="px-4 py-3">
                  {log.ok ? (
                    <span className="flex items-center gap-1 text-emerald-600">
                      <CheckCircle2 className="size-3.5" /> ok
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-red-600">
                      <XCircle className="size-3.5" /> error
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-400">{formatRelativeTime(log.created_at)}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">
                  Sin actividad todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
