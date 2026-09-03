# Package Table: Split Save/Assign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split Package Table's combined "Save" (config + real task assignment) into two buttons — "Save" (config only, with removals still cancelling immediately) and a new "Assign" (processes saved-but-unassigned config into real recurring tasks, disabled while there are unsaved changes).

**Architecture:** Add `assignedAt: DateTime?` to `BranchPackageSchedule` (null = configured, not yet really-assigned). `setBranchPackageScheduleCell` stops calling the assignment engine for additions (still calls it immediately for removals). A new `assignSavedPackages` function processes every row with `assignedAt IS NULL`, grouped by branch, resolving each branch's single manager and skipping branches with a manager conflict (partial success, not all-or-nothing). The UI adds an "Assign" button next to "Save", disabled while `dirty`.

**Tech Stack:** Next.js Server Actions, Prisma (Task Manager's own `TASK_MANAGER_DATABASE_URL` client), Vitest.

Full design rationale: `docs/superpowers/specs/2026-08-11-package-table-save-assign-split-design.md`.

---

## Task 1: Schema — `assignedAt` field + migration with backfill

**Files:**
- Modify: `prisma/task-manager/schema.prisma`
- Create: `prisma/task-manager/migrations/20260811100000_branch_package_schedule_assigned_at/migration.sql`

- [ ] **Step 1: Read the current `BranchPackageSchedule` model**

Read `prisma/task-manager/schema.prisma`, find `model BranchPackageSchedule` (currently):
```prisma
model BranchPackageSchedule {
  id             String                 @id @default(cuid())
  branch         String
  weekday        PackageScheduleWeekday
  packageGroupId String
  packageGroup   TaskTemplateGroup      @relation(fields: [packageGroupId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  createdById    String
  createdAt      DateTime               @default(now())
  updatedAt      DateTime               @updatedAt

  @@unique([branch, weekday, packageGroupId])
  @@index([branch, weekday])
  @@index([packageGroupId])
}
```

- [ ] **Step 2: Add `assignedAt`**

```prisma
model BranchPackageSchedule {
  id             String                 @id @default(cuid())
  branch         String
  weekday        PackageScheduleWeekday
  packageGroupId String
  packageGroup   TaskTemplateGroup      @relation(fields: [packageGroupId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  createdById    String
  createdAt      DateTime               @default(now())
  updatedAt      DateTime               @updatedAt
  /// null = configured (via Save) but not yet processed into a real
  /// recurring task assignment; non-null = the "Assign" action has already
  /// created the real assignment for this row (2026-08-11 Save/Assign
  /// split — see branch-package-schedule.ts's file header). Reset to null
  /// only by deleting and recreating the row (i.e. removing then
  /// re-adding the same package via Save) — never mutated back to null
  /// in place.
  assignedAt     DateTime?

  @@unique([branch, weekday, packageGroupId])
  @@index([branch, weekday])
  @@index([packageGroupId])
}
```

- [ ] **Step 3: Check migration status, write and apply the migration**

This is a SHARED, LIVE database with exactly ONE existing `BranchPackageSchedule` row right now (Ampang / Wed / a Package). Check first:

```bash
npx prisma migrate status --config prisma.task-manager.config.ts
```

Hand-write the migration (do NOT use `prisma migrate dev` — this database has unmodeled raw tables that trigger its drift detection into proposing destructive drops, per every prior migration this module has needed). Create `prisma/task-manager/migrations/20260811100000_branch_package_schedule_assigned_at/migration.sql`:

```sql
-- Save/Assign split (2026-08-11): BranchPackageSchedule.assignedAt tracks
-- whether a config row has already been processed into a real recurring
-- task assignment. Backfilling every EXISTING row to its own createdAt is
-- required, not optional: every row that exists today went through the
-- OLD combined setBranchPackageScheduleCell, which already called the real
-- assignment engine at write time — leaving assignedAt null for those rows
-- would make the new "Assign" button re-run assignment for tasks that are
-- already live, creating a duplicate (the same class of bug this split is
-- meant to make structurally harder to hit, not easier).
-- AlterTable
ALTER TABLE "BranchPackageSchedule" ADD COLUMN "assignedAt" TIMESTAMP(3);

-- Backfill: every pre-existing row was already really-assigned.
UPDATE "BranchPackageSchedule" SET "assignedAt" = "createdAt";
```

Apply:
```bash
npx prisma migrate deploy --config prisma.task-manager.config.ts
npx prisma generate --config prisma.task-manager.config.ts
```

- [ ] **Step 4: Live-DB verification**

Write a disposable script (delete after use) that connects via `TASK_MANAGER_DATABASE_URL` (raw `pg`, per this session's established pattern — the Prisma driver-adapter path has shown intermittent connectivity issues from this dev machine; raw `pg` has been reliable throughout) and:
1. Confirms `npx prisma migrate status --config prisma.task-manager.config.ts` shows no pending migrations.
2. Queries `SELECT branch, weekday, "packageGroupId", "createdAt", "assignedAt" FROM "BranchPackageSchedule"` — confirms the one existing row (Ampang / Wed) now has `assignedAt` equal to its `createdAt`, not null.
3. Queries `SELECT count(*) FROM "RunBlock"` for a sanity total (just confirm the migration touched zero `RunBlock` rows — it shouldn't have, this is a pure `BranchPackageSchedule` schema change, but verify rather than assume).

Delete the script when done.

- [ ] **Step 5: Type-check, commit**

```bash
npx tsc --noEmit
```
Expect the same 3 pre-existing, unrelated errors this session has consistently seen (`src/app/api/branch/dashboard/route.ts` ×2, `src/app/components/ClickUpPieChart.tsx`) — confirm no NEW errors. (`src/task-manager/analytics/_lib.test.ts`'s pre-existing `cadence`-missing error may or may not still be present depending on unrelated work landed on `staging` since — either way, confirm it's not caused by this change.)

```bash
git add prisma/task-manager/schema.prisma prisma/task-manager/migrations/ src/generated/task-manager-client
git commit -m "feat(task-manager): add BranchPackageSchedule.assignedAt for the Save/Assign split (schema)"
```

---

## Task 2: Data layer — stop assigning on Save (additions), add `assignSavedPackages`

**Files:**
- Modify: `src/task-manager/data/branch-package-schedule.ts`

- [ ] **Step 1: Read `setBranchPackageScheduleCell` in full**

Read the current function in `src/task-manager/data/branch-package-schedule.ts` (roughly lines 281-323) before changing anything — note it currently calls `assignWeekday` for every added package and `cancelWeekdayAssignment` for every removed package, both inline in the same function.

- [ ] **Step 2: Stop calling `assignWeekday` for additions — removals keep calling `cancelWeekdayAssignment` unchanged**

Change the `toAdd` loop from:
```ts
    for (const id of toAdd) {
      await assignWeekday(actor, id, manager.id, body.weekday);
      await prisma.branchPackageSchedule.create({
        data: { branch: body.branch, weekday: prismaWeekday, packageGroupId: id, createdById: actor.id },
      });
    }
```
to:
```ts
    for (const id of toAdd) {
      // 2026-08-11 Save/Assign split: Save no longer calls assignWeekday
      // here — the config row is created with assignedAt left null (the
      // column's default), and the separate "Assign" action (see
      // assignSavedPackages below) is what actually creates the real
      // recurring task, once the user explicitly clicks it.
      await prisma.branchPackageSchedule.create({
        data: { branch: body.branch, weekday: prismaWeekday, packageGroupId: id, createdById: actor.id },
      });
    }
```

The `toRemove` loop (which calls `cancelWeekdayAssignment` then deletes the row) stays completely unchanged — removals still take effect immediately, per the confirmed design (an unwanted recurring task should stop right away, not wait for the next Assign click).

- [ ] **Step 3: Update `setBranchPackageScheduleCell`'s doc comment**

The function's existing doc comment (the long one starting "Set one grid cell to the FULL desired set of packages...") describes the OLD combined behavior in several places — e.g. "`assignWeekday` fires a SECOND time, creating a duplicate live assignment" is about a risk that no longer applies to *additions* the same way (since additions no longer call `assignWeekday` here at all — that risk moves to `assignSavedPackages`, Step 5 below, which gets its own equivalent warning). Add a note at the top of the existing doc comment:

```ts
/** Set one grid cell to the FULL desired set of packages
 *  (`packageGroupIds` — an empty array clears the cell entirely, never
 *  `null`). CONFIG ONLY as of 2026-08-11 (Save/Assign split) for
 *  ADDITIONS — a newly-added package's `BranchPackageSchedule` row is
 *  created with `assignedAt` left null; the real recurring task isn't
 *  created until the separate `assignSavedPackages` action runs. REMOVALS
 *  are the one asymmetric exception and are UNCHANGED — a removed
 *  package's real assignment is still cancelled immediately below, same
 *  as before the split (an already-configured-then-unwanted recurring
 *  task should stop right away, not wait for someone to remember to
 *  re-run Assign). The rest of this comment (diffing, retry-safety
 *  asymmetry between add/remove) still describes the REMOVAL path
 *  accurately; for the ADDITION path, see assignSavedPackages below,
 *  which now owns the assignWeekday-retry-duplication risk this comment
 *  used to describe for this function.
 *
 *  [... existing comment body unchanged below this point ...]
 */
```

- [ ] **Step 4: Add a reverse weekday lookup, then `assignSavedPackages`**

`assignWeekday` (already defined in this file) takes the app-level `PackageTableWeekday` type ("Wed"/"Thu"/...), but rows read back from `prisma.branchPackageSchedule.findMany` carry the Prisma enum value ("WED"/"THU"/...) via `row.weekday`. The file already has a forward map (`WEEKDAY_TO_PRISMA`, line 25) but no reverse one — add one next to it:

```ts
const PRISMA_TO_WEEKDAY: Record<"WED" | "THU" | "FRI" | "SAT" | "SUN", PackageTableWeekday> = {
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};
```

Add this directly after the existing `WEEKDAY_TO_PRISMA` declaration (around line 31, right before `WEEKDAY_TO_JS_DAY`).

Then add this new exported function after `setBranchPackageScheduleCell`:

```ts
export interface AssignSavedPackagesResult {
  assigned: number;
  skippedBranches: { branch: string; reason: string }[];
}

/** Processes every `BranchPackageSchedule` row where `assignedAt IS NULL`
 *  (i.e. configured via Save but not yet really-assigned) into a real
 *  recurring task assignment, then stamps `assignedAt`. 2026-08-11
 *  Save/Assign split — see setBranchPackageScheduleCell's doc comment and
 *  this module's file header.
 *
 *  Per-branch partial success, not all-or-nothing: resolves each distinct
 *  branch's single Branch Manager once (same `requireSingleBranchManager`
 *  check Save already uses); a branch with zero or 2+ managers has ALL of
 *  its currently-unassigned rows skipped and reported back, but every
 *  OTHER branch in the same call still gets processed. A caller cannot
 *  tell from the return value alone which SPECIFIC rows within a
 *  successfully-resolved branch failed at the `assignWeekday` step itself
 *  (that would require the same kind of per-package try/catch
 *  `setBranchPackageScheduleCell` deliberately does NOT have, for the
 *  same accepted "partial application, re-fetch and retry" trade-off
 *  documented there) — an error thrown by `assignWeekday` for one row
 *  inside an otherwise-healthy branch propagates and aborts the WHOLE
 *  call, same as any other unhandled error in this codebase's `native()`
 *  wrapper. This is a deliberate, narrower partial-success boundary than
 *  per-row: it exists specifically to let the KNOWN, EXPECTED failure mode
 *  (manager conflicts, same as Save already handles) degrade gracefully,
 *  not to paper over arbitrary mid-batch failures.
 *
 *  Retry-safety: re-calling this after a full or partial success is safe
 *  and does NOT create duplicates for rows that already got assigned —
 *  the `assignedAt IS NULL` filter means an already-stamped row is never
 *  reprocessed. A row that failed mid-branch (the whole-branch abort case
 *  above) keeps `assignedAt` null and IS correctly retried on the next
 *  call — but if THAT retry hits the exact same "assignWeekday succeeded,
 *  the following stamp-update never ran" gap `setBranchPackageScheduleCell`'s
 *  own doc comment warns about for its add path, it carries the same
 *  duplicate-assignment risk. This is accepted for the same reason it's
 *  accepted there: making it fully safe requires a live RunBlock-existence
 *  check this codebase doesn't have yet (see that comment's closing
 *  paragraph), and this function is a low-frequency, explicit user action
 *  (not an automatic retry loop), not a background job. */
export function assignSavedPackages(email: string): Promise<AssignSavedPackagesResult> {
  return native(async () => {
    const actor = await requireEditAccess(email);

    const rows = await prisma.branchPackageSchedule.findMany({
      where: { assignedAt: null },
      orderBy: [{ branch: "asc" }, { weekday: "asc" }],
    });

    const byBranch = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byBranch.get(row.branch);
      if (list) list.push(row);
      else byBranch.set(row.branch, [row]);
    }

    let assigned = 0;
    const skippedBranches: { branch: string; reason: string }[] = [];

    for (const [branch, branchRows] of byBranch) {
      let manager: { id: string; name: string };
      try {
        manager = await requireSingleBranchManager(branch);
      } catch (err) {
        skippedBranches.push({
          branch,
          reason: err instanceof ApiHttpError ? err.message : "Could not resolve a branch manager",
        });
        continue;
      }
      for (const row of branchRows) {
        const weekday = PRISMA_TO_WEEKDAY[row.weekday];
        await assignWeekday(actor, row.packageGroupId, manager.id, weekday);
        await prisma.branchPackageSchedule.update({
          where: { id: row.id },
          data: { assignedAt: new Date() },
        });
        assigned += 1;
      }
    }

    return { assigned, skippedBranches };
  }, "assignSavedPackages");
}
```

- [ ] **Step 5: Add `assignSavedPackages` to the barrel export**

Check `src/task-manager/data.ts` — it already does `export * from "./data/branch-package-schedule";` (a wildcard), so no separate edit is needed; confirm this by grepping for it rather than assuming.

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```
Confirm `src/task-manager/data/branch-package-schedule.ts` itself is clean (the 3-4 pre-existing unrelated errors elsewhere are expected, per Task 1 Step 5's note).

- [ ] **Step 7: Live-DB verification**

Using a throwaway `BranchPackageSchedule` row you create directly (NOT through the UI — insert a row with a real existing Package's id, a real branch with exactly one manager, `assignedAt: null`) and clean up after:
1. Call `assignSavedPackages` — confirm it returns `{ assigned: 1, skippedBranches: [] }`, confirm the row's `assignedAt` is now non-null, confirm a real `RunBlock` was created for that branch's manager matching the package's template(s).
2. Call `assignSavedPackages` AGAIN immediately — confirm it returns `{ assigned: 0, skippedBranches: [] }` (the row is now excluded by the `assignedAt IS NULL` filter) and confirms NO additional `RunBlock` was created (no duplicate).
3. Repeat with a throwaway row for a branch that has zero or two managers (or temporarily use a real branch you've confirmed has a manager conflict, if one still exists — check first) — confirm `assignSavedPackages` returns that branch in `skippedBranches` with a message matching `requireSingleBranchManager`'s error text, confirms the row's `assignedAt` is STILL null (not incorrectly stamped), and confirms no `RunBlock` was created for it.
4. Clean up every fixture row/RunBlock/FlowRun you created.

- [ ] **Step 8: Commit**

```bash
git add src/task-manager/data/branch-package-schedule.ts
git commit -m "feat(task-manager): stop Save from assigning new packages, add assignSavedPackages"
```

---

## Task 3: UI — "Assign" button + result summary

**Files:**
- Modify: `src/task-manager/ui/branch-package-schedule-grid.tsx`
- Modify: `src/app/task-manager/package-table/page.tsx`

- [ ] **Step 1: Add the `onAssign` prop to `BranchPackageScheduleGrid`**

In `src/task-manager/ui/branch-package-schedule-grid.tsx`, find the component's props (around line 310):
```ts
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
```
Change to:
```ts
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
```

- [ ] **Step 2: Add the `AssignSavedPackagesActionResult` type import**

At the top of the same file, find:
```ts
import type { ActionResult } from "./types";
```
Change to:
```ts
import type { ActionResult } from "./types";
import type { AssignSavedPackagesResult } from "@/task-manager/data/branch-package-schedule";

/** Server-action-boundary version of AssignSavedPackagesResult (same
 *  ok/message shape every other action in this codebase returns on
 *  failure) — the plain data-layer type doesn't carry an ok flag since
 *  native()/FlowBridgeError handle that at the action-closure layer, same
 *  split as ActionResult vs. setBranchPackageScheduleCell elsewhere in
 *  this file. */
export type AssignSavedPackagesActionResult =
  | ({ ok: true } & AssignSavedPackagesResult)
  | { ok: false; message: string };
```

- [ ] **Step 3: Add `assignState`/`assignSummary` state and the `assign()` handler**

Find the existing state declarations (around line 328-338, right after `pending`/`errors`):
```ts
  const [errors, setErrors] = React.useState<Map<string, string>>(new Map());
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [summary, setSummary] = React.useState<string | null>(null);
```
Add directly after:
```ts
  const [assignState, setAssignState] = React.useState<"idle" | "assigning" | "error">("idle");
  const [assignSummary, setAssignSummary] = React.useState<string | null>(null);
```

Find the existing `save` function (the one refactored to return `Promise<boolean>` — search for `const save = async (): Promise<boolean> =>`). Add a new `assign` function directly after it (and after `discardPending`/`useNavigationGuard`, so it sits alongside the other action handlers):
```ts
  const assign = async () => {
    if (dirty || assignState === "assigning") return;
    setAssignState("assigning");
    setAssignSummary(null);
    const result = await onAssign();
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
      const skippedNames = result.skippedBranches.map((b) => b.branch).join(", ");
      setAssignSummary(
        `Assigned ${result.assigned} package${result.assigned === 1 ? "" : "s"} — skipped ${result.skippedBranches.length} branch${result.skippedBranches.length === 1 ? "" : "es"} (${skippedNames}): manager conflict.`,
      );
    }
  };
```

- [ ] **Step 4: Add the "Assign" button next to "Save"**

Find the existing Save button block (around line 510-518):
```tsx
            <button
              type="button"
              onClick={() => void save()}
              disabled={!dirty || saveState === "saving"}
              className="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saveState === "saving" ? "Saving…" : "Save"}
            </button>
```
Change to:
```tsx
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
```

- [ ] **Step 5: Show the assign result summary**

Find the existing save `summary` display (around line 505-509):
```tsx
            {summary && (
              <span className={`text-xs ${saveState === "error" ? "text-red-600" : "text-emerald-600"}`}>
                {summary}
              </span>
            )}
```
Add directly after (still inside the same `{canEdit && (...)}` wrapper, before the Save button):
```tsx
            {assignSummary && (
              <span className={`text-xs ${assignState === "error" ? "text-red-600" : "text-emerald-600"}`}>
                {assignSummary}
              </span>
            )}
```

- [ ] **Step 6: Add the page-level `assignSaved` server action closure**

In `src/app/task-manager/package-table/page.tsx`, find the imports (around line 33-42):
```ts
import {
  getMyRole,
  listBranchPackageSchedule,
  setBranchPackageScheduleCell,
  FlowBridgeError,
  NoAccountError,
  SetupPendingError,
} from "@/task-manager/data";
```
Change to:
```ts
import {
  getMyRole,
  listBranchPackageSchedule,
  setBranchPackageScheduleCell,
  assignSavedPackages,
  FlowBridgeError,
  NoAccountError,
  SetupPendingError,
} from "@/task-manager/data";
```

Find the existing `setCell` closure (around line 91-106):
```ts
  async function setCell(
    branch: string,
    weekday: PackageTableWeekday,
    packageGroupIds: string[],
  ): Promise<ActionResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      await setBranchPackageScheduleCell(email, { branch, weekday, packageGroupIds });
      revalidatePath("/task-manager/package-table");
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }
```
Add directly after:
```ts
  async function assignSaved(): Promise<AssignSavedPackagesActionResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const result = await assignSavedPackages(email);
      revalidatePath("/task-manager/package-table");
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }
```

Add the type import near the top (alongside the existing `import type { ActionResult } from "@/task-manager/ui/types";`):
```ts
import type { ActionResult } from "@/task-manager/ui/types";
import type { AssignSavedPackagesActionResult } from "@/task-manager/ui/branch-package-schedule-grid";
```

- [ ] **Step 7: Wire the new prop into `<BranchPackageScheduleGrid>`**

Find the component usage (around line 113-117):
```tsx
          <BranchPackageScheduleGrid
            data={data}
```
Confirm/add `onAssign={assignSaved}` alongside the existing `onSetCell={setCell}` prop — read the surrounding lines first to get the exact current prop list before editing, since this plan's earlier context only confirmed `onSetCell={setCell}` at line 116; add `onAssign={assignSaved}` as a new prop on the same element.

- [ ] **Step 8: Type-check, test, build**

```bash
npx tsc --noEmit
```
Confirm clean except the same pre-existing unrelated errors noted in Task 1 Step 5.

```powershell
npm test -- --run
```
(PowerShell — this repo needs it for vitest, not plain bash.) Confirm 308/308 (or whatever the current baseline is — confirm against this worktree's OWN baseline run from setup, not a hardcoded number, in case unrelated work has landed on `staging` and been merged forward since).

```bash
npm run build
```

- [ ] **Step 9: Commit**

```bash
git add src/task-manager/ui/branch-package-schedule-grid.tsx src/app/task-manager/package-table/page.tsx
git commit -m "feat(task-manager): add Assign button, disabled while dirty, with result summary"
```

---

## Task 4: Final holistic review

Not a code task — dispatch a final review agent across the whole `feat/package-table-save-assign-split` branch before `finishing-a-development-branch`. Specifically re-verify on the FINAL merged diff:

1. Full Save → Assign flow, fresh, end-to-end through the REAL page/server-action path (not just the data-layer functions directly): save a NEW package on a cell, confirm no `RunBlock` is created yet and `assignedAt` is null; click Assign, confirm the real `RunBlock` now exists and `assignedAt` is stamped; click Assign again, confirm no duplicate is created.
2. Removal still cancels immediately: remove a package via Save, confirm its real assignment is cancelled right away (not deferred).
3. Manager-conflict branches are skipped with a clear message, and other branches in the same Assign call still succeed (partial success, not all-or-nothing) — confirm by testing with a live or throwaway manager-conflict scenario.
4. "Assign" is genuinely disabled (not just visually) while `dirty` — confirm the `disabled` attribute, not just a css class, actually blocks the click.
5. Confirm the ONE pre-existing live row (Ampang / Wed) was correctly backfilled by Task 1's migration and was NOT re-assigned/duplicated by any of this branch's testing.
6. Full test suite + build clean.
7. Confirm no leftover test fixtures (throwaway `BranchPackageSchedule` rows, `RunBlock`s, `FlowRun`s) anywhere in the real live DB from ANY task's verification work in this whole plan — do a final sweep, not just trust each task's own individual cleanup claim.
