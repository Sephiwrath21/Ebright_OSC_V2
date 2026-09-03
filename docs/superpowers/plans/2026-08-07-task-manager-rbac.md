# Task Manager Sidebar RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate the Task Manager sidebar's Template/Package/Package Table sub-items (view = sidebar visibility + page reachability, edit = create/edit/delete/assign actions) per an explicit role permission matrix, as two separate, server-enforced layers.

**Architecture:** Two pure functions in `src/task-manager/role-views.ts` (`taskManagerNavAccess`, `canManageTaskTemplateGroups`) are the single source of truth, consumed by: (a) a new session-cached server action feeding `Sidebar.tsx`'s visibility filtering, and (b) `template-groups.ts`'s data-layer authorization (`requireGroupViewAccess`/`requireGroupEditAccess`, replacing the current `requireGroupAccess`/`requireGroupAssignAccess`), so the sidebar and the actual server enforcement can never drift apart. Overview is explicitly out of scope — its existing `role-views.ts` `ROLE_VIEWS`/`shows()` gating stays untouched.

**Tech Stack:** Next.js 16 App Router / Server Actions, Prisma (Task Manager's own `TASK_MANAGER_DATABASE_URL` client), Vitest.

---

## Confirmed role mapping (do not deviate)

| Matrix label | Condition |
|---|---|
| Super Admin | `role === "ADMIN"` |
| Operation | `role === "DEPT_SITE"` and `isElevatedDeptSite(user)` (department "Operations"/"Optimisation") |
| HOD | `role === "HOD"` |
| CEO | `role === "CEO"` |
| Branch Manager | `role === "BRANCH"` |
| Department | `role === "DEPT_SITE"` and NOT `isElevatedDeptSite(user)` |
| Branch | `role === "BRANCH_SITE"` |
| Intern | `role === "MEMBER"`, `employmentType === "Intern"` |
| HQ Exec | `role === "MEMBER"`, `employmentType === "HQ Exec"` |
| Branch Exec | `role === "MEMBER"`, `employmentType === "Branch Exec"` |
| Full Time Coach | `role === "MEMBER"`, `employmentType === "Coach"`, `coachSchedule === "Full Time"` |
| Part Time Coach | `role === "MEMBER"`, `employmentType === "Coach"`, `coachSchedule === "Part Time"` |
| Anything else (e.g. `OPS` role, `Regional Manager` employmentType, unspecified `MEMBER`) | Not in the matrix → treated as no access on Template/Package/Package Table (least privilege) |

## Confirmed permission matrix

| Role | Template | Package | Package Table |
|---|---|---|---|
| Super Admin | View+Edit | View+Edit | View+Edit |
| Operation | View+Edit | View+Edit | View+Edit |
| HOD | View only | View only | View only |
| CEO | View only | View only | View only |
| Branch Manager | Not visible | View only | View only |
| Everyone else | Not visible | Not visible | Not visible |

So: **Edit tier = `role === "ADMIN"` OR `isElevatedDeptSite(user)`, identical across all three pages.** View tier differs only by whether HOD/CEO/Branch Manager are included (Template excludes Branch Manager; Package/Package Table include it).

UI default (stated to the user, not re-litigated): view-only roles get action buttons **hidden**, not disabled. "View Assignees" is treated as part of the assign-family of actions and requires Edit tier (not split out as a separate view-only affordance).

---

## Task 1: Pure role-resolution functions in `role-views.ts`

**Files:**
- Modify: `src/task-manager/role-views.ts`
- Test: `src/task-manager/role-views.test.ts` (check if this file exists first — if not, check `src/task-manager/role-views.ts` for any co-located existing test file before creating a new one)

- [ ] **Step 1: Read the current file to find the right insertion point**

Read `src/task-manager/role-views.ts` in full. Find `isElevatedDeptSite` and `resolveViewRole` — the new functions go right after `isElevatedDeptSite`, before `resolveViewRole`, so they can reuse it.

- [ ] **Step 2: Write the failing tests**

Find the existing test file for this module (search `src/task-manager/**/*.test.ts` for `role-views` or `resolveViewRole`/`isElevatedDeptSite` references — reuse that file if found, matching its existing `describe`/`it` structure and import style; only create a new file if truly none exists). Add:

```ts
import { canManageTaskTemplateGroups, taskManagerNavAccess } from "./role-views";

describe("canManageTaskTemplateGroups", () => {
  it("true for ADMIN", () => {
    expect(canManageTaskTemplateGroups({ role: "ADMIN", department: null })).toBe(true);
  });
  it("true for elevated dept-site (Operations)", () => {
    expect(canManageTaskTemplateGroups({ role: "DEPT_SITE", department: "Operations" })).toBe(true);
  });
  it("true for elevated dept-site (Optimisation)", () => {
    expect(canManageTaskTemplateGroups({ role: "DEPT_SITE", department: "Optimisation" })).toBe(true);
  });
  it("false for non-elevated dept-site", () => {
    expect(canManageTaskTemplateGroups({ role: "DEPT_SITE", department: "Finance" })).toBe(false);
  });
  it("false for CEO, HOD, OPS, BRANCH, BRANCH_SITE, MEMBER", () => {
    for (const role of ["CEO", "HOD", "OPS", "BRANCH", "BRANCH_SITE", "MEMBER"]) {
      expect(canManageTaskTemplateGroups({ role, department: null })).toBe(false);
    }
  });
});

describe("taskManagerNavAccess", () => {
  it("Super Admin (ADMIN): all three true", () => {
    expect(taskManagerNavAccess({ role: "ADMIN", department: null })).toEqual({
      template: true,
      package: true,
      packageTable: true,
    });
  });
  it("Operation (elevated dept-site): all three true", () => {
    expect(taskManagerNavAccess({ role: "DEPT_SITE", department: "Operations" })).toEqual({
      template: true,
      package: true,
      packageTable: true,
    });
  });
  it("HOD: all three true (view-only, but sidebar-visible)", () => {
    expect(taskManagerNavAccess({ role: "HOD", department: null })).toEqual({
      template: true,
      package: true,
      packageTable: true,
    });
  });
  it("CEO: all three true (view-only, but sidebar-visible)", () => {
    expect(taskManagerNavAccess({ role: "CEO", department: null })).toEqual({
      template: true,
      package: true,
      packageTable: true,
    });
  });
  it("Branch Manager (BRANCH): template false, package/packageTable true", () => {
    expect(taskManagerNavAccess({ role: "BRANCH", department: null })).toEqual({
      template: false,
      package: true,
      packageTable: true,
    });
  });
  it("OPS role: all three false (not in the matrix)", () => {
    expect(taskManagerNavAccess({ role: "OPS", department: null })).toEqual({
      template: false,
      package: false,
      packageTable: false,
    });
  });
  it("non-elevated dept-site (Department): all three false", () => {
    expect(taskManagerNavAccess({ role: "DEPT_SITE", department: "Finance" })).toEqual({
      template: false,
      package: false,
      packageTable: false,
    });
  });
  it("BRANCH_SITE (Branch): all three false", () => {
    expect(taskManagerNavAccess({ role: "BRANCH_SITE", department: null })).toEqual({
      template: false,
      package: false,
      packageTable: false,
    });
  });
  it("MEMBER (Intern/HQ Exec/Branch Exec/Coach/unspecified): all three false", () => {
    expect(taskManagerNavAccess({ role: "MEMBER", department: null })).toEqual({
      template: false,
      package: false,
      packageTable: false,
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run <path-to-test-file>` (use the exact path found in Step 2)
Expected: FAIL — `canManageTaskTemplateGroups`/`taskManagerNavAccess` are not defined/exported.

- [ ] **Step 4: Implement the functions**

Add directly after `isElevatedDeptSite` in `src/task-manager/role-views.ts`:

```ts
/** Task Manager sidebar visibility for Template/Package/Package Table
 *  (2026-08-07 permission matrix) — View tier only, separate from edit
 *  capability (see canManageTaskTemplateGroups below). Overview is
 *  deliberately NOT covered here — it stays visible to everyone via
 *  Sidebar's existing unconditional rendering, and its own edit-surface
 *  gating is unchanged, still driven entirely by ROLE_VIEWS/shows() above.
 *  Consumed by BOTH the sidebar's visibility filter and
 *  template-groups.ts's requireGroupViewAccess, so the two can never
 *  drift apart — a role hidden from the sidebar is always also rejected
 *  server-side, and vice versa. */
export function taskManagerNavAccess(user: {
  role: string;
  department: string | null;
}): { template: boolean; package: boolean; packageTable: boolean } {
  const manage = canManageTaskTemplateGroups(user);
  const orgViewer = user.role === "CEO" || user.role === "HOD";
  const branchManagerViewer = user.role === "BRANCH";
  return {
    template: manage || orgViewer,
    package: manage || orgViewer || branchManagerViewer,
    packageTable: manage || orgViewer || branchManagerViewer,
  };
}

/** Task Manager Template/Package/Package Table EDIT capability
 *  (create/edit/delete/assign) — identical for all three pages under the
 *  2026-08-07 matrix: Super Admin (ADMIN) and the elevated
 *  Operations/Optimisation dept-site accounts only. Everyone else who can
 *  still VIEW (HOD, CEO, and — Package/Package Table only — Branch
 *  Manager, per taskManagerNavAccess above) is read-only. */
export function canManageTaskTemplateGroups(user: {
  role: string;
  department: string | null;
}): boolean {
  return user.role === "ADMIN" || isElevatedDeptSite(user);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run <path-to-test-file>`
Expected: PASS, all new tests green.

- [ ] **Step 6: Commit**

```bash
git add src/task-manager/role-views.ts <path-to-test-file>
git commit -m "feat(task-manager): add taskManagerNavAccess/canManageTaskTemplateGroups"
```

---

## Task 2: Data-layer authorization tiers in `template-groups.ts`

**Files:**
- Modify: `src/task-manager/data/template-groups.ts`
- Modify: `src/task-manager/data/queries.ts` (extend `getMyRole`)

**Context:** `template-groups.ts` currently has `requireGroupAccess` (general management, currently `isAssignCapable` — ADMIN/OPS/CEO/HOD/BRANCH/elevated-dept-site — for BOTH scopes) and `requireGroupAssignAccess` (currently BRANCH/ADMIN/elevated-dept-site for PACKAGE, same as manage for TEMPLATE). Both get REPLACED — this task deliberately narrows access considerably; that narrowing is intentional and confirmed, not a bug to avoid.

- [ ] **Step 1: Extend `getMyRole` to also return `department`**

In `src/task-manager/data/queries.ts`, find `getMyRole`:

```ts
export function getMyRole(email: string): Promise<{ role: string }> {
  return native(async () => {
    const user = await requireUserByEmail(email);
    return { role: user.role };
  }, "getMyRole");
}
```

Change to:

```ts
export function getMyRole(email: string): Promise<{ role: string; department: string | null }> {
  return native(async () => {
    const user = await requireUserByEmail(email);
    return { role: user.role, department: user.department };
  }, "getMyRole");
}
```

This is additive (existing callers destructuring only `.role` are unaffected — grep `getMyRole` across the repo first to confirm no caller does something like `JSON.stringify`/exhaustive-shape comparison that a new field would break; if any exists, note it and proceed only if safe).

- [ ] **Step 2: Replace the two access-check functions**

In `src/task-manager/data/template-groups.ts`, replace `requireGroupAccess` and `requireGroupAssignAccess` (and the `isAssignCapable`/`ASSIGN_CAPABLE_ROLES` helpers they use, which become unused after this change — remove them too if nothing else in the file references them, confirm via grep within the file first) with:

```ts
import { canManageTaskTemplateGroups, taskManagerNavAccess } from "../role-views";

/** View access (list/view a group): the 2026-08-07 permission matrix's
 *  View tier, scope-aware via taskManagerNavAccess — TEMPLATE excludes
 *  Branch Manager, PACKAGE/PACKAGE_TABLE include it. This is the SAME
 *  function the sidebar's visibility check calls (taskManagerNavAccess)
 *  — a role hidden from the sidebar always also 403s here. */
async function requireGroupViewAccess(email: string, scope: TemplateGroupScope) {
  const user = await requireUserByEmail(email);
  const access = taskManagerNavAccess(user);
  const allowed = scope === "PACKAGE" ? access.package : access.template;
  if (!allowed) {
    throw new ApiHttpError(403, `You don't have access to view ${NOUN[scope]}s`);
  }
  return user;
}

/** Edit access (create/edit/delete/assign/view-assignees/remove-assignee):
 *  identical for both scopes — Super Admin + elevated dept-site only. */
async function requireGroupEditAccess(email: string, scope: TemplateGroupScope) {
  const user = await requireUserByEmail(email);
  if (!canManageTaskTemplateGroups(user)) {
    throw new ApiHttpError(403, `Only admins can manage ${NOUN[scope]}s`);
  }
  return user;
}
```

(Keep `NOUN`/`NOT_FOUND_MESSAGE` as-is — still used elsewhere in the file.)

- [ ] **Step 3: Re-route every exported function to the correct tier**

View tier (`requireGroupViewAccess`): `listTemplateGroups`, `getTemplateGroup`.

Edit tier (`requireGroupEditAccess`): `createTemplateGroup`, `editTemplateGroup`, `getGroupDeletionImpact`, `deleteTemplateGroup`, `applyTemplateGroup`, `getGroupAssignees`, `removeGroupAssignee`.

For each of the 9 functions, change the line `const user = await requireGroupAccess(email, scope);` or `const user = await requireGroupAssignAccess(email, scope);` to call the correct new function per the split above. Update each function's doc comment that references the old function names (`requireGroupAccess`/`requireGroupAssignAccess`) to the new names — grep the whole file for both old names afterward to confirm zero remaining references (including the file header comment at the top, which currently describes the old two-tier split — rewrite it to describe View/Edit instead).

- [ ] **Step 4: Update `tasks-internal.ts`'s comment**

`src/task-manager/data/tasks-internal.ts`'s header comment references `requireGroupAssignAccess` (from the prior split) — update it to say `requireGroupEditAccess` instead, matching the renamed function.

- [ ] **Step 5: Verify against the live database**

Write a disposable `tsx` script (pattern: `npx tsx -r dotenv/config <script>`, using `./src/task-manager/prisma` for `prisma`, delete the script when done) that:
- Confirms an ADMIN account can view+edit both TEMPLATE and PACKAGE scope.
- Confirms an elevated dept-site (Operations/Optimisation) account can view+edit both scopes.
- Confirms a CEO or HOD account can view (list/get) but gets 403 on create/edit/delete/apply/getGroupAssignees for both scopes.
- Confirms a BRANCH (Branch Manager) account gets 403 on `listTemplateGroups`/`getTemplateGroup` for TEMPLATE scope (not visible), but CAN view PACKAGE scope, and gets 403 on PACKAGE edit actions (view-only there now).
- Confirms a plain MEMBER or OPS-role account gets 403 on view for both scopes.

Create any test group data needed via an ADMIN or elevated account, and clean up (delete) everything the script creates before it exits, same discipline as prior verification scripts this session.

- [ ] **Step 6: Run full test suite and type-check**

Run: `npx tsc --noEmit` and `npm test` — confirm no new errors/failures beyond the known pre-existing unrelated ones.

- [ ] **Step 7: Commit**

```bash
git add src/task-manager/data/template-groups.ts src/task-manager/data/tasks-internal.ts src/task-manager/data/queries.ts
git commit -m "feat(task-manager): replace Template/Package access checks with View/Edit tiers"
```

---

## Task 3: Sidebar visibility wiring

**Files:**
- Create: `src/task-manager/nav-access.actions.ts`
- Modify: `src/app/components/AppShell.tsx`
- Modify: `src/app/components/Sidebar.tsx`

**Context:** `Sidebar.tsx` currently gets a `navAccess: NavAccess | null` prop from `AppShell.tsx`, fetched once per browser session via a `"use server"` action (`getNavAccess`) and cached in a module-level variable (`cachedNavAccess`), then re-used across client-side navigations. That whole mechanism (`NavAccess`/`buildAccess`/`src/lib/access/engine.ts`) is the PORTAL's own RBAC system, entirely separate from the Task Manager database — do not modify it. This task adds a SEPARATE, parallel mechanism, following the exact same fetch-once-cache-in-module-variable pattern, so it composes without touching the existing one.

- [ ] **Step 1: Write the new server action**

Create `src/task-manager/nav-access.actions.ts`:

```ts
"use server";

// Task Manager sidebar visibility (2026-08-07) — a SEPARATE, additive
// mechanism from the portal's own NavAccess/getNavAccess (see
// src/app/components/navAccess.actions.ts) — that system is the portal's
// unrelated RBAC (feature keys/privileged), resolved against the portal's
// own database and computed for every portal user regardless of whether
// they use Task Manager at all. This one is scoped to Task Manager's own
// database/role system and fetched the same way (once per browser
// session, cached client-side) so it doesn't add a round trip to every
// route change, but it's kept as its own file/action rather than folded
// into getNavAccess to avoid coupling two unrelated identity systems.
import { auth } from "@/auth";
import { requireUserByEmail } from "./data/core";
import { taskManagerNavAccess } from "./role-views";

export interface TaskManagerNavAccess {
  template: boolean;
  package: boolean;
  packageTable: boolean;
}

const NO_ACCESS: TaskManagerNavAccess = { template: false, package: false, packageTable: false };

/** Fail-closed: any error (no Task Manager account, DB not configured,
 *  etc.) hides all three gated sidebar items rather than leaking access
 *  or throwing and breaking the whole sidebar. */
export async function getTaskManagerNavAccess(): Promise<TaskManagerNavAccess> {
  const session = await auth();
  if (!session?.user?.email) return NO_ACCESS;
  try {
    const user = await requireUserByEmail(session.user.email);
    return taskManagerNavAccess(user);
  } catch {
    return NO_ACCESS;
  }
}
```

Note: `requireUserByEmail` is exported from `src/task-manager/data/core.ts` — confirm the exact export before writing the import (it's used elsewhere in the module already, e.g. `template-groups.ts`).

- [ ] **Step 2: Read `AppShell.tsx`'s existing `navAccess` fetch to mirror it exactly**

Read `src/app/components/AppShell.tsx` in full, focusing on the `cachedNavAccess` module variable and the `useEffect` that calls `getNavAccess()`.

- [ ] **Step 3: Add the parallel Task Manager fetch**

In `AppShell.tsx`, add a second module-level cache variable and a second `useState`/`useEffect` pair, following the exact same shape as the existing `navAccess` one:

```ts
let cachedTaskManagerNavAccess: TaskManagerNavAccess | null = null;
```

```tsx
const [taskManagerNavAccess, setTaskManagerNavAccess] = useState<TaskManagerNavAccess | null>(
  cachedTaskManagerNavAccess,
);
useEffect(() => {
  if (cachedTaskManagerNavAccess) return;
  let cancelled = false;
  getTaskManagerNavAccess()
    .then((a) => {
      cachedTaskManagerNavAccess = a;
      if (!cancelled) setTaskManagerNavAccess(a);
    })
    .catch(() => {
      /* leave Template/Package/Package Table hidden if access can't be resolved */
    });
  return () => {
    cancelled = true;
  };
}, []);
```

Import `getTaskManagerNavAccess`/`TaskManagerNavAccess` from `@/task-manager/nav-access.actions`. Pass `taskManagerNavAccess` as a new prop to both `<Sidebar>` render sites (desktop rail and mobile drawer), alongside the existing `navAccess` prop.

- [ ] **Step 4: Wire the new prop into `Sidebar.tsx`**

Read `src/app/components/Sidebar.tsx`'s `NavItem` interface and `filterNav` function (already known from research: `feature`/`privileged` fields, `filterNav(items, access)`).

Add a new optional field to `NavItem`:

```ts
/** Task Manager-specific visibility key (2026-08-07) — checked against a
 *  SEPARATE TaskManagerNavAccess prop, not the portal's `feature`/
 *  `privileged` NavAccess system (Task Manager's role granularity —
 *  Branch Manager, Coach, etc. — doesn't exist in that system). Omit for
 *  items that don't need Task-Manager-specific gating (e.g. "Overview",
 *  which stays unconditionally visible). */
taskManagerKey?: "template" | "package" | "packageTable";
```

Set it on the Template/Package/Package Table children (leave "Overview" without this field — it stays unconditionally visible, unchanged):

```ts
children: [
  { name: "Overview", href: "/task-manager", exact: true },
  { name: "Template", href: "/task-manager/template", taskManagerKey: "template" },
  { name: "Package", href: "/task-manager/package", taskManagerKey: "package" },
  { name: "Package Table", href: "/task-manager/package-table", taskManagerKey: "packageTable" },
],
```

Extend `filterNav` to accept and check the new access object:

```ts
function filterNav(
  items: NavItem[],
  access: NavAccess | null,
  taskManagerAccess: TaskManagerNavAccess | null,
): NavItem[] {
  if (!access) return items;
  const out: NavItem[] = [];
  for (const item of items) {
    if (item.privileged && !access.privileged) continue;
    if (item.feature && !access.features.includes(item.feature)) continue;
    if (item.taskManagerKey) {
      // null (still loading) leaves it shown, matching the existing
      // "null access leaves the menu untouched" behavior for navAccess.
      if (taskManagerAccess && !taskManagerAccess[item.taskManagerKey]) continue;
    }
    if (item.children?.length) {
      const kids = filterNav(item.children, access, taskManagerAccess);
      if (kids.length === 0) continue;
      out.push({ ...item, children: kids });
    } else {
      out.push(item);
    }
  }
  return out;
}
```

Update the `Sidebar` component's props and both `filterNav(...)` call sites to pass the new `navAccess?: TaskManagerNavAccess | null` prop through (name it distinctly from the existing `navAccess` prop to avoid confusion — e.g. `taskManagerNavAccess`). Import `TaskManagerNavAccess` type from `@/task-manager/nav-access.actions`.

- [ ] **Step 5: Type-check and manually trace the null-loading state**

Run `npx tsc --noEmit`. Confirm the "loading" window (before the client-side fetch resolves) leaves Template/Package/Package Table visible rather than flickering hidden-then-shown for privileged users — same tradeoff the existing `navAccess` system already accepts (per its own doc comment), consistent behavior, not a new regression.

- [ ] **Step 6: Live verification**

Since this is client-side rendering logic, browser verification isn't available in this environment — verify via careful code tracing (confirmed types line up, confirmed the fail-closed default) and via `curl`/server-log checks that the new server action itself returns correct values for a few real accounts (write a disposable script calling `getTaskManagerNavAccess`-equivalent logic — note `getTaskManagerNavAccess` itself calls `auth()` which needs a request context, so instead directly test `taskManagerNavAccess(user)` from Task 1's own verification, or construct a minimal server-action-invoking test if feasible). Disclose this limitation explicitly rather than claiming full UI verification.

- [ ] **Step 7: Commit**

```bash
git add src/task-manager/nav-access.actions.ts src/app/components/AppShell.tsx src/app/components/Sidebar.tsx
git commit -m "feat(task-manager): gate sidebar Template/Package/Package Table by role"
```

---

## Task 4: Template and Package pages — compute and apply `canEdit`

**Files:**
- Modify: `src/app/task-manager/template/page.tsx`
- Modify: `src/app/task-manager/package/page.tsx`
- Modify: `src/task-manager/ui/template-group-dashboard.tsx`

**Context:** `template/page.tsx` already calls `getMyRole(email)` (for `hideCadence`); `package/page.tsx` currently does NOT call it at all (stale comment says so — update/remove that comment). Both need `canEdit` computed and passed to `TemplateGroupDashboard`.

- [ ] **Step 1: Compute `canEdit` in `template/page.tsx`**

`getMyRole` now returns `{ role, department }` (Task 2, Step 1). Add:

```ts
const canEdit = canManageTaskTemplateGroups(role);
```

right after the existing `role = roleResult.role;` line — but note `role` is currently destructured as just the role string (`role = roleResult.role`); you'll need `role` to instead hold the full `{role, department}` object (or introduce a second variable) since `canManageTaskTemplateGroups` needs both fields. Check the existing `hideCadence={role === "CEO"}` usage further down the file and adjust so both still work correctly (e.g. keep `role` as the full object, use `role.role === "CEO"` for `hideCadence`, and `canManageTaskTemplateGroups(role)` for `canEdit`) — read the surrounding code carefully before changing the variable's shape, since `roleResult` is destructured inside a `Promise.all`.

Import `canManageTaskTemplateGroups` from `@/task-manager/role-views`.

Pass `canEdit={canEdit}` as a new prop to `<TemplateGroupDashboard>`.

- [ ] **Step 2: Compute `canEdit` in `package/page.tsx`**

Add a `getMyRole(email)` call to the `Promise.all` (currently only fetches `listTemplateGroups`/`getFlowStaff` — add `getMyRole(email)` as a third parallel fetch, matching `template/page.tsx`'s existing pattern). Compute `canEdit = canManageTaskTemplateGroups(roleResult)` the same way. Update the file's header comment (currently says "no `getMyRole` call here" — no longer true) and pass `canEdit={canEdit}` to `<TemplateGroupDashboard>`.

- [ ] **Step 3: Add `canEdit` prop to `TemplateGroupDashboard` and gate the buttons**

Read `src/task-manager/ui/template-group-dashboard.tsx` in full (already familiar from this session's earlier work — the `GroupActions` subcomponent renders Assign/View Assignees/Edit/Delete; the top-level component renders "+ New {label}").

Add `canEdit?: boolean` prop (default `true` — so any other future caller that doesn't pass it keeps today's behavior, though both current callers will always pass it explicitly). When `canEdit` is `false`:
- Don't render the "+ New {label}" button at all.
- Don't render any of `GroupActions`' four buttons (Assign, View Assignees, Edit, Delete) — pass `canEdit` down to `GroupActions` and wrap its returned JSX in a conditional, or return `null`/empty fragment when `canEdit` is false (view-only users still see the card's name/task-count/preview, just no action buttons).

Keep the grid/list view toggle and card rendering itself completely unaffected — only the action buttons are gated.

- [ ] **Step 4: Type-check, test, build**

Run `npx tsc --noEmit`, `npm test`, `npm run build`.

- [ ] **Step 5: Live-DB + manual trace verification**

Extend or write a new disposable script confirming `canEdit` computes correctly for each role type (reuse Task 2 Step 5's role-fixture accounts). Since browser verification isn't available, trace through `template-group-dashboard.tsx`'s JSX by hand to confirm a `canEdit=false` render genuinely omits every action button, not just visually hides them insecurely (e.g. don't rely on CSS `display:none` — omit from the render tree).

- [ ] **Step 6: Commit**

```bash
git add src/app/task-manager/template/page.tsx src/app/task-manager/package/page.tsx src/task-manager/ui/template-group-dashboard.tsx
git commit -m "feat(task-manager): apply canEdit gating to Template/Package action buttons"
```

---

## Task 5: Package Table — View-tier gate

**Files:**
- Modify: `src/app/task-manager/package-table/page.tsx`

**Context:** This page is currently a bare "Coming soon" placeholder with zero data model and zero access control beyond the login redirect (confirmed in research). This task adds the View-tier gate only — there is no Edit-tier content to gate yet.

- [ ] **Step 1: Add the view-access check**

Read the current file in full (short — quoted in full during research). After the existing `if (!session?.user?.email) redirect("/login");`, add a Task Manager role check:

```ts
import { getMyRole } from "@/task-manager/data";
import { taskManagerNavAccess } from "@/task-manager/role-views";
import { FlowBridgeError, NoAccountError, SetupPendingError } from "@/task-manager/data";
```

(Confirm exact export locations/names against the barrel — `getMyRole` and the error classes are already used identically in `template/page.tsx`/`package/page.tsx`; mirror their exact try/catch/error-branching pattern, including the `SetupPendingCard`/`NoAccountCard`/`TaskManagerErrorCard` status cards, rather than inventing a new error-handling shape.)

```tsx
let access;
try {
  const roleResult = await getMyRole(email);
  access = taskManagerNavAccess(roleResult);
} catch (err) {
  // same three-way SetupPendingError/NoAccountError/generic handling as
  // template/page.tsx and package/page.tsx — see those files for the
  // exact card-rendering branches to copy.
}
if (access && !access.packageTable) redirect("/task-manager");
```

Add a comment marking where future Edit-tier gating belongs once real content is built:

```tsx
// When real content replaces this placeholder, gate its create/edit/
// delete actions behind canManageTaskTemplateGroups(roleResult) — same
// Edit tier as Template/Package (see role-views.ts).
```

- [ ] **Step 2: Type-check and build**

Run `npx tsc --noEmit`, `npm run build`.

- [ ] **Step 3: Live verification**

Confirm via a disposable script or direct reasoning that the same 5 role-fixture accounts from Task 2 Step 5 get the expected View-tier result here (same as Package's View tier: Super Admin/Operation/HOD/CEO/Branch Manager allowed, everyone else redirected).

- [ ] **Step 4: Commit**

```bash
git add src/app/task-manager/package-table/page.tsx
git commit -m "feat(task-manager): add View-tier access gate to Package Table"
```

---

## Task 6: Final holistic review

Not a code task — dispatch a final review agent across the whole `feat/task-manager-rbac` branch (all 5 tasks' commits together) before `finishing-a-development-branch`. Specifically re-verify, on the FINAL merged diff:
1. The sidebar and the data-layer 403 checks use the literal same two functions (`taskManagerNavAccess`/`canManageTaskTemplateGroups`) — no drift, no duplicated/hand-copied role lists anywhere.
2. `getMyRole`'s shape change didn't break any other caller (grep the whole repo, not just this branch's files).
3. Overview's existing role-views.ts-driven behavior is provably untouched (diff `role-views.ts`'s `ROLE_VIEWS`/`shows()`/`ViewRole`/`resolveViewRole` — zero changes there, only additions).
4. The old `requireGroupAccess`/`requireGroupAssignAccess`/`isAssignCapable`/`ASSIGN_CAPABLE_ROLES` names are fully gone from `template-groups.ts` (and any stale references in comments elsewhere in the file/repo are updated, not just the call sites).
5. Full test suite + build clean.
