"use client";

// Dropdown entity selector for the Task Manager page — picking a value
// navigates via the URL (router.push), so the server component re-fetches
// the selected department/branch. Grouped option sets (branch regions)
// render as <optgroup>s; a single ungrouped set renders flat.

import * as React from "react";
import { useRouter } from "next/navigation";

export interface EntityPickerGroup {
  /** Omit for a flat, ungrouped option list. */
  label?: string;
  options: readonly string[];
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
