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
 *  Sun=0). Three ranges per the 2026-07-29 final role spec: department-side
 *  Tue–Sat; Branch Manager + Branch Exec Tue–SUN; Coaches Wed–SUN. The
 *  range comes from role-views.ts (weekdayRangeOf). */
const TUE_SAT = [
  { label: "Tuesday", offset: 1 },
  { label: "Wednesday", offset: 2 },
  { label: "Thursday", offset: 3 },
  { label: "Friday", offset: 4 },
  { label: "Saturday", offset: 5 },
];
const SIDEBAR_RANGES: Record<
  "mon-sun" | "tue-sat" | "tue-sun" | "wed-sun",
  { label: string; offset: number }[]
> = {
  // Full week (2026-08-01): the CEO's range.
  "mon-sun": [{ label: "Monday", offset: 0 }, ...TUE_SAT, { label: "Sunday", offset: 6 }],
  "tue-sat": TUE_SAT,
  "tue-sun": [...TUE_SAT, { label: "Sunday", offset: 6 }],
  "wed-sun": [...TUE_SAT.slice(1), { label: "Sunday", offset: 6 }],
};

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
  range = "tue-sat",
}: {
  /** The resolved date currently shown, YYYY-MM-DD. */
  value: string;
  basePath: string;
  extraParams?: Record<string, string>;
  param?: string;
  /** Per-day NOT-YET-COMPLETED counts (Pending only, N/A excluded), keyed
   *  YYYY-MM-DD — getMySidebarCounts().weekdays. Zero/absent = no badge. */
  counts?: Record<string, number>;
  /** Which days to list — from role-views.ts weekdayRangeOf(). */
  range?: "mon-sun" | "tue-sat" | "tue-sun" | "wed-sun";
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
      {SIDEBAR_RANGES[range].map((day) => {
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

/** The month's range chunks — FOUR, per the 2026-07-30 confirmation
 *  (matching the ClickUp reference): 1-7 · 8-14 · 15-21 · 22-{last day}
 *  (22-31 / 22-30 / 22-28 depending on the month's actual length). */
function monthDayChunks(year: number, month: number): { from: number; to: number }[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  return [
    { from: 1, to: 7 },
    { from: 8, to: 14 },
    { from: 15, to: 21 },
    { from: 22, to: daysInMonth },
  ];
}

const chunkLabel = (c: { from: number; to: number }) =>
  c.from === c.to ? `${c.from}` : `${c.from}–${c.to}`;

/** Vertical range sidebar for "My Tasks — Monthly" (2026-07-30 layout):
 *  "Full month" + the selected month's four range chunks, same visual
 *  style/position as the Daily weekday sidebar, each with a pending-count
 *  badge. The MONTH itself is picked by the compact MonthDropdown in the
 *  section heading — no 12-month list here. Selection updates
 *  OPTIMISTICALLY (instant highlight while the server round-trip runs),
 *  then re-syncs from the echoed values. Callers must pass extraParams
 *  WITHOUT mdate/mrange. */
export function MonthRangeSidebar({
  value,
  range,
  basePath,
  extraParams = {},
  fullCount,
  chunkCounts = {},
}: {
  /** The resolved Monthly anchor, YYYY-MM-DD (decides the month length). */
  value: string;
  /** The raw ?mrange= currently active ("" / undefined = Full month). */
  range?: string;
  basePath: string;
  extraParams?: Record<string, string>;
  /** The anchor month's total pending count (the "Full month" badge) —
   *  getMySidebarCounts().months[anchor month]. */
  fullCount?: number;
  /** The anchor month's per-chunk pending counts, keyed "from-to" —
   *  getMySidebarCounts().monthChunks. Zero/absent = no badge. */
  chunkCounts?: Record<string, number>;
}) {
  const router = useRouter();
  // Optimistic selection: highlight instantly on click; cleared when the
  // server's echoed value/range catches up. `undefined` = no pending pick;
  // "" = Full month picked.
  const [pending, setPending] = React.useState<string | undefined>(undefined);
  React.useEffect(() => setPending(undefined), [value, range]);
  const shown = pending !== undefined ? pending : (range ?? "");

  const [y, m] = value.split("-").map(Number);
  const navigate = (v: string) => {
    setPending(v);
    const qs = new URLSearchParams({
      ...extraParams,
      mdate: value,
      ...(v ? { mrange: v } : {}),
    });
    router.push(`${basePath}?${qs.toString()}`);
  };
  const itemClass = (active: boolean) =>
    active
      ? "flex items-center justify-between gap-2 rounded-lg bg-blue-600 px-3 py-2 text-left text-sm font-semibold text-white"
      : "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900";

  return (
    <nav aria-label="Day range" className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => navigate("")}
        aria-current={shown === "" ? "true" : undefined}
        className={itemClass(shown === "")}
      >
        Full month
        <CountBadge count={fullCount} active={shown === ""} />
      </button>
      {monthDayChunks(y, m).map((c) => {
        const v = `${c.from}-${c.to}`;
        const active = shown === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => navigate(v)}
            aria-current={active ? "true" : undefined}
            className={itemClass(active)}
          >
            {chunkLabel(c)}
            <CountBadge count={chunkCounts[v]} active={active} />
          </button>
        );
      })}
    </nav>
  );
}

/** How far the Year dropdown spans around the REAL current year (2026-08-05
 *  redesign — was a single combined "Jul 2026 ▾" select spanning only the
 *  anchor's ±1 year, which couldn't reach further back/forward without
 *  first navigating there some other way). Recomputed from `new Date()` on
 *  every render, so the window shifts automatically each year — never
 *  hardcoded. */
const YEAR_DROPDOWN_PAST = 5;
const YEAR_DROPDOWN_FUTURE = 10;

const selectClass =
  "rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 shadow-sm focus:border-blue-400 focus:outline-none";

/** Custom single-select dropdown (2026-08-05, replacing a native <select>
 *  for Year/Month) — NOT a native <select>: those hand the open dropdown
 *  list's rendering to the OS/browser, which makes it impossible to give
 *  the selected option a persistent highlight independent of whatever the
 *  mouse happens to be hovering (no cross-browser way to style native
 *  <option> backgrounds at all). This is a button that toggles a plain
 *  absolutely-positioned list of divs instead, so both states are just
 *  ordinary CSS classes: `selected` always shows the blue highlight,
 *  `hover:` only ever applies to whichever row the mouse is actually over,
 *  and the two never fight each other. Same open/close interaction as
 *  MemberDropdown (recipient-picker.tsx) — outside-click/Escape to close —
 *  except picking an option closes it immediately (single-select, no
 *  "Done" row needed). */
function CompactDropdown<T extends string | number>({
  value,
  options,
  onSelect,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onSelect: (value: T) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const current = options.find((o) => o.value === value);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`${selectClass} flex min-w-16 items-center justify-between gap-2`}
      >
        <span>{current?.label ?? value}</span>
        <span className="text-gray-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className="absolute z-20 mt-1 max-h-56 w-max min-w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          {options.map((o) => {
            const isSelected = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onSelect(o.value);
                  setOpen(false);
                }}
                className={`block w-full px-3 py-1.5 text-left text-xs ${
                  isSelected
                    ? "bg-blue-50 font-semibold text-blue-700 hover:bg-blue-100"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Year + Month selector (2026-08-05: split from the old single "Jul 2026 ▾"
 *  combined dropdown into two, per the product decision) — the Monthly
 *  section heading and card/grid headings. Year spans [thisYear - 5,
 *  thisYear + 10] (dynamic — see YEAR_DROPDOWN_PAST/FUTURE), Month is the
 *  standard 12. Either dropdown alone navigates ?mdate=YYYY-MM-01 (combining
 *  its own new value with the OTHER dropdown's current value) and drops
 *  ?mrange= (a new month resets to Full month) — same external contract as
 *  the old single dropdown, so no caller/data-fetching change was needed. */
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
  const thisYear = new Date().getFullYear();
  const years = [];
  for (let year = thisYear - YEAR_DROPDOWN_PAST; year <= thisYear + YEAR_DROPDOWN_FUTURE; year++) {
    years.push(year);
  }
  // Defensive: if the currently-anchored year somehow falls outside the
  // computed window (e.g. straddling a year boundary at the exact moment
  // "now" ticks over), keep it selectable rather than silently losing the
  // selection.
  if (!years.includes(y)) years.push(y);
  years.sort((a, b) => a - b);

  const navigate = (nextYear: number, nextMonth: number) => {
    const v = `${nextYear}-${pad2(nextMonth)}`;
    const qs = new URLSearchParams({ ...extraParams, mdate: `${v}-01` });
    router.push(`${basePath}?${qs.toString()}`);
  };

  return (
    <div className="flex items-center gap-1.5">
      <CompactDropdown
        value={y}
        options={years.map((year) => ({ value: year, label: String(year) }))}
        onSelect={(year) => navigate(year, m)}
        ariaLabel="Year"
      />
      <CompactDropdown
        value={m}
        options={MONTH_LABELS.map((label, i) => ({ value: i + 1, label }))}
        onSelect={(month) => navigate(y, month)}
        ariaLabel="Month"
      />
    </div>
  );
}

/** 7-day range dropdown within the selected month (2026-07-29): Full month
 *  (default) · 1–7 · 8–14 · 15–21 · 22–28 · 29–{last day} — the final chunk
 *  is labeled with the month's ACTUAL last day (29–31 / 29–30 / bare 29 for
 *  leap February; absent entirely for 28-day February). Navigates
 *  ?mrange=from-to, omitted for Full month; pins ?mdate= so the anchor
 *  month always survives (callers pass extraParams WITHOUT mdate/mrange).
 *  Uses CompactDropdown (2026-08-05, was a native <select>) so its arrow
 *  icon and selected/hover styling match Year/Month exactly instead of
 *  falling back to the browser's own default chevron. */
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

  const options = [
    { value: "", label: "Full month" },
    ...monthDayChunks(y, m).map((c) => ({ value: `${c.from}-${c.to}`, label: chunkLabel(c) })),
  ];

  return (
    <CompactDropdown value={range ?? ""} options={options} onSelect={navigate} ariaLabel="Day range" />
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
