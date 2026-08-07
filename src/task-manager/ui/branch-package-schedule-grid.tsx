"use client";

// Package Table grid (2026-08-07): Branches (rows) x Wed-Sun (columns), each
// cell a Package selector. Setting a cell fans out through the recurring
// task engine server-side (see data/branch-package-schedule.ts); this
// component only renders the (branch, weekday) -> package config and, for
// Edit-tier viewers, lets them change it. Interaction shape mirrors
// manpower-schedule-grid.tsx's EditableCell: a plain <select>, onChange
// fires immediately inside useTransition, inline per-cell error message on
// failure, no separate "save" button/dirty-state tracking.
import * as React from "react";
import type { ActionResult } from "./types";
import type {
  BranchPackageScheduleCell,
  BranchPackageScheduleData,
  PackageTableWeekday,
} from "@/task-manager/data/branch-package-schedule";

function cellKey(branch: string, weekday: PackageTableWeekday): string {
  return `${branch}::${weekday}`;
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="mt-1 text-xs text-red-600">{error}</p>;
}

function EditableCell({
  cell,
  packages,
  onSetCell,
}: {
  cell: BranchPackageScheduleCell;
  packages: BranchPackageScheduleData["packages"];
  onSetCell: (
    branch: string,
    weekday: PackageTableWeekday,
    packageGroupId: string | null,
  ) => Promise<ActionResult>;
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  return (
    <div>
      <select
        value={cell.packageGroupId ?? ""}
        disabled={pending}
        onChange={(e) => {
          setError(null);
          const value = e.target.value || null;
          startTransition(async () => {
            const result = await onSetCell(cell.branch, cell.weekday, value);
            if (!result.ok) setError(result.message);
          });
        }}
        className={`w-full rounded-md border-0 px-2 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          cell.packageGroupId ? "bg-blue-50 text-blue-700" : "bg-gray-50 text-gray-400"
        }`}
      >
        <option value="">–</option>
        {packages.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <ErrorLine error={error} />
    </div>
  );
}

function StaticCell({ cell }: { cell: BranchPackageScheduleCell }) {
  if (!cell.packageName) {
    return <span className="text-xs text-gray-300">–</span>;
  }
  return <span className="text-xs font-medium text-gray-700">{cell.packageName}</span>;
}

export function BranchPackageScheduleGrid({
  data,
  canEdit,
  onSetCell,
}: {
  data: BranchPackageScheduleData;
  canEdit: boolean;
  onSetCell: (
    branch: string,
    weekday: PackageTableWeekday,
    packageGroupId: string | null,
  ) => Promise<ActionResult>;
}) {
  const cellAt = React.useMemo(
    () => new Map(data.cells.map((c) => [cellKey(c.branch, c.weekday), c])),
    [data.cells],
  );

  if (data.branches.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
          Package Table
        </h3>
        <p className="text-sm text-gray-400">No branches found yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-500">
        Package Table
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-y-1.5">
          <thead>
            <tr>
              <th className="px-2 text-left text-xs font-semibold text-gray-500">Branch</th>
              {data.weekdays.map((weekday) => (
                <th key={weekday} className="px-2 text-left text-xs font-semibold text-gray-500">
                  {weekday}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.branches.map((branch) => (
              <tr key={branch}>
                <td className="whitespace-nowrap px-2 py-1 align-top text-sm font-medium text-gray-700">
                  {branch}
                </td>
                {data.weekdays.map((weekday) => {
                  const cell = cellAt.get(cellKey(branch, weekday));
                  if (!cell) {
                    return (
                      <td key={weekday} className="min-w-32 px-2 py-1 align-top">
                        <span className="text-xs text-gray-300">–</span>
                      </td>
                    );
                  }
                  return (
                    <td key={weekday} className="min-w-32 px-2 py-1 align-top">
                      {canEdit ? (
                        <EditableCell cell={cell} packages={data.packages} onSetCell={onSetCell} />
                      ) : (
                        <StaticCell cell={cell} />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
