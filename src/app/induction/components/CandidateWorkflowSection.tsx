"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AssignmentForCandidate } from "@/lib/workflow/queries";
import { markAssignmentStepDone } from "@/app/dashboards/workflow-center/actions";

interface Props {
  assignment: AssignmentForCandidate | null;
}

const ACTOR_BADGE: Record<string, string> = {
  Candidate: "bg-blue-700 text-white",
  HOD: "bg-purple-700 text-white",
  HR: "bg-emerald-700 text-white",
  Buddy: "bg-amber-700 text-white",
  System: "bg-slate-700 text-white",
};

/**
 * Candidate-facing department workflow section. Shown on the candidate
 * portal below the day-3 induction flow.
 *
 * Three states:
 *   1. No assignment → placeholder text per spec
 *   2. Assignment exists → step list. Candidate-actor steps have a
 *      working checkbox; HR/HOD/etc. steps show "Awaiting [role]" label.
 */
export function CandidateWorkflowSection({ assignment }: Props) {
  if (!assignment) {
    return (
      <section className="overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center">
        <p className="text-3xl mb-2" aria-hidden="true">⚙️</p>
        <h2 className="text-base font-semibold text-slate-700 dark:text-slate-300">Department Workflow</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed">
          Your department head has not published a workflow yet. Check back soon.
        </p>
      </section>
    );
  }

  const done = assignment.steps.filter((s) => s.status === "Done").length;
  const total = assignment.steps.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
      <header className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Department Workflow — {assignment.workflowName}
        </h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {assignment.departmentName} · {done} of {total} step{total === 1 ? "" : "s"} done ({pct}%)
        </p>
        <div className="mt-3 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </header>

      <ul className="divide-y divide-slate-200 dark:divide-slate-800">
        {assignment.steps.map((s) => (
          <WorkflowStepRow key={s.id} step={s} />
        ))}
      </ul>
    </section>
  );
}

function WorkflowStepRow({
  step,
}: {
  step: AssignmentForCandidate["steps"][number];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isDone = step.status === "Done";
  const isCandidateActor = step.actorRole === "Candidate";

  const handleTick = () => {
    if (!isCandidateActor || isDone || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await markAssignmentStepDone(step.id);
      if (!result.ok) {
        setError(result.error ?? "Could not mark done.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <li className="px-6 py-3 flex items-start gap-3">
      <button
        type="button"
        onClick={handleTick}
        disabled={!isCandidateActor || isDone || pending}
        aria-label={isDone ? "Step complete" : isCandidateActor ? "Mark step complete" : "Step locked"}
        className={`w-5 h-5 mt-0.5 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
          isDone
            ? "bg-emerald-600 border-emerald-600 text-white"
            : isCandidateActor
              ? "bg-white dark:bg-slate-950 border-slate-400 dark:border-slate-500 hover:border-emerald-500 cursor-pointer"
              : "bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 cursor-not-allowed opacity-60"
        } ${pending ? "opacity-50" : ""}`}
      >
        {isDone && <span className="text-[11px] font-bold leading-none">✓</span>}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${isDone ? "text-slate-500 dark:text-slate-400 line-through" : "text-slate-700 dark:text-slate-300"}`}>
          {step.title}
        </p>
        {step.description && (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{step.description}</p>
        )}
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${ACTOR_BADGE[step.actorRole] ?? ACTOR_BADGE.System}`}>
            {step.actorRole}
          </span>
          {!isDone && !isCandidateActor && (
            <span className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold">
              ⏳ Awaiting {step.actorRole}
            </span>
          )}
          {error && (
            <span className="text-[11px] text-rose-700 dark:text-rose-300">{error}</span>
          )}
        </div>
      </div>
    </li>
  );
}
