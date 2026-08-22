"use client";

// URL-driven controls for the Task Manager page: the entity dropdown
// (picking a department/branch navigates, so the server component
// re-fetches) and the Daily date picker (same navigation pattern — the
// chosen date rides in ?date= and so survives entity/tab switches).

import * as React from "react";
import { useRouter } from "next/navigation";
import { chunkLabel, monthDayChunks } from "./types";

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
    "flex size-7 items-center justify-center rounded-lg border border-gray-200 bg-white text-xs text-gray-500 shadow-sm hover:border-blue-300 hover:text-blue-600 dark:border-slate-500 dark:bg-slate-950 dark:text-slate-400 dark:hover:border-blue-500 dark:hover:text-blue-400";

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
        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 shadow-sm focus:border-blue-400 focus:outline-none dark:border-slate-500 dark:bg-slate-950 dark:text-slate-100"
      />
      <button type="button" aria-label={`Next ${unit}`} onClick={() => shift(1)} className={arrowClass}>
        ▶
      </button>
    </div>
  );
}

const pad2 = (n: number) => String(n).padStart(2, "0");

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** How far the Year dropdown spans around the REAL current year (2026-08-05
 *  redesign — was a single combined "Jul 2026 ▾" select spanning only the
 *  anchor's ±1 year, which couldn't reach further back/forward without
 *  first navigating there some other way). Recomputed from `new Date()` on
 *  every render, so the window shifts automatically each year — never
 *  hardcoded. */
const YEAR_DROPDOWN_PAST = 5;
const YEAR_DROPDOWN_FUTURE = 10;

const selectClass =
  "rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 shadow-sm focus:border-blue-400 focus:outline-none dark:border-slate-500 dark:bg-slate-950 dark:text-slate-100";

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
          className="absolute z-20 mt-1 max-h-56 w-max min-w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:ring-1 dark:ring-white/10"
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
                    ? "bg-blue-50 font-semibold text-blue-700 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-200 dark:hover:bg-blue-800"
                    : "text-gray-700 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"
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
    <label className="flex w-fit items-center gap-3 text-sm font-medium text-gray-700 dark:text-slate-300">
      {label}
      <select
        value={value}
        onChange={(e) => navigate(e.target.value)}
        className="rounded-xl border-2 border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow focus:border-blue-500 focus:outline-none dark:border-slate-500 dark:bg-slate-950 dark:text-slate-100"
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
