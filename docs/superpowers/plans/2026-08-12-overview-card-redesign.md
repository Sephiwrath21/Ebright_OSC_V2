# Overview Card Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `EntityOverviewSection` (the click-through donut+roster on Department/Branch Overview) with an always-visible card grid — one card per person (Sort: Person) or one card per Task Category (Sort: Type, with an Uncategorized catch-all) — plus a Filter (Daily/Monthly/HOD Assigned Task), the existing Date filter, and a View All/Only Me toggle.

**Architecture:** Server components pre-fetch three parallel datasets (Daily, Monthly, all-time HOD-Assigned — same pattern `TaskProgressCard` already uses for its own Daily/Monthly client-side toggle) plus the active `TaskCategory` list, and pass them all to one new client component that does the Filter/Sort/Scope switching entirely client-side, no refetch. `analytics/_lib.ts`'s shared task-row shape gains `categoryId`/`categoryName`; `analytics/_payloads.ts`'s entity payload builder is refactored (DRY) into a shared core so the new all-time HOD-Assigned mode reuses the exact same roster/bucket logic as the existing Daily/Monthly one, just with `window: null` and an assigner-role filter instead of a date window.

**Tech Stack:** Next.js Server Components, Prisma ORM, React/TypeScript, Tailwind.

**Depends on:** `docs/superpowers/plans/2026-08-12-task-categories-foundation.md` — this plan reads `RunBlock.categoryId`/`TaskCategory` and calls `listActiveTaskCategories`, both introduced there. **Do not start this plan until that one is merged and its Task 8 live-DB verification passed.**

---

## Context for the engineer

Read `docs/superpowers/specs/2026-08-12-overview-card-redesign-design.md` first — this plan implements that spec. The mockup referenced there (approved layout) is the visual source of truth for the card grid's structure; this plan's JSX below is the production translation of it.

Same conventions as the Task Categories plan: PowerShell for `npm test` on this Windows machine; Prisma-touching data-layer functions in this module have no unit tests (verified live instead) except where noted below (this plan DOES add unit tests for the new pure client-side grouping helpers, since those are DB-free logic — matching the codebase's actual test-what's-pure convention).

---

### Task 1: Add categoryId/categoryName to the shared task row

**Files:**
- Modify: `src/task-manager/analytics/_lib.ts`
- Modify: `src/task-manager/ui/types.ts`

**Note:** there are TWO parallel declarations of this task-row shape in this codebase — `TaskRow`/`DrillTaskRow` (server-internal, `analytics/_lib.ts`) and `FlowTaskRow`/`FlowDrillTask` (client-facing wire type, `ui/types.ts`). Data flows from one to the other unchanged at runtime (`native()` doesn't remap field-by-field) — the two interfaces just have to be kept in sync by hand, the same way Task Categories' plan had to add `categoryId` to both `RunBlock` (schema) and `FlowAssignInput` (client type) separately. Both must be updated here, not just the server side.

- [ ] **Step 1: Add the fields to `PeriodBlock` and select them**

In `src/task-manager/analytics/_lib.ts`, in the `PeriodBlock` interface (around line 574-604), add this field immediately after the existing `guideline: {...} | null;` field:

```typescript
  /** Task Category ("Type", 2026-08-12) — null = Uncategorized. */
  category: { id: string; name: string } | null;
```

In `fetchPeriodBlocks`'s `prisma.runBlock.findMany` call (around line 636+), find the `include`/`select` block that already selects `guideline: {select: {...}}` and add a sibling `category` select immediately after it:

```typescript
      category: { select: { id: true, name: true } },
```

- [ ] **Step 2: Add the fields to `TaskRow` and `toTaskRow`**

In the `TaskRow` interface (around line 480-528), add these fields immediately after the existing `guideline: {...} | null;` field:

```typescript
  /** Task Category ("Type", 2026-08-12) — null = Uncategorized. */
  categoryId: string | null;
  categoryName: string | null;
```

In `toTaskRow` (around line 536-557), add to the returned object, immediately after the existing `guideline: b.guideline ? {...} : null,` line:

```typescript
    categoryId: b.category?.id ?? null,
    categoryName: b.category?.name ?? null,
```

- [ ] **Step 3: Add the fields to the client-facing `FlowTaskRow` type**

In `src/task-manager/ui/types.ts`, in the `FlowTaskRow` interface (around line 42-83), add these fields immediately after the existing `guideline?: {...} | null;` field (around line 60):

```typescript
  /** Task Category ("Type", 2026-08-12) — null = Uncategorized. */
  categoryId: string | null;
  categoryName: string | null;
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Run the existing test suite**

Run (PowerShell): `npm test`
Expected: all passing — `analytics/_lib.test.ts` exercises `toTaskRow`/bucket logic on hand-built fixture blocks; if any fixture object literal there is missing the new `category` field, TypeScript will catch it at Step 4, not at runtime, since `PeriodBlock` is now a required-field superset. Add `category: null` to any such fixture if the typecheck flags one.

- [ ] **Step 6: Commit**

```bash
git add src/task-manager/analytics/_lib.ts src/task-manager/ui/types.ts
git commit -m "feat(task-manager): carry categoryId/categoryName on every task row"
```

---

### Task 2: All-time HOD-Assigned entity payload

**Files:**
- Modify: `src/task-manager/analytics/_payloads.ts`

- [ ] **Step 1: Extract the shared core out of `getEntityPayload`**

In `src/task-manager/analytics/_payloads.ts`, replace the entire existing `getEntityPayload` function (from `export async function getEntityPayload(` through its closing `}` — roughly lines 187 to where the member-sort/return statement ends, read the full function first to capture its exact closing lines before replacing) with:

```typescript
/** Shared core: entity-scoped task list + roster-first member rollups, for
 *  ANY window (a real Daily/Monthly date window, or `null` for all-time —
 *  see getEntityHodAssignedPayload below). `assignerRole`, when given,
 *  further restricts to blocks whose run was started by a user with that
 *  exact role (2026-08-12, powers the "HOD Assigned Task" filter) — applied
 *  AFTER entity-membership scoping, via the same getUsersByIds lookup
 *  pattern getMePayload's delegated sets already use for assigner info. */
async function buildEntityPayload(
  type: "branch" | "department",
  name: string,
  window: PeriodWindow | null,
  opts: { strictWindow?: boolean; assignerRole?: string } = {},
): Promise<EntityPayload> {
  const all = await fetchPeriodBlocks(window, { strictWindow: opts.strictWindow ?? false });
  const users = await getAssigneeMap(all);

  // Scope to this entity via the assignee's branch/department (null → Unassigned).
  let blocks = all.filter((b) => (users.get(b.assigneeId)?.[type] || UNASSIGNED) === name);

  if (opts.assignerRole) {
    const starters = await getUsersByIds(blocks.map((b) => b.run.startedById));
    blocks = blocks.filter((b) => starters.get(b.run.startedById)?.role === opts.assignerRole);
  }

  const tasks: Record<Bucket, DrillTaskRow[]> = { completed: [], pending: [], na: [] };
  for (const b of blocks) {
    tasks[bucketOf(b.status)].push({
      ...toTaskRow(b),
      assigneeName: users.get(b.assigneeId)?.name ?? b.assigneeId,
    });
  }
  tasks.completed = sortTaskRows(tasks.completed);
  tasks.pending = sortTaskRows(tasks.pending);
  tasks.na = sortTaskRows(tasks.na);

  // Member rollups: done = Completed count, notDone = Pending count (NA excluded).
  //
  // ROSTER-FIRST (2026-07-25): seed the map with EVERY real staff member of
  // this entity, zero-filled, then overlay the task tallies. Previously
  // members were derived from the period's task assignees only, so a
  // task-less roster rendered completely empty — invisible while the demo
  // data existed (it always had tasks) but glaring right after the real
  // HRFS import landed 201 people and zero tasks. Site logins
  // (DEPT_SITE/BRANCH_SITE) are view accounts, not people — excluded.
  const roster = await prisma.user.findMany({
    where: {
      ...(type === "branch"
        ? { branch: name === UNASSIGNED ? null : name }
        : { department: name === UNASSIGNED ? null : name }),
      role: { notIn: ["DEPT_SITE", "BRANCH_SITE"] },
    },
  });
  const rosterById = new Map(roster.map((u) => [u.id, u]));
  const byMember = new Map<string, { done: number; notDone: number }>();
  for (const u of roster) byMember.set(u.id, { done: 0, notDone: 0 });
  for (const b of blocks) {
    const tally = byMember.get(b.assigneeId) ?? { done: 0, notDone: 0 };
    const bucket = bucketOf(b.status);
    if (bucket === "completed") tally.done += 1;
    else if (bucket === "pending") tally.notDone += 1;
    byMember.set(b.assigneeId, tally);
  }
  const members = [...byMember.entries()]
    .map(([userId, tally]) => {
      const u = users.get(userId) ?? rosterById.get(userId);
      return {
        userId,
        name: u?.name ?? userId,
        employmentType: u?.employmentType ?? null,
        department: u?.department ?? null,
        branch: u?.branch ?? null,
        // Not emitted on the wire — sort key only (see the sort below).
        _rank: memberSortRank(u?.employmentType, u?.coachSchedule),
        done: tally.done,
        notDone: tally.notDone,
      };
    })
    // Role priority first (HOD → HQ Exec → Full Time → Part Time → Intern;
    // Manager → Branch Exec → FT Coach → PT Coach), then name — the
    // 2026-07-25 roster-ordering decision. memberSortRank in _lib.ts.
    .sort((a, b) => a._rank - b._rank || a.name.localeCompare(b.name))
    .map(({ _rank, ...member }) => member);

  return { totals: countBuckets(blocks), tasks, members };
}

/** Entity detail: per-bucket task lists + member rollups for one branch/
 *  department, for a real Daily/Monthly date window. */
export async function getEntityPayload(
  type: "branch" | "department",
  name: string,
  period: Period,
  date?: string,
  monthDays?: { from: number; to: number },
): Promise<EntityPayload> {
  let window = resolveWindow(period, date);
  if (monthDays) window = clampWindowToMonthDays(window, monthDays.from, monthDays.to);
  // strictWindow: this payload feeds the date-filterable entity overviews —
  // a DAILY-tagged task must belong to the SELECTED day (dueAt, else
  // startedAt), not to every day; see PeriodBlockFilter.strictWindow.
  return buildEntityPayload(type, name, window, { strictWindow: true });
}

/** "HOD Assigned Task" filter mode (2026-08-12): every task in this entity
 *  whose assigner is an HOD, ALL-TIME — same "all-time, no date filter"
 *  convention as the existing "Task Assignment"/delegatedAll view
 *  (getMePayload), not a real Daily/Monthly window. */
export async function getEntityHodAssignedPayload(
  type: "branch" | "department",
  name: string,
): Promise<EntityPayload> {
  return buildEntityPayload(type, name, null, { assignerRole: "HOD" });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors. `getEntityPayload`'s call sites (`data/queries.ts`'s `getDepartmentDetail`/`getBranchDetail`) are unchanged — same signature, same behavior, just refactored internally.

- [ ] **Step 3: Run the existing test suite**

Run (PowerShell): `npm test`
Expected: all passing, no regressions (this is a behavior-preserving refactor for the existing `getEntityPayload` path).

- [ ] **Step 4: Commit**

```bash
git add src/task-manager/analytics/_payloads.ts
git commit -m "refactor(task-manager): extract entity payload core, add all-time HOD-Assigned mode"
```

---

### Task 3: Data-layer wrappers for HOD-Assigned entity detail

**Files:**
- Modify: `src/task-manager/data/queries.ts`

- [ ] **Step 1: Add `getDepartmentHodAssigned`**

In `src/task-manager/data/queries.ts`, import `getEntityHodAssignedPayload` alongside the existing `getEntityPayload` import (same import statement, around line 24-31).

Immediately after the existing `getDepartmentDetail` function (around line 302-322), add:

```typescript
/** "HOD Assigned Task" filter mode for the Overview card redesign
 *  (2026-08-12) — all-time, no period/date param (mirrors
 *  getDepartmentDetail's auth check, different payload source). */
export function getDepartmentHodAssigned(
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
    const payload = await getEntityHodAssignedPayload("department", q.department);
    return { department: { name: q.department, ...payload } };
  }, "getDepartmentHodAssigned");
}
```

- [ ] **Step 2: Add `getBranchHodAssigned`**

Immediately after the existing `getBranchDetail` function (around line 330-350), add:

```typescript
/** "HOD Assigned Task" filter mode for the Overview card redesign
 *  (2026-08-12) — all-time, no period/date param. */
export function getBranchHodAssigned(
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
    const payload = await getEntityHodAssignedPayload("branch", q.branch);
    return { branch: { name: q.branch, ...payload } };
  }, "getBranchHodAssigned");
}
```

`EntityPayload` needs importing from `../analytics/_payloads` (add to this file's existing type-only imports at the top) if not already imported.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/task-manager/data/queries.ts
git commit -m "feat(task-manager): getDepartmentHodAssigned/getBranchHodAssigned data-layer functions"
```

---

### Task 4: Pure grouping helpers (unit-tested)

**Files:**
- Create: `src/task-manager/ui/entity-card-grouping.ts`
- Create: `src/task-manager/ui/entity-card-grouping.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/task-manager/ui/entity-card-grouping.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { groupTasksByPerson, groupTasksByCategory } from "./entity-card-grouping";
import type { FlowDrillTask, FlowMemberRollup } from "./types";

function task(overrides: Partial<FlowDrillTask> = {}): FlowDrillTask {
  return {
    runBlockId: "rb1",
    runId: "r1",
    blockTitle: "Task",
    runName: "Task",
    flowName: "Flow",
    assigneeId: "u1",
    assigneeName: "User One",
    dueAt: null,
    status: "PENDING",
    cadence: "DAILY",
    fromSchedule: false,
    guideline: null,
    assignerId: "a1",
    proofIds: [],
    parentId: null,
    subtaskOrder: null,
    quickCompletable: false,
    categoryId: null,
    categoryName: null,
    ...overrides,
  };
}

function member(overrides: Partial<FlowMemberRollup> = {}): FlowMemberRollup {
  return {
    userId: "u1",
    name: "User One",
    employmentType: null,
    department: null,
    branch: null,
    done: 0,
    notDone: 0,
    ...overrides,
  };
}

describe("groupTasksByPerson", () => {
  it("gives every roster member a card, even with zero tasks", () => {
    const members = [member({ userId: "u1" }), member({ userId: "u2", name: "User Two" })];
    const tasks = [task({ assigneeId: "u1" })];
    const result = groupTasksByPerson(members, tasks);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.userId === "u1")?.tasks).toHaveLength(1);
    expect(result.find((r) => r.userId === "u2")?.tasks).toHaveLength(0);
  });

  it("scopes to one person when onlyMe is given", () => {
    const members = [member({ userId: "u1" }), member({ userId: "u2", name: "User Two" })];
    const tasks = [task({ assigneeId: "u1" }), task({ assigneeId: "u2" })];
    const result = groupTasksByPerson(members, tasks, "u1");
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe("u1");
  });
});

describe("groupTasksByCategory", () => {
  it("gives every active category a card, even with zero tasks, plus an Uncategorized catch-all", () => {
    const categories = [{ id: "c1", name: "Flowghan" }, { id: "c2", name: "CNS" }];
    const tasks = [task({ categoryId: "c1", categoryName: "Flowghan" }), task({ categoryId: null })];
    const result = groupTasksByCategory(categories, tasks);
    expect(result).toHaveLength(3);
    expect(result.find((r) => r.id === "c1")?.tasks).toHaveLength(1);
    expect(result.find((r) => r.id === "c2")?.tasks).toHaveLength(0);
    expect(result.find((r) => r.id === "uncategorized")?.tasks).toHaveLength(1);
  });

  it("always includes the Uncategorized card last, even with nothing uncategorized", () => {
    const categories = [{ id: "c1", name: "Flowghan" }];
    const tasks = [task({ categoryId: "c1", categoryName: "Flowghan" })];
    const result = groupTasksByCategory(categories, tasks);
    expect(result.at(-1)?.id).toBe("uncategorized");
    expect(result.at(-1)?.tasks).toHaveLength(0);
  });

  it("scopes to one person's tasks within each category card when onlyMe is given", () => {
    const categories = [{ id: "c1", name: "Flowghan" }];
    const tasks = [
      task({ categoryId: "c1", categoryName: "Flowghan", assigneeId: "u1" }),
      task({ categoryId: "c1", categoryName: "Flowghan", assigneeId: "u2" }),
    ];
    const result = groupTasksByCategory(categories, tasks, "u1");
    expect(result.find((r) => r.id === "c1")?.tasks).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/task-manager/ui/entity-card-grouping.test.ts`
Expected: FAIL — `entity-card-grouping.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/task-manager/ui/entity-card-grouping.ts`:

```typescript
// Pure grouping logic for the Overview card redesign (2026-08-12) — no
// Prisma, no fetch, just array reshaping, so it's unit-tested directly
// (see entity-card-grouping.test.ts) unlike the Prisma-touching data layer
// elsewhere in this module.
import type { FlowCategoryOption, FlowDrillTask, FlowMemberRollup } from "./types";

export interface PersonCard {
  userId: string;
  name: string;
  tasks: FlowDrillTask[];
}

/** One card per roster member (even zero-task ones), each holding every
 *  task assigned to them across all three status buckets. `onlyMe`
 *  (View All/Only Me, 2026-08-12) — when given, returns just that one
 *  person's card. */
export function groupTasksByPerson(
  members: FlowMemberRollup[],
  tasks: FlowDrillTask[],
  onlyMe?: string,
): PersonCard[] {
  const scopedMembers = onlyMe ? members.filter((m) => m.userId === onlyMe) : members;
  return scopedMembers.map((m) => ({
    userId: m.userId,
    name: m.name,
    tasks: tasks.filter((t) => t.assigneeId === m.userId),
  }));
}

export const UNCATEGORIZED_CARD_ID = "uncategorized";

export interface CategoryCard {
  id: string;
  name: string;
  tasks: FlowDrillTask[];
}

/** One card per active category (even zero-task ones), plus exactly one
 *  trailing "Uncategorized" catch-all card (always present, even when
 *  empty) — every task is visible somewhere, per the confirmed spec.
 *  `onlyMe` scopes each card's task LIST to one person, without hiding
 *  empty-for-them categories (unlike groupTasksByPerson, which drops whole
 *  cards for onlyMe — Type-sort's "Only Me" means "my tasks broken down by
 *  category", not "just my one category"). */
export function groupTasksByCategory(
  categories: FlowCategoryOption[],
  tasks: FlowDrillTask[],
  onlyMe?: string,
): CategoryCard[] {
  const scopedTasks = onlyMe ? tasks.filter((t) => t.assigneeId === onlyMe) : tasks;
  const categoryCards = categories.map((c) => ({
    id: c.id,
    name: c.name,
    tasks: scopedTasks.filter((t) => t.categoryId === c.id),
  }));
  const uncategorized = {
    id: UNCATEGORIZED_CARD_ID,
    name: "Uncategorized",
    tasks: scopedTasks.filter((t) => t.categoryId === null),
  };
  return [...categoryCards, uncategorized];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/task-manager/ui/entity-card-grouping.test.ts`
Expected: PASS, 5/5.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/task-manager/ui/entity-card-grouping.ts src/task-manager/ui/entity-card-grouping.test.ts
git commit -m "feat(task-manager): pure Person/Type grouping helpers for the Overview card grid"
```

---

### Task 5: The card grid UI component

**Files:**
- Create: `src/task-manager/ui/entity-card-overview.tsx`

- [ ] **Step 1: Write the component**

Create `src/task-manager/ui/entity-card-overview.tsx`:

```tsx
"use client";

// Overview page card redesign (2026-08-12) — replaces EntityOverviewSection
// (department-overview.tsx) entirely at both its call sites. Always-visible
// card grid, two switchable layouts (Person/Type), driven by four controls:
// Filter (Daily/Monthly/HOD Assigned Task), Date filter (existing control,
// passed in as headerControl — hidden for HOD Assigned Task since that mode
// is all-time, same convention as the existing "Task Assignment" section),
// Sort (Person/Type), and View All/Only Me. All three Filter datasets are
// pre-fetched server-side (same pattern as TaskProgressCard's own Daily/
// Monthly toggle) — switching Filter/Sort/Scope is pure client state, no
// refetch.
import * as React from "react";
import type { FlowCategoryOption, FlowEntityDetail } from "./types";
import { groupTasksByCategory, groupTasksByPerson, UNCATEGORIZED_CARD_ID } from "./entity-card-grouping";

type FilterMode = "daily" | "monthly" | "hodAssigned";
type SortMode = "person" | "type";

function flattenTasks(entity: FlowEntityDetail) {
  return [...entity.tasks.completed, ...entity.tasks.pending, ...entity.tasks.na];
}

function StatusDot({ status }: { status: string }) {
  if (status === "DONE") {
    return (
      <span className="flex size-3 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-emerald-500">
        ✓
      </span>
    );
  }
  if (status === "SKIPPED") return <span className="size-3 shrink-0 rounded-full bg-amber-400" />;
  return <span className="size-3 shrink-0 rounded-full border-2 border-red-400 bg-white" />;
}

export function EntityCardOverview({
  entityName,
  daily,
  monthly,
  hodAssigned,
  categories,
  myUserId,
  dateControl,
}: {
  entityName: string;
  daily: FlowEntityDetail;
  monthly: FlowEntityDetail;
  hodAssigned: FlowEntityDetail;
  categories: FlowCategoryOption[];
  /** The viewer's own id — drives "Only Me". */
  myUserId: string;
  /** The existing Date filter control (unchanged) — rendered next to
   *  Filter, hidden when filterMode is "hodAssigned" (that mode is
   *  all-time, the date control has nothing to apply to). */
  dateControl?: React.ReactNode;
}) {
  const [filterMode, setFilterMode] = React.useState<FilterMode>("daily");
  const [sortMode, setSortMode] = React.useState<SortMode>("person");
  const [onlyMe, setOnlyMe] = React.useState(false);

  const entity = filterMode === "daily" ? daily : filterMode === "monthly" ? monthly : hodAssigned;
  const tasks = flattenTasks(entity);
  const scopeId = onlyMe ? myUserId : undefined;

  const personCards = sortMode === "person" ? groupTasksByPerson(entity.members, tasks, scopeId) : [];
  const categoryCards = sortMode === "type" ? groupTasksByCategory(categories, tasks, scopeId) : [];

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
        <h2 className="text-lg font-semibold text-gray-900">{entityName} — Overview</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as FilterMode)}
            className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
          >
            <option value="daily">Daily</option>
            <option value="monthly">Monthly</option>
            <option value="hodAssigned">HOD Assigned Task</option>
          </select>
          {filterMode !== "hodAssigned" && dateControl}
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
          >
            <option value="person">Sort: Person</option>
            <option value="type">Sort: Type</option>
          </select>
          <select
            value={onlyMe ? "onlyMe" : "all"}
            onChange={(e) => setOnlyMe(e.target.value === "onlyMe")}
            className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
          >
            <option value="all">View All</option>
            <option value="onlyMe">Only Me</option>
          </select>
        </div>
      </div>

      {sortMode === "person" ? (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
          {personCards.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No one to show.</p>
          ) : (
            personCards.map((card) => (
              <div key={card.userId} className="overflow-hidden rounded-xl border border-gray-200">
                <div className="bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800">{card.name}</div>
                <div className="px-3 py-2">
                  {card.tasks.length === 0 ? (
                    <p className="py-2 text-xs italic text-gray-400">No tasks this period.</p>
                  ) : (
                    card.tasks.map((t) => (
                      <div key={t.runBlockId} className="flex items-center gap-2 border-b border-dashed border-gray-100 py-1.5 text-sm last:border-b-0">
                        <StatusDot status={t.status} />
                        <span className="flex-1 truncate">{t.blockTitle}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
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

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors. `FlowEntityDetail`, `FlowCategoryOption` must already be exported from `./types` (the latter from Task Categories plan's Task 5).

- [ ] **Step 3: Commit**

```bash
git add src/task-manager/ui/entity-card-overview.tsx
git commit -m "feat(task-manager): EntityCardOverview — the Person/Type card grid component"
```

---

### Task 6: Wire it into the page, replacing EntityOverviewSection

**Files:**
- Modify: `src/app/task-manager/page.tsx`
- Modify: `src/task-manager/ui/task-manager-view.tsx`

- [ ] **Step 1: Fetch the three datasets + categories server-side**

In `src/app/task-manager/page.tsx`, import `getDepartmentHodAssigned`, `getBranchHodAssigned`, and `listActiveTaskCategories` alongside the existing data-layer imports.

Find where `daily.department`/`monthly.department`/`daily.branch`/`monthly.branch` are fetched (the `Promise.all([...])` calls feeding `daily`/`monthly` — read the surrounding ~40 lines around the existing `getFlowDetail`/`getDepartmentDetail`/`getBranchDetail` calls to find the exact right spot) and add, fetched in parallel alongside them:

```typescript
      getDepartmentHodAssigned(email, department).catch(() => null),
      getBranchHodAssigned(email, branch).catch(() => null),
      listActiveTaskCategories(email),
```

(`.catch(() => null)` on the two entity-specific fetches: a viewer without department/branch access to that specific entity shouldn't fail the WHOLE page load — same defensive pattern the existing `daily.department`/`daily.branch` fetches already need, since not every role has both. Check how the EXISTING `daily.department`/`daily.branch` promises handle a viewer with no department or no branch before wiring this — mirror that exact pattern rather than introducing a new one; the `.catch(() => null)` above is a starting point, not necessarily the final shape if the existing code does it differently, e.g. via a conditional `department ? getDepartmentDetail(...) : Promise.resolve(null)`.)

Thread the results (`hodAssignedDepartment`, `hodAssignedBranch`, `categoryList`) down to wherever `buildEntityOverview` (or the equivalent function assembling the Department/Branch Overview sections) is defined, the same way `daily`/`monthly` already reach it.

- [ ] **Step 2: Replace `EntityOverviewSection` with `EntityCardOverview` at both call sites**

In `src/task-manager/ui/task-manager-view.tsx`:

Replace the `import { EntityOverviewSection } from "./department-overview";` line with:

```typescript
import { EntityCardOverview } from "./entity-card-overview";
```

Replace the Department Overview block (around line 564-583):

```tsx
      {shows(view, "taskManager", "departmentOverview") &&
        daily.department &&
        monthly.department && (
        <>
          <PageSectionHeading>Department Overview</PageSectionHeading>
          <EntityCardOverview
            entityName={daily.department.name}
            daily={daily.department}
            monthly={monthly.department}
            hodAssigned={hodAssignedDepartment?.department ?? monthly.department}
            categories={categoryList}
            myUserId={daily.me.me.userId}
            dateControl={departmentDailyControl}
          />
        </>
      )}
```

Replace the Branch Overview block (around line 591-607) the same way, substituting `daily.branch`/`monthly.branch`/`hodAssignedBranch?.branch` and `personalDailyControl` for the date control (matching what the OLD code passed as `headerControl` at that call site).

`hodAssigned={hodAssignedDepartment?.department ?? monthly.department}` — the fallback to `monthly.department` (rather than e.g. an empty entity) is deliberate: if the HOD-Assigned fetch failed/was skipped (viewer has no access to that mode for some reason), the "HOD Assigned Task" filter option still renders something sane instead of crashing on `undefined`, even though its content would then be wrong (showing Monthly data under a differently-labeled filter). Flag this as a rough edge for manual QA in Task 7 below rather than silently trusting the fallback is fine — if `hodAssignedDepartment` realistically never fails in practice (most viewers who can see Department Overview at all can also see this), replace the fallback with a genuinely-empty `EntityPayload` shape instead once Task 7's manual QA confirms which case actually occurs.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Run the existing test suite**

Run (PowerShell): `npm test`
Expected: all passing, no regressions.

- [ ] **Step 5: Commit**

```bash
git add src/app/task-manager/page.tsx src/task-manager/ui/task-manager-view.tsx
git commit -m "feat(task-manager): wire EntityCardOverview into Department/Branch Overview"
```

---

### Task 7: Remove the now-dead EntityOverviewSection code

**Files:**
- Modify or Delete: `src/task-manager/ui/department-overview.tsx`

- [ ] **Step 1: Confirm nothing else imports from this file**

Run: `grep -rn "from \"./department-overview\"\|from \"@/task-manager/ui/department-overview\"" src/`
Expected: zero matches after Task 6's edit (the only prior import was the one just replaced in `task-manager-view.tsx`).

If the grep is clean, delete the file entirely:

```bash
rm src/task-manager/ui/department-overview.tsx
```

If it's NOT clean (something else still imports `EntityOverviewSection`, `MemberDetailView`, or a helper from this file), stop and report back rather than deleting — that's a sign this plan's investigation missed a second call site, and deleting would break it.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (confirms nothing else referenced the deleted file).

- [ ] **Step 3: Run the full test suite and build**

Run (PowerShell): `npm test`
Run: `npm run build`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add -A src/task-manager/ui/department-overview.tsx
git commit -m "chore(task-manager): remove EntityOverviewSection, fully replaced by EntityCardOverview"
```

---

### Task 8: Manual verification

- [ ] **Step 1: Visual/functional QA**

With the dev server running, as an HOD or Super Admin account with Department Overview visible:
1. Confirm the card grid renders (Person-sort by default), one card per department member, matching the mockup's layout.
2. Switch Sort to Type — confirm one card per active `TaskCategory` (created in the Task Categories plan's own QA, if still present) plus an "Uncategorized" card holding every task with no category, even if that's all of them (since Task Categories' assign-form change only affects NEWLY created tasks — all pre-existing tasks should land in Uncategorized).
3. Switch Filter to Monthly — confirm the grid updates instantly (no page reload/spinner) to Monthly data.
4. Switch Filter to "HOD Assigned Task" — confirm the Date filter control disappears (all-time mode) and the grid shows only tasks assigned by an HOD; cross-check against the existing "Task Assignment" section's own numbers for the same HOD if one is visible on the page, as a sanity check they're describing consistent underlying data.
5. Toggle View All → Only Me in Person-sort — confirm only your own card remains.
6. Toggle View All → Only Me in Type-sort — confirm every category card stays visible, but each one's table narrows to just your own tasks (including possibly becoming an empty "No tasks this period" card if you have none in that category).
7. Repeat steps 1-6 on Branch Overview (as a Branch Manager or elevated account).
8. Resolve the `hodAssigned` fallback rough edge flagged in Task 6 Step 2 based on what you actually observe here — remove the `?? monthly.department` fallback if `hodAssignedDepartment`/`hodAssignedBranch` never actually come back `null` for the accounts you tested with.

- [ ] **Step 2: Final gate**

Run (PowerShell): `npm test`
Run: `npx tsc --noEmit`
Run: `npm run build`
Expected: all three clean.
