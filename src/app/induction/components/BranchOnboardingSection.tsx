"use client";

import { useState } from "react";
import { BRANCH_WEEK_TASKS, type SpecTask } from "@/lib/induction-task-spec";

/**
 * 3-Week Branch Onboarding section — visible only for Protege Intern and
 * Coach (Full-timer). Read-only here (HR view); the candidate-facing
 * version will reuse the same task data with interactive checkboxes
 * (Phase C).
 *
 * Locked state until Day 3 is complete.
 *
 * // TODO: persist branch-week step completion state. Currently uses spec
 * //       tasks only — no DB linkage. Phase C / branch_week_step table.
 */
interface Props {
  /** True if all Day 3 tasks complete — unlocks the 3-week section. */
  day3Complete: boolean;
}

export function BranchOnboardingSection({ day3Complete }: Props) {
  const [activeWeek, setActiveWeek] = useState<1 | 2 | 3>(1);

  if (!day3Complete) {
    return (
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center">
        <p className="text-3xl mb-2" aria-hidden="true">🔒</p>
        <h2 className="text-base font-semibold text-slate-700 dark:text-slate-300">3-Week Branch Onboarding</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          🔒 Unlocks after Day 3 is completed.
        </p>
      </section>
    );
  }

  const tasks = BRANCH_WEEK_TASKS[activeWeek];

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
      <header className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <span className="inline-flex items-center rounded bg-violet-600 text-white text-[10px] font-bold tracking-widest uppercase px-2 py-1">
            3-Week Branch Onboarding
          </span>
        </div>
        <div className="flex gap-2">
          {([1, 2, 3] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setActiveWeek(w)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${
                activeWeek === w
                  ? "bg-violet-600 text-white border-violet-600"
                  : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              Week {w}
            </button>
          ))}
        </div>
      </header>
      <ul className="divide-y divide-slate-200 dark:divide-slate-800">
        {tasks.map((task, i) => (
          <ReadOnlyTaskItem key={i} task={task} />
        ))}
      </ul>
    </section>
  );
}

function ReadOnlyTaskItem({ task }: { task: SpecTask }) {
  const isCandidateActor = task.actor === "Candidate";
  return (
    <li className="px-5 py-3 flex items-start gap-3">
      <div
        className="w-5 h-5 mt-0.5 rounded border-2 border-slate-300 dark:border-slate-600 shrink-0 opacity-40 cursor-default"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-700 dark:text-slate-300">{task.title}</p>
        <div className="mt-1 flex items-center gap-2">
          <span className="inline-flex items-center rounded bg-slate-800 dark:bg-slate-700 text-white text-[10px] font-semibold px-1.5 py-0.5">
            {task.actor}
          </span>
          {!isCandidateActor && (
            <span className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold">
              ⏳ Awaiting {task.actor}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
