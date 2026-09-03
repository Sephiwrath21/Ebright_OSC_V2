# Package (Branch-Manager Template Groups) — Design

- **Date:** 2026-08-06
- **Status:** Approved (design confirmed in brainstorming session)
- **Extends:** `2026-08-06-task-template-groups-design.md` (the "Template" feature)

## 1. Summary

Build out the `/task-manager/package` page (currently a placeholder) into a
second instance of the Template Groups feature — same create/list/assign
flow, same underlying data model — but restricted to Branch Managers only,
with its data kept fully separate from Template's.

Concretely: generalize the already-built, already-reviewed Template Groups
feature (`TaskTemplateGroup`, `src/task-manager/data/template-groups.ts`,
and the three UI components `TemplateGroupDashboard` /
`TemplateGroupFormModal` / `TemplateGroupAssignModal`) with a `scope`
discriminator, rather than forking a parallel set of tables/files. Package
is a second **scope** of the same underlying feature, not a new feature
built from scratch.

## 2. Decisions log

| Decision | Outcome |
|---|---|
| Data separation | **One set of tables, a `scope` field.** Add `TemplateGroupScope` (`TEMPLATE \| PACKAGE`) to `TaskTemplateGroup`. Every data-layer function takes `scope` as a parameter and filters/sets by it. Rejected: fully separate `PackageGroup`/`PackageTemplate` models — would fork the entire data layer into a near-duplicate, contradicting the ask to reuse the same logic. |
| "Branch Manager" identity | **`Role.BRANCH` exactly.** Confirmed via `role-views.ts`'s `ViewRole` mapping (`case "BRANCH": return "BRANCH_MANAGER"`) and the existing Manpower Schedule feature's own gate (`actor.role === "BRANCH"`). `employmentType === "Manager"` is a display/recipient-filter field only, never used for access control anywhere in this codebase — not used here either. |
| Template's own access | **Widened to include Branch Manager.** Template was previously `ADMIN \| OPS \| CEO \| HOD \| elevated-dept-site` (Branch Manager excluded) — this was a real gap relative to what was assumed. Fixed via a *new*, Template-Groups-scoped check, not by editing the shared `requireAssigner` in `templates.ts` (see below), so the older single-task "+ Task → Start from a template" flow's access is untouched. |
| Package's own access | **Branch Manager only.** No other role — not ADMIN, not OPS, nothing else. |
| Shared `requireAssigner` (`templates.ts`) | **Untouched.** Adding Branch Manager to Template's access is done via a new `requireGroupAccess(email, scope)` function local to `template-groups.ts`, not by editing `requireAssigner` — editing the shared helper would also grant Branch Managers access to the *old* single-task template hub (which nobody asked for and wasn't in scope). |
| Sidebar link visibility | **Page-gate only, no sidebar changes.** The sidebar has no role-based filtering today (every item is static/always shown, confirmed by inspection). Adding per-role nav filtering would touch `Sidebar.tsx`, a shared component rendered on every page for every role — out of scope for this feature. A non-Branch-Manager who clicks "Package" gets redirected, same as every other role-gated page in this app. |
| UI component reuse | **Same three components, one new optional `label` prop.** `TemplateGroupDashboard`/`TemplateGroupFormModal`/`TemplateGroupAssignModal` each gain `label?: string` (default `"Template"`) to swap the handful of hardcoded strings. Zero changes needed at Template's existing call site. |

## 3. Grounding facts (verified 2026-08-06, via research agent)

- `Role` enum (`prisma/task-manager/schema.prisma`): `ADMIN, CEO, OPS,
  BRANCH, HOD, MEMBER, DEPT_SITE, BRANCH_SITE`. No `BRANCH_MANAGER` value —
  `BRANCH` **is** "Branch Manager."
- `employmentType` (a free-text `String?` on `User`) independently also
  says `"Manager"` for these accounts (set as a pair with `role: "BRANCH"`
  during HRFS import), but is only ever read for *recipient* classification
  (`FLOW_STAFF_ROLES`, `visibleCadenceOptions`, the "By Group" assign
  filter) — never for page/feature access control anywhere in this repo.
- `role-views.ts`'s `ViewRole` already has a `"BRANCH_MANAGER"` value,
  resolved purely from `user.role === "BRANCH"`. That module is explicitly
  documented as **UI-visibility only** ("the server still enforces what
  data a role may fetch") — not a security boundary by itself.
- The one existing live Branch-Manager-only feature, Manpower Schedule,
  enforces its gate entirely in the data layer: `getManpowerSchedule` sets
  `canEdit: actor.role === "BRANCH"` (reads are open to anyone on the
  branch); every mutation routes through `requireEditableSchedule`
  (`src/task-manager/manpower-helpers.ts`), which throws `ApiHttpError(403,
  ...)` if `actor.role !== "BRANCH"`. Its `page.tsx` has no role-based
  `redirect()` — the data layer is the only real gate. Package will instead
  gate at the page level (`redirect()` after an initial data fetch throws a
  403), matching the pattern already established for `/task-manager/template`
  (see the Template design doc, §"Out of scope"/page wiring), since Package
  is a standalone dedicated page, not a read-open/write-restricted grid.
- `requireAssigner` (`templates.ts`) — the check Template currently reuses
  — explicitly excludes `BRANCH`:
  ```ts
  const allowed =
    user.role === "ADMIN" || user.role === "OPS" || user.role === "CEO" ||
    user.role === "HOD" || isElevatedDeptSite(user);
  ```
  This is shared by the *old* single-task `TaskTemplate` CRUD functions too
  — editing it in place would silently widen access to that unrelated,
  already-shipped feature.

## 4. Data model

Add an enum and a field to the existing `TaskTemplateGroup` model:

```prisma
enum TemplateGroupScope {
  TEMPLATE
  PACKAGE
}

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

`@default(TEMPLATE)` makes this purely additive — every existing row (all
created before this feature existed) is a Template, exactly as it already
behaves today. No backfill needed.

`TaskTemplate` itself needs no new field — its existing `templateGroupId`
link is scope-agnostic; the scope lives on the group it points to.

Applied via the same hand-written-SQL migration pattern used for every
other Task Manager schema change in this project.

## 5. Data layer — `src/task-manager/data/template-groups.ts` (modified)

Every existing exported function gains a `scope: TemplateGroupScope`
parameter, threaded into its `where` clause (both when querying and when
writing) and into the internal authorization check:

| Function | Change |
|---|---|
| `listTemplateGroups(email, scope)` | Adds `scope` to the `where` clause. |
| `getTemplateGroup(email, groupId, scope)` | Adds `scope` to the ownership lookup — a Package id can never be loaded via a Template-scoped call, and vice versa (404, same as "not found"). |
| `createTemplateGroup(email, scope, input)` | Sets `scope` on the created group row. |
| `editTemplateGroup(email, groupId, scope, input)` | Verifies the group's `scope` before reconciling. |
| `getGroupDeletionImpact(email, groupId, scope)` | Same scope verification. |
| `deleteTemplateGroup(email, groupId, scope)` | Same scope verification. |
| `applyTemplateGroup(email, groupId, scope, input)` | Same scope verification. |

A new internal (not exported) `requireGroupAccess(email, scope)` replaces
every existing `requireAssigner(email)` call site in this file:

```ts
async function requireGroupAccess(email: string, scope: TemplateGroupScope) {
  const user = await requireUserByEmail(email);
  const allowed =
    scope === "PACKAGE"
      ? user.role === "BRANCH"
      : user.role === "ADMIN" || user.role === "OPS" || user.role === "CEO" ||
        user.role === "HOD" || user.role === "BRANCH" || isElevatedDeptSite(user);
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
```

This is the ONLY place Branch Manager gains Template access — `templates.ts`'s
`requireAssigner` (still used by the old single-task hub) is not touched.

No other behavioral change to this file — the reconciliation logic, the
cascade delegation to `templates.ts`'s `deleteTaskTemplate`/`editTaskTemplate`/
`getTemplateDeletionImpact`, and the `applyTemplateGroup` → `assignFlowTask`
fan-out all stay exactly as already built and reviewed.

## 6. UI

- **Three existing components gain one new optional prop each:**
  `label?: string` (default `"Template"`) on `TemplateGroupDashboard`,
  `TemplateGroupFormModal`, and `TemplateGroupAssignModal`, used to swap
  the handful of hardcoded "Template"/"template" strings (button text,
  empty-state copy, modal titles, validation messages, the Assign modal's
  "Creates all N tasks in this **template**..." line). Package's page
  passes `label="Package"`; Template's existing page passes nothing and is
  therefore unaffected.
- **`/task-manager/package`** replaces its placeholder with wiring that
  mirrors `/task-manager/template/page.tsx` closely: same six `"use
  server"` action closures (load/create/edit/impact/remove/apply), each
  calling the same `template-groups.ts` functions with `scope: "PACKAGE"`
  baked in; same `SetupPendingError`/`NoAccountError`/generic-error card
  branching; redirect to `/task-manager` for anyone who isn't a Branch
  Manager (a `FlowBridgeError` with `.status === 403`, exactly as Template's
  page already does for its own 403 case).

No new components — Create/Edit modal and Assign modal are the exact same
`TemplateGroupFormModal`/`TemplateGroupAssignModal`, just instantiated from
a different page with different action closures and `label="Package"`.

## 7. Out of scope

- No sidebar changes — the "Package" nav link stays visible to everyone
  (page-gate only, per the decisions log above). Hiding it would require
  new role-aware filtering in the shared `Sidebar.tsx`, used by every page.
- No changes to `/task-manager/package-table` (separate, unspecified
  placeholder).
- No changes to the old single-task `TaskTemplate` flow or `requireAssigner`.
- No archive/unarchive for either scope (unchanged from the Template
  design's own decision — Edit + Delete only).
- Branch-specific data scoping (e.g., "a Branch Manager only sees packages
  for their own branch") is **not** part of this design — Package groups
  are owned per-creator (`createdById`), exactly mirroring Template's
  existing personal-ownership model. If Package needs to be shared across
  all Branch Managers or scoped to a specific branch, that's a follow-up
  decision, not assumed here.
