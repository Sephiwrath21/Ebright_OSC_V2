# Leave HOD Approval + Notifications — Design

**Date:** 2026-06-13
**Status:** Approved (pending spec review)

## Summary

Let a Head of Department (HOD) approve or reject pending leave requests from their
own department, and notify HR when a request is approved. Both roles get a
notification-bell badge and a shared, role-aware approvals page. No database schema
change — the flow uses the existing `leave_request` columns (`status`, `approved_by`,
`approved_at`, `remarks`).

## Goals

- HOD can Approve or Reject pending leave requests from their own department.
- Reject requires a written reason (stored in `remarks`).
- HR is notified when a request is approved and can view approved requests (read-only).
- Notification badges for HOD (pending in dept) and HR (recently approved).
- No DB schema migration.

## Non-goals

- A second (HR) approval stage — HOD approval is the decision; HR only views/records.
- A persisted notification table — counts are derived live.
- Per-item "seen" tracking — badges are derived counts (see HR rolling-window note).
- Editing the employee submission flow or the existing personal leave page.

## Status lifecycle

```
pending ──HOD Approve──> approved        (approved_by/approved_at = the HOD)
   └──── HOD Reject ────> rejected        (remarks = required reason)
```

- `pending` — submitted, awaiting HOD (existing default).
- `approved` — HOD approved (terminal). HR is notified and can view it.
- `rejected` — HOD rejected (terminal). `remarks` holds the mandatory reason.
- `cancelled` — existing employee-side status, untouched.

No new status values beyond what already exists; no new columns.

## Roles & scoping

Session exposes `session.user.role` (= `role.role_type`). Department is NOT on the
session — it is looked up server-side from the user's active `employment.department_id`.

- **HOD**: `role === "hod"`. Department = the HOD's own active
  `employment.department_id`. Can act on `leave_request`s where `status = "pending"`
  AND the requester's active department equals the HOD's. The `hod` role row already
  exists in the `role` table.
- **HR**: `role === "hr"`, company-wide. Read-only view of `approved` requests.
- No superadmin override. Only `hod` and `hr` reach the approvals page.

Edge case: a request whose requester has no active employment / department is not
shown in any HOD queue (cannot be scoped). Acceptable; no action stranded because the
employee can still see their own pending request.

## Notifications (derived counts, no DB)

A single role-aware endpoint `GET /api/leave/approvals/count` returns `{ count }`:

- `hod` → number of `pending` requests in the HOD's department. Self-clears as the
  HOD approves/rejects (those leave the `pending` set).
- `hr` → number of requests approved in the last 7 days
  (`status = "approved"` AND `approved_at >= now - 7 days`). A rolling window keeps
  the badge meaningful without a "seen" flag (a plain total would grow forever).
- any other role / no session → `0`.

`NotificationBell` polls this every 60s (reusing its existing poll pattern) and shows
a dropdown card — "N leave request(s) awaiting your review" (HOD) /
"N leave request(s) recently approved" (HR) — with a **Review** link to
`/attendance/leave/approvals`. The existing superadmin registration card is preserved;
the bell badge sums all sources.

## The approvals page — `/attendance/leave/approvals` (role-aware)

Server component. Resolves `role`; redirects anyone who is not `hod`/`hr`.

- **HOD mode**: loads the department's `pending` requests (with requester name,
  department, type, dates, days, reason) and renders `LeaveApprovalsView` with
  `mode="hod"` — each row has **Approve** and **Reject** buttons. **Reject** expands a
  required-reason textarea (submit disabled until non-empty).
- **HR mode**: loads `approved` requests and renders `LeaveApprovalsView` with
  `mode="hr"` — read-only table (Employee · Dept · Type · Dates · Approved-by ·
  Approved-on). No action buttons.

## Server actions (`src/app/attendance/leave/actions.ts`)

Added alongside the existing `submitLeaveRequest`:

- `approveLeaveRequest(leaveId: number): Promise<{ ok: boolean; error?: string }>`
  - Resolve actor (session → user_id, role, active department).
  - Validate via `resolveHodAction`: actor role is `hod`, request is `pending`, and
    requester's active department matches the HOD's. Reject otherwise.
  - Set `status = "approved"`, `approved_by = actor`, `approved_at = now`,
    `updated_at = now`. `revalidatePath("/attendance/leave/approvals")`.
- `rejectLeaveRequest(leaveId: number, reason: string): Promise<{ ok: boolean; error?: string }>`
  - `validateRejectionReason(reason)` — trim, refuse if empty.
  - Same `resolveHodAction` validation.
  - Set `status = "rejected"`, `remarks = reason`, `approved_by = actor`,
    `approved_at = now`, `updated_at = now`. `revalidatePath(...)`.

## Pure logic (`src/app/attendance/leave/approval-logic.ts`)

Dependency-free, so it is trivially testable:

- `resolveHodAction({ actorRole, actorDepartmentId, requestStatus, requesterDepartmentId })`
  → `{ ok: true } | { ok: false; error }`. Rules: role must be `hod`; status must be
  `pending`; actor and requester departments must both be non-null and equal.
- `validateRejectionReason(reason)` → `{ ok: true; reason } | { ok: false; error }`.

## Queries (`src/app/attendance/leave/approval-queries.ts`)

- `getActiveDepartmentId(userId)` → number | null (active employment department).
- `loadHodPending(departmentId)` → rows for the HOD action list.
- `countHodPending(departmentId)` → number.
- `loadHrApproved()` → approved rows for the HR list.
- `countHrRecentApproved()` → number approved in the last 7 days.

## Files

| File | Status | Responsibility |
|---|---|---|
| `src/app/attendance/leave/approval-logic.ts` | new | pure validation (`resolveHodAction`, `validateRejectionReason`) |
| `src/app/attendance/leave/approval-queries.ts` | new | dept lookup + HOD/HR list & count queries |
| `src/app/attendance/leave/actions.ts` | modify | add `approveLeaveRequest`, `rejectLeaveRequest` |
| `src/app/api/leave/approvals/count/route.ts` | new | role-aware badge count |
| `src/app/attendance/leave/approvals/page.tsx` | new | role-aware server page; redirects non-hod/hr |
| `src/app/components/LeaveApprovalsView.tsx` | new | client view; `mode="hod"` (actions) / `mode="hr"` (read-only) |
| `src/app/components/NotificationBell.tsx` | modify | poll count endpoint; hod/hr alert cards |

## Verification

No DB migration, so no `prisma db push`. Verify with `npx tsc --noEmit`, `npx eslint`,
`npm run build`, and a manual check with a `hod` user, an `hr` user, and a staff user:

1. Staff submits → `pending`.
2. HOD of that dept: bell badge + approvals page lists it. Approve → `approved`, leaves
   HOD queue.
3. HOD from another dept does not see it.
4. Reject with empty reason → blocked; with a reason → `rejected`, `remarks` set.
5. HR: bell badge (within 7 days) + read-only approved list shows the approved request.
6. Staff / other roles: no badge, approvals page redirects away.

The approval-logic module is pure; Vitest is not re-introduced for this surface unless
requested (the reverted branch removed it).

## Notes / review flags

- Assigning the `hod`/`hr` role to specific users is an admin DB operation, out of code
  scope. The `hod` role row already exists.
- Prisma CLI gotcha in this environment: `npx prisma <cmd>` silently no-ops; use
  `node node_modules/prisma/build/index.js <cmd>`. (Not needed here — no schema change.)
