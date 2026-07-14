# Leave Records Views — Design

**Date:** 2026-06-13
**Status:** Approved (pending spec review)

## Summary

Add a read-only "leave records" page that lets oversight accounts see leave requests
they're entitled to: `hr@ebright.my` sees every request company-wide, `od@ebright.my`
(superadmin) and other `department`-role users see only their own department's
requests. No approval actions, no DB schema change — reuses existing `leave_request`
columns. Extends the HOD approval / notification work already on this branch
(`feat/leave-hod-approvals`).

## Goals

- A single read-only page showing leave requests scoped to the viewer.
- `hr@ebright.my` → all requests, company-wide.
- `od@ebright.my` (superadmin) → the Optimisation department's requests only.
- Other `department`-role users (e.g. `finance@ebright.my`) → their own department.
- Show all statuses (pending / approved / rejected / cancelled).
- A gated entry-point link from the leave page.

## Non-goals

- No approve/reject actions on this page (read-only).
- No notification badge for this view.
- No DB schema change; no change to employee submission or the existing HOD/HR flow.
- Does not touch the dormant `role = "hr"` approved-list view built earlier.

## Access rules

Identification is pure and lives in `approval-logic.ts`. Email special-casing matches
the existing pattern for `finance@ebright.my` in `src/app/claim/roles.ts`.

Constants:
- `HR_OVERVIEW_EMAIL = "hr@ebright.my"`
- `SUPERADMIN_EMAIL = "od@ebright.my"`
- `OPTIMISATION_DEPARTMENT_NAME = "Optimisation"`

```ts
type LeaveRecordsAccess =
  | { kind: "all" }            // company-wide
  | { kind: "optimisation" }   // od@ebright.my -> Optimisation department
  | { kind: "own-department" } // department-role users -> their own department
  | { kind: "none" };          // no access

resolveLeaveRecordsAccess({ role, email }):
  email === HR_OVERVIEW_EMAIL      -> { kind: "all" }
  email === SUPERADMIN_EMAIL       -> { kind: "optimisation" }
  role  === "department"           -> { kind: "own-department" }
  otherwise                        -> { kind: "none" }
```

Notes:
- `od@ebright.my` is checked by email before the role branch because the superadmin has
  no `employment`/`department_id` to derive a department from; it is hard-mapped to the
  department named "Optimisation".
- `hr@ebright.my` is itself a `department`-role user, so its email check must come before
  the `role === "department"` branch (otherwise it would be scoped to its own dept).

## Page — `/attendance/leave/records` (read-only, role-aware)

`src/app/attendance/leave/records/page.tsx` (server component, `force-dynamic`):

1. Require a session; resolve `role` and `email`.
2. `access = resolveLeaveRecordsAccess({ role, email })`. If `kind === "none"` →
   `redirect("/home")`.
3. Resolve the row set:
   - `all` → `loadAllLeaveRecords()`.
   - `optimisation` → `deptId = getDepartmentIdByName(OPTIMISATION_DEPARTMENT_NAME)`;
     `deptId != null ? loadDepartmentLeaveRecords(deptId) : []`.
   - `own-department` → look up the user's `user_id`, then
     `deptId = getActiveDepartmentId(user_id)`;
     `deptId != null ? loadDepartmentLeaveRecords(deptId) : []`.
4. Render `LeaveRecordsView` with the rows and a `scopeLabel`
   (`"All Leave Requests"` for `all`, otherwise `"<Department> Leave Requests"` or a
   generic `"Department Leave Requests"` when the name is unknown).

## Queries (`approval-queries.ts`)

```ts
interface LeaveRecordRow {
  leaveId: number;
  displayId: string;          // LV-00x
  requesterName: string;
  departmentName: string | null;
  leaveTypeName: string;
  startDate: string;          // YYYY-MM-DD
  endDate: string;            // YYYY-MM-DD
  totalDays: number;
  status: string;
  appliedAt: string;          // ISO
}

getDepartmentIdByName(name: string): Promise<number | null>;
loadAllLeaveRecords(): Promise<LeaveRecordRow[]>;            // all statuses, newest first
loadDepartmentLeaveRecords(departmentId: number): Promise<LeaveRecordRow[]>;
```

- Both loaders order by `applied_at desc`, include `leave_types.name`, the requester's
  `user_profile.full_name`, and the requester's active-employment `department.department_name`.
- `loadDepartmentLeaveRecords` scopes via the requester having an active employment with
  the given `department_id` (same scoping shape as `loadHodPending`, minus the
  `status = pending` filter).
- `getActiveDepartmentId` already exists and is reused.

## View (`LeaveRecordsView.tsx`)

Client (or server) component, read-only:
- Breadcrumb + header showing `scopeLabel` and a record count.
- A table: ID · Employee · Department · Type · Dates · Days · Status · Applied.
- Status rendered as a small colored pill (pending/approved/rejected/cancelled). No
  action buttons.
- Empty state when there are no records.

## Entry-point link

`src/app/attendance/leave/page.tsx` computes `canViewRecords` =
`resolveLeaveRecordsAccess({ role, email }).kind !== "none"` and passes it to
`LeaveRequestsView`. `LeaveRequestsView` renders a "Leave Records" link to
`/attendance/leave/records` in the page header (next to "Apply for Leave"), shown only
when `canViewRecords` is true.

## Files

| File | Status | Responsibility |
|---|---|---|
| `src/app/attendance/leave/approval-logic.ts` | modify | add email/dept-name constants + `resolveLeaveRecordsAccess` |
| `src/app/attendance/leave/approval-queries.ts` | modify | add `LeaveRecordRow`, `getDepartmentIdByName`, `loadAllLeaveRecords`, `loadDepartmentLeaveRecords` |
| `src/app/attendance/leave/records/page.tsx` | new | role-aware gate + load + render |
| `src/app/components/LeaveRecordsView.tsx` | new | read-only records table |
| `src/app/components/LeaveRequestsView.tsx` | modify | gated "Leave Records" header link |
| `src/app/attendance/leave/page.tsx` | modify | compute + pass `canViewRecords` |

## Verification

No DB migration. `npx tsc --noEmit`, `npx eslint <files>`, `npm run build`, then a
manual check:
1. `od@ebright.my` → `/attendance/leave/records` shows only Optimisation members' leave
   (e.g. the test intern), all statuses.
2. `hr@ebright.my` → shows every leave request company-wide.
3. `finance@ebright.my` → shows only Finance department's leave.
4. A normal staff user → `/attendance/leave/records` redirects to `/home`, and no
   "Leave Records" link appears on their leave page.

## Notes / review flags

- DB department name is `"Optimisation"` (verified), while `roles.ts` has
  `SUPERADMIN_DEPARTMENT_NAME = "Optimisation Department"` — the lookup uses the actual
  DB name `"Optimisation"`.
- Assigning the relevant roles/emails is existing data; no provisioning needed.
- Prisma CLI gotcha (this env): `npx prisma <cmd>` no-ops; use
  `node node_modules/prisma/build/index.js <cmd>`. Not needed here (no schema change).
