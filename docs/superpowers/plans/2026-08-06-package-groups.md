# Package (Branch-Manager Template Groups) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build out `/task-manager/package` as a second, Branch-Manager-only instance of the already-shipped Template Groups feature, by adding a `scope` discriminator to the existing model/data-layer/UI rather than forking a parallel feature.

**Architecture:** Add a `TemplateGroupScope` enum (`TEMPLATE | PACKAGE`) to the existing `TaskTemplateGroup` model. Every function in `src/task-manager/data/template-groups.ts` gains a `scope` parameter, threaded into every query/write and into a new scope-aware `requireGroupAccess` check (replacing the shared `requireAssigner`, which stays untouched so the old single-task template hub's access is unaffected). The three existing UI components gain one optional `label` prop for copy text. A new page mirrors the existing `/task-manager/template/page.tsx`'s wiring almost exactly, bound to `scope: "PACKAGE"` and gated to Branch Manager only.

**Tech Stack:** Next.js 16 App Router (Server Actions), Prisma 7 + `@prisma/adapter-pg`, Zod, React 19, Tailwind v4.

**Testing note (same deviation from strict TDD as the Template Groups plan):** This codebase verifies Task Manager data-layer code live against the dev Postgres database with disposable `tsx` scripts, not Vitest — there is no mocking layer for Prisma here, and the sibling single-task `data/templates.ts` (687 lines) has zero unit tests either. This plan follows that convention: the data-layer task ends with a live verification script, not a Vitest suite.

Reference spec: `docs/superpowers/specs/2026-08-06-package-groups-design.md`
Reference (unmodified by this plan except where noted): `docs/superpowers/specs/2026-08-06-task-template-groups-design.md`

---

### Task 1: Schema — `TemplateGroupScope` enum + `scope` field + migration

**Files:**
- Modify: `prisma/task-manager/schema.prisma` (add enum, add field to `TaskTemplateGroup`)
- Create: `prisma/task-manager/migrations/20260806150000_add_template_group_scope/migration.sql`

- [ ] **Step 1: Add the enum and the field**

Insert a new enum directly above the `TaskTemplateGroup` model (find it by content search — it currently reads `model TaskTemplateGroup {` with `id`, `createdById`, `name`, `archivedAt`, `createdAt`, `updatedAt`, `templates`, and `@@index([createdById])`):

```prisma
enum TemplateGroupScope {
  TEMPLATE
  PACKAGE
}

```

Add a `scope` field to `TaskTemplateGroup`, directly after `name` and before `archivedAt`:

```prisma
  scope       TemplateGroupScope @default(TEMPLATE)
```

Add a second index alongside the model's existing `@@index([createdById])`:

```prisma
  @@index([createdById])
  @@index([scope])
```

The full model should now read:

```prisma
model TaskTemplateGroup {
  id          String              @id @default(cuid())
  createdById String
  name        String
  scope       TemplateGroupScope  @default(TEMPLATE)
  archivedAt  DateTime?
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt

  templates   TaskTemplate[]

  @@index([createdById])
  @@index([scope])
}
```

- [ ] **Step 2: Write the migration SQL**

```sql
-- Package scope for Template Groups (2026-08-06): adds a scope
-- discriminator so the same TaskTemplateGroup/TaskTemplate tables can
-- power two separate pages — Template (open to assign-capable roles +
-- Branch Manager) and Package (Branch-Manager-only) — without sharing
-- data. Every existing row defaults to TEMPLATE, matching its current
-- behavior exactly (no backfill needed).
CREATE TYPE "TemplateGroupScope" AS ENUM ('TEMPLATE', 'PACKAGE');

ALTER TABLE "TaskTemplateGroup" ADD COLUMN "scope" "TemplateGroupScope" NOT NULL DEFAULT 'TEMPLATE';

CREATE INDEX "TaskTemplateGroup_scope_idx" ON "TaskTemplateGroup"("scope");
```

- [ ] **Step 3: Apply the migration and regenerate the client**

Run: `npm run tm:migrate`
Expected: `Applying migration 20260806150000_add_template_group_scope` then `The following migration(s) have been applied: ...` with exit code 0.

Run: `npm run tm:generate`
Expected: `Generated Prisma Client` with exit code 0.

- [ ] **Step 4: Verify live against the dev database**

Create a temporary script `scratch-verify-scope.ts` at the repo root:

```ts
import { PrismaClient } from "./src/generated/task-manager-client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.TASK_MANAGER_DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const defaulted = await prisma.taskTemplateGroup.create({
    data: { createdById: "verify-script", name: "verify-scope-default" },
  });
  console.log("default scope:", defaulted.scope); // expect "TEMPLATE"

  const pkg = await prisma.taskTemplateGroup.create({
    data: { createdById: "verify-script", name: "verify-scope-package", scope: "PACKAGE" },
  });
  console.log("explicit scope:", pkg.scope); // expect "PACKAGE"

  await prisma.taskTemplateGroup.delete({ where: { id: defaulted.id } });
  await prisma.taskTemplateGroup.delete({ where: { id: pkg.id } });
  console.log("cleaned up ok");
  await prisma.$disconnect();
}
main();
```

Run: `npx tsx --env-file=.env scratch-verify-scope.ts`
Expected: `default scope: TEMPLATE`, `explicit scope: PACKAGE`, `cleaned up ok`, exit code 0.

Delete the script afterward: `rm scratch-verify-scope.ts`

- [ ] **Step 5: Commit**

```bash
git add prisma/task-manager/schema.prisma prisma/task-manager/migrations/20260806150000_add_template_group_scope
git commit -m "feat(task-manager): add TemplateGroupScope for Package/Template data separation"
```

---

### Task 2: Data layer — thread `scope` through `template-groups.ts`, update Template's page callers

**Files:**
- Modify: `src/task-manager/data/template-groups.ts` (full rewrite of function bodies — signatures, auth, queries)
- Modify: `src/app/task-manager/template/page.tsx` (update all 7 data-layer call sites to pass `"TEMPLATE"`)

This is a breaking signature change to shared functions — both files must be updated together so the branch compiles at every commit in this task.

- [ ] **Step 1: Replace the full content of `src/task-manager/data/template-groups.ts`**

```ts
// Task Template Groups (2026-08-06): a named collection of several
// top-level TaskTemplate rows — grouping layer only. Each task inside a
// group is an ORDINARY TaskTemplate row (templateGroupId set, groupPosition
// for display order); all cascade-safety (pending-assignment cancellation,
// edit propagation, deletion impact) is delegated to the existing
// single-task functions in ./templates — this module only orchestrates
// them across a group's members and adds the group wrapper itself.
// Creating/editing a group never touches recipients/days/due-date/cadence —
// "Assign" (applyTemplateGroup) is a separate action that picks those once
// and fans out to assignFlowTask per member task.
//
// Scope (2026-08-06): this same data model/logic powers TWO pages —
// /task-manager/template ("Template", scope TEMPLATE) open to every
// assign-capable role PLUS Branch Manager, and /task-manager/package
// ("Package", scope PACKAGE) restricted to Branch Manager only. Every
// function below takes `scope` and threads it through every query/write,
// so the two pages' data can never cross. Authorization is scope-aware via
// requireGroupAccess (below) — deliberately NOT the shared requireAssigner
// in ./templates, since editing that would also widen the OLD single-task
// "+ Task -> Start from a template" hub's access, which nobody asked for.
import { z } from "zod";
import type { Prisma, TemplateGroupScope } from "@/generated/task-manager-client";
import { ApiHttpError } from "../lib/api-server";
import { prisma } from "../prisma";
import { isElevatedDeptSite } from "../analytics/_lib";
import { native, requireUserByEmail } from "./core";
import { deleteTaskTemplate, editTaskTemplate, getTemplateDeletionImpact } from "./templates";
import { assignFlowTask } from "./tasks";
import { FLOW_DAYS, type FlowAssignInput } from "../ui/types";

const GROUP_TASK_MAX = 20;

const NOUN: Record<TemplateGroupScope, string> = { TEMPLATE: "template", PACKAGE: "package" };
const NOT_FOUND_MESSAGE: Record<TemplateGroupScope, string> = {
  TEMPLATE: "Template not found",
  PACKAGE: "Package not found",
};

/** Scope-aware authorization: TEMPLATE keeps the existing assign-capable
 *  allow-list, now also including Branch Manager; PACKAGE is Branch
 *  Manager only. Deliberately separate from ./templates's requireAssigner
 *  — see the file header for why that shared helper stays untouched. */
async function requireGroupAccess(email: string, scope: TemplateGroupScope) {
  const user = await requireUserByEmail(email);
  const allowed =
    scope === "PACKAGE"
      ? user.role === "BRANCH"
      : user.role === "ADMIN" ||
        user.role === "OPS" ||
        user.role === "CEO" ||
        user.role === "HOD" ||
        user.role === "BRANCH" ||
        isElevatedDeptSite(user);
  if (!allowed) {
    throw new ApiHttpError(
      403,
      scope === "PACKAGE"
        ? "Only branch managers can manage packages"
        : "Only assign-capable accounts can manage task templates",
    );
  }
  return user;
}

const groupTaskSchema = z.object({
  /** Present = an existing member being kept (edit reconciliation); absent
   *  = a new task to create. */
  id: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(200),
  subtasks: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
});

const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  tasks: z.array(groupTaskSchema.omit({ id: true })).min(1).max(GROUP_TASK_MAX),
});
export type CreateTemplateGroupInput = z.input<typeof createGroupSchema>;

const editGroupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  tasks: z.array(groupTaskSchema).min(1).max(GROUP_TASK_MAX),
});
export type EditTemplateGroupInput = z.input<typeof editGroupSchema>;

export interface TemplateGroupSummary {
  id: string;
  name: string;
  taskCount: number;
  /** First 3 member task titles, group order — dashboard card preview. */
  previewTitles: string[];
  updatedAt: string; // ISO
}

export interface TemplateGroupTask {
  id: string;
  title: string;
  subtasks: string[];
}

export interface TemplateGroupDetail {
  id: string;
  name: string;
  tasks: TemplateGroupTask[];
}

/** Cards data for the /task-manager/template or /task-manager/package dashboard. */
export function listTemplateGroups(
  email: string,
  scope: TemplateGroupScope,
): Promise<TemplateGroupSummary[]> {
  return native(async () => {
    const user = await requireGroupAccess(email, scope);
    const groups = await prisma.taskTemplateGroup.findMany({
      where: { createdById: user.id, scope, archivedAt: null },
      orderBy: { updatedAt: "desc" },
      include: {
        templates: {
          orderBy: { groupPosition: "asc" },
          select: { title: true },
        },
      },
    });
    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      taskCount: g.templates.length,
      previewTitles: g.templates.slice(0, 3).map((t) => t.title),
      updatedAt: g.updatedAt.toISOString(),
    }));
  }, "listTemplateGroups");
}

/** Full detail for the Edit modal's prefill. */
export function getTemplateGroup(
  email: string,
  groupId: string,
  scope: TemplateGroupScope,
): Promise<TemplateGroupDetail> {
  return native(async () => {
    const user = await requireGroupAccess(email, scope);
    const id = z.string().min(1).parse(groupId);
    const group = await prisma.taskTemplateGroup.findFirst({
      where: { id, createdById: user.id, scope },
      include: { templates: { orderBy: { groupPosition: "asc" } } },
    });
    if (!group) throw new ApiHttpError(404, NOT_FOUND_MESSAGE[scope]);
    return {
      id: group.id,
      name: group.name,
      tasks: group.templates.map((t) => ({
        id: t.id,
        title: t.title,
        subtasks: Array.isArray(t.subtasks) ? (t.subtasks as string[]) : [],
      })),
    };
  }, "getTemplateGroup");
}

/** Creates the group and every member task in one transaction — never
 *  touches recipients/days/due-date/cadence (create-only, no assignee). */
export function createTemplateGroup(
  email: string,
  scope: TemplateGroupScope,
  input: CreateTemplateGroupInput,
): Promise<{ id: string }> {
  return native(async () => {
    const user = await requireGroupAccess(email, scope);
    const body = createGroupSchema.parse(input);
    const group = await prisma.$transaction(async (tx) => {
      const g = await tx.taskTemplateGroup.create({
        data: { createdById: user.id, name: body.name, scope },
      });
      for (const [index, t] of body.tasks.entries()) {
        await tx.taskTemplate.create({
          data: {
            createdById: user.id,
            name: t.title,
            title: t.title,
            subtasks: t.subtasks as unknown as Prisma.InputJsonValue,
            templateGroupId: g.id,
            groupPosition: index,
          },
        });
      }
      return g;
    });
    return { id: group.id };
  }, "createTemplateGroup");
}

export interface EditTemplateGroupResult {
  updatedTasks: number;
  createdTasks: number;
  removedTasks: number;
  employees: number;
}

/** Renames the group and reconciles its member tasks against the submitted
 *  list: kept members (id present) go through editTaskTemplate (propagates
 *  to pending instances, same as the single-task Edit tab); removed
 *  members go through deleteTaskTemplate (cancels their pending
 *  instances); new members (id absent) are created fresh. `employees` sums
 *  per-task counts and may double-count someone with pending tasks from
 *  more than one member of this group — an acceptable approximation for a
 *  summary count, same caveat the single-task Edit panel already has.
 *  Not wrapped in a transaction across members — if one member's edit/
 *  delete throws partway through (e.g. concurrently deleted by another
 *  admin), earlier iterations' changes are already committed and the
 *  group is left partially reconciled. Accepted trade-off, matching
 *  templates.ts's own non-transactional multi-step writes; callers should
 *  treat a thrown error as "re-fetch and re-check," not "nothing happened." */
export function editTemplateGroup(
  email: string,
  groupId: string,
  scope: TemplateGroupScope,
  input: EditTemplateGroupInput,
): Promise<EditTemplateGroupResult> {
  return native(async () => {
    const user = await requireGroupAccess(email, scope);
    const id = z.string().min(1).parse(groupId);
    const body = editGroupSchema.parse(input);
    const group = await prisma.taskTemplateGroup.findFirst({
      where: { id, createdById: user.id, scope },
      select: { id: true },
    });
    if (!group) throw new ApiHttpError(404, NOT_FOUND_MESSAGE[scope]);

    await prisma.taskTemplateGroup.update({ where: { id }, data: { name: body.name } });

    const existing = await prisma.taskTemplate.findMany({
      where: { templateGroupId: id },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((t) => t.id));
    const submittedIds = new Set(body.tasks.filter((t) => t.id).map((t) => t.id as string));

    let removedTasks = 0;
    for (const memberId of existingIds) {
      if (!submittedIds.has(memberId)) {
        const result = await deleteTaskTemplate(email, memberId);
        removedTasks += result.removedTasks;
      }
    }

    let updatedTasks = 0;
    let createdTasks = 0;
    let employees = 0;
    for (const [index, t] of body.tasks.entries()) {
      if (t.id && existingIds.has(t.id)) {
        const result = await editTaskTemplate(email, t.id, { title: t.title, subtasks: t.subtasks });
        updatedTasks += result.updatedTasks;
        employees += result.employees;
        await prisma.taskTemplate.update({ where: { id: t.id }, data: { groupPosition: index } });
      } else {
        await prisma.taskTemplate.create({
          data: {
            createdById: user.id,
            name: t.title,
            title: t.title,
            subtasks: t.subtasks as unknown as Prisma.InputJsonValue,
            templateGroupId: id,
            groupPosition: index,
          },
        });
        createdTasks += 1;
      }
    }
    return { updatedTasks, createdTasks, removedTasks, employees };
  }, "editTemplateGroup");
}

export interface GroupDeletionImpact {
  pendingTasks: number;
  pendingEmployees: number;
  completedKept: number;
}

/** Aggregated pre-deletion preview across every member task — same
 *  double-counting caveat as editTemplateGroup's `employees`. */
export function getGroupDeletionImpact(
  email: string,
  groupId: string,
  scope: TemplateGroupScope,
): Promise<GroupDeletionImpact> {
  return native(async () => {
    const user = await requireGroupAccess(email, scope);
    const id = z.string().min(1).parse(groupId);
    const group = await prisma.taskTemplateGroup.findFirst({
      where: { id, createdById: user.id, scope },
      include: { templates: { select: { id: true } } },
    });
    if (!group) throw new ApiHttpError(404, NOT_FOUND_MESSAGE[scope]);
    let pendingTasks = 0;
    let pendingEmployees = 0;
    let completedKept = 0;
    for (const t of group.templates) {
      const impact = await getTemplateDeletionImpact(email, t.id);
      pendingTasks += impact.pendingTasks;
      pendingEmployees += impact.pendingEmployees;
      completedKept += impact.completedKept;
    }
    return { pendingTasks, pendingEmployees, completedKept };
  }, "getGroupDeletionImpact");
}

/** Deletes every member task (cascade-safe — see deleteTaskTemplate) then
 *  the group row itself. Not wrapped in a transaction across members — see
 *  editTemplateGroup's equivalent note for the accepted partial-failure
 *  trade-off. */
export function deleteTemplateGroup(
  email: string,
  groupId: string,
  scope: TemplateGroupScope,
): Promise<{ deleted: boolean; removedTasks: number; keptRecords: number }> {
  return native(async () => {
    const user = await requireGroupAccess(email, scope);
    const id = z.string().min(1).parse(groupId);
    const group = await prisma.taskTemplateGroup.findFirst({
      where: { id, createdById: user.id, scope },
      include: { templates: { select: { id: true } } },
    });
    if (!group) throw new ApiHttpError(404, NOT_FOUND_MESSAGE[scope]);
    let removedTasks = 0;
    let keptRecords = 0;
    for (const t of group.templates) {
      const result = await deleteTaskTemplate(email, t.id);
      removedTasks += result.removedTasks;
      keptRecords += result.keptRecords;
    }
    await prisma.taskTemplateGroup.delete({ where: { id } });
    return { deleted: true, removedTasks, keptRecords };
  }, "deleteTemplateGroup");
}

const applyGroupSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1),
  days: z.array(z.enum(FLOW_DAYS)).optional(),
  dueDate: z.string().optional(),
  cadence: z.enum(["daily", "monthly", "adhoc"]),
});
export type ApplyTemplateGroupInput = z.input<typeof applyGroupSchema>;

/** "Assign" (2026-08-06): one recipient/day/due-date/cadence choice for the
 *  WHOLE group, fanned out as one assignFlowTask call per member task —
 *  the same pipeline "Start from a template" already uses, just looped.
 *  fromTemplateId is set per task so each created assignment links back to
 *  its own TaskTemplate row. Not wrapped in a transaction across members —
 *  if one member's assignFlowTask call throws partway through, earlier
 *  iterations already created real FlowRun/RunBlock rows and the partial
 *  `created` count is lost to the caller. assignFlowTask has no idempotency
 *  guard, so a naive "retry the whole group" in response to that error
 *  would RE-ASSIGN the already-succeeded member tasks too, duplicating
 *  live tasks for the same recipients. Callers (the Assign modal) should
 *  not blindly retry on failure — surface the error and let the admin
 *  verify actual state before re-attempting. */
export function applyTemplateGroup(
  email: string,
  groupId: string,
  scope: TemplateGroupScope,
  input: ApplyTemplateGroupInput,
): Promise<{ created: number }> {
  return native(async () => {
    const user = await requireGroupAccess(email, scope);
    const id = z.string().min(1).parse(groupId);
    const body = applyGroupSchema.parse(input);
    const group = await prisma.taskTemplateGroup.findFirst({
      where: { id, createdById: user.id, scope },
      include: { templates: { orderBy: { groupPosition: "asc" } } },
    });
    if (!group) throw new ApiHttpError(404, NOT_FOUND_MESSAGE[scope]);
    if (group.templates.length === 0) {
      throw new ApiHttpError(400, `This ${NOUN[scope]} has no tasks to assign`);
    }

    let created = 0;
    for (const t of group.templates) {
      const subtasks = Array.isArray(t.subtasks) ? (t.subtasks as string[]) : [];
      const result = await assignFlowTask(email, {
        title: t.title,
        subtasks: subtasks.length > 0 ? subtasks : undefined,
        userIds: body.userIds,
        days: body.days,
        dueDate: body.dueDate,
        cadence: body.cadence,
        fromTemplateId: t.id,
      } satisfies FlowAssignInput);
      created += result.created;
    }
    return { created };
  }, "applyTemplateGroup");
}
```

- [ ] **Step 2: Update `src/app/task-manager/template/page.tsx`'s 7 call sites**

In the initial fetch (`Promise.all` block), change:
```ts
listTemplateGroups(email),
```
to:
```ts
listTemplateGroups(email, "TEMPLATE"),
```

In `loadGroup`, change:
```ts
const group = await getTemplateGroup(email, groupId);
```
to:
```ts
const group = await getTemplateGroup(email, groupId, "TEMPLATE");
```

In `createGroup`, change:
```ts
const result = await createTemplateGroup(email, input);
```
to:
```ts
const result = await createTemplateGroup(email, "TEMPLATE", input);
```

In `editGroup`, change:
```ts
const result = await editTemplateGroup(email, groupId, input);
```
to:
```ts
const result = await editTemplateGroup(email, groupId, "TEMPLATE", input);
```

In `groupImpact`, change:
```ts
const impact = await getGroupDeletionImpact(email, groupId);
```
to:
```ts
const impact = await getGroupDeletionImpact(email, groupId, "TEMPLATE");
```

In `removeGroup`, change:
```ts
const result = await deleteTemplateGroup(email, groupId);
```
to:
```ts
const result = await deleteTemplateGroup(email, groupId, "TEMPLATE");
```

In `applyGroup`, change:
```ts
const result = await applyTemplateGroup(email, groupId, input);
```
to:
```ts
const result = await applyTemplateGroup(email, groupId, "TEMPLATE", input);
```

Do not change anything else in this file — `hideCadence={role === "CEO"}`, `getMyRole`, the error-branching, and everything else stays exactly as it is (Branch Manager access now flows through automatically via `requireGroupAccess`'s widened TEMPLATE allow-list; no `getMyRole`-related change is needed since Branch Managers are not CEOs, so `hideCadence` correctly stays `false` for them).

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors from `template-groups.ts` or `template/page.tsx`.

- [ ] **Step 4: Live verification script**

This repo's `server-only` package needs a local stub for bare `tsx` execution (create if it doesn't already exist):

```bash
mkdir -p node_modules/server-only
echo "module.exports = {};" > node_modules/server-only/index.js
echo '{"name":"server-only","main":"index.js"}' > node_modules/server-only/package.json
```

Create `scratch-verify-package-scope.ts` at the repo root:

```ts
import { listTemplateGroups, createTemplateGroup, deleteTemplateGroup } from "./src/task-manager/data";
import { PrismaClient } from "./src/generated/task-manager-client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.TASK_MANAGER_DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  // Find a real Branch Manager (role BRANCH) and a real non-Branch
  // assign-capable account (e.g. HOD) in the dev DB.
  const branchManager = await prisma.user.findFirst({ where: { role: "BRANCH" } });
  const hod = await prisma.user.findFirst({ where: { role: "HOD" } });
  const member = await prisma.user.findFirst({ where: { role: "MEMBER" } });
  if (!branchManager || !hod || !member) {
    throw new Error("Missing a seeded BRANCH, HOD, or MEMBER account for this test — check the dev DB");
  }
  console.log("using", { branchManager: branchManager.email, hod: hod.email, member: member.email });

  // 1. Branch Manager can create BOTH a Template and a Package.
  const tpl = await createTemplateGroup(branchManager.email, "TEMPLATE", {
    name: "verify-scope-template",
    tasks: [{ title: "T1", subtasks: [] }],
  });
  const pkg = await createTemplateGroup(branchManager.email, "PACKAGE", {
    name: "verify-scope-package",
    tasks: [{ title: "P1", subtasks: [] }],
  });
  console.log("created", { tpl, pkg });

  // 2. Scope separation: listTemplateGroups(scope) never leaks the other scope.
  const templateList = await listTemplateGroups(branchManager.email, "TEMPLATE");
  const packageList = await listTemplateGroups(branchManager.email, "PACKAGE");
  console.log("template list has template:", templateList.some((g) => g.id === tpl.id));
  console.log("template list has package (should be false):", templateList.some((g) => g.id === pkg.id));
  console.log("package list has package:", packageList.some((g) => g.id === pkg.id));
  console.log("package list has template (should be false):", packageList.some((g) => g.id === tpl.id));

  // 3. HOD (not Branch Manager) can access Template but NOT Package.
  const hodTemplateList = await listTemplateGroups(hod.email, "TEMPLATE");
  console.log("HOD can list Template (no throw):", Array.isArray(hodTemplateList));
  try {
    await listTemplateGroups(hod.email, "PACKAGE");
    console.log("HOD listing Package: UNEXPECTEDLY SUCCEEDED (bug!)");
  } catch (e) {
    console.log("HOD listing Package correctly threw:", e instanceof Error ? e.message : e);
  }

  // 4. A plain MEMBER can access neither.
  try {
    await listTemplateGroups(member.email, "TEMPLATE");
    console.log("MEMBER listing Template: UNEXPECTEDLY SUCCEEDED (bug!)");
  } catch (e) {
    console.log("MEMBER listing Template correctly threw:", e instanceof Error ? e.message : e);
  }
  try {
    await listTemplateGroups(member.email, "PACKAGE");
    console.log("MEMBER listing Package: UNEXPECTEDLY SUCCEEDED (bug!)");
  } catch (e) {
    console.log("MEMBER listing Package correctly threw:", e instanceof Error ? e.message : e);
  }

  // Cleanup
  await deleteTemplateGroup(branchManager.email, tpl.id, "TEMPLATE");
  await deleteTemplateGroup(branchManager.email, pkg.id, "PACKAGE");
  const listAfter = await listTemplateGroups(branchManager.email, "TEMPLATE");
  console.log("template gone after delete:", !listAfter.some((g) => g.id === tpl.id));
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Run: `npx tsx --env-file=.env scratch-verify-package-scope.ts`
Expected:
- `created { tpl: { id: '...' }, pkg: { id: '...' } }`
- `template list has template: true`
- `template list has package (should be false): false`
- `package list has package: true`
- `package list has template (should be false): false`
- `HOD can list Template (no throw): true`
- `HOD listing Package correctly threw: Only branch managers can manage packages`
- `MEMBER listing Template correctly threw: Only assign-capable accounts can manage task templates`
- `MEMBER listing Package correctly threw: Only branch managers can manage packages`
- `template gone after delete: true`

If no seeded `BRANCH`-role account exists in the dev DB, report this back rather than fabricating one — ask before creating test data of a new role.

Clean up: `rm scratch-verify-package-scope.ts` and `rm -rf node_modules/server-only`.

- [ ] **Step 5: Commit**

```bash
git add src/task-manager/data/template-groups.ts src/app/task-manager/template/page.tsx
git commit -m "feat(task-manager): add scope-aware access to Template Groups, widen Template to Branch Manager"
```

---

### Task 3: UI — add `label` prop to the three shared components

**Files:**
- Modify: `src/task-manager/ui/template-group-dashboard.tsx`
- Modify: `src/task-manager/ui/template-group-form.tsx`
- Modify: `src/task-manager/ui/template-group-assign-modal.tsx`

- [ ] **Step 1: `template-group-dashboard.tsx`**

Add `label = "Template"` to the props (destructured with a default, typed as `label?: string`):

```tsx
export function TemplateGroupDashboard({
  staff,
  control,
  hideCadence = false,
  label = "Template",
}: {
  staff: FlowStaffMember[];
  control: FlowTemplateGroupControl;
  hideCadence?: boolean;
  /** Display copy override (2026-08-06) — "Template" (default) or
   *  "Package". Forwarded to both modals below. */
  label?: string;
}) {
```

Add a derived lowercase constant right after the existing state declarations:

```tsx
  const labelLower = label.toLowerCase();
```

Change the `remove()` success message:
```ts
      setMessage(result.ok ? { ok: true, text: "Template deleted." } : { ok: false, text: result.message });
```
to:
```ts
      setMessage(result.ok ? { ok: true, text: `${label} deleted.` } : { ok: false, text: result.message });
```

Change the count text:
```tsx
        <p className="text-sm text-gray-500">
          {control.list.length} template{control.list.length === 1 ? "" : "s"}
        </p>
```
to:
```tsx
        <p className="text-sm text-gray-500">
          {control.list.length} {labelLower}
          {control.list.length === 1 ? "" : "s"}
        </p>
```

Change the "+ New Template" button:
```tsx
          + New Template
```
to:
```tsx
          + New {label}
```

Change the empty state:
```tsx
          No templates yet — create one to bundle several tasks together for reuse.
```
to:
```tsx
          No {labelLower}s yet — create one to bundle several tasks together for reuse.
```

Pass `label` through to both modals:
```tsx
      {createOpen && <TemplateGroupFormModal control={control} onClose={() => setCreateOpen(false)} label={label} />}
      {editGroupId && (
        <TemplateGroupFormModal
          control={control}
          groupId={editGroupId}
          onClose={() => setEditGroupId(null)}
          label={label}
        />
      )}
      {assignedGroup && (
        <TemplateGroupAssignModal
          control={control}
          staff={staff}
          group={assignedGroup}
          onClose={() => setAssignGroupId(null)}
          hideCadence={hideCadence}
          label={label}
        />
      )}
```

- [ ] **Step 2: `template-group-form.tsx`**

Add `label = "Template"` to the props:

```tsx
export function TemplateGroupFormModal({
  control,
  groupId,
  onClose,
  label = "Template",
}: {
  control: FlowTemplateGroupControl;
  groupId?: string;
  onClose: () => void;
  /** Display copy override (2026-08-06) — "Template" (default) or "Package". */
  label?: string;
}) {
```

Add a derived lowercase constant alongside the component's other derived values (e.g. right after `isEdit`):

```tsx
  const labelLower = label.toLowerCase();
```

Change the name-required validation message:
```ts
      setMessage({ ok: false, text: "Give the template a name." });
```
to:
```ts
      setMessage({ ok: false, text: `Give the ${labelLower} a name.` });
```

Change the edit-impact warning:
```ts
          const warning = `This will update ${impact.pendingTasks} pending task${impact.pendingTasks === 1 ? "" : "s"} across ${impact.pendingEmployees} employee${impact.pendingEmployees === 1 ? "" : "s"} who haven't completed them yet (and cancel tasks for anything removed from this template). Completed records are kept.`;
```
to:
```ts
          const warning = `This will update ${impact.pendingTasks} pending task${impact.pendingTasks === 1 ? "" : "s"} across ${impact.pendingEmployees} employee${impact.pendingEmployees === 1 ? "" : "s"} who haven't completed them yet (and cancel tasks for anything removed from this ${labelLower}). Completed records are kept.`;
```

Change the modal title:
```tsx
          <p className="text-sm font-semibold text-gray-900">{isEdit ? "Edit Template" : "New Template"}</p>
```
to:
```tsx
          <p className="text-sm font-semibold text-gray-900">{isEdit ? `Edit ${label}` : `New ${label}`}</p>
```

Change the name field's label text:
```tsx
              Template name
```
to:
```tsx
              {label} name
```

- [ ] **Step 3: `template-group-assign-modal.tsx`**

Add `label = "Template"` to the props:

```tsx
export function TemplateGroupAssignModal({
  control,
  staff,
  group,
  onClose,
  hideCadence = false,
  label = "Template",
}: {
  control: FlowTemplateGroupControl;
  staff: FlowStaffMember[];
  group: FlowTemplateGroupSummary;
  onClose: () => void;
  hideCadence?: boolean;
  /** Display copy override (2026-08-06) — "Template" (default) or "Package". */
  label?: string;
}) {
```

Change the description line:
```tsx
          <p className="text-xs text-gray-400">
            Creates all {group.taskCount} task{group.taskCount === 1 ? "" : "s"} in this template for every
            recipient picked below.
          </p>
```
to:
```tsx
          <p className="text-xs text-gray-400">
            Creates all {group.taskCount} task{group.taskCount === 1 ? "" : "s"} in this {label.toLowerCase()} for
            every recipient picked below.
          </p>
```

- [ ] **Step 4: Verify types compile and behavior is unchanged for Template**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: succeeds.

Since Template's page (`/task-manager/template/page.tsx`) doesn't pass `label` at all, every string on that existing page must read EXACTLY as it did before (all defaults are `"Template"`, matching the original hardcoded text byte-for-byte). Double check this by re-reading the rendered defaults against the strings above.

- [ ] **Step 5: Commit**

```bash
git add src/task-manager/ui/template-group-dashboard.tsx src/task-manager/ui/template-group-form.tsx src/task-manager/ui/template-group-assign-modal.tsx
git commit -m "feat(task-manager): add label prop to Template Group UI components for Package reuse"
```

---

### Task 4: Wire `/task-manager/package/page.tsx`

**Files:**
- Modify: `src/app/task-manager/package/page.tsx` (full replace — currently a placeholder)

- [ ] **Step 1: Replace the placeholder with the real server component**

```tsx
// /task-manager/package — Package dashboard (2026-08-06): a second
// instance of the Template Groups feature (see
// task-manager/data/template-groups.ts), scoped to "PACKAGE" and
// restricted to Branch Manager only. Wiring mirrors
// /task-manager/template/page.tsx closely — same six "use server" action
// closures, same three-way SetupPendingError/NoAccountError/generic-error
// card handling, same 403-redirect pattern — just bound to scope: "PACKAGE"
// throughout and labeled "Package" in the UI. Unlike Template's page, this
// one has no CEO-hideCadence concern (Branch Managers are never CEOs), so
// there's no getMyRole call here.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { requireLiveSession } from "@/task-manager/action-session";
import AppShell from "@/app/components/AppShell";
import {
  applyTemplateGroup,
  createTemplateGroup,
  deleteTemplateGroup,
  editTemplateGroup,
  getGroupDeletionImpact,
  getFlowStaff,
  getTemplateGroup,
  listTemplateGroups,
  FlowBridgeError,
  NoAccountError,
  SetupPendingError,
} from "@/task-manager/data";
import { TemplateGroupDashboard } from "@/task-manager/ui/template-group-dashboard";
import {
  NoAccountCard,
  SetupPendingCard,
  TaskManagerErrorCard,
} from "@/task-manager/ui/status-cards";
import type {
  FlowTemplateGroupApplyInput,
  FlowTemplateGroupTaskInput,
  TemplateGroupApplyResult,
  TemplateGroupDeleteResult,
  TemplateGroupEditResult,
  TemplateGroupImpactResult,
  TemplateGroupLoadResult,
  TemplateGroupSaveResult,
} from "@/task-manager/ui/types";

export const dynamic = "force-dynamic";

const FALLBACK_MESSAGE = "Something went wrong — please try again";
const SCOPE = "PACKAGE" as const;

export default async function TaskManagerPackagePage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const su = session.user as { email: string; name?: string | null; role?: string };
  const email = su.email;

  let groups;
  let staff;
  try {
    const [groupsResult, staffResult] = await Promise.all([
      listTemplateGroups(email, SCOPE),
      getFlowStaff(),
    ]);
    groups = groupsResult;
    staff = staffResult.staff;
  } catch (err) {
    // Genuine "not a branch manager" (403) bounces to /task-manager —
    // everything else renders in place, same as /task-manager/template.
    if (err instanceof FlowBridgeError && err.status === 403) redirect("/task-manager");
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
  }

  async function loadGroup(groupId: string): Promise<TemplateGroupLoadResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const group = await getTemplateGroup(email, groupId, SCOPE);
      return { ok: true, group };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function createGroup(input: {
    name: string;
    tasks: { title: string; subtasks: string[] }[];
  }): Promise<TemplateGroupSaveResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const result = await createTemplateGroup(email, SCOPE, input);
      revalidatePath("/task-manager/package");
      return { ok: true, id: result.id };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function editGroup(
    groupId: string,
    input: { name: string; tasks: FlowTemplateGroupTaskInput[] },
  ): Promise<TemplateGroupEditResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const result = await editTemplateGroup(email, groupId, SCOPE, input);
      revalidatePath("/task-manager/package");
      revalidatePath("/task-manager");
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function groupImpact(groupId: string): Promise<TemplateGroupImpactResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const impact = await getGroupDeletionImpact(email, groupId, SCOPE);
      return { ok: true, ...impact };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function removeGroup(groupId: string): Promise<TemplateGroupDeleteResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const result = await deleteTemplateGroup(email, groupId, SCOPE);
      revalidatePath("/task-manager/package");
      revalidatePath("/task-manager");
      return { ok: true, removedTasks: result.removedTasks, keptRecords: result.keptRecords };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function applyGroup(
    groupId: string,
    input: FlowTemplateGroupApplyInput,
  ): Promise<TemplateGroupApplyResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const result = await applyTemplateGroup(email, groupId, SCOPE, input);
      revalidatePath("/task-manager");
      return { ok: true, created: result.created };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  return (
    <AppShell email={su.email} role={su.role} name={su.name}>
      <div className="mx-auto max-w-[1400px] p-6">
        <h1 className="text-2xl font-bold text-gray-900">Package</h1>
        <p className="mt-1 text-sm text-gray-500">Reusable multi-task packages — create once, assign whenever.</p>
        <div className="mt-6">
          <TemplateGroupDashboard
            staff={staff}
            label="Package"
            control={{
              list: groups,
              load: loadGroup,
              create: createGroup,
              edit: editGroup,
              impact: groupImpact,
              remove: removeGroup,
              apply: applyGroup,
            }}
          />
        </div>
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify the full build**

Run: `npm run build`
Expected: build succeeds, `/task-manager/package` listed in the route output.

- [ ] **Step 4: Commit**

```bash
git add src/app/task-manager/package/page.tsx
git commit -m "feat(task-manager): wire the Package dashboard into /task-manager/package, Branch-Manager-only"
```

---

### Task 5: End-to-end live verification

**Files:** none (manual + dev server verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background)

- [ ] **Step 2: Log in as a seeded Branch Manager (`role: "BRANCH"`) account and navigate to `/task-manager/package`.**

Expected: page loads (not a redirect), header "Package" + subtitle, empty state or existing packages.

- [ ] **Step 3: Create a package, assign it, edit it, delete it — full round trip through the UI**, mirroring the Template feature's own manual verification (create with 2 tasks incl. subtasks → assign to a recipient → confirm real tasks appear on `/task-manager` for that recipient → edit with a pending assignment in play (confirm dialog appears) → delete (confirm dialog shows impact, cancels the pending tasks)).

- [ ] **Step 4: Confirm a non-Branch-Manager cannot reach Package.**

Log in as (or otherwise test as) an HOD or CEO account, navigate to `/task-manager/package` — expected: redirected to `/task-manager`, no error page, no data shown.

- [ ] **Step 5: Confirm the same account CAN now reach Template** (the widened access).

Still logged in as the Branch Manager, navigate to `/task-manager/template` — expected: page loads normally (previously would have redirected before this feature).

- [ ] **Step 6: Confirm Package and Template lists stay visually separate** — create one of each as the same Branch Manager account, confirm each only shows up on its own page, never both.

- [ ] **Step 7: Run the full gate**

Run: `npx tsc --noEmit`
Expected: no errors beyond the pre-existing baseline (unrelated files: `employeeQueries.ts`, `employeeRecordActions.ts`, `employeeScope.ts`, `manpowerCost.ts`, one analytics test).

Run: `npm test`
Expected: all existing 271 tests still pass (this feature adds no new Vitest files, per established convention).

Run: `npm run build`
Expected: succeeds, both `/task-manager/template` and `/task-manager/package` listed as routes.

- [ ] **Step 8: Final commit** (only if Steps 1-7 required any fixes; otherwise this task is verification-only, no commit)
