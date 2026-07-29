"use client";

// URL-driven controls for the Task Manager page: the entity dropdown
// (picking a department/branch navigates, so the server component
// re-fetches) and the Daily date picker (same navigation pattern — the
// chosen date rides in ?date= and so survives entity/tab switches).

import * as React from "react";
import { useRouter } from "next/navigation";

export interface EntityPickerGroup {
  /** Omit for a flat, ungrouped option list. */
  label?: string;
  options: readonly string[];
}

/** Daily date filter (prev/next day + a calendar field) — navigates with
 *  ?date=YYYY-MM-DD so the server re-fetches that day's Daily window. Sits
 *  on the "{entity} — Daily" section heading; `extraParams` carries the
 *  current view/department/branch so the selection is preserved. */
export function DailyDatePicker({
  value,
  basePath,
  extraParams = {},
  param = "date",
  step = "day",
}: {
  /** The resolved date currently shown, YYYY-MM-DD (server echoes it back). */
  value: string;
  basePath: string;
  extraParams?: Record<string, string>;
  /** Query param the picked date rides in (default "date" — the Home page's
   *  Monthly section uses "mdate" so its filter stays independent of Daily). */
  param?: string;
  /** Arrow-button stride. "month" is for month-anchored sections (Monthly
   *  grids): arrows jump to the 1st of the prev/next month, and any date
   *  picked in the calendar field selects that date's whole month. */
  step?: "day" | "month";
}) {
  const router = useRouter();
  const navigate = (v: string) => {
    const qs = new URLSearchParams({ ...extraParams, [param]: v });
    router.push(`${basePath}?${qs.toString()}`);
  };
  const shift = (by: number) => {
    const [y, m, d] = value.split("-").map(Number);
    const dt =
      step === "month" ? new Date(y, m - 1 + by, 1) : new Date(y, m - 1, d + by);
    const pad = (n: number) => String(n).padStart(2, "0");
    navigate(`${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`);
  };
  const unit = step === "month" ? "month" : "day";
  const arrowClass =
    "flex size-7 items-center justify-center rounded-lg border border-gray-200 bg-white text-xs text-gray-500 shadow-sm hover:border-blue-300 hover:text-blue-600";

  return (
    <div className="flex items-center gap-1.5">
      <button type="button" aria-label={`Previous ${unit}`} onClick={() => shift(-1)} className={arrowClass}>
        ◀
      </button>
      <input
        type="date"
        value={value}
        onChange={(e) => e.target.value && navigate(e.target.value)}
        aria-label={`${unit === "month" ? "Monthly" : "Daily"} date`}
        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 shadow-sm focus:border-blue-400 focus:outline-none"
      />
      <button type="button" aria-label={`Next ${unit}`} onClick={() => shift(1)} className={arrowClass}>
        ▶
      </button>
    </div>
  );
}

/** Business-week day lists, as offsets from the week's Monday (getDay():
 *  Sun=0). Department-side roles work Tue–Sat; branch-side roles (Manager /
 *  Branch Exec / Coaches) work weekends too and get Tue–SUN (2026-07-29
 *  decision — `includeSunday`). */
const SIDEBAR_DAYS = [
  { label: "Tuesday", offset: 1 },
  { label: "Wednesday", offset: 2 },
  { label: "Thursday", offset: 3 },
  { label: "Friday", offset: 4 },
  { label: "Saturday", offset: 5 },
];
const SIDEBAR_DAYS_WITH_SUNDAY = [...SIDEBAR_DAYS, { label: "Sunday", offset: 6 }];

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Count badge for the sidebar rows (ClickUp-reference, 2026-07-29):
 *  right-aligned number, HIDDEN when zero/undefined. */
function CountBadge({ count, active }: { count?: number; active: boolean }) {
  if (!count) return null;
  return (
    <span className={active ? "text-xs font-semibold text-white/80" : "text-xs font-medium text-gray-400"}>
      {count}
    </span>
  );
}

/** Vertical weekday sidebar for "My Tasks — Daily" (2026-07-28 ClickUp-
 *  reference redesign): the business week's day NAMES only (Tue–Sat, no
 *  dates) with per-day pending-count badges, listed vertically beside the
 *  task list. The top date filter is the MASTER — it picks the exact
 *  calendar date, which sets both the week and the highlighted day here;
 *  clicking a day navigates the SAME shared date param to that weekday
 *  WITHIN the anchored week. Selection updates OPTIMISTICALLY (instant
 *  highlight while the server round-trip runs — the 2026-07-29 lag fix),
 *  then re-syncs from the echoed value. */
export function WeekdaySidebar({
  value,
  basePath,
  extraParams = {},
  param = "date",
  counts = {},
  includeSunday = false,
}: {
  /** The resolved date currently shown, YYYY-MM-DD. */
  value: string;
  basePath: string;
  extraParams?: Record<string, string>;
  param?: string;
  /** Per-day NOT-YET-COMPLETED counts (Pending only, N/A excluded), keyed
   *  YYYY-MM-DD — getMySidebarCounts().weekdays. Zero/absent = no badge. */
  counts?: Record<string, number>;
  /** Branch-side roles work weekends: true = Tue–Sun (6 days) instead of
   *  the department-side Tue–Sat (5 days). */
  includeSunday?: boolean;
}) {
  const router = useRouter();
  // Optimistic selection: highlight instantly on click; cleared when the
  // server's echoed `value` catches up (or changes for any other reason).
  const [pendingDate, setPendingDate] = React.useState<string | null>(null);
  React.useEffect(() => setPendingDate(null), [value]);
  const shown = pendingDate ?? value;

  const [y, m, d] = value.split("-").map(Number);
  const anchor = new Date(y, m - 1, d);
  // Monday of the anchored week (getDay(): Sun=0 … Sat=6).
  const monday = new Date(y, m - 1, d - ((anchor.getDay() + 6) % 7));
  const navigate = (v: string) => {
    setPendingDate(v);
    const qs = new URLSearchParams({ ...extraParams, [param]: v });
    router.push(`${basePath}?${qs.toString()}`);
  };

  return (
    <nav aria-label="Weekday" className="flex flex-col gap-1">
      {(includeSunday ? SIDEBAR_DAYS_WITH_SUNDAY : SIDEBAR_DAYS).map((day) => {
        const dt = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + day.offset);
        const date = `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
        const active = date === shown;
        return (
          <button
            key={day.label}
            type="button"
            onClick={() => navigate(date)}
            aria-current={active ? "date" : undefined}
            className={
              active
                ? "flex items-center justify-between gap-2 rounded-lg bg-blue-600 px-3 py-2 text-left text-sm font-semibold text-white"
                : "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }
          >
            {day.label}
            <CountBadge count={counts[date]} active={active} />
          </button>
        );
      })}
    </nav>
  );
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The month's 7-day chunks: 1-7 · 8-14 · 15-21 · 22-28 · 29-{last day}
 *  (the final chunk adjusts to the month's actual length; absent for
 *  28-day February). */
function monthDayChunks(year: number, month: number): { from: number; to: number }[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const chunks: { from: number; to: number }[] = [];
  for (let from = 1; from <= daysInMonth; from += 7) {
    chunks.push({ from, to: Math.min(from + 6, daysInMonth) });
  }
  return chunks;
}

const chunkLabel = (c: { from: number; to: number }) =>
  c.from === c.to ? `${c.from}` : `${c.from}–${c.to}`;

/** Accordion month sidebar for "My Tasks — Monthly" (2026-07-29 corrected
 *  interaction — no separate range dropdown here): ◀ year ▶ stepper +
 *  Jan–Dec list, same visual style as the Daily weekday sidebar. ONE click
 *  on a month selects it (Full month, ?mrange= dropped) AND expands its
 *  7-day ranges inline beneath it; only the SELECTED month is ever
 *  expanded, so picking another month collapses the previous one by
 *  construction. Clicking an inline range filters to it (?mrange=).
 *  Callers must pass extraParams WITHOUT mdate/mrange. */
export function MonthSidebar({
  value,
  range,
  basePath,
  extraParams = {},
  monthCounts = {},
  chunkCounts = {},
}: {
  /** The resolved Monthly anchor, YYYY-MM-DD. */
  value: string;
  /** The raw ?mrange= currently active ("" / undefined = Full month). */
  range?: string;
  basePath: string;
  extraParams?: Record<string, string>;
  /** Per-month NOT-YET-COMPLETED counts (Pending only, N/A excluded) for
   *  the stepper year, keyed 1..12 — getMySidebarCounts().months. */
  monthCounts?: Record<number, number>;
  /** The ANCHOR month's per-chunk counts, keyed "from-to" —
   *  getMySidebarCounts().monthChunks. Only valid for the server-anchored
   *  month, so they hide while an optimistic switch is in flight. */
  chunkCounts?: Record<string, number>;
}) {
  const router = useRouter();
  const [anchorY, anchorM] = value.split("-").map(Number);
  // Optimistic selection (the 2026-07-29 lag fix): expand/highlight
  // instantly on click; cleared when the server's echoed value/range
  // catches up.
  const [pending, setPending] = React.useState<{ y: number; m: number; range?: string } | null>(null);
  React.useEffect(() => setPending(null), [value, range]);
  const y = pending?.y ?? anchorY;
  const m = pending?.m ?? anchorM;
  const shownRange = pending ? pending.range : range;
  // Chunk counts belong to the SERVER-anchored month — stale during an
  // optimistic month/year switch, so hide them until the echo lands.
  const chunkCountsValid = y === anchorY && m === anchorM;

  const navigate = (year: number, month: number, mrange?: string) => {
    setPending({ y: year, m: month, range: mrange });
    const qs = new URLSearchParams({
      ...extraParams,
      mdate: `${year}-${pad2(month)}-01`,
      ...(mrange ? { mrange } : {}),
    });
    router.push(`${basePath}?${qs.toString()}`);
  };
  const arrowClass =
    "flex size-6 items-center justify-center rounded-md border border-gray-200 bg-white text-[10px] text-gray-500 hover:border-blue-300 hover:text-blue-600";
  const rangeClass = (active: boolean) =>
    active
      ? "flex items-center justify-between gap-2 rounded-md bg-blue-50 px-3 py-1 text-left text-xs font-semibold text-blue-700"
      : "flex items-center justify-between gap-2 rounded-md px-3 py-1 text-left text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900";

  return (
    <nav aria-label="Month" className="flex flex-col gap-1">
      <div className="mb-1 flex items-center justify-between px-1">
        <button type="button" aria-label="Previous year" onClick={() => navigate(y - 1, m)} className={arrowClass}>
          ◀
        </button>
        <span className="text-sm font-semibold text-gray-900">{y}</span>
        <button type="button" aria-label="Next year" onClick={() => navigate(y + 1, m)} className={arrowClass}>
          ▶
        </button>
      </div>
      {MONTH_LABELS.map((label, i) => {
        const active = i + 1 === m;
        return (
          <div key={label} className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => navigate(y, i + 1)}
              aria-current={active ? "date" : undefined}
              aria-expanded={active}
              className={
                active
                  ? "flex items-center justify-between gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-left text-sm font-semibold text-white"
                  : "flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }
            >
              <span>
                {label} {active ? "▾" : ""}
              </span>
              {/* Month counts are for the SERVER-anchored year — hide while
                  an optimistic year step is in flight. */}
              <CountBadge count={y === anchorY ? monthCounts[i + 1] : undefined} active={active} />
            </button>
            {active && (
              <div className="mb-1 ml-3 flex flex-col gap-0.5 border-l border-gray-200 pl-2">
                <button type="button" onClick={() => navigate(y, m)} className={rangeClass(!shownRange)}>
                  Full month
                  <CountBadge
                    count={chunkCountsValid ? monthCounts[m] : undefined}
                    active={false}
                  />
                </button>
                {monthDayChunks(y, m).map((c) => {
                  const v = `${c.from}-${c.to}`;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => navigate(y, m, v)}
                      className={rangeClass(shownRange === v)}
                    >
                      {chunkLabel(c)}
                      <CountBadge count={chunkCountsValid ? chunkCounts[v] : undefined} active={false} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/** Compact month selector for card/grid headings where the 12-row sidebar
 *  can't fit: one dropdown spanning the anchor's previous, current, and
 *  next year ("Jul 2026"), same navigation contract as MonthSidebar
 *  (?mdate=YYYY-MM-01, drops ?mrange=). */
export function MonthDropdown({
  value,
  basePath,
  extraParams = {},
}: {
  /** The resolved Monthly anchor, YYYY-MM-DD. */
  value: string;
  basePath: string;
  extraParams?: Record<string, string>;
}) {
  const router = useRouter();
  const [y, m] = value.split("-").map(Number);
  const current = `${y}-${pad2(m)}`;
  const options = [y - 1, y, y + 1].flatMap((year) =>
    MONTH_LABELS.map((label, i) => ({
      value: `${year}-${pad2(i + 1)}`,
      label: `${label} ${year}`,
    })),
  );
  const navigate = (v: string) => {
    const qs = new URLSearchParams({ ...extraParams, mdate: `${v}-01` });
    router.push(`${basePath}?${qs.toString()}`);
  };

  return (
    <select
      value={current}
      onChange={(e) => navigate(e.target.value)}
      aria-label="Month"
      className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 shadow-sm focus:border-blue-400 focus:outline-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** 7-day range dropdown within the selected month (2026-07-29): Full month
 *  (default) · 1–7 · 8–14 · 15–21 · 22–28 · 29–{last day} — the final chunk
 *  is labeled with the month's ACTUAL last day (29–31 / 29–30 / bare 29 for
 *  leap February; absent entirely for 28-day February). Navigates
 *  ?mrange=from-to, omitted for Full month; pins ?mdate= so the anchor
 *  month always survives (callers pass extraParams WITHOUT mdate/mrange). */
export function MonthRangeDropdown({
  value,
  range,
  basePath,
  extraParams = {},
}: {
  /** The resolved Monthly anchor, YYYY-MM-DD — decides the month length. */
  value: string;
  /** The raw ?mrange= currently active ("" / undefined = Full month). */
  range?: string;
  basePath: string;
  extraParams?: Record<string, string>;
}) {
  const router = useRouter();
  const [y, m] = value.split("-").map(Number);
  const navigate = (v: string) => {
    const qs = new URLSearchParams({
      ...extraParams,
      mdate: value,
      ...(v ? { mrange: v } : {}),
    });
    router.push(`${basePath}?${qs.toString()}`);
  };

  return (
    <select
      value={range ?? ""}
      onChange={(e) => navigate(e.target.value)}
      aria-label="Day range"
      className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 shadow-sm focus:border-blue-400 focus:outline-none"
    >
      <option value="">Full month</option>
      {monthDayChunks(y, m).map((c) => (
        <option key={`${c.from}-${c.to}`} value={`${c.from}-${c.to}`}>
          {chunkLabel(c)}
        </option>
      ))}
    </select>
  );
}

export function EntityPicker({
  label,
  value,
  groups,
  param,
  basePath,
  extraParams = {},
}: {
  label: string;
  value: string;
  groups: EntityPickerGroup[];
  /** The query param this picker controls (e.g. "department"). */
  param: string;
  basePath: string;
  /** Params to carry along unchanged (e.g. { view: "branch" }). */
  extraParams?: Record<string, string>;
}) {
  const router = useRouter();
  const navigate = (v: string) => {
    const qs = new URLSearchParams({ ...extraParams, [param]: v });
    router.push(`${basePath}?${qs.toString()}`);
  };

  return (
    <label className="flex w-fit items-center gap-3 text-sm font-medium text-gray-700">
      {label}
      <select
        value={value}
        onChange={(e) => navigate(e.target.value)}
        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-sm focus:border-blue-400 focus:outline-none"
      >
        {groups.map((g, i) =>
          g.label ? (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </optgroup>
          ) : (
            <React.Fragment key={i}>
              {g.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </React.Fragment>
          ),
        )}
      </select>
    </label>
  );
}
