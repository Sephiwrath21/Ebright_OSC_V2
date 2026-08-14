import { Check, ChevronDown } from "lucide-react";
import type { InductionStepView } from "@/app/induction/queries";

const STEP_COLORS = [
  "bg-blue-500",
  "bg-blue-600",
  "bg-cyan-500",
  "bg-teal-500",
  "bg-emerald-500",
  "bg-green-600",
  "bg-lime-500",
  "bg-yellow-500",
  "bg-orange-500",
  "bg-red-500",
  "bg-rose-600",
  "bg-purple-600",
];

interface Props {
  steps: InductionStepView[];
}

export function WorkflowDiagram({ steps }: Props) {
  const firstPendingIndex = steps.findIndex((s) => s.status !== "Completed");

  return (
    <ol className="space-y-1">
      {steps.map((step, i) => {
        const color = STEP_COLORS[i % STEP_COLORS.length];
        const isCompleted = step.status === "Completed";
        const isCurrent = !isCompleted && i === firstPendingIndex;
        const isFuture = !isCompleted && !isCurrent;
        const isLast = i === steps.length - 1;

        return (
          <li key={step.id}>
            <div
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-white transition ${color} ${
                isFuture ? "opacity-40" : ""
              } ${
                isCurrent
                  ? "shadow-lg ring-2 ring-offset-2 ring-blue-300 dark:ring-offset-slate-900"
                  : ""
              }`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/30 text-sm font-bold">
                {isCompleted ? (
                  <Check className="w-5 h-5" aria-hidden="true" />
                ) : (
                  step.stepNumber
                )}
              </span>
              <span className="text-sm font-semibold leading-tight">{step.title}</span>
            </div>
            {!isLast && (
              <div className="flex justify-center py-1" aria-hidden="true">
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
