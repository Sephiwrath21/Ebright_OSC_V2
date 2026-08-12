# Overview Page Card Redesign + Task Categories — Design

## Goal

Replace the Task Manager's entity Overview section (`department-overview.tsx`'s
`EntityOverviewSection`, rendered inline on `/task-manager` for both
departments and branches) with an always-visible card grid, in two switchable
layouts:

- **Sort: Person** — one card per person, their tasks as a simple checklist.
- **Sort: Type** — one card per task category, a Task/Assignee table per
  category, including a catch-all "Uncategorized" card.

This is a real layout change, not a restyle: today's roster is click-through
(click a name → see their donut + task list); the new grid shows everyone's
tasks at once.

Task categories ("Type") are a brand-new concept with no existing backing in
the data model — introduced here as an admin-managed, extensible taxonomy
(e.g. Flowghan, CNS, SMS, Inventory, HRMS, Email Marketing — org-specific,
open-ended, not a fixed enum).

## Architecture

### Data model

New model `TaskCategory`, mirroring `TaskTemplateGroup`'s existing shape
(named, ordered, reversibly archivable, creator-tracked):

```prisma
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

`RunBlock` gets the source-of-truth field (every task instance, template-based
or fully manual, needs to be categorizable):

```prisma
model RunBlock {
  // ...existing fields...
  categoryId String?
  category   TaskCategory? @relation(fields: [categoryId], references: [id], onDelete: SetNull, onUpdate: NoAction)

  // add to existing index block:
  @@index([categoryId])
}
```

`TaskTemplate` gets the same field, but only as an assign-form pre-fill
default (never authoritative — mirrors how `cadence` already works on
templates today):

```prisma
model TaskTemplate {
  // ...existing fields...
  categoryId String?
  category   TaskCategory? @relation(fields: [categoryId], references: [id], onDelete: SetNull, onUpdate: NoAction)
}
```

`onDelete: SetNull` on both relations: archiving/deleting a category never
orphans or blocks deletion of tasks — affected rows simply fall back to
`categoryId: null`, i.e. "Uncategorized," matching the catch-all card.

**Legacy data:** no backfill migration. Every existing `RunBlock`/
`TaskTemplate` row is implicitly `categoryId: null` = Uncategorized.

**Recurrence:** `engine/recurrence.ts`'s weekly catch-up already copies
`templateId: block.templateId` forward to each new generation's
`RunBlock.create` call (both the parent-block pass and the subtask pass).
Add `categoryId: block.categoryId` alongside it in both places, so a
recurring task keeps its category every week without re-tagging — consistent
with category being set-once-at-creation, never edited after (see below).

### Category assignment: creation-time only, no retroactive edit

Confirmed scope: a task's category is chosen **once**, on the "+Task" assign
form, at creation time. There is no edit/reassign-category action on existing
tasks (unlike "Assign to Others," which does allow reassignment). This keeps
the write surface small: `assignFlowTaskCore` (or its input schema) gains an
optional `categoryId`, validated against non-archived `TaskCategory` rows,
and every `RunBlock` created by that assignment (all recipients × all days)
gets the same `categoryId` — exactly the same fan-out shape `guidelineId`
already uses today.

UI: a new `<select>` on `assign-task-form.tsx`, following the existing
Template `<select>` immediately above it (same `selectClass` styling,
`<option value="">Uncategorized</option>` as the default/empty choice).
Picking a Template pre-fills this from `TaskTemplate.categoryId` if set,
exactly like it pre-fills cadence/title/subtasks — the assigner can still
override it before submitting.

### Category management (admin CRUD)

Create / rename / reorder / archive a `TaskCategory` — reuses the existing
`canManageTaskTemplateGroups` permission gate (Super Admin + Operations),
the same check Package Table's edit access already uses. No new permission
tier. UI: a small admin panel (new tab or inline list, exact placement to be
decided in planning) following the same list-with-archive-action pattern
`TaskTemplateGroup` management already has.

### Overview page controls

Per the confirmed mockup, the redesigned section's header row gets four
controls:

1. **Filter: Daily / Monthly / HOD Assigned Task** — a single dropdown,
   mutually exclusive. Daily/Monthly filter by `RunBlock.cadence` (existing
   behavior). **Assumption to confirm during review:** "HOD Assigned Task"
   filters by *who assigned the task* (an HOD) rather than by cadence — i.e.
   it's a third, orthogonal lens on the same task pool, similar to how
   `assignedByMeList` ("Task Assignment") already surfaces an HOD's own
   delegated-out tasks elsewhere. Flagging this explicitly since the exact
   semantics weren't pinned down in the mockup review.
2. **Date filter** — unchanged, existing date-picker control.
3. **Sort: Person / Type** — switches which card grid renders (see below).
4. **Filter: View All / Only Me** — "Only Me" scopes the grid to the logged-in
   viewer's own card (Person-sort) or their own tasks within each category
   card (Type-sort); "View All" is the existing full-entity scope.

### Card grid: Sort = Person

One card per person in the entity's member roster (same roster
`EntityOverviewSection` already computes via `FlowEntityDetail.members`).
Each card: person's name as header, their tasks as a plain checklist (status
dot + title, no due date/assignee columns — matches the sketch). A person
with zero tasks this period still gets a card ("No tasks this period."),
matching existing empty-state conventions elsewhere in this UI.

### Card grid: Sort = Type

One card per non-archived `TaskCategory` (org-wide list, `order`-sorted),
plus exactly one trailing **"Uncategorized"** card — always rendered, even
when empty, so a task can never silently disappear from this view. Each
card: category name as header, a Task/Assignee table for that category's
tasks this period. A category with zero tasks this period still renders
(empty card) — confirmed requirement, so a newly-created category is visible
immediately without needing a task assigned to it first.

### Scope of replacement

Replaces `EntityOverviewSection` **entirely** at both of its existing call
sites in `task-manager-view.tsx` (department view and branch view) — not an
additional section alongside the old one. The donut/legend/summary-chip
presentation this replaces stays defined in `bits.tsx`
(`StatusDonut`/`BucketLegend`/`SummaryChip`) for reuse elsewhere unaffected
by this change (e.g. `TaskProgressCard`, `MiniDonutBlock` are untouched).

## Testing

- Unit: `TaskCategory` CRUD (create/rename/reorder/archive) permission gate
  and archive-cascades-to-SetNull behavior.
- Unit: recurrence `categoryId` copy-forward (mirrors the existing
  `templateId` copy-forward test, if one exists, or extends it).
- Unit: assign-time category fan-out (every recipient × day gets the same
  `categoryId`, mirrors existing `guidelineId` fan-out tests).
- Manual/live-DB: verify a category's archive doesn't break existing task
  rows (SetNull confirmed via query, not just schema inspection — this
  session's established Prisma-adapter connectivity flakiness means a raw
  `pg` verification query is the more reliable path if live-DB testing is
  attempted).
