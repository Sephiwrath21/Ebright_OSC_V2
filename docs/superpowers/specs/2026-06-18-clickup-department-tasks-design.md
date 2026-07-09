# ClickUp Department Ongoing-Tasks — Design

**Date:** 2026-06-18
**Status:** Approved (design) — see **Revision 1** at the bottom for the owner-extraction pivot after inspecting live data.

## Goal

Show ongoing (open) ClickUp tasks on the dashboard, scoped by the viewer's role.
Tasks are grouped by department, then by the individual they're assigned to —
each task "follows" the person it's assigned to. Regular staff see only their own
tasks; an HOD or department-level account sees every individual in their
department.

## Scope & Decisions

- **What:** Display ongoing tasks, read-only. No create/update/sync.
- **Department mapping:** A task belongs to a department via its *assignee* — we
  map the ClickUp assignee (by email) to our app user, and the user's department
  comes from their active `employment.department_id`.
- **Grouping:** department → individual → tasks. The viewer's own tasks sort
  first; tasks sort by due date.
- **Auth:** A single workspace ClickUp API token (server-side). No per-user
  OAuth, no token table.
- **Placement:** A compact, role-aware widget on `/home` **and** a full
  dedicated `/tasks` page.

### Access model (viewer scope)

- **Staff / regular / oversight (superadmin, admin, HR):** own tasks only.
- **HOD (`position === "FT HOD"`):** own tasks + all individuals in their
  department (own tasks shown first).
- **`department` role:** their own department's tasks, grouped by individual.
- No company-wide / all-departments view for anyone (explicitly out of scope).

### Non-goals (YAGNI)

- No two-way editing, no DB sync, no per-user OAuth, no token storage table.
- No all-departments oversight board.
- No cross-department views; department accounts stay within their own department.

## Architecture (Approach A — single-token server fetch, role-scoped)

The token never reaches the browser. The client (widget + page) calls our own
`GET /api/clickup/tasks`, which scopes by session and returns grouped JSON.

### 1. Config (no DB changes)

New env vars:

- `CLICKUP_API_TOKEN` — a ClickUp workspace personal API token.
- `CLICKUP_TEAM_ID` — the ClickUp team/workspace id to query.

### 2. Access resolver — `src/lib/clickup-access.ts` (pure, unit-tested)

```
resolveTaskScope({ role, position, email, departmentId }) ->
  | { kind: "own" }
  | { kind: "department", departmentId }
```

- `position === HOD_POSITION` ("FT HOD") with a department → `department`.
- `role === "department"` with a department → `department`.
- Everyone else (incl. oversight) → `own`.
- Department-scoped viewer with no `departmentId` → falls back to `own`.
- Mirrors the existing `resolveLeaveRecordsAccess` pattern in
  `src/app/attendance/leave/approval-logic.ts`.

### 3. ClickUp client — `src/lib/clickup.ts`

Pure (unit-tested): `mapTask`, `sortByDueDate`, grouping helper.
Fetch helpers (manual verification), all using header `Authorization: <token>`:

- `getWorkspaceMembers(teamId)` → `[{ id, email }]` (from `GET /team`, members),
  used to build an email → ClickUp-user-id map.
- `getOpenTasksByAssignees(teamId, clickupUserIds[])` →
  `GET /team/{teamId}/task?assignees[]=…&include_closed=false&subtasks=true&order_by=due_date`,
  mapped to the trimmed view shape.
- `mapTask(raw)` → `{ id, name, status, statusColor, dueDate, priority,
  listName, url, assigneeEmails: string[] }`.

### 4. Data assembly — `GET /api/clickup/tasks`

1. Load the viewer from DB by session email: role, position, and active
   `employment.department_id`.
2. `resolveTaskScope(...)`. If env vars missing → `500 { error: "ClickUp not
   configured" }`.
3. Determine target app users:
   - `own` → just the viewer.
   - `department` → all users with an active employment in that department,
     including their display name (`user_profile.full_name`) and email.
4. Build email → ClickUp-id map from workspace members; collect the ClickUp ids
   for the target users (those with a matching ClickUp email are "linked").
5. Fetch open tasks for those assignee ids.
6. Group into:
   ```
   {
     scope: "own" | "department",
     viewerEmail: string,
     departments: [
       {
         departmentName: string,
         individuals: [
           { name, email, linked: boolean, tasks: ClickUpTaskView[] }
         ]
       }
     ]
   }
   ```
   Viewer's own entry sorts first; each individual's tasks sorted by due date.
   Unlinked individuals (no ClickUp email match) appear with `linked: false`
   and an empty task list.

### 5. UI

- **`OngoingTasksWidget`** (client) on `/home`:
  - `own` scope → compact "My Tasks" list (name, status pill, due date, link).
  - `department` scope → viewer's own tasks + a summary line ("N open tasks
    across M people in <Dept>") linking to `/tasks`.
- **`/tasks` page** (client): full breakdown — department section, each
  individual with their ongoing tasks beneath them, external links to ClickUp.

### 6. Error & edge handling

- Missing env token/team → "ClickUp not configured" state in widget & page.
- ClickUp non-200 → inline error + retry.
- App user with no matching ClickUp email → shown as "not linked", no tasks.
- Department-scoped viewer with no department → falls back to own tasks.
- "Ongoing" = open tasks (`include_closed=false`).

### 7. Testing

- Vitest unit tests: `resolveTaskScope` (all role/position/department branches),
  `mapTask` (null due date/priority/list, assignee emails), grouping/sort
  (viewer-first, due-date order, unlinked handling).
- Manual end-to-end against the real workspace token + team id.

## Prerequisites (user-owned)

1. A ClickUp workspace API token (`CLICKUP_API_TOKEN`) and the team/workspace id
   (`CLICKUP_TEAM_ID`).
2. App users' emails should match their ClickUp account emails for linking.

## File Plan (anticipated)

- `src/lib/clickup-access.ts` — `resolveTaskScope` + types (Create).
- `src/lib/clickup-access.test.ts` — unit tests (Create).
- `src/lib/clickup.ts` — ClickUp client, `mapTask`, `sortByDueDate`, grouping
  (Create).
- `src/lib/clickup.test.ts` — unit tests for pure helpers (Create).
- `vitest.config.ts` — minimal Vitest config (Create).
- `src/app/api/clickup/tasks/route.ts` — scoped, grouped task data (Create).
- `src/app/components/OngoingTasksWidget.tsx` — home widget (Create).
- `src/app/tasks/page.tsx` — full breakdown page (Create).
- `src/app/home/page.tsx` — mount the widget (Modify).
- `.env` / `.env.example` — `CLICKUP_API_TOKEN`, `CLICKUP_TEAM_ID` (Modify;
  values user-owned).

---

## Revision 1 (2026-06-18): owner extracted from folder name

Live inspection of the `Ebright ClickUp` workspace (team `3631897`) invalidated the
email-assignee model:

- Nearly all open tasks sit under one shared account (`sales@ebright.my`); app
  employee emails do not match ClickUp member emails.
- The "PIC" custom field is set on only ~3% of tasks; "Assigned To" holds junk
  options. Neither is a usable owner source.
- The real owner is encoded in the **folder name**, in parentheses or after
  `Intern - `: e.g. `Database and HRMS (Rahman)`, `RM 3 (Manjeet)`,
  `3.6.9 Intern - Yee Qian`. ~92% of tasks yield an owner this way.

### Revised model

1. **Fetch** all open workspace tasks (no assignee filter). Pagination remains
   OFF for now (per decision) — only the first 100 tasks are scanned; this is a
   known limitation to revisit, loudly noted in code.
2. **Extract owner** from each task's folder name: text in the last `(...)`, else
   the name after `Intern - `, else `null`.
3. **Match** the extracted nickname to an app employee via normalized comparison
   against `user_profile.nick_name` / `full_name` (exact, then whole-word). This
   yields the owner's `user_id` + `department_id`. Ambiguous first-name collisions
   resolve to the first match (v1 limitation, noted).
4. **Scope & group:**
   - `own`: the viewer sees tasks whose matched employee is themselves.
   - `department`: tasks whose matched employee is in the viewer's department,
     grouped by individual.
   - **`other` bucket** (department scope only, shown on the `/tasks` page):
     tasks whose owner matched NO employee (interns, unknowns), grouped by the
     raw ClickUp nickname. Provides visibility without false attribution.

### Revised payload

```
{ configured: false }
| { configured: true,
    scope: "own" | "department",
    viewerUserId: number,
    departmentName: string,
    individuals: [{ userId: number, name: string, tasks: TaskView[] }],
    other: [{ ownerName: string, tasks: TaskView[] }] }   // [] in own scope
```

`TaskView = { id, name, status, statusColor, dueDate, priority, listName,
folderName, ownerName, url }`.

### Revised file responsibilities

- `src/lib/clickup.ts` — replace email helpers with: `mapTask` (now carries
  `folderName` + extracted `ownerName`), `extractOwner`, `normalizeName`,
  `matchOwnerToRoster`, `sortByDueDate`. `getOpenTasks(teamId, token)` replaces
  the assignee-filtered fetch.
- `src/lib/clickup-queries.ts` — add `getEmployeeRoster()` (all active employees:
  `user_id`, `full_name`, `nick_name`, `department_id`) and keep
  `getDepartmentName`. `getDepartmentMembers` is no longer used by the route.
- `src/app/api/clickup/tasks/route.ts` — fetch all tasks, extract+match owners
  against the roster, group by scope, build the `other` bucket.
- `OngoingTasksWidget` / `/tasks` page — consume the revised payload; the page
  renders the `other` bucket.
