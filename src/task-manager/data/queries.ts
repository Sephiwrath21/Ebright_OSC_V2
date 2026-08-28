// Read queries: personal overview, role-scoped detail, staff directory,
// single-department detail. Ports of the corresponding /api/internal routes.
import { z } from "zod";
import type {
  FlowBranchDetailResponse,
  FlowDepartmentDetailResponse,
  FlowDetailResponse,
  FlowEntityRollup,
  FlowOverviewResponse,
  FlowPeriod,
  FlowStaffMember,
  NoClaimIncentivePayload,
} from "../ui/types";
import { ApiHttpError } from "../lib/api-server";
import { prisma } from "../prisma";
import { prisma as hrfsPrisma } from "@/lib/prisma";
import type { EmployeeScope } from "@/lib/employeeScope";
import { FINANCE_EMAIL } from "../role-views";
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
  getEntityAdhocAssignedPayload,
  getEntityCeoAssignedPayload,
  getEntityHodAssignedPayload,
  getEntityPayload,
  getMePayload,
  getNoClaimIncentivePayload,
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
  opts?: {
    strictWindow?: boolean;
    /** Clamp a MONTHLY window to these days of the anchor month (e.g.
     *  {from:1,to:7}) — same option getFlowDetail already exposes,
     *  threaded through here too for Home's "My Month" tab fetches
     *  (2026-08-15). Ignored when period is "daily". Has no filtering
     *  effect on cadence-tagged blocks unless `strictWindow: true` is
     *  also set — see `fetchPeriodBlocks`. */
    monthDays?: { from: number; to: number };
  },
): Promise<FlowOverviewResponse> {
  return native(async () => {
    const q = analyticsQuerySchema.parse({ period, ...(date ? { date } : {}) });
    const user = await requireUserByEmail(email);
    const payload = await getMePayload(user, q.period, q.date, {
      strictWindow: opts?.strictWindow,
      monthDays: opts?.monthDays,
    });
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

/** Org-wide department rollups clamped to a specific Monthly day-range
 *  (2026-08-22) — a lighter alternative to getFlowDetail for "All
 *  Departments" Monthly's "default to today's day-range chunk, not Full
 *  month" behavior (page.tsx): the page's own top-level
 *  getFlowDetail("monthly", ...) call already covers the unclamped (Full
 *  month) and the explicitly-?mrange=-clamped cases; this is only called
 *  for the one remaining case — no ?mrange= in the URL, but the dropdown
 *  should still default to showing today's chunk — where the shared
 *  fetch's own data (Full month) wouldn't match what the dropdown
 *  defaults to. Same auth/role gate as getFlowDetail's own org branch
 *  (canViewOrg/isElevatedDeptSite), just returning ONLY the department
 *  rollups instead of the whole payload (org/adhoc/adhocByRegion/me). */
export function getOrgMonthlyDepartments(
  email: string,
  date: string | undefined,
  monthDays: { from: number; to: number },
): Promise<FlowEntityRollup[]> {
  return native(async () => {
    await advanceRecurringBlocks();
    const user = await requireUserByEmail(email);
    if (!canViewOrg(user.role) && !isElevatedDeptSite(user)) {
      throw new ApiHttpError(403, "You can only view your own department");
    }
    const org = await getOrgPayload("monthly", date, monthDays);
    // Same internal-to-public-shape cast getFlowDetail's own org branch
    // relies on (EntityCountsDetailed → FlowEntityRollup, structurally
    // compatible but not nominally the same type).
    return org.departments as unknown as FlowEntityRollup[];
  }, "getOrgMonthlyDepartments");
}

/** Org-wide REGION-grouped branch rollups clamped to a specific Monthly
 *  day-range (2026-08-25) — the same purpose as getOrgMonthlyDepartments
 *  above, but built on org.regions rather than org.branches. org.branches
 *  is task-derived only (groupByDimension with no roster-first fill,
 *  unlike org.departments' withAllDepartments wrapper) — a branch with
 *  zero tasks that day is silently ABSENT from it rather than zero-filled,
 *  confirmed live: with zero branch-assigned tasks today, org.branches
 *  returned 0 entries entirely while org.regions (built via
 *  groupBranchesByRegion, analytics/_lib.ts — a real roster query,
 *  zero-filling every FLOW_BRANCH_REGIONS branch regardless of task data)
 *  correctly listed all 27. "All Regions"/"All Region X" (page.tsx) both
 *  need real branches even when empty, so this — not
 *  org.branches-flavored getOrgMonthlyDepartments' sibling — is the right
 *  source. Region branches carry bucket totals only, no `tasks` drill-down
 *  list (EntityCounts, not EntityCountsDetailed) — click-to-drill is
 *  unavailable on these cards, an accepted trade-off for correct
 *  zero-filled data. */
export function getOrgMonthlyRegions(
  email: string,
  date: string | undefined,
  monthDays: { from: number; to: number },
): Promise<{ name: string; branches: FlowEntityRollup[] }[]> {
  return native(async () => {
    await advanceRecurringBlocks();
    const user = await requireUserByEmail(email);
    if (!canViewOrg(user.role) && !isElevatedDeptSite(user)) {
      throw new ApiHttpError(403, "You can only view your own branch");
    }
    const org = await getOrgPayload("monthly", date, monthDays);
    return org.regions as unknown as { name: string; branches: FlowEntityRollup[] }[];
  }, "getOrgMonthlyRegions");
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

/** Just the caller's own Task Manager domain role (+ department + email) —
 *  a light alternative to getFlowDetail/getFlowOverview for callers that
 *  only need the role, e.g. deciding whether to hide the Cadence picker
 *  for a CEO (mirrors /task-manager/page.tsx's `role === "CEO"` check,
 *  without fetching that page's full daily payload). Deliberately NOT the
 *  OSC portal session's own role field — a different identity system.
 *  `department` (2026-08-07, RBAC plan) and `email` (2026-08-22, for
 *  EXTRA_TEMPLATE_GROUP_EDITOR_EMAILS) travel alongside `role` because
 *  `canManageTaskTemplateGroups`/`taskManagerNavAccess` (see role-views.ts)
 *  need all three together — used by template/page.tsx, package/page.tsx,
 *  and package-table/page.tsx to compute their `canEdit`/view-access
 *  checks. */
export function getMyRole(email: string): Promise<{ role: string; department: string | null; email: string }> {
  return native(async () => {
    const user = await requireUserByEmail(email);
    return { role: user.role, department: user.department, email: user.email };
  }, "getMyRole");
}

const departmentQuerySchema = analyticsQuerySchema.extend({
  department: z.string().min(1).max(200),
});

/** Full detail for ONE department by name (org roles any; HOD/DEPT_SITE own
 *  only; MEMBER additionally sees own department's Daily only (see
 *  ownDailyView below)). monthDays (2026-08-21): the Monthly 7-day range
 *  dropdown's clamp, same optional param getFlowDetail already threads into
 *  getEntityPayload for HOD/DEPT_SITE/BRANCH's own Department/Branch
 *  Overview — this function is the SEPARATE path the admin/OPS/elevated-
 *  dept-site "entityDropdowns" drill-down uses instead (page.tsx), which had
 *  no range support at all until now; ignored for period "daily". */
export function getDepartmentDetail(
  email: string,
  department: string,
  period: FlowPeriod,
  date?: string,
  monthDays?: { from: number; to: number },
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
    const payload = await getEntityPayload(
      "department",
      q.department,
      q.period,
      q.date,
      q.period === "monthly" ? monthDays : undefined,
    );
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
 *  below)). monthDays (2026-08-21) — same as getDepartmentDetail's own
 *  param, see its doc comment. */
export function getBranchDetail(
  email: string,
  branch: string,
  period: FlowPeriod,
  date?: string,
  monthDays?: { from: number; to: number },
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
    const payload = await getEntityPayload(
      "branch",
      q.branch,
      q.period,
      q.date,
      q.period === "monthly" ? monthDays : undefined,
    );
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

/** "Ad hoc" section for Branch Overview (2026-08-18, Branch Manager's own
 *  Task Manager page only) — all-time, no period/date param, same
 *  auth/shape convention as getBranchHodAssigned/getBranchCeoAssigned
 *  above. */
export function getBranchAdhocAssigned(
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
    const payload = await getEntityAdhocAssignedPayload(q.branch);
    return { branch: { name: q.branch, ...payload } };
  }, "getBranchAdhocAssigned");
}

/** "No Claim/Incentive" list (2026-08-18): a company-wide compliance check
 *  before approving a claim/incentive payment — see NoClaimIncentivePayload's
 *  own doc comment (ui/types.ts). Scoped to exactly two identities per the
 *  confirmed design: the CEO role, and the single Finance department login
 *  (FINANCE_EMAIL) — deliberately narrower than canViewOrg (which would also
 *  admit ADMIN/OPS, not requested here). */
export function getNoClaimIncentiveList(email: string, month?: string): Promise<NoClaimIncentivePayload> {
  return native(async () => {
    const user = await requireUserByEmail(email);
    const canView = user.role === "CEO" || email.toLowerCase() === FINANCE_EMAIL;
    if (!canView) {
      throw new ApiHttpError(403, "Not authorized to view this list");
    }
    return getNoClaimIncentivePayload(month);
  }, "getNoClaimIncentiveList");
}

// Task Manager's own per-user department/branch strings occasionally differ
// from hrfs's (2026-08-26, checked exhaustively against live data): every
// other name matches exactly. "Puncak Jalil" (a real Task Manager branch
// value) has no hrfs branch at all — deliberately left unmapped below, so it
// only ever surfaces to full-access viewers (see getScopedNoClaimIncentiveList)
// rather than silently attributing it to the wrong branch-scoped viewer.
const DEPARTMENT_NAME_TO_TASK_MANAGER: Record<string, string> = {
  Operation: "Operations",
};
const BRANCH_NAME_TO_TASK_MANAGER: Record<string, string> = {
  Rimbayu: "Bandar Rimbayu",
  "Kajang TTDI Grove": "Kajang TTDI Groove",
};

/** hrfs's department/branch tables only carry the code on EmployeeScope —
 *  resolve the matching Task Manager group *name* via the display name plus
 *  the reconciliation maps above. null when the scope has neither (ownUserId
 *  or a fully-empty scope) or its department/branch code doesn't resolve. */
async function resolveTaskManagerGroupName(scope: EmployeeScope): Promise<string | null> {
  if (scope.departmentCode) {
    const dept = await hrfsPrisma.department.findUnique({
      where: { department_code: scope.departmentCode },
      select: { department_name: true },
    });
    if (!dept) return null;
    return DEPARTMENT_NAME_TO_TASK_MANAGER[dept.department_name] ?? dept.department_name;
  }
  if (scope.branchCode) {
    const branch = await hrfsPrisma.branch.findUnique({
      where: { branch_code: scope.branchCode },
      select: { branch_name: true },
    });
    if (!branch) return null;
    return BRANCH_NAME_TO_TASK_MANAGER[branch.branch_name] ?? branch.branch_name;
  }
  return null;
}

/** /employee-folder's "Not Clicked Task" card + modal (2026-08-26, see
 *  conversation) — same underlying data as getNoClaimIncentiveList above
 *  (getNoClaimIncentivePayload, including its run.status !== "CANCELLED"
 *  filter), but gated by the general hrfs access-scope concept
 *  (src/lib/employeeScope.ts) instead of this file's CEO/Finance-only check:
 *  fullAccess sees every department/branch group unchanged; anyone else sees
 *  only the one group matching their own department/branch (empty payload if
 *  it can't be resolved — e.g. ownUserId scope, or a code with no matching
 *  Task Manager group at all). Deliberately does NOT call requireUserByEmail/
 *  the CEO-or-FINANCE_EMAIL check above — the caller
 *  (src/app/employee-folder/page.tsx) has already authenticated the session
 *  and resolved its own scope. `date` filters to that single DAY (2026-08-26,
 *  see conversation — this card navigates day-by-day, defaulting to today,
 *  unlike the original menu's month-by-month picker), not a whole month. */
export async function getScopedNoClaimIncentiveList(
  scope: EmployeeScope,
  date?: string,
): Promise<NoClaimIncentivePayload> {
  return native(async () => {
    const payload = await getNoClaimIncentivePayload(date, "daily");
    if (scope.fullAccess) return payload;

    const groupName = await resolveTaskManagerGroupName(scope);
    if (!groupName) return { departments: [], branches: [] };
    return {
      departments: payload.departments.filter((g) => g.name === groupName),
      branches: payload.branches.filter((g) => g.name === groupName),
    };
  }, "getScopedNoClaimIncentiveList");
}
