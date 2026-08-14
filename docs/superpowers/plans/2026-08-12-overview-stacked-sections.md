# Overview Page Stacked-Sections Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Task Manager page's Filter (Daily/Monthly/HOD Assigned Task) toggle with four always-visible, stacked sections (Daily, Monthly, HOD Assigned Task, CEO Assigned Task), roll this structure out to every role (not just entity-owning ones), and give the self-scoped card the same task-completion actions the personal "My Tasks" lists it replaces already have.

**Architecture:** `EntityCardOverview` is refactored from "one component with an internal Filter switch across 3 datasets" into "one component rendering ONE section's card grid" (Sort: Person/Type + conditional View: All/Only Me, scoped to whatever `FlowEntityDetail` it's given), reused by a new `TaskOverviewStack` wrapper that stacks up to four instances. Entity-owning roles (HOD/DEPT_SITE/BRANCH_MANAGER/BRANCH_SITE, and the Admin/CEO dropdown) feed it real whole-roster data, unchanged from today. Roles with no owned entity get a new `myOverview` section instead, fed either a synthetic one-member roster (built from data already fetched) or — for plain department/branch MEMBER-role staff's Daily section specifically — a real whole-entity fetch, per a new narrowly-scoped permission. Person-sort cards reuse the existing `TaskRowLine` component (bits.tsx) for their rows, which already self-gates actions to the viewer's own tasks via `task.assigneeId === myUserId` — no new per-card action-gating logic is needed.

**Tech Stack:** Next.js Server Actions, Prisma ORM (`@/generated/task-manager-client`), React/TypeScript, Vitest.

**Depends on:** `docs/superpowers/plans/2026-08-12-task-categories-foundation.md` and `docs/superpowers/plans/2026-08-12-overview-card-redesign.md` (both already merged) — this plan's starting point is `EntityCardOverview` in its Filter-toggle form, already live at `departmentOverview`/`branchOverview`/`entityDropdowns`.

**Design docs:** `docs/superpowers/specs/2026-08-12-overview-card-redesign-design.md` — read the "Addendum" and "Addendum 2" sections before starting; this plan implements exactly what they specify, including the confirmed per-role table and the two corrections (CEO loses `ceoTaskTable`; plain MEMBER-role staff get whole-entity Daily visibility instead of an HOD/CEO Assigned Task section).

---

## Context for the engineer

This codebase is "Ebright Flow," a task-manager module bolted onto a larger app ("OSC"). Data-layer functions live in `src/task-manager/data/*.ts` and `src/task-manager/analytics/*.ts`, each Prisma-touching function wrapped in `native(async () => {...}, "functionName")` (from `./core`), which turns thrown `ApiHttpError`s into typed HTTP responses. Every data-layer function takes the acting user's **email** as its first argument.

**Testing convention:** Prisma-touching data-layer functions have **no unit tests** in this codebase (verified against the live app/DB instead — see `engine/recurrence.test.ts`'s header comment). Only pure, DB-free logic gets Vitest unit tests (e.g. `entity-card-grouping.ts`). React UI components in `src/task-manager/ui/` also have **no dedicated component test files** in this codebase (confirmed: `assign-task-form.tsx`, `add-task-button.tsx`, `category-manager.tsx`, and the current `entity-card-overview.tsx` all have none) — this plan follows that same convention; verification is via `npm test` (regression), `npx tsc --noEmit` (types), and a live-DB smoke-test script (final task) plus manual browser checks.

**Windows dev machine note:** use PowerShell for `npm test` (Git Bash has a drive-letter-casing quirk that causes spurious whole-suite failures on this machine).

**Role config — read `src/task-manager/role-views.ts` in full before Task 6.** `ROLE_VIEWS[role].home` (the `/home` page) and `ROLE_VIEWS[role].taskManager` (the `/task-manager` page, THIS plan's only target) are separate arrays sharing one `SectionKey` enum. **Never remove a `SectionKey` from the enum** — several keys this plan retires from every role's `taskManager` array (`personalDaily`, `personalMonthly`, `ceoAssigned`, `hodAssigned`) are still used by `home` arrays, rendered by entirely different files under `src/app/home/`, which this plan does not touch.

---

### Task 1: Data layer — `getEntityCeoAssignedPayload`

**Files:**
- Modify: `src/task-manager/analytics/_payloads.ts`

- [ ] **Step 1: Add the new payload builder**

Immediately after `getEntityHodAssignedPayload` (currently ends around line 312), add:

```typescript
/** "CEO Assigned Task" section (2026-08-12 stacked-sections redesign):
 *  every task in this entity whose assigner is the CEO, ALL-TIME — same
 *  shape and convention as getEntityHodAssignedPayload above, just a
 *  different assignerRole. */
export async function getEntityCeoAssignedPayload(
  type: "branch" | "department",
  name: string,
): Promise<EntityPayload> {
  return buildEntityPayload(type, name, null, { assignerRole: "CEO" });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add src/task-manager/analytics/_payloads.ts
git commit -m "feat(task-manager): add getEntityCeoAssignedPayload (mirrors HOD-assigned)"
```

---

### Task 2: Data layer — `getDepartmentCeoAssigned`/`getBranchCeoAssigned`

**Files:**
- Modify: `src/task-manager/data/queries.ts`

- [ ] **Step 1: Add the two query wrappers**

Find `getDepartmentHodAssigned` (around line 329) and `getBranchHodAssigned` (around line 375) in `queries.ts`. Immediately after `getDepartmentHodAssigned`'s closing `}, "getDepartmentHodAssigned");` (before the `branchQuerySchema` declaration), add:

```typescript
/** "CEO Assigned Task" section (2026-08-12 stacked-sections redesign) —
 *  all-time, no period/date param (mirrors getDepartmentHodAssigned, a
 *  different payload source/assignerRole). */
export function getDepartmentCeoAssigned(
  email: string,
  department: string,
): Promise<{ department: { name: string } & EntityPayload }> {
  return native(async () => {
    await advanceRecurringBlocks();
    const q = z.object({ department: z.string().min(1).max(200) }).parse({ department });
    const user = await requireUserByEmail(email);
    if (!canViewEntity(user, "department", q.department)) {
      throw new ApiHttpError(403, "You can only view your own department");
    }
    const payload = await getEntityCeoAssignedPayload("department", q.department);
    return { department: { name: q.department, ...payload } };
  }, "getDepartmentCeoAssigned");
}
```

Immediately after `getBranchHodAssigned`'s closing `}, "getBranchHodAssigned");`, add:

```typescript
/** "CEO Assigned Task" section (2026-08-12 stacked-sections redesign) —
 *  all-time, no period/date param. */
export function getBranchCeoAssigned(
  email: string,
  branch: string,
): Promise<{ branch: { name: string } & EntityPayload }> {
  return native(async () => {
    await advanceRecurringBlocks();
    const q = z.object({ branch: z.string().min(1).max(200) }).parse({ branch });
    const user = await requireUserByEmail(email);
    if (!canViewEntity(user, "branch", q.branch)) {
      throw new ApiHttpError(403, "You can only view your own branch");
    }
    const payload = await getEntityCeoAssignedPayload("branch", q.branch);
    return { branch: { name: q.branch, ...payload } };
  }, "getBranchCeoAssigned");
}
```

- [ ] **Step 2: Update the import**

At the top of `queries.ts`, find the import from `../analytics/_payloads` (it currently imports `getEntityHodAssignedPayload` among others) and add `getEntityCeoAssignedPayload` to it.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/task-manager/data/queries.ts
git commit -m "feat(task-manager): add getDepartmentCeoAssigned/getBranchCeoAssigned"
```

---

### Task 3: Data layer — MEMBER-role whole-entity Daily visibility (narrow, period-gated)

**Files:**
- Modify: `src/task-manager/data/queries.ts`

This is the corrected, narrower permission change from spec Addendum 2 — it does NOT touch the shared `canViewEntity` (used by both Daily and Monthly, and by other consumers like the HOD/CEO-assigned queries above). It adds one local, period-gated exception directly inside `getDepartmentDetail` and `getBranchDetail`, so only the Daily period is affected and only for these two functions.

- [ ] **Step 1: Modify `getDepartmentDetail`**

Find (around line 304-323):

```typescript
export function getDepartmentDetail(
  email: string,
  department: string,
  period: FlowPeriod,
  date?: string,
): Promise<FlowDepartmentDetailResponse> {
  return native(async () => {
    await advanceRecurringBlocks();
    const q = departmentQuerySchema.parse({ department, period, ...(date ? { date } : {}) });
    const user = await requireUserByEmail(email);
    if (!canViewEntity(user, "department", q.department)) {
      throw new ApiHttpError(403, "You can only view your own department");
    }
    const payload = await getEntityPayload("department", q.department, q.period, q.date);
    return {
      period: q.period,
      date: resolvedDate(q.date),
      department: { name: q.department, ...payload },
    } as FlowDepartmentDetailResponse;
  }, "getDepartmentDetail");
}
```

Replace the auth check with:

```typescript
export function getDepartmentDetail(
  email: string,
  department: string,
  period: FlowPeriod,
  date?: string,
): Promise<FlowDepartmentDetailResponse> {
  return native(async () => {
    await advanceRecurringBlocks();
    const q = departmentQuerySchema.parse({ department, period, ...(date ? { date } : {}) });
    const user = await requireUserByEmail(email);
    // Stacked-sections redesign (2026-08-12): plain department-side staff
    // (role MEMBER) may view their OWN department's whole-roster DAILY
    // detail — the new page-wide Daily section's confirmed visibility rule
    // — but NOT Monthly (unchanged, still self-only for MEMBER). Scoped
    // locally to this function (not canViewEntity itself, which has no
    // period and also gates getBranchDetail/the HOD/CEO-assigned queries —
    // widening it there would silently unlock Monthly whole-department
    // detail too, which must stay unchanged).
    const ownDailyView =
      user.role === "MEMBER" && q.period === "daily" && q.department === (user.department ?? UNASSIGNED);
    if (!canViewEntity(user, "department", q.department) && !ownDailyView) {
      throw new ApiHttpError(403, "You can only view your own department");
    }
    const payload = await getEntityPayload("department", q.department, q.period, q.date);
    return {
      period: q.period,
      date: resolvedDate(q.date),
      department: { name: q.department, ...payload },
    } as FlowDepartmentDetailResponse;
  }, "getDepartmentDetail");
}
```

- [ ] **Step 2: Modify `getBranchDetail`** the same way

Find (around line 351-370):

```typescript
export function getBranchDetail(
  email: string,
  branch: string,
  period: FlowPeriod,
  date?: string,
): Promise<FlowBranchDetailResponse> {
  return native(async () => {
    await advanceRecurringBlocks();
    const q = branchQuerySchema.parse({ branch, period, ...(date ? { date } : {}) });
    const user = await requireUserByEmail(email);
    if (!canViewEntity(user, "branch", q.branch)) {
      throw new ApiHttpError(403, "You can only view your own branch");
    }
    const payload = await getEntityPayload("branch", q.branch, q.period, q.date);
    return {
      period: q.period,
      date: resolvedDate(q.date),
      branch: { name: q.branch, ...payload },
    } as FlowBranchDetailResponse;
  }, "getBranchDetail");
}
```

Replace the auth check with:

```typescript
export function getBranchDetail(
  email: string,
  branch: string,
  period: FlowPeriod,
  date?: string,
): Promise<FlowBranchDetailResponse> {
  return native(async () => {
    await advanceRecurringBlocks();
    const q = branchQuerySchema.parse({ branch, period, ...(date ? { date } : {}) });
    const user = await requireUserByEmail(email);
    // Same rule as getDepartmentDetail above — plain branch-side staff
    // (role MEMBER, e.g. Branch Exec/Coach) may view their own branch's
    // whole-roster DAILY detail only; Monthly stays self-only.
    const ownDailyView =
      user.role === "MEMBER" && q.period === "daily" && q.branch === (user.branch ?? UNASSIGNED);
    if (!canViewEntity(user, "branch", q.branch) && !ownDailyView) {
      throw new ApiHttpError(403, "You can only view your own branch");
    }
    const payload = await getEntityPayload("branch", q.branch, q.period, q.date);
    return {
      period: q.period,
      date: resolvedDate(q.date),
      branch: { name: q.branch, ...payload },
    } as FlowBranchDetailResponse;
  }, "getBranchDetail");
}
```

- [ ] **Step 3: Confirm `UNASSIGNED` is already imported**

`UNASSIGNED` is already used in `canViewEntity` in `_lib.ts` — check `queries.ts`'s import block for `UNASSIGNED` from `../analytics/_lib`; add it to that existing import list if it isn't already there.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/task-manager/data/queries.ts
git commit -m "feat(task-manager): let MEMBER-role staff view own department/branch's Daily roster"
```

---

### Task 4: Refactor `EntityCardOverview` — single-dataset card grid with row actions

**Files:**
- Modify: `src/task-manager/ui/entity-card-overview.tsx`

This replaces the current internal Filter (Daily/Monthly/HOD Assigned Task) switch — the component now renders exactly ONE section's card grid per instance. `TaskOverviewStack` (Task 5) instantiates it up to 4 times. Person-sort cards reuse `TaskRowLine` from `bits.tsx` (already exported, already handles the StatusDropdown/ProofCell/due-day-lock/guideline-indicator machinery and already self-gates every action to `task.assigneeId === myUserId` — no extra per-card read-only/actionable branching is needed here).

- [ ] **Step 1: Replace the whole file**

```tsx
"use client";

// Overview page card grid (2026-08-12, restructured 2026-08-12 same day:
// stacked-sections redesign) — renders ONE section's worth of card grid:
// Sort: Person/Type, and (when showViewToggle) View: All/Only Me. Reused
// by TaskOverviewStack (task-overview-stack.tsx) to render up to four
// sections (Daily/Monthly/HOD Assigned Task/CEO Assigned Task) stacked —
// this component itself has no Filter switch anymore; the CALLER decides
// which dataset (and hence which section) a given instance represents.
//
// Person-sort rows reuse TaskRowLine (bits.tsx) — the same row component
// "My Tasks" lists use — which already renders the StatusDropdown/
// ProofCell/GuidelineIndicator machinery AND already gates every action to
// `task.assigneeId === myUserId` internally (StatusDropdown/ProofCell both
// check `isOwned` and silently degrade to a read-only circle/dash for any
// task that isn't the viewer's own). This is exactly the confirmed Task
// Interactivity rule (own card actionable, everyone else's read-only) —
// achieved for free by passing the SAME action props to every row in every
// card, with no extra per-card conditional logic needed here.
//
// Type-sort cards stay a plain, read-only Task/Assignee table — a category
// card mixes multiple people's tasks together, which doesn't map cleanly
// onto "my own row is actionable" the way a Person-sort card does; the
// confirmed Task Interactivity requirement was specifically about the
// self-scoped Daily/Monthly card, reachable via Person-sort. A viewer can
// always switch to Person-sort to act on their own task.
//
// Known, accepted gap (2026-08-12, unchanged from the original redesign):
// the old EntityOverviewSection roster had an "Assign to Others" reassign
// action on every pending row. Neither this component nor its predecessor
// has that — cut deliberately for the first pass. Reassign from the
// viewer's own delegated/ad hoc tasks still works elsewhere on this page.
import * as React from "react";
import type {
  ActionResult,
  FlowCategoryOption,
  FlowEntityDetail,
  FlowTaskRow,
  ProofRemoveHandler,
  ProofUploadHandler,
} from "./types";
import { groupTasksByCategory, groupTasksByPerson, UNCATEGORIZED_CARD_ID } from "./entity-card-grouping";
import { TaskRowLine } from "./bits";

type SortMode = "person" | "type";

function flattenTasks(entity: FlowEntityDetail) {
  return [...entity.tasks.completed, ...entity.tasks.pending, ...entity.tasks.na];
}

export function EntityCardOverview({
  sectionLabel,
  entityName,
  entity,
  categories,
  myUserId,
  dateControl,
  showViewToggle,
  onComplete,
  onSkip,
  onReopen,
  onUploadProof,
  onRemoveProof,
}: {
  /** The section's own heading, e.g. "Daily" / "Monthly" / "HOD Assigned
   *  Task" / "CEO Assigned Task" — TaskOverviewStack renders it above this
   *  card grid, not this component itself (keeps the heading and the
   *  card-grid body as two independently-composable pieces). */
  sectionLabel: string;
  entityName: string;
  entity: FlowEntityDetail;
  categories: FlowCategoryOption[];
  /** The viewer's own id — drives which row in a Person-sort card is
   *  actionable (via TaskRowLine's own isOwned check) and, when
   *  showViewToggle, "Only Me". */
  myUserId: string;
  /** The existing date/range filter control for this section (unchanged) —
   *  e.g. DailyDatePicker for a Daily section. Omit for sections with no
   *  date filter (HOD/CEO Assigned Task are all-time). */
  dateControl?: React.ReactNode;
  /** Whether to render the View: All/Only Me control — true for a real
   *  multi-person roster (entity-owning roles, or a MEMBER's whole-
   *  department/branch Daily section); false for a synthetic one-member
   *  entity, where there's nothing to toggle. An explicit prop from the
   *  caller (not inferred from entity.members.length) — a genuinely real
   *  one-person department shouldn't lose the toggle just because it
   *  happens to have one member. */
  showViewToggle: boolean;
  /** Task action handlers — passed straight through to TaskRowLine for
   *  every row in every Person-sort card; each handler is a no-op for any
   *  task that isn't the viewer's own (TaskRowLine/StatusDropdown/ProofCell
   *  already enforce this via task.assigneeId === myUserId). Omit any of
   *  these to disable that specific action everywhere in this section. */
  onComplete?: (runBlockId: string) => Promise<ActionResult>;
  onSkip?: (runBlockId: string) => Promise<ActionResult>;
  onReopen?: (runBlockId: string) => Promise<ActionResult>;
  onUploadProof?: ProofUploadHandler;
  onRemoveProof?: ProofRemoveHandler;
}) {
  const [sortMode, setSortMode] = React.useState<SortMode>("person");
  const [onlyMe, setOnlyMe] = React.useState(false);

  const tasks = flattenTasks(entity);
  const scopeId = showViewToggle && onlyMe ? myUserId : undefined;

  const personCards = sortMode === "person" ? groupTasksByPerson(entity.members, tasks, scopeId) : [];
  const categoryCards = sortMode === "type" ? groupTasksByCategory(categories, tasks, scopeId) : [];

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
        <h2 className="text-lg font-semibold text-gray-900">
          {entityName} — {sectionLabel}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {dateControl}
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            aria-label="Sort"
            className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
          >
            <option value="person">Sort: Person</option>
            <option value="type">Sort: Type</option>
          </select>
          {showViewToggle && (
            <select
              value={onlyMe ? "onlyMe" : "all"}
              onChange={(e) => setOnlyMe(e.target.value === "onlyMe")}
              aria-label="View"
              className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
            >
              <option value="all">View All</option>
              <option value="onlyMe">Only Me</option>
            </select>
          )}
        </div>
      </div>

      {sortMode === "person" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {personCards.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No one to show.</p>
          ) : (
            personCards.map((card) => {
              // hideCompleted is per-CARD, not per-row (2026-08-12, code
              // review fix): groupTasksByPerson puts only one person's
              // tasks in each card, so every row in a card shares the same
              // ownership — the viewer's own card gets the full "My Tasks"
              // treatment (StatusDropdown/ProofCell/complete-skip-reopen),
              // every other person's card stays the plain roster/oversight
              // mode (matching bits.tsx's own documented convention for
              // "read-only oversight of OTHER people's work") instead of
              // forcing in a Proof/Assignee/fixed-Due-Date column that mode
              // always assumes a wide table has room for.
              const isOwnCard = card.userId === myUserId;
              return (
                <div key={card.userId} className="overflow-hidden rounded-xl border border-gray-200">
                  <div className="bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800">{card.name}</div>
                  <div className="px-3 py-1">
                    {card.tasks.length === 0 ? (
                      <p className="py-2 text-xs italic text-gray-400">No tasks this period.</p>
                    ) : (
                      card.tasks.map((t: FlowTaskRow) => (
                        <TaskRowLine
                          key={t.runBlockId}
                          task={t}
                          myUserId={myUserId}
                          onComplete={onComplete}
                          onSkip={onSkip}
                          onReopen={onReopen}
                          onUploadProof={onUploadProof}
                          onRemoveProof={onRemoveProof}
                          hideCompleted={isOwnCard}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {categoryCards.map((card) => (
            <div
              key={card.id}
              className={`overflow-hidden rounded-xl border ${card.id === UNCATEGORIZED_CARD_ID ? "border-dashed border-gray-300" : "border-gray-200"}`}
            >
              <div className="bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800">{card.name}</div>
              <div className="px-3 py-2">
                {card.tasks.length === 0 ? (
                  <p className="py-2 text-xs italic text-gray-400">No tasks this period.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500">
                        <th className="pb-1 font-medium">Task</th>
                        <th className="pb-1 font-medium">Assignee</th>
                      </tr>
                    </thead>
                    <tbody>
                      {card.tasks.map((t) => (
                        <tr key={t.runBlockId} className="border-t border-dashed border-gray-100">
                          <td className="truncate py-1.5 pr-2">{t.blockTitle}</td>
                          <td className="truncate py-1.5 text-gray-500">{t.assigneeName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck (expect errors — callers aren't updated yet)**

Run: `npx tsc --noEmit`
Expected: errors in `task-manager-view.tsx` and `page.tsx`'s `buildEntityOverview()` (old call sites using the retired `daily`/`monthly`/`hodAssigned`/`dailyDateControl`/`monthlyDateControl` prop names) — these are fixed in Tasks 10–11, not here. Confirm the errors are ONLY in those two files (i.e. this file itself and `bits.tsx`/`entity-card-grouping.ts` are clean).

- [ ] **Step 3: Commit**

```bash
git add src/task-manager/ui/entity-card-overview.tsx
git commit -m "refactor(task-manager): EntityCardOverview renders one section, reuses TaskRowLine for actions"
```

(Callers are broken until Task 10–11 land later in this same plan — that's expected mid-plan; the final integration task verifies everything typechecks together.)

---

### Task 5: New `TaskOverviewStack` wrapper component

**Files:**
- Create: `src/task-manager/ui/task-overview-stack.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

// Stacked-sections redesign (2026-08-12) — renders up to four
// EntityCardOverview instances top to bottom: Daily, Monthly, HOD Assigned
// Task, CEO Assigned Task. Each section is entirely optional — omit a
// prop to omit that section (BRANCH_MEMBER/COACH have no Monthly; OPS/the
// CEO's own page have no HOD/CEO Assigned Task; see role-views.ts's
// taskManager arrays and the design doc's per-role table for exactly which
// roles get which sections).
import * as React from "react";
import type { FlowCategoryOption, FlowEntityDetail } from "./types";
import { EntityCardOverview } from "./entity-card-overview";

interface SectionData {
  entity: FlowEntityDetail;
  dateControl?: React.ReactNode;
  showViewToggle: boolean;
}

export function TaskOverviewStack({
  entityName,
  categories,
  myUserId,
  daily,
  monthly,
  hodAssigned,
  ceoAssigned,
  onComplete,
  onSkip,
  onReopen,
  onUploadProof,
  onRemoveProof,
}: {
  entityName: string;
  categories: FlowCategoryOption[];
  myUserId: string;
  daily?: SectionData;
  monthly?: SectionData;
  hodAssigned?: SectionData;
  ceoAssigned?: SectionData;
  onComplete?: (runBlockId: string) => Promise<import("./types").ActionResult>;
  onSkip?: (runBlockId: string) => Promise<import("./types").ActionResult>;
  onReopen?: (runBlockId: string) => Promise<import("./types").ActionResult>;
  onUploadProof?: import("./types").ProofUploadHandler;
  onRemoveProof?: import("./types").ProofRemoveHandler;
}) {
  const sections: { key: string; label: string; data?: SectionData }[] = [
    { key: "daily", label: "Daily", data: daily },
    { key: "monthly", label: "Monthly", data: monthly },
    { key: "hodAssigned", label: "HOD Assigned Task", data: hodAssigned },
    { key: "ceoAssigned", label: "CEO Assigned Task", data: ceoAssigned },
  ];

  return (
    <div className="flex flex-col gap-6">
      {sections.map(
        ({ key, label, data }) =>
          data && (
            <EntityCardOverview
              key={key}
              sectionLabel={label}
              entityName={entityName}
              entity={data.entity}
              categories={categories}
              myUserId={myUserId}
              dateControl={data.dateControl}
              showViewToggle={data.showViewToggle}
              onComplete={onComplete}
              onSkip={onSkip}
              onReopen={onReopen}
              onUploadProof={onUploadProof}
              onRemoveProof={onRemoveProof}
            />
          ),
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors from this file (it isn't imported anywhere yet, so it can't surface caller errors).

- [ ] **Step 3: Commit**

```bash
git add src/task-manager/ui/task-overview-stack.tsx
git commit -m "feat(task-manager): add TaskOverviewStack wrapper for the 4 stacked sections"
```

---

### Task 6: `role-views.ts` — `myOverview` SectionKey + per-role `taskManager` arrays

**Files:**
- Modify: `src/task-manager/role-views.ts`
- Modify: `src/task-manager/role-views.test.ts`

- [ ] **Step 1: Add the new SectionKey**

In the `SectionKey` type (starts around line 31), add `myOverview` to the "org-level overviews" group, right after `branchOverview`:

```typescript
  | "branchOverview" // own-branch detail (same component as department)
  | "myOverview" // 2026-08-12: self-scoped 4-section stack (no owned entity)
```

- [ ] **Step 2: Update `ROLE_VIEWS.CEO`**

Find (around line 100-105):

```typescript
  CEO: {
    home: ["ceoCombinedList", "ceoKanban", "branchRegionOverview"],
    taskManager: ["myTasksDaily", "ceoTaskTable", "entityDropdowns"],
    weekdayRange: "mon-sun",
    addTaskHeader: true,
  },
```

Replace `taskManager` with:

```typescript
  CEO: {
    home: ["ceoCombinedList", "ceoKanban", "branchRegionOverview"],
    // 2026-08-12 stacked-sections redesign: myOverview replaces
    // myTasksDaily (own Daily/Monthly, now actionable card-grid form) and
    // ceoTaskTable (own delegated-out list) — the CEO no longer has one
    // combined cross-department "tasks I assigned" table; the same
    // information is reachable per-department via entityDropdowns's new
    // CEO Assigned Task section instead (confirmed accepted trade-off, see
    // design doc addendum). Monthly is new for the CEO here (never had it
    // before this redesign).
    taskManager: ["myOverview", "entityDropdowns"],
    weekdayRange: "mon-sun",
    addTaskHeader: true,
  },
```

- [ ] **Step 3: Update `ROLE_VIEWS.OPS`**

Find (around line 106-111):

```typescript
  OPS: {
    home: ["orgGrids"],
    taskManager: ["personalDaily", "personalMonthly", "assignerStreams", "myTasksDaily", "myTasksMonthly"],
    weekdayRange: "tue-sat",
    addTaskHeader: true,
  },
```

Replace with:

```typescript
  OPS: {
    home: ["orgGrids"],
    // 2026-08-12: myOverview replaces personalDaily/personalMonthly/
    // myTasksDaily/myTasksMonthly (own Daily/Monthly, now actionable
    // card-grid form). assignerStreams is a different concept (incoming
    // tasks grouped by who assigned them) and is unaffected. OPS has no
    // owned department, so myOverview here renders Daily/Monthly only —
    // no HOD/CEO Assigned Task section (see page.tsx wiring).
    taskManager: ["myOverview", "assignerStreams"],
    weekdayRange: "tue-sat",
    addTaskHeader: true,
  },
```

- [ ] **Step 4: Update `ROLE_VIEWS.HOD`**

Find (around line 112-131):

```typescript
  HOD: {
    home: ["personalDaily", "personalMonthly", "ceoAssigned", "departmentOverview"],
    // assignedByMeList (2026-08-05): mirrors CEO's own tasks-→-ceoTaskTable
    // ordering — own tasks/board first, then what HOD delegated OUT to
    // their department, then the broader department overview. Task
    // Manager only (Home stays summary-card territory, matching every
    // other detailed list in this app).
    taskManager: [
      "personalDaily",
      "personalMonthly",
      "ceoAssigned",
      "myTasksDaily",
      "myTasksMonthly",
      "myBoard",
      "assignedByMeList",
      "departmentOverview",
    ],
    weekdayRange: "tue-sat",
    addTaskHeader: true,
  },
```

Replace with:

```typescript
  HOD: {
    home: ["personalDaily", "personalMonthly", "ceoAssigned", "departmentOverview"],
    // 2026-08-12 stacked-sections redesign: personalDaily/personalMonthly/
    // ceoAssigned/myTasksDaily/myTasksMonthly/assignedByMeList are all
    // retired from Task Manager (Home keeps them, unchanged) — every one
    // of them is subsumed into departmentOverview's restructured 4-section
    // stack: the HOD's own card already appears (actionable) inside the
    // whole-department Daily/Monthly grid, and the new entity-wide HOD/CEO
    // Assigned Task sections cover what ceoAssigned (personal, day-
    // windowed) and assignedByMeList (delegated-out list) used to show,
    // now visible department-wide instead of just to the HOD. myBoard
    // (Kanban) is unrelated and unaffected.
    taskManager: ["myBoard", "departmentOverview"],
    weekdayRange: "tue-sat",
    addTaskHeader: true,
  },
```

- [ ] **Step 5: Update `ROLE_VIEWS.BRANCH_MANAGER`**

Find (around line 147-162):

```typescript
  BRANCH_MANAGER: {
    home: ["personalDaily", "personalMonthly", "personalAdhoc", "branchOverview"],
    taskManager: [
      "personalDaily",
      "personalMonthly",
      "personalAdhoc",
      "myTasksDaily",
      "myTasksMonthly",
      "myTasksAdhoc",
      "branchOverview",
      "adhocOversight",
      "manpowerLink",
    ],
    weekdayRange: "tue-sun",
    addTaskHeader: false,
  },
```

Replace `taskManager` with:

```typescript
  BRANCH_MANAGER: {
    home: ["personalDaily", "personalMonthly", "personalAdhoc", "branchOverview"],
    // 2026-08-12: personalDaily/personalMonthly/myTasksDaily/myTasksMonthly
    // are retired — subsumed into branchOverview's restructured 4-section
    // stack, same reasoning as HOD's departmentOverview above. Ad hoc
    // (personalAdhoc/myTasksAdhoc/adhocOversight) and manpowerLink are
    // UNTOUCHED — a fundamentally different, non-recurring cadence that's
    // explicitly outside this redesign's scope.
    taskManager: ["personalAdhoc", "myTasksAdhoc", "branchOverview", "adhocOversight", "manpowerLink"],
    weekdayRange: "tue-sun",
    addTaskHeader: false,
  },
```

- [ ] **Step 6: Update `ROLE_VIEWS.DEPT_MEMBER`**

Find (around line 173-178):

```typescript
  DEPT_MEMBER: {
    home: ["personalDaily", "personalMonthly", "hodAssigned"],
    taskManager: ["personalDaily", "personalMonthly", "hodAssigned", "myTasksDaily", "myTasksMonthly"],
    weekdayRange: "tue-sat",
    addTaskHeader: false,
  },
```

Replace `taskManager` with:

```typescript
  DEPT_MEMBER: {
    home: ["personalDaily", "personalMonthly", "hodAssigned"],
    // 2026-08-12 stacked-sections redesign (corrected per review):
    // myOverview here is NOT self-only for Daily — plain department-side
    // staff now see their WHOLE department's Daily roster (own card
    // actionable, everyone else's read-only, same as HOD's own Daily
    // section), via the new getDepartmentDetail MEMBER-daily exception
    // (queries.ts). Monthly stays self-only (unchanged from personalMonthly
    // today). No HOD Assigned Task section — hodAssigned is dropped here
    // (Home keeps it, unchanged); confirmed correction, not the original
    // "entity-wide, visible to everyone" plan.
    taskManager: ["myOverview"],
    weekdayRange: "tue-sat",
    addTaskHeader: false,
  },
```

- [ ] **Step 7: Update `ROLE_VIEWS.BRANCH_MEMBER` and `ROLE_VIEWS.COACH`**

Find (around line 180-193):

```typescript
  // Branch Exec — Daily ONLY, Tue–Sun (2026-07-29 final spec).
  BRANCH_MEMBER: {
    home: ["personalDaily"],
    taskManager: ["personalDaily", "myTasksDaily"],
    weekdayRange: "tue-sun",
    addTaskHeader: false,
  },
  // FT/PT Coach — Daily ONLY, Wed–SUN (the THIRD distinct range,
  // 2026-07-29 final spec).
  COACH: {
    home: ["personalDaily"],
    taskManager: ["personalDaily", "myTasksDaily"],
    weekdayRange: "wed-sun",
    addTaskHeader: false,
  },
```

Replace both `taskManager` arrays (keep everything else, including the Daily-only comments, unchanged):

```typescript
  // Branch Exec — Daily ONLY, Tue–Sun (2026-07-29 final spec).
  BRANCH_MEMBER: {
    home: ["personalDaily"],
    // 2026-08-12: myOverview here renders Daily ONLY (no Monthly prop
    // passed — preserves the Daily-only constraint), whole-branch
    // visibility via the new getBranchDetail MEMBER-daily exception (same
    // rule as DEPT_MEMBER's department, applied symmetrically to the
    // branch side). No HOD/CEO Assigned Task section, same as DEPT_MEMBER.
    taskManager: ["myOverview"],
    weekdayRange: "tue-sun",
    addTaskHeader: false,
  },
  // FT/PT Coach — Daily ONLY, Wed–SUN (the THIRD distinct range,
  // 2026-07-29 final spec).
  COACH: {
    home: ["personalDaily"],
    // Same as BRANCH_MEMBER above — Daily-only whole-branch myOverview.
    taskManager: ["myOverview"],
    weekdayRange: "wed-sun",
    addTaskHeader: false,
  },
```

- [ ] **Step 8: Confirm `ADMIN`/`ELEVATED_DEPT_SITE`/`DEPT_SITE`/`BRANCH_SITE` are unchanged**

These four roles' `taskManager` arrays (`["entityDropdowns"]`, `["entityDropdowns"]`, `["departmentOverview"]`, `["branchOverview", "adhocOversight"]`) need NO edits — their sections are restructured internally (Task 10) but the arrays themselves don't change. Do not touch these four blocks.

- [ ] **Step 9: Update `role-views.test.ts` — the now-stale array assertions**

Find (around line 48-53):

```typescript
  it("Branch Exec and Coaches are Daily ONLY on both pages", () => {
    for (const v of ["BRANCH_MEMBER", "COACH"] as ViewRole[]) {
      expect(ROLE_VIEWS[v].home).toEqual(["personalDaily"]);
      expect(ROLE_VIEWS[v].taskManager).toEqual(["personalDaily", "myTasksDaily"]);
    }
  });
```

Replace with:

```typescript
  it("Branch Exec and Coaches are Daily ONLY on both pages", () => {
    for (const v of ["BRANCH_MEMBER", "COACH"] as ViewRole[]) {
      expect(ROLE_VIEWS[v].home).toEqual(["personalDaily"]);
      expect(ROLE_VIEWS[v].taskManager).toEqual(["myOverview"]);
    }
  });
```

Find (around line 91-94):

```typescript
  it("DEPT_MEMBER gets the HOD Assigned card on both pages", () => {
    expect(shows("DEPT_MEMBER", "home", "hodAssigned")).toBe(true);
    expect(shows("DEPT_MEMBER", "taskManager", "hodAssigned")).toBe(true);
  });
```

Replace with:

```typescript
  it("DEPT_MEMBER gets the HOD Assigned card on Home only (2026-08-12: Task Manager's myOverview replaced it with whole-department Daily visibility instead)", () => {
    expect(shows("DEPT_MEMBER", "home", "hodAssigned")).toBe(true);
    expect(shows("DEPT_MEMBER", "taskManager", "hodAssigned")).toBe(false);
    expect(shows("DEPT_MEMBER", "taskManager", "myOverview")).toBe(true);
  });
```

- [ ] **Step 10: Narrow the "cross-page consistency invariants" — the redesign deliberately breaks part of this invariant**

Find the `describe("cross-page consistency invariants", ...)` block (around line 117-179). This block's first two tests assert that certain "personal" keys stay identical between Home and Task Manager for every role — TRUE before this redesign, deliberately FALSE now for `personalDaily`/`personalMonthly`/`ceoAssigned`/`hodAssigned` (Home keeps them; Task Manager replaced them with `myOverview`/`departmentOverview`/`branchOverview`). `personalAdhoc` is NOT part of this redesign and should still stay in sync — keep it in the checked list so BRANCH_MANAGER's Ad hoc alignment stays protected.

Find:

```typescript
describe("cross-page consistency invariants", () => {
  it("every personal card on HOME also exists on the Task Manager page", () => {
    // The bug class this module exists to prevent ("CEO Assigned on Home
    // but missing on Task Manager"). The reverse (TM-only personal cards)
    // is legitimate for org-home roles like OPS, whose Home shows the org
    // grids instead of personal cards.
    const personalKeys = ["personalDaily", "personalMonthly", "personalAdhoc", "ceoAssigned", "hodAssigned"] as const;
    for (const v of Object.keys(ROLE_VIEWS) as ViewRole[]) {
      for (const key of personalKeys) {
        if (shows(v, "home", key)) {
          expect(
            shows(v, "taskManager", key),
            `${v}/${key} is on Home but missing on Task Manager`,
          ).toBe(true);
        }
      }
    }
  });

  it("non-org-home roles have IDENTICAL personal cards on both pages", () => {
    const personalKeys = ["personalDaily", "personalMonthly", "personalAdhoc", "ceoAssigned", "hodAssigned"] as const;
    const orgHome = (v: ViewRole) => shows(v, "home", "orgGrids");
    for (const v of (Object.keys(ROLE_VIEWS) as ViewRole[]).filter((v) => !orgHome(v))) {
      for (const key of personalKeys) {
        expect(
          shows(v, "home", key),
          `${v}/${key}: Home=${shows(v, "home", key)} TM=${shows(v, "taskManager", key)}`,
        ).toBe(shows(v, "taskManager", key));
      }
    }
  });
```

Replace both tests with:

```typescript
  it("Ad hoc stays identical on both pages (2026-08-12: NOT part of the stacked-sections redesign, unlike the other personal keys below)", () => {
    for (const v of Object.keys(ROLE_VIEWS) as ViewRole[]) {
      expect(
        shows(v, "home", "personalAdhoc"),
        `${v}/personalAdhoc: Home=${shows(v, "home", "personalAdhoc")} TM=${shows(v, "taskManager", "personalAdhoc")}`,
      ).toBe(shows(v, "taskManager", "personalAdhoc"));
    }
  });

  it("2026-08-12 stacked-sections redesign: personalDaily/personalMonthly/ceoAssigned/hodAssigned are Home-only now, replaced on Task Manager by myOverview/departmentOverview/branchOverview", () => {
    // This intentionally REPLACES the pre-2026-08-12 invariant (these keys
    // used to be required to match on both pages) — the whole point of
    // this redesign is that Task Manager's personal sections were
    // subsumed into the new stacked structure while Home's stayed
    // untouched. Pin exactly which roles now diverge, so an accidental
    // re-introduction of one of these keys to a taskManager array (instead
    // of going through myOverview/departmentOverview/branchOverview) is a
    // conscious, test-breaking decision.
    const retiredFromTaskManager = ["personalDaily", "personalMonthly", "ceoAssigned", "hodAssigned"] as const;
    for (const v of Object.keys(ROLE_VIEWS) as ViewRole[]) {
      for (const key of retiredFromTaskManager) {
        expect(shows(v, "taskManager", key), `${v}/${key} should no longer appear on Task Manager`).toBe(false);
      }
    }
  });
```

Find (around line 169-178, now shifted by the edits above — locate by content):

```typescript
  it("every personal-staff role gets the My Tasks Daily table; org/site logins don't", () => {
    const withDailyTable = (Object.keys(ROLE_VIEWS) as ViewRole[])
      .filter((v) => shows(v, "taskManager", "myTasksDaily"))
      .sort();
    // CEO joined 2026-08-01: their Task Manager "My Tasks" is the same
    // weekday-sidebar Daily table now (the combined list is Home-only).
    expect(withDailyTable).toEqual(
      ["BRANCH_MANAGER", "BRANCH_MEMBER", "CEO", "COACH", "DEPT_MEMBER", "HOD", "OPS"].sort(),
    );
  });
```

Replace with:

```typescript
  it("every personal-staff role gets SOME Daily-showing surface on Task Manager (2026-08-12: myTasksDaily itself is retired everywhere, replaced by myOverview/departmentOverview/branchOverview/entityDropdowns)", () => {
    const hasDailySurface = (v: ViewRole) =>
      shows(v, "taskManager", "myOverview") ||
      shows(v, "taskManager", "departmentOverview") ||
      shows(v, "taskManager", "branchOverview") ||
      shows(v, "taskManager", "entityDropdowns");
    const withDailySurface = (Object.keys(ROLE_VIEWS) as ViewRole[]).filter(hasDailySurface).sort();
    expect(withDailySurface).toEqual(
      [
        "ADMIN",
        "BRANCH_MANAGER",
        "BRANCH_MEMBER",
        "BRANCH_SITE",
        "CEO",
        "COACH",
        "DEPT_MEMBER",
        "DEPT_SITE",
        "ELEVATED_DEPT_SITE",
        "HOD",
        "OPS",
      ].sort(),
    );
  });
```

- [ ] **Step 10.5: Fix the now-vacuous "a My Tasks list implies its personal card" test (code review fix, 2026-08-12)**

Find:

```typescript
  it("a My Tasks list implies its personal card (and vice versa for Daily)", () => {
    for (const v of Object.keys(ROLE_VIEWS) as ViewRole[]) {
      // CEO exception (2026-08-01 redesign): Home shows the ONE combined
      // "My Tasks" card (ceoCombinedList) while Task Manager shows the
      // standard Daily table WITHOUT a separate personal donut card.
      if (shows(v, "home", "ceoCombinedList") || shows(v, "taskManager", "ceoCombinedList")) continue;
      expect(shows(v, "taskManager", "myTasksDaily")).toBe(shows(v, "taskManager", "personalDaily"));
      // Monthly list implies the Monthly card (not necessarily the reverse).
      if (shows(v, "taskManager", "myTasksMonthly")) {
        expect(shows(v, "taskManager", "personalMonthly")).toBe(true);
      }
    }
  });
```

This test is now vacuous — after Steps 2-7 above, no role's `taskManager` array contains `myTasksDaily`, `personalDaily`, `myTasksMonthly`, or `personalMonthly` anymore, so every comparison degenerates to `false === false` and the test passes while protecting nothing. Replace it with:

```typescript
  it("myTasksDaily/myTasksMonthly no longer appear in any taskManager array (2026-08-12: subsumed into myOverview/departmentOverview/branchOverview — this invariant used to be checked implicitly via the old personalDaily/myTasksDaily pairing test, which became vacuous once neither key remained)", () => {
    for (const v of Object.keys(ROLE_VIEWS) as ViewRole[]) {
      expect(shows(v, "taskManager", "myTasksDaily"), `${v} should not show myTasksDaily on Task Manager`).toBe(false);
      expect(shows(v, "taskManager", "myTasksMonthly"), `${v} should not show myTasksMonthly on Task Manager`).toBe(false);
    }
  });
```

- [ ] **Step 11: Run the full role-views test file**

Run: `npx vitest run src/task-manager/role-views.test.ts`
Expected: all tests pass. If any other test in this file fails (one wasn't anticipated above), read its assertion and update it to match the new arrays from Steps 2–7 — do not weaken an assertion to make it pass without understanding why it changed.

- [ ] **Step 12: Commit**

```bash
git add src/task-manager/role-views.ts src/task-manager/role-views.test.ts
git commit -m "feat(task-manager): add myOverview SectionKey, update taskManager arrays for stacked-sections redesign"
```

---

### Task 7: `page.tsx` — fetch CEO-assigned data for entity-owning roles

**Files:**
- Modify: `src/app/task-manager/page.tsx`

- [ ] **Step 1: Import the new query functions**

In the import block from `@/task-manager/data` (starts around line 21), add `getBranchCeoAssigned` and `getDepartmentCeoAssigned` alphabetically alongside the existing `getBranchHodAssigned`/`getDepartmentHodAssigned`.

- [ ] **Step 2: Fetch CEO-assigned entity data alongside the existing HOD-assigned fetch**

Find (the block added by the earlier entityDropdowns migration, now further down the file after Tasks 3's edits — locate by content):

```typescript
    const [hodAssignedDepartment, hodAssignedBranch] = await Promise.all([
      daily.department
        ? getDepartmentHodAssigned(email, daily.department.name).catch(() => null)
        : Promise.resolve(null),
      daily.branch
        ? getBranchHodAssigned(email, daily.branch.name).catch(() => null)
        : Promise.resolve(null),
    ]);
```

Replace with:

```typescript
    const [hodAssignedDepartment, hodAssignedBranch, ceoAssignedDepartment, ceoAssignedBranch] = await Promise.all([
      daily.department
        ? getDepartmentHodAssigned(email, daily.department.name).catch(() => null)
        : Promise.resolve(null),
      daily.branch
        ? getBranchHodAssigned(email, daily.branch.name).catch(() => null)
        : Promise.resolve(null),
      // CEO Assigned Task (2026-08-12 stacked-sections redesign) — same
      // shape/gating as the HOD-assigned fetch above.
      daily.department
        ? getDepartmentCeoAssigned(email, daily.department.name).catch(() => null)
        : Promise.resolve(null),
      daily.branch
        ? getBranchCeoAssigned(email, daily.branch.name).catch(() => null)
        : Promise.resolve(null),
    ]);
```

- [ ] **Step 3: Add the same fetch inside `buildEntityOverview()`**

Find (inside `buildEntityOverview`'s department branch, after Tasks earlier in this session already updated it to fetch `hodAssignedDetail`):

```typescript
        const [dailyDetail, monthlyDetail, hodAssignedDetail] = await Promise.all([
          getDepartmentDetail(email, department, "daily", dailyDate),
          getDepartmentDetail(email, department, "monthly"),
          getDepartmentHodAssigned(email, department).catch(() => null),
        ]);
```

Replace with:

```typescript
        const [dailyDetail, monthlyDetail, hodAssignedDetail, ceoAssignedDetail] = await Promise.all([
          getDepartmentDetail(email, department, "daily", dailyDate),
          getDepartmentDetail(email, department, "monthly"),
          getDepartmentHodAssigned(email, department).catch(() => null),
          getDepartmentCeoAssigned(email, department).catch(() => null),
        ]);
```

Find the branch equivalent:

```typescript
        const [dailyDetail, monthlyDetail, hodAssignedDetail] = await Promise.all([
          getBranchDetail(email, branch, "daily", dailyDate),
          getBranchDetail(email, branch, "monthly"),
          getBranchHodAssigned(email, branch).catch(() => null),
        ]);
```

Replace with:

```typescript
        const [dailyDetail, monthlyDetail, hodAssignedDetail, ceoAssignedDetail] = await Promise.all([
          getBranchDetail(email, branch, "daily", dailyDate),
          getBranchDetail(email, branch, "monthly"),
          getBranchHodAssigned(email, branch).catch(() => null),
          getBranchCeoAssigned(email, branch).catch(() => null),
        ]);
```

(The two `<EntityCardOverview>` JSX blocks inside `buildEntityOverview` are replaced with `<TaskOverviewStack>` in Task 11, which is where `ceoAssignedDetail` actually gets consumed — this step only adds the fetch.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: `ceoAssignedDetail`/`ceoAssignedDepartment`/`ceoAssignedBranch` are now unused-variable warnings (not errors — TS doesn't error on unused locals by default in this project, but confirm `tsc` doesn't flag it as a hard error; if it does, that's expected until Task 11 wires them in — do not silence it artificially, just note it'll be consumed shortly).

- [ ] **Step 5: Commit**

```bash
git add src/app/task-manager/page.tsx
git commit -m "feat(task-manager): fetch CEO Assigned Task entity data alongside HOD-assigned"
```

---

### Task 8: `page.tsx` — self-scoped synthetic entities + whole-entity Daily fetch for MEMBER-role viewers

**Files:**
- Modify: `src/app/task-manager/page.tsx`

- [ ] **Step 1: Add a synthetic single-member `FlowEntityDetail` builder**

Find the `carryTM` helper definition (around line 194-197, near the top of the component body) and add this helper function immediately after it (still inside `TaskManagerPage`, before the server actions):

```typescript
  // Self-scoped sections (2026-08-12 stacked-sections redesign): a role
  // with no owned entity (OPS, CEO, and Monthly for every MEMBER-role
  // viewer) gets a synthetic one-member FlowEntityDetail built from data
  // ALREADY fetched (daily.me/monthly.me's FlowPersonal), not a new query.
  // FlowDrillTask rows here always carry the viewer's own name in
  // assigneeName already (see types.ts's comment on FlowPersonal.tasks).
  function toSelfEntityDetail(
    me: { userId: string; name: string },
    personal: { totals: FlowBucketTotals; tasks: FlowDrillTask[] },
  ): FlowEntityDetail {
    return {
      name: me.name,
      totals: personal.totals,
      // Reuses flowBucketize (already imported, already used elsewhere in
      // this file) instead of hand-rolling the same DONE/SKIPPED/else
      // mapping a second time (2026-08-12, code review fix).
      tasks: flowBucketize(personal.tasks),
      members: [
        {
          userId: me.userId,
          name: me.name,
          employmentType: null,
          department: null,
          branch: null,
          // Unused placeholders — no current consumer (groupTasksByPerson,
          // EntityCardOverview) reads a person card's done/notDone; only
          // userId/name matter for this synthetic single-member roster.
          done: 0,
          notDone: 0,
        },
      ],
    };
  }
```

`FlowBucketTotals`, `FlowDrillTask`, `FlowEntityDetail` join the existing top-level `import { ... } from "@/task-manager/ui/types"` block near the top of the file (which already imports `flowBucketize`) — add the three names there rather than referencing them via inline `import("@/task-manager/ui/types").X`.

- [ ] **Step 2: Fetch whole-entity Daily data for MEMBER-role viewers who own no entity but belong to one**

Find the block from Task 7 Step 2 (the `hodAssignedDepartment`/`hodAssignedBranch`/`ceoAssignedDepartment`/`ceoAssignedBranch` `Promise.all`) and add a new fetch immediately after it:

```typescript
    // DEPT_MEMBER/BRANCH_MEMBER/COACH's whole-department/branch Daily
    // section (2026-08-12, corrected design — confirmed: plain staff see
    // their whole department/branch's Daily roster, not just their own
    // row). Only meaningful for roles resolving to myOverview with no
    // owned entity but a real department/branch membership — gated on the
    // same daily.me.me.department/branch fields the new getDepartmentDetail/
    // getBranchDetail MEMBER-daily exception checks server-side. Uses the
    // SAME getDepartmentDetail/getBranchDetail functions HOD's own
    // department Daily section already uses — just a different caller
    // identity, newly permitted by Task 3's exception. Parallelized (not
    // sequential awaits) to match the adjacent hodAssignedDepartment/
    // Branch/ceoAssignedDepartment/Branch block's own established shape
    // for this exact "two mutually-exclusive optional entity fetches"
    // pattern (2026-08-12, code review fix).
    const memberOwnDepartment = daily.me.me.role === "MEMBER" ? daily.me.me.department : null;
    const memberOwnBranch = daily.me.me.role === "MEMBER" ? daily.me.me.branch : null;
    const [memberWholeDepartmentDaily, memberWholeBranchDaily] = await Promise.all([
      memberOwnDepartment
        ? getDepartmentDetail(email, memberOwnDepartment, "daily", dailyDate).catch(() => null)
        : Promise.resolve(null),
      memberOwnBranch
        ? getBranchDetail(email, memberOwnBranch, "daily", dailyDate).catch(() => null)
        : Promise.resolve(null),
    ]);
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: `toSelfEntityDetail`/`memberWholeDepartmentDaily`/`memberWholeBranchDaily` unused until Task 9 wires them into `<TaskManagerView>` props — not an error, just not yet consumed.

- [ ] **Step 4: Commit**

```bash
git add src/app/task-manager/page.tsx
git commit -m "feat(task-manager): fetch whole-department/branch Daily data for MEMBER-role myOverview"
```

---

### Task 9: `page.tsx` → `TaskManagerView` — thread `myOverview` props through

**Files:**
- Modify: `src/app/task-manager/page.tsx`
- Modify: `src/task-manager/ui/task-manager-view.tsx`

- [ ] **Step 1: Add `myOverview` to `TaskManagerView`'s props**

In `task-manager-view.tsx`, find the props destructuring/type block (starts around line 59) and add a new prop, immediately after `categoryList`:

```typescript
  /** Self-scoped 4-section stack (2026-08-12 stacked-sections redesign) —
   *  OPS, CEO, and every MEMBER-role viewer (DEPT_MEMBER/BRANCH_MEMBER/
   *  COACH) with no owned entity. `daily`/`monthly`/`hodAssigned`/
   *  `ceoAssigned` mirror TaskOverviewStack's own optional per-section
   *  props exactly — omit a section to omit it (e.g. no monthly for
   *  BRANCH_MEMBER/COACH, no hodAssigned/ceoAssigned for OPS/CEO). */
  myOverview?: {
    entityName: string;
    daily?: { entity: FlowEntityDetail; dateControl?: React.ReactNode; showViewToggle: boolean };
    monthly?: { entity: FlowEntityDetail; dateControl?: React.ReactNode; showViewToggle: boolean };
    hodAssigned?: { entity: FlowEntityDetail; showViewToggle: boolean };
    ceoAssigned?: { entity: FlowEntityDetail; showViewToggle: boolean };
  };
```

Add `myOverview` to the destructured parameter list at the top of the function signature (alongside `categoryList`).

- [ ] **Step 2: In `page.tsx`, build the `myOverview` prop and pass it to `<TaskManagerView>`**

Find the `personalMonthlyControl`/`personalDailyControl` definitions (already present, built earlier in the file) — `myOverview`'s date controls reuse these SAME controls (no new date-picker JSX needed).

Immediately before the `body = (<TaskManagerView ...>)` JSX (find by locating the existing `<TaskManagerView` opening tag), add:

```typescript
    // myOverview (2026-08-12): built for every role — TaskManagerView only
    // renders it when role-views.ts's shows(view, "taskManager", "myOverview")
    // is true (HOD/DEPT_SITE/BRANCH_MANAGER/BRANCH_SITE/ADMIN/
    // ELEVATED_DEPT_SITE never read this prop; it's harmless to always
    // build it, same defensive-but-simple shape as the rest of this
    // function's optional fetches).
    const myOverviewData = {
      entityName: daily.me.me.name,
      daily: memberWholeDepartmentDaily
        ? { entity: memberWholeDepartmentDaily.department, dateControl: personalDailyControl, showViewToggle: true }
        : memberWholeBranchDaily
          ? { entity: memberWholeBranchDaily.branch, dateControl: personalDailyControl, showViewToggle: true }
          : { entity: toSelfEntityDetail(daily.me.me, daily.me), dateControl: personalDailyControl, showViewToggle: false },
      // Monthly stays self-only for every myOverview role, always — even
      // DEPT_MEMBER (whose Daily section is whole-department) keeps
      // Monthly self-scoped, per the confirmed correction. Omitted
      // entirely for BRANCH_MEMBER/COACH (Daily-only) — see below.
      monthly: { entity: toSelfEntityDetail(monthly.me.me, monthly.me), dateControl: personalMonthlyControl, showViewToggle: false },
      // No HOD/CEO Assigned Task section for OPS/CEO (no owned entity) —
      // DEPT_MEMBER/BRANCH_MEMBER/COACH don't get these either per the
      // confirmed correction, so this stays omitted for every myOverview
      // role. If a future role needs it, wire hodAssigned/ceoAssigned here
      // the same way departmentOverview/branchOverview do (Task 11).
    };
```

Then pass to `<TaskManagerView>`, immediately after `categoryList={categoryList}`:

```typescript
        myOverview={{
          entityName: myOverviewData.entityName,
          daily: myOverviewData.daily,
          // BRANCH_MEMBER/COACH are Daily-only (role-views.ts) — checked
          // directly by role rather than inferring it from their weekday
          // range (2026-08-12, code review fix): WeekdayRange exists to
          // pick sidebar days, a different purpose, and isn't guaranteed to
          // stay coupled to Daily-only-ness the way weekdayRangeOf(viewRole)
          // === "tue-sun"/"wed-sun" implicitly assumed.
          monthly: viewRole === "BRANCH_MEMBER" || viewRole === "COACH" ? undefined : myOverviewData.monthly,
        }}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (TaskManagerView doesn't consume `myOverview` in its render body yet — that's Task 11 — an unused destructured prop is not a TS error).

- [ ] **Step 4: Commit**

```bash
git add src/app/task-manager/page.tsx src/task-manager/ui/task-manager-view.tsx
git commit -m "feat(task-manager): thread myOverview data from page.tsx into TaskManagerView"
```

---

### Task 10: `task-manager-view.tsx` — swap `departmentOverview`/`branchOverview` to `TaskOverviewStack`

**Files:**
- Modify: `src/task-manager/ui/task-manager-view.tsx`

- [ ] **Step 1: Import `TaskOverviewStack`, drop the now-single-purpose `EntityCardOverview` import**

Replace:

```typescript
import { EntityCardOverview } from "./entity-card-overview";
```

with:

```typescript
import { TaskOverviewStack } from "./task-overview-stack";
```

- [ ] **Step 2: Replace the Department Overview call site**

Find:

```tsx
      {shows(view, "taskManager", "departmentOverview") &&
        daily.department &&
        monthly.department && (
        <>
          <PageSectionHeading>Department Overview</PageSectionHeading>
          <EntityCardOverview
            entityName={daily.department.name}
            daily={departmentDaily ?? daily.department}
            monthly={monthly.department}
            hodAssigned={hodAssignedDepartment?.department ?? monthly.department}
            categories={categoryList ?? []}
            myUserId={me.me.userId}
            dailyDateControl={departmentDailyControl}
          />
        </>
      )}
```

Replace with:

```tsx
      {shows(view, "taskManager", "departmentOverview") &&
        daily.department &&
        monthly.department && (
        <>
          <PageSectionHeading>Department Overview</PageSectionHeading>
          <TaskOverviewStack
            entityName={daily.department.name}
            categories={categoryList ?? []}
            myUserId={me.me.userId}
            daily={{ entity: departmentDaily ?? daily.department, dateControl: departmentDailyControl, showViewToggle: true }}
            monthly={{ entity: monthly.department, showViewToggle: true }}
            hodAssigned={
              hodAssignedDepartment ? { entity: hodAssignedDepartment.department, showViewToggle: true } : undefined
            }
            ceoAssigned={
              ceoAssignedDepartment ? { entity: ceoAssignedDepartment.department, showViewToggle: true } : undefined
            }
            {...completeProps}
          />
        </>
      )}
```

- [ ] **Step 3: Replace the Branch Overview call site**

Find:

```tsx
      {shows(view, "taskManager", "branchOverview") && daily.branch && monthly.branch && (
        <>
          <PageSectionHeading>Branch Overview</PageSectionHeading>
          <EntityCardOverview
            entityName={daily.branch.name}
            daily={daily.branch}
            monthly={monthly.branch}
            hodAssigned={hodAssignedBranch?.branch ?? monthly.branch}
            categories={categoryList ?? []}
            myUserId={me.me.userId}
            dailyDateControl={personalDailyControl}
            monthlyDateControl={personalMonthlyControl}
          />
```

Replace with:

```tsx
      {shows(view, "taskManager", "branchOverview") && daily.branch && monthly.branch && (
        <>
          <PageSectionHeading>Branch Overview</PageSectionHeading>
          <TaskOverviewStack
            entityName={daily.branch.name}
            categories={categoryList ?? []}
            myUserId={me.me.userId}
            daily={{ entity: daily.branch, dateControl: personalDailyControl, showViewToggle: true }}
            monthly={{ entity: monthly.branch, dateControl: personalMonthlyControl, showViewToggle: true }}
            hodAssigned={hodAssignedBranch ? { entity: hodAssignedBranch.branch, showViewToggle: true } : undefined}
            ceoAssigned={ceoAssignedBranch ? { entity: ceoAssignedBranch.branch, showViewToggle: true } : undefined}
            {...completeProps}
```

(Leave the closing `/>` and everything after — the ad hoc oversight and manpower link blocks that follow — untouched.)

- [ ] **Step 4: Note `completeProps`'s shape mismatch — fix it**

`completeProps` (defined near the top of the component, around line 231) currently is `{ myUserId, onComplete, onSkip, onReopen, onUploadProof, onRemoveProof, reassign }` — `TaskOverviewStack` doesn't accept a `reassign` prop (this redesign's confirmed, accepted gap — no reassign in the card grid) and doesn't want `myUserId` spread this way (`TaskOverviewStack` already takes `myUserId` as its own explicit prop, set to `me.me.userId` in Steps 2–3 above). Destructure only what's needed instead of spreading all of `completeProps`:

Replace `{...completeProps}` in BOTH call sites (Steps 2 and 3 above) with:

```tsx
            onComplete={completeTaskAction}
            onSkip={skipTaskAction}
            onReopen={reopenTaskAction}
            onUploadProof={uploadProofAction}
            onRemoveProof={removeProofAction}
```

(These are the same action props `completeProps` was built from — `TaskManagerView`'s own top-level props — just referenced directly instead of through the `completeProps` object, since that object's shape doesn't match what `TaskOverviewStack` accepts.)

- [ ] **Step 5: Add `myOverview`'s render block**

Find the closing of the Branch Overview section (the `manpowerLink` block, ends around line 641 with `)}`), and immediately after it (still inside the returned `<div className="flex flex-col gap-5">`, before the final closing comment/`</div>`), add:

```tsx
      {/* ---- myOverview (2026-08-12 stacked-sections redesign): the
          self-scoped 4-section stack for roles with no owned entity — OPS,
          CEO, and every MEMBER-role viewer (DEPT_MEMBER/BRANCH_MEMBER/
          COACH). Replaces personalDaily/personalMonthly/ceoAssigned/
          hodAssigned/myTasksDaily/myTasksMonthly/assignedByMeList/
          ceoTaskTable for these roles (see role-views.ts). ---- */}
      {shows(view, "taskManager", "myOverview") && myOverview && (
        <TaskOverviewStack
          entityName={myOverview.entityName}
          categories={categoryList ?? []}
          myUserId={me.me.userId}
          daily={myOverview.daily}
          monthly={myOverview.monthly}
          hodAssigned={myOverview.hodAssigned}
          ceoAssigned={myOverview.ceoAssigned}
          onComplete={completeTaskAction}
          onSkip={skipTaskAction}
          onReopen={reopenTaskAction}
          onUploadProof={uploadProofAction}
          onRemoveProof={removeProofAction}
        />
      )}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: remaining errors should now only be about `hodAssignedDepartment`/`ceoAssignedDepartment`/`hodAssignedBranch`/`ceoAssignedBranch` not yet being passed as props from `page.tsx` to `TaskManagerView` (they were fetched in Task 7 but not yet threaded through as props here) — fix by adding them to `TaskManagerView`'s prop type (they already existed for `hodAssignedDepartment`/`hodAssignedBranch`; add `ceoAssignedDepartment`/`ceoAssignedBranch` alongside, same optional `{ department: FlowEntityDetail } | null` / `{ branch: FlowEntityDetail } | null` shape) and pass all four from `page.tsx`'s `<TaskManagerView>` call (`hodAssignedDepartment={hodAssignedDepartment}` etc. — these prop names already exist from the earlier entityDropdowns migration; just add the two new `ceoAssigned*` ones alongside).

- [ ] **Step 7: Commit**

```bash
git add src/task-manager/ui/task-manager-view.tsx
git commit -m "feat(task-manager): wire TaskOverviewStack into departmentOverview/branchOverview/myOverview"
```

---

### Task 11: `task-manager-view.tsx` — retire the now-subsumed personal sections

**Files:**
- Modify: `src/task-manager/ui/task-manager-view.tsx`
- Modify: `src/app/task-manager/page.tsx`

- [ ] **Step 1: Remove the personal donut-cards block for HOD (the first `current.kind !== "org"` block)**

Find the block starting `{current.kind !== "org" && shows(view, "taskManager", "personalDaily") && (` (around line 305) through its closing `)}` (around line 363). Since `personalDaily`/`personalMonthly`/`ceoAssigned`/`hodAssigned`/`personalAdhoc`/`assignerStreams`/`delegated` are gone from EVERY role's `taskManager` array except `personalAdhoc`/`assignerStreams` (still used — `personalAdhoc` by BRANCH_MANAGER, `assignerStreams` by OPS), **do not delete this whole block** — instead remove only the retired sub-blocks from inside it, keeping the block itself (since `personalAdhoc` and `assignerStreams` still need to render for BRANCH_MANAGER/OPS respectively). Also note: this whole outer block is gated on `shows(view, "taskManager", "personalDaily")`, which is now `false` for every role (Step 9's array changes retired it everywhere) — meaning **this entire block never renders anymore**, including its `personalAdhoc`/`assignerStreams` children.

This means `personalAdhoc` and `assignerStreams` need a NEW render location, no longer nested under the retired `personalDaily` gate. Replace the entire block (lines ~305–363) with two independent, ungated-by-personalDaily blocks:

```tsx
      {/* Branch Manager's personal "Ad hoc" card (2026-08-12: no longer
          nested under personalDaily, which is retired for every role —
          Ad hoc itself is untouched by this redesign, just needed a new
          home now that its old parent gate is always false). */}
      {shows(view, "taskManager", "personalAdhoc") && personalAdhoc && (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <StatusOverviewCard
            title="Ad hoc"
            totals={personalAdhoc.totals}
            tasks={personalAdhoc.tasks}
            {...completeProps}
          />
        </div>
      )}

      {/* OPS's generic incoming assigner-stream cards (2026-08-12: same
          reason as above — assignerStreams is a different concept from the
          retired personal Daily/Monthly cards and stays untouched). */}
      {shows(view, "taskManager", "assignerStreams") && assignedCards.length > 0 && (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{assignedCards}</div>
      )}
```

- [ ] **Step 2: Remove the OPS `current.kind === "org"` personal-cards block**

Find and DELETE the block starting `{current.kind === "org" && shows(view, "taskManager", "personalDaily") && (` (around line 427) through its closing `)}` (around line 445) — `personalDaily`/`personalMonthly` no longer appear in OPS's `taskManager` array (Task 6 Step 3), and `assignerStreams` is now rendered by Step 1 above instead. Delete this whole block.

- [ ] **Step 3: Remove the `myTasksDaily`/`myTasksMonthly`/`myTasksAdhoc` block's Daily/Monthly halves, keep Ad hoc**

Find the block starting `{shows(view, "taskManager", "myTasksDaily") && (` (around line 449) through its closing `)}` before the `myBoard` block (around line 524). This block currently renders THREE things: "My Tasks — Daily" (SectionCard + ResizableTaskList), "My Tasks — Monthly" (same), and "My Tasks — Ad hoc" (the `if/else` at the end). Since `myTasksDaily`/`myTasksMonthly` are retired from every role and `myTasksAdhoc` is still used by BRANCH_MANAGER, this whole block is currently gated on `shows(view, "taskManager", "myTasksDaily")` which is now always `false` — same problem as Step 1: the still-needed Ad hoc list inside it would never render.

Replace the ENTIRE block (from `{shows(view, "taskManager", "myTasksDaily") && (` through its matching `)}`) with just the Ad hoc portion, ungated by the retired `myTasksDaily` check:

```tsx
      {/* Branch Manager's always-rendered "My Tasks — Ad hoc" list
          (2026-08-12: no longer nested under myTasksDaily, which is
          retired for every role — Ad hoc itself is untouched). */}
      {shows(view, "taskManager", "myTasksAdhoc") && personalAdhoc && (
        <SectionCard title="My Tasks — Ad hoc">
          <ResizableTaskList
            tasks={personalAdhoc.flatTasks ?? []}
            {...completeProps}
            emptyLabel="No ad hoc tasks assigned to you."
            hideCompleted
          />
        </SectionCard>
      )}
```

(The `else` branch of the original if/else — `me.adhocAll && (...)` — rendered a DIFFERENT always-shown-when-nonempty ad hoc list for roles WITHOUT `myTasksAdhoc`. Check `role-views.ts`'s final arrays from Task 6: no role other than BRANCH_MANAGER has `myTasksAdhoc`, and no other role needs this fallback anymore since every other role's `myTasksDaily`-gated block is gone entirely — so the `else` branch is now dead code for every remaining role and is correctly dropped here.)

- [ ] **Step 4: Remove the `assignedByMeList` block**

Find and DELETE the block starting `{shows(view, "taskManager", "assignedByMeList") && me.delegatedAll && (` (around line 554) through its closing `)}` (around line 569) — `assignedByMeList` no longer appears in any role's `taskManager` array (retired from HOD in Task 6 Step 4), subsumed into `departmentOverview`'s new HOD Assigned Task section.

- [ ] **Step 5: Remove the CEO `ceoTaskTable` block**

Find the `{current.kind === "org" && shows(view, "taskManager", "ceoTaskTable") && (` block (around line 369-420). Since `ceoTaskTable` is retired from CEO's `taskManager` array (Task 6 Step 2), this entire block is dead. **However**, this block also contains the `ceoDashboard` (Department/Branch Daily/Monthly Overview Kanban) rendering, which is UNRELATED to `ceoTaskTable` and still gated separately inside by `shows(view, "taskManager", "ceoKanban")` (a key that was never in CEO's array to begin with per the existing comment "this stays unbuilt"). Confirm via `role-views.ts`'s CEO config (Task 6 Step 2) that `ceoKanban` is still absent from CEO's `taskManager` array (it is — unchanged) — meaning the `ceoDashboard` sub-block inside this section never actually renders for CEO today either. Since the WHOLE outer gate (`shows(view, "taskManager", "ceoTaskTable")`) is now always false, delete the entire block (all of it, including the never-firing `ceoDashboard` sub-block) — it's fully dead code, not just the table part.

- [ ] **Step 6: Remove now-unused props from `TaskManagerView`'s signature**

The following props are no longer read anywhere in this file after Steps 1–5: `hodAssignedDepartment`'s and `hodAssignedBranch`'s OLD standalone usage is gone (they're now only consumed via `TaskOverviewStack`'s `hodAssigned={...}` prop built in Task 10 — keep the prop itself, just confirm no other stale reference remains), `personalCeo`, `personalHod` (fully retired — no `ceoAssigned`/`hodAssigned` StatusOverviewCard blocks reference them anymore after Step 1–2), `departmentDaily`/`departmentDailyControl` (still used — now feeds `TaskOverviewStack`'s `daily` prop in Task 10 Step 2, keep both), `ceoDashboard` (only ever consumed by the now-deleted block from Step 5 — remove this prop entirely), `personalDailyDaySidebar`/`personalMonthlySidebar`/`personalMonthlyMonthControl` (were only used inside the deleted "My Tasks — Daily/Monthly" SectionCards from Step 3 — remove these three props too).

Remove `personalCeo`, `ceoDashboard`, `personalDailyDaySidebar`, `personalMonthlySidebar`, `personalMonthlyMonthControl` from `TaskManagerView`'s destructured parameters and its prop type block. Keep `personalHod` removal for the same reason (only used by the deleted `hodAssigned` StatusOverviewCard). Grep the file (`grep -n "personalCeo\|personalHod\|ceoDashboard\|personalDailyDaySidebar\|personalMonthlySidebar\|personalMonthlyMonthControl" src/task-manager/ui/task-manager-view.tsx`) after this step to confirm zero remaining references before removing them from the type — if any reference remains, that use site should have been deleted in Steps 1–5 and was missed; go back and remove it.

- [ ] **Step 7: Remove the corresponding now-dead code from `page.tsx`**

In `page.tsx`, remove: the `ceoDashboard` construction block (`let ceoDashboard: ...` and its `if (shows(viewRole, "taskManager", "ceoKanban"))` body — `ceoKanban` was never reachable for CEO to begin with per Step 5's finding, and the prop is now gone from `TaskManagerView` entirely), the `personalCeo`/`personalHod` construction (`dayWindowedStream` calls and the `ceoDate`/`hdate` searchParams/`sp.cdate`/`sp.hdate` handling that fed them — remove `dayWindowedStream`, `personalCeo`, `personalHod`, `ceoDate`, `hodDate` entirely; keep `carryTM`/`rawParams` but drop their `cdate`/`hdate` entries), `personalDailyDaySidebar`/`personalMonthlySidebar`/`personalMonthlyMonthControl` construction, and their corresponding `<TaskManagerView>` prop passes. Also remove the `getCeoDashboardConfig`/`saveCeoDashboardConfig`/`getHodKanban` server actions' CEO-dashboard-specific ones (`makeCeoActions`, `ceoDailyActions`, `ceoMonthlyActions`) IF `getCeoDashboardConfig`/`saveCeoDashboardConfig` are not used anywhere else in this file after this removal (grep to confirm before deleting the actions — `getHodKanban`/`hodKanban` stays, that's My Board, unaffected).

Also remove the `?cdate=`/`?hdate=` searchParams type entries (`cdate?: string; hdate?: string;`) from the `searchParams` Promise type at the top of the file, since nothing reads them anymore.

- [ ] **Step 7.5: Swap `buildEntityOverview()`'s two `EntityCardOverview` calls to `TaskOverviewStack` (plan correction — this was mistakenly left unassigned to any task; Task 7's own note incorrectly claimed Task 11 would cover it, but no step originally did until now)**

`buildEntityOverview()` (the dropdown-driven Department|Branch overview — ADMIN/ELEVATED_DEPT_SITE's whole page, and appended below the CEO's own sections) still calls the OLD `EntityCardOverview` with its retired flat-prop shape (`daily`, `monthly`, `hodAssigned`, `dailyDateControl` directly) — `EntityCardOverview` no longer accepts those props as of the earlier refactor task, so this function is currently broken (it would fail to typecheck/render correctly) unless this step is applied.

First, swap the import at the top of the file:

```typescript
import { EntityCardOverview } from "@/task-manager/ui/entity-card-overview";
```

to:

```typescript
import { TaskOverviewStack } from "@/task-manager/ui/task-overview-stack";
```

(Confirm `EntityCardOverview` isn't imported/used anywhere else in `page.tsx` before removing it — it shouldn't be, since `buildEntityOverview()`'s two call sites are its only uses in this file.)

Then, inside `buildEntityOverview()`'s department branch, find:

```tsx
            <EntityCardOverview
              entityName={department}
              daily={dailyDetail.department}
              monthly={monthlyDetail.department}
              hodAssigned={hodAssignedDetail?.department ?? monthlyDetail.department}
              categories={categoryList}
              myUserId={daily.me.me.userId}
              dailyDateControl={
                <DailyDatePicker
                  key="admin-dept-daily-picker"
                  value={dailyDetail.date}
                  basePath="/task-manager"
                  extraParams={{ view: "department", department }}
                />
              }
            />
```

Replace with:

```tsx
            <TaskOverviewStack
              entityName={department}
              categories={categoryList}
              myUserId={daily.me.me.userId}
              daily={{
                entity: dailyDetail.department,
                dateControl: (
                  <DailyDatePicker
                    key="admin-dept-daily-picker"
                    value={dailyDetail.date}
                    basePath="/task-manager"
                    extraParams={{ view: "department", department }}
                  />
                ),
                showViewToggle: true,
              }}
              monthly={{ entity: monthlyDetail.department, showViewToggle: true }}
              hodAssigned={hodAssignedDetail ? { entity: hodAssignedDetail.department, showViewToggle: true } : undefined}
              ceoAssigned={ceoAssignedDetail ? { entity: ceoAssignedDetail.department, showViewToggle: true } : undefined}
              onComplete={completeTask}
              onSkip={skipTask}
              onReopen={reopenTask}
              onUploadProof={uploadProof}
              onRemoveProof={removeProof}
            />
```

Then, inside the branch branch, find:

```tsx
            <EntityCardOverview
              entityName={branch}
              daily={dailyDetail.branch}
              monthly={monthlyDetail.branch}
              hodAssigned={hodAssignedDetail?.branch ?? monthlyDetail.branch}
              categories={categoryList}
              myUserId={daily.me.me.userId}
              dailyDateControl={
                <DailyDatePicker
                  key="admin-branch-daily-picker"
                  value={dailyDetail.date}
                  basePath="/task-manager"
                  extraParams={{ view: "branch", branch }}
                />
              }
            />
```

Replace with:

```tsx
            <TaskOverviewStack
              entityName={branch}
              categories={categoryList}
              myUserId={daily.me.me.userId}
              daily={{
                entity: dailyDetail.branch,
                dateControl: (
                  <DailyDatePicker
                    key="admin-branch-daily-picker"
                    value={dailyDetail.date}
                    basePath="/task-manager"
                    extraParams={{ view: "branch", branch }}
                  />
                ),
                showViewToggle: true,
              }}
              monthly={{ entity: monthlyDetail.branch, showViewToggle: true }}
              hodAssigned={hodAssignedDetail ? { entity: hodAssignedDetail.branch, showViewToggle: true } : undefined}
              ceoAssigned={ceoAssignedDetail ? { entity: ceoAssignedDetail.branch, showViewToggle: true } : undefined}
              onComplete={completeTask}
              onSkip={skipTask}
              onReopen={reopenTask}
              onUploadProof={uploadProof}
              onRemoveProof={removeProof}
            />
```

Note this uses `page.tsx`'s OWN server actions (`completeTask`/`skipTask`/`reopenTask`/`uploadProof`/`removeProof` — already defined in this file, confirmed to exist at their current line numbers via grep before editing), NOT `task-manager-view.tsx`'s differently-named props (`completeTaskAction` etc. from Task 10) — `buildEntityOverview()` lives in `page.tsx`, a different component entirely, with direct access to the server actions themselves.

- [ ] **Step 8: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: clean — this is the point where every prop/type mismatch introduced across Tasks 4–11 should finally resolve. Fix any remaining error by tracing it back to the specific Task/Step above that should have addressed it (do not paper over a real mismatch with an `any` cast).

- [ ] **Step 9: Commit**

```bash
git add src/task-manager/ui/task-manager-view.tsx src/app/task-manager/page.tsx
git commit -m "refactor(task-manager): retire personal Daily/Monthly/ceoAssigned/hodAssigned/assignedByMeList/ceoTaskTable sections, subsumed into the stacked-sections redesign"
```

---

### Task 12: Final integration — full verification

**Files:**
- No new file changes; verification only. A temporary live-DB script may be created and deleted within this task.

- [ ] **Step 1: Full test suite**

Run (PowerShell): `npm test`
Expected: all tests pass — this includes `entity-card-grouping.test.ts` (unaffected, verify it still passes since `EntityCardOverview` still imports from it unchanged), `role-views.test.ts` (Task 6's updates), and every other existing suite.

- [ ] **Step 2: Full typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: succeeds — this catches any server/client component boundary issues (e.g. a Server Action passed somewhere a plain function was expected) that `tsc --noEmit` alone might miss.

- [ ] **Step 4: Live-DB smoke test — one role per major branch, via the running dev server**

Restart the dev server with a clean cache first (this session's established fix for stale-manifest issues after code changes):

```bash
rm -rf .next
npm run dev
```

Then, in a browser, log in as (or impersonate, per this project's existing test-account convention) each of the following and confirm the page loads without error and shows the expected sections:

1. **HOD** — `/task-manager`: `myBoard` (Kanban) then `departmentOverview` as a `TaskOverviewStack` with 4 sections (Daily/Monthly/HOD Assigned Task/CEO Assigned Task), own card actionable (try completing one of your own Daily tasks from inside the card grid), other members' cards read-only.
2. **DEPT_MEMBER** (a plain department staff account) — `/task-manager`: `myOverview` renders Daily as the WHOLE department's roster (own card actionable, others read-only, `View: All/Only Me` control present), Monthly as a single self-only card (`View` control absent), no HOD/CEO Assigned Task section.
3. **BRANCH_MEMBER or COACH** — `/task-manager`: `myOverview` renders Daily only (whole branch roster), no Monthly section at all, no HOD/CEO Assigned Task section.
4. **OPS** — `/task-manager`: `myOverview` renders Daily + Monthly (both self-only, single card, no View toggle), `assignerStreams` cards still render below it, no HOD/CEO Assigned Task section.
5. **CEO** — `/task-manager`: `myOverview` renders Daily + Monthly (self-only), `entityDropdowns` below it now shows the full 4-section stack for whichever department/branch is picked; confirm `ceoTaskTable` is gone (no standalone always-visible delegated-out table).
6. **ADMIN or an elevated dept-site account (Operations/Optimisation)** — `/task-manager`: `entityDropdowns` is the whole page, 4 stacked sections for the picked department/branch, everything read-only (no card should ever be actionable — admin/elevated accounts aren't real roster members).
7. **BRANCH_MANAGER** — `/task-manager`: `personalAdhoc` card + `myTasksAdhoc` list render (confirm Ad hoc is completely unaffected — same as before this whole plan), `branchOverview` renders as a 4-section `TaskOverviewStack`.

- [ ] **Step 5: Clean up and final gate**

Confirm `git status --short` shows only the files touched by Tasks 1–11 (no stray temp scripts, no line-ending-only Prisma client churn). Run `npm test` and `npx tsc --noEmit` one final time.

- [ ] **Step 6: Final commit (if Step 4's manual testing surfaced any fixes)**

```bash
git add -A
git commit -m "fix(task-manager): address issues found during stacked-sections manual verification"
```

(Skip this commit if Step 4 found nothing to fix.)
