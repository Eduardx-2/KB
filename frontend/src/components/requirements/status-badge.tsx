import { Badge } from "@/components/ui/badge";
import type { RequirementStatus } from "@/lib/types";

const CONFIG: Record<RequirementStatus, { label: string; className: string; dot: string }> = {
  draft: {
    label: "Borrador",
    className: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
    dot: "bg-neutral-400 dark:bg-neutral-500",
  },
  extracted: {
    label: "Tickets listos",
    className: "bg-sky-50 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-900",
    dot: "bg-sky-500",
  },
  approved: {
    label: "Aprobado",
    className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
    dot: "bg-emerald-500",
  },
};

export function RequirementStatusBadge({ status }: { status: RequirementStatus }) {
  const c = CONFIG[status];
  return (
    <Badge dotClassName={c.dot} className={c.className}>
      {c.label}
    </Badge>
  );
}
