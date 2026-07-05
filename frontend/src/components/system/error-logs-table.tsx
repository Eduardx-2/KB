import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { ErrorLog } from "@/lib/types";

const SEVERITY_CLASSES: Record<ErrorLog["severity"], string> = {
  info: "bg-neutral-100 text-neutral-600",
  warning: "bg-amber-50 text-amber-700",
  error: "bg-red-50 text-red-700",
  critical: "bg-red-600 text-white",
};

const SOURCE_LABELS: Record<ErrorLog["source"], string> = {
  backend: "Backend",
  frontend: "Frontend",
  worker: "Worker",
};

export function ErrorLogsTable({ logs }: { logs: ErrorLog[] }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-100 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Severidad</th>
              <th className="px-4 py-3 font-medium">Origen</th>
              <th className="px-4 py-3 font-medium">Endpoint</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Mensaje</th>
              <th className="px-4 py-3 font-medium">Cuándo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {logs.map((log) => (
              <tr key={log.id} className="align-top hover:bg-neutral-50/60">
                <td className="px-4 py-3">
                  <Badge className={cn(SEVERITY_CLASSES[log.severity])}>{log.severity}</Badge>
                </td>
                <td className="px-4 py-3 text-neutral-500">{SOURCE_LABELS[log.source]}</td>
                <td className="px-4 py-3 font-mono text-xs text-neutral-600">
                  {log.http_method ? `${log.http_method} ` : ""}
                  {log.path ?? "—"}
                </td>
                <td className="px-4 py-3 tabular-nums text-neutral-500">{log.http_status ?? "—"}</td>
                <td className="px-4 py-3 text-neutral-700">
                  <div className="max-w-md truncate" title={log.message}>
                    {log.error_type ? <span className="font-medium">{log.error_type}: </span> : null}
                    {log.message}
                  </div>
                  {log.request_id ? (
                    <div className="mt-0.5 font-mono text-[11px] text-neutral-400">req: {log.request_id}</div>
                  ) : null}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-neutral-400">
                  {formatRelativeTime(log.created_at)}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">
                  Sin errores registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
