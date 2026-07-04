import Link from "next/link";
import { ChevronRight, ListChecks } from "lucide-react";
import { RequirementStatusBadge } from "@/components/requirements/status-badge";
import { formatRelativeTime } from "@/lib/utils";
import type { Requirement, Ticket } from "@/lib/types";

export function RequirementRow({ requirement, tickets }: { requirement: Requirement; tickets: Ticket[] }) {
  const highRisk = tickets.filter((t) => t.risk_pct > 70).length;

  return (
    <Link
      href={`/reuniones/${requirement.id}`}
      className="group flex items-center gap-4 rounded-xl border border-neutral-200 bg-white px-4 py-3.5 transition hover:border-neutral-300 hover:shadow-sm"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500">
        <ListChecks className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-neutral-900">{requirement.title}</p>
        <p className="mt-0.5 truncate text-xs text-neutral-500">
          {tickets.length} tickets · creado {formatRelativeTime(requirement.created_at)}
          {highRisk > 0 && <span className="text-red-600"> · {highRisk} en riesgo alto</span>}
        </p>
      </div>
      <RequirementStatusBadge status={requirement.status} />
      <ChevronRight className="size-4 shrink-0 text-neutral-300 transition group-hover:translate-x-0.5 group-hover:text-neutral-500" />
    </Link>
  );
}
