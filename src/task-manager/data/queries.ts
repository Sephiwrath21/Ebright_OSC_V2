// Read queries: personal overview, role-scoped detail, staff directory,
// single-department detail. Ports of the corresponding /api/internal routes.
import { z } from "zod";
import type {
  FlowBranchDetailResponse,
  FlowDepartmentDetailResponse,
  FlowDetailResponse,
  FlowOverviewResponse,
  FlowPeriod,
  FlowStaffMember,
} from "../ui/types";
import { ApiHttpError } from "../lib/api-server";
import { prisma } from "../prisma";
import {
  analyticsQuerySchema,
  canViewEntity,
  canViewOrg,
  fetchPeriodBlocks,
  isElevatedDeptSite,
  UNASSIGNED,
} from "../analytics/_lib";
import {
  getAdhocPayload,
  getAdhocRegionsPayload,
  getEntityCeoAssignedPayload,
  getEntityHodAssignedPayload,
  getEntityPayload,
  getMePayload,
  getOrgPayload,
  resolvedDate,
} from "../analytics/_payloads";
import type { EntityPayload } from "../analytics/_payloads";
import { advanceRecurringBlocks } from "../engine/recurrence";
import { native, requireUserByEmail } from "./core";

/** Personal progress for the dashboard card (daily or monthly).
 *
 *  `opts.strictWindow` (2026-08-15, the Overview page's embedded weekday-tab
 *  view): forwarded straight to getMePayload — off (default) preserves this
 *  function's original wide semantics for its original caller (the Home
 *  dashboard's personal progress card); the weekday-tab view passes `true`
 *  since each tab must show ONLY that day's tasks, not every same-cadence
 *  block regardless of date. See getFlowDetail's own strictWindow comment
 *  for the full rule. */
export function getFlowOverview(
  email: string,
  period: FlowPeriod,
  date?: string,
  opts?: { strictWindow?: boolean },
): Promise<FlowOverviewResponse> {
  return native(async () => {
    const q = analyticsQuerySchema.parse({ period, ...(date ? { date } : {}) });
    const user = await requireUserByEmail(email);
    const payload = await getMePayload(user, q.period, q.date, { strictWindow: opts?.strictWindow });
    return { period: q.period, date: resolvedDate(q.date), ...payload } as FlowOverviewResponse;
  }, "getFlowOverview");
}

/** Role-scoped detail for the Task Manager page. */
export function getFlowDetail(
  email: string,
  period: FlowPeriod,
  date?: string,
  opts?: {
    /** Window `adhocByRegion` to this single day (Home overview's Ad hoc
     *  date filter, 2026-07-28). Omitted = all-time, the original
     *  semantics — /task-manager keeps that. */
    adhocDate?: string;
    /** Monthly 7-day range dropdown (2026-07-29): clamp the MONTHLY window
     *  to these days of the anchor month (e.g. {from:1,to:7}). Only
     *  meaningful when `period` is "monthly"; ignored for daily. */
    monthDays?: { from: number; to: number };
  },
): Promise<FlowDetailResponse> {
  return native(async () => {
    // Lazy weekly-recurrence catch-up (engine/recurrence.ts) — throttled
    // in-process, idempotent, no-op when nothing recurring is overdue.
    await advanceRecurringBlocks();
    const q = analyticsQuerySchema.parse({ period, ...(date ? { date } : {}) });
    const user = await requireUserByEmail(email);
    // Personal sets are windowed to the anchor day/month (the personal
    // view's date filters, 2026-07-28) — EXCEPT the CEO, whose single
    // combined "My Tasks" list deliberately mixes the whole daily+monthly
    // sets and has no picker; strict windows would silently drop their
    // upcoming tasks.
    // Monthly-only day-range clamp (the range dropdown) — guard here so a
    // stray mrange param can never affect the daily fetch.
    const monthDays = q.period === "monthly" ? opts?.monthDays : undefined;
    // strictWindow for EVERYONE now (2026-08-01): the CEO's old exception
    // fed the un-windowed combined list, which was replaced by the same
    // day-windowed "My Tasks — Daily" view every other role uses.
    const me = await getMePayload(user, q.period, q.date, {
      strictWindow: true,
      monthDays,
    });

    // Elevated department sites (Operations/Optimisation) get the FULL org
    // view — departments AND branches AND ad hoc regions — per the
    // 2026-07-29 final role spec (superadmin-equivalent visibility).
    const elevated = isElevatedDeptSite(user);
    if (canViewOrg(user.role) || elevated) {
      const [org, adhoc, adhocByRegion] = await Promise.all([
        getOrgPayload(q.period, q.date, monthDays),
        getAdhocPayload(null),
        // CEO joined 2026-08-01 (Home's branchRegionOverview section needs
        // the Ad hoc-by-region rollup alongside ADMIN/OPS/elevated).
        user.role === "ADMIN" || user.role === "OPS" || user.role === "CEO" || elevated
          ? getAdhocRegionsPayload(opts?.adhocDate)
          : Promise.resolve(undefined),
      ]);
      if (user.role === "OPS") {
        const departmentName = user.department ?? UNASSIGNED;
        const department = await getEntityPayload("department", departmentName, q.period, q.date, monthDays);
        return {
          kind: "org",
          period: q.period,
          date: resolvedDate(q.date),
          me,
          org,
          adhoc,
          adhocByRegion,
          department: { name: departmentName, ...department },
        } as FlowDetailResponse;
      }
      return {
        kind: "org",
        period: q.period,
        date: resolvedDate(q.date),
        me,
        org,
        adhoc,
        adhocByRegion,
      } as FlowDetailResponse;
    }

    if (user.role === "BRANCH" || user.role === "BRANCH_SITE") {
      const branchName = user.branch ?? UNASSIGNED;
      // Branch SITES get the branch-wide ad hoc set too since the
      // 2026-07-29 final role spec (was Manager-only oversight).
      const [branch, adhoc] = await Promise.all([
        getEntityPayload("branch", branchName, q.period, q.date, monthDays),
        getAdhocPayload(branchName),
      ]);
      return {
        kind: "branch",
        period: q.period,
        date: resolvedDate(q.date),
        me,
        branch: { name: branchName, ...branch },
        adhoc,
      } as FlowDetailResponse;
    }

    if (user.role === "HOD" || user.role === "DEPT_SITE") {
      // Elevated DEPT_SITEs never reach here (they take the org branch
      // above since the 2026-07-29 final role spec).
      const departmentName = user.department ?? UNASSIGNED;
      const department = await getEntityPayload(
        "department",
        departmentName,
        q.period,
        q.date,
        monthDays,
      );
      return {
        kind: "department",
        period: q.period,
        date: resolvedDate(q.date),
        me,
        department: { name: departmentName, ...department },
      } as FlowDetailResponse;
    }

    return {
      kind: "member",
      period: q.period,
      date: resolvedDate(q.date),
      me,
    } as FlowDetailResponse;
  }, "getFlowDetail");
}

// Deliberately no per-user auth (donor parity): call sites must sit behind
// session auth. Returns the PII-free staff subset only.
/** Assignable staff directory (recipient picker options). */
export function getFlowStaff(): Promise<{ staff: FlowStaffMember[] }> {
  return native(async () => {
    const users = await prisma.user.findMany({
      where: { role: { in: ["CEO", "HOD", "BRANCH", "MEMBER"] } },
      orderBy: { name: "asc" },
    });
    return {
      staff: users.map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
        department: u.department,
        branch: u.branch,
        employmentType: u.employmentType,
        coachSchedule: u.coachSchedule,
      })) as FlowStaffMember[],
    };
  }, "getFlowStaff");
}

/** Just the caller's own Task Manager domain role (+ department) — a light
 *  alternative to getFlowDetail/getFlowOverview for callers that only need
 *  the role, e.g. deciding whether to hide the Cadence picker for a CEO
 *  (mirrors /task-manager/page.tsx's `role === "CEO"` check, without
 *  fetching that page's full daily payload). Deliberately NOT the OSC
 *  portal session's own role field — a different identity system.
 *  `department` (2026-08-07, RBAC plan) travels alongside `role` because
 *  `canManageTaskTemplateGroups`/`taskManagerNavAccess` (see role-views.ts)
 *  need both together — used by template/page.tsx, package/page.tsx, and
 *  package-table/page.tsx to compute their `canEdit`/view-access checks. */
export function getMyRole(email: string): Promise<{ role: string; department: string | null }> {
  return native(async () => {
    const user = await requireUserByEmail(email);
    return { role: user.role, department: user.department };
  }, "getMyRole");
}

const departmentQuerySchema = analyticsQuerySchema.extend({
  department: z.string().min(1).max(200),
});

/** Full detail for ONE department by name (org roles any; HOD/DEPT_SITE own
 *  only; MEMBER additionally sees own department's Daily only (see
 *  ownDailyView below)). */
export function getDepartmentDetail(
  email: string,
  department: string,
  period: FlowPeriod,
  date?: string,
): Promise<FlowDepartmentDetailResponse> {
  return native(async () => {
    await advanceRecurringBlocks();
    const q = departmentQuerySchema.parse({ department, period, ...(date ? { date } : {}) });
    const user = await requireUserByEmail(email);
    // Stacked-sections redesign (2026-08-12): plain department-side staff
    // (role MEMBER) may view their OWN department's whole-roster DAILY
    // detail — the new page-wide Daily section's confirmed visibility rule
    // — but NOT Monthly (unchanged, still self-only for MEMBER). Scoped
    // locally to this function (not canViewEntity itself, which has no
    // period and also gates getBranchDetail/the HOD/CEO-assigned queries —
    // widening it there would silently unlock Monthly whole-department
    // detail too, which must stay unchanged).
    const ownDailyView =
      user.role === "MEMBER" && q.period === "daily" && q.department === (user.department ?? UNASSIGNED);
    if (!canViewEntity(user, "department", q.department) && !ownDailyView) {
      throw new ApiHttpError(403, "You can only view your own department");
    }
    const payload = await getEntityPayload("department", q.department, q.period, q.date);
    return {
      period: q.period,
      date: resolvedDate(q.date),
      department: { name: q.department, ...payload },
    } as FlowDepartmentDetailResponse;
  }, "getDepartmentDetail");
}

/** "HOD Assigned Task" filter mode for the Overview card redesign
 *  (2026-08-12) — all-time, no period/date param (mirrors
 *  getDepartmentDetail's auth check, different payload source). */
export function getDepartmentHodAssigned(
  email: string,
  department: string,
): Promise<{ department: { name: string } & EntityPayload }> {
  return native(async () => {
    await advanceRecurringBlocks();
    const q = z.object({ department: z.string().min(1).max(200) }).parse({ department });
    const user = await requireUserByEmail(email);
    if (!canViewEntity(user, "department", q.department)) {
      throw new ApiHttpError(403, "You can only view your own department");
    }
    const payload = await getEntityHodAssignedPayload("department", q.department);
    return { department: { name: q.department, ...payload } };
  }, "getDepartmentHodAssigned");
}

/** "CEO Assigned Task" section (2026-08-12 stacked-sections redesign) —
 *  all-time, no period/date param (mirrors getDepartmentHodAssigned, a
 *  different payload source/assignerRole). */
export function getDepartmentCeoAssigned(
  email: string,
  department: string,
): Promise<{ department: { name: string } & EntityPayload }> {
  return native(async () => {
    await advanceRecurringBlocks();
    const q = z.object({ department: z.string().min(1).max(200) }).parse({ department });
    const user = await requireUserByEmail(email);
    if (!canViewEntity(user, "department", q.department)) {
      throw new ApiHttpError(403, "You can only view your own department");
    }
    const payload = await getEntityCeoAssignedPayload("department", q.department);
    return { department: { name: q.department, ...payload } };
  }, "getDepartmentCeoAssigned");
}

const branchQuerySchema = analyticsQuerySchema.extend({
  branch: z.string().min(1).max(200),
});

/** Full detail for ONE branch by name (org roles any; BRANCH/BRANCH_SITE own
 *  only — elevated department sites deliberately have NO branch access;
 *  MEMBER additionally sees own branch's Daily only (see ownDailyView
 *  below)). */
export function getBranchDetail(
  email: string,
  branch: string,
  period: FlowPeriod,
  date?: string,
): Promise<FlowBranchDetailResponse> {
  return native(async () => {
    await advanceRecurringBlocks();
    const q = branchQuerySchema.parse({ branch, period, ...(date ? { date } : {}) });
    const user = await requireUserByEmail(email);
    // Same rule as getDepartmentDetail above — plain branch-side staff
    // (role MEMBER, e.g. Branch Exec/Coach) may view their own branch's
    // whole-roster DAILY detail only; Monthly stays self-only.
    const ownDailyView =
      user.role === "MEMBER" && q.period === "daily" && q.branch === (user.branch ?? UNASSIGNED);
    if (!canViewEntity(user, "branch", q.branch) && !ownDailyView) {
      throw new ApiHttpError(403, "You can only view your own branch");
    }
    const payload = await getEntityPayload("branch", q.branch, q.period, q.date);
    return {
      period: q.period,
      date: resolvedDate(q.date),
      branch: { name: q.branch, ...payload },
    } as FlowBranchDetailResponse;
  }, "getBranchDetail");
}

/** "HOD Assigned Task" filter mode for the Overview card redesign
 *  (2026-08-12) — all-time, no period/date param. */
export function getBranchHodAssigned(
  email: string,
  branch: string,
): Promise<{ branch: { name: string } & EntityPayload }> {
  return native(async () => {
    await advanceRecurringBlocks();
    const q = z.object({ branch: z.string().min(1).max(200) }).parse({ branch });
    const user = await requireUserByEmail(email);
    if (!canViewEntity(user, "branch", q.branch)) {
      throw new ApiHttpError(403, "You can only view your own branch");
    }
    const payload = await getEntityHodAssignedPayload("branch", q.branch);
    return { branch: { name: q.branch, ...payload } };
  }, "getBranchHodAssigned");
}

/** "CEO Assigned Task" section (2026-08-12 stacked-sections redesign) —
 *  all-time, no period/date param. */
export function getBranchCeoAssigned(
  email: string,
  branch: string,
): Promise<{ branch: { name: string } & EntityPayload }> {
  return native(async () => {
    await advanceRecurringBlocks();
    const q = z.object({ branch: z.string().min(1).max(200) }).parse({ branch });
    const user = await requireUserByEmail(email);
    if (!canViewEntity(user, "branch", q.branch)) {
      throw new ApiHttpError(403, "You can only view your own branch");
    }
    const payload = await getEntityCeoAssignedPayload("branch", q.branch);
    return { branch: { name: q.branch, ...payload } };
  }, "getBranchCeoAssigned");
}
