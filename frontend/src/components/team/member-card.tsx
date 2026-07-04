import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { loadColorClasses, SKILL_LABELS } from "@/lib/utils";
import type { Member } from "@/lib/types";

export function MemberCard({ member, assignedCount }: { member: Member; assignedCount: number }) {
  const c = loadColorClasses(member.current_load);

  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <Avatar name={member.name} size="lg" />
        <div>
          <p className="text-sm font-semibold text-neutral-900">{member.name}</p>
          <p className="text-xs text-neutral-500">{member.role}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {member.skills.map((s) => (
          <span key={s} className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600">
            {SKILL_LABELS[s]}
          </span>
        ))}
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-neutral-500">Carga actual</span>
          <span className={`font-semibold ${c.text}`}>{member.current_load}%</span>
        </div>
        <ProgressBar value={member.current_load} barClassName={c.bar} />
      </div>

      <p className="mt-3 text-xs text-neutral-400">{assignedCount} tickets asignados</p>
    </Card>
  );
}
