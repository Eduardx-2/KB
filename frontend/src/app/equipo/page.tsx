"use client";

import { PageHeader } from "@/components/layout/page-header";
import { MemberCard } from "@/components/team/member-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppStore } from "@/lib/store";

export default function EquipoPage() {
  const hydrated = useAppStore((s) => s.hydrated);
  const members = useAppStore((s) => s.members);
  const tickets = useAppStore((s) => s.tickets);

  return (
    <div>
      <PageHeader
        title="Equipo"
        description="Skills y carga actual — así decide el Assignment Agent a quién le toca cada ticket."
      />
      <div className="mx-auto max-w-6xl p-4 sm:p-8">
        {!hydrated ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {members.map((m) => (
              <MemberCard
                key={m.id}
                member={m}
                assignedCount={tickets.filter((t) => t.assignee_id === m.id).length}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
