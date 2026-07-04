import { Badge } from "@/components/ui/badge";
import { priorityClasses, priorityLabel } from "@/lib/utils";
import type { Priority } from "@/lib/types";

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <Badge className={priorityClasses(priority)}>{priorityLabel(priority)}</Badge>;
}
