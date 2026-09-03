# Package Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/task-manager/package-table` placeholder with a real scheduling grid: Branches (rows) × Wed–Sun (columns), each cell a package selector. Setting a cell creates a genuine, ongoing recurring weekly task assignment for that branch's manager; changing/clearing it cancels the old one precisely, without touching that manager's other-day assignments.

**Architecture:** A new durable config table, `BranchPackageSchedule` (branch, weekday) → packageGroupId, is the source of truth the grid reads/writes. Setting a cell resolves the branch's Branch Manager and fans out through the EXISTING recurring-assignment engine (`assignFlowTaskCore`, already confirmed to auto-perpetuate weekly via `src/task-manager/engine/recurrence.ts` — no new automation infrastructure needed). Clearing/changing a cell needs NEW weekday-aware cancellation logic, because the existing cancel primitives (`cancelPendingTemplateRuns`) only scope by `(templateId, assigneeId)` with no day-of-week filter — confirmed via direct code reading that reusing them unmodified would collateral-cancel a different weekday's assignment of the same package for the same manager.

**Tech Stack:** Next.js 16 App Router / Server Actions, Prisma (Task Manager's own `TASK_MANAGER_DATABASE_URL` client), Vitest.

---

## Confirmed design decisions (do not deviate)

1. **One package per cell** (not multi-select).
2. **Real auto-assignment** — setting a cell creates a live recurring `cadence:"daily"` assignment via the existing engine, not just a reference/config-only record.
3. **Ongoing recurring rule, no week navigation** — the grid always shows the current standing configuration; there is no "this week vs next week" concept, matching how the underlying recurrence engine actually behaves (perpetuates forever until cancelled).
4. **Columns are Wed, Thu, Fri, Sat, Sun only** — deliberately excludes Mon AND Tue. This is a NEW constant, distinct from `FLOW_DAYS` (`["Tue","Wed","Thu","Fri","Sat","Sun"]`, used everywhere else in Task Manager) — do not reuse or alias `FLOW_DAYS` for this.
5. **Branches** = distinct `User.branch` values among `role === "BRANCH"` accounts (live-derived, not the static `FLOW_BRANCH_REGIONS` constant, which is unrelated/for analytics rollups).
6. **Packages are org-wide-visible in this feature specifically** — every non-archived `PACKAGE`-scope `TaskTemplateGroup`, regardless of `createdById`. This deliberately DIFFERS from every other Package query in the codebase (`listTemplateGroups`, `applyTemplateGroup`, etc.), which all filter by `createdById: user.id`. Do NOT loosen the existing `applyTemplateGroup`'s ownership filter to achieve this — write NEW, separate Core logic for Branch Package Schedule's own group lookup and fan-out, leaving `applyTemplateGroup` and every other existing Package function byte-for-byte unchanged.
7. **Branch manager resolution**: exactly one `role === "BRANCH"` user per `branch` is required. Zero or multiple → a clear 400 error naming the branch, never a silent guess.
8. **Access**: View tier = `taskManagerNavAccess(user).packageTable` (already implemented — Super Admin, elevated Operations/Optimisation dept-site, HOD, CEO, Branch Manager). Edit tier (the only tier that can set/clear cells) = `canManageTaskTemplateGroups(user)` (Super Admin + elevated dept-site only) — same as Template/Package. Branch Manager, HOD, CEO can VIEW the grid but not edit it.

---

## Task 1: Schema — `BranchPackageSchedule` model + migration

**Files:**
- Modify: `prisma/task-manager/schema.prisma`
- Create: `prisma/task-manager/migrations/<timestamp>_add_branch_package_schedule/migration.sql`

- [ ] **Step 1: Read the current schema around `TaskTemplateGroup`**

Read `prisma/task-manager/schema.prisma` in full, find the `TaskTemplateGroup` model and the `TemplateGroupScope` enum near it (added earlier this session) — the new model goes near there, following the same style (comment header explaining purpose, dated).

- [ ] **Step 2: Add the enum and model**

```prisma
enum PackageScheduleWeekday {
  WED
  THU
  FRI
  SAT
  SUN
}

// Branch Package Schedule (2026-08-07): one durable config row per
// (branch, weekday) naming which Package (a PACKAGE-scope
// TaskTemplateGroup) that branch's manager should have running that day
// — the standing source of truth the grid reads/writes. Setting a cell
// ALSO creates a real recurring cadence:"daily" assignment via the
// existing engine (src/task-manager/data/branch-package-schedule.ts);
// this row is the durable "what's configured" record, separate from the
// FlowRun/RunBlock rows the recurrence engine perpetuates weekly (those
// get replaced/cloned forward every week, this row does not).
model BranchPackageSchedule {
  id             String                 @id @default(cuid())
  branch         String
  weekday        PackageScheduleWeekday
  packageGroupId String
  packageGroup   TaskTemplateGroup      @relation(fields: [packageGroupId], references: [id], onDelete: Cascade)
  createdById    String
  createdAt      DateTime               @default(now())
  updatedAt      DateTime               @updatedAt

  @@unique([branch, weekday])
  @@index([packageGroupId])
}
```

Add the reverse relation field to the existing `TaskTemplateGroup` model:

```prisma
  branchSchedules BranchPackageSchedule[]
```

(Find the exact right spot by reading the current model's field list — add it near other relation fields, matching existing formatting/alignment style in that model.)

- [ ] **Step 2: Write the migration**

Run: `npx prisma migrate dev --config prisma.task-manager.config.ts --name add_branch_package_schedule --create-only` (from the worktree root) to generate the migration SQL from the schema diff, then read the generated file to confirm it's a clean additive migration (new enum, new table, new FK, new indexes — no destructive changes). If the CLI command isn't available/doesn't work in this environment, hand-write the migration SQL following the exact style of the existing `prisma/task-manager/migrations/20260806150000_add_template_group_scope/migration.sql` (additive `CREATE TYPE`/`CREATE TABLE`/`CREATE INDEX`/`ALTER TABLE ... ADD CONSTRAINT` statements).

- [ ] **Step 3: Regenerate the Prisma client and verify**

Run: `npx prisma generate --config prisma.task-manager.config.ts`

Run: `npx tsc --noEmit` — confirm no new errors (the schema change alone shouldn't break anything yet, since nothing references the new model until Task 2).

- [ ] **Step 4: Apply the migration to the shared dev database and verify**

This is a SHARED database (`ebright_yqtm`) used by other work — before applying, confirm via `npx prisma migrate status --config prisma.task-manager.config.ts` (or equivalent) that this migration is the only pending one and matches what you just wrote. Apply it (`npx prisma migrate deploy --config prisma.task-manager.config.ts` or `migrate dev` if that's the established convention in this repo — check how the `20260806150000_add_template_group_scope` migration was applied earlier this session for the exact command/process to mirror). Verify via a disposable script that `prisma.branchPackageSchedule.findMany()` and `prisma.branchPackageSchedule.count()` succeed against the real DB (should return `0`/empty, confirming the table exists and is queryable) — delete the script after.

- [ ] **Step 5: Commit**

```bash
git add prisma/task-manager/schema.prisma prisma/task-manager/migrations/ src/generated/task-manager-client
git commit -m "feat(task-manager): add BranchPackageSchedule model for Package Table"
```

(Remember to also stage the regenerated Prisma client — this codebase's established convention, per multiple earlier commits this session, is that the regenerated client must be committed alongside schema changes, not left uncommitted.)

---

## Task 2: Data layer — weekday-scoped cancellation + Branch Package Schedule functions

**Files:**
- Modify: `src/task-manager/data/templates-internal.ts` (extend `cancelPendingTemplateRuns`)
- Create: `src/task-manager/data/branch-package-schedule.ts`

**Context:** Read `src/task-manager/data/templates-internal.ts`'s current `cancelPendingTemplateRuns` in full before touching it (already extended once this session with an optional `assigneeId` — you're adding a second optional param, keeping both existing call sites working unchanged). Read `src/task-manager/data/tasks-internal.ts`'s `DAY_INDEX` constant (`Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0`) — you'll need the same weekday→JS-`Date.getDay()` mapping.

- [ ] **Step 1: Extend `cancelPendingTemplateRuns` with an optional weekday filter**

In `src/task-manager/data/templates-internal.ts`, change the signature to add a 5th optional param and filter by it when present:

```ts
export async function cancelPendingTemplateRuns(
  actorId: string,
  templateId: string,
  reason: string,
  assigneeId?: string,
  dueWeekday?: number, // JS Date.getDay() value (0=Sun..6=Sat) — matches DAY_INDEX in tasks-internal.ts
) {
  const blocks = await prisma.runBlock.findMany({
    where: {
      templateId,
      ...(assigneeId ? { assigneeId } : {}),
      run: { status: { not: "CANCELLED" }, archivedAt: null },
    },
    select: { runId: true, status: true, dueAt: true },
  });
  const matchingBlocks =
    dueWeekday === undefined ? blocks : blocks.filter((b) => b.dueAt?.getDay() === dueWeekday);
  const pendingRunIds = [
    ...new Set(
      matchingBlocks
        .filter((b) => (PENDING_STATUSES as readonly string[]).includes(b.status))
        .map((b) => b.runId),
    ),
  ];
  if (pendingRunIds.length > 0) {
    await prisma.flowRun.updateMany({
      where: { id: { in: pendingRunIds } },
      data: { status: "CANCELLED" },
    });
    await prisma.auditLog.create({
      data: {
        actorId,
        action: "RUN_CANCELLED",
        detail: {
          reason,
          templateId,
          cancelledRuns: pendingRunIds.length,
          ...(assigneeId ? { assigneeId } : {}),
          ...(dueWeekday !== undefined ? { dueWeekday } : {}),
        },
      },
    });
  }
  return { removedTasks: pendingRunIds.length, keptRecords: matchingBlocks.length - pendingRunIds.length };
}
```

Update the function's doc comment to describe the new parameter. Update the file's header comment if it enumerates the function's callers/params (check first).

- [ ] **Step 2: Write the failing tests for the weekday filter behavior**

This is the highest-risk logic in the whole feature — write a live-DB verification script (not a unit test, since it needs real `RunBlock`/`FlowRun` rows) that specifically proves the collision this task exists to prevent is actually prevented:
1. Create a throwaway `TaskTemplate` (or reuse an existing test template) and a real user as assignee.
2. Create TWO `RunBlock`s (via `assignFlowTaskCore` or direct Prisma create) for the same `(templateId, assigneeId)` but different `dueAt` — one on a Wednesday, one on a Thursday (use `nextOccurrence`-style logic or hand-compute two real upcoming dates on those weekdays).
3. Call `cancelPendingTemplateRuns(actorId, templateId, "test", assigneeId, 3 /* Wed */)`.
4. Confirm the Wednesday `RunBlock`'s `FlowRun` is now `CANCELLED`, and the Thursday one is STILL its original pending status (not cancelled) — this is the exact scenario the research confirmed was a real collision risk with the old 4-param version.
5. Clean up all test data created (delete the FlowRuns/RunBlocks/TaskTemplate you created) before the script exits.

This is exploratory/verification, not a formal Vitest suite (no existing test infrastructure mocks the Task Manager Prisma client per this codebase's established convention of live-DB verification for data-layer changes) — but it's REQUIRED before proceeding, not optional, given this is the exact risk the whole task exists to close.

- [ ] **Step 3: Create `src/task-manager/data/branch-package-schedule.ts`**

```ts
// Branch Package Schedule (2026-08-07): the Package Table page's data
// layer — a durable (branch, weekday) → Package config, backed by
// automatic recurring task assignment via the existing engine. See
// BranchPackageSchedule's schema comment for the model. Deliberately
// separate from template-groups.ts's applyTemplateGroup/listTemplateGroups
// (which are per-creator-owned, createdById-scoped) — packages are
// org-wide-visible here by design (confirmed 2026-08-07), so this file's
// own group lookups do NOT filter by createdById, and its own fan-out
// logic is a parallel, independent implementation of applyTemplateGroup's
// shape rather than a call to it — see requireGroupEditAccess/
// canManageTaskTemplateGroups still gating WHO may call these functions,
// same as everywhere else; only the group VISIBILITY differs.
import { z } from "zod";
import { prisma } from "../prisma";
import { ApiHttpError } from "../lib/api-server";
import { native, requireUserByEmail } from "./core";
import { canManageTaskTemplateGroups, taskManagerNavAccess } from "../role-views";
import { cancelPendingTemplateRuns } from "./templates-internal";
import { assignFlowTaskCore } from "./tasks-internal";
import type { FlowAssignInput } from "../ui/types";

export const PACKAGE_TABLE_WEEKDAYS = ["Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type PackageTableWeekday = (typeof PACKAGE_TABLE_WEEKDAYS)[number];

const WEEKDAY_TO_PRISMA: Record<PackageTableWeekday, "WED" | "THU" | "FRI" | "SAT" | "SUN"> = {
  Wed: "WED",
  Thu: "THU",
  Fri: "FRI",
  Sat: "SAT",
  Sun: "SUN",
};
// JS Date.getDay() values, matching tasks-internal.ts's DAY_INDEX.
const WEEKDAY_TO_JS_DAY: Record<PackageTableWeekday, number> = {
  Sun: 0,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

async function requireViewAccess(email: string) {
  const user = await requireUserByEmail(email);
  if (!taskManagerNavAccess(user).packageTable) {
    throw new ApiHttpError(403, "You don't have access to view the package table");
  }
  return user;
}

async function requireEditAccess(email: string) {
  const user = await requireUserByEmail(email);
  if (!canManageTaskTemplateGroups(user)) {
    throw new ApiHttpError(403, "Only Super Admin and Operations can manage the package table");
  }
  return user;
}

export interface BranchPackageOption {
  id: string;
  name: string;
}

export interface BranchPackageScheduleCell {
  branch: string;
  weekday: PackageTableWeekday;
  packageGroupId: string | null;
  packageName: string | null;
}

export interface BranchPackageScheduleData {
  branches: string[];
  weekdays: readonly PackageTableWeekday[];
  cells: BranchPackageScheduleCell[];
  packages: BranchPackageOption[];
}

/** Full grid data: canonical branch list (distinct role=BRANCH users'
 *  `branch` field), every non-archived Package org-wide (see file
 *  header — deliberately not createdById-scoped), and the current
 *  (branch, weekday) -> package config. */
export function listBranchPackageSchedule(email: string): Promise<BranchPackageScheduleData> {
  return native(async () => {
    await requireViewAccess(email);

    const branchUsers = await prisma.user.findMany({
      where: { role: "BRANCH", branch: { not: null } },
      select: { branch: true },
      distinct: ["branch"],
      orderBy: { branch: "asc" },
    });
    const branches = branchUsers.map((u) => u.branch as string);

    const packageGroups = await prisma.taskTemplateGroup.findMany({
      where: { scope: "PACKAGE", archivedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    const existing = await prisma.branchPackageSchedule.findMany({
      include: { packageGroup: { select: { name: true } } },
    });
    const existingByKey = new Map(existing.map((e) => [`${e.branch}:${e.weekday}`, e]));

    const cells: BranchPackageScheduleCell[] = [];
    for (const branch of branches) {
      for (const weekday of PACKAGE_TABLE_WEEKDAYS) {
        const row = existingByKey.get(`${branch}:${WEEKDAY_TO_PRISMA[weekday]}`);
        cells.push({
          branch,
          weekday,
          packageGroupId: row?.packageGroupId ?? null,
          packageName: row?.packageGroup.name ?? null,
        });
      }
    }

    return { branches, weekdays: PACKAGE_TABLE_WEEKDAYS, cells, packages: packageGroups };
  }, "listBranchPackageSchedule");
}

const setCellSchema = z.object({
  branch: z.string().trim().min(1).max(100),
  weekday: z.enum(PACKAGE_TABLE_WEEKDAYS),
  packageGroupId: z.string().min(1).nullable(),
});
export type SetBranchPackageScheduleCellInput = z.input<typeof setCellSchema>;

/** Resolve exactly one Branch Manager for `branch` — errors (never
 *  guesses) if zero or more than one exist. */
async function requireSingleBranchManager(branch: string) {
  const managers = await prisma.user.findMany({
    where: { branch, role: "BRANCH" },
    select: { id: true, name: true },
  });
  if (managers.length === 0) {
    throw new ApiHttpError(400, `No branch manager found for ${branch}`);
  }
  if (managers.length > 1) {
    throw new ApiHttpError(
      400,
      `Multiple branch managers found for ${branch} — resolve this before scheduling`,
    );
  }
  return managers[0];
}

/** Cancel the OLD package's recurring assignment for this manager, scoped
 *  to exactly this weekday (see file header + templates-internal.ts's
 *  cancelPendingTemplateRuns for why the weekday filter is required —
 *  without it this would also cancel the same manager's OTHER-weekday
 *  assignment of the same package). Loops over every member TaskTemplate
 *  of the old package group, same shape as template-groups.ts's
 *  removeGroupAssignee, but weekday-scoped. */
async function cancelWeekdayAssignment(
  actorId: string,
  packageGroupId: string,
  assigneeId: string,
  weekday: PackageTableWeekday,
) {
  const group = await prisma.taskTemplateGroup.findFirst({
    where: { id: packageGroupId, scope: "PACKAGE" },
    include: { templates: { select: { id: true } } },
  });
  if (!group) return; // old package was deleted already — nothing to cancel
  for (const t of group.templates) {
    await cancelPendingTemplateRuns(
      actorId,
      t.id,
      "branch-package-schedule-cell-changed",
      assigneeId,
      WEEKDAY_TO_JS_DAY[weekday],
    );
  }
}

/** Assign the NEW package to this manager for this weekday, via the
 *  existing recurring-assignment engine (cadence:"daily" + a single day
 *  = an auto-perpetuating weekly series, see engine/recurrence.ts).
 *  Deliberately does NOT call template-groups.ts's applyTemplateGroup —
 *  that function's group lookup is createdById-scoped (per-creator
 *  ownership), but Branch Package Schedule's packages are org-wide
 *  visible (see file header) — this is a parallel implementation of the
 *  same fan-out shape, without the ownership filter. */
async function assignWeekday(
  actor: { id: string; role: string; department: string | null },
  packageGroupId: string,
  managerId: string,
  weekday: PackageTableWeekday,
) {
  const group = await prisma.taskTemplateGroup.findFirst({
    where: { id: packageGroupId, scope: "PACKAGE" },
    include: { templates: { orderBy: { groupPosition: "asc" } } },
  });
  if (!group) throw new ApiHttpError(404, "Package not found");
  for (const t of group.templates) {
    const subtasks = Array.isArray(t.subtasks) ? (t.subtasks as string[]) : [];
    await assignFlowTaskCore(actor, {
      title: t.title,
      subtasks: subtasks.length > 0 ? subtasks : undefined,
      userIds: [managerId],
      days: [weekday],
      cadence: "daily",
      fromTemplateId: t.id,
    } satisfies FlowAssignInput);
  }
}

/** Set (or clear, if `packageGroupId` is null) one grid cell. Resolves the
 *  branch's single Branch Manager, cancels any prior package's
 *  weekday-scoped recurring assignment for them, and — if a new package
 *  was selected — creates the new one. Upserts the durable
 *  BranchPackageSchedule config row to match. */
export function setBranchPackageScheduleCell(
  email: string,
  input: SetBranchPackageScheduleCellInput,
): Promise<{ ok: true }> {
  return native(async () => {
    const actor = await requireEditAccess(email);
    const body = setCellSchema.parse(input);
    const manager = await requireSingleBranchManager(body.branch);
    const prismaWeekday = WEEKDAY_TO_PRISMA[body.weekday];

    const existingRow = await prisma.branchPackageSchedule.findUnique({
      where: { branch_weekday: { branch: body.branch, weekday: prismaWeekday } },
    });

    if (existingRow) {
      await cancelWeekdayAssignment(actor.id, existingRow.packageGroupId, manager.id, body.weekday);
    }

    if (body.packageGroupId === null) {
      if (existingRow) {
        await prisma.branchPackageSchedule.delete({ where: { id: existingRow.id } });
      }
      return { ok: true };
    }

    await assignWeekday(actor, body.packageGroupId, manager.id, body.weekday);

    await prisma.branchPackageSchedule.upsert({
      where: { branch_weekday: { branch: body.branch, weekday: prismaWeekday } },
      create: {
        branch: body.branch,
        weekday: prismaWeekday,
        packageGroupId: body.packageGroupId,
        createdById: actor.id,
      },
      update: { packageGroupId: body.packageGroupId },
    });

    return { ok: true };
  }, "setBranchPackageScheduleCell");
}
```

Note: `assignFlowTaskCore`'s `actor` param type is `{ id: string; role: string; department: string | null }` — `requireUserByEmail`'s return (the Task Manager `User` row) already has these fields, so `actor` from `requireEditAccess` can be passed straight through; double-check the exact field names line up by reading `requireUserByEmail`'s return type before assuming.

- [ ] **Step 4: Live-DB verification of the FULL cell-set/cell-clear/cell-change flow**

Using real (or carefully-created-then-deleted throwaway) data:
1. Find a real branch with exactly one Branch Manager and a real Package (or create a throwaway one).
2. Call `setBranchPackageScheduleCell` to set Wednesday = Package A. Confirm: a `BranchPackageSchedule` row now exists; a real pending `RunBlock`/`FlowRun` now exists for the manager, due next Wednesday, `cadence: DAILY`.
3. Call `listBranchPackageSchedule` — confirm the grid reflects Wednesday = Package A for that branch.
4. Set Thursday = Package A too (same package, different day) for the SAME manager.
5. Change Wednesday to Package B (or clear it to null). Confirm: the OLD Wednesday `RunBlock` is now `CANCELLED`; the Thursday `RunBlock` (still Package A) is UNCHANGED/still pending — this is the exact collision-prevention proof from Step 2, now verified end-to-end through the real public functions, not just the low-level primitive.
6. Confirm `requireSingleBranchManager` correctly errors for a branch with zero or multiple managers (find or contrive such a case, or verify by temporarily... do NOT temporarily mutate real user roles/branches to manufacture this — instead verify by reading the code path carefully and/or picking an obscure branch name that genuinely has zero BRANCH-role users, which is easy to find without mutating anything).
7. Clean up ALL test data created (delete any BranchPackageSchedule rows, cancel any RunBlocks/FlowRuns you created, delete any throwaway TaskTemplateGroup) before finishing. This is a shared database.

- [ ] **Step 5: Type-check, test, build**

Run `npx tsc --noEmit`, `npm test`, `npm run build`.

- [ ] **Step 6: Commit**

```bash
git add src/task-manager/data/templates-internal.ts src/task-manager/data/branch-package-schedule.ts
git commit -m "feat(task-manager): add Branch Package Schedule data layer with weekday-scoped cancellation"
```

---

## Task 3: UI — the grid and wiring it into `package-table/page.tsx`

**Files:**
- Create: `src/task-manager/ui/branch-package-schedule-grid.tsx`
- Modify: `src/app/task-manager/package-table/page.tsx`

**Context:** Read `src/task-manager/ui/manpower-schedule-grid.tsx`'s `EditableCell` (the select-in-cell, `onChange`-fires-immediately pattern) as the closest existing UI precedent — mirror its interaction shape (plain `<select>`, `useTransition`, inline per-cell error message), even though the underlying data model is different. Read the CURRENT `src/app/task-manager/package-table/page.tsx` (has the View-tier gate from the RBAC branch, already merged) before editing — you're replacing its placeholder body, not its access-control logic.

- [ ] **Step 1: Build the grid component**

`src/task-manager/ui/branch-package-schedule-grid.tsx`, `"use client"`. Props: `data: BranchPackageScheduleData`, `canEdit: boolean`, `onSetCell: (branch, weekday, packageGroupId: string | null) => Promise<{ok:boolean; message?:string}>`.

Render a table: header row = blank + `PACKAGE_TABLE_WEEKDAYS` (Wed–Sun) as column labels; one row per branch; each cell (branch × weekday) is either:
- `canEdit === true`: a `<select>` bound to that cell's current `packageGroupId` (or empty for "none"), options = `data.packages` (+ a "–" / "None" option), `onChange` calls `onSetCell` inside `startTransition`, shows a per-cell inline error if the result isn't ok (mirror `manpower-schedule-grid.tsx`'s `EditableCell` error-display pattern).
- `canEdit === false`: plain text showing the cell's `packageName` (or "–" if empty) — no interactive control at all (matches the established `canEdit` pattern from the RBAC work: view-only users get content, no actionable controls).

- [ ] **Step 2: Wire it into `package-table/page.tsx`**

Replace the placeholder body. Fetch `listBranchPackageSchedule(email)` and compute `canEdit` the same way `template/page.tsx`/`package/page.tsx` already do (`canManageTaskTemplateGroups(role)`, where `role` comes from `getMyRole`, already fetched by this page's existing View-tier gate — reuse that same `role` value, don't fetch it twice). Define a `"use server"` closure `setCell(branch, weekday, packageGroupId)` calling `setBranchPackageScheduleCell`, matching the `requireLiveSession`/error-handling pattern every other Task Manager page action closure uses (read `template/page.tsx`'s `createGroup`/`editGroup` closures for the exact shape to copy). `revalidatePath("/task-manager/package-table")` on success.

- [ ] **Step 3: Type-check, build**

Run `npx tsc --noEmit`, `npm run build`.

- [ ] **Step 4: Verification**

No browser automation available — verify via careful code tracing (confirm a `canEdit=false` viewer sees plain text everywhere, a `canEdit=true` viewer sees selects that call the right server action) plus a live-DB check that the page's data fetch (`listBranchPackageSchedule`) succeeds end-to-end for a real account and returns a sensible, correctly-shaped grid.

- [ ] **Step 5: Commit**

```bash
git add src/task-manager/ui/branch-package-schedule-grid.tsx src/app/task-manager/package-table/page.tsx
git commit -m "feat(task-manager): build the Package Table grid UI"
```

---

## Task 4: Final holistic review

Not a code task — dispatch a final review agent across the whole `feat/package-table` branch before `finishing-a-development-branch`. Specifically re-verify on the FINAL merged diff:
1. The weekday-collision-prevention scenario from Task 2 Step 4, one more time, fresh, end-to-end through the real page/server-action path (not just the data-layer functions directly).
2. `applyTemplateGroup` and every other existing Package/Template function are byte-for-byte unchanged — confirm via diff that only NEW files/functions were added, nothing existing was modified to achieve the org-wide-visibility exception.
3. The migration was actually applied to the shared dev database (not just written) — confirm `BranchPackageSchedule` is genuinely queryable.
4. `requireSingleBranchManager`'s zero/multiple-manager error paths both genuinely trigger correctly (re-verify, don't just trust Task 2's report).
5. Full test suite + build clean.
