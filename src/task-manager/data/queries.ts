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
  isElevatedDeptSite,
  UNASSIGNED,
} from "../analytics/_lib";
import {
  getAdhocPayload,
  getAdhocRegionsPayload,
  getEntityPayload,
  getMePayload,
  getOrgPayload,
  resolvedDate,
} from "../analytics/_payloads";
import { advanceRecurringBlocks } from "../engine/recurrence";
import { native, requireUserByEmail } from "./core";

/** Personal progress for the dashboard card (daily or monthly). */
export function getFlowOverview(
  email: string,
  period: FlowPeriod,
  date?: string,
): Promise<FlowOverviewResponse> {
  return native(async () => {
    const q = analyticsQuerySchema.parse({ period, ...(date ? { date } : {}) });
    const user = await requireUserByEmail(email);
    const payload = await getMePayload(user, q.period, q.date);
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
    const me = await getMePayload(user, q.period, q.date, {
      strictWindow: user.role !== "CEO",
    });

    if (canViewOrg(user.role)) {
      const [org, adhoc, adhocByRegion] = await Promise.all([
        getOrgPayload(q.period, q.date),
        getAdhocPayload(null),
        user.role === "ADMIN" || user.role === "OPS"
          ? getAdhocRegionsPayload(opts?.adhocDate)
          : Promise.resolve(undefined),
      ]);
      if (user.role === "OPS") {
        const departmentName = user.department ?? UNASSIGNED;
        const department = await getEntityPayload("department", departmentName, q.period, q.date);
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
      const [branch, adhoc] = await Promise.all([
        getEntityPayload("branch", branchName, q.period, q.date),
        user.role === "BRANCH" ? getAdhocPayload(branchName) : Promise.resolve(null),
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
      const departmentName = user.department ?? UNASSIGNED;
      // Elevated department sites (Operations/Optimisation) see EVERY
      // department (2026-07-28, the Home overview for all roles) — org
      // payload with the branch halves STRIPPED: elevated visibility is
      // org-wide DEPARTMENTS only, never branch data (see
      // ELEVATED_DEPT_SITE_DEPARTMENTS).
      const elevated = isElevatedDeptSite({ role: user.role, department: user.department });
      const [department, org] = await Promise.all([
        getEntityPayload("department", departmentName, q.period, q.date),
        elevated ? getOrgPayload(q.period, q.date) : Promise.resolve(undefined),
      ]);
      return {
        kind: "department",
        period: q.period,
        date: resolvedDate(q.date),
        me,
        department: { name: departmentName, ...department },
        ...(org
          ? { org: { ...org, branches: [], regions: [], regionsByRole: [] } }
          : {}),
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

const departmentQuerySchema = analyticsQuerySchema.extend({
  department: z.string().min(1).max(200),
});

/** Full detail for ONE department by name (org roles any; HOD/DEPT_SITE own only). */
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
    if (!canViewEntity(user, "department", q.department)) {
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

const branchQuerySchema = analyticsQuerySchema.extend({
  branch: z.string().min(1).max(200),
});

/** Full detail for ONE branch by name (org roles any; BRANCH/BRANCH_SITE own
 *  only — elevated department sites deliberately have NO branch access). */
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
    if (!canViewEntity(user, "branch", q.branch)) {
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
