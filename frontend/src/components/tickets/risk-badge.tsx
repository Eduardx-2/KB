import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { riskColorClasses } from "@/lib/utils";

export function RiskBadge({ pct, reasoning }: { pct: number; reasoning?: string }) {
  const c = riskColorClasses(pct);
  const badge = (
    <Badge dotClassName={c.dot} className={`${c.bg} ${c.text} ring-1 ${c.ring}`}>
      {pct}%
    </Badge>
  );

  if (!reasoning) return badge;

  return (
    <Tooltip content={<span>{reasoning}</span>}>
      <span className="cursor-help">{badge}</span>
    </Tooltip>
  );
}
