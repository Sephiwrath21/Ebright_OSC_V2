"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Check, CircleDashed } from "lucide-react";
import { markStepCompleteByToken } from "@/app/induction/actions";
import type { InductionStepView } from "@/app/induction/queries";

interface Props {
  steps: InductionStepView[];
  token: string;
  canMarkComplete: boolean;
}

export function TrainingChecklist({ steps, token, canMarkComplete }: Props) {
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState<Set<number>>(new Set());
  const [errors, setErrors] = useState<Map<number, string>>(new Map());

  const handleMark = (stepId: number) => {
    setPending((p) => new Set(p).add(stepId));
    setErrors((e) => {
      const next = new Map(e);
      next.delete(stepId);
      return next;
    });
    startTransition(async () => {
      const result = await markStepCompleteByToken(stepId, token);
      setPending((p) => {
        const next = new Set(p);
        next.delete(stepId);
        return next;
      });
      if (!result.ok) {
        setErrors((e) => new Map(e).set(stepId, result.error ?? "Failed"));
      }
    });
  };

  return (
    <ul className="space-y-2">
      {steps.map((step) => {
        const isCompleted = step.status === "Completed";
        const isPending = pending.has(step.id);
        const errorMsg = errors.get(step.id);

        return (
          <li
            key={step.id}
            className={`flex items-start gap-3 rounded-lg border p-3 ${
              isCompleted
                ? "border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900"
                : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            }`}
          >
            <span className="shrink-0 pt-0.5">
              {isCompleted ? (
                <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              ) : (
                <CircleDashed className="w-5 h-5 text-slate-300 dark:text-slate-600" aria-hidden="true" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={`text-sm font-medium ${
                  isCompleted ? "text-emerald-900 dark:text-emerald-200 line-through" : "text-slate-900 dark:text-slate-100"
                }`}
              >
                {step.stepNumber}. {step.title}
              </p>
              {step.description && (
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{step.description}</p>
              )}
              {errorMsg && (
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-red-700 dark:text-red-300">
                  <AlertCircle className="w-3 h-3" aria-hidden="true" />
                  {errorMsg}
                </p>
              )}
            </div>
            {!isCompleted && (
              <button
                type="button"
                onClick={() => handleMark(step.id)}
                disabled={!canMarkComplete || isPending}
                title={
                  !canMarkComplete
                    ? "Sign in as the employee or an HR/admin user to mark this step."
                    : undefined
                }
                className="shrink-0 inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPending ? "Marking…" : "Mark Complete"}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
