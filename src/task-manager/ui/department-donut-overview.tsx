"use client";

// "All Departments" overview section (2026-08-22) — used ONLY when the
// admin/OPS/elevated-dept-site Department dropdown's "All Departments"
// sentinel is selected (page.tsx's ALL_DEPARTMENTS_VALUE branch). Renders
// ONE department per card (aggregated across everyone in it), NOT a
// per-person breakdown — picking a single real department still gets the
// existing full TaskOverviewStack (Sort:Person/Type, per-person List/
// Donut, View All/Only Me, HOD/CEO Assigned Task), unchanged.
//
// Fed entirely by FlowDetailResponse.org.departments (daily.org.departments
// / monthly.org.departments, queries.ts) — already computed as part of the
// SAME getFlowDetail() calls page.tsx makes for every other section on this
// page, so this section needs no fetch of its own.
import * as React from "react";
import type { FlowDrillTask, FlowEntityRollup } from "./types";
import { flowBucketTotal, flowCompletionPct } from "./types";
import {
  BUCKET_META,
  BUCKET_SOLID,
  BUCKET_TEXT,
  BUCKET_TINT,
  ChevronIcon,
  EntityDrillModal,
  StatusDonut,
  TOTAL_TEXT,
  TOTAL_TINT,
  type BucketKey,
} from "./bits";
import { useCardMode } from "./card-mode-context";

const EMPTY_DRILL_TASKS: Record<BucketKey, FlowDrillTask[]> = { completed: [], pending: [], na: [] };

/** One department's aggregated donut card — same visual language as the
 *  per-person PersonDonutCard (entity-card-overview.tsx: colored stat chips
 *  + colored bucket rows), just fed by a department's aggregated totals
 *  instead of one person's tasks, and rows open EntityDrillModal on click
 *  rather than expanding inline (2026-08-22, matching PersonDonutCard's
 *  colors exactly — user feedback) — a department aggregates many people,
 *  so the richer modal (avatars, per-row actions) suits it better than a
 *  bare inline task-title list; the row's chevron stays static (not an
 *  expand/collapse toggle) as a "view details" affordance instead. */
function DepartmentDonutCard({ entity }: { entity: FlowEntityRollup }) {
  const [drill, setDrill] = React.useState<BucketKey | null>(null);
  const total = flowBucketTotal(entity);
  const percent = flowCompletionPct(entity);
  const drillable = Boolean(entity.tasks);

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-gray-100 p-4 shadow-sm dark:border-slate-800">
      <p className="w-full truncate text-center text-sm font-semibold text-gray-900 dark:text-slate-100">
        {entity.name}
      </p>
      <StatusDonut totals={entity} size={92} onSegmentClick={drillable ? setDrill : undefined}>
        <span className="text-base font-bold text-gray-900 dark:text-slate-100">{percent}%</span>
        <span className="text-[9px] uppercase tracking-wider text-gray-400 dark:text-slate-500">
          {total} task{total === 1 ? "" : "s"}
        </span>
      </StatusDonut>

      <div className="grid w-full grid-cols-4 gap-1.5">
        {BUCKET_META.map((b) => (
          <div key={b.key} className={`rounded-lg px-1 py-1.5 text-center ${BUCKET_TINT[b.key]}`}>
            <div className={`text-sm font-bold ${BUCKET_TEXT[b.key]}`}>{entity[b.key]}</div>
            <div className="text-[10px] font-medium text-gray-500 dark:text-slate-400">{b.label}</div>
          </div>
        ))}
        <div className={`rounded-lg px-1 py-1.5 text-center ${TOTAL_TINT}`}>
          <div className={`text-sm font-bold ${TOTAL_TEXT}`}>{total}</div>
          <div className="text-[10px] font-medium text-gray-500 dark:text-slate-400">Total</div>
        </div>
      </div>

      <div className="flex w-full flex-col gap-1.5">
        {BUCKET_META.map((b) => (
          <button
            key={b.key}
            type="button"
            disabled={!drillable}
            onClick={() => setDrill(b.key)}
            className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left ${BUCKET_TINT[b.key]} ${
              drillable ? "" : "cursor-default opacity-60"
            }`}
          >
            <span className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-slate-200">
              <ChevronIcon expanded={false} className={`size-3.5 ${BUCKET_TEXT[b.key]}`} />
              {b.label}
            </span>
            <span
              className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${BUCKET_SOLID[b.key]}`}
            >
              {entity[b.key]}
            </span>
          </button>
        ))}
      </div>

      {drill && (
        <EntityDrillModal
          name={entity.name}
          tasks={entity.tasks ?? EMPTY_DRILL_TASKS}
          bucketKey={drill}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  );
}

/** List mode's one card (2026-08-22, user request — "same like list in
 *  department", i.e. an actual per-task list, not just aggregate counts):
 *  one department per card, task rows underneath as Assignee | Task Name —
 *  the same shape a single department's own List view already shows per
 *  person, just flattened across the whole department's roster instead of
 *  split into per-person cards (there's no "Sort: Person" concept at
 *  department-aggregate granularity — see this file's own header comment).
 *  All three buckets combined, pending first (matches every other pending-
 *  first list in this app), scrollable past a fixed height rather than
 *  growing the card unbounded for a busy department. */
function DepartmentTaskListCard({ entity }: { entity: FlowEntityRollup }) {
  const tasks = entity.tasks
    ? [...entity.tasks.pending, ...entity.tasks.completed, ...entity.tasks.na]
    : [];

  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 dark:border-slate-800">
      <div className="bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800 dark:bg-slate-800 dark:text-slate-200">
        {entity.name}
      </div>
      <div className="max-h-80 overflow-auto px-3 py-2">
        {tasks.length === 0 ? (
          <p className="py-2 text-xs italic text-gray-400 dark:text-slate-500">No tasks this period.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 dark:text-slate-400">
                <th className="pb-1 pr-4 font-medium">Assignee</th>
                <th className="pb-1 font-medium">Task Name</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.runBlockId} className="border-t border-dashed border-gray-100 dark:border-slate-800">
                  <td className="whitespace-nowrap py-1.5 pr-4 text-gray-700 dark:text-slate-300">
                    {t.assigneeName}
                  </td>
                  <td className="py-1.5 text-gray-900 dark:text-slate-100">{t.blockTitle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/** "All Departments — Daily" / "All Departments — Monthly" section — one
 *  card grid (Donut mode) or table (List mode) per department, replacing
 *  the per-department TaskOverviewStack the pre-2026-08-22 "All
 *  Departments" view rendered. No Sort:Person/Type (nothing to sort — one
 *  card per department, not per person) and no View All/Only Me (no
 *  personal scope at department-aggregate granularity) — just the List/
 *  Donut toggle, mirroring EntityCardOverview's own toggle styling. */
export function AllDepartmentsSection({
  sectionLabel,
  departments,
  dateControl,
}: {
  sectionLabel: string;
  departments: FlowEntityRollup[];
  /** DailyDatePicker (Daily) / MonthDropdown+MonthRangeDropdown (Monthly)
   *  — same date filter every single-department section already has,
   *  added here (2026-08-22, user request) since "All Departments" had
   *  none at all. Rendered in the header row, left of the List/Donut
   *  toggle. Navigates the SAME ?date=/?mdate=/?mrange= params the page's
   *  own daily/monthly org payloads (daily.org.departments/
   *  monthly.org.departments) are already fetched with, so no new data
   *  wiring is needed here — just the missing control. */
  dateControl?: React.ReactNode;
}) {
  // Shared page-level List/Donut toggle (2026-08-22) — see
  // card-mode-context.tsx's own doc comment. Falls back to independent
  // local state (defaulting to "donut", this section's own original
  // default) plus its own toggle button when rendered without a
  // CardModeProvider above it.
  const sharedCardMode = useCardMode();
  const [localMode, setLocalMode] = React.useState<"list" | "donut">("donut");
  const mode = sharedCardMode ? sharedCardMode.mode : localMode;
  const setMode = sharedCardMode ? sharedCardMode.setMode : setLocalMode;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3 dark:border-slate-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
          All Departments — {sectionLabel}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {dateControl}
          {!sharedCardMode && (
          <div
            role="radiogroup"
            aria-label="Card style"
            className="flex items-center gap-0.5 rounded-full border border-gray-300 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900"
          >
            <button
              type="button"
              role="radio"
              aria-checked={mode === "list"}
              onClick={() => setMode("list")}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                mode === "list"
                  ? "bg-blue-600 text-white"
                  : "text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-700"
              }`}
            >
              List
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === "donut"}
              onClick={() => setMode("donut")}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                mode === "donut"
                  ? "bg-blue-600 text-white"
                  : "text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-700"
              }`}
            >
              Donut
            </button>
          </div>
          )}
        </div>
      </div>

      {departments.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">No activity.</p>
      ) : mode === "donut" ? (
        // Capped at 3 columns (2026-08-22, user request) — matches the
        // "3x3" convention EntityCardOverview's own cardGridClass already
        // established for a full roster grid, instead of stretching to 4
        // columns at wide viewports.
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {departments.map((d) => (
            <DepartmentDonutCard key={d.name} entity={d} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {departments.map((d) => (
            <DepartmentTaskListCard key={d.name} entity={d} />
          ))}
        </div>
      )}
    </div>
  );
}
