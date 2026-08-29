"use client";

// Presentational "No Claim/Incentive" modal (2026-08-26, see conversation) —
// extracted from no-claim-incentive-menu.tsx so it can be driven by more than
// one trigger: the Task Manager page's own ⋮ menu (NoClaimIncentiveMenu,
// still the CEO/Finance-only company-wide view — unchanged, month-by-month),
// and /employee-folder's "Not Clicked Task" card (a different, scope-filtered
// fetchList — see getScopedNoClaimIncentiveList — navigated day-by-day
// instead, via granularity="day"). This component owns no open-state or
// access logic of its own — both live in whichever trigger renders it.

import * as React from "react";
import { createPortal } from "react-dom";
import type { NoClaimIncentivePayload } from "./types";

type Granularity = "day" | "month";

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function firstOfCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function initialAnchor(granularity: Granularity): string {
  return granularity === "day" ? todayIso() : firstOfCurrentMonth();
}

function shiftAnchor(anchor: string, by: number, granularity: Granularity): string {
  const [y, m, d] = anchor.split("-").map(Number);
  if (granularity === "day") {
    const next = new Date(y, m - 1, d + by);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
  }
  const next = new Date(y, m - 1 + by, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
}

function anchorLabel(anchor: string, granularity: Granularity): string {
  const [y, m, d] = anchor.split("-").map(Number);
  if (granularity === "day") {
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
  }
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

const arrowClass =
  "flex size-6 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-xs text-gray-500 shadow-sm hover:border-blue-300 hover:text-blue-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-blue-500 dark:hover:text-blue-400";

export function NoClaimIncentiveModal({
  open,
  onClose,
  fetchList,
  title = "No Claim/Incentive",
  description = "Everyone with pending or overdue tasks due that month, by Department/Branch.",
  granularity = "month",
}: {
  open: boolean;
  onClose: () => void;
  fetchList: (anchor: string) => Promise<NoClaimIncentivePayload>;
  /** Lets callers other than the original No Claim/Incentive menu (e.g.
   *  /employee-folder's "Not Clicked Task" card) relabel the same modal
   *  without forking it — defaults preserve the original menu's exact copy. */
  title?: string;
  description?: string;
  /** "month" (default) preserves the original ⋮ menu's month-by-month
   *  picker, passing the 1st of the shown month to fetchList. "day"
   *  (2026-08-26, see conversation) navigates one calendar day at a time,
   *  defaulting to today, passing that exact date to fetchList instead. */
  granularity?: Granularity;
}) {
  const [anchor, setAnchor] = React.useState(() => initialAnchor(granularity));
  const [state, setState] = React.useState<
    { status: "loading" } | { status: "error" } | { status: "ready"; data: NoClaimIncentivePayload }
  >({ status: "loading" });

  const load = React.useCallback(
    (forAnchor: string) => {
      setState({ status: "loading" });
      fetchList(forAnchor)
        .then((data) => setState({ status: "ready", data }))
        .catch(() => setState({ status: "error" }));
    },
    [fetchList],
  );

  // Fetch fresh each time the modal opens (mirrors the original menu's
  // openMenu behavior) rather than on mount, since this component may be
  // rendered ahead of time with open=false by a parent that owns the toggle.
  React.useEffect(() => {
    if (open) load(anchor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const changeAnchor = (by: number) => {
    const next = shiftAnchor(anchor, by, granularity);
    setAnchor(next);
    load(next);
  };

  if (!open) return null;

  const groups = state.status === "ready" ? [...state.data.departments, ...state.data.branches] : [];
  const isEmpty = state.status === "ready" && groups.length === 0;
  const label = anchorLabel(anchor, granularity);
  const preposition = granularity === "day" ? "on" : "in";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-800 dark:ring-1 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-slate-700">
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100">{title}</h4>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
          >
            ✕
          </button>
        </div>
        <div
          className={`flex items-center gap-2 border-b border-gray-200 px-5 py-2.5 dark:border-slate-700 ${granularity === "day" ? "justify-start" : "justify-center"}`}
        >
          {granularity === "day" ? (
            // Direct calendar picker (2026-08-26, see conversation) — day
            // granularity navigates by exact date rather than stepping one
            // day at a time; the native date input's value format (YYYY-MM-DD)
            // matches `anchor` exactly, no parsing needed.
            <input
              type="date"
              aria-label="Select date"
              value={anchor}
              onChange={(e) => {
                const next = e.target.value;
                if (!next) return;
                setAnchor(next);
                load(next);
              }}
              className="h-8 rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-700 shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
            />
          ) : (
            <>
              <button type="button" aria-label="Previous month" onClick={() => changeAnchor(-1)} className={arrowClass}>
                ◀
              </button>
              <span className="min-w-[9rem] text-center text-xs font-medium text-gray-700 dark:text-slate-300">{label}</span>
              <button type="button" aria-label="Next month" onClick={() => changeAnchor(1)} className={arrowClass}>
                ▶
              </button>
            </>
          )}
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
                onClick={() => load(anchor)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Retry
              </button>
            </div>
          )}
          {isEmpty && (
            <p className="py-6 text-center text-sm text-gray-400 dark:text-slate-500">
              No one has pending or overdue tasks due {preposition} {label}.
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
  );
}
