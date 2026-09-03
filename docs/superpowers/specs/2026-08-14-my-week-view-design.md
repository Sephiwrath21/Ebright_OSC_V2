# My Week View Design

## Goal

A new, standalone Task Manager page showing the signed-in user's own tasks for the current week, one weekday at a time via tabs, with bulk-select and bulk "Mark Completed" — a weekly-at-a-glance alternative to the existing single-day Daily section's date-arrow picker.

## Architecture

The page is thin. Almost everything it needs already exists:

- **Weekday range**: `weekdayRangeOf(view)` (`role-views.ts`) already tells us which weekdays apply to the signed-in user's role (e.g. Coach/Branch Exec get Wed–Sun; others differ). The new page reuses this directly — no new range logic.
- **Per-day task data**: `getFlowDetail(email, "daily", date)` (`src/task-manager/data/queries.ts`) is the exact function that already powers the existing Daily section's date-arrow picker. The new page calls it once per weekday in the role's range, with that weekday's actual date this week (not "today" — each tab is a real calendar date), instead of once for whatever single date the arrows currently point at.
- **The task table itself**: `ResizableTaskList` (`bits.tsx`), reused completely unchanged. It already has row checkboxes (`hideCompleted` mode), a header "Select All" checkbox, and a "(N) ▾" `BulkActionsButton` wired to whatever `onComplete`/`onSkip` handlers it's given — "Mark Completed" already exists as a bulk action on this exact mechanism today (see `src/task-manager/ui/task-manager-view.tsx`'s existing "My Tasks — Ad hoc" section for the live precedent). The new page's ONLY table-related work is rendering one `ResizableTaskList` instance per selected weekday tab, passing that day's fetched tasks.

## Data flow

1. Server component (new page) resolves the signed-in user, their `ViewRole`, and `weekdayRangeOf(view)`.
2. Computes this week's actual calendar date for each weekday in that range (Monday-anchored week, matching how the existing single-day picker already defines "today"/"this week" — confirm the exact anchor logic during planning, reusing whatever the current Daily picker uses rather than inventing new week-boundary rules).
3. Fetches `getFlowDetail(email, "daily", date)` once per date in the range, in parallel (`Promise.all`), same pattern the page already uses elsewhere for multi-entity fetches.
4. Passes the per-weekday task lists + counts to a new client component that renders the weekday-tab sidebar and, for whichever tab is selected, one `ResizableTaskList`.

## Components

- **New page**: `src/app/task-manager/my-week/page.tsx` (exact route name confirmed with the user as roughly this shape; adjust to match this app's existing task-manager route conventions during planning). Server component — auth, role resolution, data fetching, same shape as the existing `/task-manager` page.tsx's own patterns (error-card mapping for `SetupPendingError`/`NoAccountError`, etc. — reuse those, don't reinvent).
- **New client component**: e.g. `src/task-manager/ui/my-week-view.tsx`. Renders:
  - Left sidebar: one tab per weekday in range, label + count (count = that day's pending task count, since Select-All/checkboxes only apply to pending tasks — matches the confirmed "pending only" checkbox scope), selected day highlighted (matches the screenshot's blue highlight).
  - Right side: `<ResizableTaskList tasks={selectedDay.flatTasks} ... hideCompleted emptyLabel="..." />` — this is where the checkboxes/Select-All/bulk-complete already come from, unmodified.
- Selection state lives entirely inside `ResizableTaskList`'s own internal `selectedIds` state (already how it works today) — switching tabs unmounts/remounts a fresh instance (keyed by the selected date), so per-tab-independent selection (confirmed requirement) falls out naturally with no new state-management code needed, as long as the client component keys `ResizableTaskList` by date (e.g. `key={selectedDate}`).

## Scope confirmed with the user

- **Role scope**: every role that currently has a personal Daily list (HOD, Branch Manager, DEPT_MEMBER, BRANCH_MEMBER, Coach, etc.) — each sees their own role's weekday range.
- **Bulk action**: "Mark Completed" (already exists on `ResizableTaskList`; "Mark N/A" also comes along for free via the same mechanism unless explicitly suppressed — confirm with the user during planning whether to keep, hide, or make it available too, since only "Mark Completed" was explicitly requested).
- **Checkbox scope**: pending tasks only (already-Complete rows get no checkbox — this is `ResizableTaskList`'s existing behavior in `hideCompleted` mode, not new work).
- **Selection persistence**: cleared when switching weekday tabs (falls out of the component-remount design above).
- **Week navigation**: current week only, no prev/next-week controls.

## Testing

- Reuses `ResizableTaskList` and `getFlowDetail` completely unmodified — their existing test coverage stays valid; no new tests needed for the checkbox/bulk-complete mechanism itself.
- New coverage needed: the weekday-range-to-this-week's-dates computation (pure function, easy to unit test — e.g. "given role X's range and a known 'today', returns the correct 5 date strings"), and the weekday-tab client component's tab-switching/remount behavior.

## Open items for the planning phase

- Exact route path and page title text.
- Exact week-boundary/anchor rule (which day starts "this week" — reuse whatever the existing Daily picker already assumes, don't invent a new one).
- Whether "Mark N/A" (which comes along for free with "Mark Completed" on the same `ResizableTaskList` mechanism) should be included, hidden, or left as-is.
- Exact field name on `FlowDetailResponse` for the personal flat task list (confirmed precedent: `personalAdhoc.flatTasks` for the Ad hoc case — verify the equivalent field for the daily-period response).
