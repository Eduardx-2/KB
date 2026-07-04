import { Badge } from "@/components/ui/badge";
import type { RequirementStatus } from "@/lib/types";

const CONFIG: Record<RequirementStatus, { label: string; className: string; dot: string }> = {
  draft: { label: "Borrador", className: "bg-neutral-100 text-neutral-600", dot: "bg-neutral-400" },
  extracted: { label: "Tickets listos", className: "bg-sky-50 text-sky-700 ring-1 ring-sky-200", dot: "bg-sky-500" },
  approved: {
    label: "Aprobado",
    className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
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
