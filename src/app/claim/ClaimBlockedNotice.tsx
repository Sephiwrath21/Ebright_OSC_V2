import Link from "next/link";
import type { ClaimTaskGate } from "@/task-manager/data/claim-gate";

/**
 * Shown in place of the claim pages while the viewer still has open Task
 * Manager tasks this month. Names the tasks rather than just refusing: a gate
 * that says "no" without saying what to finish is one the user cannot clear.
 */
export default function ClaimBlockedNotice({ gate }: { gate: ClaimTaskGate }) {
  const one = gate.openCount === 1;
  const hidden = gate.openCount - gate.sample.length;

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950 px-4 sm:px-6 lg:px-8 py-10">
      <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="border-b border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-6 py-4">
          <h1 className="text-base font-semibold text-amber-900 dark:text-amber-200">
            Finish your tasks before claiming
          </h1>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
            You still have {gate.openCount} incomplete Task Manager{" "}
            {one ? "task" : "tasks"} for this month. Claims stay closed until{" "}
            {one ? "it is" : "they are"} done.
          </p>
        </div>

        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {gate.sample.map((t) => (
            <li key={t.id} className="flex items-start gap-3 px-6 py-3">
              <span className="mt-0.5 shrink-0 rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                {t.status}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-slate-900 dark:text-slate-100">{t.title}</span>
                {t.dueAt && (
                  <span className="block text-xs text-slate-500 dark:text-slate-400">due {t.dueAt}</span>
                )}
              </span>
            </li>
          ))}
          {hidden > 0 && (
            <li className="px-6 py-3 text-sm text-slate-500 dark:text-slate-400">
              and {hidden} more
            </li>
          )}
        </ul>

        <div className="border-t border-slate-100 dark:border-slate-800 px-6 py-4">
          <Link
            href="/task-manager"
            className="inline-flex items-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Go to Task Manager
          </Link>
        </div>
      </div>
    </div>
  );
}
