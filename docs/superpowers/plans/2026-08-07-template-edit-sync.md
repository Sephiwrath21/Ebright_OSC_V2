# Template/Package Edit-Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an already-assigned Template/Package is edited, propagate the edit to everyone who already has it assigned — but ONLY to their future/today-dated pending task instances, never retroactively rewriting a past-due (overdue) instance's content. Also: a newly-added task in an already-assigned group should auto-create for existing assignees, replicating their existing schedule.

**Architecture:** Most of this already exists and mostly works — `editTaskTemplateCore` already live-updates pending `RunBlock` instances when a template's title/subtasks change, and recurrence clones content forward from the RunBlock being advanced (not re-reading the template), so updating just the current pending occurrence is sufficient — it cascades to all future weeks automatically. Two real gaps close this feature: (1) `editTaskTemplateCore`'s pending-instance query has NO date filter today, so it currently rewrites past-due `OVERDUE` instances too — this is a genuine, already-shipping bug, being fixed here at the shared Core level (affects both the single-task "+ Task" hub's own Edit tab and Template/Package group edits, confirmed in scope). (2) `editTemplateGroup`'s "new member task" branch currently only creates the `TaskTemplate` row — it never fans out to existing group assignees; this plan adds that fan-out.

**Tech Stack:** Next.js 16 App Router / Server Actions, Prisma (Task Manager's own `TASK_MANAGER_DATABASE_URL` client), Vitest.

---

## Confirmed design decisions (do not deviate)

1. **Past-due protection**: a pending `RunBlock` instance is "past" (excluded from sync) if `dueAt` is non-null AND `dueAt < todayStart`. Null-`dueAt` instances (adhoc/undated) are NOT considered past — they stay eligible for sync. `todayStart` uses the SAME computation `src/task-manager/engine/recurrence.ts` already uses internally (`now` shifted by `TM_RESET_HOUR`, floored to local calendar-date) — do not invent a different day-boundary rule; export/reuse the existing one so the two systems' notion of "today" can never disagree.
2. **Fix applies at the shared `editTaskTemplateCore` level** — both the single-task "+ Task" hub's own Edit tab AND Template/Package group edits stop retroactively rewriting past-due instances. This is a deliberate, confirmed behavior change to already-shipped functionality, not an accidental side effect.
3. **"Just the next occurrence" is sufficient** for propagating an edit through a recurring chain — recurrence clones copy content from the RunBlock being advanced, not from the live template, so updating the current pending instance's title/subtasks is enough; every future auto-generated week inherits it transitively. Do not add any "walk the recurrenceOfId chain and update every future clone" logic — it's unnecessary and there's normally at most one non-terminal pending occurrence per chain at any time anyway.
4. **New task added to an already-assigned group**: fans out immediately on save to every CURRENT assignee of the group (found via their other still-pending member-task instances), replicating that assignee's existing cadence/days — copied from one of their other pending instances of a different member task in the same group. If an assignee has NO pending instances left to copy a schedule from (e.g. everything already completed), skip creating the new task for them — do not guess a default cadence/day. Report the skip count back to the caller (do not silently swallow it).
5. **Completed (`DONE`)/N-A (`SKIPPED`) instances remain excluded** exactly as today — no change needed, this already works because those statuses aren't in `PENDING_STATUSES`.
6. **Out of scope, do not touch**: `cancelPendingTemplateRuns`'s own date-filtering behavior for the REMOVED-member-from-group case (deletion, not edit) — this plan is about edit-sync only, not delete-cancellation semantics. Do not add a past-due filter there.

---

## Task 1: Shared `todayStart()` helper

**Files:**
- Create: `src/task-manager/lib/dates.ts`
- Modify: `src/task-manager/engine/recurrence.ts` (import from the new shared location instead of computing inline)

- [ ] **Step 1: Read the current inline computation**

Read `src/task-manager/engine/recurrence.ts` in full, specifically the `resetHour()` function and the `todayStart` computation (`const shifted = new Date(now.getTime() - resetHour() * 3_600_000); const todayStart = new Date(shifted.getFullYear(), shifted.getMonth(), shifted.getDate());`). Confirm `resetHour()`'s exact current implementation (reads `TM_RESET_HOUR` env var, defaults to 0) before extracting it.

- [ ] **Step 2: Extract into a shared file**

Create `src/task-manager/lib/dates.ts`:

```ts
// Shared "today" boundary for the Task Manager module (2026-08-07,
// extracted from engine/recurrence.ts so editTaskTemplateCore's
// past-due-protection filter and the recurrence sweep can never disagree
// about what "today" means). Local-server-time based (not an explicit
// timezone), shifted by TM_RESET_HOUR — see resetHour() below for why.
// This is deliberately NOT the same thing as attendance/report's
// Asia/Kuala_Lumpur-explicit date helpers; Task Manager's day-boundary
// convention predates and is independent of that module.

/** Configurable "day starts at this hour" override (default midnight,
 *  local server time). Read fresh on every call, not cached — matches
 *  the original inline behavior in recurrence.ts. */
export function resetHour(): number {
  const raw = process.env.TM_RESET_HOUR;
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) && parsed >= 0 && parsed < 24 ? parsed : 0;
}

/** Start of "today" per the module's day-boundary convention (local
 *  server time, shifted by resetHour()). Pass `now` explicitly in tests;
 *  defaults to the real current time. */
export function todayStart(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() - resetHour() * 3_600_000);
  return new Date(shifted.getFullYear(), shifted.getMonth(), shifted.getDate());
}
```

(Match the EXACT logic already in `recurrence.ts` — read that file's current `resetHour()` implementation first and copy its exact validation/parsing behavior; the snippet above is illustrative of the shape, not necessarily byte-identical to what you'll find. If `resetHour()`'s actual current implementation differs from this sketch, use the REAL one.)

- [ ] **Step 3: Update `recurrence.ts` to import from the shared file**

Replace the inline `resetHour`/`todayStart` computation in `recurrence.ts` with `import { resetHour, todayStart } from "../lib/dates";` and `const boundary = todayStart();` (or call `todayStart()` directly wherever the old inline `todayStart` variable was used) — this must be a PURE refactor with zero behavior change. Run the existing test suite before and after to confirm identical results (there should already be recurrence-related tests — find them via `grep -r "recurrence" src/task-manager/**/*.test.ts` or similar; if none exist, this refactor still needs `npm test` to pass with no new failures, and a live-DB sanity check that `advanceRecurringBlocks` still runs without error against real data — read-only check, don't actually trigger new recurrence advances beyond what would happen naturally).

- [ ] **Step 4: Type-check, test**

Run `npx tsc --noEmit`, `npm test` — confirm zero new failures, and specifically confirm any existing recurrence-related test still passes identically.

- [ ] **Step 5: Commit**

```bash
git add src/task-manager/lib/dates.ts src/task-manager/engine/recurrence.ts
git commit -m "refactor(task-manager): extract todayStart/resetHour into a shared helper"
```

---

## Task 2: Past-due protection in `editTaskTemplateCore`

**Files:**
- Modify: `src/task-manager/data/templates-internal.ts`

**Context:** Read `editTaskTemplateCore` in FULL first (`src/task-manager/data/templates-internal.ts`) — this plan's Task 2 fixes a real, currently-shipping bug: the function's pending-parent-selection query has no `dueAt` filter, so `OVERDUE` (past-due, not yet completed) instances get their title/subtasks silently rewritten exactly like future ones. This task adds the missing filter.

- [ ] **Step 1: Add the date filter to the parent-selection query**

Find the `prisma.runBlock.findMany` call that selects pending parents (currently `where: { templateId: id, parentId: null, status: { in: [...PENDING_STATUSES] }, run: { status: { not: "CANCELLED" }, archivedAt: null } }`). Add:

```ts
import { todayStart } from "../lib/dates";
// ...
const boundary = todayStart();
const parents = await prisma.runBlock.findMany({
  where: {
    templateId: id,
    parentId: null,
    status: { in: [...PENDING_STATUSES] },
    run: { status: { not: "CANCELLED" }, archivedAt: null },
    OR: [{ dueAt: null }, { dueAt: { gte: boundary } }],
  },
  include: { run: true, runItems: true },
});
```

Update the function's doc comment to state this explicitly: past-due (`dueAt < todayStart`) pending instances are now excluded from the sync, even if their status is still `OVERDUE`/etc — only `DONE`/`SKIPPED` were excluded before this change; now "past-due but not yet resolved" is ALSO excluded, for a different reason (date, not status).

- [ ] **Step 2: Confirm the subtask cancel-and-recreate step doesn't need its own separate filter**

Read the subtask-handling code right after the parent loop — it operates on `parent.dueAt`/`parent.cadence` for each `parent` already in the (now date-filtered) `parents` array, so it should automatically inherit the same protection with no separate change needed. Confirm this by reading the actual code, don't just assume — if subtasks are looked up via a SEPARATE query with their own `where` clause (not derived from the already-filtered `parents` array), that separate query would ALSO need the same date filter added.

- [ ] **Step 3: Live-DB verification — the exact scenario this task exists to fix**

Using throwaway data (a test `TaskTemplate`, a test assignee `User`, both deleted afterward): create two `RunBlock`/`FlowRun` pairs for the SAME template+assignee — one `PENDING` with `dueAt` in the future, one `OVERDUE` with `dueAt` in the past (both statuses must be non-terminal, i.e. in `PENDING_STATUSES`). Call `editTaskTemplateCore(actor, templateId, {title: "NEW TITLE", subtasks: [...]})`. Confirm:
- The future `PENDING` block's title IS updated to "NEW TITLE".
- The past `OVERDUE` block's title is UNCHANGED (still its original title) — this is the critical assertion this whole task exists to prove.
Clean up all test data before finishing.

- [ ] **Step 4: Live-DB verification — confirm the single-task hub's own Edit path also gets the fix**

`editTaskTemplateCore` is called by BOTH `templates.ts`'s public `editTaskTemplate` (the single-task hub) AND `template-groups.ts`'s `editTemplateGroup` (per confirmed design decision #2 — the fix applies to both). Confirm via a quick grep that both callers still compile/work correctly with the added filter (no signature change was needed, so this should be a non-event, but verify — the function's signature is unchanged, only its internal query changed).

- [ ] **Step 5: Type-check, test, build**

Run `npx tsc --noEmit`, `npm test`, `npm run build`.

- [ ] **Step 6: Commit**

```bash
git add src/task-manager/data/templates-internal.ts
git commit -m "fix(task-manager): stop editTaskTemplateCore from rewriting past-due task instances"
```

---

## Task 3: New task added to an assigned group fans out to existing assignees

**Files:**
- Modify: `src/task-manager/data/template-groups.ts`

**Context:** Read `editTemplateGroup` in full (already read during design research, but re-read the CURRENT file since Task 1/2 may have touched neighboring code) — specifically its "new member task" branch (`id` absent in submission → `prisma.taskTemplate.create(...)`). This task adds fan-out logic right after that create call.

- [ ] **Step 1: Find existing assignees to fan out to, and each one's schedule to replicate**

After a new `TaskTemplate` is created for the group, you need: (a) the set of users who currently have a pending instance of ANY OTHER member task in this group, and (b) for each, a `{days, cadence}` pair to replicate, sourced from one of their existing pending instances.

Reuse the existing `getGroupAssignees`-style aggregation shape (`template-groups.ts`) as a reference for "how to find current assignees of a group," but you need MORE than `getGroupAssignees` currently returns (it only returns `{userId, name, pendingTasks}` counts, not schedule info) — write new logic here rather than trying to repurpose that function. For each OTHER (already-existing, not the brand-new one) member `TaskTemplate` of the group, query its pending `RunBlock`s (same `PENDING_STATUSES` + not-cancelled/archived + NEW past-due filter from Task 2, reusing `todayStart()`) and group by `assigneeId`, keeping one representative block per assignee (any one is fine, cadence/day should be consistent per person within a group per design decision #4's stated caveat about divergent schedules being a rare edge case, not something to reconcile).

- [ ] **Step 2: Derive `days` from a representative block's `dueAt`**

A `RunBlock`'s cadence is stored directly (`block.cadence`), but its "day of week" isn't stored as a separate field — it's implicit in `dueAt`'s day-of-week (same as how Branch Package Schedule's weekday-scoped cancellation derives weekday from `dueAt.getDay()` in an earlier feature this session — read `src/task-manager/data/branch-package-schedule.ts` for that exact pattern if useful context). For `cadence: "daily"` blocks (the only cadence recurrence actually perpetuates), derive the day name from `dueAt.getDay()` mapped back to `FLOW_DAYS`' day names (`src/task-manager/ui/types.ts`). For `cadence: "monthly"`/`"adhoc"` representative blocks, there's no "days" concept the same way — `assignFlowTaskCore`'s `days` param is specifically for the daily-recurring case; for monthly/adhoc reference blocks, pass `dueDate` (a specific date) instead of `days`, following whatever `assignFlowTaskCore`'s existing input shape expects for those cadences (read `FlowAssignInput`'s type and `assignFlowTaskCore`'s handling of `body.dueDate` vs `body.days` — already covered in earlier research this session, `tasks-internal.ts:174-187` — to get this right; do not guess).

- [ ] **Step 3: Fan out via `assignFlowTaskCore`**

For each assignee with a derivable schedule, call `assignFlowTaskCore(actor, {title: newTask.title, subtasks: [...], userIds: [assigneeId], days: [...] OR dueDate: ..., cadence: representativeBlock.cadence, fromTemplateId: newTask.id})` — one call per assignee (mirrors `applyTemplateGroup`'s existing per-assignee fan-out shape, but scoped to just the ONE new task rather than every member task). Track: `fannedOutTo: number`, `skipped: number` (assignees with no derivable schedule).

- [ ] **Step 4: Update `editTemplateGroup`'s return type/result to report this**

`EditTemplateGroupResult` currently has `{updatedTasks, createdTasks, removedTasks, employees}`. Add a field (e.g. `newTaskAssignedTo: number`, `newTaskSkipped: number`) so the UI can eventually surface "the new task was auto-assigned to N existing people (M skipped, no active schedule)" — check `src/task-manager/ui/types.ts` for where `TemplateGroupEditResult`/`EditTemplateGroupResult`-equivalent types live and update them consistently. This plan does NOT require adding new UI text/toast for this (that's a follow-up if the user wants it) — just make sure the data layer returns accurate counts rather than discarding this information.

- [ ] **Step 5: Live-DB verification**

Using throwaway data (a test `TaskTemplateGroup` with 1 member task, assigned to 2 test users with different cadence/day choices, plus a 3rd test user whose instance is already `DONE`): call `editTemplateGroup` adding a brand-new second member task (no `id`). Confirm:
- The 2 users with active pending instances of the first task each get a NEW pending `RunBlock` for the second task, with `days`/`cadence` matching their existing first-task schedule.
- The 3rd user (all `DONE`, nothing pending to copy from) does NOT get a new instance — confirmed via `skipped` count and via directly querying that no new `RunBlock` was created for them.
- Clean up all test data (including the newly-fanned-out `RunBlock`/`FlowRun` rows) before finishing.

- [ ] **Step 6: Type-check, test, build**

Run `npx tsc --noEmit`, `npm test`, `npm run build`.

- [ ] **Step 7: Commit**

```bash
git add src/task-manager/data/template-groups.ts src/task-manager/ui/types.ts
git commit -m "feat(task-manager): fan out newly-added template tasks to existing assignees"
```

---

## Task 4: Final holistic review

Not a code task — dispatch a final review agent across the whole `feat/template-edit-sync` branch before `finishing-a-development-branch`. Specifically re-verify on the FINAL merged diff:
1. Both the past-due-protection scenario (Task 2) AND the new-task-fan-out scenario (Task 3), fresh, end-to-end — including a COMBINED scenario: edit a group's EXISTING task's title AND add a new task in the SAME `editTemplateGroup` call, confirm both behaviors work correctly together in one edit.
2. Confirm the single-task "+ Task" hub's Edit tab (not just group edits) genuinely benefits from the past-due fix too — trace `templates.ts`'s public `editTaskTemplate` → `editTaskTemplateCore` end to end for a non-group template.
3. Confirm `cancelPendingTemplateRuns`/the removed-member-from-group deletion path was NOT touched (out of scope per design decision #6) — diff should show zero changes there.
4. Confirm `recurrence.ts`'s refactor (Task 1) introduced zero behavior change — the `advanceRecurringBlocks` sweep should produce identical results before/after, verified by re-reading the diff line-by-line, not just by tests passing.
5. Full test suite + build clean.
