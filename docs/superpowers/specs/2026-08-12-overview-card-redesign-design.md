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

---

## Addendum (2026-08-12): Stacked-sections restructure

Written after the "Overview page controls" section above (Filter: Daily/
Monthly/HOD Assigned Task, as a single toggle) shipped and was live-tested.
**This addendum supersedes that Filter toggle entirely** — Daily, Monthly,
HOD Assigned Task, and CEO Assigned Task become four always-visible, stacked
sections instead of four mutually-exclusive views behind one dropdown. Date
filter, Sort, and View controls are unaffected in spirit but now live inside
each section rather than in one shared header row (see below).

### New page structure, top to bottom

1. **Daily** — the Person-sort card grid, always Daily tasks, its own date
   filter (unchanged `DailyDatePicker`).
2. **Monthly** — same card-grid concept, Monthly tasks, its own month/range
   filter (unchanged `MonthDropdown`/`MonthRangeDropdown`).
3. **HOD Assigned Task** — entity-wide, all-time, tasks assigned by an HOD
   (reuses/extends the existing `getEntityHodAssignedPayload` logic already
   built for the old Filter's third option).
4. **CEO Assigned Task** — same concept, for tasks assigned by the CEO. This
   is **new data-layer work**: no CEO-assigned equivalent of
   `getEntityHodAssignedPayload`/`getDepartmentHodAssigned`/
   `getBranchHodAssigned` exists yet — the redesign needs a mirrored
   `getEntityCeoAssignedPayload` (`buildEntityPayload(type, name, null,
   {assignerRole: "CEO"})`, same `assigneeIdIn`-bounded all-time query shape)
   plus `getDepartmentCeoAssigned`/`getBranchCeoAssigned` query wrappers.

Each section keeps its own **Sort: Person / Type** toggle (confirmed —
orthogonal to which section you're looking at, so collapsing Filter into
fixed sections doesn't remove the value of Type-sort within a period).

### Rollout scope: page-wide, every role (confirmed)

This is the single biggest change from the original spec's footprint. The
original redesign only ever touched `EntityCardOverview`'s existing call
sites — HOD/DEPT_SITE's own department, Branch Manager's own branch, and
(as of the 2026-08-12 follow-up migration) the Admin/elevated
dropdown-driven overview. **Confirmed: this stacked structure becomes the
general Task Manager overview for every role**, including plain staff who
today have no entity-overview section at all — only the separate personal
"My Tasks — Daily"/"My Tasks — Monthly" `ResizableTaskList` widgets. Under
this addendum, those personal widgets' PLACE in the page is taken over by
the new self-scoped Daily/Monthly sections (see the interactivity flag
below — this is not a pure visual swap).

### Visibility rules, confirmed

- **Daily and Monthly sections** follow the identical rule: a viewer whose
  role doesn't own an entity (plain MEMBER staff, OPS, a CEO's own personal
  view) sees exactly one card — their own. A viewer whose role owns an
  entity (HOD/DEPT_SITE → their department; BRANCH/BRANCH_SITE → their
  branch; Admin/elevated dept-site/CEO via the dropdown → whichever
  department/branch is selected) sees the whole entity's roster, one card
  per member, same as `EntityCardOverview` already does today.
- **HOD Assigned Task / CEO Assigned Task sections** are entity-wide and
  visible to everyone in that department/branch (read-only for anyone who
  isn't the HOD/CEO who did the assigning) — not gated to the assigner the
  way `canReassign` gates the "Assign to Others" action. A plain staff
  member sees their whole department's HOD Assigned Task section (not just
  their own row within it), same visibility posture as the entity-wide
  Daily/Monthly cards.
- **View: All / Only Me** stays exactly where it already is conceptually —
  it only has meaning for entity-scoped viewers (HOD/managers/admin/CEO
  dropdown), narrowing the grid down to their own card within an
  entity-wide section. For self-scoped viewers (plain staff, OPS) there is
  nothing to narrow — the control is hidden entirely for those roles rather
  than rendered disabled.

### Task interactivity (confirmed)

`EntityCardOverview`'s existing Person/Type cards are **pure display** —
status dot + title, no click handlers, no Complete/Skip/Reopen/proof-upload
actions. The personal "My Tasks — Daily/Monthly" `ResizableTaskList` widgets
they replace under the page-wide rollout are **fully actionable** — this is
how every non-manager role actually completes their own tasks today.

**Confirmed:** the card grid gains row-level actions, but *only* for a
viewer's own self-scoped card — the one showing their own Daily/Monthly
tasks (whether that's a plain staff member's single card, or the viewer's
own card within an entity-wide roster grid). Every OTHER person's card in an
entity-wide roster (a HOD looking at their department, an admin looking at
a selected department/branch) stays read-only — you can't complete someone
else's task, same restriction `EntityOverviewSection`'s old roster had
outside of the explicit "Assign to Others" action.

Implementation implication: `FlowTaskRow` needs action callbacks
(complete/skip/reopen/upload-proof — the same four `ResizableTaskList`
already wires today) threaded into `EntityCardOverview`, applied
conditionally per-card based on whether that card's `userId` matches the
viewer's own id — not a blanket read-only-vs-actionable component split.

### What this replaces / subsumes

- The "Overview page controls" Filter toggle (Daily/Monthly/HOD Assigned
  Task) above — gone, replaced by the four stacked sections.
- The personal "My Tasks — Daily"/"My Tasks — Monthly" widgets — subsumed by
  the new self-scoped Daily/Monthly sections, now that those cards gain the
  same row-level actions (see "Task interactivity" above).
- The existing personal day-windowed "CEO assigned"/"HOD assigned" streams
  (`personalCeo`/`personalHod` in `page.tsx`, `dayWindowedStream`) —
  superseded: a viewer's own Daily/Monthly card already includes every task
  assigned to them regardless of who assigned it, and the new entity-wide
  HOD/CEO Assigned Task sections cover the oversight use case (seeing
  everyone's HOD/CEO-assigned tasks) those personal streams never did.
  Flagging this as an assumption, not an explicit request — the personal
  streams were day-windowed (a specific date) while the new sections are
  all-time, so this is a real behavior change worth confirming.

---

## Addendum 2 (2026-08-12): Per-role mapping (confirmed: Replace, Ad hoc untouched)

Written after reading `task-manager-view.tsx` and `role-views.ts` in full —
the page has 10 distinct `ViewRole`s and 15+ `SectionKey`s, far more bespoke
per-role variation than "self-scoped vs entity-scoped" alone captures.
Confirmed: **Replace** overlapping concepts with the new 4-section stack
(not additive); **Ad hoc stays completely untouched** (its own donut,
personal list, and branch-wide oversight card are outside this redesign —
a fundamentally different, non-recurring cadence that was never part of the
original spec).

### Key mechanism: entity-owning roles already contain "own card" — no separate self-section needed

For roles that own an entity (HOD/DEPT_SITE → department; BRANCH/
BRANCH_SITE → branch), the restructured `departmentOverview`/
`branchOverview`/`entityDropdowns` component **is** the Daily/Monthly/HOD
Assigned/CEO Assigned stack — the viewer's own card already appears inside
the whole-roster grid (actionable, per the Task Interactivity rule above).
There is no redundant separate personal Daily/Monthly section for these
roles; their existing `personalDaily`/`personalMonthly`/`ceoAssigned`/
`myTasksDaily`/`myTasksMonthly`/`assignedByMeList` sections are retired
entirely, subsumed into the one restructured entity component.

### Component architecture: split into a single-dataset card grid + a stacking wrapper

Once Filter becomes four always-visible sections, each with its OWN Sort
and View controls scoped to just that section (not shared globally — see
below), the cleanest shape is no longer "one component with an internal
Daily/Monthly/HOD/CEO switch." `EntityCardOverview` is refactored to render
**one** section's card grid — `entityName`, `entity: FlowEntityDetail`,
`categories`, `myUserId`, `dateControl?`, `sectionLabel` (e.g. "Daily"),
`showViewToggle: boolean` (see below) — with its own Sort: Person/Type and
(conditionally) View: All/Only Me. A new wrapper component stacks up to
four instances of it top to bottom, one per section, each fed independently
— a section is simply omitted when the caller has no data for it (OPS/CEO's
missing HOD/CEO Assigned Task, BRANCH_MEMBER/COACH's missing Monthly).

`showViewToggle` is an **explicit prop from the caller**, not inferred from
`entity.members.length` — a genuinely real one-person department shouldn't
silently lose the toggle just because it happens to have one member; the
caller always knows whether it built a synthetic self-only entity or fetched
a real multi-person roster, so it states that directly.

### New SectionKey: `myOverview` (self-only roles) — composed per-section, not uniformly synthetic

For roles with no owned entity at all (OPS; the CEO on their own page,
before using the dropdown), `myOverview` renders Daily + Monthly only, both
fed a **synthetic one-member `FlowEntityDetail`** built from data already
fetched today (`daily.me`/`monthly.me`'s existing `FlowPersonal.tasks`,
which already carry `assigneeName` for free) — `members: [theViewerAsA
Member]`. No new data fetch needed for these two roles; `showViewToggle`
is `false` on both sections (nothing to toggle with one card). No HOD/CEO
Assigned Task section at all — neither role owns a single department to
scope the query to.

**Correction (confirmed after review): plain MEMBER-role viewers
(DEPT_MEMBER/BRANCH_MEMBER/COACH) do NOT get an HOD/CEO Assigned Task
section either** — that idea (entity-wide, read-only, visible to everyone)
is dropped for this role tier entirely. Instead, their **Daily** section
gets whole-entity visibility: DEPT_MEMBER's Daily section fetches the REAL
department roster (same `getDepartmentDetail(email, ownDepartment,
"daily", date)` HOD's own department Daily section already uses,
`showViewToggle: true`), not a synthetic self-only wrapper. By the same
symmetry the codebase already applies everywhere else (branch mirrors
department), BRANCH_MEMBER/COACH's Daily section gets the equivalent
whole-**branch** visibility via `getBranchDetail(email, ownBranch, "daily",
date)` — stated here as this addendum's own interpretation of "MEMBER
role" (the request said "department" specifically; extending it
symmetrically to the branch-side MEMBER tier for consistency, easy to
correct if that's not intended). **Monthly is explicitly unchanged**:
DEPT_MEMBER's Monthly section stays the synthetic self-only wrapper
(`showViewToggle: false`) — matching today's existing `personalMonthly`
restriction, per the instruction not to touch it. BRANCH_MEMBER/COACH still
get no Monthly section at all, preserving their existing Daily-only
constraint (unchanged from the first per-role pass above). Every non-own
card in the whole-department/branch Daily grid stays read-only, same Task
Interactivity rule as everywhere else — only the viewer's own card is
actionable.

### Minimal permission change (replaces the earlier, broader proposal)

The earlier proposal (widen `getDepartmentHodAssigned`/
`getBranchHodAssigned`/new CEO-assigned queries for MEMBER) is **dropped
entirely** — MEMBER no longer touches those functions at all. The actual
permission need is different and narrower: `getDepartmentDetail`/
`getBranchDetail` (used for Daily's whole-entity fetch) are gated by the
shared, period-unaware `canViewEntity`, which returns `false` for role
`MEMBER` unconditionally. **Still do not broaden `canViewEntity` itself**
— it has no period parameter, and widening it would silently also unlock
Monthly whole-department detail for MEMBER, which must stay unchanged.
Instead, add a narrow, **period-gated** exception directly at the two call
sites:

```typescript
// getDepartmentDetail, after `const user = await requireUserByEmail(email);`
const ownDailyView =
  user.role === "MEMBER" && q.period === "daily" && q.department === (user.department ?? UNASSIGNED);
if (!canViewEntity(user, "department", q.department) && !ownDailyView) {
  throw new ApiHttpError(403, "You can only view your own department");
}
```

Same shape in `getBranchDetail`, checking `user.branch` instead. This is
period-aware (Monthly still 403s for MEMBER, exactly as today) and touches
only these two functions — nothing else that reads `canViewEntity`
(`getDepartmentHodAssigned`/`getBranchHodAssigned`/the admin dropdown/etc.)
is affected.

### Flagged behavior changes (real, not cosmetic)

- **CEO loses `ceoTaskTable`** (today: one always-visible table of every
  task the CEO has delegated out, across every department at once).
  Confirmed accepted — replaced by nothing equivalent on the CEO's own
  page; the same information is now reachable per-department via
  `entityDropdowns`'s CEO Assigned Task section, one department at a time.
- **Plain MEMBER-role viewers (DEPT_MEMBER) gain department-wide Daily
  visibility they never had before** — today they see only their own Daily
  tasks; after this change they see their whole department's Daily roster
  (own card actionable, everyone else's read-only), the same visibility
  HOD already has for Daily. This is the corrected, confirmed design (see
  above) — flagging since it's a genuine widening of what regular staff can
  see, not a cosmetic change.
- **BRANCH_MEMBER/COACH keep their existing Daily-only constraint** — no
  Monthly section, preserving the "Daily ONLY" final spec these two roles
  already have. Their Daily section gets the branch-side equivalent of
  DEPT_MEMBER's expanded visibility (whole branch, not just their own row)
  by this addendum's own symmetry interpretation — flagged above as an
  extrapolation from "department," not an explicit instruction.
- **CEO and OPS gain a Monthly section they never had before**
  (`myTasksMonthly` didn't exist for either role pre-redesign) — a direct
  consequence of "page-wide, every role gets it."
- **No HOD/CEO Assigned Task section for any MEMBER-role viewer** —
  dropped per the confirmed correction; only entity-owning roles
  (HOD/DEPT_SITE/BRANCH_MANAGER/BRANCH_SITE) and the dropdown-driven roles
  (ADMIN/ELEVATED_DEPT_SITE/CEO) get it.

### Final per-role `taskManager` section arrays (before → after)

| Role | Before | After |
|---|---|---|
| ADMIN | `entityDropdowns` | `entityDropdowns` (internally restructured to 4 sections; unchanged array) |
| CEO | `myTasksDaily, ceoTaskTable, entityDropdowns` | `myOverview, entityDropdowns` (both restructured/new; `ceoTaskTable` retired) |
| OPS | `personalDaily, personalMonthly, assignerStreams, myTasksDaily, myTasksMonthly` | `myOverview, assignerStreams` (`assignerStreams` unchanged — different concept, doesn't overlap) |
| HOD | `personalDaily, personalMonthly, ceoAssigned, myTasksDaily, myTasksMonthly, myBoard, assignedByMeList, departmentOverview` | `myBoard, departmentOverview` (`myBoard` unchanged; everything else subsumed into the restructured `departmentOverview`) |
| ELEVATED_DEPT_SITE | `entityDropdowns` | `entityDropdowns` (restructured; unchanged array) |
| DEPT_SITE | `departmentOverview` | `departmentOverview` (restructured; unchanged array) |
| BRANCH_MANAGER | `personalDaily, personalMonthly, personalAdhoc, myTasksDaily, myTasksMonthly, myTasksAdhoc, branchOverview, adhocOversight, manpowerLink` | `personalAdhoc, myTasksAdhoc, branchOverview, adhocOversight, manpowerLink` (Ad hoc/manpower unchanged; Daily/Monthly subsumed into restructured `branchOverview`) |
| BRANCH_SITE | `branchOverview, adhocOversight` | `branchOverview, adhocOversight` (restructured; unchanged array) |
| DEPT_MEMBER | `personalDaily, personalMonthly, hodAssigned` | `myOverview` (Daily = real whole-department roster via `getDepartmentDetail`, own card actionable, `showViewToggle: true`; Monthly = synthetic self-only, unchanged, `showViewToggle: false`; no HOD/CEO Assigned Task) |
| BRANCH_MEMBER | `personalDaily` | `myOverview` (Daily = real whole-branch roster via `getBranchDetail`, own card actionable, `showViewToggle: true`; no Monthly — Daily-only constraint preserved; no HOD/CEO Assigned Task) |
| COACH | `personalDaily` | `myOverview` (same as BRANCH_MEMBER) |

**Correction: `SectionKey`s are NOT deleted from the enum, even the fully
Task-Manager-retired ones.** `personalDaily`/`personalMonthly`/
`ceoAssigned`/`hodAssigned` are also used by `ROLE_VIEWS[role].home` — the
**Home page** (`/home`, rendered by an entirely different set of files,
e.g. `home-overview.tsx`/`scoped-overview-section.tsx`), which this
redesign does not touch at all. E.g. HOD's `home` array is still
`["personalDaily", "personalMonthly", "ceoAssigned", "departmentOverview"]`
— unchanged. This addendum only changes each role's `taskManager` array
(above) and the corresponding render blocks in `task-manager-view.tsx`
(guarded by `shows(view, "taskManager", key)`) — `shows(view, "home",
key)` and everything under `src/app/home/` stay exactly as they are. No
`SectionKey` gets removed from the type; only from certain roles'
`taskManager` arrays. (Verified no cross-contamination risk: every role
whose `taskManager` array drops to `myOverview` — DEPT_MEMBER/
BRANCH_MEMBER/COACH/OPS — never calls `getDepartmentDetail`/
`getBranchDetail` from a `home` context for a `MEMBER`-role viewer either,
so the new period-gated Daily exception above is exercised only from the
Task Manager page.)
