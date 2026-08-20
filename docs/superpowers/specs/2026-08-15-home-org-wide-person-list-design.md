# Home — Org-Wide Task Manager Section as Collapsible Per-Person Lists

## Goal

Replace Home's org-wide Task Manager section (currently empty, after the
2026-08-15 donut-grid removal) with collapsible department/branch sections
that expand into the same per-person task list (`EntityCardOverview`,
"Sort: Person") already used on `/task-manager`'s own dropdown-driven
overview — instead of a separate, lighter donut/stats grid.

## Scope

- **Accounts affected:** ADMIN, OPS, elevated `DEPT_SITE` (Operations,
  Optimisation), and CEO — the org-wide roles. Individual accounts
  (MEMBER/HOD/Branch Manager/BRANCH_SITE) are untouched; they keep their
  existing simple stat card (`StatusOverviewCard`, no donut, added
  2026-08-15) for their own Daily/Monthly tasks.
- **Sections rebuilt:**
  - "All Departments — Daily" / "— Monthly": one collapsible section per
    department (the 6 `FLOW_DEPARTMENTS`).
  - "Branch Status by Region — Daily" / "— Monthly (Manager)": grouped
    under Region A/B/C headers as before; one collapsible section per
    branch within each region.
  - "Ad hoc Tasks by Region (Manager)": stays a **plain, non-expandable**
    rollup card per branch (name + %, dot+count row) — no per-person list.
    `getBranchDetail`/`getDepartmentDetail` return full per-person detail
    for Daily/Monthly (already used by `/task-manager`'s entity-dropdown
    view); no equivalent function exists for ad hoc, and building one is
    out of scope here. Ad hoc keeps its current rollup-only shape, just
    without a donut (matching the 2026-08-15 all-departments text-stats
    treatment) instead of gaining an expand affordance that would reveal
    nothing new.

## Architecture

Every existing control on this page (date filters, entity-dropdown
selection) is URL-param-driven: a link changes the URL, the server
component re-renders and fetches accordingly. Expand/collapse follows the
same pattern — no new client-side fetch component, no new server action.

A new `?expand=` search param on `/home` holds a comma-separated list of
prefixed identifiers, e.g. `dept:Operations,branch:Klang` (prefixed to
disambiguate a department and a branch that might share a name). Clicking
a collapsed section's header is a link that appends its identifier to the
list; clicking an expanded section's header is a link that removes it.
Both preserve every other current search param (date filters, other
expanded sections) using the same `carry()`-style helper already used for
the date pickers in this file.

For each department/branch name present in `?expand=`, the server calls
`getDepartmentDetail`/`getBranchDetail` for that one name (Daily and
Monthly, same as the rollup queries already run) and renders the result
through `EntityCardOverview` — identical component, props, and behavior
(Sort: Person/Type toggle, task actions, "Only Me" toggle) as
`/task-manager`'s own entity-dropdown view. Department/branch names NOT in
`?expand=` render the lightweight rollup card only (no detail fetch) —
same shape as the deleted `MiniStatsBlock`: name (linking to
`/task-manager?view=department&department=...` as before), completion %,
dot+count row, click-to-drill modal — plus a chevron affordance that is
the expand link described above.

This means expanding N sections costs N extra `getDepartmentDetail`/
`getBranchDetail` calls per page render, on top of the existing org rollup
query — bounded by how many sections a user actually has open, not by the
total department/branch count.

## Components

- **`src/task-manager/ui/home-overview.tsx`** (recreated): orchestrates
  the department stack and the region-grouped branch stack, replacing the
  donut/stats grids it held before deletion. Takes the org rollup payload
  (as before), the set of expanded names, the per-expanded-name detail
  payloads already fetched by the caller, `categories`, and the viewer's
  own `myUserId` — passes these straight into either the rollup card or
  `EntityCardOverview` per section.
- **`src/task-manager/ui/overview-grids.tsx`** (recreated): the rollup
  card component (`MiniStatsBlock`-equivalent) plus the expand/collapse
  link helper, shared between the department stack and the branch stack.
  Pure presentational + link-building — no data fetching of its own.
- **`src/app/home/scoped-overview-section.tsx`**: the `orgGrids` branch
  (currently `return null`) is restored to call the rebuilt
  `HomeTaskOverview`, now also fetching per-expanded-name detail
  (`Promise.all` over the parsed `?expand=` list) and the shared
  `categories` list (same fetch `/task-manager`'s page already does).
  CEO's `branchRegionOverview` block is similarly restored, reusing the
  same branch-stack component as the ADMIN/OPS path (both show identical
  Region A/B/C branch sections).
- **`src/app/home/page.tsx`**: `searchParams` gains `expand`, threaded
  through to `HomeScopedOverviewSection` alongside the existing date
  params.
- **`src/task-manager/role-views.ts`**: `orgGrids`'s doc comment (added
  2026-08-15, "renders nothing on Home") is reverted — it once again gates
  real content. `branchRegionOverview` is restored to CEO's `home` array
  and its "no longer used" doc comment is reverted.

## Data flow

1. Server component resolves `daily.org`/`monthly.org` (existing org
   rollup query, unchanged) and parses `?expand=` into two sets: expanded
   department names, expanded branch names.
2. `Promise.all` fetches `getDepartmentDetail`/`getBranchDetail` (Daily
   and Monthly) for every name in the respective expanded set, plus the
   shared `categories` list once for the page.
3. `HomeTaskOverview` renders the department stack: for each of the 6
   `FLOW_DEPARTMENTS`, either the rollup card (not expanded) or
   `EntityCardOverview` fed the matching fetched detail (expanded).
4. Same for the branch stack, grouped under each region's heading, using
   `daily.org.regions`/`monthly.org.regionsByRole` for both the rollup
   names/counts and the region grouping, same as before deletion.
5. Ad hoc renders unchanged from its current (already-implemented,
   donut-free) 2026-08-15 shape — no new expand behavior.
6. The shared Daily/Monthly date pickers stay exactly as before, driving
   `?date=`/`?mdate=`/`?mrange=`, which both the rollup queries and any
   expanded detail queries read from — changing the date re-fetches
   whatever is currently expanded at the new date, same as it re-fetches
   the rollups today.

## Error handling & testing

- If `getDepartmentDetail`/`getBranchDetail` throws for one expanded name
  (e.g. a race with a department being renamed), that one section falls
  back to just the rollup card instead of taking down the whole page —
  same `.catch(() => null)` pattern already used for the MEMBER
  own-department/branch fetches in `/task-manager`'s page.
- New tests: parsing `?expand=` into department/branch name sets
  (round-trip encode/decode, prefix disambiguation), and the toggle-link
  builder (add/remove one name, preserve every other param). No new tests
  needed for `EntityCardOverview`, `getDepartmentDetail`, or
  `getBranchDetail` — all three are exercised by existing coverage; this
  feature is a new caller, not new behavior in any of them.
