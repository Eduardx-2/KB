import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-neutral-200 bg-neutral-50/60 px-6 py-14 text-center",
        "dark:border-neutral-800 dark:bg-neutral-900/40",
        className
      )}
    >
      {icon && (
        <div className="flex size-12 items-center justify-center rounded-full bg-white text-neutral-400 shadow-sm dark:bg-neutral-800 dark:text-neutral-500">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">{title}</p>
        {description && <p className="max-w-sm text-sm text-neutral-500 dark:text-neutral-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}
