# Home Personal Task Lists (My Week / My Month) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Home's personal Daily/Monthly/third-card stat cards with the real `EntityCardOverview` task-list view `/task-manager`'s `myOverview` already uses, for staff (DEPT_MEMBER/BRANCH_MEMBER/COACH), HOD, and Branch Manager.

**Architecture:** Daily reuses the existing My Week weekday-tab mechanism as-is (new consumer only). Monthly gets a new, parallel "My Month" mechanism — the same tab-sidebar + task-list layout, generalized to the 4 day-range chunks (1-7/8-14/15-21/22-{end}) `MonthRangeDropdown` already computes. The third card per role (HOD/CEO Assigned, Ad hoc) becomes a real task list fed by data Home already fetches, day-windowed by the exact filter logic already in production (`streamCard`), just rendered differently.

**Tech Stack:** Next.js App Router (Server Components), TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-15-home-personal-task-lists-design.md`

---

## File Structure

- **Modify** `src/task-manager/ui/types.ts` — export `toSelfEntityDetail` (extracted from `task-manager/page.tsx`, currently private there).
- **Modify** `src/app/task-manager/page.tsx` — remove its private `toSelfEntityDetail`, import the shared one instead.
- **Modify** `src/task-manager/ui/entity-picker.tsx` — export `monthDayChunks` and `chunkLabel` (currently private).
- **Modify** `src/task-manager/data/queries.ts` — add `monthDays` to `getFlowOverview`'s options.
- **Modify** `src/task-manager/ui/entity-card-overview.tsx` — add `MyMonthChunk`/`MyMonthConfig` types, `myMonth` prop, and its render block (mirrors the existing `myWeek` block).
- **Modify** `src/task-manager/ui/task-overview-stack.tsx` — thread a new `myMonth?: MyMonthConfig` field through `SectionData` to `EntityCardOverview`.
- **Modify** `src/app/home/scoped-overview-section.tsx` — the main rewire: shared personal-data fetch (My Week/My Month/third-card entities), then HOD/Branch Manager/staff branches switched from `StatusOverviewCard` to `TaskOverviewStack`. `personalPair` and `streamCard` are deleted (fully replaced).
- **Modify** `src/app/home/page.tsx` — thread a new `?padate=` param (Branch Manager's Ad hoc day anchor).

---

### Task 1: Extract `toSelfEntityDetail` into `types.ts`

**Files:**
- Modify: `src/task-manager/ui/types.ts`
- Modify: `src/app/task-manager/page.tsx`

- [ ] **Step 1: Add the exported function to `types.ts`**

Add this right after `flowBucketize` (search for `export function flowBucketize`):

```ts
/** Wraps the viewer's own totals/tasks into a synthetic one-member
 *  FlowEntityDetail, for roles/sections with no owned department or
 *  branch entity (OPS, CEO, every self-scoped Monthly section, and
 *  Home's personal Daily/Monthly/third-card sections). `done`/`notDone`
 *  on the synthetic member are unused placeholders — no current consumer
 *  (groupTasksByPerson, entity-card-overview.tsx) reads a single-member
 *  roster's per-member counts; `totals` above is what drives the card. */
export function toSelfEntityDetail(
  me: { userId: string; name: string },
  personal: { totals: FlowBucketTotals; tasks: FlowDrillTask[] },
): FlowEntityDetail {
  return {
    name: me.name,
    totals: personal.totals,
    tasks: flowBucketize(personal.tasks),
    members: [
      { userId: me.userId, name: me.name, employmentType: null, department: null, branch: null, done: 0, notDone: 0 },
    ],
  };
}
```

- [ ] **Step 2: Remove the private copy from `page.tsx` and import the shared one**

In `src/app/task-manager/page.tsx`, find and delete this whole function (search for `function toSelfEntityDetail`):

```ts
  function toSelfEntityDetail(
    me: { userId: string; name: string },
    personal: { totals: FlowBucketTotals; tasks: FlowDrillTask[] },
  ): FlowEntityDetail {
    return {
      name: me.name,
      totals: personal.totals,
      tasks: flowBucketize(personal.tasks),
      members: [
        { userId: me.userId, name: me.name, employmentType: null, department: null, branch: null, done: 0, notDone: 0 },
      ],
    };
  }
```

Add `toSelfEntityDetail` to the existing `@/task-manager/ui/types` import list in this file (it already imports `flowBucketize` and several types from there — just add the new name to that same import statement).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: only the 3 known pre-existing baseline errors (`src/app/api/branch/dashboard/route.ts` ×2, `src/app/components/ClickUpPieChart.tsx` ×1) — no new errors. If `page.tsx` still references `FlowBucketTotals`/`FlowDrillTask`/`FlowEntityDetail` types elsewhere (it does, for other things), leave those imports alone — only remove the function body and add `toSelfEntityDetail` to the import list.

- [ ] **Step 4: Run the existing test suite**

Run: `npx vitest run`
Expected: same baseline as before this change (340 passing, 1 known pre-existing unrelated failure — `src/app/components/Sidebar.test.ts`). This is a pure refactor (identical function body, moved not changed), so nothing should shift.

- [ ] **Step 5: Commit**

```bash
git add src/task-manager/ui/types.ts src/app/task-manager/page.tsx
git commit -m "refactor(task-manager): extract toSelfEntityDetail into types.ts"
```

---

### Task 2: Export `monthDayChunks` and `chunkLabel` from `entity-picker.tsx`

**Files:**
- Modify: `src/task-manager/ui/entity-picker.tsx`

- [ ] **Step 1: Add `export` to both**

Find (search for `function monthDayChunks`):

```ts
function monthDayChunks(year: number, month: number): { from: number; to: number }[] {
```

Change to:

```ts
export function monthDayChunks(year: number, month: number): { from: number; to: number }[] {
```

Find (search for `const chunkLabel`):

```ts
const chunkLabel = (c: { from: number; to: number }) =>
  c.from === c.to ? `${c.from}` : `${c.from}–${c.to}`;
```

Change to:

```ts
export const chunkLabel = (c: { from: number; to: number }) =>
  c.from === c.to ? `${c.from}` : `${c.from}–${c.to}`;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: only the 3 known pre-existing baseline errors.

- [ ] **Step 3: Commit**

```bash
git add src/task-manager/ui/entity-picker.tsx
git commit -m "refactor(task-manager): export monthDayChunks/chunkLabel for reuse"
```

---

### Task 3: Extend `getFlowOverview` with `monthDays`

**Files:**
- Modify: `src/task-manager/data/queries.ts`

- [ ] **Step 1: Add the option**

Find (search for `export function getFlowOverview`):

```ts
export function getFlowOverview(
  email: string,
  period: FlowPeriod,
  date?: string,
  opts?: { strictWindow?: boolean },
): Promise<FlowOverviewResponse> {
  return native(async () => {
    const q = analyticsQuerySchema.parse({ period, ...(date ? { date } : {}) });
    const user = await requireUserByEmail(email);
    const payload = await getMePayload(user, q.period, q.date, { strictWindow: opts?.strictWindow });
    return { period: q.period, date: resolvedDate(q.date), ...payload } as FlowOverviewResponse;
  }, "getFlowOverview");
}
```

Change to:

```ts
export function getFlowOverview(
  email: string,
  period: FlowPeriod,
  date?: string,
  opts?: {
    strictWindow?: boolean;
    /** Clamp a MONTHLY window to these days of the anchor month (e.g.
     *  {from:1,to:7}) — same option getFlowDetail already exposes,
     *  threaded through here too for Home's "My Month" tab fetches
     *  (2026-08-15). Ignored when period is "daily". */
    monthDays?: { from: number; to: number };
  },
): Promise<FlowOverviewResponse> {
  return native(async () => {
    const q = analyticsQuerySchema.parse({ period, ...(date ? { date } : {}) });
    const user = await requireUserByEmail(email);
    const payload = await getMePayload(user, q.period, q.date, {
      strictWindow: opts?.strictWindow,
      monthDays: opts?.monthDays,
    });
    return { period: q.period, date: resolvedDate(q.date), ...payload } as FlowOverviewResponse;
  }, "getFlowOverview");
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: only the 3 known pre-existing baseline errors. `getMePayload` already accepts `monthDays` in its `opts` type (`{ strictWindow?: boolean; monthDays?: { from: number; to: number } }`), so this should compile without any other change.

- [ ] **Step 3: Run the existing test suite**

Run: `npx vitest run`
Expected: same baseline as before (340 passing, 1 known pre-existing unrelated failure). This is a strictly additive, optional param — every existing caller that omits `monthDays` behaves identically to before.

- [ ] **Step 4: Commit**

```bash
git add src/task-manager/data/queries.ts
git commit -m "feat(task-manager): thread monthDays through getFlowOverview"
```

---

### Task 4: Add `MyMonthConfig`/`myMonth` to `EntityCardOverview`

**Files:**
- Modify: `src/task-manager/ui/entity-card-overview.tsx`

- [ ] **Step 1: Add the types**

Find (search for `export interface MyWeekConfig`):

```ts
export interface MyWeekConfig {
  days: MyWeekDay[];
  selectedDate: string;
  nav: { basePath: string; extraParams?: Record<string, string> };
}
```

Add right after it:

```ts
/** One day-range chunk's worth of the viewer's own tasks (2026-08-15,
 *  Home's "My Month" tab view — the Monthly sibling of MyWeekDay/myWeek
 *  above). */
export interface MyMonthChunk {
  label: string; // "1–7" / "22–31" etc — entity-picker.tsx's chunkLabel
  range: string; // "1-7" — the ?mrange= value this chunk represents
  tasks: FlowTaskRow[];
}

/** EntityCardOverview's `myMonth` prop shape — same idea as MyWeekConfig,
 *  generalized from weekdays to the 4 day-range chunks MonthRangeDropdown
 *  already offers (Full month itself has no tab — same "no combined tab"
 *  precedent myWeek already sets for the whole week). Exported for the
 *  same reason MyWeekConfig is: one shared shape for every caller. */
export interface MyMonthConfig {
  chunks: MyMonthChunk[];
  selectedRange: string; // current ?mrange= value, e.g. "1-7"
  nav: { basePath: string; extraParams?: Record<string, string> };
}
```

- [ ] **Step 2: Add the `myMonth` prop**

Find (search for `myWeek?: MyWeekConfig;` — it's the last field before the closing `}) {` of the props type):

```ts
  myWeek?: MyWeekConfig;
}) {
```

Change to:

```ts
  myWeek?: MyWeekConfig;
  /** Month-range-chunk tab view for the viewer's OWN card (2026-08-15) —
   *  Monthly section only, Home's "My Month" (the Monthly sibling of
   *  `myWeek` above — same "own card, alone on screen" gate, same
   *  two-way sync with the section's own dateControl, just tabbed by day-
   *  range chunk instead of weekday). `/task-manager` never sets this —
   *  its own Monthly section keeps the dropdown-based range picker,
   *  unchanged (2026-08-15 product decision: My Month is Home-only for
   *  now). */
  myMonth?: MyMonthConfig;
}) {
```

- [ ] **Step 3: Add the render logic**

Find (search for `const selectedMyWeekDay = myWeek?.days.find`):

```ts
  const selectedMyWeekDay = myWeek?.days.find((d) => d.date === myWeek.selectedDate) ?? myWeek?.days[0];
  const selectMyWeekDate = (date: string) => {
    if (!myWeek) return;
    const qs = new URLSearchParams({ ...myWeek.nav.extraParams, date });
    router.push(`${myWeek.nav.basePath}?${qs.toString()}`);
  };
```

Add right after it:

```ts
  const selectedMyMonthChunk =
    myMonth?.chunks.find((c) => c.range === myMonth.selectedRange) ?? myMonth?.chunks[0];
  const selectMyMonthRange = (range: string) => {
    if (!myMonth) return;
    const qs = new URLSearchParams({ ...myMonth.nav.extraParams, mrange: range });
    router.push(`${myMonth.nav.basePath}?${qs.toString()}`);
  };
```

- [ ] **Step 4: Render the tab view**

Find the `showMyWeek` block (search for `const showMyWeek = isOwnCard`):

```ts
              const showMyWeek = isOwnCard && Boolean(myWeek) && personCards.length === 1;
```

Add right after it:

```ts
              const showMyMonth = isOwnCard && Boolean(myMonth) && personCards.length === 1;
```

Find the closing of the `showMyWeek` conditional block — the `{showMyWeek && myWeek ? (...) : (` line and its matching `)}` — this is the block that renders `role="tablist"` + `ResizableTaskList`. Read `src/task-manager/ui/entity-card-overview.tsx` around that block first (search for `{showMyWeek && myWeek ? (`) to see the exact current structure, then change:

```tsx
                  {showMyWeek && myWeek ? (
                    <div className="flex gap-3 p-3">
                      <div role="tablist" className="w-32 shrink-0 space-y-0.5">
                        {myWeek.days.map((d) => {
                          const pendingCount = d.tasks.filter(
                            (t) => t.status !== "DONE" && t.status !== "SKIPPED",
                          ).length;
                          const active = d.date === myWeek.selectedDate;
                          return (
                            <button
                              key={d.date}
                              type="button"
                              role="tab"
                              aria-selected={active}
                              onClick={() => selectMyWeekDate(d.date)}
                              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-medium ${
                                active ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-50"
                              }`}
                            >
                              <span>{d.weekday}</span>
                              <span
                                className={active ? "text-blue-100" : "text-gray-400"}
                                aria-label={`${pendingCount} pending`}
                              >
                                {pendingCount}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="min-w-0 flex-1">
                        {selectedMyWeekDay && (
                          <ResizableTaskList
                            key={selectedMyWeekDay.date}
                            tasks={selectedMyWeekDay.tasks}
                            myUserId={myUserId}
                            onComplete={onComplete}
                            onSkip={onSkip}
                            onReopen={onReopen}
                            onUploadProof={onUploadProof}
                            onRemoveProof={onRemoveProof}
                            emptyLabel={`No tasks for ${selectedMyWeekDay.weekday}.`}
                            hideCompleted
                            hideAssignee
                            blankDueDate
                            reassign={reassign}
                          />
                        )}
                      </div>
                    </div>
                  ) : (
```

to (adding the `showMyMonth` branch as a second case, keeping the existing `showMyWeek` case and the final `else` untouched):

```tsx
                  {showMyWeek && myWeek ? (
                    <div className="flex gap-3 p-3">
                      <div role="tablist" className="w-32 shrink-0 space-y-0.5">
                        {myWeek.days.map((d) => {
                          const pendingCount = d.tasks.filter(
                            (t) => t.status !== "DONE" && t.status !== "SKIPPED",
                          ).length;
                          const active = d.date === myWeek.selectedDate;
                          return (
                            <button
                              key={d.date}
                              type="button"
                              role="tab"
                              aria-selected={active}
                              onClick={() => selectMyWeekDate(d.date)}
                              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-medium ${
                                active ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-50"
                              }`}
                            >
                              <span>{d.weekday}</span>
                              <span
                                className={active ? "text-blue-100" : "text-gray-400"}
                                aria-label={`${pendingCount} pending`}
                              >
                                {pendingCount}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="min-w-0 flex-1">
                        {selectedMyWeekDay && (
                          <ResizableTaskList
                            key={selectedMyWeekDay.date}
                            tasks={selectedMyWeekDay.tasks}
                            myUserId={myUserId}
                            onComplete={onComplete}
                            onSkip={onSkip}
                            onReopen={onReopen}
                            onUploadProof={onUploadProof}
                            onRemoveProof={onRemoveProof}
                            emptyLabel={`No tasks for ${selectedMyWeekDay.weekday}.`}
                            hideCompleted
                            hideAssignee
                            blankDueDate
                            reassign={reassign}
                          />
                        )}
                      </div>
                    </div>
                  ) : showMyMonth && myMonth ? (
                    <div className="flex gap-3 p-3">
                      <div role="tablist" className="w-32 shrink-0 space-y-0.5">
                        {myMonth.chunks.map((c) => {
                          const pendingCount = c.tasks.filter(
                            (t) => t.status !== "DONE" && t.status !== "SKIPPED",
                          ).length;
                          const active = c.range === myMonth.selectedRange;
                          return (
                            <button
                              key={c.range}
                              type="button"
                              role="tab"
                              aria-selected={active}
                              onClick={() => selectMyMonthRange(c.range)}
                              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-medium ${
                                active ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-50"
                              }`}
                            >
                              <span>{c.label}</span>
                              <span
                                className={active ? "text-blue-100" : "text-gray-400"}
                                aria-label={`${pendingCount} pending`}
                              >
                                {pendingCount}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="min-w-0 flex-1">
                        {selectedMyMonthChunk && (
                          <ResizableTaskList
                            key={selectedMyMonthChunk.range}
                            tasks={selectedMyMonthChunk.tasks}
                            myUserId={myUserId}
                            onComplete={onComplete}
                            onSkip={onSkip}
                            onReopen={onReopen}
                            onUploadProof={onUploadProof}
                            onRemoveProof={onRemoveProof}
                            emptyLabel={`No tasks for ${selectedMyMonthChunk.label}.`}
                            hideCompleted
                            hideAssignee
                            blankDueDate
                            reassign={reassign}
                          />
                        )}
                      </div>
                    </div>
                  ) : (
```

(Everything else in the file — the final `else` branch's plain task list, Type-sort mode, etc. — is untouched; only insert the new `showMyMonth` branch between the existing `showMyWeek` branch and the existing `else`.)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: only the 3 known pre-existing baseline errors. `FlowTaskRow` is already imported in this file (used by `MyWeekDay`) — `MyMonthChunk` reuses that same import, no new import needed.

- [ ] **Step 6: Run the existing test suite**

Run: `npx vitest run`
Expected: same baseline as before (340 passing, 1 known pre-existing unrelated failure). `myMonth` is a new optional prop, unset by every existing caller — `showMyMonth` is always `false` for them, so the new branch never executes for any current usage.

- [ ] **Step 7: Commit**

```bash
git add src/task-manager/ui/entity-card-overview.tsx
git commit -m "feat(task-manager): add myMonth tab view to EntityCardOverview"
```

---

### Task 5: Thread `myMonth` through `TaskOverviewStack`

**Files:**
- Modify: `src/task-manager/ui/task-overview-stack.tsx`

- [ ] **Step 1: Read the current file**

Read `src/task-manager/ui/task-overview-stack.tsx` in full first — it's short (under 100 lines).

- [ ] **Step 2: Add `myMonth` to `SectionData` and import `MyMonthConfig`**

Change:

```ts
import type { FlowCategoryOption, FlowEntityDetail } from "./types";
import { EntityCardOverview, type MyWeekConfig } from "./entity-card-overview";
import type { ReassignControl } from "./bits";

interface SectionData {
  entity: FlowEntityDetail;
  dateControl?: React.ReactNode;
  showViewToggle: boolean;
  /** Initial View-toggle state when showViewToggle is true (2026-08-15) —
   *  see EntityCardOverview's own doc comment. */
  defaultOnlyMe?: boolean;
  /** Weekday-tab view for the own card (2026-08-15) — see
   *  EntityCardOverview's own `myWeek` prop doc comment. Only ever set on
   *  the "daily" SectionData; Monthly/HOD/CEO Assigned have no per-weekday
   *  concept, so callers never build this for those. */
  myWeek?: MyWeekConfig;
}
```

to:

```ts
import type { FlowCategoryOption, FlowEntityDetail } from "./types";
import { EntityCardOverview, type MyMonthConfig, type MyWeekConfig } from "./entity-card-overview";
import type { ReassignControl } from "./bits";

interface SectionData {
  entity: FlowEntityDetail;
  dateControl?: React.ReactNode;
  showViewToggle: boolean;
  /** Initial View-toggle state when showViewToggle is true (2026-08-15) —
   *  see EntityCardOverview's own doc comment. */
  defaultOnlyMe?: boolean;
  /** Weekday-tab view for the own card (2026-08-15) — see
   *  EntityCardOverview's own `myWeek` prop doc comment. Only ever set on
   *  the "daily" SectionData; Monthly/HOD/CEO Assigned have no per-weekday
   *  concept, so callers never build this for those. */
  myWeek?: MyWeekConfig;
  /** Month-range-chunk tab view for the own card (2026-08-15, Home only) —
   *  see EntityCardOverview's own `myMonth` prop doc comment. Only ever
   *  set on the "monthly" SectionData. */
  myMonth?: MyMonthConfig;
}
```

- [ ] **Step 3: Pass it through to `EntityCardOverview`**

Find the `<EntityCardOverview ... myWeek={data.myWeek} ... />` call and add `myMonth={data.myMonth}` right after `myWeek={data.myWeek}`:

```tsx
            <EntityCardOverview
              key={key}
              sectionLabel={label}
              entityName={entityName}
              entity={data.entity}
              categories={categories}
              myUserId={myUserId}
              dateControl={data.dateControl}
              showViewToggle={data.showViewToggle}
              defaultOnlyMe={data.defaultOnlyMe}
              myWeek={data.myWeek}
              myMonth={data.myMonth}
              onComplete={onComplete}
              onSkip={onSkip}
              onReopen={onReopen}
              onUploadProof={onUploadProof}
              onRemoveProof={onRemoveProof}
              reassign={reassign}
            />
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: only the 3 known pre-existing baseline errors.

- [ ] **Step 5: Run the existing test suite**

Run: `npx vitest run`
Expected: same baseline as before (340 passing, 1 known pre-existing unrelated failure).

- [ ] **Step 6: Commit**

```bash
git add src/task-manager/ui/task-overview-stack.tsx
git commit -m "feat(task-manager): thread myMonth through TaskOverviewStack"
```

---

### Task 6: Wire HOD's Daily/Monthly/CEO Assigned as task lists

**Files:**
- Modify: `src/app/home/scoped-overview-section.tsx`

- [ ] **Step 1: Read the current file in full**

Read `src/app/home/scoped-overview-section.tsx` fully first — it's been through many edits this session, so match by the actual text shown below, not by line number.

- [ ] **Step 2: Add new imports**

Add `getFlowOverview` to the existing `@/task-manager/data` import:

```ts
import {
  getBranchDetail,
  getCeoDashboardConfig,
  getDepartmentDetail,
  getFlowDetail,
  getFlowOverview,
  listActiveTaskCategories,
  saveCeoDashboardConfig,
  FlowBridgeError,
} from "@/task-manager/data";
```

Add `thisWeekDatesForRange`/`weekdayRangeOf` to the existing `@/task-manager/role-views` import:

```ts
import { resolveViewRole, shows, thisWeekDatesForRange, weekdayRangeOf } from "@/task-manager/role-views";
```

Add `monthDayChunks`/`chunkLabel` to the existing `@/task-manager/ui/entity-picker` import:

```ts
import {
  DailyDatePicker,
  MonthDropdown,
  MonthRangeDropdown,
  chunkLabel,
  monthDayChunks,
} from "@/task-manager/ui/entity-picker";
```

Add a new import for `TaskOverviewStack` and the `MyMonthConfig`/`MyWeekConfig` types:

```ts
import { TaskOverviewStack } from "@/task-manager/ui/task-overview-stack";
import type { MyMonthConfig, MyWeekConfig } from "@/task-manager/ui/entity-card-overview";
```

Add `toSelfEntityDetail` and `FlowCategoryOption`/`FlowEntityDetail` to the existing `@/task-manager/ui/types` import:

```ts
import {
  flowBucketize,
  flowStreamLabel,
  toSelfEntityDetail,
  visibleAssignerStreams,
  FLOW_DEPARTMENTS,
  type FlowCategoryOption,
  type FlowEntityDetail,
} from "@/task-manager/ui/types";
```

- [ ] **Step 3: Replace `streamCard` and `personalPair` with the shared personal-data block**

Find this whole region (from the `// "Assignee only" rule` comment through the end of the `personalPair` const — search for `const streamCard = (` and `const personalPair = (` to locate it):

```tsx
    // "Assignee only" rule: the viewer's own userId + the complete/N-A/
    // reopen actions make their own tasks' status circles live in the drill
    // modal, same as /task-manager. Aggregate dept/branch cards never get
    // these.
    const completeProps = actions && {
      myUserId: daily.me.me.userId,
      onComplete: actions.complete,
      onSkip: actions.skip,
      onReopen: actions.reopen,
      onUploadProof: actions.uploadProof,
      onRemoveProof: actions.removeProof,
    };

    // Assigner-stream card ("HOD assigned tasks" for staff, "CEO assigned
    // tasks" for HODs) — ALWAYS rendered for its role (zero-filled when the
    // stream doesn't exist yet; streamsAll only carries streams that HAVE
    // tasks). Day-windowed by its OWN date param (default today) on each
    // task's due date — cadence-agnostic, so daily- AND monthly-cadence
    // assignments due that day both count; tasks with no due date at all
    // match no specific day.
    const streamCard = (
      streamKey: "HOD" | "CEO",
      rawAnchor: string | undefined,
      param: string,
      subtitle?: string,
    ) => {
      const anchor = rawAnchor ?? formatLocalDate(new Date());
      const win = resolveWindow("daily", anchor);
      const stream = daily.me.streamsAll.find((s) => s.key === streamKey);
      const buckets = flowBucketize(
        (stream?.tasks ?? []).filter((t) => {
          if (!t.dueAt) return false;
          const due = new Date(t.dueAt);
          return due >= win.start && due < win.end;
        }),
      );
      return (
        <StatusOverviewCard
          key={`stream-${streamKey}`}
          title={flowStreamLabel(streamKey)}
          subtitle={subtitle}
          totals={{
            completed: buckets.completed.length,
            pending: buckets.pending.length,
            na: buckets.na.length,
          }}
          tasks={buckets}
          action={
            <DailyDatePicker
              key={`home-${param}-picker`}
              value={anchor}
              basePath="/home"
              param={param}
              extraParams={carry(param)}
            />
          }
          actionPlacement="row"
          hideChart
          {...completeProps}
        />
      );
    };

    // Personal Daily/Monthly cards (clickable, no subtitle) — shared by
    // every view whose config lists them. Which cards render is decided
    // ENTIRELY by role-views.ts (e.g. BRANCH_MEMBER = Daily only).
    const personalPair = (
      <>
        {shows(view, "home", "personalDaily") && (
          <StatusOverviewCard
            key="personal-daily"
            title="Daily"
            totals={daily.me.totals}
            tasks={flowBucketize(daily.me.tasks)}
            action={dailyPicker}
            actionPlacement="row"
            hideChart
            {...completeProps}
          />
        )}
        {shows(view, "home", "personalMonthly") && (
          <StatusOverviewCard
            key="personal-monthly"
            title="Monthly"
            totals={monthly.me.totals}
            tasks={flowBucketize(monthly.me.tasks)}
            action={monthlyPicker}
            actionPlacement="row"
            hideChart
            {...completeProps}
          />
        )}
      </>
    );
```

with:

```tsx
    // "Assignee only" rule: the viewer's own userId + the complete/N-A/
    // reopen actions make their own tasks' status circles live in the drill
    // modal, same as /task-manager. Aggregate dept/branch cards never get
    // these.
    const completeProps = actions && {
      myUserId: daily.me.me.userId,
      onComplete: actions.complete,
      onSkip: actions.skip,
      onReopen: actions.reopen,
      onUploadProof: actions.uploadProof,
      onRemoveProof: actions.removeProof,
    };

    // Personal task-list data (2026-08-15 — My Week/My Month, ported from
    // /task-manager's myOverview): the 5 roles with personalDaily
    // (HOD/BRANCH_MANAGER/DEPT_MEMBER/BRANCH_MEMBER/COACH) all need this;
    // every other role skips it entirely (one cheap boolean check). Daily
    // and Monthly are self-only here (2026-08-15 confirmed decision) —
    // unlike /task-manager's own DEPT_MEMBER Daily, which shows the whole
    // department roster; Home stays "only my task" for every role.
    const isPersonalRole = shows(view, "home", "personalDaily");
    const hasPersonalMonthly = shows(view, "home", "personalMonthly");
    let categories: FlowCategoryOption[] = [];
    let personalDailyEntity: FlowEntityDetail | undefined;
    let personalMonthlyEntity: FlowEntityDetail | undefined;
    let personalMyWeek: MyWeekConfig | undefined;
    let personalMyMonth: MyMonthConfig | undefined;
    if (isPersonalRole) {
      categories = await listActiveTaskCategories(email).catch(() => []);
      personalDailyEntity = toSelfEntityDetail(daily.me.me, daily.me);

      const [dY, dM, dD] = daily.date.split("-").map(Number);
      const myWeekDates = thisWeekDatesForRange(weekdayRangeOf(view), new Date(dY, dM - 1, dD));
      const myWeekResults = await Promise.all(
        myWeekDates.map((d) => getFlowOverview(email, "daily", d.date, { strictWindow: true })),
      );
      const myWeekResultByDate = new Map(myWeekResults.map((r) => [r.date, r]));
      personalMyWeek = {
        days: myWeekDates.map((d) => ({
          weekday: d.weekday,
          date: d.date,
          tasks: myWeekResultByDate.get(d.date)?.tasks ?? [],
        })),
        selectedDate: daily.date,
        nav: { basePath: "/home", extraParams: dateExtraParams("date") },
      };

      if (hasPersonalMonthly) {
        personalMonthlyEntity = toSelfEntityDetail(monthly.me.me, monthly.me);
        const [mY, mM] = monthly.date.split("-").map(Number);
        const monthChunks = monthDayChunks(mY, mM);
        const myMonthResults = await Promise.all(
          monthChunks.map((c) =>
            getFlowOverview(email, "monthly", monthly.date, { monthDays: c, strictWindow: true }),
          ),
        );
        personalMyMonth = {
          chunks: monthChunks.map((c, i) => ({
            label: chunkLabel(c),
            range: `${c.from}-${c.to}`,
            tasks: myMonthResults[i].tasks,
          })),
          selectedRange: monthlyRangeParam || `${monthChunks[0].from}-${monthChunks[0].to}`,
          nav: { basePath: "/home", extraParams: dateExtraParams("mdate", "mrange") },
        };
      }
    }

    // Day-windowed third-card entity (HOD/CEO Assigned Task) — the SAME
    // dueAt-window filter Home has always used for these (previously fed a
    // StatusOverviewCard's bucket counts directly; now wraps the filtered
    // list via toSelfEntityDetail for a real EntityCardOverview list
    // instead). Day-windowed by its OWN date param (default today) on each
    // task's due date — cadence-agnostic, so daily- AND monthly-cadence
    // assignments due that day both count; tasks with no due date at all
    // match no specific day.
    const personalStreamEntity = (streamKey: "HOD" | "CEO", rawAnchor: string | undefined, param: string) => {
      const anchor = rawAnchor ?? formatLocalDate(new Date());
      const win = resolveWindow("daily", anchor);
      const stream = daily.me.streamsAll.find((s) => s.key === streamKey);
      const filtered = (stream?.tasks ?? []).filter((t) => {
        if (!t.dueAt) return false;
        const due = new Date(t.dueAt);
        return due >= win.start && due < win.end;
      });
      const buckets = flowBucketize(filtered);
      return {
        entity: toSelfEntityDetail(daily.me.me, {
          totals: { completed: buckets.completed.length, pending: buckets.pending.length, na: buckets.na.length },
          tasks: filtered,
        }),
        dateControl: (
          <DailyDatePicker
            key={`home-${param}-picker`}
            value={anchor}
            basePath="/home"
            param={param}
            extraParams={carry(param)}
          />
        ),
      };
    };

    // Branch Manager's Ad hoc (2026-08-15) — the SAME treatment as
    // personalStreamEntity above, applied to daily.me.adhocAll instead of
    // a streamsAll entry, day-windowed by a NEW ?padate= param (Ad hoc
    // never had a date filter before this).
    const personalAdhocEntity = (rawAnchor: string | undefined) => {
      const anchor = rawAnchor ?? formatLocalDate(new Date());
      const win = resolveWindow("daily", anchor);
      const filtered = (daily.me.adhocAll?.tasks ?? []).filter((t) => {
        if (!t.dueAt) return false;
        const due = new Date(t.dueAt);
        return due >= win.start && due < win.end;
      });
      const buckets = flowBucketize(filtered);
      return {
        entity: toSelfEntityDetail(daily.me.me, {
          totals: { completed: buckets.completed.length, pending: buckets.pending.length, na: buckets.na.length },
          tasks: filtered,
        }),
        dateControl: (
          <DailyDatePicker
            key="home-padate-picker"
            value={anchor}
            basePath="/home"
            param="padate"
            extraParams={carry("padate")}
          />
        ),
      };
    };
```

**Note:** this deletes `personalPair` entirely. If your editor/search shows any remaining usage of `{personalPair}` anywhere else in this file after this step, that's expected — Steps 4-6 below (and Task 7) replace each of those usages. Don't leave any `{personalPair}` reference unreplaced when you're done with this whole task.

- [ ] **Step 4: Add a new `padate` param to the function signature**

Find:

```ts
  hodDate,
  ceoDate,
  expand,
  department,
  actions,
}: {
```

Change to:

```ts
  hodDate,
  ceoDate,
  expand,
  department,
  padate,
  actions,
}: {
```

Find the doc comment block right after `department?: string;` and add `padate` after it:

```ts
  department?: string;
  /** Branch Manager's Ad hoc day anchor (?padate=, 2026-08-15) — mirrors
   *  ?hdate=/?cdate= exactly (YYYY-MM-DD, defaults to today, independent
   *  of every other filter). Ad hoc had no date filter before this. */
  padate?: string;
```

- [ ] **Step 5: Wire HOD's branch**

Find (search for `if (shows(view, "home", "personalDaily")) {` — it's the FIRST occurrence, inside the `if (daily.department && monthly.department)` block):

```tsx
      if (shows(view, "home", "personalDaily")) {
        return (
          <div className="flex flex-col gap-5">
            {grid(
              <>
                {personalPair}
                {shows(view, "home", "ceoAssigned") && streamCard("CEO", ceoDate, "cdate")}
              </>,
            )}
            <PageSectionHeading>Department Overview</PageSectionHeading>
            {grid(deptPair)}
          </div>
        );
      }
      return grid(deptPair);
```

with:

```tsx
      if (shows(view, "home", "personalDaily")) {
        const ceoAssigned = shows(view, "home", "ceoAssigned")
          ? personalStreamEntity("CEO", ceoDate, "cdate")
          : undefined;
        return (
          <div className="flex flex-col gap-5">
            <TaskOverviewStack
              entityName=""
              categories={categories}
              myUserId={daily.me.me.userId}
              daily={
                personalDailyEntity && {
                  entity: personalDailyEntity,
                  dateControl: dailyPicker,
                  showViewToggle: false,
                  myWeek: personalMyWeek,
                }
              }
              monthly={
                personalMonthlyEntity && {
                  entity: personalMonthlyEntity,
                  dateControl: monthlyPicker,
                  showViewToggle: false,
                  myMonth: personalMyMonth,
                }
              }
              ceoAssigned={
                ceoAssigned && {
                  entity: ceoAssigned.entity,
                  dateControl: ceoAssigned.dateControl,
                  showViewToggle: false,
                }
              }
              onComplete={actions?.complete}
              onSkip={actions?.skip}
              onReopen={actions?.reopen}
              onUploadProof={actions?.uploadProof}
              onRemoveProof={actions?.removeProof}
            />
            <PageSectionHeading>Department Overview</PageSectionHeading>
            {grid(deptPair)}
          </div>
        );
      }
      return grid(deptPair);
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors ONLY in the two files you haven't finished yet (Branch Manager's and staff's branches, in Tasks 7-8, still reference the now-deleted `personalPair`/`streamCard`) — this is expected mid-task; those get fixed in Tasks 7-8. If there are errors anywhere else (HOD's branch itself, or unrelated files beyond the 3 known baseline ones), stop and investigate before continuing — don't paper over a real mismatch.

- [ ] **Step 7: Commit**

```bash
git add src/app/home/scoped-overview-section.tsx
git commit -m "feat(task-manager): HOD's Home Daily/Monthly/CEO Assigned as task lists"
```

(This commit will leave the file in a temporarily-broken state — `personalPair`/`streamCard` are gone but still referenced by Branch Manager's and staff's branches below. That's expected and gets fixed in the next two tasks. Committing here anyway keeps history granular; don't skip the commit waiting for a fully-green state, since Tasks 7-8 are large enough to want their own checkpoints.)

---

### Task 7: Wire staff's (DEPT_MEMBER/BRANCH_MEMBER/COACH) Daily/Monthly/HOD Assigned as task lists

**Files:**
- Modify: `src/app/home/scoped-overview-section.tsx`

- [ ] **Step 1: Read the current file's final MEMBER return block**

Read `src/app/home/scoped-overview-section.tsx` again first (it changed in Task 6) — find the final `return` statement (search for `// MEMBER — which cards render is decided ENTIRELY`).

- [ ] **Step 2: Wire the MEMBER branch**

Find:

```tsx
    // MEMBER — which cards render is decided ENTIRELY by role-views.ts:
    // DEPT_MEMBER gets Daily + Monthly + HOD Assigned + streams;
    // BRANCH_MEMBER (Branch Exec / Coaches) gets ONLY the Daily card.
    // Admin/Ops streams stay hidden per the "no special Admin Assigned
    // Task category" spec (visibleAssignerStreams).
    const otherStreamCards = visibleAssignerStreams(daily.me.streamsAll)
      .filter((s) => s.key !== "HOD")
      .map((s) => (
        <StatusOverviewCard
          key={s.key}
          title={flowStreamLabel(s.key)}
          totals={s.totals}
          tasks={flowBucketize(s.tasks)}
          hideChart
          {...completeProps}
        />
      ));
    return (
      <div className="flex flex-col gap-5">
        {grid(
          <>
            {/* CEO (2026-08-01): ONE combined "My Tasks" card — no
                Daily/Monthly split — with the shared ?date= filter
                windowing it by DUE date (undated tasks always show). */}
            {shows(view, "home", "ceoCombinedList") &&
              (() => {
                const win = resolveWindow("daily", dailyDate ?? formatLocalDate(new Date()));
                const windowed = daily.me.tasks.filter((t) => {
                  if (!t.dueAt) return true;
                  const due = new Date(t.dueAt);
                  return due >= win.start && due < win.end;
                });
                const buckets = flowBucketize(windowed);
                return (
                  <StatusOverviewCard
                    key="ceo-own-tasks"
                    title="My Tasks"
                    totals={{
                      completed: buckets.completed.length,
                      pending: buckets.pending.length,
                      na: buckets.na.length,
                    }}
                    tasks={buckets}
                    action={dailyPicker}
                    actionPlacement="row"
                    hideChart
                    {...completeProps}
                  />
                );
              })()}
            {personalPair}
            {shows(view, "home", "hodAssigned") && streamCard("HOD", hodDate, "hdate", "From HOD")}
            {shows(view, "home", "assignerStreams") && otherStreamCards}
          </>,
        )}
        {ceoDashboards}
        {branchRegionOverview}
      </div>
    );
```

with:

```tsx
    // MEMBER — which cards render is decided ENTIRELY by role-views.ts:
    // DEPT_MEMBER gets Daily + Monthly + HOD Assigned; BRANCH_MEMBER/COACH
    // (Branch Exec / Coaches) get ONLY the Daily card. Admin/Ops streams
    // stay hidden per the "no special Admin Assigned Task category" spec
    // (visibleAssignerStreams) — assignerStreams is never actually in any
    // role's Home config today, so otherStreamCards never renders; kept
    // as-is, unrelated to this change.
    const otherStreamCards = visibleAssignerStreams(daily.me.streamsAll)
      .filter((s) => s.key !== "HOD")
      .map((s) => (
        <StatusOverviewCard
          key={s.key}
          title={flowStreamLabel(s.key)}
          totals={s.totals}
          tasks={flowBucketize(s.tasks)}
          hideChart
          {...completeProps}
        />
      ));
    const hodAssigned = shows(view, "home", "hodAssigned")
      ? personalStreamEntity("HOD", hodDate, "hdate")
      : undefined;
    return (
      <div className="flex flex-col gap-5">
        {grid(
          <>
            {/* CEO (2026-08-01): ONE combined "My Tasks" card — no
                Daily/Monthly split — with the shared ?date= filter
                windowing it by DUE date (undated tasks always show). */}
            {shows(view, "home", "ceoCombinedList") &&
              (() => {
                const win = resolveWindow("daily", dailyDate ?? formatLocalDate(new Date()));
                const windowed = daily.me.tasks.filter((t) => {
                  if (!t.dueAt) return true;
                  const due = new Date(t.dueAt);
                  return due >= win.start && due < win.end;
                });
                const buckets = flowBucketize(windowed);
                return (
                  <StatusOverviewCard
                    key="ceo-own-tasks"
                    title="My Tasks"
                    totals={{
                      completed: buckets.completed.length,
                      pending: buckets.pending.length,
                      na: buckets.na.length,
                    }}
                    tasks={buckets}
                    action={dailyPicker}
                    actionPlacement="row"
                    hideChart
                    {...completeProps}
                  />
                );
              })()}
            {shows(view, "home", "assignerStreams") && otherStreamCards}
          </>,
        )}
        {isPersonalRole && (
          <TaskOverviewStack
            entityName=""
            categories={categories}
            myUserId={daily.me.me.userId}
            daily={
              personalDailyEntity && {
                entity: personalDailyEntity,
                dateControl: dailyPicker,
                showViewToggle: false,
                myWeek: personalMyWeek,
              }
            }
            monthly={
              personalMonthlyEntity && {
                entity: personalMonthlyEntity,
                dateControl: monthlyPicker,
                showViewToggle: false,
                myMonth: personalMyMonth,
              }
            }
            hodAssigned={
              hodAssigned && {
                entity: hodAssigned.entity,
                dateControl: hodAssigned.dateControl,
                showViewToggle: false,
              }
            }
            onComplete={actions?.complete}
            onSkip={actions?.skip}
            onReopen={actions?.reopen}
            onUploadProof={actions?.uploadProof}
            onRemoveProof={actions?.removeProof}
          />
        )}
        {ceoDashboards}
        {branchRegionOverview}
      </div>
    );
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors only in Branch Manager's branch (still referencing the deleted `personalPair` — fixed in Task 8) plus the 3 known baseline errors. No errors in HOD's branch or the MEMBER branch you just changed.

- [ ] **Step 4: Commit**

```bash
git add src/app/home/scoped-overview-section.tsx
git commit -m "feat(task-manager): staff's Home Daily/Monthly/HOD Assigned as task lists"
```

---

### Task 8: Wire Branch Manager's Daily/Monthly/Ad hoc as task lists, thread `?padate=`

**Files:**
- Modify: `src/app/home/scoped-overview-section.tsx`
- Modify: `src/app/home/page.tsx`

- [ ] **Step 1: Read the current file's Branch Manager branch**

Read `src/app/home/scoped-overview-section.tsx` again first — find the `if (daily.branch && monthly.branch) {` block.

- [ ] **Step 2: Wire Branch Manager's branch**

Find (search for the SECOND occurrence of `if (shows(view, "home", "personalDaily")) {` — inside the `if (daily.branch && monthly.branch)` block):

```tsx
      if (shows(view, "home", "personalDaily")) {
        const adhocBuckets = flowBucketize(daily.me.adhocAll?.tasks ?? []);
        return (
          <div className="flex flex-col gap-5">
            {grid(
              <>
                {personalPair}
                {shows(view, "home", "personalAdhoc") && (
                  <StatusOverviewCard
                    key="personal-adhoc"
                    title="Ad hoc"
                    totals={{
                      completed: adhocBuckets.completed.length,
                      pending: adhocBuckets.pending.length,
                      na: adhocBuckets.na.length,
                    }}
                    tasks={adhocBuckets}
                    hideChart
                    {...completeProps}
                  />
                )}
              </>,
            )}
            <PageSectionHeading>Branch Overview</PageSectionHeading>
            {grid(branchPair)}
          </div>
        );
      }
```

with:

```tsx
      if (shows(view, "home", "personalDaily")) {
        const personalAdhoc = shows(view, "home", "personalAdhoc")
          ? personalAdhocEntity(padate)
          : undefined;
        return (
          <div className="flex flex-col gap-5">
            <TaskOverviewStack
              entityName=""
              categories={categories}
              myUserId={daily.me.me.userId}
              daily={
                personalDailyEntity && {
                  entity: personalDailyEntity,
                  dateControl: dailyPicker,
                  showViewToggle: false,
                  myWeek: personalMyWeek,
                }
              }
              monthly={
                personalMonthlyEntity && {
                  entity: personalMonthlyEntity,
                  dateControl: monthlyPicker,
                  showViewToggle: false,
                  myMonth: personalMyMonth,
                }
              }
              onComplete={actions?.complete}
              onSkip={actions?.skip}
              onReopen={actions?.reopen}
              onUploadProof={actions?.uploadProof}
              onRemoveProof={actions?.removeProof}
            />
            {personalAdhoc && (
              <EntityCardOverview
                sectionLabel="Ad hoc"
                entityName=""
                entity={personalAdhoc.entity}
                categories={categories}
                myUserId={daily.me.me.userId}
                dateControl={personalAdhoc.dateControl}
                showViewToggle={false}
                onComplete={actions?.complete}
                onSkip={actions?.skip}
                onReopen={actions?.reopen}
                onUploadProof={actions?.uploadProof}
                onRemoveProof={actions?.removeProof}
              />
            )}
            <PageSectionHeading>Branch Overview</PageSectionHeading>
            {grid(branchPair)}
          </div>
        );
      }
```

- [ ] **Step 3: Add the `EntityCardOverview` import**

Add this new import near the other `@/task-manager/ui/*` imports:

```ts
import { EntityCardOverview } from "@/task-manager/ui/entity-card-overview";
```

(Combine it with the existing `import type { MyMonthConfig, MyWeekConfig } from "@/task-manager/ui/entity-card-overview";` from Task 6 into one import statement — e.g. `import { EntityCardOverview, type MyMonthConfig, type MyWeekConfig } from "@/task-manager/ui/entity-card-overview";`.)

- [ ] **Step 4: Add `?padate=` to `page.tsx`**

In `src/app/home/page.tsx`, find the `searchParams` type (search for `department?: string;`):

```ts
    /** Which department the org-wide "All Departments" dropdown shows
     *  (2026-08-15 rebuild #2). Passed through verbatim; validated against
     *  FLOW_DEPARTMENTS in scoped-overview-section.tsx, not here. */
    department?: string;
  }>;
}) {
```

Change to:

```ts
    /** Which department the org-wide "All Departments" dropdown shows
     *  (2026-08-15 rebuild #2). Passed through verbatim; validated against
     *  FLOW_DEPARTMENTS in scoped-overview-section.tsx, not here. */
    department?: string;
    /** Branch Manager's personal Ad hoc day anchor (2026-08-15) — mirrors
     *  ?hdate=/?cdate= exactly. Passed through verbatim; defaulted to
     *  today in scoped-overview-section.tsx, not here. */
    padate?: string;
  }>;
}) {
```

Find:

```ts
  const expand = sp.expand;
  const department = sp.department;
```

Change to:

```ts
  const expand = sp.expand;
  const department = sp.department;
  const padate = sp.padate;
```

Find:

```tsx
        ceoDate={ceoDate}
        expand={expand}
        department={department}
        actions={{
```

Change to:

```tsx
        ceoDate={ceoDate}
        expand={expand}
        department={department}
        padate={padate}
        actions={{
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: only the 3 known pre-existing baseline errors — no other errors anywhere. This is the last of the three role branches, so the whole file should now be clean.

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: same baseline as before (340 passing, 1 known pre-existing unrelated failure — `Sidebar.test.ts`).

- [ ] **Step 7: Commit**

```bash
git add src/app/home/scoped-overview-section.tsx src/app/home/page.tsx
git commit -m "feat(task-manager): Branch Manager's Home Daily/Monthly/Ad hoc as task lists"
```

---

### Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: same baseline as before this whole plan (340 passing, 1 known pre-existing unrelated failure).

- [ ] **Step 2: Full typecheck**

Run: `npx tsc --noEmit`
Expected: only the 3 known pre-existing baseline errors.

- [ ] **Step 3: Restart the dev server and manually verify**

```bash
netstat -ano | grep ":3000" | grep LISTENING
taskkill //PID <pid> //F
rm -rf .next
npm run dev
```

Then, for each of the 3 roles, on `/home`:

- **Staff (e.g. Teh Yee Qian):** Daily shows a real weekday-tab task list (Tuesday–Saturday or whatever their range is), Monthly shows Year/Month dropdowns + the 4 range-chunk tabs, "HOD assigned tasks" shows a real (non-tabbed) task list with its own date picker. Clicking a Daily weekday tab updates the URL's `?date=` and the section's own date picker stays in sync (and vice versa) — same for Monthly's `?mrange=` tabs.
- **HOD:** same for Daily/Monthly, "CEO Assigned Task" instead of "HOD Assigned Task", still followed by the unchanged "Department Overview" pair below.
- **Branch Manager:** same for Daily/Monthly, "Ad hoc" now has a working date picker (`?padate=`) where it previously had none, still followed by the unchanged "Branch Overview" pair below.
- Confirm CEO's Home (its own combined "My Tasks" card) is completely unchanged.
- Confirm `/task-manager`'s own Monthly section (any role) still shows the dropdown-based range picker, NOT tabs — My Month is Home-only.

## Self-Review

**Spec coverage:**
- Daily reuses My Week as-is — Tasks 6-8 build `personalMyWeek` once, shared by all 3 roles. ✅
- Monthly gets My Month (Year/Month dropdowns + 4 tabs, no combined tab) — Task 4 (component), Tasks 6-8 (data). ✅
- Third card per role becomes a task list, reusing already-fetched data — Task 6 (`personalStreamEntity` for HOD/CEO Assigned, no new fetch), Task 8 (`personalAdhocEntity` for Ad hoc, new `?padate=`, no new fetch beyond the picker). ✅
- `toSelfEntityDetail` shared, not duplicated — Task 1. ✅
- `getFlowOverview` `monthDays` extension — Task 3. ✅
- My Month is Home-only, `/task-manager` untouched — Task 4/5 only ADD an optional prop nothing else sets; Task 9's manual check confirms it. ✅
- Self-only Daily (not whole-department, per the confirmed correction) — `toSelfEntityDetail(daily.me.me, daily.me)` throughout, never `getDepartmentDetail`'s MEMBER-daily exception. ✅

**Placeholder scan:** no TBD/TODO; every step has complete code.

**Type consistency:** `MyMonthChunk`/`MyMonthConfig` (Task 4) match exactly how they're constructed in Task 6-8 (`{label, range, tasks}` / `{chunks, selectedRange, nav}`) and how `TaskOverviewStack`'s `SectionData.myMonth` (Task 5) receives them. `personalStreamEntity`/`personalAdhocEntity`'s return shape (`{entity: FlowEntityDetail, dateControl: ReactNode}`) is used identically at every call site (Task 6's `ceoAssigned`, Task 7's `hodAssigned`, Task 8's `personalAdhoc`). `toSelfEntityDetail`'s signature (Task 1) matches every call site's arguments (`{userId, name}` + `{totals, tasks: FlowDrillTask[]}`).
