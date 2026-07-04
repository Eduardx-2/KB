import { cn } from "@/lib/utils";

export function ProgressBar({
  value,
  barClassName,
  className,
}: {
  value: number;
  barClassName?: string;
  className?: string;
}) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-neutral-100", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-500 ease-out", barClassName ?? "bg-neutral-900")}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
