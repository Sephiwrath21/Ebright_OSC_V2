"use client";

// OSC integration package — the CEO's task table (replaces the old donut for
// this one card, per the user's ClickUp-style reference). Same underlying
// data as every other drillable donut (me.delegatedAll, bucketized), just
// rendered as status-grouped, collapsible rows instead of a chart. Fixed
// grouping/sort (no "..." config menu) — deliberately kept simple.

import * as React from "react";
import type { BucketKey } from "./bits";
import { BUCKET_META, InitialAvatar } from "./bits";
import type { FlowDrillTask } from "./types";
import { formatDueDate } from "./types";

// This table's tasks are always delegated (CEO -> someone else, never
// self-assigned) — a genuine delegation-out list, not a personal "my tasks"
// view, so its dots are always read-only (see the click-to-complete scoping
// note in clickup-tasks-view.tsx).

// Most-actionable-first — the opposite of BUCKET_META's own order (which is
// legend/donut-segment order, Completed first). A task table should surface
// what still needs doing before what's already done.
const GROUP_ORDER: BucketKey[] = ["pending", "na", "completed"];

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      className={`size-3 shrink-0 text-gray-400 transition-transform dark:text-slate-400 ${open ? "rotate-90" : ""}`}
    >
      <path d="M4 2.5L8 6L4 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SortArrowIcon({ direction }: { direction: "asc" | "desc" }) {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      className={`size-3 shrink-0 transition-transform ${direction === "desc" ? "rotate-180" : ""}`}
    >
      <path d="M6 2V10M6 2L3 5M6 2L9 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function sortByDue(tasks: FlowDrillTask[], direction: "asc" | "desc"): FlowDrillTask[] {
  return [...tasks].sort((a, b) => {
    if (!a.dueAt && !b.dueAt) return 0;
    if (!a.dueAt) return 1;
    if (!b.dueAt) return -1;
    const diff = new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    return direction === "asc" ? diff : -diff;
  });
}

function TaskTableRow({
  task,
  dotClass,
}: {
  task: FlowDrillTask;
  dotClass: string;
}) {
  const due = task.dueAt ? new Date(task.dueAt) : null;
  const dueDisplay = formatDueDate(due);
  const done = task.status === "DONE";

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className={`size-2.5 shrink-0 rounded-full ${dotClass}`} />
      <p className={`min-w-0 flex-1 truncate text-sm ${done ? "text-gray-400 line-through dark:text-slate-400" : "text-gray-800 dark:text-slate-200"}`}>
        {task.blockTitle}
      </p>
      <div className="flex w-36 shrink-0 items-center gap-2">
        <InitialAvatar name={task.assigneeName} id={task.assigneeId} className="size-5 text-[9px]" />
        <span className="truncate text-xs text-gray-600 dark:text-slate-300">{task.assigneeName}</span>
      </div>
      <span className={`w-16 shrink-0 text-right text-xs ${dueDisplay?.className ?? "text-gray-400 dark:text-slate-400"}`}>
        {dueDisplay?.text ?? "—"}
      </span>
    </div>
  );
}

/**
 * CEO Task Overview, table form: status-grouped (Pending/N-A/Completed),
 * collapsible sections with a count in the header, Task/PIC/Due date
 * columns. Replaces StatusOverviewCard for this one card only.
 */
export function CeoTaskTable({
  tasks,
}: {
  tasks: { completed: FlowDrillTask[]; pending: FlowDrillTask[]; na: FlowDrillTask[] };
}) {
  const [collapsed, setCollapsed] = React.useState<Set<BucketKey>>(new Set());
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

  const toggleGroup = (key: BucketKey) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-3 border-b border-gray-100 px-4 pt-4 pb-2 dark:border-slate-800">
        <span className="flex-1 text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-slate-400">
          Task
        </span>
        <span className="w-36 shrink-0 text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-slate-400">
          PIC
        </span>
        <button
          type="button"
          onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
          className="flex w-16 shrink-0 items-center justify-end gap-1 text-xs font-medium uppercase tracking-wide text-gray-400 hover:text-gray-600 dark:text-slate-400 dark:hover:text-slate-300"
        >
          Due date
          <SortArrowIcon direction={sortDir} />
        </button>
      </div>

      <div className="divide-y divide-gray-100 pb-2 dark:divide-slate-800">
        {GROUP_ORDER.map((key) => {
          const meta = BUCKET_META.find((b) => b.key === key)!;
          const rows = sortByDue(tasks[key], sortDir);
          const open = !collapsed.has(key);
          return (
            <div key={key}>
              <button
                type="button"
                onClick={() => toggleGroup(key)}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-slate-800"
              >
                <ChevronIcon open={open} />
                <span className={`size-2.5 shrink-0 rounded-full ${meta.dot}`} />
                <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">{meta.label}</span>
                <span className="text-xs text-gray-400 dark:text-slate-400">{rows.length}</span>
              </button>
              {open &&
                (rows.length === 0 ? (
                  <p className="px-4 pb-3 text-xs text-gray-400 dark:text-slate-400">
                    No {meta.label.toLowerCase()} tasks.
                  </p>
                ) : (
                  <div className="divide-y divide-gray-50 dark:divide-slate-800/60">
                    {rows.map((t) => (
                      <TaskTableRow key={t.runBlockId} task={t} dotClass={meta.dot} />
                    ))}
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
