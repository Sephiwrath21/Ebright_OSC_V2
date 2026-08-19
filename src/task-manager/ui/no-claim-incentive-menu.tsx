"use client";

// "No Claim/Incentive" list (2026-08-18, month filter added same day) — a
// company-wide compliance check for Finance (finance@ebright.my) and CEO
// only: before approving a claim/incentive payment, see who currently has
// at least one open (Pending/Active/Overdue/Escalated) Task Manager task
// due in a given month, grouped by Department/Branch. Read-only, on-demand
// — the ⋮ menu in the Task Manager page's top-left corner opens a modal
// that fetches a fresh snapshot each time it's opened OR the month changes
// (via fetchList, a server action closing over the viewer's email — see
// getNoClaimIncentiveList, task-manager/data/queries.ts), rather than
// computing this company-wide query on every page load for a menu that may
// never be opened. Month is local UI state (not a URL param — this is a
// modal, not a page), defaulting to the current month on open.

import * as React from "react";
import { createPortal } from "react-dom";
import type { NoClaimIncentivePayload } from "./types";

function firstOfCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function shiftMonth(monthAnchor: string, by: number): string {
  const [y, m] = monthAnchor.split("-").map(Number);
  const next = new Date(y, m - 1 + by, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
}

function monthLabel(monthAnchor: string): string {
  const [y, m] = monthAnchor.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

const arrowClass =
  "flex size-6 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-xs text-gray-500 shadow-sm hover:border-blue-300 hover:text-blue-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-blue-500 dark:hover:text-blue-400";

export function NoClaimIncentiveMenu({
  fetchList,
}: {
  fetchList: (month: string) => Promise<NoClaimIncentivePayload>;
}) {
  const [open, setOpen] = React.useState(false);
  const [month, setMonth] = React.useState(firstOfCurrentMonth);
  const [state, setState] = React.useState<
    { status: "loading" } | { status: "error" } | { status: "ready"; data: NoClaimIncentivePayload }
  >({ status: "loading" });

  const load = React.useCallback(
    (forMonth: string) => {
      setState({ status: "loading" });
      fetchList(forMonth)
        .then((data) => setState({ status: "ready", data }))
        .catch(() => setState({ status: "error" }));
    },
    [fetchList],
  );

  const openMenu = () => {
    setOpen(true);
    load(month);
  };

  const changeMonth = (by: number) => {
    const next = shiftMonth(month, by);
    setMonth(next);
    load(next);
  };

  const groups =
    state.status === "ready" ? [...state.data.departments, ...state.data.branches] : [];
  const isEmpty = state.status === "ready" && groups.length === 0;

  return (
    <>
      <button
        type="button"
        title="No Claim/Incentive list"
        aria-label="Open No Claim/Incentive list"
        aria-haspopup="dialog"
        onClick={openMenu}
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
      >
        ⋮
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setOpen(false)}
          >
            <div
              className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-800 dark:ring-1 dark:ring-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-slate-700">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                    No Claim/Incentive
                  </h4>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                    Everyone with pending or overdue tasks due that month, by Department/Branch.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                >
                  ✕
                </button>
              </div>
              <div className="flex items-center justify-center gap-2 border-b border-gray-200 px-5 py-2.5 dark:border-slate-700">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() => changeMonth(-1)}
                  className={arrowClass}
                >
                  ◀
                </button>
                <span className="min-w-[9rem] text-center text-xs font-medium text-gray-700 dark:text-slate-300">
                  {monthLabel(month)}
                </span>
                <button type="button" aria-label="Next month" onClick={() => changeMonth(1)} className={arrowClass}>
                  ▶
                </button>
              </div>
              <div className="overflow-y-auto px-5 py-4">
                {state.status === "loading" && (
                  <p className="py-6 text-center text-sm text-gray-400 dark:text-slate-500">Loading…</p>
                )}
                {state.status === "error" && (
                  <div className="py-6 text-center">
                    <p className="mb-2 text-sm text-red-500">Failed to load the list.</p>
                    <button
                      type="button"
                      onClick={() => load(month)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      Retry
                    </button>
                  </div>
                )}
                {isEmpty && (
                  <p className="py-6 text-center text-sm text-gray-400 dark:text-slate-500">
                    No one has pending or overdue tasks due in {monthLabel(month)}.
                  </p>
                )}
                {state.status === "ready" && groups.length > 0 && (
                  <div className="space-y-4">
                    {groups.map((group) => (
                      <div key={group.name}>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                          {group.name}
                        </p>
                        <ul className="space-y-1">
                          {group.people.map((person) => (
                            <li
                              key={person.userId}
                              className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-1.5 text-sm dark:bg-slate-900"
                            >
                              <span className="truncate text-gray-800 dark:text-slate-200">{person.name}</span>
                              <span className="shrink-0 text-xs font-medium text-amber-600 dark:text-amber-400">
                                {person.openCount} pending/overdue
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
