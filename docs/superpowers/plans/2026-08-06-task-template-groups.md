# Task Template Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build out `/task-manager/template` into a full dashboard for "Template Groups" — named collections of several reusable tasks (each optionally with subtasks), separate from the existing single-task `TaskTemplate` picker.

**Architecture:** A new `TaskTemplateGroup` model is a pure grouping layer over the existing `TaskTemplate` table (`templateGroupId` + `groupPosition` added to it). A new data-layer file (`data/template-groups.ts`) orchestrates the group as a whole by calling the existing single-task functions in `data/templates.ts` per member — no cascade-safety logic is reimplemented. A new page (`/task-manager/template`) wires it up the same way the main Task Manager page wires the existing template feature: server component fetches + defines `"use server"` action closures, client components render the dashboard/modals.

**Tech Stack:** Next.js 16 App Router (Server Actions), Prisma 7 + `@prisma/adapter-pg`, Zod, React 19, Tailwind v4.

**Testing note (deviation from strict TDD):** The existing single-task template feature (`data/templates.ts`, 687 lines, 12 exported functions) has **zero** Vitest coverage — this codebase verifies Task Manager data-layer code live against the dev Postgres database with disposable `tsx` scripts instead (Prisma calls aren't meaningfully unit-testable without a real database, and there's no mocking layer for it here — see `role-views.test.ts`/`ui/types.test.ts` for the *only* kind of code in this module that does get Vitest coverage: pure functions with no I/O). This plan follows that existing convention: every data-layer task ends with a **live verification script** instead of a Vitest suite. Pure-logic changes (none in this plan) would still get a Vitest test per the skill's default.

Reference spec: `docs/superpowers/specs/2026-08-06-task-template-groups-design.md`

---

### Task 1: Schema — `TaskTemplateGroup` model + `TaskTemplate` grouping fields

**Files:**
- Modify: `prisma/task-manager/schema.prisma:369` (insert new model before `TaskTemplate`, add 3 fields to `TaskTemplate`)
- Create: `prisma/task-manager/migrations/20260806120000_add_task_template_group/migration.sql`

- [ ] **Step 1: Insert the new model into schema.prisma, directly above the existing `TaskTemplate` model (before line 369)**

```prisma
/// Grouping layer for "Template Groups" (2026-08-06, /task-manager/template):
/// a named collection of several TaskTemplate rows, created/edited/deleted/
/// applied together. Each member task is an ORDINARY TaskTemplate row
/// (templateGroupId set below) — this model adds nothing but the name and
/// owner; all cascade-safety (pending-assignment cancellation, edit
/// propagation) is delegated to the existing per-task functions in
/// data/templates.ts. Distinct from the single-task TaskTemplate flow
/// ("+ Task → Start from a template"), which never sees grouped rows —
/// listTaskTemplates excludes templateGroupId != null.
model TaskTemplateGroup {
  id          String    @id @default(cuid())
  createdById String
  name        String
  archivedAt  DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  templates   TaskTemplate[]

  @@index([createdById])
}

```

- [ ] **Step 2: Add the grouping fields to the existing `TaskTemplate` model** — insert directly after the `archivedAt` field (currently schema.prisma line 390) and before `createdAt`:

```prisma
  // Template Groups (2026-08-06): set when this task is a member of a
  // TaskTemplateGroup — null for standalone single-task templates (all
  // pre-existing rows, and every row created outside the group flow).
  // groupPosition is the 0-based display order within the group.
  templateGroupId String?
  groupPosition   Int?
  group           TaskTemplateGroup? @relation(fields: [templateGroupId], references: [id], onDelete: SetNull, onUpdate: NoAction)
```

  Also add an index for it alongside the model's existing `@@index([createdById])`:

```prisma
  @@index([createdById])
  @@index([templateGroupId])
```

- [ ] **Step 3: Write the migration SQL**

```sql
-- Template Groups (2026-08-06): grouping layer over TaskTemplate — a named
-- collection of several tasks, created/edited/deleted/applied together.
CREATE TABLE "TaskTemplateGroup" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskTemplateGroup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskTemplateGroup_createdById_idx" ON "TaskTemplateGroup"("createdById");

ALTER TABLE "TaskTemplate" ADD COLUMN "templateGroupId" TEXT;
ALTER TABLE "TaskTemplate" ADD COLUMN "groupPosition" INTEGER;

CREATE INDEX "TaskTemplate_templateGroupId_idx" ON "TaskTemplate"("templateGroupId");

ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_templateGroupId_fkey"
    FOREIGN KEY ("templateGroupId") REFERENCES "TaskTemplateGroup"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 4: Apply the migration and regenerate the client**

Run: `npm run tm:migrate`
Expected: `Applying migration 20260806120000_add_task_template_group` then `The following migration(s) have been applied: ... 20260806120000_add_task_template_group` with exit code 0.

Run: `npm run tm:generate`
Expected: `Generated Prisma Client` with exit code 0, no errors.

- [ ] **Step 5: Verify live against the dev database**

Create a temporary script `scratch-verify-schema.ts` at the repo root (this repo's `server-only` workaround applies if you import anything from `src/task-manager/data` — this script only touches the generated Prisma client directly, so it's not needed here):

```ts
import { PrismaClient } from "./src/generated/task-manager-client";

async function main() {
  const prisma = new PrismaClient();
  const group = await prisma.taskTemplateGroup.create({
    data: { createdById: "verify-script", name: "verify-schema-temp" },
  });
  const task = await prisma.taskTemplate.create({
    data: {
      createdById: "verify-script",
      name: "verify-task",
      title: "verify-task",
      templateGroupId: group.id,
      groupPosition: 0,
    },
  });
  console.log("created", { groupId: group.id, taskId: task.id, taskGroupId: task.templateGroupId });
  await prisma.taskTemplate.delete({ where: { id: task.id } });
  await prisma.taskTemplateGroup.delete({ where: { id: group.id } });
  console.log("cleaned up ok");
  await prisma.$disconnect();
}
main();
```

Run: `npx tsx --env-file=.env scratch-verify-schema.ts`
Expected: prints `created { groupId: '...', taskId: '...', taskGroupId: '...' }` then `cleaned up ok`, exit code 0.

Delete the script afterward: `rm scratch-verify-schema.ts`

- [ ] **Step 6: Commit**

```bash
git add prisma/task-manager/schema.prisma prisma/task-manager/migrations/20260806120000_add_task_template_group
git commit -m "feat(task-manager): add TaskTemplateGroup schema for multi-task templates"
```

---

### Task 2: `data/templates.ts` — export `requireAssigner`, exclude group members from the single-task picker

**Files:**
- Modify: `src/task-manager/data/templates.ts:39` (export the function)
- Modify: `src/task-manager/data/templates.ts:59` (filter)

- [ ] **Step 1: Export `requireAssigner`** — Task Template Groups' new data layer (Task 3+) needs the exact same allow-list check; change:

```ts
async function requireAssigner(email: string) {
```

to:

```ts
export async function requireAssigner(email: string) {
```

- [ ] **Step 2: Exclude group members from `listTaskTemplates`** — group-member rows must never appear in the single-task "+ Task → Start from a template" picker or the hub's Edit/Remove/Reassign/Archive tabs (they get their own dashboard, Task 11). In `listTaskTemplates`, change:

```ts
    const rows = await prisma.taskTemplate.findMany({
      // Archived templates leave every active surface (assign picker,
      // Edit/Remove/Reassign tabs) — the Archive tab lists them instead.
      where: { createdById: user.id, archivedAt: null },
```

to:

```ts
    const rows = await prisma.taskTemplate.findMany({
      // Archived templates leave every active surface (assign picker,
      // Edit/Remove/Reassign tabs) — the Archive tab lists them instead.
      // Group members (Template Groups, 2026-08-06) are excluded too — they
      // have their own dashboard at /task-manager/template, so the two
      // "template" concepts stay visually separate despite sharing this
      // table. This is a no-op for every pre-existing row (templateGroupId
      // was always null before this feature).
      where: { createdById: user.id, archivedAt: null, templateGroupId: null },
```

- [ ] **Step 3: Verify no other callers broke**

Run: `npx tsc --noEmit`
Expected: no new errors involving `templates.ts` (pre-existing unrelated errors elsewhere are expected — see repo baseline).

- [ ] **Step 4: Commit**

```bash
git add src/task-manager/data/templates.ts
git commit -m "refactor(task-manager): export requireAssigner, exclude group members from the single-task picker"
```

---

### Task 3: Data layer — `template-groups.ts`: list, get, create

**Files:**
- Create: `src/task-manager/data/template-groups.ts`

- [ ] **Step 1: Write the file — imports, schemas, list/get/create**

```ts
// Task Template Groups (2026-08-06): a named collection of several
// top-level TaskTemplate rows ("Template" on /task-manager/template) —
// grouping layer only. Each task inside a group is an ORDINARY TaskTemplate
// row (templateGroupId set, groupPosition for display order); all
// cascade-safety (pending-assignment cancellation, edit propagation,
// deletion impact) is delegated to the existing single-task functions in
// ./templates — this module only orchestrates them across a group's
// members and adds the group wrapper itself. Creating/editing a group
// never touches recipients/days/due-date/cadence — "Assign"
// (applyTemplateGroup) is a separate action that picks those once and fans
// out to assignFlowTask per member task.
import { z } from "zod";
import type { Prisma } from "@/generated/task-manager-client";
import { ApiHttpError } from "../lib/api-server";
import { prisma } from "../prisma";
import { native } from "./core";
import {
  deleteTaskTemplate,
  editTaskTemplate,
  getTemplateDeletionImpact,
  requireAssigner,
} from "./templates";
import { assignFlowTask } from "./tasks";
import { FLOW_DAYS, type FlowAssignInput } from "../ui/types";

const GROUP_TASK_MAX = 20;

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

/** Cards data for the /task-manager/template dashboard. */
export function listTemplateGroups(email: string): Promise<TemplateGroupSummary[]> {
  return native(async () => {
    const user = await requireAssigner(email);
    const groups = await prisma.taskTemplateGroup.findMany({
      where: { createdById: user.id, archivedAt: null },
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
export function getTemplateGroup(email: string, groupId: string): Promise<TemplateGroupDetail> {
  return native(async () => {
    const user = await requireAssigner(email);
    const id = z.string().min(1).parse(groupId);
    const group = await prisma.taskTemplateGroup.findFirst({
      where: { id, createdById: user.id },
      include: { templates: { orderBy: { groupPosition: "asc" } } },
    });
    if (!group) throw new ApiHttpError(404, "Template not found");
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
  input: CreateTemplateGroupInput,
): Promise<{ id: string }> {
  return native(async () => {
    const user = await requireAssigner(email);
    const body = createGroupSchema.parse(input);
    const group = await prisma.$transaction(async (tx) => {
      const g = await tx.taskTemplateGroup.create({
        data: { createdById: user.id, name: body.name },
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
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors from `template-groups.ts` (the file has no other module depending on it yet, so this only checks its own internal type-correctness).

- [ ] **Step 3: Commit**

```bash
git add src/task-manager/data/template-groups.ts
git commit -m "feat(task-manager): add Template Groups data layer — list/get/create"
```

---

### Task 4: Data layer — `template-groups.ts`: edit, deletion impact, delete

**Files:**
- Modify: `src/task-manager/data/template-groups.ts` (append)

- [ ] **Step 1: Append `editTemplateGroup`**

```ts

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
 *  summary count, same caveat the single-task Edit panel already has. */
export function editTemplateGroup(
  email: string,
  groupId: string,
  input: EditTemplateGroupInput,
): Promise<EditTemplateGroupResult> {
  return native(async () => {
    const user = await requireAssigner(email);
    const id = z.string().min(1).parse(groupId);
    const body = editGroupSchema.parse(input);
    const group = await prisma.taskTemplateGroup.findFirst({
      where: { id, createdById: user.id },
      select: { id: true },
    });
    if (!group) throw new ApiHttpError(404, "Template not found");

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
```

- [ ] **Step 2: Append `getGroupDeletionImpact` and `deleteTemplateGroup`**

```ts

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
): Promise<GroupDeletionImpact> {
  return native(async () => {
    const user = await requireAssigner(email);
    const id = z.string().min(1).parse(groupId);
    const group = await prisma.taskTemplateGroup.findFirst({
      where: { id, createdById: user.id },
      include: { templates: { select: { id: true } } },
    });
    if (!group) throw new ApiHttpError(404, "Template not found");
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
 *  the group row itself. */
export function deleteTemplateGroup(
  email: string,
  groupId: string,
): Promise<{ deleted: boolean; removedTasks: number; keptRecords: number }> {
  return native(async () => {
    const user = await requireAssigner(email);
    const id = z.string().min(1).parse(groupId);
    const group = await prisma.taskTemplateGroup.findFirst({
      where: { id, createdById: user.id },
      include: { templates: { select: { id: true } } },
    });
    if (!group) throw new ApiHttpError(404, "Template not found");
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
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors from `template-groups.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/task-manager/data/template-groups.ts
git commit -m "feat(task-manager): add Template Groups edit/delete with cascade-safe reconciliation"
```

---

### Task 5: Data layer — `template-groups.ts`: apply (assign), barrel export

**Files:**
- Modify: `src/task-manager/data/template-groups.ts` (append)
- Modify: `src/task-manager/data.ts:10` (barrel export)

- [ ] **Step 1: Append `applyTemplateGroup`**

```ts

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
 *  its own TaskTemplate row (identical to using a single-task template
 *  today — same hub Edit/Remove/Reassign/Archive tabs would work on it,
 *  they're just not surfaced there per Task 2's picker filter). */
export function applyTemplateGroup(
  email: string,
  groupId: string,
  input: ApplyTemplateGroupInput,
): Promise<{ created: number }> {
  return native(async () => {
    const user = await requireAssigner(email);
    const id = z.string().min(1).parse(groupId);
    const body = applyGroupSchema.parse(input);
    const group = await prisma.taskTemplateGroup.findFirst({
      where: { id, createdById: user.id },
      include: { templates: { orderBy: { groupPosition: "asc" } } },
    });
    if (!group) throw new ApiHttpError(404, "Template not found");
    if (group.templates.length === 0) {
      throw new ApiHttpError(400, "This template has no tasks to assign");
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

- [ ] **Step 2: Add the barrel export** — in `src/task-manager/data.ts`, add a line alongside the existing template export:

```ts
export * from "./data/templates";
export * from "./data/template-groups";
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Live verification script** — exercises the full data layer against the dev database (uses the `server-only` stub workaround, since this imports through `data.ts` → `tasks.ts` → `@/lib/drive`):

Create a temporary local stub so `tsx` can resolve the Next-bundler-only `server-only` package:

```bash
mkdir -p node_modules/server-only
echo "module.exports = {};" > node_modules/server-only/index.js
echo '{"name":"server-only","main":"index.js"}' > node_modules/server-only/package.json
```

Create `scratch-verify-groups.ts` at the repo root:

```ts
import {
  applyTemplateGroup,
  createTemplateGroup,
  deleteTemplateGroup,
  editTemplateGroup,
  getGroupDeletionImpact,
  getTemplateGroup,
  listTemplateGroups,
} from "./src/task-manager/data";

const EMAIL = "test-hod@ebright.my"; // any seeded assign-capable account

async function main() {
  const created = await createTemplateGroup(EMAIL, {
    name: "verify-group-temp",
    tasks: [
      { title: "Create Video", subtasks: ["Script", "Film"] },
      { title: "Post Video", subtasks: [] },
    ],
  });
  console.log("created", created);

  const list = await listTemplateGroups(EMAIL);
  console.log("in list:", list.some((g) => g.id === created.id));

  const detail = await getTemplateGroup(EMAIL, created.id);
  console.log("detail tasks:", detail.tasks.map((t) => t.title));

  const edited = await editTemplateGroup(EMAIL, created.id, {
    name: "verify-group-temp-renamed",
    tasks: [
      { id: detail.tasks[0].id, title: "Create Video (edited)", subtasks: ["Script"] },
      { title: "Update", subtasks: [] }, // new task, no id
      // detail.tasks[1] ("Post Video") omitted -> should be removed
    ],
  });
  console.log("edited", edited);

  const afterEdit = await getTemplateGroup(EMAIL, created.id);
  console.log("after edit tasks:", afterEdit.tasks.map((t) => t.title));

  const impact = await getGroupDeletionImpact(EMAIL, created.id);
  console.log("impact", impact);

  const applied = await applyTemplateGroup(EMAIL, created.id, {
    userIds: ["REPLACE_WITH_A_REAL_SEEDED_USER_ID"],
    cadence: "daily",
  });
  console.log("applied", applied);

  const deleted = await deleteTemplateGroup(EMAIL, created.id);
  console.log("deleted", deleted);

  const listAfter = await listTemplateGroups(EMAIL);
  console.log("still in list after delete:", listAfter.some((g) => g.id === created.id));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Before running, replace `REPLACE_WITH_A_REAL_SEEDED_USER_ID` with an actual staff user id from the dev database (query `getFlowStaff` output, or `prisma.user.findFirst()`).

Run: `npx tsx --env-file=.env scratch-verify-groups.ts`
Expected:
- `created { id: '...' }`
- `in list: true`
- `detail tasks: [ 'Create Video', 'Post Video' ]`
- `edited { updatedTasks: 0, createdTasks: 1, removedTasks: 0, employees: 0 }` (0 pending instances exist yet, since nothing was assigned before this edit)
- `after edit tasks: [ 'Create Video (edited)', 'Update' ]` (Post Video gone, Update added, order preserved)
- `impact { pendingTasks: 0, pendingEmployees: 0, completedKept: 0 }`
- `applied { created: 2 }` (2 remaining member tasks × 1 recipient)
- `deleted { deleted: true, removedTasks: 2, keptRecords: 0 }` (the 2 tasks just assigned are now pending → cancelled by delete)
- `still in list after delete: false`

Clean up:

```bash
rm scratch-verify-groups.ts
rm -rf node_modules/server-only
```

- [ ] **Step 5: Commit**

```bash
git add src/task-manager/data/template-groups.ts src/task-manager/data.ts
git commit -m "feat(task-manager): add Template Groups apply-to-assignees action"
```

---

### Task 6: UI types — `ui/types.ts` additions

**Files:**
- Modify: `src/task-manager/ui/types.ts` (insert after the existing `FlowTemplateControl` interface, currently ending at line 413)

- [ ] **Step 1: Insert the new types**

```ts

// ---- Task Template Groups (2026-08-06) — the /task-manager/template
// page's multi-task "Template" concept, distinct from the single-task
// FlowTemplateControl above. Each group task IS a TaskTemplate row under
// the hood (see data/template-groups.ts) — these types are the group-level
// wrapper the dashboard/modals actually work with.

export interface FlowTemplateGroupSummary {
  id: string;
  name: string;
  taskCount: number;
  previewTitles: string[];
  updatedAt: string; // ISO
}

export interface FlowTemplateGroupTask {
  id: string;
  title: string;
  subtasks: string[];
}

export interface FlowTemplateGroupDetail {
  id: string;
  name: string;
  tasks: FlowTemplateGroupTask[];
}

/** Task shape submitted from the Create/Edit form — `id` present only for
 *  an existing member being kept (feeds the edit reconciliation). */
export interface FlowTemplateGroupTaskInput {
  id?: string;
  title: string;
  subtasks: string[];
}

export type TemplateGroupLoadResult =
  | { ok: true; group: FlowTemplateGroupDetail }
  | { ok: false; message: string };

export type TemplateGroupSaveResult = { ok: true; id: string } | { ok: false; message: string };

export type TemplateGroupEditResult =
  | { ok: true; updatedTasks: number; createdTasks: number; removedTasks: number; employees: number }
  | { ok: false; message: string };

export type TemplateGroupImpactResult =
  | { ok: true; pendingTasks: number; pendingEmployees: number; completedKept: number }
  | { ok: false; message: string };

export type TemplateGroupDeleteResult =
  | { ok: true; removedTasks: number; keptRecords: number }
  | { ok: false; message: string };

/** "Assign" input — one recipient/day/due-date/cadence choice applied to
 *  every task in the group (see applyTemplateGroup). */
export interface FlowTemplateGroupApplyInput {
  userIds: string[];
  days?: (typeof FLOW_DAYS)[number][];
  dueDate?: string;
  cadence: CadenceOption;
}
export type TemplateGroupApplyResult = { ok: true; created: number } | { ok: false; message: string };

/** Everything the /task-manager/template dashboard needs, bundled as one
 *  prop — mirrors FlowTemplateControl's shape for the single-task feature. */
export interface FlowTemplateGroupControl {
  list: FlowTemplateGroupSummary[];
  load: (groupId: string) => Promise<TemplateGroupLoadResult>;
  create: (input: {
    name: string;
    tasks: { title: string; subtasks: string[] }[];
  }) => Promise<TemplateGroupSaveResult>;
  edit: (
    groupId: string,
    input: { name: string; tasks: FlowTemplateGroupTaskInput[] },
  ) => Promise<TemplateGroupEditResult>;
  impact: (groupId: string) => Promise<TemplateGroupImpactResult>;
  remove: (groupId: string) => Promise<TemplateGroupDeleteResult>;
  apply: (groupId: string, input: FlowTemplateGroupApplyInput) => Promise<TemplateGroupApplyResult>;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors from `ui/types.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/task-manager/ui/types.ts
git commit -m "feat(task-manager): add Template Groups UI types"
```

---

### Task 7: Extract `SubtaskListEditor`, refactor its two existing duplicates

**Files:**
- Create: `src/task-manager/ui/subtask-list-editor.tsx`
- Modify: `src/task-manager/ui/assign-task-form.tsx:88-89, 195-207, 320-371, 122-123, 253-254`
- Modify: `src/task-manager/ui/template-panels.tsx:73-74, 193-246, 99-100`

- [ ] **Step 1: Create the shared component** — byte-identical markup/behavior to the two existing inline builders (`SUBTASK_MAX` default 20, Enter-to-add, 200-char cap, duplicates allowed):

```tsx
"use client";

// Shared subtask add/remove builder (extracted 2026-08-06 from its two
// near-identical copies in assign-task-form.tsx and template-panels.tsx,
// and now also used by template-group-form.tsx). Add one at a time, ✕ to
// remove, max `max` (default 20, mirrors the server's cap in
// data/templates.ts and data/template-groups.ts). Duplicate titles are
// allowed — they become separate, independently-completable rows, same as
// duplicate tasks.
import * as React from "react";

export function SubtaskListEditor({
  subtasks,
  onChange,
  max = 20,
}: {
  subtasks: string[];
  onChange: (next: string[]) => void;
  max?: number;
}) {
  const [draft, setDraft] = React.useState("");

  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed || subtasks.length >= max) return;
    onChange([...subtasks, trimmed]);
    setDraft("");
  };
  const remove = (index: number) => {
    onChange(subtasks.filter((_, i) => i !== index));
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
      <p className="text-sm font-medium text-gray-600">Subtasks</p>
      <div className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Type a subtask..."
          maxLength={200}
          className="min-w-0 flex-1 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim() || subtasks.length >= max}
          className="shrink-0 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 disabled:opacity-40"
        >
          + Add
        </button>
      </div>
      {subtasks.length > 0 && (
        <ol className="mt-2 space-y-1">
          {subtasks.map((s, i) => (
            <li
              key={`${i}-${s}`}
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700"
            >
              <span className="w-5 shrink-0 text-xs text-gray-400">{i + 1}.</span>
              <span className="min-w-0 flex-1 truncate">{s}</span>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove subtask ${s}`}
                className="shrink-0 rounded-full p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}
      {subtasks.length >= max && (
        <p className="mt-1.5 text-xs text-gray-400">Maximum {max} subtasks.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Refactor `assign-task-form.tsx`** to use it.

Remove the `subtaskDraft` state (line 89), the `SUBTASK_MAX`/`addSubtask`/`removeSubtask` block (lines 195-207), and replace the inline builder JSX (lines 320-371, everything inside the `rounded-2xl border ... p-3` div under the "Subtasks" comment) with:

```tsx
        <div className="ml-4 max-w-xl border-l-2 border-gray-200 pl-3">
          <SubtaskListEditor subtasks={subtasks} onChange={setSubtasks} />
        </div>
```

Add the import near the top:

```ts
import { SubtaskListEditor } from "./subtask-list-editor";
```

Remove the now-dead `setSubtaskDraft("")` call inside `applyTemplate` (line 123) and inside `submit`'s success reset block (line 254) — `subtaskDraft` no longer exists as lifted state.

- [ ] **Step 3: Refactor `template-panels.tsx`** to use it, inside `TemplateEditPanel`.

Remove the `subtaskDraft` state (line 74) and the inline builder block (lines 193-246, the `rounded-2xl border ... p-3` div under the "Subtasks" `<p>`), replacing it with:

```tsx
          <SubtaskListEditor subtasks={subtasks} onChange={setSubtasks} />
```

Add the import:

```ts
import { SubtaskListEditor } from "./subtask-list-editor";
```

Remove the now-dead `setSubtaskDraft("")` call inside `pick` (line 100).

- [ ] **Step 4: Verify types compile and behavior is unchanged**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

Manual check (dev server): open `/task-manager`, click "+ Task", confirm the Subtasks section under the title still adds/removes/caps at 20 exactly as before. Open the "Edit" hub tab, pick an existing template, confirm the same there.

- [ ] **Step 5: Commit**

```bash
git add src/task-manager/ui/subtask-list-editor.tsx src/task-manager/ui/assign-task-form.tsx src/task-manager/ui/template-panels.tsx
git commit -m "refactor(task-manager): extract shared SubtaskListEditor, de-duplicate two existing copies"
```

---

### Task 8: `TemplateGroupFormModal` (create/edit)

**Files:**
- Create: `src/task-manager/ui/template-group-form.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

// Create/Edit modal for Template Groups (2026-08-06): name + repeatable
// task blocks (title + SubtaskListEditor). `groupId` absent = create mode
// (blank form, no assignee ever asked here — that's the separate Assign
// modal, template-group-assign-modal.tsx); present = edit mode (loads via
// control.load on open). Editing warns with live pending counts before
// saving, same safety pattern as the single-task Edit hub tab.
import * as React from "react";
import type { FlowTemplateGroupControl, FlowTemplateGroupTaskInput } from "./types";
import { SubtaskListEditor } from "./subtask-list-editor";

const TASK_MAX = 20;

export function TemplateGroupFormModal({
  control,
  groupId,
  onClose,
}: {
  control: FlowTemplateGroupControl;
  groupId?: string;
  onClose: () => void;
}) {
  const isEdit = Boolean(groupId);
  const [name, setName] = React.useState("");
  const [tasks, setTasks] = React.useState<FlowTemplateGroupTaskInput[]>([{ title: "", subtasks: [] }]);
  const [loading, setLoading] = React.useState(isEdit);
  const [pending, startTransition] = React.useTransition();
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);

  React.useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    void control.load(groupId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setMessage({ ok: false, text: result.message });
        return;
      }
      setName(result.group.name);
      setTasks(result.group.tasks.map((t) => ({ id: t.id, title: t.title, subtasks: t.subtasks })));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const addTask = () => {
    if (tasks.length >= TASK_MAX) return;
    setTasks((prev) => [...prev, { title: "", subtasks: [] }]);
  };
  const removeTask = (index: number) => {
    setTasks((prev) => prev.filter((_, i) => i !== index));
  };
  const updateTitle = (index: number, title: string) => {
    setTasks((prev) => prev.map((t, i) => (i === index ? { ...t, title } : t)));
  };
  const updateSubtasks = (index: number, subtasks: string[]) => {
    setTasks((prev) => prev.map((t, i) => (i === index ? { ...t, subtasks } : t)));
  };

  const save = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setMessage({ ok: false, text: "Give the template a name." });
      return;
    }
    const cleanTasks = tasks.map((t) => ({ ...t, title: t.title.trim() })).filter((t) => t.title.length > 0);
    if (cleanTasks.length === 0) {
      setMessage({ ok: false, text: "Add at least one task." });
      return;
    }
    startTransition(async () => {
      if (isEdit) {
        const impact = await control.impact(groupId as string);
        if (!impact.ok) {
          setMessage({ ok: false, text: impact.message });
          return;
        }
        if (impact.pendingTasks > 0) {
          const warning = `This will update ${impact.pendingTasks} pending task${impact.pendingTasks === 1 ? "" : "s"} across ${impact.pendingEmployees} employee${impact.pendingEmployees === 1 ? "" : "s"} who haven't completed them yet (and cancel tasks for anything removed from this template). Completed records are kept.`;
          if (!window.confirm(warning)) return;
        }
      }
      const result = isEdit
        ? await control.edit(groupId as string, { name: trimmedName, tasks: cleanTasks })
        : await control.create({ name: trimmedName, tasks: cleanTasks });
      if (result.ok) {
        onClose();
      } else {
        setMessage({ ok: false, text: result.message });
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex shrink-0 items-center justify-between border-b border-gray-100 pb-3">
          <p className="text-sm font-semibold text-gray-900">{isEdit ? "Edit Template" : "New Template"}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
            <label className="text-sm text-gray-600">
              Template name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Create Video"
                maxLength={100}
                className="mt-1 w-full rounded-full border border-gray-300 px-4 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
              />
            </label>

            {tasks.map((task, index) => (
              <div key={index} className="rounded-2xl border border-gray-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex-1 text-sm text-gray-600">
                    Task {index + 1}
                    <input
                      value={task.title}
                      onChange={(e) => updateTitle(index, e.target.value)}
                      placeholder="Task title"
                      maxLength={200}
                      className="mt-1 w-full rounded-full border border-gray-300 px-4 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
                    />
                  </label>
                  {tasks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTask(index)}
                      aria-label={`Remove task ${index + 1}`}
                      className="mt-5 shrink-0 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div className="ml-4 mt-2 border-l-2 border-gray-200 pl-3">
                  <SubtaskListEditor subtasks={task.subtasks} onChange={(next) => updateSubtasks(index, next)} />
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addTask}
              disabled={tasks.length >= TASK_MAX}
              className="self-start rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 disabled:opacity-40"
            >
              + Add another task
            </button>
          </div>
        )}

        <div className="mt-3 flex shrink-0 items-center gap-3 border-t border-gray-100 pt-3">
          <button
            type="button"
            onClick={save}
            disabled={pending || loading}
            className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          {message && (
            <p className={`text-sm ${message.ok ? "text-emerald-600" : "text-red-600"}`}>{message.text}</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors (this file isn't imported anywhere yet, so this only checks its own correctness).

- [ ] **Step 3: Commit**

```bash
git add src/task-manager/ui/template-group-form.tsx
git commit -m "feat(task-manager): add Template Group create/edit modal"
```

---

### Task 9: `TemplateGroupAssignModal`

**Files:**
- Create: `src/task-manager/ui/template-group-assign-modal.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

// Assign modal for Template Groups (2026-08-06): pick recipient(s) + day/
// due-date/cadence ONCE, then every task (+ subtasks) in the group gets
// created for them in one submit via control.apply. Deliberately separate
// from the Create/Edit modal — creating a template never asks for an
// assignee (per the confirmed design).
import * as React from "react";
import { FLOW_DAYS, visibleCadenceOptions, type CadenceOption } from "./types";
import type { FlowStaffMember, FlowTemplateGroupControl, FlowTemplateGroupSummary } from "./types";
import { RecipientPicker } from "./recipient-picker";

const CADENCE_LABELS: Record<CadenceOption, string> = {
  daily: "Daily",
  monthly: "Monthly",
  adhoc: "Ad hoc",
};

function dayChipClass(active: boolean): string {
  return `rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
    active ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
  }`;
}

export function TemplateGroupAssignModal({
  control,
  staff,
  group,
  onClose,
}: {
  control: FlowTemplateGroupControl;
  staff: FlowStaffMember[];
  group: FlowTemplateGroupSummary;
  onClose: () => void;
}) {
  const [userIds, setUserIds] = React.useState<string[]>([]);
  const [cadence, setCadence] = React.useState<CadenceOption | null>(null);
  const [days, setDays] = React.useState<(typeof FLOW_DAYS)[number][]>([]);
  const [dueDate, setDueDate] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);

  const selectedStaff = staff.filter((s) => userIds.includes(s.id));
  const visibleCadences = visibleCadenceOptions(selectedStaff);
  React.useEffect(() => {
    setCadence((prev) => (prev && visibleCadences.includes(prev) ? prev : null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleCadences.join(",")]);

  const showDay = cadence === "daily";
  React.useEffect(() => {
    if (!showDay) setDays([]);
  }, [showDay]);

  const toggleDay = (value: (typeof FLOW_DAYS)[number]) => {
    setDays((prev) => (prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]));
  };

  const submit = () => {
    if (userIds.length === 0) {
      setMessage({ ok: false, text: "Pick at least one recipient." });
      return;
    }
    if (!cadence) {
      setMessage({ ok: false, text: "Pick a cadence." });
      return;
    }
    startTransition(async () => {
      const result = await control.apply(group.id, {
        userIds,
        days,
        dueDate: dueDate || undefined,
        cadence,
      });
      if (result.ok) {
        onClose();
      } else {
        setMessage({ ok: false, text: result.message });
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex shrink-0 items-center justify-between border-b border-gray-100 pb-3">
          <p className="text-sm font-semibold text-gray-900">Assign &ldquo;{group.name}&rdquo;</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          <p className="text-xs text-gray-400">
            Creates all {group.taskCount} task{group.taskCount === 1 ? "" : "s"} in this template for every
            recipient picked below.
          </p>
          <RecipientPicker staff={staff} selected={userIds} onChange={setUserIds} />
          <div className="text-sm text-gray-600">
            Cadence
            <div role="radiogroup" aria-label="Cadence" className="mt-1 flex gap-2">
              {visibleCadences.map((value) => {
                const active = cadence === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    onClick={() => setCadence(value)}
                    aria-checked={active}
                    className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
                      active
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
                    }`}
                  >
                    {CADENCE_LABELS[value]}
                  </button>
                );
              })}
            </div>
          </div>
          {showDay && (
            <div className="max-w-md">
              <p className="text-sm text-gray-600">Day</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {FLOW_DAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    aria-pressed={days.includes(d)}
                    className={dayChipClass(days.includes(d))}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="max-w-xs text-sm text-gray-600">
            Due Date (optional)
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full appearance-none rounded-full border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
            />
          </label>
        </div>

        <div className="mt-3 flex shrink-0 items-center gap-3 border-t border-gray-100 pt-3">
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? "Assigning…" : "Assign"}
          </button>
          {message && (
            <p className={`text-sm ${message.ok ? "text-emerald-600" : "text-red-600"}`}>{message.text}</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/task-manager/ui/template-group-assign-modal.tsx
git commit -m "feat(task-manager): add Template Group assign modal"
```

---

### Task 10: `TemplateGroupDashboard` (cards grid + wiring)

**Files:**
- Create: `src/task-manager/ui/template-group-dashboard.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

// /task-manager/template dashboard (2026-08-06): cards grid + the
// Create/Edit and Assign modals' open/close wiring + the Delete confirm
// flow. Mutations call the server actions in `control`, wrapped in
// useTransition so revalidatePath's effect (a fresh `control.list` from
// the parent server component) actually reaches this client tree — the
// same pattern AssignTaskForm's submit() already uses.
import * as React from "react";
import type { FlowStaffMember, FlowTemplateGroupControl } from "./types";
import { TemplateGroupFormModal } from "./template-group-form";
import { TemplateGroupAssignModal } from "./template-group-assign-modal";

export function TemplateGroupDashboard({
  staff,
  control,
}: {
  staff: FlowStaffMember[];
  control: FlowTemplateGroupControl;
}) {
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editGroupId, setEditGroupId] = React.useState<string | null>(null);
  const [assignGroupId, setAssignGroupId] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [, startTransition] = React.useTransition();

  const remove = (groupId: string, name: string) => {
    startTransition(async () => {
      setBusyId(groupId);
      const impact = await control.impact(groupId);
      if (!impact.ok) {
        setBusyId(null);
        setMessage({ ok: false, text: impact.message });
        return;
      }
      const warning =
        impact.pendingTasks > 0
          ? `This will remove "${name}" and cancel ${impact.pendingTasks} pending task${impact.pendingTasks === 1 ? "" : "s"} across ${impact.pendingEmployees} employee${impact.pendingEmployees === 1 ? "" : "s"}. ${impact.completedKept} completed record${impact.completedKept === 1 ? "" : "s"} will be kept.`
          : `This will remove "${name}". No pending assignments right now.`;
      if (!window.confirm(warning)) {
        setBusyId(null);
        return;
      }
      const result = await control.remove(groupId);
      setBusyId(null);
      setMessage(result.ok ? { ok: true, text: "Template deleted." } : { ok: false, text: result.message });
    });
  };

  const assignedGroup = control.list.find((g) => g.id === assignGroupId) ?? null;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          {control.list.length} template{control.list.length === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          + New Template
        </button>
      </div>

      {message && (
        <p className={`mt-3 text-sm ${message.ok ? "text-emerald-600" : "text-red-600"}`}>{message.text}</p>
      )}

      {control.list.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
          No templates yet — create one to bundle several tasks together for reuse.
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {control.list.map((g) => (
            <div key={g.id} className="flex flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="font-semibold text-gray-900">{g.name}</p>
              <p className="mt-1 text-xs text-gray-400">
                {g.taskCount} task{g.taskCount === 1 ? "" : "s"}
              </p>
              {g.previewTitles.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-sm text-gray-600">
                  {g.previewTitles.map((t, i) => (
                    <li key={i} className="truncate">
                      · {t}
                    </li>
                  ))}
                  {g.taskCount > g.previewTitles.length && (
                    <li className="text-xs text-gray-400">+{g.taskCount - g.previewTitles.length} more</li>
                  )}
                </ul>
              )}
              <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                <button
                  type="button"
                  onClick={() => setAssignGroupId(g.id)}
                  className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Assign
                </button>
                <button
                  type="button"
                  onClick={() => setEditGroupId(g.id)}
                  className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={busyId === g.id}
                  onClick={() => remove(g.id, g.name)}
                  className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-red-400 hover:text-red-600 disabled:opacity-40"
                >
                  {busyId === g.id ? "Removing…" : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {createOpen && <TemplateGroupFormModal control={control} onClose={() => setCreateOpen(false)} />}
      {editGroupId && (
        <TemplateGroupFormModal control={control} groupId={editGroupId} onClose={() => setEditGroupId(null)} />
      )}
      {assignedGroup && (
        <TemplateGroupAssignModal
          control={control}
          staff={staff}
          group={assignedGroup}
          onClose={() => setAssignGroupId(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/task-manager/ui/template-group-dashboard.tsx
git commit -m "feat(task-manager): add Template Group dashboard (cards grid + delete confirm)"
```

---

### Task 11: Wire `/task-manager/template/page.tsx`

**Files:**
- Modify: `src/app/task-manager/template/page.tsx` (full replace)

- [ ] **Step 1: Replace the placeholder with the real server component**

```tsx
// /task-manager/template — Template Groups dashboard (2026-08-06): manage
// reusable multi-task templates (a named collection of several TaskTemplate
// rows — see task-manager/data/template-groups.ts). Wiring mirrors
// /task-manager's own page: server component fetches data + defines
// "use server" action closures, passes both to a client dashboard
// component. Gated by the same assign-capable allow-list as the rest of
// Task Manager — the first fetch (listTemplateGroups) IS the gate: a
// FlowBridgeError there means the account isn't assign-capable, so we
// bounce to /task-manager instead of rendering an empty/broken page.
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
} from "@/task-manager/data";
import { TemplateGroupDashboard } from "@/task-manager/ui/template-group-dashboard";
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

export default async function TaskManagerTemplatePage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const su = session.user as { email: string; name?: string | null; role?: string };
  const email = su.email;

  let groups;
  try {
    groups = await listTemplateGroups(email);
  } catch (err) {
    if (err instanceof FlowBridgeError) redirect("/task-manager");
    throw err;
  }
  const { staff } = await getFlowStaff();

  async function loadGroup(groupId: string): Promise<TemplateGroupLoadResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const group = await getTemplateGroup(email, groupId);
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
      const result = await createTemplateGroup(email, input);
      revalidatePath("/task-manager/template");
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
      const result = await editTemplateGroup(email, groupId, input);
      revalidatePath("/task-manager/template");
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
      const impact = await getGroupDeletionImpact(email, groupId);
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
      const result = await deleteTemplateGroup(email, groupId);
      revalidatePath("/task-manager/template");
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
      const result = await applyTemplateGroup(email, groupId, input);
      revalidatePath("/task-manager");
      return { ok: true, created: result.created };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  return (
    <AppShell email={su.email} role={su.role} name={su.name}>
      <div className="mx-auto max-w-[1400px] p-6">
        <h1 className="text-2xl font-bold text-gray-900">Template</h1>
        <p className="mt-1 text-sm text-gray-500">Reusable multi-task templates — create once, assign whenever.</p>
        <div className="mt-6">
          <TemplateGroupDashboard
            staff={staff}
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
Expected: build succeeds, `/task-manager/template` listed in the route output.

- [ ] **Step 4: Commit**

```bash
git add src/app/task-manager/template/page.tsx
git commit -m "feat(task-manager): wire the Template Groups dashboard into /task-manager/template"
```

---

### Task 12: End-to-end live verification

**Files:** none (manual + dev server verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background)

- [ ] **Step 2: Log in as an assign-capable test account** (e.g. `test-hod@ebright.my`) and navigate to `/task-manager/template`.

Expected: page loads, header "Template" + subtitle, "0 templates" + empty state, "+ New Template" button.

- [ ] **Step 3: Create a template**

Click "+ New Template" → name it "Verify Flow" → Task 1 title "Create Video" + subtask "Script" + subtask "Film" → "+ Add another task" → Task 2 title "Post Video" (no subtasks) → Save.

Expected: modal closes, card "Verify Flow" appears showing "2 tasks" and preview lines "Create Video" / "Post Video".

- [ ] **Step 4: Edit the template**

Click "Edit" on the card → rename Task 2 to "Post Video (edited)" → "+ Add another task" → Task 3 "Update" → Save.

Expected: (no confirm dialog yet, since nothing has been assigned — 0 pending tasks) modal closes, card now shows "3 tasks".

- [ ] **Step 5: Assign the template**

Click "Assign" on the card → pick a recipient → pick a cadence (Daily) → pick a day → Assign.

Expected: modal closes. Navigate to `/task-manager`, confirm the 3 tasks ("Create Video" with its 2 subtasks, "Post Video (edited)", "Update") now appear for the chosen recipient.

- [ ] **Step 6: Edit again with a pending assignment in play**

Go back to `/task-manager/template`, click "Edit" on "Verify Flow" → change Task 1's title slightly → Save.

Expected: a `window.confirm` dialog appears warning about pending tasks/employees before saving — confirm it — save succeeds, and the recipient's "Create Video" task title updates on `/task-manager`.

- [ ] **Step 7: Delete the template**

Click "Delete" on the card.

Expected: confirm dialog shows the pending task/employee counts; confirming removes the card, and the recipient's 3 tasks from this template disappear from `/task-manager` (cancelled, not visible — matches the existing single-task Remove/Delete behavior).

- [ ] **Step 8: Confirm the single-task feature is unaffected**

Open the "+ Task" hub on `/task-manager`, check the "Start from a template" dropdown and the Edit/Remove/Reassign/Archive tabs — confirm no group-member tasks ever appeared there (there shouldn't be any left after Step 7 anyway, but re-check with a scratch single "Save as Template" task too, confirming it behaves exactly as before).

- [ ] **Step 9: Run the full gate**

Run: `npx tsc --noEmit`
Expected: no errors beyond the pre-existing baseline (the ~76 known employee-record type errors, unrelated to this feature).

Run: `npm test`
Expected: all existing suites still pass (this feature adds no new Vitest files per the Testing note above).

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 10: Final commit** (only if Steps 1-9 required any fixes; otherwise this task is verification-only, no commit)
