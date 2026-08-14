# My Week View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new `/task-manager/my-week` page showing the signed-in user's own tasks for the current week, tabbed by weekday, reusing the existing `ResizableTaskList` component (checkboxes, Select All, bulk "Mark Completed") unmodified.

**Architecture:** A new pure function computes this week's actual calendar dates for the viewer's role-based `WeekdayRange`. A new server-component page fetches `getFlowDetail(email, "daily", date)` once per date (existing function, unmodified). A new client component renders the weekday-tab sidebar and, for whichever tab is selected, one `ResizableTaskList` instance keyed by date (so switching tabs naturally clears selection via remount — no new state management needed). A new Sidebar entry makes the page reachable, gated the same way the existing `onlyMe`-default feature already distinguishes personal accounts from site accounts.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), React (Client Component), TypeScript, Vitest.

---

## Task 1: `thisWeekDatesForRange` — pure date computation (TDD)

**Files:**
- Modify: `src/task-manager/role-views.ts`
- Test: `src/task-manager/role-views.test.ts`

`role-views.ts`'s own file header states it's deliberately PURE with no server imports ("client components can read it"). `analytics/_lib.ts`'s `formatLocalDate` is NOT safe to import here — hrfs-map.ts's header (same repo) documents that `_lib.ts` transitively constructs a real Prisma client at import time. This function gets its own tiny, self-contained date formatter instead of importing one, to keep that invariant intact.

- [ ] **Step 1: Write the failing tests.** Add to `src/task-manager/role-views.test.ts` (append near the existing `weekdayRangeOf`-adjacent tests):

```ts
describe("thisWeekDatesForRange", () => {
  // Friday 2026-08-14 — a known, fixed reference date (a real Friday).
  const FRIDAY = new Date(2026, 7, 14); // month is 0-indexed: 7 = August

  it("mon-sun: returns all 7 days of the week containing the reference date", () => {
    const result = thisWeekDatesForRange("mon-sun", FRIDAY);
    expect(result).toEqual([
      { weekday: "Monday", date: "2026-08-10" },
      { weekday: "Tuesday", date: "2026-08-11" },
      { weekday: "Wednesday", date: "2026-08-12" },
      { weekday: "Thursday", date: "2026-08-13" },
      { weekday: "Friday", date: "2026-08-14" },
      { weekday: "Saturday", date: "2026-08-15" },
      { weekday: "Sunday", date: "2026-08-16" },
    ]);
  });

  it("tue-sat: returns Tuesday through Saturday of that same week", () => {
    const result = thisWeekDatesForRange("tue-sat", FRIDAY);
    expect(result).toEqual([
      { weekday: "Tuesday", date: "2026-08-11" },
      { weekday: "Wednesday", date: "2026-08-12" },
      { weekday: "Thursday", date: "2026-08-13" },
      { weekday: "Friday", date: "2026-08-14" },
      { weekday: "Saturday", date: "2026-08-15" },
    ]);
  });

  it("tue-sun: returns Tuesday through Sunday of that same week", () => {
    const result = thisWeekDatesForRange("tue-sun", FRIDAY);
    expect(result.map((d) => d.weekday)).toEqual([
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
    expect(result[0].date).toBe("2026-08-11");
    expect(result[5].date).toBe("2026-08-16");
  });

  it("wed-sun: returns Wednesday through Sunday of that same week", () => {
    const result = thisWeekDatesForRange("wed-sun", FRIDAY);
    expect(result.map((d) => d.weekday)).toEqual(["Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
    expect(result[0].date).toBe("2026-08-12");
  });

  it("works when the reference date is itself a Sunday (week wraps backward correctly)", () => {
    const SUNDAY = new Date(2026, 7, 16); // 2026-08-16 is the Sunday of that same week
    const result = thisWeekDatesForRange("mon-sun", SUNDAY);
    expect(result[0].date).toBe("2026-08-10"); // still Monday of the SAME week, not the next one
    expect(result[6].date).toBe("2026-08-16");
  });

  it("works when the reference date is itself a Monday", () => {
    const MONDAY = new Date(2026, 7, 10);
    const result = thisWeekDatesForRange("tue-sat", MONDAY);
    expect(result[0].date).toBe("2026-08-11");
    expect(result[4].date).toBe("2026-08-15");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail.**

Run: `npx vitest run src/task-manager/role-views.test.ts -t thisWeekDatesForRange`
Expected: FAIL — `thisWeekDatesForRange is not defined` (or a TypeScript import error, since the test file's `import` block needs the new name added too — add `thisWeekDatesForRange` to the existing `import { ... } from "./role-views";` block at the top of the test file).

- [ ] **Step 3: Implement the function.** Add to `src/task-manager/role-views.ts`, immediately after `weekdayRangeOf` (which already exists at the location shown by `grep -n "export function weekdayRangeOf"`):

```ts
/** { startOffset, endOffset } as days-from-Monday, inclusive, for each
 *  WeekdayRange value — e.g. "tue-sat" starts the day after Monday and
 *  ends 4 days after that (Saturday). */
const WEEKDAY_RANGE_BOUNDS: Record<WeekdayRange, { startOffset: number; endOffset: number }> = {
  "mon-sun": { startOffset: 0, endOffset: 6 },
  "tue-sat": { startOffset: 1, endOffset: 5 },
  "tue-sun": { startOffset: 1, endOffset: 6 },
  "wed-sun": { startOffset: 2, endOffset: 6 },
};

const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** Formats a Date as local YYYY-MM-DD. Deliberately NOT imported from
 *  analytics/_lib.ts's formatLocalDate — this file is pure (no server
 *  imports, see the file header), and _lib.ts transitively constructs a
 *  real Prisma client at import time (same reasoning documented in
 *  hrfs-map.ts's header for a similar import-boundary decision). */
function formatLocalDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** This week's actual calendar dates for every weekday in `range`,
 *  Monday-anchored (the week containing `today` runs Monday..Sunday
 *  regardless of what day `today` itself is — a Sunday reference date
 *  still resolves to THAT week's Monday, not the next one). Pure —
 *  `today` defaults to `new Date()` but is always passed explicitly by
 *  callers in practice (a bare `new Date()` default is only for tests /
 *  convenience, not relied on in the request path — pages pass their own
 *  captured `Date` so a single request sees one consistent "now"). */
export function thisWeekDatesForRange(
  range: WeekdayRange,
  today: Date = new Date(),
): { weekday: string; date: string }[] {
  const day = today.getDay(); // 0 = Sunday .. 6 = Saturday
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + mondayOffset);

  const { startOffset, endOffset } = WEEKDAY_RANGE_BOUNDS[range];
  const result: { weekday: string; date: string }[] = [];
  for (let offset = startOffset; offset <= endOffset; offset++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset);
    result.push({ weekday: WEEKDAY_NAMES[offset], date: formatLocalDateString(d) });
  }
  return result;
}
```

- [ ] **Step 4: Run the tests to verify they pass.**

Run: `npx vitest run src/task-manager/role-views.test.ts -t thisWeekDatesForRange`
Expected: PASS (6 tests)

- [ ] **Step 5: Run the full role-views suite to confirm no regressions.**

Run: `npx vitest run src/task-manager/role-views.test.ts`
Expected: PASS (all tests, existing count + 6)

- [ ] **Step 6: Commit.**

```bash
git add src/task-manager/role-views.ts src/task-manager/role-views.test.ts
git commit -m "feat(task-manager): add thisWeekDatesForRange for the My Week view"
```

---

## Task 2: `MyWeekView` client component

**Files:**
- Create: `src/task-manager/ui/my-week-view.tsx`

Reuses `ResizableTaskList` (`bits.tsx`) completely unmodified for the actual task table — this task is ONLY the weekday-tab sidebar shell around it.

- [ ] **Step 1: Write the component.**

```tsx
"use client";

// My Week view (2026-08-14) — weekday-tab sidebar + ResizableTaskList for
// whichever day is selected. Selection state lives entirely inside
// ResizableTaskList's own internal selectedIds (unmodified) — keying it by
// `date` below means switching tabs unmounts/remounts a fresh instance, so
// each day's checkbox selection is independent and clears on tab-switch by
// construction, not by any state management written here.
import * as React from "react";
import type { ActionResult, FlowTaskRow, ProofRemoveHandler, ProofUploadHandler } from "./types";
import { ResizableTaskList } from "./bits";

export interface MyWeekDay {
  weekday: string;
  date: string;
  tasks: FlowTaskRow[];
}

export function MyWeekView({
  days,
  myUserId,
  onComplete,
  onUploadProof,
  onRemoveProof,
}: {
  /** One entry per weekday in the viewer's role-based range, in order —
   *  see thisWeekDatesForRange (role-views.ts). */
  days: MyWeekDay[];
  myUserId: string;
  /** "Mark Completed" bulk action + individual row completion — the ONLY
   *  bulk action here (2026-08-14 decision): onSkip is deliberately NOT
   *  passed to ResizableTaskList below, which is what keeps "Mark N/A"
   *  from also appearing (ResizableTaskList only adds a bulk action for
   *  each handler it's actually given — see its own bulkActions array). */
  onComplete?: (runBlockId: string) => Promise<ActionResult>;
  onUploadProof?: ProofUploadHandler;
  onRemoveProof?: ProofRemoveHandler;
}) {
  const [selectedDate, setSelectedDate] = React.useState(days[0]?.date);
  const selectedDay = days.find((d) => d.date === selectedDate) ?? days[0];

  return (
    <div className="flex gap-6">
      <div className="w-48 shrink-0">
        {days.map((d) => {
          const pendingCount = d.tasks.filter((t) => t.status !== "DONE" && t.status !== "SKIPPED").length;
          const active = d.date === selectedDay?.date;
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => setSelectedDate(d.date)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium ${
                active ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span>{d.weekday}</span>
              <span className={active ? "text-blue-100" : "text-gray-400"}>{pendingCount}</span>
            </button>
          );
        })}
      </div>
      <div className="min-w-0 flex-1">
        {selectedDay && (
          <ResizableTaskList
            key={selectedDay.date}
            tasks={selectedDay.tasks}
            myUserId={myUserId}
            onComplete={onComplete}
            onUploadProof={onUploadProof}
            onRemoveProof={onRemoveProof}
            emptyLabel={`No tasks for ${selectedDay.weekday}.`}
            hideCompleted
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck.**

Run: `npx tsc --noEmit`
Expected: no new errors beyond the two permanently pre-existing, unrelated ones (`src/app/api/branch/dashboard/route.ts`, `src/app/components/ClickUpPieChart.tsx`) — confirm by diffing the output against a clean baseline if unsure.

- [ ] **Step 3: Commit.**

```bash
git add src/task-manager/ui/my-week-view.tsx
git commit -m "feat(task-manager): add MyWeekView weekday-tab component"
```

---

## Task 3: `/task-manager/my-week` page

**Files:**
- Create: `src/app/task-manager/my-week/page.tsx`

Mirrors `src/app/task-manager/package/page.tsx`'s exact structure (auth check, `SetupPendingError`/`NoAccountError`/generic three-way error-card mapping, `"use server"` action closures with `requireLiveSession` guards) — same conventions, different data.

- [ ] **Step 1: Write the page.**

```tsx
// /task-manager/my-week (2026-08-14) — the viewer's own tasks for the
// current week, tabbed by weekday. Same three-way SetupPendingError ->
// SetupPendingCard, NoAccountError -> NoAccountCard, any other error ->
// TaskManagerErrorCard mapping as package/page.tsx; no separate View/Edit
// tier here (unlike Package) — every personal-account role that can reach
// /task-manager at all can reach this page for their OWN tasks, gated the
// same way the Sidebar entry pointing here is (see Task 4).
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { requireLiveSession } from "@/task-manager/action-session";
import AppShell from "@/app/components/AppShell";
import { resolveViewRole, weekdayRangeOf, thisWeekDatesForRange } from "@/task-manager/role-views";
import {
  completeFlowTask,
  getFlowDetail,
  removeFlowTaskProof,
  uploadFlowTaskProof,
  FlowBridgeError,
  NoAccountError,
  SetupPendingError,
} from "@/task-manager/data";
import { MyWeekView, type MyWeekDay } from "@/task-manager/ui/my-week-view";
import {
  NoAccountCard,
  SetupPendingCard,
  TaskManagerErrorCard,
} from "@/task-manager/ui/status-cards";
import type { ActionResult, ProofRemoveResult, ProofUploadResult } from "@/task-manager/ui/types";

export const dynamic = "force-dynamic";

const FALLBACK_MESSAGE = "Something went wrong — please try again";

export default async function TaskManagerMyWeekPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const su = session.user as { email: string; name?: string | null; role?: string };
  const email = su.email;

  const errorPage = (err: unknown) => {
    let card;
    if (err instanceof SetupPendingError) {
      card = <SetupPendingCard />;
    } else if (err instanceof NoAccountError) {
      card = <NoAccountCard email={email} />;
    } else {
      card = (
        <TaskManagerErrorCard message={err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE} />
      );
    }
    return (
      <AppShell email={su.email} role={su.role} name={su.name}>
        <div className="mx-auto max-w-[1400px] p-6">{card}</div>
      </AppShell>
    );
  };

  let days: MyWeekDay[];
  let myUserId: string;
  try {
    // First fetch (today, no explicit date) doubles as the role lookup —
    // FlowDetailResponse.me.me carries role/department/branch/
    // employmentType, everything resolveViewRole/weekdayRangeOf need — no
    // separate getMyRole call required.
    const now = new Date();
    const todayResult = await getFlowDetail(email, "daily");
    myUserId = todayResult.me.me.userId;
    const view = resolveViewRole(todayResult.me.me);
    const range = weekdayRangeOf(view);
    const weekDates = thisWeekDatesForRange(range, now);

    const todayDateStr = todayResult.date;
    const otherDates = weekDates.filter((d) => d.date !== todayDateStr);
    const otherResults = await Promise.all(
      otherDates.map((d) => getFlowDetail(email, "daily", d.date)),
    );

    const resultByDate = new Map(otherResults.map((r) => [r.date, r]));
    resultByDate.set(todayDateStr, todayResult);

    days = weekDates.map((d) => ({
      weekday: d.weekday,
      date: d.date,
      tasks: resultByDate.get(d.date)?.me.tasks ?? [],
    }));
  } catch (err) {
    return errorPage(err);
  }

  async function completeTask(runBlockId: string): Promise<ActionResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      await completeFlowTask(email, runBlockId);
      revalidatePath("/task-manager/my-week");
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function uploadProof(
    runBlockId: string,
    image: { mime: string; dataBase64: string },
  ): Promise<ProofUploadResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const { proofId } = await uploadFlowTaskProof(email, runBlockId, image);
      revalidatePath("/task-manager/my-week");
      return { ok: true, proofId };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function removeProof(proofId: string): Promise<ProofRemoveResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      await removeFlowTaskProof(email, proofId);
      revalidatePath("/task-manager/my-week");
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  return (
    <AppShell email={su.email} role={su.role} name={su.name}>
      <div className="mx-auto max-w-[1400px] p-6">
        <h1 className="text-2xl font-bold text-gray-900">My Tasks — Daily</h1>
        <div className="mt-6">
          <MyWeekView
            days={days}
            myUserId={myUserId}
            onComplete={completeTask}
            onUploadProof={uploadProof}
            onRemoveProof={removeProof}
          />
        </div>
      </div>
    </AppShell>
  );
}
```

All three data-layer calls above (`completeFlowTask`, `uploadFlowTaskProof`, `removeFlowTaskProof`) and their exact signatures were confirmed live against `page.tsx`'s own equivalent action closures during planning — not guessed.

- [ ] **Step 2: Typecheck.**

Run: `npx tsc --noEmit`
Expected: no new errors beyond the two pre-existing unrelated ones.

- [ ] **Step 3: Commit.**

```bash
git add src/app/task-manager/my-week/page.tsx
git commit -m "feat(task-manager): add /task-manager/my-week page"
```

---

## Task 4: Sidebar entry

**Files:**
- Modify: `src/app/components/Sidebar.tsx`
- Modify: `src/task-manager/nav-access.actions.ts`
- Modify: `src/task-manager/role-views.ts`
- Test: `src/task-manager/role-views.test.ts`

Reuses `isPersonalAccountView` (already added to `role-views.ts` for the `onlyMe`-default feature) as the gate — the same distinction (real person vs. shared/site account) applies here: a site account has no personal tasks, so no reason to show it a link to its own (empty) week.

- [ ] **Step 1: Write the failing test.** Add to `src/task-manager/role-views.test.ts`, inside (or near) the existing `describe("taskManagerNavAccess", ...)` block — extend each existing `toEqual` call to also expect a `myWeek` field matching that role's `isPersonalAccountView` result. Concretely, update these two representative existing cases (and mentally apply the same `myWeek` value — `isPersonalAccountView`'s result for that role — to every other case in the same describe block, per the earlier `isPersonalAccountView` test's own true/false role lists):

```ts
  it("Super Admin (ADMIN): all three true", () => {
    expect(taskManagerNavAccess({ role: "ADMIN", department: null })).toEqual({
      template: true,
      package: true,
      packageTable: true,
      myWeek: true,
    });
  });
```

(apply `myWeek: true` to every existing case whose role is in `isPersonalAccountView`'s "true" list — ADMIN, HOD, CEO, BRANCH, OPS, MEMBER-family — and `myWeek: false` to DEPT_SITE/BRANCH_SITE cases, matching the existing `isPersonalAccountView` test's own role lists exactly, since this task's gate IS that function.)

- [ ] **Step 2: Run to verify failure.**

Run: `npx vitest run src/task-manager/role-views.test.ts -t taskManagerNavAccess`
Expected: FAIL — `myWeek` missing from the actual returned object.

- [ ] **Step 3: Update `taskManagerNavAccess`** in `role-views.ts` (the function already exists — find it via `grep -n "export function taskManagerNavAccess"`):

```ts
export function taskManagerNavAccess(user: {
  role: string;
  department: string | null;
}): { template: boolean; package: boolean; packageTable: boolean; myWeek: boolean } {
  const manage = canManageTaskTemplateGroups(user);
  const orgViewer = user.role === "CEO" || user.role === "HOD";
  const branchManagerViewer = user.role === "BRANCH";
  const viewer = manage || orgViewer || branchManagerViewer;
  return {
    template: viewer,
    package: viewer,
    packageTable: viewer,
    // My Week (2026-08-14): every personal-account role, not just the
    // Template/Package/Package Table viewer tier — reuses
    // isPersonalAccountView, the same personal-vs-site-account distinction
    // the Overview page's onlyMe-default feature already established.
    myWeek: isPersonalAccountView(resolveViewRole({ ...user, branch: null, employmentType: null })),
  };
}
```

- [ ] **Step 4: Run to verify the test passes.**

Run: `npx vitest run src/task-manager/role-views.test.ts -t taskManagerNavAccess`
Expected: PASS

- [ ] **Step 5: Update `TaskManagerNavAccess`** in `src/task-manager/nav-access.actions.ts`:

```ts
export interface TaskManagerNavAccess {
  template: boolean;
  package: boolean;
  packageTable: boolean;
  myWeek: boolean;
}

const NO_ACCESS: TaskManagerNavAccess = {
  template: false,
  package: false,
  packageTable: false,
  myWeek: false,
};
```

- [ ] **Step 6: Add the Sidebar entry.** In `src/app/components/Sidebar.tsx`, update the `taskManagerKey` union and add the nav item (find the exact current lines via `grep -n "taskManagerKey?:" src/app/components/Sidebar.tsx` and `grep -n "Package Table" src/app/components/Sidebar.tsx`):

```ts
  taskManagerKey?: "template" | "package" | "packageTable" | "myWeek";
```

```tsx
      { name: "Package Table", href: "/task-manager/package-table", taskManagerKey: "packageTable" },
      { name: "My Week", href: "/task-manager/my-week", taskManagerKey: "myWeek" },
```

- [ ] **Step 7: Run the full role-views suite.**

Run: `npx vitest run src/task-manager/role-views.test.ts`
Expected: PASS (all tests)

- [ ] **Step 8: Typecheck.**

Run: `npx tsc --noEmit`
Expected: no new errors beyond the two pre-existing unrelated ones.

- [ ] **Step 9: Commit.**

```bash
git add src/app/components/Sidebar.tsx src/task-manager/nav-access.actions.ts src/task-manager/role-views.ts src/task-manager/role-views.test.ts
git commit -m "feat(task-manager): add My Week sidebar entry"
```

---

## Task 5: Full verification

- [ ] Run the complete task-manager suite: `npx vitest run src/task-manager` — expect all tests passing (existing count + new ones from Tasks 1 and 4).
- [ ] Run a full typecheck: `npx tsc --noEmit` — expect only the two permanently pre-existing, unrelated errors.
- [ ] Manually visit `/task-manager/my-week` in a browser as a role that should see it (e.g. HOD or Branch Manager) — confirm weekday tabs render with the correct range for that role, tab switching swaps the task list, checkboxes/Select All/bulk "Mark Completed" work, and NO "Mark N/A" bulk option appears (confirms `onSkip` was correctly omitted). Also visit as a site-account role (DEPT_SITE/BRANCH_SITE) — confirm no "My Week" sidebar entry appears and the page itself redirects or errors gracefully if hit directly by URL (it currently does NOT explicitly redirect non-personal roles — see the open question below; decide and fix before considering this task done if a site account can currently reach an empty/broken page directly).
- [ ] Use `superpowers:finishing-a-development-branch` once the above is clean.

---

## Spec coverage check (self-review against the design doc)

1. **New standalone route** — Task 3 (`/task-manager/my-week`). ✓
2. **Weekday tabs from role-based `WeekdayRange`** — Task 1 (`thisWeekDatesForRange`) + Task 3 (calls `weekdayRangeOf`). ✓
3. **Per-day data via `getFlowDetail`, unmodified** — Task 3. ✓
4. **Task table via `ResizableTaskList`, unmodified** — Task 2. ✓
5. **Bulk action = Mark Completed only, no Mark N/A** — Task 2 (`onSkip` deliberately omitted, documented inline). ✓
6. **Checkboxes = pending tasks only** — free, `ResizableTaskList`'s own existing `hideCompleted`-mode behavior, unmodified. ✓
7. **Selection clears per tab** — Task 2 (`key={selectedDay.date}` remount). ✓
8. **Role scope = every personal-account role** — Task 4 (`isPersonalAccountView` gate, both for the Sidebar entry AND reused as the conceptual gate — see the open item below about also enforcing this server-side on the page itself). ✓
9. **No week navigation** — Task 3 (page always computes "this week" from `new Date()`, no date param support). ✓

## One gap surfaced during this self-review, not in the original spec

The Sidebar entry (Task 4) hides the link from site accounts, but **Task 3's page itself doesn't separately verify the viewer is a personal-account role** before rendering — a site-account user who navigates to `/task-manager/my-week` directly by URL would still get a page (likely showing their own, probably-empty, task set, since site accounts typically have none) rather than a redirect. Decide during Task 5's manual verification whether this needs an explicit guard (e.g. `if (!isPersonalAccountView(view)) redirect("/task-manager");` right after computing `view` in Task 3's page) — flagging rather than silently deciding, since the spec didn't address direct-URL access for excluded roles.
