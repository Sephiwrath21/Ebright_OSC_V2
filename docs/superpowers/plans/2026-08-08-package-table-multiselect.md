# Package Table Multi-Select Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change Package Table's Branch × Weekday cells from single-package to multi-package — a branch can have more than one Package running the same day. This is a deliberate, confirmed reversal of the original "one package per cell" design decision.

**Architecture:** The hard part of this feature was already solved correctly when Package Table was first built: `cancelWeekdayAssignment`/`assignWeekday` (in `src/task-manager/data/branch-package-schedule.ts`) are already scoped per-PACKAGE, not per-cell (they take a `packageGroupId` directly, e.g. `cancelWeekdayAssignment(actorId, packageGroupId, assigneeId, weekday)`), because the earlier weekday-collision-prevention work required exactly that granularity. Multi-select is therefore a generalization, not a rewrite: instead of "there is one old package and one new package, cancel the old, assign the new," it becomes "there is a SET of currently-configured packages and a SET of desired packages for this cell — cancel each one that's being removed, assign each one that's being added, leave unchanged ones alone." Three layers change: schema (loosen the unique constraint to allow multiple rows per branch+weekday), data layer (`packageGroupId: string|null` → `packageGroupIds: string[]` throughout), and UI (replace the single `<select>` with a multi-select dropdown+chips control, mirroring the existing `MemberDropdown`/`RecipientPicker` pattern already used elsewhere in this Task Manager module for exactly this interaction shape).

**Tech Stack:** Next.js 16 App Router / Server Actions, Prisma (Task Manager's own `TASK_MANAGER_DATABASE_URL` client), Vitest.

---

## Confirmed design decisions (do not deviate)

1. **Multiple packages per (branch, weekday) cell are now allowed** — a deliberate, explicit reversal of the original single-package-per-cell decision.
2. **Cell UI**: a multi-select dropdown with checkboxes (click cell → popover opens with a checkbox per available package → click to toggle) plus removable chips showing the currently-selected packages in the cell's collapsed state — modeled directly on `src/task-manager/ui/recipient-picker.tsx`'s `MemberDropdown` component (same open/close/toggle/outside-click-to-close interaction, same visual idiom), not a native `<select multiple>`.
3. **Diff-based save, not per-cell replace**: setting a cell's packages computes `toAdd`/`toRemove` against what's currently configured, only touching what actually changed — packages already in the cell that remain selected are left completely alone (no cancel-and-recreate churn).
4. **Reuse, do not re-derive, the existing weekday-scoped cancel/assign primitives** (`cancelWeekdayAssignment`, `assignWeekday` in `branch-package-schedule.ts`) — they already operate per-package, so no new cancellation logic is needed, only new orchestration around calling them per-package instead of assuming exactly one of each.
5. **Batch-save behavior (from the earlier Package Table work) is preserved** — cells still accumulate local pending edits, nothing saves until "Save" is clicked, same dirty indicator / beforeunload warning. The pending state's SHAPE changes (a set of package ids per cell instead of one nullable id), but the batch-save mechanics themselves don't need to be rebuilt.

---

## Task 1: Schema — loosen the unique constraint

**Files:**
- Modify: `prisma/task-manager/schema.prisma`
- Create: `prisma/task-manager/migrations/<timestamp>_branch_package_schedule_multi/migration.sql`

- [ ] **Step 1: Read the current `BranchPackageSchedule` model**

Read `prisma/task-manager/schema.prisma` in full, find `BranchPackageSchedule` — currently `@@unique([branch, weekday])`. Also check `npx prisma migrate status --config prisma.task-manager.config.ts` first, per the established convention from the original Package Table build — this is a SHARED, LIVE database, and an earlier task in that build found `prisma migrate dev --create-only` would have proposed dropping unrelated tables due to drift from unmodeled raw tables (`adhoc_task`, `daily`, `hod_assigned_task`) — hand-write the migration SQL instead of using `migrate dev`, following the exact pattern of the two prior `BranchPackageSchedule` migrations (`20260807100000_add_branch_package_schedule`, `20260807110000_fix_branch_package_schedule_fk_onupdate`) for style.

- [ ] **Step 2: Change the constraint**

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

(The old `@@unique([branch, weekday])` becomes `@@unique([branch, weekday, packageGroupId])` — this is a pure loosening, allows multiple rows per branch+weekday as long as they're for different packages, still prevents the SAME package being configured twice for the same cell. Add the new `@@index([branch, weekday])` since `listBranchPackageSchedule` will now need to fetch potentially-multiple rows per cell efficiently — the old unique index on just `(branch, weekday)` is gone, so this replaces its query-acceleration role.)

- [ ] **Step 3: Write and apply the migration**

Hand-write the migration SQL: `DROP` the old unique constraint/index, `CREATE` the new one, `CREATE INDEX` for `(branch, weekday)`. Check `npx prisma migrate status` first, apply via `npx prisma migrate deploy --config prisma.task-manager.config.ts` (matching the established process), then `npx prisma generate --config prisma.task-manager.config.ts` and verify live via a disposable script that the new constraint is genuinely in place (attempt to insert two rows with the same `(branch, weekday, packageGroupId)` — should fail; attempt two rows with the same `(branch, weekday)` but different `packageGroupId` — should succeed). Clean up any test rows created. Also verify existing real data (rows created by the original single-select feature) still satisfies the new constraint (it trivially does, since it's a pure loosening) — a quick `count()` before/after confirms zero rows were affected/lost.

- [ ] **Step 4: Type-check, commit**

Run `npx tsc --noEmit`. Commit (including the regenerated Prisma client, per this module's established convention):

```bash
git add prisma/task-manager/schema.prisma prisma/task-manager/migrations/ src/generated/task-manager-client
git commit -m "feat(task-manager): allow multiple packages per Package Table cell (schema)"
```

---

## Task 2: Data layer — multi-package cells

**Files:**
- Modify: `src/task-manager/data/branch-package-schedule.ts`

- [ ] **Step 1: Read the current file in full**

Read `src/task-manager/data/branch-package-schedule.ts` in full (Task 1 will have changed the schema underneath it, but not this file yet) — this is where most of the real work happens.

- [ ] **Step 2: Change the cell/data shapes**

```ts
export interface BranchPackageScheduleCell {
  branch: string;
  weekday: PackageTableWeekday;
  packages: BranchPackageOption[]; // was: packageGroupId, packageName
}
```

Update `listBranchPackageSchedule` to build `cells` from ALL `BranchPackageSchedule` rows per (branch, weekday), not assuming at most one — group the existing rows by `(branch, weekday)` and collect each group's packages into the `packages` array (empty array, not `null`, when nothing is configured for that cell).

- [ ] **Step 3: Redesign `setBranchPackageScheduleCell`**

New input shape: `{branch, weekday, packageGroupIds: string[]}` (the FULL desired set for that cell, not a single value — the caller always sends the complete target state, same "batch computes the diff against the last-fetched server value" contract the UI's pending-state already uses for other purposes elsewhere in this module).

```ts
const setCellSchema = z.object({
  branch: z.string().trim().min(1).max(100),
  weekday: z.enum(PACKAGE_TABLE_WEEKDAYS),
  packageGroupIds: z.array(z.string().min(1)).max(20), // sanity cap, matches GROUP_TASK_MAX-style caps elsewhere in this module
});
```

Logic:
1. `requireEditAccess` (unchanged).
2. `requireSingleBranchManager` (unchanged).
3. Fetch the CURRENT `BranchPackageSchedule` rows for this `(branch, weekday)` — `currentIds = existing.map(r => r.packageGroupId)`.
4. `toRemove = currentIds.filter(id => !desiredIds.includes(id))`, `toAdd = desiredIds.filter(id => !currentIds.includes(id))`. Unchanged ids (in both sets) are left completely alone — no cancel, no reassign, no DB write for them.
5. For each `toRemove` id: call `cancelWeekdayAssignment(actor.id, id, manager.id, weekday)` (already exists, already correctly scoped per-package — reuse verbatim), then delete that specific `BranchPackageSchedule` row (`where: {branch_weekday_packageGroupId: {branch, weekday: prismaWeekday, packageGroupId: id}}` — the new compound unique key from Task 1 — or `findFirst`+`delete` by the 3 fields if Prisma's generated compound-key name differs, check the actual generated client for the exact key name Task 1's schema change produces).
6. For each `toAdd` id: call `assignWeekday(actor, id, manager.id, weekday)` (already exists, already correctly scoped per-package — reuse verbatim), then create a new `BranchPackageSchedule` row for `(branch, weekday, id)`.
7. Return `{ok: true}` (unchanged shape) — or consider whether the caller needs to know per-package success/failure if one `toAdd`/`toRemove` fails partway through a multi-item cell change; per this module's established non-transactional-multi-step trade-off (documented elsewhere in this codebase, e.g. `template-groups.ts`'s own multi-step writes), a partial failure leaving some packages changed and others not is an accepted trade-off — document this explicitly in the function's doc comment, matching that established pattern, rather than silently leaving it undocumented.

- [ ] **Step 4: Live-DB verification**

Using throwaway data (2-3 test Package groups, a test branch manager or a real one you can safely test against and clean up after): 
1. Set a cell to `[Package A]` — confirm one `BranchPackageSchedule` row + one real recurring assignment.
2. Set the SAME cell to `[Package A, Package B]` (add B, keep A) — confirm Package A's assignment is UNTOUCHED (same `RunBlock` id, not cancelled-and-recreated) and Package B gets a new assignment created.
3. Set the same cell to `[Package B]` (remove A, keep B) — confirm Package A's assignment IS cancelled, Package B's is untouched.
4. Set the same cell to `[]` (clear both) — confirm both cancelled, both `BranchPackageSchedule` rows deleted.
5. Confirm the SAME weekday-collision-prevention guarantee from the original build still holds in the multi-package context: set Wednesday=[Package A], Thursday=[Package A] for the same manager, then change Wednesday to remove Package A — confirm Thursday's Package A assignment is untouched (this is the same underlying `cancelWeekdayAssignment` call as before, just now reached via the diff logic instead of the old single-value replace — re-prove it still holds through the new code path, don't just assume it transfers).
Clean up all test data before finishing.

- [ ] **Step 5: Type-check, test, build**

Run `npx tsc --noEmit`, `npm test`, `npm run build`.

- [ ] **Step 6: Commit**

```bash
git add src/task-manager/data/branch-package-schedule.ts
git commit -m "feat(task-manager): support multiple packages per Package Table cell (data layer)"
```

---

## Task 3: UI — multi-select dropdown+chips cell

**Files:**
- Modify: `src/task-manager/ui/branch-package-schedule-grid.tsx`
- Modify: `src/app/task-manager/package-table/page.tsx` (the `setCell` closure's signature needs to accept `packageGroupIds: string[]` instead of `packageGroupId: string | null`)

**Context:** Read `src/task-manager/ui/recipient-picker.tsx`'s `MemberDropdown` component in FULL first — this is the explicit interaction-pattern precedent for the new cell control (click to open, checkbox rows that toggle in/out without closing the dropdown, closes on outside-click/Escape, a "Done"/close affordance). Also re-read the current `branch-package-schedule-grid.tsx` in full (it has batch-save/pending-state/dirty-indicator/beforeunload logic from the earlier feature that needs to be PRESERVED, just adapted from single-value to set-value pending state).

- [ ] **Step 1: Redesign the cell's pending-state shape**

`pending: Map<string, string | null>` (branch::weekday -> single package id or null) becomes `pending: Map<string, Set<string>>` (branch::weekday -> the full desired set of package ids for that cell). Update `dirty` computation: a cell is dirty if its pending set differs from the server's current set for that cell (set equality, not reference equality — compare sorted-and-joined or use a helper). Update the pruning effect (the one that removes a pending entry once server data confirms it, added in an earlier fix to avoid save-success flicker) to do set-equality comparison against `data`'s current cell packages instead of single-value comparison.

- [ ] **Step 2: Build the multi-select cell component**

Replace `EditableCell`'s single `<select>` with a new component (e.g. `MultiPackageCell`) modeled on `MemberDropdown`:
- Collapsed state: shows chips for each currently-selected package (pending value if dirty, else server value) — small removable "×" per chip for quick single-item removal without opening the dropdown (mirrors `RecipientPicker`'s own selected-chips summary UI elsewhere in this module), plus a small "+" / click-target to open the dropdown for adding more.
- Open state: a checkbox list of all available packages (`data.packages`), each row toggles that package in/out of the cell's pending set on click, dropdown STAYS OPEN across multiple picks (matches `MemberDropdown`'s explicit design principle — the header comment in `recipient-picker.tsx` explains why), closes on outside-click, Escape, or an explicit "Done" row.
- Disabled (rendering, not interaction) entirely when `canEdit=false` — reuse `StaticCell`, updated to render multiple chips/names instead of one.

- [ ] **Step 3: Update the Save flow**

`onSetCell` now takes `(branch, weekday, packageGroupIds: string[])` instead of `(branch, weekday, packageGroupId: string | null)` — update the prop type, the save loop's per-cell call (`[...pendingSet]` instead of the raw value), and `page.tsx`'s `setCell` server-action closure signature to match (`setBranchPackageScheduleCell(email, {branch, weekday, packageGroupIds})`).

- [ ] **Step 4: Type-check, build**

Run `npx tsc --noEmit`, `npm run build`.

- [ ] **Step 5: Verification**

No browser automation available — verify via careful code tracing (confirm `canEdit=false` renders zero interactive elements, confirm the dropdown's open/close/toggle logic mirrors `MemberDropdown`'s proven behavior closely enough that no new interaction bugs are likely) plus a live-DB check that `listBranchPackageSchedule`'s new `packages: []` array shape is exactly what the updated component destructures (same "confirm the exact field names line up" check the original build did, since a mismatch here wouldn't be caught by TypeScript if types are loose anywhere).

- [ ] **Step 6: Commit**

```bash
git add src/task-manager/ui/branch-package-schedule-grid.tsx src/app/task-manager/package-table/page.tsx
git commit -m "feat(task-manager): multi-select dropdown+chips cell UI for Package Table"
```

---

## Task 4: Final holistic review

Not a code task — dispatch a final review agent across the whole `feat/package-table-multiselect` branch before `finishing-a-development-branch`. Specifically re-verify on the FINAL merged diff:
1. The full add/remove/leave-unchanged diff logic AND the weekday-collision-prevention guarantee, one more time, fresh, end-to-end through the real page/server-action path (not just the data-layer functions directly).
2. The migration was actually applied to the shared dev database with the correct final constraint shape (query `information_schema`/`pg_constraint` directly, not just trust the migration file).
3. Confirm the ORIGINAL single-select batch-save mechanics (dirty tracking, beforeunload warning, per-cell error display, sequential save-loop with partial-failure handling) all still work correctly in the new set-based shape — this is a generalization of working code, not a rewrite, so regression risk is real if the set-equality logic has an off-by-one/reference-equality bug.
4. Full test suite + build clean.
