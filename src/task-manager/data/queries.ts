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
  formatLocalDate,
  isElevatedDeptSite,
  parseLocalDate,
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

/** Sidebar count badges (2026-07-29, ClickUp-reference): the viewer's OWN
 *  not-yet-completed task counts — Pending/Active/Overdue/Escalated only;
 *  DONE and SKIPPED (N/A) are excluded, per the confirmed rule.
 *  - `weekdays`: per day of the DAILY anchor's Mon–Sun week, keyed
 *    YYYY-MM-DD (the WeekdaySidebar's per-day badges);
 *  - `months`: per month (1..12) of the MONTHLY anchor's year (the
 *    MonthSidebar's per-month badges — stepping the year re-fetches);
 *  - `monthChunks`: the anchor MONTH's 7-day chunks, keyed "from-to" (the
 *    expanded accordion sub-items' badges).
 *  Blocks with no dueAt fall back to startedAt for day/month keying, the
 *  same dueAt-else-startedAt rule the windows use. */
export function getMySidebarCounts(
  email: string,
  dailyDate?: string,
  monthlyDate?: string,
): Promise<{
  weekdays: Record<string, number>;
  months: Record<number, number>;
  monthChunks: Record<string, number>;
}> {
  return native(async () => {
    const user = await requireUserByEmail(email);

    const dailyAnchor = dailyDate ? parseLocalDate(dailyDate) : new Date();
    const monday = new Date(
      dailyAnchor.getFullYear(),
      dailyAnchor.getMonth(),
      dailyAnchor.getDate() - ((dailyAnchor.getDay() + 6) % 7),
    );
    const weekWindow = {
      start: monday,
      end: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7),
      period: "daily" as const,
    };

    const monthlyAnchor = monthlyDate ? parseLocalDate(monthlyDate) : new Date();
    const year = monthlyAnchor.getFullYear();
    const yearWindow = {
      start: new Date(year, 0, 1),
      end: new Date(year + 1, 0, 1),
      period: "monthly" as const,
    };

    const [weekBlocks, yearBlocks] = await Promise.all([
      fetchPeriodBlocks(weekWindow, { assigneeId: user.id, strictWindow: true }),
      fetchPeriodBlocks(yearWindow, { assigneeId: user.id, strictWindow: true }),
    ]);
    const isOpen = (b: { status: string }) => b.status !== "DONE" && b.status !== "SKIPPED";
    const keyDate = (b: { dueAt: Date | null; startedAt: Date | null }) => b.dueAt ?? b.startedAt;

    const weekdays: Record<string, number> = {};
    for (const b of weekBlocks) {
      if (!isOpen(b)) continue;
      const kd = keyDate(b);
      if (!kd) continue;
      const k = formatLocalDate(kd);
      weekdays[k] = (weekdays[k] ?? 0) + 1;
    }

    const months: Record<number, number> = {};
    const monthChunks: Record<string, number> = {};
    const anchorMonth = monthlyAnchor.getMonth();
    const daysInAnchorMonth = new Date(year, anchorMonth + 1, 0).getDate();
    for (const b of yearBlocks) {
      if (!isOpen(b)) continue;
      const d = keyDate(b);
      if (!d) continue;
      const m = d.getMonth() + 1;
      months[m] = (months[m] ?? 0) + 1;
      if (d.getMonth() === anchorMonth) {
        // FOUR chunks (2026-07-30 confirmation): 1-7 · 8-14 · 15-21 ·
        // 22-{last day} — keys must match monthDayChunks() in the UI.
        let from = Math.floor((d.getDate() - 1) / 7) * 7 + 1;
        if (from > 22) from = 22;
        const to = from === 22 ? daysInAnchorMonth : from + 6;
        const k = `${from}-${to}`;
        monthChunks[k] = (monthChunks[k] ?? 0) + 1;
      }
    }

    return { weekdays, months, monthChunks };
  }, "getMySidebarCounts");
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

/** Just the caller's own Task Manager domain role (User.role) — a light
 *  alternative to getFlowDetail/getFlowOverview for callers that only need
 *  the role, e.g. deciding whether to hide the Cadence picker for a CEO
 *  (mirrors /task-manager/page.tsx's `role === "CEO"` check, without
 *  fetching that page's full daily payload). Deliberately NOT the OSC
 *  portal session's own role field — a different identity system. */
export function getMyRole(email: string): Promise<{ role: string }> {
  return native(async () => {
    const user = await requireUserByEmail(email);
    return { role: user.role };
  }, "getMyRole");
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
