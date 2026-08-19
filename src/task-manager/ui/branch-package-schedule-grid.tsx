"use client";

// Package Table grid (2026-08-07): Branches (rows) x Wed-Sun (columns), each
// cell a Package selector. Save/Assign split (2026-08-11): Save persists
// the cell's config only (removals still cancel their real assignment
// immediately); the separate "Assign" button/action is what fans out
// through the recurring task engine server-side for whatever's saved but
// not yet assigned (see data/branch-package-schedule.ts's
// setBranchPackageScheduleCell/assignSavedPackages).
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
// page.tsx.
//
// In-app navigation guard (2026-08-11, reverses the earlier "deliberately
// scoped out" decision above): clicking a sidebar link while dirty now
// also shows a custom Save Changes/Discard dialog, via the shared
// NavigationBlockerProvider (src/app/components/NavigationBlocker.tsx,
// wraps the whole app in AppShell) and Link's own onNavigate prop
// (Next.js's documented mechanism for exactly this, added v15.3.0). Still
// browser-level-only for tab-close/refresh/URL-bar nav (beforeunload can't
// show a custom dialog) and NOT covering the back/forward button (no
// supported Next.js mechanism exists for that — explicitly accepted as a
// narrow, known gap rather than reaching for a fragile pushState/popstate
// workaround).
//
// `pending` now maps cellKey -> Set<string> (the FULL desired set of
// package ids for that cell), not a single nullable id — every place that
// used to compare/read a single value now does SET comparison against the
// server's current package-id set for that cell (see `setsEqual` below).
// Editing a cell's set back to exactly the server's current set un-dirties
// it, same "editing back to the original value is a no-op" principle the
// single-select version had.
import * as React from "react";
import { FLOW_BRANCH_REGIONS } from "./types";
import type { ActionResult } from "./types";
import type {
  AssignSavedPackagesResult,
  BranchPackageOption,
  BranchPackageScheduleCell,
  BranchPackageScheduleData,
  PackageTableWeekday,
} from "@/task-manager/data/branch-package-schedule";
import { useNavigationGuard } from "@/app/components/NavigationBlocker";

/** Server-action-boundary version of AssignSavedPackagesResult (same
 *  ok/message shape every other action in this codebase returns on
 *  failure) — the plain data-layer type doesn't carry an ok flag since
 *  native()/FlowBridgeError handle that at the action-closure layer, same
 *  split as ActionResult vs. setBranchPackageScheduleCell elsewhere in
 *  this file. */
export type AssignSavedPackagesActionResult =
  | ({ ok: true } & AssignSavedPackagesResult)
  | { ok: false; message: string };

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

// Date-picker column highlight (2026-08-08) — purely visual, no effect on
// any cell's data/save behavior. `Date.getDay()` -> PackageTableWeekday;
// Monday/Tuesday are intentionally absent (no matching column exists, same
// day-set as PACKAGE_TABLE_WEEKDAYS server-side) — a picked date landing on
// either just clears the highlight rather than erroring.
const JS_DAY_TO_HIGHLIGHT_WEEKDAY: Partial<Record<number, PackageTableWeekday>> = {
  0: "Sun",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

/** Parsed as local midnight (not UTC) via the "T00:00:00" suffix, so the
 *  derived weekday matches what the date input visually shows regardless of
 *  the browser's UTC offset. */
function weekdayForDate(dateStr: string): PackageTableWeekday | null {
  if (!dateStr) return null;
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return JS_DAY_TO_HIGHLIGHT_WEEKDAY[parsed.getDay()] ?? null;
}

function todayDateString(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
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
  return <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>;
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
          selected.length > 0 ? "bg-blue-50 dark:bg-blue-900" : "bg-gray-50 dark:bg-slate-800"
        } ${dirty ? "ring-2 ring-amber-400" : ""}`}
      >
        {visibleChips.map((p) => (
          <span
            key={p.id}
            className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-800 dark:text-blue-200"
          >
            {p.name}
            {!disabled && (
              <button
                type="button"
                onClick={() => onToggle(p.id)}
                className="text-blue-400 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-100"
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
          className="rounded-full px-1.5 py-0.5 text-[11px] font-medium text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-700 dark:hover:text-slate-300"
        >
          {selected.length === 0 ? "+ Add" : "+"}
        </button>
      </div>

      {open && (
        <div className="absolute z-20 mt-1 max-h-56 w-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:ring-1 dark:ring-white/10">
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
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:hover:bg-slate-800 ${
                    isSelected ? "bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200" : "text-gray-700 dark:text-slate-300"
                  }`}
                >
                  <span
                    className={`flex size-3.5 shrink-0 items-center justify-center rounded border ${
                      isSelected ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 dark:border-slate-500"
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
            className="block w-full border-t border-gray-100 px-3 py-1.5 text-center text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
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
    return <span className="text-xs text-gray-300 dark:text-slate-600">–</span>;
  }
  const visible = cell.packages.slice(0, COLLAPSED_CHIP_LIMIT);
  const hiddenCount = cell.packages.length - visible.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((p) => (
        <span
          key={p.id}
          className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 dark:border-blue-700 dark:bg-blue-900 dark:text-blue-200"
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
  onAssign,
}: {
  data: BranchPackageScheduleData;
  canEdit: boolean;
  onSetCell: (
    branch: string,
    weekday: PackageTableWeekday,
    packageGroupIds: string[],
  ) => Promise<ActionResult>;
  onAssign: () => Promise<AssignSavedPackagesActionResult>;
}) {
  const cellAt = React.useMemo(
    () => new Map(data.cells.map((c) => [cellKey(c.branch, c.weekday), c])),
    [data.cells],
  );

  // Region grouping (2026-08-18) — `data.branches` comes straight from the
  // DB (distinct role=BRANCH users, alphabetical), so it's mapped against
  // the same static FLOW_BRANCH_REGIONS list the Branch dropdown/Branch
  // Status by Region already use, rather than duplicating a region source
  // of truth here. A branch not (yet) listed in FLOW_BRANCH_REGIONS falls
  // into "Other" instead of silently vanishing — keeps every branch
  // visible even if the static list drifts behind the real roster.
  const groupedBranches = React.useMemo(() => {
    const regionOf = new Map<string, string>();
    for (const region of FLOW_BRANCH_REGIONS) {
      for (const branch of region.branches) regionOf.set(branch, region.name);
    }
    const byRegion = new Map<string, string[]>();
    for (const branch of data.branches) {
      const region = regionOf.get(branch) ?? "Other";
      const list = byRegion.get(region);
      if (list) list.push(branch);
      else byRegion.set(region, [branch]);
    }
    const orderedRegionNames = [...FLOW_BRANCH_REGIONS.map((r) => r.name), "Other"];
    return orderedRegionNames
      .map((name) => ({ name, branches: byRegion.get(name) ?? [] }))
      .filter((group) => group.branches.length > 0);
  }, [data.branches]);

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
  const [assignState, setAssignState] = React.useState<"idle" | "assigning" | "error">("idle");
  const [assignSummary, setAssignSummary] = React.useState<string | null>(null);

  // Column highlight (2026-08-08) — defaults to today so the current day's
  // column is highlighted on first load. Purely presentational: does not
  // filter/hide any row, cell, or data — only changes header/cell
  // background color for the matching weekday column.
  const [highlightDate, setHighlightDate] = React.useState<string>(todayDateString);
  const highlightedWeekday = weekdayForDate(highlightDate);

  // Collapsible region groups (2026-08-19) — EXPANDED by default (empty
  // set), same "opt-in to collapse" default as ResizableTaskList's own
  // collapsible status groups (bits.tsx) rather than starting folded away.
  // Purely a display toggle — collapsing a region hides its branch rows but
  // never touches `pending`/`cellAt`, so an in-progress edit inside a
  // collapsed region is not lost, just not visible until re-expanded.
  const [collapsedRegions, setCollapsedRegions] = React.useState<Set<string>>(new Set());
  const toggleRegion = (name: string) =>
    setCollapsedRegions((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

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

  // Returns Promise<boolean> (2026-08-11: was fire-and-forget) — true means
  // every pending cell saved cleanly, so a caller like the navigation-guard
  // dialog knows it's safe to actually navigate; false (or a no-op return
  // when already saving/nothing pending) means stay put, same as the
  // existing Save button's own "still see the error, try again" behavior.
  const save = async (): Promise<boolean> => {
    if (saveState === "saving") return false;
    if (pending.size === 0) return true;
    setSaveState("saving");
    setSummary(null);
    const entries = [...pending.entries()];
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
      return true;
    }
    setSaveState("error");
    setSummary(
      `${succeeded} saved, ${failedKeys.size} failed — fix the highlighted cell${failedKeys.size === 1 ? "" : "s"} below and save again.`,
    );
    return false;
  };

  // Discards every pending (unsaved) cell edit outright — the navigation
  // guard's "Discard" button (2026-08-11). Distinct from the pruning effect
  // above, which only clears entries that already match the server; this
  // clears everything regardless, since the user explicitly chose to
  // abandon it.
  const discardPending = () => {
    setPending(new Map());
    setErrors(new Map());
    setSummary(null);
  };

  // Registers with the shared navigation-blocker (2026-08-11) — a no-op on
  // every other page, since nothing there ever calls useNavigationGuard.
  useNavigationGuard(dirty, save, discardPending);

  const assign = async () => {
    if (dirty || assignState === "assigning") return;
    setAssignState("assigning");
    setAssignSummary(null);
    // A transient network/session failure must degrade to a normal error,
    // not wedge assignState on "assigning" forever with the button
    // permanently disabled and no way to retry short of a page reload —
    // same reasoning as save()'s own try/catch around onSetCell above.
    let result: AssignSavedPackagesActionResult;
    try {
      result = await onAssign();
    } catch {
      result = { ok: false, message: "Network error — try again" };
    }
    if (!result.ok) {
      setAssignState("error");
      setAssignSummary(result.message);
      return;
    }
    setAssignState("idle");
    if (result.skippedBranches.length === 0) {
      setAssignSummary(
        result.assigned === 0
          ? "Nothing to assign — every saved package is already assigned."
          : `Assigned ${result.assigned} package${result.assigned === 1 ? "" : "s"}.`,
      );
    } else {
      // Full per-branch reason (2026-08-11 code review), not a generic
      // "manager conflict" label — assignSavedPackages's skippedBranches
      // already carries specific, differently-actionable text ("No branch
      // manager found" vs. "Multiple branch managers found... resolve
      // this before scheduling"), and collapsing both into one phrase
      // would make an admin go dig elsewhere to find out which fix
      // applies to which branch.
      const skippedDetail = result.skippedBranches.map((b) => `${b.branch} (${b.reason})`).join("; ");
      setAssignSummary(
        `Assigned ${result.assigned} package${result.assigned === 1 ? "" : "s"} — skipped ${result.skippedBranches.length} branch${result.skippedBranches.length === 1 ? "" : "es"}: ${skippedDetail}`,
      );
    }
  };

  if (data.branches.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-slate-400">
          Package Table
        </h3>
        <p className="text-sm text-gray-400">No branches found yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-slate-400">Package Table</h3>
          <input
            type="date"
            value={highlightDate}
            onChange={(e) => setHighlightDate(e.target.value)}
            aria-label="Highlight day"
            className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 focus:border-blue-500 focus:outline-none dark:border-slate-500 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>
        {canEdit && (
          <div className="flex items-center gap-3">
            {dirty && saveState !== "saving" && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
                Unsaved changes
              </span>
            )}
            {summary && (
              <span className={`text-xs ${saveState === "error" ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                {summary}
              </span>
            )}
            {assignSummary && (
              <span className={`text-xs ${assignState === "error" ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                {assignSummary}
              </span>
            )}
            <button
              type="button"
              onClick={() => void save()}
              disabled={!dirty || saveState === "saving"}
              className="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saveState === "saving" ? "Saving…" : "Save"}
            </button>
            {/* Disabled while dirty (2026-08-11 Save/Assign split) — Assign
                only processes what's already saved; forcing a Save first
                avoids a confusing "assigned the OLD config, not what you
                just typed" outcome. */}
            <button
              type="button"
              onClick={() => void assign()}
              disabled={dirty || assignState === "assigning"}
              title={dirty ? "Save your changes first" : undefined}
              className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {assignState === "assigning" ? "Assigning…" : "Assign"}
            </button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-y-1.5">
          <thead>
            <tr>
              <th className="px-2 text-left text-xs font-semibold text-gray-500 dark:text-slate-400">Branch</th>
              {data.weekdays.map((weekday) => (
                <th
                  key={weekday}
                  className={`px-2 text-left text-xs font-semibold ${
                    weekday === highlightedWeekday
                      ? "rounded-t-md bg-blue-200 text-blue-900 dark:bg-blue-900 dark:text-blue-200"
                      : "text-gray-500 dark:text-slate-400"
                  }`}
                >
                  {weekday}
                </th>
              ))}
            </tr>
          </thead>
          {groupedBranches.map((group) => {
            const isCollapsed = collapsedRegions.has(group.name);
            return (
            // One <tbody> per region (2026-08-18) — a real border/rounded
            // box around a whole region's rows, not just a text label. A
            // table's row-group accepts its own border in the
            // border-separate model (this table's own border-spacing-y
            // already used above), so this needs no restructuring into
            // multiple <table>s (which would risk each one auto-sizing its
            // columns independently and losing alignment with the shared
            // header row above).
            <tbody
              key={group.name}
              className="rounded-xl border border-gray-200 dark:border-slate-700"
            >
              <tr>
                <td colSpan={data.weekdays.length + 1} className="p-0">
                  {/* Collapsible region header (2026-08-19) — same chevron/
                      aria-expanded pattern as ResizableTaskList's status
                      groups (bits.tsx). */}
                  <button
                    type="button"
                    onClick={() => toggleRegion(group.name)}
                    aria-expanded={!isCollapsed}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-widest text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300"
                  >
                    <span
                      aria-hidden
                      className={`text-[10px] normal-case transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                    >
                      ›
                    </span>
                    <span>{group.name}</span>
                    <span className="font-normal normal-case tracking-normal text-gray-300 dark:text-slate-600">
                      ({group.branches.length})
                    </span>
                  </button>
                </td>
              </tr>
              {!isCollapsed && group.branches.map((branch) => (
                <tr key={branch}>
                  <td className="whitespace-nowrap px-2 py-1 align-top text-sm font-medium text-gray-700 dark:text-slate-300">
                    {branch}
                  </td>
                  {data.weekdays.map((weekday) => {
                    // One shade darker than the "populated cell" bg-blue-50
                    // used inside MultiPackageCell/StaticCell — otherwise a
                    // populated cell in the highlighted column would blend
                    // into the column's own background with no visible
                    // boundary (caught in review). Dark mode mirrors that
                    // with a translucent wash (dark:bg-blue-900/30) so the
                    // solid dark:bg-blue-900 fill inside a populated cell
                    // still reads as visually distinct from the column tint.
                    const columnHighlightClass =
                      weekday === highlightedWeekday ? "bg-blue-100 dark:bg-blue-900/30" : "";
                    const cell = cellAt.get(cellKey(branch, weekday));
                    if (!cell) {
                      return (
                        <td
                          key={weekday}
                          className={`min-w-32 px-2 py-1 align-top ${columnHighlightClass}`}
                        >
                          <span className="text-xs text-gray-300 dark:text-slate-600">–</span>
                        </td>
                      );
                    }
                    const key = cellKey(branch, weekday);
                    const isDirty = pending.has(key);
                    const selectedIds = isDirty
                      ? (pending.get(key) as Set<string>)
                      : idSet(cell.packages);
                    return (
                      <td key={weekday} className={`min-w-32 px-2 py-1 align-top ${columnHighlightClass}`}>
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
            );
          })}
        </table>
      </div>
    </div>
  );
}
