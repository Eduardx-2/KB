import { Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PipelineStep {
  id: string;
  label: string;
  status: "pending" | "active" | "done" | "error";
}

export function PipelineSteps({ steps }: { steps: PipelineStep[] }) {
  return (
    <div className="space-y-0">
      {steps.map((step, idx) => (
        <div key={step.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                step.status === "done" && "bg-neutral-900 text-white",
                step.status === "active" && "bg-neutral-900 text-white",
                step.status === "error" && "bg-red-600 text-white",
                step.status === "pending" && "bg-neutral-100 text-neutral-400"
              )}
            >
              {step.status === "done" && <Check className="size-3.5" />}
              {step.status === "active" && <Loader2 className="size-3.5 animate-spin" />}
              {step.status === "error" && <X className="size-3.5" />}
              {step.status === "pending" && idx + 1}
            </div>
            {idx < steps.length - 1 && (
              <div
                className={cn(
                  "my-1 h-8 w-px",
                  step.status === "done" ? "bg-neutral-900" : "bg-neutral-200"
                )}
              />
            )}
          </div>
          <div className={cn("pb-8", idx === steps.length - 1 && "pb-0")}>
            <p
              className={cn(
                "pt-0.5 text-sm font-medium",
                step.status === "pending" ? "text-neutral-400" : "text-neutral-900"
              )}
            >
              {step.label}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
