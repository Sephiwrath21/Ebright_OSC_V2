"use client";

// Package Table grid (2026-08-07): Branches (rows) x Wed-Sun (columns), each
// cell a Package selector. Setting a cell fans out through the recurring
// task engine server-side (see data/branch-package-schedule.ts).
//
// Batch-save (2026-08-07, revised): cell edits accumulate in local `pending`
// state as the user fills out the table — nothing is saved/applied until
// "Save" is clicked. This deliberately replaced the original immediate-
// per-cell-save behavior (which mirrored manpower-schedule-grid.tsx's
// EditableCell), so a user can set several branches/days before committing
// any of them. Pattern (dirty flag + amber "Unsaved changes" chip +
// beforeunload warning) copied from this codebase's one existing precedent
// for exactly this shape: src/app/manpower-schedule/plan-new-week/grid/
// page.tsx. Per the user's explicit choice, only the browser-level
// beforeunload warning (tab-close/refresh) is implemented — in-app
// navigation (e.g. clicking another sidebar link while dirty) is NOT
// intercepted; that would be new, unprecedented App-Router-navigation-guard
// territory this codebase doesn't otherwise have, and was deliberately
// scoped out.
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
  value,
  packages,
  dirty,
  disabled,
  error,
  onChange,
}: {
  value: string | null;
  packages: BranchPackageScheduleData["packages"];
  dirty: boolean;
  disabled: boolean;
  error: string | null;
  onChange: (packageGroupId: string | null) => void;
}) {
  return (
    <div>
      <select
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
        className={`w-full rounded-md border-0 px-2 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          value ? "bg-blue-50 text-blue-700" : "bg-gray-50 text-gray-400"
        } ${dirty ? "ring-2 ring-amber-400" : ""}`}
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
  return (
    <span className="inline-flex w-full items-center justify-center rounded-md bg-blue-50 px-2 py-1.5 text-xs font-medium text-blue-700">
      {cell.packageName}
    </span>
  );
}

type SaveState = "idle" | "saving" | "error";

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

  // (branch, weekday) -> locally-edited, not-yet-saved packageGroupId (or
  // null for "clear"). Absent from this map = "shows the server value,
  // unchanged." A successful save does NOT delete its key immediately —
  // see the pruning effect below for why (avoids a flash back to the old
  // value while waiting for revalidatePath's refreshed `data` to land).
  const [pending, setPending] = React.useState<Map<string, string | null>>(new Map());
  const [errors, setErrors] = React.useState<Map<string, string>>(new Map());
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [summary, setSummary] = React.useState<string | null>(null);

  const dirty = pending.size > 0;

  // Prune pending entries once the (revalidated) server data actually
  // agrees with them — i.e. once a save has genuinely landed, not merely
  // once the save action returned {ok:true}. This is what avoids the cell
  // ever visually reverting to its pre-save value: the cell keeps showing
  // its pending value continuously (pending -> now-matching-server value),
  // rather than being cleared eagerly on the action's success signal and
  // briefly falling back to a not-yet-refreshed server value in between.
  React.useEffect(() => {
    setPending((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Map(prev);
      for (const [key, value] of prev) {
        if ((cellAt.get(key)?.packageGroupId ?? null) === value) {
          next.delete(key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [cellAt]);

  // Browser-level-only warning (tab close/refresh) — see file header for
  // why in-app navigation is deliberately NOT also guarded.
  React.useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const setLocalCell = (branch: string, weekday: PackageTableWeekday, packageGroupId: string | null) => {
    const key = cellKey(branch, weekday);
    const serverValue = cellAt.get(key)?.packageGroupId ?? null;
    setPending((prev) => {
      const next = new Map(prev);
      if (packageGroupId === serverValue) {
        // Editing back to the already-saved value is a no-op, not a pending edit.
        next.delete(key);
      } else {
        next.set(key, packageGroupId);
      }
      return next;
    });
    setErrors((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
    setSummary(null);
  };

  const save = () => {
    if (saveState === "saving" || pending.size === 0) return;
    setSaveState("saving");
    setSummary(null);
    const entries = [...pending.entries()];
    (async () => {
      let succeeded = 0;
      const failedKeys = new Map<string, string>();
      for (const [key, packageGroupId] of entries) {
        const [branch, weekday] = key.split("::") as [string, PackageTableWeekday];
        // A transient network/session failure must degrade to a normal
        // per-cell error, not abort the whole batch and wedge saveState
        // on "saving" forever — the remaining cells still get attempted.
        let result: ActionResult;
        try {
          result = await onSetCell(branch, weekday, packageGroupId);
        } catch {
          result = { ok: false, message: "Network error — try saving again" };
        }
        if (result.ok) {
          succeeded += 1;
          // Deliberately NOT removed from `pending` here — see the pruning
          // effect above.
        } else {
          failedKeys.set(key, result.message);
        }
      }
      setErrors(failedKeys);
      if (failedKeys.size === 0) {
        setSaveState("idle");
        setSummary(`Saved ${succeeded} change${succeeded === 1 ? "" : "s"}.`);
      } else {
        setSaveState("error");
        setSummary(
          `${succeeded} saved, ${failedKeys.size} failed — fix the highlighted cell${failedKeys.size === 1 ? "" : "s"} below and save again.`,
        );
      }
    })();
  };

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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500">Package Table</h3>
        {canEdit && (
          <div className="flex items-center gap-3">
            {dirty && saveState !== "saving" && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600">
                <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
                Unsaved changes
              </span>
            )}
            {summary && (
              <span className={`text-xs ${saveState === "error" ? "text-red-600" : "text-emerald-600"}`}>
                {summary}
              </span>
            )}
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saveState === "saving"}
              className="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saveState === "saving" ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>
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
                  const key = cellKey(branch, weekday);
                  const isDirty = pending.has(key);
                  const value = isDirty ? (pending.get(key) as string | null) : cell.packageGroupId;
                  return (
                    <td key={weekday} className="min-w-32 px-2 py-1 align-top">
                      {canEdit ? (
                        <EditableCell
                          value={value}
                          packages={data.packages}
                          dirty={isDirty}
                          disabled={saveState === "saving"}
                          error={errors.get(key) ?? null}
                          onChange={(packageGroupId) => setLocalCell(branch, weekday, packageGroupId)}
                        />
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
