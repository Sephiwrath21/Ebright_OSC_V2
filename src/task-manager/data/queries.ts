// Read queries: personal overview, role-scoped detail, staff directory,
// single-department detail. Ports of the corresponding /api/internal routes.
import { z } from "zod";
import type {
  FlowDepartmentDetailResponse,
  FlowDetailResponse,
  FlowOverviewResponse,
  FlowPeriod,
  FlowStaffMember,
} from "../ui/types";
import { ApiHttpError } from "../lib/api-server";
import { prisma } from "../prisma";
import { analyticsQuerySchema, canViewEntity, canViewOrg, UNASSIGNED } from "../analytics/_lib";
import {
  getAdhocPayload,
  getAdhocRegionsPayload,
  getEntityPayload,
  getMePayload,
  getOrgPayload,
  resolvedDate,
} from "../analytics/_payloads";
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
): Promise<FlowDetailResponse> {
  return native(async () => {
    const q = analyticsQuerySchema.parse({ period, ...(date ? { date } : {}) });
    const user = await requireUserByEmail(email);
    const me = await getMePayload(user, q.period, q.date);

    if (canViewOrg(user.role)) {
      const [org, adhoc, adhocByRegion] = await Promise.all([
        getOrgPayload(q.period, q.date),
        getAdhocPayload(null),
        user.role === "ADMIN" || user.role === "OPS"
          ? getAdhocRegionsPayload()
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
      const department = await getEntityPayload("department", departmentName, q.period, q.date);
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
