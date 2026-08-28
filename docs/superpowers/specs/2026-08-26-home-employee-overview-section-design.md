# Home dashboard — Employee Overview section (stage cards + Not Clicked Task + Employee Records)

## Summary

Add a new section to `/home` (the per-account landing page) showing, for department/branch-scoped and full-access viewers only:

1. The existing 5 stage-count cards (Pre/Probation/Onboarding/Active/Exit), reused as the literal same component/logic already on `/employee-folder` — not a copy.
2. A "Not Clicked Task" preview card (3 people) — Task Manager pending/overdue counts, scoped to the viewer's own department/branch (or all, for full-access viewers). "View all" opens a modal with the full month-navigable, department/branch-grouped list.
3. An "Employee Records" preview card (3 people) — first 3 rows of the viewer's already-scoped employee list. "View all" opens a modal with the full existing search/filter/sortable table.

The section is inserted once in `/home/page.tsx`, above whichever of the 9 existing per-role dashboard components renders below it. No new routes. No changes to the 9 dashboard components. `/employee-folder` is untouched in behavior — two of its internals are extracted into standalone, reusable pieces.

## Access scope

Reuses `getCurrentEmployeeScope()` (`src/lib/employeeScope.ts`) exclusively — no new/duplicate permission logic, no hardcoded CEO/Finance special-casing.

- `ownUserId` scope (plain "staff" logins) → the entire new section is hidden. Confirmed decision — a self-only view of company-wide stage counts isn't useful.
- `departmentCode`/`branchCode` scope → 5 cards, Not Clicked Task, and Employee Records all show only that department/branch's data.
- `fullAccess: true` → all three show company-wide data, exactly like today's `/employee-folder` behavior for full-access viewers.

## Component changes

### `EmployeeStageCards.tsx` (new, extracted)
The existing 5-card JSX block currently inline in `EmployeeOverviewView.tsx` (lines ~164–191), lifted verbatim into its own component: `{ counts, probationReminderNames }` in, same `EMPLOYEE_STAGES`/`STAGE_LABELS`/`STAGE_PILL_CLASSES`/`OverdueDot` rendering out. `EmployeeOverviewView.tsx` renders this component instead of its old inline block — zero visual/behavioral change on `/employee-folder`. The new `/home` section renders the same component with its own scoped `counts`.

### `EmployeeRecordsTable.tsx` (new, extracted)
The existing search/filter/pagination/table portion of `EmployeeOverviewView.tsx` (everything from the `employees-list-heading` section onward), lifted into its own component taking the same `rows`/`overdueTaskCounts`/`probationReminderNames` props it already closes over, plus two new optional props:
- `lockedBranch?: string`
- `lockedDepartment?: string`

When set, the corresponding advanced-filter dropdown is pre-filled and disabled (not removed — the user can still see which scope they're locked to). `EmployeeOverviewView.tsx` renders this with both props omitted (unchanged behavior). The new "Employee Records" modal renders it with whichever is appropriate for the viewer's scope (both omitted for full-access viewers).

### `NoClaimIncentiveModal.tsx` (new, extracted) + `NoClaimIncentiveMenu.tsx` (trimmed)
The existing modal JSX/state (month nav, department/branch groups, loading/error/empty states) moves into a presentational `NoClaimIncentiveModal` taking `{ open, onClose, fetchList }`. `NoClaimIncentiveMenu` becomes a thin wrapper: renders the ⋮ trigger button, owns its own `open` state, renders `NoClaimIncentiveModal` with its existing `fetchList` prop unchanged. Existing Task Manager page behavior is unaffected.

The new "Not Clicked Task" card's "View all" button renders the same `NoClaimIncentiveModal`, with a **different** `fetchList` implementation (see below) — not the CEO/Finance-gated one.

### `EmployeeOverviewSection.tsx` (new)
The new `/home` section itself: renders `EmployeeStageCards`, the two new preview cards, and owns the open/closed state for both modals. Pure props in (scope-resolved data), no data fetching of its own — matches the prop-driven pattern already used by `EmployeeOverviewView.tsx`/`EmployeeRecordsTable.tsx`.

### `src/app/home/page.tsx`
After resolving `session`, additionally resolve `const scope = await getCurrentEmployeeScope();`. When `scope` is non-null and not `ownUserId`-scoped, fetch:
- `listEmployeeOverviewRows()` + `countEmployeeStages(rows)` (same helpers `/employee-folder/page.tsx` already uses) for the 5 cards + Employee Records preview (first 3 rows, same default ordering as the full table).
- A new server action wrapping `getNoClaimIncentivePayload(currentMonthAnchor())`, filtered by scope (see below), for the Not Clicked Task preview + the modal's `fetchList`.

Render `<EmployeeOverviewSection ... />` inside `<AppShell>`, above the existing per-role conditional. No changes to the conditional itself or any of the 9 dashboard components.

## "Not Clicked Task" data path

New function, e.g. `getScopedNoClaimIncentiveList(scope, month)`, alongside the existing `getNoClaimIncentiveList` in `src/task-manager/data/queries.ts` (that existing CEO/Finance-gated function and its call site are untouched):

1. Call `getNoClaimIncentivePayload(month)` directly — same underlying data (`RunBlock` pending/overdue, `run.status !== "CANCELLED"` already applied inside `fetchPeriodBlocks`).
2. If `scope.fullAccess` → return all `{ departments, branches }` groups unchanged.
3. Otherwise, resolve the viewer's HR `departmentCode`/`branchCode` to the Task Manager group name via an explicit reconciliation map (below), and return only that one matching group (empty result if no match — e.g. the unmapped `"Puncak Jalil"` TM branch, or a department/branch with zero open tasks).

### Name reconciliation map

Verified exhaustively against live data (all 8 HR departments × all 6 TM department values; all 22 HR branches × all 22 TM branch values) — read-only queries, no schema/data changes:

```ts
const DEPARTMENT_NAME_TO_TASK_MANAGER: Record<string, string> = {
  "Operation": "Operations", // hrfs.department.department_name vs Task Manager's own User.department
};

const BRANCH_NAME_TO_TASK_MANAGER: Record<string, string> = {
  "Rimbayu": "Bandar Rimbayu",
  "Kajang TTDI Grove": "Kajang TTDI Groove",
};
```

Every other department/branch name matches exactly between the two systems today. `"Puncak Jalil"` exists as a Task Manager branch value with no corresponding HR branch at all — left unmapped. This can only affect full-access viewers (who see every group regardless of name); no branch-scoped viewer's own scope could ever resolve to it, so this is a data-hygiene note for the Task Manager side, not a scoping bug — flagged separately, not fixed here (no DB writes).

## Employee Records preview + modal

Preview: first 3 of the already-scoped `listEmployeeOverviewRows()` result, same default ordering as the full table today (no new sort).

Modal: renders `EmployeeRecordsTable` with the same scoped `rows`, plus `lockedBranch`/`lockedDepartment` set from `scope.branchCode`/`scope.departmentCode` when not full-access (both omitted for full-access viewers, matching `/employee-folder`'s own unrestricted behavior).

## Explicitly out of scope

- No changes to `/employee-folder`'s behavior, styling, or URL.
- No changes to any of the 9 per-role dashboard components.
- No changes to the existing CEO/Finance-gated `NoClaimIncentiveMenu` Task Manager feature.
- No database writes of any kind (read-only investigation confirmed the name mismatches; fixing the underlying Task Manager `"Puncak Jalil"` data, if it needs fixing, is a separate follow-up).
