# Package Table: Split Save (config-only) from Assign (real task creation)

## Background

`setBranchPackageScheduleCell` (`src/task-manager/data/branch-package-schedule.ts`) currently does config-write and real recurring-task assignment atomically in one call: for each package added to a cell, it writes a `BranchPackageSchedule` config row **and** calls `assignWeekday()` → `assignFlowTaskCore()` (real `RunBlock` creation) in the same operation; for each package removed, it calls `cancelWeekdayAssignment()` and deletes the config row, also atomically.

Live-data verification (2026-08-11) confirmed this already works end-to-end: the one existing `BranchPackageSchedule` row (Ampang / Wed / Package "A") has real `ACTIVE`, `DAILY`-cadence `RunBlock` rows assigned to Ampang's real Branch Manager, due the next matching Wednesday — proving the current combined Save already creates live tasks, not just config.

It also surfaced a live bug: **that row has 2 duplicate `RunBlock` rows** for the identical title/due-date/manager/template — most likely from an earlier partial-failure retry, a risk the current code's own doc comments already warn about explicitly ("do not blindly retry a failed add with the same desired set... `assignWeekday` fires a SECOND time, creating a duplicate live assignment"). This spec's design must not make that risk worse, and ideally makes it structurally harder to hit.

## Confirmed design decisions

1. **Two separate buttons**: "Save" persists Branch × Weekday × Package config only — no task creation, no task cancellation for *additions*. "Assign" is a new, separate action that processes currently-saved config into real recurring assignments.
2. **Removals are the one asymmetric exception**: removing a package from a cell via Save still cancels its real recurring task **immediately** (not deferred to Assign) — `cancelWeekdayAssignment` is idempotent/low-risk per the existing code's own docs, and leaving an unwanted recurring task running until someone remembers to click Assign again would actively burden a Branch Manager with tasks nobody wants anymore.
3. **"Assign" is disabled whenever there are unsaved changes** — reuses the existing `dirty` flag (`pending.size > 0`) already built for the navigation-guard dialog. No new dirty-tracking mechanism needed.
4. **Idempotency via a new `assignedAt: DateTime?` field on `BranchPackageSchedule`** (schema migration) — `null` means "configured, not yet really-assigned"; non-null means "Assign has already processed this row." Assign only processes rows where `assignedAt IS NULL`, then stamps it on success. Re-clicking Assign is naturally a no-op for already-assigned rows — no duplicate risk from repeat clicks, unlike the old combined flow's only guard (the caller must not blindly retry).
5. **The one existing live row must be backfilled, not left null**, during the migration — it already has real (if duplicated) `RunBlock`s from the old combined-save flow, so treating it as "not yet assigned" would create a *third* duplicate the moment someone first clicks the new Assign button. The migration sets `assignedAt = createdAt` for every existing row as part of the same statement that adds the column.
6. **Assign operates per-branch, with partial success** — for each distinct branch among the unassigned rows, resolve the single Branch Manager once (same `requireSingleBranchManager` check that already exists); a branch with a manager conflict has *all* its unassigned rows skipped and flagged, the rest of the batch still proceeds. Returns a structured result the UI renders as a summary (e.g., "Assigned 4 packages across 3 branches — 1 branch skipped (manager conflict)."), not an all-or-nothing throw.
7. **Not fixing the existing duplicate `RunBlock` rows as part of this work** — that's a pre-existing data cleanup question flagged separately, out of scope here; this spec's only obligation is to not create *more* duplicates going forward and to not silently re-trigger assignment for that already-assigned row (covered by decision #5's backfill).

## Data layer changes (`src/task-manager/data/branch-package-schedule.ts`)

- `setBranchPackageScheduleCell` loses its `assignWeekday`/`cancelWeekdayAssignment` calls for **additions** (config row created with `assignedAt: null`, no assignment). **Removals** keep their existing `cancelWeekdayAssignment` call unchanged, then delete the row.
- New function, e.g. `assignSavedPackages(email): Promise<{ assigned: number; skippedBranches: { branch: string; reason: string }[] }>`:
  1. Require edit access (same `requireEditAccess` as Save).
  2. Fetch every `BranchPackageSchedule` row where `assignedAt IS NULL`, grouped by branch.
  3. For each branch: resolve the single manager via `requireSingleBranchManager` (catch, don't throw — record as a skipped branch with the conflict message on failure, continue to the next branch).
  4. For each unassigned row under a successfully-resolved branch: call `assignWeekday` (unchanged), then update that row's `assignedAt = now()`.
  5. Return the aggregate result for the UI.

## Schema/migration (`prisma/task-manager/schema.prisma`, hand-written migration)

- Add `assignedAt DateTime?` to `BranchPackageSchedule`.
- Migration: `ALTER TABLE "BranchPackageSchedule" ADD COLUMN "assignedAt" TIMESTAMP(3);` then `UPDATE "BranchPackageSchedule" SET "assignedAt" = "createdAt";` (backfill every existing row, per decision #5) in the same migration file. Live-DB verification before/after: confirm the existing Ampang row's `assignedAt` is non-null post-migration and its `RunBlock`s are untouched.

## UI changes (`src/task-manager/ui/branch-package-schedule-grid.tsx`, `src/app/task-manager/package-table/page.tsx`)

- New "Assign" button next to "Save", `disabled={dirty || assignState === "assigning"}`.
- New `assign()` handler calling a new page-level `"use server"` closure (mirrors the existing `setCell` closure's `requireLiveSession`/try-catch/`FlowBridgeError` pattern) wrapping `assignSavedPackages`.
- Result summary rendered the same way Save's existing `summary`/`saveState` UI already works (a parallel `assignSummary`/`assignState`), e.g. "Assigned N package(s) across M branch(es)." on success, with skipped-branch detail on partial failure.

## Out of scope

- Fixing the existing 2 duplicate `RunBlock` rows for Ampang / Wed / Package "A" (flagged separately).
- Any visual indicator on individual cells for "saved but not yet assigned" vs. "assigned" (not requested; worth a future follow-up but not built here).
