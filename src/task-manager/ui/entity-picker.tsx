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
