# Task Categories Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce `TaskCategory` as a new, admin-managed, extensible taxonomy ("Type" — Flowghan/CNS/SMS/etc.), settable once at task-assignment time, as the foundation the Overview page card redesign (separate plan) will consume.

**Architecture:** A new `TaskCategory` lookup table (named, ordered, reversibly archivable — mirrors `TaskTemplateGroup`'s existing shape). `RunBlock.categoryId` is the source of truth per task instance; `TaskTemplate.categoryId` is only an assign-form pre-fill default. Category is chosen once on the "+Task" form and never edited afterward; the weekly recurrence engine copies it forward exactly like it already does `templateId`. A small new admin page (`/task-manager/categories`, gated the same as Template/Package management) handles create/rename/reorder/archive.

**Tech Stack:** Next.js Server Actions, Prisma ORM (`@/generated/task-manager-client`), PostgreSQL, Zod, React/TypeScript, Vitest.

**Depends on nothing new** — this plan is self-contained and independently shippable/testable (categories can be created and assigned before any consumer reads them). The Overview page card redesign (`docs/superpowers/plans/2026-08-12-overview-card-redesign.md`, planned separately) depends on this plan being merged first.

---

## Context for the engineer

This codebase is "Ebright Flow" — a task-manager module bolted onto a larger app ("OSC"), with its own Prisma schema/client at `prisma/task-manager/schema.prisma` → `src/generated/task-manager-client`. Data-layer functions live in `src/task-manager/data/*.ts`, each wrapped in a `native(async () => {...}, "functionName")` helper (from `./core`) that turns thrown `ApiHttpError`s into typed HTTP responses. Every data-layer function takes the acting user's **email** as its first argument and resolves the real user via `requireUserByEmail(email)` — there is no session object threaded through.

**Migration workflow — read this before Task 1:** this database has unmodeled raw tables that trigger Prisma's drift detection into proposing destructive drops. **Never run `prisma migrate dev`.** Migrations in this module are hand-written SQL files under `prisma/task-manager/migrations/<timestamp>_<name>/migration.sql`, applied via `npx prisma migrate deploy --config prisma.task-manager.config.ts`.

**Testing convention in this module:** Prisma-touching data-layer functions (like everything in `data/template-groups.ts`) have **no unit tests** in this codebase — they're verified against the live app/DB instead (see `engine/recurrence.test.ts`'s own header comment: "`advanceRecurringBlocks` itself is exercised against the live app, not unit-tested here"). Only pure, DB-free logic gets Vitest unit tests. This plan follows that same convention: no fabricated unit tests for CRUD functions; a live-DB smoke-test script in the final task instead.

**Windows dev machine note:** use PowerShell for `npm test` (Git Bash has a drive-letter-casing quirk that causes spurious whole-suite failures on this machine).

---

### Task 1: Schema migration — TaskCategory model + categoryId columns

**Files:**
- Modify: `prisma/task-manager/schema.prisma`
- Create: `prisma/task-manager/migrations/20260812100000_add_task_categories/migration.sql`

- [ ] **Step 1: Add the `TaskCategory` model to the schema**

In `prisma/task-manager/schema.prisma`, insert this new model immediately after the closing brace of the `Guideline` model (currently ends around line 369, right before `enum TemplateGroupScope`):

```prisma
/// Task Categories ("Type", 2026-08-12): admin-managed, extensible task
/// grouping (Flowghan/CNS/SMS/Inventory/HRMS/Email Marketing, etc — no
/// fixed list, org-defined). Mirrors TaskTemplateGroup's shape (named,
/// ordered, reversibly archivable). Chosen ONCE at task-assignment time
/// (see RunBlock.categoryId below) — never edited on an existing task.
model TaskCategory {
  id          String         @id @default(cuid())
  name        String
  order       Int            @default(0)
  archivedAt  DateTime?
  createdById String
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  runBlocks   RunBlock[]
  templates   TaskTemplate[]

  @@index([createdById])
}
```

- [ ] **Step 2: Add `RunBlock.categoryId`**

In the `RunBlock` model, immediately after the `templateId String?` field (currently the last field before the `@@unique`/`@@index` block, around line 346), add:

```prisma
  // Task Category ("Type", 2026-08-12): set ONCE at assignment time, never
  // edited afterward — the source of truth for which category this task
  // instance shows under. Optional on TaskTemplate too (an assign-form
  // pre-fill default only, never authoritative — see that model). SetNull
  // on category delete: an archived/deleted category never blocks or
  // orphans a task, it just falls back to "Uncategorized".
  categoryId String?
  category   TaskCategory? @relation(fields: [categoryId], references: [id], onDelete: SetNull, onUpdate: NoAction)
```

Then add `@@index([categoryId])` to the existing index block (alongside `@@index([templateId])`), so the block reads:

```prisma
  @@unique([runId, nodeId])
  @@index([assigneeId, status])
  @@index([status, dueAt])
  @@index([runId])
  @@index([repeatWeekly, dueAt])
  @@index([parentId])
  @@index([templateId])
  @@index([categoryId])
}
```

- [ ] **Step 3: Add `TaskTemplate.categoryId`**

In the `TaskTemplate` model, immediately after the `group TaskTemplateGroup? @relation(...)` line (around line 481, right before `createdAt DateTime @default(now())`), add:

```prisma
  // Task Category pre-fill default (2026-08-12): only used to pre-fill the
  // assign form's Category dropdown when this template is picked — the
  // REAL, authoritative value is set per-assignment on RunBlock.categoryId
  // above and can diverge from this at any time without updating the
  // template.
  categoryId String?
  category   TaskCategory? @relation(fields: [categoryId], references: [id], onDelete: SetNull, onUpdate: NoAction)
```

- [ ] **Step 4: Hand-write the migration SQL**

Create `prisma/task-manager/migrations/20260812100000_add_task_categories/migration.sql`:

```sql
-- Task Categories (2026-08-12): admin-managed, extensible task grouping
-- ("Type" — Flowghan/CNS/SMS/etc, org-defined, no fixed list). Optional on
-- both RunBlock (source of truth per task instance, set once at assignment
-- time) and TaskTemplate (assign-form pre-fill default only). No backfill:
-- every existing row stays categoryId NULL, i.e. "Uncategorized".
-- CreateTable
CREATE TABLE "TaskCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskCategory_createdById_idx" ON "TaskCategory"("createdById");

-- AlterTable
ALTER TABLE "RunBlock" ADD COLUMN "categoryId" TEXT;

-- CreateIndex
CREATE INDEX "RunBlock_categoryId_idx" ON "RunBlock"("categoryId");

-- AddForeignKey
ALTER TABLE "RunBlock" ADD CONSTRAINT "RunBlock_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "TaskCategory"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;

-- AlterTable
ALTER TABLE "TaskTemplate" ADD COLUMN "categoryId" TEXT;

-- AddForeignKey
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "TaskCategory"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
```

- [ ] **Step 5: Apply the migration and regenerate the client**

Run (PowerShell):
```powershell
npx prisma migrate status --config prisma.task-manager.config.ts
npx prisma migrate deploy --config prisma.task-manager.config.ts
npx prisma generate --config prisma.task-manager.config.ts
```
Expected: `migrate status` shows the new migration as pending before deploy, "No pending migrations" after; `generate` completes with no errors.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (the generated client now exposes `prisma.taskCategory`, `RunBlock.categoryId`, `TaskTemplate.categoryId`).

- [ ] **Step 7: Commit**

```bash
git add prisma/task-manager/schema.prisma prisma/task-manager/migrations/20260812100000_add_task_categories
git commit -m "feat(task-manager): add TaskCategory model + categoryId on RunBlock/TaskTemplate"
```

---

### Task 2: Data layer — TaskCategory CRUD

**Files:**
- Create: `src/task-manager/data/task-categories.ts`

- [ ] **Step 1: Write the CRUD module**

Create `src/task-manager/data/task-categories.ts`:

```typescript
// Task Categories ("Type", 2026-08-12): admin-managed, extensible task
// grouping — Flowghan/CNS/SMS/Inventory/HRMS/Email Marketing, etc, org-
// defined with no fixed list. Flat lookup table, no fan-out/cascade logic
// (unlike TaskTemplateGroup) — a category never owns or reconciles tasks,
// it's just a name a task can optionally point at once, at assignment
// time. Same permission gate as Template/Package management
// (canManageTaskTemplateGroups): Super Admin + elevated Operations/
// Optimisation dept-site only. There is no separate "view" tier here —
// unlike Template/Package, nobody else needs to manage categories, and the
// assign form only needs the flat active list (see listActiveCategories).
import { z } from "zod";
import { prisma } from "../prisma";
import { ApiHttpError } from "../lib/api-server";
import { native, requireUserByEmail } from "./core";
import { canManageTaskTemplateGroups } from "../role-views";

async function requireCategoryManageAccess(email: string) {
  const user = await requireUserByEmail(email);
  if (!canManageTaskTemplateGroups(user)) {
    throw new ApiHttpError(403, "Only Super Admin and Operations can manage task categories");
  }
  return user;
}

export interface TaskCategorySummary {
  id: string;
  name: string;
  order: number;
  archivedAt: string | null; // ISO
}

/** Admin management list — every category, active AND archived, ordered
 *  for the management page (archived ones render with an Unarchive
 *  action there). Gated the same as the create/rename/archive actions
 *  below (no separate view-only tier for this admin surface). */
export function listTaskCategories(email: string): Promise<TaskCategorySummary[]> {
  return native(async () => {
    await requireCategoryManageAccess(email);
    const categories = await prisma.taskCategory.findMany({
      orderBy: [{ archivedAt: "asc" }, { order: "asc" }],
    });
    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      order: c.order,
      archivedAt: c.archivedAt ? c.archivedAt.toISOString() : null,
    }));
  }, "listTaskCategories");
}

/** The assign form's flat picker list — active (non-archived) categories
 *  only, no manage-access gate: any assign-capable actor may READ this
 *  list to pick a category for a new task, even though only Super
 *  Admin/Operations may create/rename/archive them. Callers pass the
 *  acting user's email purely to resolve them (requireUserByEmail already
 *  404s an unknown email) — there is no additional authorization check. */
export function listActiveTaskCategories(email: string): Promise<TaskCategorySummary[]> {
  return native(async () => {
    await requireUserByEmail(email);
    const categories = await prisma.taskCategory.findMany({
      where: { archivedAt: null },
      orderBy: { order: "asc" },
    });
    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      order: c.order,
      archivedAt: null,
    }));
  }, "listActiveTaskCategories");
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
export type CreateTaskCategoryInput = z.input<typeof createSchema>;

/** New categories append to the end of the active order — `order` is the
 *  current max active order + 1 (0 for the very first category). */
export function createTaskCategory(
  email: string,
  input: CreateTaskCategoryInput,
): Promise<{ id: string }> {
  return native(async () => {
    const user = await requireCategoryManageAccess(email);
    const body = createSchema.parse(input);
    const max = await prisma.taskCategory.aggregate({
      where: { archivedAt: null },
      _max: { order: true },
    });
    const category = await prisma.taskCategory.create({
      data: { name: body.name, order: (max._max.order ?? -1) + 1, createdById: user.id },
    });
    return { id: category.id };
  }, "createTaskCategory");
}

const renameSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
export type RenameTaskCategoryInput = z.input<typeof renameSchema>;

export function renameTaskCategory(
  email: string,
  categoryId: string,
  input: RenameTaskCategoryInput,
): Promise<{ ok: true }> {
  return native(async () => {
    await requireCategoryManageAccess(email);
    const id = z.string().min(1).parse(categoryId);
    const body = renameSchema.parse(input);
    const existing = await prisma.taskCategory.findUnique({ where: { id } });
    if (!existing) throw new ApiHttpError(404, "Category not found");
    await prisma.taskCategory.update({ where: { id }, data: { name: body.name } });
    return { ok: true };
  }, "renameTaskCategory");
}

/** Reversible — sets archivedAt, never deletes the row (tasks already
 *  pointing at it via categoryId keep a live FK; only NEW assignments
 *  won't be able to pick it, since listActiveTaskCategories excludes it). */
export function archiveTaskCategory(email: string, categoryId: string): Promise<{ ok: true }> {
  return native(async () => {
    await requireCategoryManageAccess(email);
    const id = z.string().min(1).parse(categoryId);
    const existing = await prisma.taskCategory.findUnique({ where: { id } });
    if (!existing) throw new ApiHttpError(404, "Category not found");
    await prisma.taskCategory.update({ where: { id }, data: { archivedAt: new Date() } });
    return { ok: true };
  }, "archiveTaskCategory");
}

export function unarchiveTaskCategory(email: string, categoryId: string): Promise<{ ok: true }> {
  return native(async () => {
    await requireCategoryManageAccess(email);
    const id = z.string().min(1).parse(categoryId);
    const existing = await prisma.taskCategory.findUnique({ where: { id } });
    if (!existing) throw new ApiHttpError(404, "Category not found");
    await prisma.taskCategory.update({ where: { id }, data: { archivedAt: null } });
    return { ok: true };
  }, "unarchiveTaskCategory");
}

const reorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1).max(200),
});
export type ReorderTaskCategoriesInput = z.input<typeof reorderSchema>;

/** Full-list reorder (drag-and-drop on the management page submits the
 *  WHOLE new active order, not a single move) — stamps `order` as each
 *  id's index in the submitted array. Only active category ids are valid
 *  here; archived ones keep whatever `order` they had when archived
 *  (irrelevant while archived — listActiveTaskCategories excludes them). */
export function reorderTaskCategories(
  email: string,
  input: ReorderTaskCategoriesInput,
): Promise<{ ok: true }> {
  return native(async () => {
    await requireCategoryManageAccess(email);
    const body = reorderSchema.parse(input);
    await Promise.all(
      body.orderedIds.map((id, index) =>
        prisma.taskCategory.update({ where: { id }, data: { order: index } }),
      ),
    );
    return { ok: true };
  }, "reorderTaskCategories");
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/task-manager/data/task-categories.ts
git commit -m "feat(task-manager): add TaskCategory CRUD data layer"
```

---

### Task 3: Wire categoryId into task assignment

**Files:**
- Modify: `src/task-manager/ui/types.ts`
- Modify: `src/task-manager/data/tasks-internal.ts`

- [ ] **Step 1: Add `categoryId` to `FlowAssignInput`**

In `src/task-manager/ui/types.ts`, in the `FlowAssignInput` interface, immediately after the `fromTemplateId?: string;` field (see the doc comment "Set when the form was pre-filled via 'Start from a template'..."), add:

```typescript
  /** Task Category ("Type", 2026-08-12) — set ONCE at assignment time,
   *  never editable afterward. Omit/undefined = Uncategorized. Every
   *  RunBlock this assignment creates (all recipients × days, and every
   *  subtask) gets this SAME categoryId — same fan-out shape as
   *  guidelineId. */
  categoryId?: string;
```

- [ ] **Step 2: Accept and validate `categoryId` in `assignInputSchema`**

In `src/task-manager/data/tasks-internal.ts`, in `assignInputSchema` (the `z.object({...})` starting around line 69), immediately after the `fromTemplateId: z.string().min(1).optional(),` line, add:

```typescript
  // Task Category (2026-08-12): validated against a real, non-archived
  // TaskCategory below (assignFlowTaskCore) — omit/undefined = Uncategorized.
  categoryId: z.string().min(1).optional(),
```

- [ ] **Step 3: Validate the category and fan it out to every created block**

Still in `src/task-manager/data/tasks-internal.ts`, inside `assignFlowTaskCore` (around line 117), add validation right after the existing cadence-eligibility check (the `if (!allowedCadences.includes(body.cadence))` block, which ends around line 152) and before the `const flowId = ...` line:

```typescript
  let categoryId: string | null = null;
  if (body.categoryId) {
    const category = await prisma.taskCategory.findFirst({
      where: { id: body.categoryId, archivedAt: null },
      select: { id: true },
    });
    if (!category) throw new ApiHttpError(400, "That category no longer exists or is archived");
    categoryId = category.id;
  }
```

Then thread `categoryId` into both `prisma.runBlock.create` calls in the same function:

1. The parent block create (around line 257-281) — add `categoryId,` immediately after the existing `templateId,` line (right before `runItems: {`).
2. The subtask block create (around line 300-325) — add `categoryId,` immediately after its own `templateId,` line (right before `subtaskOrder: subtaskIndex,`).

- [ ] **Step 4: "Save as Template" captures the category as the template's pre-fill default**

Still in `assignFlowTaskCore`, in the `saveAsTemplate` block (around line 215-236), add `categoryId,` to the `templateData` object (right after the existing `cadence,` line) so a newly-saved template remembers this assignment's category as its own default:

```typescript
    const templateData = {
      title: body.title,
      subtasks: body.subtasks as unknown as Prisma.InputJsonValue,
      cadence,
      categoryId,
      guidelineUrl: body.guidelineUrl ?? null,
      guidelineMime: body.guidelineImage?.mime ?? null,
      guidelineImage: body.guidelineImage
        ? Buffer.from(body.guidelineImage.dataBase64, "base64")
        : null,
    };
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/task-manager/ui/types.ts src/task-manager/data/tasks-internal.ts
git commit -m "feat(task-manager): validate and fan out categoryId through task assignment"
```

---

### Task 4: Recurrence copy-forward

**Files:**
- Modify: `src/task-manager/engine/recurrence.ts`

- [ ] **Step 1: Copy `categoryId` forward in the main block-advance pass**

In `src/task-manager/engine/recurrence.ts`, in `advanceRecurringBlocks`'s first `prisma.runBlock.create` call (the main, non-subtask pass, around line 98-127), add `categoryId: block.categoryId,` immediately after the existing `templateId: block.templateId,` line.

- [ ] **Step 2: Copy `categoryId` forward in the subtask-advance pass**

In the same file's second `prisma.runBlock.create` call (the subtask pass, around line 193-220), add `categoryId: sub.categoryId,` immediately after the existing `templateId: sub.templateId,` line.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (both `block` and `sub` are already full `RunBlock` rows fetched via `findMany` with no `select`, so `.categoryId` is already available on both — no query changes needed).

- [ ] **Step 4: Run the existing test suite**

Run (PowerShell): `npm test`
Expected: 308+/308+ passing, including `engine/recurrence.test.ts` unchanged (it only tests the pure `nextWeeklyDueAt` function, untouched by this task).

- [ ] **Step 5: Commit**

```bash
git add src/task-manager/engine/recurrence.ts
git commit -m "feat(task-manager): recurring tasks keep their category across weekly generations"
```

---

### Task 5: Assign form — Category dropdown

**Files:**
- Modify: `src/task-manager/ui/types.ts`
- Modify: `src/task-manager/ui/assign-task-form.tsx`
- Modify: `src/task-manager/data/templates.ts`

- [ ] **Step 1: Add the `FlowCategoryOption` type**

In `src/task-manager/ui/types.ts`, immediately after the `FlowAssignInput` interface's closing brace (right before `export type CadenceOption = FlowPeriod | "adhoc";`), add:

```typescript
/** Assign form's flat Category picker option (2026-08-12) — active
 *  categories only, see data/task-categories.ts's listActiveTaskCategories. */
export interface FlowCategoryOption {
  id: string;
  name: string;
}
```

- [ ] **Step 2: Accept the categories list and add the dropdown**

In `src/task-manager/ui/assign-task-form.tsx`:

Add `FlowCategoryOption` to the existing type-only import from `"./types"` (the `import { ... } from "./types";` block near the top), and add a new prop:

```typescript
  categories,
```

to the destructured props list (alongside `templates`), with this type addition to the props interface (immediately after the `templates?: FlowTemplateControl;` prop and its doc comment):

```typescript
  /** Task Categories ("Type", 2026-08-12): active categories for the new
   *  Category dropdown. Omit or pass an empty array to hide the dropdown
   *  entirely — e.g. before any category has ever been created. */
  categories?: FlowCategoryOption[];
```

Add local state near the other `React.useState` declarations (alongside `templateId`):

```typescript
  const [categoryId, setCategoryId] = React.useState("");
```

Add the dropdown to the JSX, immediately after the existing Template `<select>` block (right after its closing `)}` around line 293, before the Task title `<label>`):

```tsx
        {categories && categories.length > 0 && (
          <label className="max-w-xl text-sm text-gray-600">
            Category
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={`mt-1 ${selectClass}`}
            >
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
```

In `submit`'s `action({...})` call (around line 220-235), add `categoryId: categoryId || undefined,` alongside the existing `fromTemplateId: templateId || undefined,` line.

In the post-success reset block (around line 236-250, the `if (result.ok) { ... }` branch), add `setCategoryId("");` alongside the existing `setTemplateId("");` line.

- [ ] **Step 3: Template pre-fill — carry `categoryId` through `FlowTemplateDetail`**

In `src/task-manager/ui/types.ts`, add `categoryId: string | null;` to the `FlowTemplateDetail` interface (immediately after the existing `cadence: CadenceOption | null;` field).

In `src/task-manager/data/templates.ts`'s `getTaskTemplate` (around line 116-142), add `categoryId: row.categoryId,` to the returned object, immediately after the existing `cadence: row.cadence ? CADENCE_OPTION_OF[row.cadence] : null,` line.

- [ ] **Step 4: Template pre-fill — apply it in the form**

In `src/task-manager/ui/assign-task-form.tsx`'s `applyTemplate` function (around line 116-143), add `setCategoryId(t.categoryId ?? "");` immediately after the existing `setCadence(hideCadence ? "daily" : t.cadence);` line, so choosing a template pre-fills the Category dropdown from that template's saved default — still fully editable afterward, exactly like cadence/title/subtasks already work.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/task-manager/ui/types.ts src/task-manager/ui/assign-task-form.tsx src/task-manager/data/templates.ts
git commit -m "feat(task-manager): Category dropdown on the +Task assign form"
```

---

### Task 6: Thread the active categories list to the assign form

**Files:**
- Modify: `src/task-manager/ui/add-task-button.tsx`
- Modify: `src/app/task-manager/page.tsx`
- Modify: `src/task-manager/data.ts`

- [ ] **Step 1: Export the new data-layer module from the barrel**

In `src/task-manager/data.ts`, add this line alongside the existing `export * from "./data/..."` lines:

```typescript
export * from "./data/task-categories";
```

- [ ] **Step 2: Thread `categories` through `AddTaskButton`**

In `src/task-manager/ui/add-task-button.tsx`, add `FlowCategoryOption` to the existing type-only import from `"./types"`, add a `categories?: FlowCategoryOption[];` prop to the component's props interface (mirroring the existing `templates?: FlowTemplateControl;` prop), and pass it straight through to `<AssignTaskForm ... templates={templates} categories={categories} ... />` at line 130 (right where `templates={templates}` already appears).

- [ ] **Step 3: Fetch active categories and pass them in**

In `src/app/task-manager/page.tsx`, import `listActiveTaskCategories` alongside the existing `listTaskTemplates` import (both come from the same `@/task-manager/data` barrel — add it to that same import statement, near line 48).

Immediately after the existing `const templateList = await listTaskTemplates(email);` line (around line 636), add:

```typescript
      const categoryList = await listActiveTaskCategories(email);
```

Then add `categories={categoryList}` to the `<AddTaskButton ... />` call (around line 638-667), alongside the existing `templates={{...}}` prop.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Run the existing test suite**

Run (PowerShell): `npm test`
Expected: all passing, no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/task-manager/data.ts src/task-manager/ui/add-task-button.tsx src/app/task-manager/page.tsx
git commit -m "feat(task-manager): fetch and thread active categories to the assign form"
```

---

### Task 7: Category management page

**Files:**
- Create: `src/task-manager/ui/category-manager.tsx`
- Create: `src/app/task-manager/categories/page.tsx`

- [ ] **Step 1: Write the management UI component**

Create `src/task-manager/ui/category-manager.tsx`:

```tsx
"use client";

// Task Category management (2026-08-12) — Super Admin/Operations only.
// Flat list, no fan-out/cascade logic (unlike Template/Package groups):
// create appends to the end, archive/unarchive toggles visibility from
// the assign form's picker, rename edits in place. No drag-reorder UI in
// this first cut — reorderTaskCategories exists in the data layer for a
// future pass, not wired here yet.
import * as React from "react";
import type { TaskCategorySummary } from "@/task-manager/data/task-categories";

export function CategoryManager({
  initialCategories,
  onCreate,
  onRename,
  onArchive,
  onUnarchive,
}: {
  initialCategories: TaskCategorySummary[];
  onCreate: (name: string) => Promise<{ ok: boolean; message?: string }>;
  onRename: (id: string, name: string) => Promise<{ ok: boolean; message?: string }>;
  onArchive: (id: string) => Promise<{ ok: boolean; message?: string }>;
  onUnarchive: (id: string) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [categories, setCategories] = React.useState(initialCategories);
  const [newName, setNewName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState("");

  const active = categories.filter((c) => !c.archivedAt);
  const archived = categories.filter((c) => c.archivedAt);

  const runCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    const result = await onCreate(name);
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? "Failed to create category");
      return;
    }
    setNewName("");
    // Optimistic id is unknown (server-assigned) — the caller re-fetches
    // the page's server-rendered list on next navigation; for immediate
    // feedback here, append a placeholder that a hard refresh reconciles.
    setCategories((prev) => [...prev, { id: `pending-${Date.now()}`, name, order: prev.length, archivedAt: null }]);
  };

  const runRename = async (id: string) => {
    const name = editingName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    const result = await onRename(id, name);
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? "Failed to rename category");
      return;
    }
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
    setEditingId(null);
  };

  const runArchiveToggle = async (id: string, archive: boolean) => {
    setBusy(true);
    setError(null);
    const result = archive ? await onArchive(id) : await onUnarchive(id);
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? "Failed to update category");
      return;
    }
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, archivedAt: archive ? new Date().toISOString() : null } : c)),
    );
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-1 text-lg font-semibold text-gray-900">Task Categories</h1>
      <p className="mb-6 text-sm text-gray-500">
        Manage the "Type" categories tasks can be assigned to at creation time.
      </p>

      <div className="mb-6 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category name"
          maxLength={100}
          className="flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={runCreate}
          disabled={busy || !newName.trim()}
          className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="rounded-2xl border border-gray-200 bg-white">
        <p className="border-b border-gray-100 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
          Active
        </p>
        {active.length === 0 ? (
          <p className="px-4 py-4 text-sm text-gray-400">No categories yet.</p>
        ) : (
          active.map((c) => (
            <div key={c.id} className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0">
              {editingId === c.id ? (
                <>
                  <input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    maxLength={100}
                    className="flex-1 rounded-full border border-gray-300 px-3 py-1 text-sm"
                  />
                  <button type="button" onClick={() => void runRename(c.id)} className="text-xs font-medium text-blue-600">
                    Save
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} className="text-xs font-medium text-gray-400">
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-gray-900">{c.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(c.id);
                      setEditingName(c.name);
                    }}
                    className="text-xs font-medium text-gray-500 hover:text-gray-700"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runArchiveToggle(c.id, true)}
                    className="text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-50"
                  >
                    Archive
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {archived.length > 0 && (
        <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50">
          <p className="border-b border-gray-100 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
            Archived
          </p>
          {archived.map((c) => (
            <div key={c.id} className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0">
              <span className="flex-1 text-sm text-gray-500">{c.name}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runArchiveToggle(c.id, false)}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
              >
                Unarchive
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write the page**

This mirrors `src/app/task-manager/template/page.tsx`'s exact wiring pattern (verified by reading it): `auth()` from `@/auth` resolves the session; `requireLiveSession(email)` runs inside every `"use server"` action closure as a stale-session guard (returns a non-null result to short-circuit if the session went stale — the caller returns it directly); errors are converted to `{ok, message}` via `instanceof FlowBridgeError`; the whole page is wrapped in `AppShell`. Unlike Template/Package, there's no View/Edit two-tier split here — `canManageTaskTemplateGroups` gates the WHOLE page (redirect, not a partial-access render), since nobody else needs to see this page at all. Create `src/app/task-manager/categories/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { requireLiveSession } from "@/task-manager/action-session";
import AppShell from "@/app/components/AppShell";
import { canManageTaskTemplateGroups } from "@/task-manager/role-views";
import {
  archiveTaskCategory,
  createTaskCategory,
  FlowBridgeError,
  getMyRole,
  listTaskCategories,
  renameTaskCategory,
  unarchiveTaskCategory,
} from "@/task-manager/data";
import { CategoryManager } from "@/task-manager/ui/category-manager";

export const dynamic = "force-dynamic";

const FALLBACK_MESSAGE = "Something went wrong — please try again";

export default async function TaskCategoriesPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const su = session.user as { email: string; name?: string | null; role?: string };
  const email = su.email;

  const role = await getMyRole(email);
  if (!canManageTaskTemplateGroups(role)) redirect("/task-manager");

  const categories = await listTaskCategories(email);

  async function create(name: string) {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      await createTaskCategory(email, { name });
      revalidatePath("/task-manager/categories");
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function rename(id: string, name: string) {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      await renameTaskCategory(email, id, { name });
      revalidatePath("/task-manager/categories");
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function archive(id: string) {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      await archiveTaskCategory(email, id);
      revalidatePath("/task-manager/categories");
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function unarchive(id: string) {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      await unarchiveTaskCategory(email, id);
      revalidatePath("/task-manager/categories");
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  return (
    <AppShell email={su.email} role={su.role} name={su.name}>
      <CategoryManager
        initialCategories={categories}
        onCreate={create}
        onRename={rename}
        onArchive={archive}
        onUnarchive={unarchive}
      />
    </AppShell>
  );
}
```

Verified: `requireLiveSession` (`src/task-manager/action-session.ts`) returns `Promise<{ok: false; message: string} | null>`, which is structurally compatible with `CategoryManager`'s `Promise<{ok: boolean; message?: string}>` prop types as written above — no adjustment needed.

- [ ] **Step 3: Add a sidebar link (Super Admin/Operations only)**

Find wherever the Task Manager sidebar renders links to `/task-manager/template` and `/task-manager/package` (search the codebase for `"/task-manager/template"` as a string), and add an equivalent link to `/task-manager/categories`, gated by the same `canManageTaskTemplateGroups` check already guarding those two links — mirror the existing link's exact JSX shape, don't introduce a new pattern.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/task-manager/ui/category-manager.tsx src/app/task-manager/categories/page.tsx
git commit -m "feat(task-manager): Task Category management page (Super Admin/Operations)"
```

---

### Task 8: Live-DB verification

**Files:**
- Create (temporary, delete after use): `_tmp-verify-categories.ts` in the repo root

- [ ] **Step 1: Write a smoke-test script**

Following this repo's established live-verification pattern (raw `pg`, not the Prisma adapter — this dev machine has known intermittent Prisma-adapter connectivity flakiness; raw `pg` connections are reliable), create `_tmp-verify-categories.ts` at the repo root:

```typescript
import dotenv from "dotenv";
dotenv.config({ path: ".env" });
import { Client } from "pg";

async function main() {
  const pg = new Client({ connectionString: process.env.TASK_MANAGER_DATABASE_URL });
  await pg.connect();
  try {
    const admin = await pg.query(`SELECT id, email FROM "User" WHERE role = 'ADMIN' LIMIT 1`);
    if (!admin.rows[0]) throw new Error("no ADMIN user found to use as createdById");
    const actorId = admin.rows[0].id;

    await pg.query(`INSERT INTO "TaskCategory" (id, name, "order", "createdById", "createdAt", "updatedAt")
      VALUES ('zzcat-test', 'ZZCAT-VERIFY (safe to delete)', 999, $1, now(), now())`, [actorId]);
    console.log("PASS: TaskCategory row created");

    const readBack = await pg.query(`SELECT name FROM "TaskCategory" WHERE id = 'zzcat-test'`);
    console.log(readBack.rows[0]?.name === "ZZCAT-VERIFY (safe to delete)" ? "PASS: read back correctly" : "FAIL: read-back mismatch");

    // SetNull-on-delete verification: point a throwaway RunBlock's categoryId
    // at it (reusing an existing RunBlock row rather than constructing a
    // full FlowRun/RunBlock fixture — this only tests the FK's ON DELETE
    // behavior, not assignment logic).
    const anyBlock = await pg.query(`SELECT id FROM "RunBlock" LIMIT 1`);
    if (anyBlock.rows[0]) {
      const blockId = anyBlock.rows[0].id;
      await pg.query(`UPDATE "RunBlock" SET "categoryId" = 'zzcat-test' WHERE id = $1`, [blockId]);
      await pg.query(`DELETE FROM "TaskCategory" WHERE id = 'zzcat-test'`);
      const after = await pg.query(`SELECT "categoryId" FROM "RunBlock" WHERE id = $1`, [blockId]);
      console.log(after.rows[0]?.categoryId === null ? "PASS: SetNull fired correctly on category delete" : "FAIL: categoryId not nulled");
      // Restore the borrowed RunBlock's original (null) categoryId state —
      // it was already null before this script touched it, so no other
      // cleanup needed for that row.
    } else {
      console.log("SKIP: no existing RunBlock to test SetNull against — delete category directly");
      await pg.query(`DELETE FROM "TaskCategory" WHERE id = 'zzcat-test'`);
    }
  } finally {
    await pg.query(`DELETE FROM "TaskCategory" WHERE id = 'zzcat-test'`); // idempotent safety net
    await pg.end();
  }
}
main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
```

- [ ] **Step 2: Run it**

Run: `npx tsx _tmp-verify-categories.ts`
Expected: `PASS: TaskCategory row created`, `PASS: read back correctly`, and either `PASS: SetNull fired correctly on category delete` or the `SKIP` line — no `FAIL` lines. If a Prisma-adapter-style connection error appears, retry once or twice before concluding it's the known environmental flakiness (this script uses raw `pg`, so it should not be affected — a failure here is more likely a real bug).

- [ ] **Step 3: Manual UI smoke test**

With the dev server running (`npm run dev`), as a Super Admin or Operations-role account:
1. Visit `/task-manager/categories` — create a category (e.g. "Test Category"), confirm it appears in the Active list.
2. Open "+ Task", confirm the new Category dropdown appears and lists "Test Category" alongside "Uncategorized".
3. Assign a Daily task with that category selected to yourself, confirm submission succeeds.
4. Back on `/task-manager/categories`, archive "Test Category", confirm it moves to the Archived list, and re-open "+ Task" to confirm it's no longer offered in the dropdown (existing assigned task is unaffected — this plan doesn't build a way to view a task's category yet, that's the Overview redesign plan's job).
5. Delete the test task via whatever cleanup method is appropriate (this repo's established cancellation pattern — cancel the FlowRun, don't hard-delete) and unarchive/delete "Test Category" via the management page if it should not remain.

- [ ] **Step 4: Clean up and final gate**

```bash
rm _tmp-verify-categories.ts
```

Run (PowerShell): `npm test`
Run: `npx tsc --noEmit`
Run: `npm run build`
Expected: all three clean — 308+/308+ tests passing, zero new type errors, successful production build.

- [ ] **Step 5: Final commit**

```bash
git status --short
```

Confirm only the intended files from Tasks 1–7 are committed and `_tmp-verify-categories.ts` is gone (not tracked). No further commit needed here if Task 7's commit already covers everything — this step is a verification checkpoint, not necessarily a new commit.
