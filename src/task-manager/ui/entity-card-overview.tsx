"use client";

// Overview page card redesign (2026-08-12) — replaces EntityOverviewSection
// (department-overview.tsx) entirely at both its call sites. Always-visible
// card grid, two switchable layouts (Person/Type), driven by four controls:
// Filter (Daily/Monthly/HOD Assigned Task), Date filter (existing control,
// passed in as headerControl — hidden for HOD Assigned Task since that mode
// is all-time, same convention as the existing "Task Assignment" section),
// Sort (Person/Type), and View All/Only Me. All three Filter datasets are
// pre-fetched server-side (same pattern as TaskProgressCard's own Daily/
// Monthly toggle) — switching Filter/Sort/Scope is pure client state, no
// refetch.
import * as React from "react";
import type { FlowCategoryOption, FlowEntityDetail, FlowTaskRow } from "./types";
import { groupTasksByCategory, groupTasksByPerson, UNCATEGORIZED_CARD_ID } from "./entity-card-grouping";

type FilterMode = "daily" | "monthly" | "hodAssigned";
type SortMode = "person" | "type";

function flattenTasks(entity: FlowEntityDetail) {
  return [...entity.tasks.completed, ...entity.tasks.pending, ...entity.tasks.na];
}

function StatusDot({ status }: { status: FlowTaskRow["status"] }) {
  if (status === "DONE") {
    return (
      <span
        role="img"
        aria-label="Completed"
        className="flex size-3 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-emerald-500"
      >
        ✓
      </span>
    );
  }
  if (status === "SKIPPED") {
    return <span role="img" aria-label="N/A" className="size-3 shrink-0 rounded-full bg-amber-400" />;
  }
  return <span role="img" aria-label="Pending" className="size-3 shrink-0 rounded-full border-2 border-red-400 bg-white" />;
}

export function EntityCardOverview({
  entityName,
  daily,
  monthly,
  hodAssigned,
  categories,
  myUserId,
  dailyDateControl,
  monthlyDateControl,
}: {
  entityName: string;
  daily: FlowEntityDetail;
  monthly: FlowEntityDetail;
  hodAssigned: FlowEntityDetail;
  categories: FlowCategoryOption[];
  /** The viewer's own id — drives "Only Me". */
  myUserId: string;
  /** The existing Daily-period date filter control (unchanged) — shown
   *  when filterMode is "daily". */
  dailyDateControl?: React.ReactNode;
  /** The existing Monthly-period date/range control (unchanged) — shown
   *  when filterMode is "monthly". Omit if this entity never had a
   *  Monthly date filter (e.g. Department Overview never did before this
   *  redesign) — no control renders for Monthly in that case, matching
   *  prior behavior exactly. */
  monthlyDateControl?: React.ReactNode;
}) {
  const [filterMode, setFilterMode] = React.useState<FilterMode>("daily");
  const [sortMode, setSortMode] = React.useState<SortMode>("person");
  const [onlyMe, setOnlyMe] = React.useState(false);

  const entity = filterMode === "daily" ? daily : filterMode === "monthly" ? monthly : hodAssigned;
  const tasks = flattenTasks(entity);
  const scopeId = onlyMe ? myUserId : undefined;

  const personCards = sortMode === "person" ? groupTasksByPerson(entity.members, tasks, scopeId) : [];
  const categoryCards = sortMode === "type" ? groupTasksByCategory(categories, tasks, scopeId) : [];

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
        <h2 className="text-lg font-semibold text-gray-900">{entityName} — Overview</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as FilterMode)}
            aria-label="Filter"
            className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
          >
            <option value="daily">Daily</option>
            <option value="monthly">Monthly</option>
            <option value="hodAssigned">HOD Assigned Task</option>
          </select>
          {filterMode === "daily" && dailyDateControl}
          {filterMode === "monthly" && monthlyDateControl}
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            aria-label="Sort"
            className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
          >
            <option value="person">Sort: Person</option>
            <option value="type">Sort: Type</option>
          </select>
          <select
            value={onlyMe ? "onlyMe" : "all"}
            onChange={(e) => setOnlyMe(e.target.value === "onlyMe")}
            aria-label="View"
            className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
          >
            <option value="all">View All</option>
            <option value="onlyMe">Only Me</option>
          </select>
        </div>
      </div>

      {sortMode === "person" ? (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
          {personCards.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No one to show.</p>
          ) : (
            personCards.map((card) => (
              <div key={card.userId} className="overflow-hidden rounded-xl border border-gray-200">
                <div className="bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800">{card.name}</div>
                <div className="px-3 py-2">
                  {card.tasks.length === 0 ? (
                    <p className="py-2 text-xs italic text-gray-400">No tasks this period.</p>
                  ) : (
                    card.tasks.map((t) => (
                      <div key={t.runBlockId} className="flex items-center gap-2 border-b border-dashed border-gray-100 py-1.5 text-sm last:border-b-0">
                        <StatusDot status={t.status} />
                        <span className="flex-1 truncate">{t.blockTitle}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
          {categoryCards.map((card) => (
            <div
              key={card.id}
              className={`overflow-hidden rounded-xl border ${card.id === UNCATEGORIZED_CARD_ID ? "border-dashed border-gray-300" : "border-gray-200"}`}
            >
              <div className="bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800">{card.name}</div>
              <div className="px-3 py-2">
                {card.tasks.length === 0 ? (
                  <p className="py-2 text-xs italic text-gray-400">No tasks this period.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500">
                        <th className="pb-1 font-medium">Task</th>
                        <th className="pb-1 font-medium">Assignee</th>
                      </tr>
                    </thead>
                    <tbody>
                      {card.tasks.map((t) => (
                        <tr key={t.runBlockId} className="border-t border-dashed border-gray-100">
                          <td className="truncate py-1.5 pr-2">{t.blockTitle}</td>
                          <td className="truncate py-1.5 text-gray-500">{t.assigneeName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
