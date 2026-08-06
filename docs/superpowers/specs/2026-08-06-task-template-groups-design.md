# Task Template Groups ("Template" page) — Design

- **Date:** 2026-08-06
- **Status:** Approved (design confirmed in brainstorming session)

## 1. Summary

Build out the `/task-manager/template` page (currently a placeholder, linked
from the new "Task Manager" sidebar dropdown) into a full management UI for
**reusable multi-task templates**: a named collection of several top-level
tasks, each optionally with its own subtasks — e.g. "Template A: Create
Video / Post Video / Update."

This is a genuinely different concept from the existing `TaskTemplate` model
(added 2026-07-31), which stores exactly **one** task's reusable shape
(`title` + `subtasks: string[]`) and powers the "+ Task → Start from a
template" picker. That existing single-task flow is unaffected by this work.

## 2. Decisions log

| Decision | Outcome |
|---|---|
| Relationship to existing `TaskTemplate` | **Reuse it.** New model is a pure grouping layer; each task inside a group is an ordinary `TaskTemplate` row. Existing single-task template flow (creation via "Save as Template", the hub's Edit/Remove/Reassign/Archive tabs, "Start from a template" picker) is untouched. |
| Naming | Grouping model is `TaskTemplateGroup`, **not** "Package" — `/task-manager/package` is a separate, unrelated sidebar placeholder; reusing that word in this feature's UI copy or model names would be confusing. |
| Create vs. Assign | **Two separate actions.** Creating a template group never asks for a recipient. A separate "Assign" action (per template, on demand) picks recipient(s) + due date/cadence and creates every task/subtask in the group for them in one submit. |
| Subtask builder | Extract the existing add/remove/max-20 subtask logic (currently duplicated between `assign-task-form.tsx` and `template-panels.tsx`) into one shared `SubtaskListEditor` component, reused a third time here instead of duplicated again. |
| Role gating | Same allow-list as the rest of Task Manager assignment (`ADMIN \| OPS \| CEO \| HOD \| isElevatedDeptSite`). No new roles or restrictions. |

## 3. Grounding facts (verified 2026-08-06, via research agent)

- `TaskTemplate` (`prisma/task-manager/schema.prisma`): `id, createdById,
  name, title, subtasks (Json, string[]), cadence?, guidelineUrl?,
  guidelineMime?, guidelineImage? (Bytes), archivedAt?, createdAt,
  updatedAt`. One row = one task's structure. Confirmed `title` is a bare
  `String` and `subtasks` is a flat string array — there is no nested
  task-object structure today.
- `RunBlock.templateId` is a **loose string reference** (no `@relation`),
  intentionally — so deleting a template can cancel its pending assignments
  while completed history keeps its dangling reference. This precedent does
  not apply to the new `TaskTemplateGroup ↔ TaskTemplate` link, which is a
  live ownership relation (a group directly owns its member rows), so that
  link uses a real Prisma relation.
- `src/task-manager/data/templates.ts` (687 lines) is the full data layer
  for `TaskTemplate`: `listTaskTemplates`, `getTaskTemplate`,
  `renameTaskTemplate`, `getTemplateDeletionImpact`, `deleteTaskTemplate`,
  `removeTemplateAssignments`, `getTemplateAssignees`, `editTaskTemplate`,
  `archiveTemplateTasks`, `unarchiveTemplateTasks`, `listArchivedItems`,
  `reassignTemplateTasks`. Every function calls `requireAssigner(email)`
  (role check). This layer is mature (cascade-safety, live impact previews,
  audit-friendly) and is reused, not reimplemented.
- Template creation today happens inside `assignFlowTask` via a
  `saveAsTemplate` flag on the regular "+ Task" form — there is no
  standalone "create template" action currently. Applying a template
  pre-fills the assign form (`applyTemplate` in `assign-task-form.tsx`);
  submission is a normal assignment with `fromTemplateId` set.
- Template management UI today lives in the "+ Task" hub modal
  (`add-task-button.tsx`'s tab bar: assign/edit/remove/reassign/archive),
  not on a dedicated page. `src/task-manager/ui/template-panels.tsx` holds
  `TemplateEditPanel`, `TemplateRemovePanel`, `TemplateReassignPanel`,
  `TemplateArchivePanel`.
- Subtask builder (`assign-task-form.tsx` lines ~195-207, ~320-371):
  `subtasks: string[]` + `subtaskDraft` state, `SUBTASK_MAX = 20`,
  add-on-Enter-or-button, per-item remove, 200-char cap per subtask,
  duplicates allowed. Duplicated near-verbatim in `template-panels.tsx`'s
  `TemplateEditPanel` (lines ~194-246).
- Role gating: `showsAddTaskHeader(view)` (client) and `requireAssigner`
  (server) both use the same 5-way allow-list: `ADMIN, CEO, OPS, HOD,` or
  `isElevatedDeptSite(user)`.
- `/task-manager/template/page.tsx` already exists as a placeholder
  ("Coming soon"), linked from the sidebar's new "Task Manager" dropdown —
  this is the exact page this feature replaces.

## 4. Data model

```prisma
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

Add to the existing `TaskTemplate` model:

```prisma
  templateGroupId String?
  groupPosition   Int?
  group           TaskTemplateGroup? @relation(fields: [templateGroupId], references: [id])

  @@index([templateGroupId])
```

`templateGroupId = null` means "standalone single-task template," exactly
today's behavior — nothing about the existing picker/hub changes for those
rows.

Applied via the same hand-written-SQL + `prisma db execute` +
`prisma migrate resolve --applied` sequence used for every other Task
Manager schema change this project (not `prisma migrate dev`, which has
previously threatened to drop unrelated physical trigger-synced tables).

## 5. Data layer — `src/task-manager/data/template-groups.ts` (new file)

Thin orchestration layer over the existing `data/templates.ts` functions —
no new cascade-safety logic is written from scratch.

| Function | Behavior |
|---|---|
| `listTemplateGroups(email)` | Card data: `{id, name, taskCount, previewTitles (first 3), updatedAt}[]`, owner-scoped, non-archived, newest-updated first. |
| `getTemplateGroup(email, groupId)` | Full detail: `{id, name, tasks: {id, title, subtasks: string[]}[]}`, ordered by `groupPosition`. 404s if not owned. |
| `createTemplateGroup(email, {name, tasks: {title, subtasks}[]})` | One transaction: creates the group row + one `TaskTemplate` per task (`templateGroupId` set, `groupPosition` 0..N-1). Reuses the same validation caps as today (task title required, ≤20 subtasks, ≤200 chars each). |
| `editTemplateGroup(email, groupId, {name, tasks})` | Renames the group. Reconciles the submitted task array against existing members: new entries → create; removed entries → `deleteTaskTemplate` (existing cascade-safety); kept entries → `editTaskTemplate` (existing pending-instance propagation). |
| `getGroupDeletionImpact(email, groupId)` | Aggregates `getTemplateDeletionImpact` across all member tasks for a single confirm-dialog preview. |
| `deleteTemplateGroup(email, groupId)` | Loops `deleteTaskTemplate` per member (cancels pending instances, keeps completed history), then deletes the group row. |
| `archiveTemplateGroup` / `unarchiveTemplateGroup` | Loops the existing `archiveTemplateTasks` / `unarchiveTemplateTasks` per member, plus stamps/clears `TaskTemplateGroup.archivedAt`. |
| `applyTemplateGroup(email, groupId, {assigneeIds, days, dueAt, cadence})` | The "Assign" action. One recipient/date/cadence choice; calls the existing `assignFlowTask` once per member task (`fromTemplateId` set per task), same as today's single-template apply — just looped across the group's tasks. |

All functions call the existing `requireAssigner(email)` guard — no new
authorization logic.

## 6. UI

- **`/task-manager/template` (dashboard)** replaces the placeholder body.
  Grid of template-group cards: name, task count, preview of first few task
  titles, "Edit" / "Assign" / "Delete" actions per card, "+ New Template"
  button. Empty state when the user has none yet.
- **Create / Edit modal** — new component, modeled on the existing "+ Task"
  hub modal's structure: name field at top, then repeatable task blocks
  (title input + the new shared `SubtaskListEditor`), "+ Add another task"
  to append a block, remove button per block. Edit mode pre-fills from
  `getTemplateGroup`.
- **`SubtaskListEditor`** (new shared component, extracted from the
  existing duplicated logic in `assign-task-form.tsx` and
  `template-panels.tsx`) — both existing call sites are refactored to use
  it, so the add/remove/max-20/200-char behavior stays byte-identical
  everywhere, just de-duplicated.
- **Assign modal** — opened from a card's "Assign" button: recipient
  picker + days/due-date/cadence, reusing the same fields and CEO-hides-
  cadence rule already established in `assign-task-form.tsx`. Submits to
  `applyTemplateGroup`.
- **Delete** — confirm dialog showing the aggregated pending-impact preview
  (via `getGroupDeletionImpact`) before deleting, matching the existing
  single-template delete UX in `TemplateRemovePanel`.

Role gating: page and all actions guarded the same way as the rest of Task
Manager assignment (`showsAddTaskHeader` client-side, `requireAssigner`
server-side).

## 7. Out of scope

- No changes to the existing single-task `TaskTemplate` flow, the "+ Task"
  hub modal, or its four existing tabs.
- No changes to `/task-manager/package` or `/task-manager/package-table`
  (separate, unspecified placeholders).
- No bulk import/export of template groups.
- No reordering UI for tasks within a group beyond add/remove (tasks render
  in creation order; reordering can be a later addition if needed).
