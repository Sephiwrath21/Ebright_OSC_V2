"use client";

// Package Table grid (2026-08-07): Branches (rows) x Wed-Sun (columns), each
// cell a Package selector. Setting a cell fans out through the recurring
// task engine server-side (see data/branch-package-schedule.ts).
//
// Multi-select (2026-08-08): a cell may now hold MULTIPLE packages (see
// branch-package-schedule.ts's file header for the design reversal). The
// cell control is a chips+dropdown widget modeled on recipient-picker.tsx's
// MemberDropdown — click to open, checkbox rows toggle a package in/out of
// the cell's pending set WITHOUT closing the dropdown (so several picks
// happen in one open session), closes on outside-click/Escape/"Done".
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
//
// `pending` now maps cellKey -> Set<string> (the FULL desired set of
// package ids for that cell), not a single nullable id — every place that
// used to compare/read a single value now does SET comparison against the
// server's current package-id set for that cell (see `setsEqual` below).
// Editing a cell's set back to exactly the server's current set un-dirties
// it, same "editing back to the original value is a no-op" principle the
// single-select version had.
import * as React from "react";
import type { ActionResult } from "./types";
import type {
  BranchPackageOption,
  BranchPackageScheduleCell,
  BranchPackageScheduleData,
  PackageTableWeekday,
} from "@/task-manager/data/branch-package-schedule";

function cellKey(branch: string, weekday: PackageTableWeekday): string {
  return `${branch}::${weekday}`;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) {
    if (!b.has(v)) return false;
  }
  return true;
}

function idSet(packages: BranchPackageOption[]): Set<string> {
  return new Set(packages.map((p) => p.id));
}

// Collapsed-state chip cap (both the editable cell and the read-only
// StaticCell) — the schema allows up to 20 packages per cell
// (setCellSchema's sanity cap in branch-package-schedule.ts), and an
// unbounded `flex flex-wrap` chip row would wrap across several lines for a
// heavily-loaded cell, inflating that table row's height past its
// neighbors. Mirrors the "+N more" truncation pattern already used for
// Package/Template cards' task-title previews (template-group-dashboard.tsx,
// `previewTitles` / `+{taskCount - previewTitles.length} more`). Only
// affects the collapsed summary — the dropdown popover itself (which has
// its own `max-h-56 overflow-y-auto` scroll) always lists every package.
const COLLAPSED_CHIP_LIMIT = 4;

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="mt-1 text-xs text-red-600">{error}</p>;
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-3">
      <path
        d="M3 8.5L6.5 12L13 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Chips + dropdown cell control (not a native <select multiple> — those
 *  have terrible multi-pick UX). Collapsed state shows a removable chip per
 *  currently-selected package plus a "+" click-target. Clicking "+" opens a
 *  checkbox list of every available package; each row toggles that
 *  package's membership in the cell's set and the list STAYS OPEN across
 *  multiple picks — mirrors MemberDropdown's explicit "stays open" design
 *  (recipient-picker.tsx) so several packages can be picked/removed in one
 *  session. Closes on outside-click, Escape, or the "Done" row.
 *
 *  Positioning: plain `relative` container + `absolute z-20 mt-1`, same as
 *  MemberDropdown itself — deliberately not portaled to document.body
 *  (contrast Sidebar.tsx's flyout, which portals because it must escape a
 *  fixed-width, height-clipped rail). The table's own wrapper is only
 *  `overflow-x-auto` (no fixed height, no overflow-y clipping), and the
 *  page/card is wide enough in normal use that a cell's popover doesn't
 *  need to escape it — same trade-off MemberDropdown already makes
 *  elsewhere in this module. Rightmost-column popovers can still overhang
 *  the card edge on a narrow viewport; accepted as a pre-existing class of
 *  limitation rather than reason to add portal machinery here. */
function MultiPackageCell({
  packages,
  selectedIds,
  dirty,
  disabled,
  error,
  onToggle,
}: {
  packages: BranchPackageOption[];
  selectedIds: Set<string>;
  dirty: boolean;
  disabled: boolean;
  error: string | null;
  onToggle: (packageId: string) => void;
}) {
  // `open` is local to each cell instance — nothing coordinates across the
  // grid's up-to-110 cells, so more than one cell's popover can be open at
  // once (e.g. via keyboard Tab-and-Enter into a second cell without
  // closing the first; a mouse user effectively can't, since clicking
  // elsewhere is itself an outside-click that closes the first). Accepted
  // as a low-impact gap rather than adding a single-open-dropdown
  // coordinator to this component.
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

  const selected = packages.filter((p) => selectedIds.has(p.id));
  const visibleChips = selected.slice(0, COLLAPSED_CHIP_LIMIT);
  const hiddenChipCount = selected.length - visibleChips.length;

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`flex min-h-[30px] w-full flex-wrap items-center gap-1 rounded-md px-1.5 py-1 ${
          selected.length > 0 ? "bg-blue-50" : "bg-gray-50"
        } ${dirty ? "ring-2 ring-amber-400" : ""}`}
      >
        {visibleChips.map((p) => (
          <span
            key={p.id}
            className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[11px] font-medium text-blue-700"
          >
            {p.name}
            {!disabled && (
              <button
                type="button"
                onClick={() => onToggle(p.id)}
                className="text-blue-400 hover:text-blue-700"
                aria-label={`Remove ${p.name}`}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {hiddenChipCount > 0 && (
          <span className="text-[11px] font-medium text-gray-400">+{hiddenChipCount} more</span>
        )}
        {/* Deliberately always clickable/visible, unlike MemberDropdown
            (which short-circuits to plain text when its member list is
            empty) — `packages` here is `data.packages`, the SAME org-wide
            package list for all ~110 cells in the grid, so it is either
            non-empty for every cell or empty for every cell at once; the
            open-but-empty state below already renders "No packages
            available." A trigger that's occasionally empty-for-one-cell
            isn't a real scenario here the way it is for MemberDropdown's
            per-cell-different member lists, so the extra short-circuit
            wasn't worth the branching. */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className="rounded-full px-1.5 py-0.5 text-[11px] font-medium text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {selected.length === 0 ? "+ Add" : "+"}
        </button>
      </div>

      {open && (
        <div className="absolute z-20 mt-1 max-h-56 w-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {packages.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">No packages available.</p>
          ) : (
            packages.map((p) => {
              const isSelected = selectedIds.has(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onToggle(p.id)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${
                    isSelected ? "bg-blue-50 text-blue-700" : "text-gray-700"
                  }`}
                >
                  <span
                    className={`flex size-3.5 shrink-0 items-center justify-center rounded border ${
                      isSelected ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300"
                    }`}
                  >
                    {isSelected && <CheckIcon />}
                  </span>
                  <span className="truncate">{p.name}</span>
                </button>
              );
            })
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="block w-full border-t border-gray-100 px-3 py-1.5 text-center text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            Done
          </button>
        </div>
      )}
      <ErrorLine error={error} />
    </div>
  );
}

function StaticCell({ cell }: { cell: BranchPackageScheduleCell }) {
  if (cell.packages.length === 0) {
    return <span className="text-xs text-gray-300">–</span>;
  }
  const visible = cell.packages.slice(0, COLLAPSED_CHIP_LIMIT);
  const hiddenCount = cell.packages.length - visible.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((p) => (
        <span
          key={p.id}
          className="inline-flex items-center rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700"
        >
          {p.name}
        </span>
      ))}
      {hiddenCount > 0 && <span className="text-xs text-gray-400">+{hiddenCount} more</span>}
    </div>
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
    packageGroupIds: string[],
  ) => Promise<ActionResult>;
}) {
  const cellAt = React.useMemo(
    () => new Map(data.cells.map((c) => [cellKey(c.branch, c.weekday), c])),
    [data.cells],
  );

  // (branch, weekday) -> locally-edited, not-yet-saved FULL desired set of
  // package ids for that cell. Absent from this map = "shows the server
  // value, unchanged." A successful save does NOT delete its key
  // immediately — see the pruning effect below for why (avoids a flash
  // back to the old value while waiting for revalidatePath's refreshed
  // `data` to land).
  const [pending, setPending] = React.useState<Map<string, Set<string>>>(new Map());
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
  // Set-equality comparison (not single-value equality) against `data`'s
  // current cell packages, since `pending` now holds full sets.
  React.useEffect(() => {
    setPending((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Map(prev);
      for (const [key, value] of prev) {
        const serverIds = idSet(cellAt.get(key)?.packages ?? []);
        if (setsEqual(value, serverIds)) {
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

  const toggleCellPackage = (branch: string, weekday: PackageTableWeekday, packageId: string) => {
    const key = cellKey(branch, weekday);
    const serverIds = idSet(cellAt.get(key)?.packages ?? []);
    setPending((prev) => {
      const baseline = prev.get(key) ?? new Set(serverIds);
      const nextSet = new Set(baseline);
      if (nextSet.has(packageId)) {
        nextSet.delete(packageId);
      } else {
        nextSet.add(packageId);
      }
      const next = new Map(prev);
      if (setsEqual(nextSet, serverIds)) {
        // Editing back to the already-saved set is a no-op, not a pending edit.
        next.delete(key);
      } else {
        next.set(key, nextSet);
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
      for (const [key, packageIds] of entries) {
        const [branch, weekday] = key.split("::") as [string, PackageTableWeekday];
        // A transient network/session failure must degrade to a normal
        // per-cell error, not abort the whole batch and wedge saveState
        // on "saving" forever — the remaining cells still get attempted.
        let result: ActionResult;
        try {
          result = await onSetCell(branch, weekday, [...packageIds]);
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
                  const selectedIds = isDirty
                    ? (pending.get(key) as Set<string>)
                    : idSet(cell.packages);
                  return (
                    <td key={weekday} className="min-w-32 px-2 py-1 align-top">
                      {canEdit ? (
                        <MultiPackageCell
                          packages={data.packages}
                          selectedIds={selectedIds}
                          dirty={isDirty}
                          disabled={saveState === "saving"}
                          error={errors.get(key) ?? null}
                          onToggle={(packageId) => toggleCellPackage(branch, weekday, packageId)}
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
