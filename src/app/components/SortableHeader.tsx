"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

// 3-state Date-column cycle:
//  "default"        — current month first (latest date in the month on top,
//                      e.g. 28 July above 1 July), then future months
//                      (ascending), then everything before this month
//                      (ascending) — no arrow highlighted.
//  "furthest-first" — every row, oldest date first / most recent last —
//                      down-arrow highlighted.
//  "nearest-first"  — every row, most recent date first / oldest last —
//                      up-arrow highlighted.
// Clicking cycles default -> furthest-first -> nearest-first -> default.
export type DateSortState = "default" | "furthest-first" | "nearest-first";

export function nextDateSortState(state: DateSortState): DateSortState {
  if (state === "default") return "furthest-first";
  if (state === "furthest-first") return "nearest-first";
  return "default";
}

export function SortableDateHeader({
  state,
  onToggle,
  label = "Date",
}: {
  state: DateSortState;
  onToggle: () => void;
  label?: string;
}) {
  return (
    <button type="button" onClick={onToggle} className="inline-flex items-center gap-1 hover:text-black/90 transition-colors">
      <span>{label}</span>
      {state === "furthest-first" ? (
        <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
      ) : state === "nearest-first" ? (
        <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
      ) : (
        <ArrowUpDown className="w-3.5 h-3.5 opacity-30" aria-hidden="true" />
      )}
    </button>
  );
}

// Formats a Date's own LOCAL calendar date as "YYYY-MM-DD" — deliberately
// not toISOString() (which converts through UTC and can shift the date by a
// day depending on the browser's timezone/time-of-day, e.g. local midnight
// Aug 1 in UTC+8 is still Jul 31 in UTC).
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Chronological compare on "YYYY-MM-DD" strings — rows with no date always
// sort last, regardless of direction (a null-vs-null comparator inversion
// would otherwise flip them to the front for the descending/"nearest-first"
// case, which is wrong: "no date" isn't meaningfully nearer than a real one).
function compareDates(a: string | null | undefined, b: string | null | undefined, descending: boolean): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const diff = a.localeCompare(b);
  return descending ? -diff : diff;
}

// Applies the 3-state behavior to an already-filtered row set.
// `suppressDefaultGrouping` disables the "current month onward, past at the
// bottom" grouping for the default state — set this when the caller's own
// manual Year/Month filter is active, since that filter already scopes the
// date range the user wants; the implicit month grouping would otherwise
// fight it (e.g. picking Year=2025 while "today" is in 2026 would show
// everything grouped as "past" for no reason). Falls back to plain ascending
// order in that case.
// `defaultBehavior` picks what the unclicked "default" state actually shows:
// "month-grouped" (current month onward, then past, both ascending — the
// original behavior) or "nearest-first" (just the most-recent date on top,
// same order as the explicit nearest-first state) — Exit's own Last Date
// column uses "nearest-first" as its default, since Exit dates are
// overwhelmingly in the past and the month-grouping split isn't meaningful
// there; clicking once from that default still lands on furthest-first
// ("desc" — oldest first), same as everywhere else.
export function applyDateSort<T>(
  rows: T[],
  state: DateSortState,
  getDate: (row: T) => string | null | undefined,
  suppressDefaultGrouping: boolean,
  defaultBehavior: "month-grouped" | "nearest-first" = "month-grouped",
): T[] {
  if (state === "furthest-first") {
    return [...rows].sort((a, b) => compareDates(getDate(a), getDate(b), false));
  }
  if (state === "nearest-first" || (state === "default" && defaultBehavior === "nearest-first")) {
    return [...rows].sort((a, b) => compareDates(getDate(a), getDate(b), true));
  }
  if (suppressDefaultGrouping) {
    return [...rows].sort((a, b) => compareDates(getDate(a), getDate(b), false));
  }
  const now = new Date();
  const monthStartIso = localDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
  // Exclusive upper bound: the 1st of NEXT month — anything before this and
  // on/after monthStartIso is "this month".
  const nextMonthStartIso = localDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  const currentMonth: T[] = [];
  const future: T[] = [];
  const past: T[] = [];
  const noDate: T[] = [];
  for (const row of rows) {
    const d = getDate(row);
    if (!d) noDate.push(row);
    else if (d < monthStartIso) past.push(row);
    else if (d < nextMonthStartIso) currentMonth.push(row);
    else future.push(row);
  }
  // Within the current month specifically, latest date first (e.g. 28 July
  // above 1 July) — future months and the past group both stay chronological
  // forward (ascending), unchanged from before.
  currentMonth.sort((a, b) => compareDates(getDate(a), getDate(b), true));
  future.sort((a, b) => compareDates(getDate(a), getDate(b), false));
  past.sort((a, b) => compareDates(getDate(a), getDate(b), false));
  return [...currentMonth, ...future, ...past, ...noDate];
}
