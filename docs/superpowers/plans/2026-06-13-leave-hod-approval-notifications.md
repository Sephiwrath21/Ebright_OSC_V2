# Leave HOD Approval + HR Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a HOD approve/reject pending leave requests from their own department and notify HR (badge + read-only list) when a request is approved — with no database schema change.

**Architecture:** Pure validation logic in a dependency-free module; Prisma query helpers; two server actions that reuse the existing `leave_request` columns (`status`, `approved_by`, `approved_at`, `remarks`); a role-aware count API for the notification bell; a single role-aware `/attendance/leave/approvals` page rendering a client view in `hod` (action) or `hr` (read-only) mode.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 7 + `@prisma/adapter-pg`, NextAuth (JWT), React client components, Tailwind, lucide-react.

**Reference spec:** `docs/superpowers/specs/2026-06-13-leave-hod-approval-notifications-design.md`

**Key facts about this codebase (verified):**
- Roles come from `role.role_type`, surfaced on the session as `session.user.role`. The `hod` and `hr` role rows exist. Department is NOT on the session — look it up from the user's active `employment` (`status: "active"`) `department_id`.
- `leave_request` already has `status` (default `"pending"`), `approved_by Int?`, `approved_at DateTime?`, `remarks String?`, `updated_at`. **No new columns are added.**
- Verified Prisma relation accessors on `leave_request`: `leave_types` (→ `name`), `users_leave_request_user_idTousers` (the requester → `users`), `users_leave_request_approved_byTousers` (the approver → `users`). On `users`: `user_profile` (→ `full_name`), `employment` (→ `employment[]`, each with `status`, `department_id`, and `department` → `department_name`).
- Server actions live in `src/app/attendance/leave/actions.ts` (starts with `"use server";`) and already import `revalidatePath` (next/cache), `getServerSession` (next-auth/next), `authOptions` (@/lib/nextauth), `prisma` (@/lib/prisma). Return shape convention: `{ ok: boolean; error?: string }`.
- The existing `NotificationBell` (`src/app/components/NotificationBell.tsx`) is superadmin-only: props `{ role }`, `isSuperadmin = role === "superadmin"`, state `open`/`count`, one effect polling `/api/approvals/count`, a click-outside effect, and a dropdown. `TopBar` already passes `role` to it.
- **There is no test runner on `main`** (Vitest was removed in the revert) and the spec opts not to re-add it. The approval logic is kept in a pure module for clarity/testability, but verification is via `npx tsc --noEmit`, `npx eslint <file>`, `npm run build`, and a manual smoke test.
- **Prisma CLI gotcha:** not relevant here (no schema change), but note `npx prisma <cmd>` silently no-ops in this shell; use `node node_modules/prisma/build/index.js <cmd>` if ever needed.

---

## File Structure

- `src/app/attendance/leave/approval-logic.ts` *(new)* — pure: `resolveHodAction`, `validateRejectionReason`.
- `src/app/attendance/leave/approval-queries.ts` *(new)* — Prisma helpers: dept lookup, HOD pending list/count, HR approved list/recent-count.
- `src/app/attendance/leave/actions.ts` *(modify)* — add `approveLeaveRequest`, `rejectLeaveRequest`.
- `src/app/api/leave/approvals/count/route.ts` *(new)* — role-aware `{ count }`.
- `src/app/components/LeaveApprovalsView.tsx` *(new)* — client view; `mode="hod"` (Approve/Reject) or `mode="hr"` (read-only).
- `src/app/attendance/leave/approvals/page.tsx` *(new)* — role-aware server page; redirects non-hod/hr.
- `src/app/components/NotificationBell.tsx` *(modify)* — poll the count endpoint; role-aware alert card.

---

## Task 1: Pure approval-logic module

**Files:**
- Create: `src/app/attendance/leave/approval-logic.ts`

- [ ] **Step 1: Write the module**

Create `src/app/attendance/leave/approval-logic.ts`:
```ts
// Pure decision logic for HOD leave approvals. No Prisma, no session, no I/O.

export interface HodActionContext {
  /** session.user.role of the actor */
  actorRole: string | null | undefined;
  /** the HOD's own active department id; null if unknown */
  actorDepartmentId: number | null;
  /** current status of the leave request */
  requestStatus: string;
  /** the requester's active department id; null if they have no active employment */
  requesterDepartmentId: number | null;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Whether this actor (a HOD) may approve/reject this request. */
export function resolveHodAction(ctx: HodActionContext): ActionResult {
  if (ctx.actorRole !== "hod") {
    return { ok: false, error: "You are not authorized to action leave requests." };
  }
  if (ctx.requestStatus !== "pending") {
    return { ok: false, error: "This request is no longer awaiting approval." };
  }
  if (ctx.actorDepartmentId == null) {
    return { ok: false, error: "Your account has no department assigned." };
  }
  if (ctx.requesterDepartmentId == null) {
    return { ok: false, error: "This request's owner has no department assigned." };
  }
  if (ctx.requesterDepartmentId !== ctx.actorDepartmentId) {
    return { ok: false, error: "This request belongs to another department." };
  }
  return { ok: true };
}

export type ReasonResult = { ok: true; reason: string } | { ok: false; error: string };

/** Rejection requires a non-empty written reason. */
export function validateRejectionReason(reason: string): ReasonResult {
  const trimmed = (reason ?? "").trim();
  if (!trimmed) return { ok: false, error: "A reason is required to reject a request." };
  return { ok: true, reason: trimmed };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/attendance/leave/approval-logic.ts
git commit -m "feat(leave): pure HOD approval decision logic"
```

---

## Task 2: Approval-queries module

**Files:**
- Create: `src/app/attendance/leave/approval-queries.ts`

- [ ] **Step 1: Write the module**

Create `src/app/attendance/leave/approval-queries.ts`:
```ts
import { prisma } from "@/lib/prisma";

export interface HodPendingRow {
  leaveId: number;
  displayId: string;
  requesterName: string;
  departmentName: string | null;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string | null;
  appliedAt: string;
}

export interface HrApprovedRow {
  leaveId: number;
  displayId: string;
  requesterName: string;
  departmentName: string | null;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  approvedBy: string | null;
  approvedAt: string | null;
}

/** Active department id for a user, or null if they have no active employment. */
export async function getActiveDepartmentId(userId: number): Promise<number | null> {
  const emp = await prisma.employment.findFirst({
    where: { user_id: userId, status: "active" },
    select: { department_id: true },
  });
  return emp?.department_id ?? null;
}

const pendingWhere = (departmentId: number) => ({
  status: "pending",
  users_leave_request_user_idTousers: {
    employment: { some: { status: "active", department_id: departmentId } },
  },
});

/** Pending requests in a department, for the HOD action list. */
export async function loadHodPending(departmentId: number): Promise<HodPendingRow[]> {
  const rows = await prisma.leave_request.findMany({
    where: pendingWhere(departmentId),
    orderBy: { applied_at: "asc" },
    include: {
      leave_types: { select: { name: true } },
      users_leave_request_user_idTousers: {
        select: {
          user_profile: { select: { full_name: true } },
          employment: {
            where: { status: "active" },
            take: 1,
            select: { department: { select: { department_name: true } } },
          },
        },
      },
    },
  });

  return rows.map((r) => {
    const requester = r.users_leave_request_user_idTousers;
    return {
      leaveId: r.leave_id,
      displayId: `LV-${String(r.leave_id).padStart(3, "0")}`,
      requesterName: requester.user_profile?.full_name ?? "Unknown",
      departmentName: requester.employment[0]?.department?.department_name ?? null,
      leaveTypeName: r.leave_types.name,
      startDate: r.start_date.toISOString().slice(0, 10),
      endDate: r.end_date.toISOString().slice(0, 10),
      totalDays: Number(r.total_days),
      reason: r.reason,
      appliedAt: r.applied_at.toISOString(),
    };
  });
}

export async function countHodPending(departmentId: number): Promise<number> {
  return prisma.leave_request.count({ where: pendingWhere(departmentId) });
}

/** All approved requests, company-wide, for the HR read-only list. */
export async function loadHrApproved(): Promise<HrApprovedRow[]> {
  const rows = await prisma.leave_request.findMany({
    where: { status: "approved" },
    orderBy: { approved_at: "desc" },
    include: {
      leave_types: { select: { name: true } },
      users_leave_request_user_idTousers: {
        select: {
          user_profile: { select: { full_name: true } },
          employment: {
            where: { status: "active" },
            take: 1,
            select: { department: { select: { department_name: true } } },
          },
        },
      },
      users_leave_request_approved_byTousers: {
        select: { user_profile: { select: { full_name: true } } },
      },
    },
  });

  return rows.map((r) => {
    const requester = r.users_leave_request_user_idTousers;
    return {
      leaveId: r.leave_id,
      displayId: `LV-${String(r.leave_id).padStart(3, "0")}`,
      requesterName: requester.user_profile?.full_name ?? "Unknown",
      departmentName: requester.employment[0]?.department?.department_name ?? null,
      leaveTypeName: r.leave_types.name,
      startDate: r.start_date.toISOString().slice(0, 10),
      endDate: r.end_date.toISOString().slice(0, 10),
      totalDays: Number(r.total_days),
      approvedBy: r.users_leave_request_approved_byTousers?.user_profile?.full_name ?? null,
      approvedAt: r.approved_at ? r.approved_at.toISOString() : null,
    };
  });
}

/** Count of requests approved in the last 7 days (rolling window for the HR badge). */
export async function countHrRecentApproved(): Promise<number> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return prisma.leave_request.count({
    where: { status: "approved", approved_at: { gte: since } },
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. If a relation/field name mismatches the generated client, fix only the include/where/select keys here (keep exported names + row interfaces identical — later tasks depend on them).

- [ ] **Step 3: Lint**

Run: `npx eslint src/app/attendance/leave/approval-queries.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/attendance/leave/approval-queries.ts
git commit -m "feat(leave): HOD pending + HR approved query helpers"
```

---

## Task 3: Server actions — approve & reject

**Files:**
- Modify: `src/app/attendance/leave/actions.ts`

- [ ] **Step 1: Add imports**

In `src/app/attendance/leave/actions.ts`, add near the existing imports:
```ts
import { resolveHodAction, validateRejectionReason } from "./approval-logic";
import { getActiveDepartmentId } from "./approval-queries";
```

- [ ] **Step 2: Append the actions**

Append to the END of `src/app/attendance/leave/actions.ts`:
```ts
export interface ApprovalActionResult {
  ok: boolean;
  error?: string;
}

/** Resolve the acting user + role + active department from the session. */
async function resolveActor(): Promise<
  | { ok: true; userId: number; role: string | null; departmentId: number | null }
  | { ok: false; error: string }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false, error: "Not authenticated." };
  const role = (session.user as { role?: string | null }).role ?? null;
  const user = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { user_id: true },
  });
  if (!user) return { ok: false, error: "User record not found." };
  const departmentId = await getActiveDepartmentId(user.user_id);
  return { ok: true, userId: user.user_id, role, departmentId };
}

async function loadRequestForAction(leaveId: number) {
  const req = await prisma.leave_request.findUnique({
    where: { leave_id: leaveId },
    select: { leave_id: true, status: true, user_id: true },
  });
  if (!req) return null;
  const requesterDepartmentId = await getActiveDepartmentId(req.user_id);
  return { ...req, requesterDepartmentId };
}

export async function approveLeaveRequest(leaveId: number): Promise<ApprovalActionResult> {
  const actor = await resolveActor();
  if (!actor.ok) return { ok: false, error: actor.error };

  const req = await loadRequestForAction(leaveId);
  if (!req) return { ok: false, error: "Leave request not found." };

  const decision = resolveHodAction({
    actorRole: actor.role,
    actorDepartmentId: actor.departmentId,
    requestStatus: req.status,
    requesterDepartmentId: req.requesterDepartmentId,
  });
  if (!decision.ok) return { ok: false, error: decision.error };

  const now = new Date();
  await prisma.leave_request.update({
    where: { leave_id: leaveId },
    data: { status: "approved", approved_by: actor.userId, approved_at: now, updated_at: now },
  });
  revalidatePath("/attendance/leave/approvals");
  return { ok: true };
}

export async function rejectLeaveRequest(
  leaveId: number,
  reason: string,
): Promise<ApprovalActionResult> {
  const actor = await resolveActor();
  if (!actor.ok) return { ok: false, error: actor.error };

  const reasonCheck = validateRejectionReason(reason);
  if (!reasonCheck.ok) return { ok: false, error: reasonCheck.error };

  const req = await loadRequestForAction(leaveId);
  if (!req) return { ok: false, error: "Leave request not found." };

  const decision = resolveHodAction({
    actorRole: actor.role,
    actorDepartmentId: actor.departmentId,
    requestStatus: req.status,
    requesterDepartmentId: req.requesterDepartmentId,
  });
  if (!decision.ok) return { ok: false, error: decision.error };

  const now = new Date();
  await prisma.leave_request.update({
    where: { leave_id: leaveId },
    data: {
      status: "rejected",
      remarks: reasonCheck.reason,
      approved_by: actor.userId,
      approved_at: now,
      updated_at: now,
    },
  });
  revalidatePath("/attendance/leave/approvals");
  return { ok: true };
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/app/attendance/leave/actions.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/attendance/leave/actions.ts
git commit -m "feat(leave): HOD approve and reject server actions"
```

---

## Task 4: Count API route

**Files:**
- Create: `src/app/api/leave/approvals/count/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/leave/approvals/count/route.ts`:
```ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/nextauth";
import { prisma } from "@/lib/prisma";
import {
  getActiveDepartmentId,
  countHodPending,
  countHrRecentApproved,
} from "@/app/attendance/leave/approval-queries";

export const dynamic = "force-dynamic";

// Role-aware badge count:
//  - hod -> pending requests in their department
//  - hr  -> requests approved in the last 7 days
//  - else -> 0
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ count: 0 });
  const role = (session.user as { role?: string | null }).role ?? null;

  if (role === "hr") {
    return NextResponse.json({ count: await countHrRecentApproved() });
  }

  if (role === "hod") {
    const user = await prisma.users.findUnique({
      where: { email: session.user.email },
      select: { user_id: true },
    });
    if (!user) return NextResponse.json({ count: 0 });
    const departmentId = await getActiveDepartmentId(user.user_id);
    if (departmentId == null) return NextResponse.json({ count: 0 });
    return NextResponse.json({ count: await countHodPending(departmentId) });
  }

  return NextResponse.json({ count: 0 });
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/app/api/leave/approvals/count/route.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/leave/approvals/count/route.ts
git commit -m "feat(leave): role-aware approvals count endpoint"
```

---

## Task 5: LeaveApprovalsView client component

**Files:**
- Create: `src/app/components/LeaveApprovalsView.tsx`

- [ ] **Step 1: Write the component**

Create `src/app/components/LeaveApprovalsView.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Home, ChevronRight, Inbox } from "lucide-react";
import { approveLeaveRequest, rejectLeaveRequest } from "@/app/attendance/leave/actions";

export interface HodPendingItem {
  leaveId: number;
  displayId: string;
  requesterName: string;
  departmentName: string | null;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string | null;
  appliedAt: string;
}

export interface HrApprovedItem {
  leaveId: number;
  displayId: string;
  requesterName: string;
  departmentName: string | null;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  approvedBy: string | null;
  approvedAt: string | null;
}

export default function LeaveApprovalsView({
  mode,
  hodItems = [],
  hrItems = [],
}: {
  mode: "hod" | "hr";
  hodItems?: HodPendingItem[];
  hrItems?: HrApprovedItem[];
}) {
  const title = mode === "hod" ? "Leave Approvals" : "Approved Leave";
  const subtitle =
    mode === "hod"
      ? "Approve or reject pending requests from your department."
      : "Leave requests approved across the company.";

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 pt-4 pb-10 space-y-6">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/attendance" className="hover:text-slate-900 transition-colors">Attendance</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium">Approvals</span>
        </nav>

        <header>
          <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </header>

        {mode === "hod" ? <HodTable items={hodItems} /> : <HrTable items={hrItems} />}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <section className="bg-white border border-slate-200 rounded-2xl px-6 py-12 text-center">
      <div className="mx-auto w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
        <Inbox className="w-5 h-5 text-slate-400" aria-hidden="true" />
      </div>
      <p className="mt-3 text-sm font-medium text-slate-900">{message}</p>
    </section>
  );
}

function HodTable({ items }: { items: HodPendingItem[] }) {
  const [isPending, startTransition] = useTransition();
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onApprove = (id: number) => {
    setError(null);
    startTransition(async () => {
      const res = await approveLeaveRequest(id);
      if (!res.ok) setError(res.error ?? "Failed to approve.");
    });
  };

  const onReject = (id: number) => {
    setError(null);
    startTransition(async () => {
      const res = await rejectLeaveRequest(id, reason);
      if (!res.ok) {
        setError(res.error ?? "Failed to reject.");
        return;
      }
      setRejectingId(null);
      setReason("");
    });
  };

  if (items.length === 0) return <EmptyState message="Nothing awaiting your approval." />;

  return (
    <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      {error && (
        <div className="px-6 py-3 bg-red-50 text-sm text-red-700 border-b border-red-100">{error}</div>
      )}
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-[11px] font-semibold tracking-widest text-slate-500 uppercase">
          <tr>
            <th className="text-left px-6 py-3">ID</th>
            <th className="text-left px-6 py-3">Employee</th>
            <th className="text-left px-6 py-3">Type</th>
            <th className="text-left px-6 py-3">Dates</th>
            <th className="text-left px-6 py-3">Days</th>
            <th className="text-left px-6 py-3">Reason</th>
            <th className="text-right px-6 py-3">Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.leaveId} className="border-t border-slate-100 align-top">
              <td className="px-6 py-3 font-medium text-slate-900">{item.displayId}</td>
              <td className="px-6 py-3 text-slate-700">{item.requesterName}</td>
              <td className="px-6 py-3 text-slate-700">{item.leaveTypeName}</td>
              <td className="px-6 py-3 text-slate-500">{item.startDate} → {item.endDate}</td>
              <td className="px-6 py-3 text-slate-700">{item.totalDays}</td>
              <td className="px-6 py-3 text-slate-500 max-w-[16rem] truncate">{item.reason ?? "—"}</td>
              <td className="px-6 py-3">
                {rejectingId === item.leaveId ? (
                  <div className="flex flex-col gap-2 items-end">
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Reason for rejection (required)…"
                      className="w-64 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={isPending || !reason.trim()}
                        onClick={() => onReject(item.leaveId)}
                        className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold disabled:opacity-50 hover:bg-red-700"
                      >
                        Confirm Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectingId(null);
                          setReason("");
                        }}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => onApprove(item.leaveId)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50 hover:bg-emerald-700"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => setRejectingId(item.leaveId)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function HrTable({ items }: { items: HrApprovedItem[] }) {
  if (items.length === 0) return <EmptyState message="No approved leave to show." />;

  return (
    <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-[11px] font-semibold tracking-widest text-slate-500 uppercase">
          <tr>
            <th className="text-left px-6 py-3">ID</th>
            <th className="text-left px-6 py-3">Employee</th>
            <th className="text-left px-6 py-3">Department</th>
            <th className="text-left px-6 py-3">Type</th>
            <th className="text-left px-6 py-3">Dates</th>
            <th className="text-left px-6 py-3">Days</th>
            <th className="text-left px-6 py-3">Approved by</th>
            <th className="text-left px-6 py-3">Approved on</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.leaveId} className="border-t border-slate-100">
              <td className="px-6 py-3 font-medium text-slate-900">{item.displayId}</td>
              <td className="px-6 py-3 text-slate-700">{item.requesterName}</td>
              <td className="px-6 py-3 text-slate-500">{item.departmentName ?? "—"}</td>
              <td className="px-6 py-3 text-slate-700">{item.leaveTypeName}</td>
              <td className="px-6 py-3 text-slate-500">{item.startDate} → {item.endDate}</td>
              <td className="px-6 py-3 text-slate-700">{item.totalDays}</td>
              <td className="px-6 py-3 text-slate-500">{item.approvedBy ?? "—"}</td>
              <td className="px-6 py-3 text-slate-500">{item.approvedAt ? item.approvedAt.slice(0, 10) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/app/components/LeaveApprovalsView.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/components/LeaveApprovalsView.tsx
git commit -m "feat(leave): approvals view (HOD actions / HR read-only)"
```

---

## Task 6: Role-aware approvals page

**Files:**
- Create: `src/app/attendance/leave/approvals/page.tsx`

- [ ] **Step 1: Write the page**

Create `src/app/attendance/leave/approvals/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/nextauth";
import { prisma } from "@/lib/prisma";
import AppShell from "@/app/components/AppShell";
import LeaveApprovalsView, {
  type HodPendingItem,
  type HrApprovedItem,
} from "@/app/components/LeaveApprovalsView";
import { getActiveDepartmentId, loadHodPending, loadHrApproved } from "../approval-queries";

export const dynamic = "force-dynamic";

export default async function LeaveApprovalsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");

  const role = (session.user as { role?: string } | undefined)?.role ?? "";
  if (role !== "hod" && role !== "hr") redirect("/home");
  const mode: "hod" | "hr" = role === "hod" ? "hod" : "hr";

  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { user_id: true },
  });
  if (!me) redirect("/login");

  let hodItems: HodPendingItem[] = [];
  let hrItems: HrApprovedItem[] = [];
  if (mode === "hod") {
    const departmentId = await getActiveDepartmentId(me.user_id);
    hodItems = departmentId != null ? await loadHodPending(departmentId) : [];
  } else {
    hrItems = await loadHrApproved();
  }

  const userEmail = session.user.email ?? "";
  const userName = session.user.name ?? null;

  return (
    <AppShell email={userEmail} role={role} name={userName}>
      <LeaveApprovalsView mode={mode} hodItems={hodItems} hrItems={hrItems} />
    </AppShell>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/app/attendance/leave/approvals/page.tsx`
Expected: no errors. (The `HodPendingItem`/`HrApprovedItem` from the view are structurally identical to the query rows, so the assignments typecheck.)

- [ ] **Step 3: Commit**

```bash
git add src/app/attendance/leave/approvals/page.tsx
git commit -m "feat(leave): role-aware approvals page"
```

---

## Task 7: Generalize the NotificationBell

Keep the superadmin registration count working; add a leave count (HOD pending / HR recent-approved) and a role-aware card.

**Files:**
- Modify: `src/app/components/NotificationBell.tsx`

- [ ] **Step 1: Add leave-count state**

Find:
```tsx
  const [count, setCount] = useState(0);
```
Replace with:
```tsx
  const [count, setCount] = useState(0);
  const [leaveCount, setLeaveCount] = useState(0);
```

- [ ] **Step 2: Add a polling effect**

Find the end of the first effect:
```tsx
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isSuperadmin]);
```
Immediately AFTER it, insert:
```tsx

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/leave/approvals/count", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { count?: number };
        if (!cancelled && typeof data.count === "number") setLeaveCount(data.count);
      } catch {
        // network flake — no-op
      }
    };
    load();
    const interval = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);
```

- [ ] **Step 3: Add a derived total + role-aware copy before `return`**

Find:
```tsx
  return (
    <div className="relative" ref={containerRef}>
```
Replace with:
```tsx
  const totalCount = count + leaveCount;
  const leaveMessage =
    role === "hr"
      ? leaveCount === 1
        ? "1 leave request was recently approved."
        : `${leaveCount} leave requests were recently approved.`
      : leaveCount === 1
        ? "1 leave request is awaiting your review."
        : `${leaveCount} leave requests are awaiting your review.`;

  return (
    <div className="relative" ref={containerRef}>
```

- [ ] **Step 4: Point the badge at `totalCount`**

In the bell button JSX, change the three `count` usages to `totalCount`:
- `aria-label={totalCount > 0 ? \`Notifications: ${totalCount} pending\` : "Notifications"}`
- the badge guard `{totalCount > 0 && (`
- the badge text `{totalCount > 99 ? "99+" : totalCount}`

- [ ] **Step 5: Replace the dropdown content**

Replace the conditional block that currently begins:
```tsx
          {!isSuperadmin || count === 0 ? (
```
and ends at its matching `)}` just before the `</div>` that closes the `role="menu"` container. Replace that ENTIRE block with:
```tsx
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close notifications"
              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {totalCount === 0 ? (
            <div className="px-5 py-10 text-center">
              <div className="mx-auto w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                <Bell className="w-5 h-5 text-slate-400" aria-hidden="true" />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-900">You&apos;re all caught up</p>
              <p className="mt-0.5 text-xs text-slate-500">New notifications will show up here.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {isSuperadmin && count > 0 && (
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center shrink-0 ring-1 ring-inset ring-amber-200">
                      <Hourglass className="w-5 h-5 text-amber-600" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 leading-snug">Account approval</p>
                      <p className="mt-0.5 text-sm text-slate-500 leading-snug">
                        {count === 1
                          ? "1 registration is waiting for your approval."
                          : `${count} registrations are waiting for your approval.`}
                      </p>
                      <div className="mt-3">
                        <Link
                          href="/approvals"
                          onClick={() => setOpen(false)}
                          className="inline-flex items-center justify-center h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
                        >
                          Review
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {leaveCount > 0 && (
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center shrink-0 ring-1 ring-inset ring-amber-200">
                      <Hourglass className="w-5 h-5 text-amber-600" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 leading-snug">
                        {role === "hr" ? "Approved leave" : "Leave approvals"}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-500 leading-snug">{leaveMessage}</p>
                      <div className="mt-3">
                        <Link
                          href="/attendance/leave/approvals"
                          onClick={() => setOpen(false)}
                          className="inline-flex items-center justify-center h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
                        >
                          Review
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
```

- [ ] **Step 6: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/app/components/NotificationBell.tsx`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/components/NotificationBell.tsx
git commit -m "feat(leave): bell alerts for HOD pending and HR approved"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Lint (our files)**

Run: `npx eslint src/app/attendance/leave/approval-logic.ts src/app/attendance/leave/approval-queries.ts src/app/attendance/leave/actions.ts "src/app/api/leave/approvals/count/route.ts" src/app/components/LeaveApprovalsView.tsx src/app/attendance/leave/approvals/page.tsx src/app/components/NotificationBell.tsx`
Expected: no errors. (Project-wide `eslint` has pre-existing errors in unrelated files — ignore those.)

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build completes; `/attendance/leave/approvals` and `/api/leave/approvals/count` appear in the route list.

- [ ] **Step 4: Manual smoke test**

With `npm run dev` (needs a `hod` user, an `hr` user, and a staff user in the HOD's department):
1. Staff submits leave → `pending`.
2. Sign in as the **HOD of that dept**: bell shows a "Leave approvals" badge; `/attendance/leave/approvals` lists the request. **Approve** → status `approved`, row leaves the list, badge decrements.
3. A HOD from a **different** department does not see that request.
4. **Reject** with empty reason → blocked; with a reason → status `rejected`, reason saved.
5. Sign in as **HR**: bell shows an "Approved leave" badge (counting approvals in the last 7 days); `/attendance/leave/approvals` shows the read-only approved list including the just-approved request.
6. A **staff** user: no badge; visiting `/attendance/leave/approvals` redirects to `/home`.

- [ ] **Step 5: Done**

All automated checks pass and the manual smoke test behaves as described. Feature complete on `feat/leave-hod-approvals`.

---

## Notes for the implementer

- **No schema change.** Do not run `prisma db push`. The actions write only existing columns (`status`, `approved_by`, `approved_at`, `remarks`, `updated_at`).
- **Structural typing:** `HodPendingItem`/`HrApprovedItem` (view) intentionally mirror `HodPendingRow`/`HrApprovedRow` (queries); the page passes query rows straight to the view — TypeScript accepts this because the shapes match.
- **No superadmin override:** `resolveHodAction` only accepts `role === "hod"`; the page only admits `hod`/`hr`.
- **Reject audit quirk:** rejections set `approved_by`/`approved_at` to record who actioned (the only audit columns); this is intentional per the spec.
