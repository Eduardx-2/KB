import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { loadColorClasses, SKILL_LABELS } from "@/lib/utils";
import type { Member, Ticket } from "@/lib/types";

export function MemberCard({
  member,
  tickets,
}: {
  member: Member;
  tickets: Ticket[];
}) {
  const c = loadColorClasses(member.current_load);
  const done = tickets.filter((t) => t.status === "done").length;
  const inProgress = tickets.filter((t) => t.status === "in_progress").length;
  const total = tickets.length;
  const completionPct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <Link href={`/equipo/${member.id}`} className="block group">
      <Card className="p-5 transition-shadow group-hover:shadow-md dark:group-hover:shadow-black/20">
        <div className="flex items-center gap-3">
          <Avatar name={member.name} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{member.name}</p>
              {member.is_manager && (
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                  Manager
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{member.role}</p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-neutral-300 transition group-hover:translate-x-0.5 group-hover:text-neutral-500 dark:text-neutral-700" />
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {member.skills.map((s) => (
            <span
              key={s}
              className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
            >
              {SKILL_LABELS[s]}
            </span>
          ))}
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-neutral-500 dark:text-neutral-400">Carga actual</span>
            <span className={`font-semibold ${c.text}`}>{member.current_load}%</span>
          </div>
          <ProgressBar value={member.current_load} barClassName={c.bar} />
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-neutral-400 dark:text-neutral-500">
          <span>{total} tickets asignados</span>
          {total > 0 && (
            <span className="flex items-center gap-2">
              <span className="text-emerald-600 dark:text-emerald-400">{done} hechos</span>
              {inProgress > 0 && <span className="text-sky-600 dark:text-sky-400">{inProgress} en curso</span>}
              <span>{completionPct}%</span>
            </span>
          )}
        </div>
      </Card>
    </Link>
  );
}
