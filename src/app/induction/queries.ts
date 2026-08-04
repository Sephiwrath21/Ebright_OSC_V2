import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { titleCaseName } from "@/lib/text";

// Fall back to an empty result when a Prisma cache table is missing (P2021).
// The EBR-synced caches (mc_record, annual_leave_record) are auxiliary — when
// the table hasn't been created yet (`prisma db push` not run), the dashboard
// should still render with local data instead of crashing.
async function fetchOptionalCache<T>(
  label: string,
  fn: () => Promise<T[]>,
): Promise<T[]> {
  try {
    return await fn();
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2021"
    ) {
      console.warn(
        `[induction] ${label} cache table not found — run \`prisma db push\` to create it`,
      );
      return [];
    }
    throw e;
  }
}

export interface InductionEmployeeOption {
  userId: number;
  email: string;
  fullName: string;
  departmentName: string | null;
  position: string | null;
}

/**
 * Active employees usable as the induction subject or as a buddy.
 * Limited to staff/admin/ceo roles to avoid noisy superadmin entries.
 */
export async function listInductionEligibleEmployees(): Promise<InductionEmployeeOption[]> {
  const rows = await prisma.users.findMany({
    where: {
      status: "active",
      role: { role_type: { in: ["staff", "admin", "ceo", "hr"] } },
    },
    include: {
      user_profile: { select: { full_name: true } },
      employment: {
        where: { status: "active" },
        include: { department: true },
        orderBy: { start_date: "desc" },
        take: 1,
      },
    },
    orderBy: { email: "asc" },
  });

  return rows.map((u) => {
    const emp = u.employment[0];
    return {
      userId: u.user_id,
      email: u.email,
      fullName: titleCaseName(u.user_profile?.full_name) || u.email,
      departmentName: emp?.department?.department_name ?? null,
      position: emp?.position ?? null,
    };
  });
}

export interface PendingInductionRow {
  id: number;
  userId: number;
  employeeName: string;
  employeeEmail: string;
  inductionType: string;
  workflowTemplate: string;
  status: string;
  startDate: string;
  exitDate: string | null;
  linkToken: string;
  linkExpiresAt: string;
  createdAt: string;
  buddyName: string | null;
  totalSteps: number;
  completedSteps: number;
  /**
   * True when the induction's timeline has elapsed (start_date is more than
   * INDUCTION_ARCHIVE_DAYS in the past). The Control Centre splits these
   * into a separate Archive section so the active list stays focused on
   * inductions still within their window.
   */
  isArchived: boolean;
}

// 3-day workflow + 2-day grace. Past this, the induction is considered
// stale and moves to the Control Centre's Archive section.
const INDUCTION_ARCHIVE_DAYS = 5;

// ============ Substep templates ============
// Department / branch-defined sub-tasks attached to placeholder parent steps
// (Department Training, 3-Week Branch Training). One row per sub-task per
// template_key+parent_step_number. Shared across every inductee on the
// matching workflow template.

export type SubstepEvidenceType =
  | "photo"
  | "video"
  | "screenshot"
  | "document"
  | "text"
  | "none";

export interface SubstepTemplateView {
  id: number;
  templateKey: string;
  parentStepNumber: number;
  /** NULL = legacy/global; otherwise the department this sub-task is for. */
  departmentId: number | null;
  title: string;
  description: string | null;
  evidenceType: SubstepEvidenceType;
  createdAt: string;
}

export interface DepartmentOption {
  id: number;
  name: string;
}

export async function listDepartments(): Promise<DepartmentOption[]> {
  const rows = await prisma.department.findMany({
    select: { department_id: true, department_name: true },
    orderBy: { department_name: "asc" },
  });
  return rows.map((r) => ({ id: r.department_id, name: r.department_name }));
}

export async function listAllSubstepTemplates(): Promise<SubstepTemplateView[]> {
  const rows = await prisma.induction_substep_template.findMany({
    orderBy: [
      { template_key: "asc" },
      { parent_step_number: "asc" },
      { id: "asc" },
    ],
  });
  return rows.map((r) => ({
    id: r.id,
    templateKey: r.template_key,
    parentStepNumber: r.parent_step_number,
    departmentId: r.department_id ?? null,
    title: r.title,
    description: r.description,
    evidenceType: (r.evidence_type as SubstepEvidenceType) ?? "photo",
    createdAt: r.created_at.toISOString(),
  }));
}

/**
 * Convenience helper: given the full substep list and the active template
 * key, return a map keyed by parent step number. UI components pass this
 * map directly to OnboardingWorkflow.
 */
export function groupSubstepsByParent(
  rows: SubstepTemplateView[],
  templateKey: string,
): Record<number, SubstepTemplateView[]> {
  const out: Record<number, SubstepTemplateView[]> = {};
  for (const r of rows) {
    if (r.templateKey !== templateKey) continue;
    if (!out[r.parentStepNumber]) out[r.parentStepNumber] = [];
    out[r.parentStepNumber].push(r);
  }
  return out;
}

export async function listAllInductionProfiles(): Promise<PendingInductionRow[]> {
  const rows = await prisma.induction_profile.findMany({
    include: {
      user: { include: { user_profile: { select: { full_name: true } } } },
      buddy: { include: { user_profile: { select: { full_name: true } } } },
      steps: { select: { status: true } },
    },
    orderBy: { created_at: "desc" },
  });

  const today = startOfTodayUtc();
  const archiveCutoff = addDaysUtc(today, -INDUCTION_ARCHIVE_DAYS);

  return rows.map((p) => {
    const completed = p.steps.filter((s) => s.status === "Completed").length;
    return {
      id: p.id,
      userId: p.user_id,
      employeeName: titleCaseName(p.user.user_profile?.full_name) || p.user.email,
      employeeEmail: p.user.email,
      inductionType: p.induction_type,
      workflowTemplate: p.workflow_template,
      status: p.status,
      startDate: p.start_date.toISOString().slice(0, 10),
      exitDate: p.exit_date ? p.exit_date.toISOString().slice(0, 10) : null,
      linkToken: p.link_token,
      linkExpiresAt: p.link_expires_at.toISOString(),
      createdAt: p.created_at.toISOString(),
      buddyName: p.buddy?.user_profile?.full_name
        ? titleCaseName(p.buddy.user_profile.full_name)
        : p.buddy?.email ?? null,
      totalSteps: p.steps.length,
      completedSteps: completed,
      isArchived: p.start_date.getTime() < archiveCutoff.getTime(),
    };
  });
}

export interface InductionStepView {
  id: number;
  stepNumber: number;
  title: string;
  description: string | null;
  responsibleName: string | null;
  responsibleEmail: string | null;
  dueDate: string;
  status: "Pending" | "In Progress" | "Completed";
  completedAt: string | null;
  evidenceFileId: string | null;
  evidenceUploadedAt: string | null;
}

export interface InductionView {
  id: number;
  userId: number;
  employeeName: string;
  employeeEmail: string;
  departmentId: number | null;
  departmentName: string | null;
  inductionType: string;
  workflowTemplate: string;
  startDate: string;
  exitDate: string | null;
  /** HR-assigned induction duration in days. Null = use template default. */
  targetDurationDays: number | null;
  linkToken: string;
  linkExpiresAt: string;
  status: string;
  buddyName: string | null;
  buddyEmail: string | null;
  steps: InductionStepView[];
}

export interface UpcomingHireRow {
  userId: number;
  email: string;
  fullName: string;
  position: string | null;
  departmentName: string | null;
  startDate: string;
  daysUntilStart: number;
  isWithin7Days: boolean;
  hasPendingRequest: boolean;
  inductionProfileStatus: string | null;
}

export interface UpcomingExitRow {
  userId: number;
  email: string;
  fullName: string;
  position: string | null;
  departmentName: string | null;
  endDate: string;
  daysUntilEnd: number;
  isWithin7Days: boolean;
  hasPendingRequest: boolean;
  inductionProfileStatus: string | null;
}

export interface PendingInductionRequestRow {
  id: number;
  userId: number;
  fullName: string;
  email: string;
  departmentName: string | null;
  position: string | null;
  startDate: string | null;
  endDate: string | null;
  triggeredByName: string;
  triggeredAt: string;
  status: string;
}

function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// "Today" in Malaysian local time, returned as a UTC-midnight Date.
// Use this for filtering leave_request / annual_leave_record dates — those
// columns are stored via normalizeMytDate(+8h then UTC-midnight), so the
// stored Date represents the MYT calendar day. If we compared against UTC
// today instead, AL entries dated "today MYT" would be dropped whenever the
// dashboard loads while UTC is still on the previous calendar day (between
// MYT 00:00 and MYT 08:00).
function startOfTodayMyt(): Date {
  const now = new Date();
  const myt = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  myt.setUTCHours(0, 0, 0, 0);
  return myt;
}

function addDaysUtc(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function diffInDaysUtc(a: Date, b: Date): number {
  const ms = a.getTime() - b.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

// Format a Date column (Postgres `date`) as YYYY-MM-DD in Asia/Kuala_Lumpur.
// Needed because pg returns `date` columns as JS Date objects shifted by the
// server's session timezone — `.toISOString().slice(0,10)` then renders the
// previous day's UTC date instead of the actual MYT date stored in the DB.
function formatDateMYT(d: Date): string {
  const myt = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return myt.toISOString().slice(0, 10);
}

// Dedup key for cross-source merging (local employment ↔ ebrightleads
// onboarding_candidate). The candidate cache has no email or employee code
// so we fall back to a fuzzy-ish name-plus-date match: lowercase, strip
// punctuation/whitespace. Different *spellings* of the same name (e.g.
// "Mohamd" vs "Mohamad") still won't dedup — those need fixing in the source.
function nameDateKey(name: string, dateStr: string): string {
  const norm = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `${norm}|${dateStr}`;
}

export async function getUpcomingHires(
  daysAhead: number = 180,
  daysBack: number = 0,
): Promise<UpcomingHireRow[]> {
  const today = startOfTodayUtc();
  const horizon = addDaysUtc(today, daysAhead);
  const backstop = addDaysUtc(today, -daysBack);

  const rows = await prisma.employment.findMany({
    where: {
      status: { in: ["active", "onboarding"] },
      start_date: { gte: backstop, lte: horizon },
    },
    include: {
      users: {
        include: {
          user_profile: { select: { full_name: true } },
          induction_profile: { select: { status: true } },
          induction_request_user: {
            where: { status: "pending" },
            select: { id: true },
          },
        },
      },
      department: true,
    },
    orderBy: { start_date: "asc" },
  });

  return rows
    .filter((r) => r.start_date !== null)
    .map((r) => {
      const startDate = r.start_date as Date;
      const days = diffInDaysUtc(startDate, today);
      return {
        userId: r.user_id,
        email: r.users.email,
        fullName: titleCaseName(r.users.user_profile?.full_name) || r.users.email,
        position: r.position,
        departmentName: r.department?.department_name ?? null,
        startDate: startDate.toISOString().slice(0, 10),
        daysUntilStart: days,
        isWithin7Days: days <= 7,
        hasPendingRequest: !!r.users.induction_request_user,
        inductionProfileStatus: r.users.induction_profile?.status ?? null,
      };
    });
}

export async function getUpcomingExits(
  daysAhead: number = 60,
  daysBack: number = 0,
): Promise<UpcomingExitRow[]> {
  const today = startOfTodayUtc();
  const horizon = addDaysUtc(today, daysAhead);
  const backstop = addDaysUtc(today, -daysBack);

  const rows = await prisma.employment.findMany({
    where: {
      status: { in: ["active", "offboarding"] },
      end_date: { gte: backstop, lte: horizon },
    },
    include: {
      users: {
        include: {
          user_profile: { select: { full_name: true } },
          induction_profile: { select: { status: true } },
          induction_request_user: {
            where: { status: "pending" },
            select: { id: true },
          },
        },
      },
      department: true,
    },
    orderBy: { end_date: "asc" },
  });

  return rows
    .filter((r) => r.end_date !== null)
    .map((r) => {
      const endDate = r.end_date as Date;
      const days = diffInDaysUtc(endDate, today);
      return {
        userId: r.user_id,
        email: r.users.email,
        fullName: titleCaseName(r.users.user_profile?.full_name) || r.users.email,
        position: r.position,
        departmentName: r.department?.department_name ?? null,
        endDate: endDate.toISOString().slice(0, 10),
        daysUntilEnd: days,
        isWithin7Days: days <= 7,
        hasPendingRequest: !!r.users.induction_request_user,
        inductionProfileStatus: r.users.induction_profile?.status ?? null,
      };
    });
}

export interface LeaveOnDateRow {
  leaveId: number;
  userId: number;
  fullName: string;
  email: string;
  leaveTypeCode: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
}

export async function getLeavesActiveToday(typeCode: string): Promise<LeaveOnDateRow[]> {
  const today = startOfTodayUtc();

  const rows = await prisma.leave_request.findMany({
    where: {
      status: "approved",
      start_date: { lte: today },
      end_date: { gte: today },
      leave_types: { leave_type_code: typeCode },
    },
    include: {
      users_leave_request_user_idTousers: {
        include: { user_profile: { select: { full_name: true } } },
      },
      leave_types: true,
    },
    orderBy: { start_date: "asc" },
  });

  return rows.map((r) => {
    const user = r.users_leave_request_user_idTousers;
    return {
      leaveId: r.leave_id,
      userId: r.user_id,
      fullName: titleCaseName(user.user_profile?.full_name) || user.email,
      email: user.email,
      leaveTypeCode: r.leave_types.leave_type_code,
      leaveTypeName: r.leave_types.name,
      startDate: r.start_date.toISOString().slice(0, 10),
      endDate: r.end_date.toISOString().slice(0, 10),
    };
  });
}

export async function listPendingInductionRequests(): Promise<PendingInductionRequestRow[]> {
  const rows = await prisma.induction_request.findMany({
    where: { status: "pending" },
    include: {
      user: {
        include: {
          user_profile: { select: { full_name: true } },
          employment: {
            where: { status: "active" },
            include: { department: true },
            orderBy: { start_date: "desc" },
            take: 1,
          },
        },
      },
      triggered_by: {
        include: { user_profile: { select: { full_name: true } } },
      },
    },
    orderBy: { triggered_at: "desc" },
  });

  return rows.map((r) => {
    const emp = r.user.employment[0];
    return {
      id: r.id,
      userId: r.user_id,
      fullName: titleCaseName(r.user.user_profile?.full_name) || r.user.email,
      email: r.user.email,
      departmentName: emp?.department?.department_name ?? null,
      position: emp?.position ?? null,
      startDate: emp?.start_date ? emp.start_date.toISOString().slice(0, 10) : null,
      endDate: emp?.end_date ? emp.end_date.toISOString().slice(0, 10) : null,
      triggeredByName:
        titleCaseName(r.triggered_by.user_profile?.full_name) || r.triggered_by.email,
      triggeredAt: r.triggered_at.toISOString(),
      status: r.status,
    };
  });
}

export type GetInductionByTokenResult =
  | { ok: true; profile: InductionView }
  | { ok: false; error: "not_found" | "expired" };

export async function getOwnInductionView(userId: number): Promise<InductionView | null> {
  if (!Number.isFinite(userId) || userId <= 0) return null;

  const profile = await prisma.induction_profile.findUnique({
    where: { user_id: userId },
    include: {
      user: {
        include: {
          user_profile: { select: { full_name: true } },
          employment: {
            where: { status: "active" },
            include: { department: true },
            orderBy: { start_date: "desc" },
            take: 1,
          },
        },
      },
      buddy: { include: { user_profile: { select: { full_name: true } } } },
      steps: {
        include: {
          responsible_person: {
            select: { email: true, user_profile: { select: { full_name: true } } },
          },
        },
        orderBy: { step_number: "asc" },
      },
    },
  });

  if (!profile) return null;

  const department = profile.user.employment[0]?.department?.department_name ?? null;
  const departmentId = profile.user.employment[0]?.department?.department_id ?? null;

  return {
    id: profile.id,
    userId: profile.user_id,
    employeeName:
      titleCaseName(profile.user.user_profile?.full_name) || profile.user.email,
    employeeEmail: profile.user.email,
    departmentId,
    departmentName: department,
    inductionType: profile.induction_type,
    workflowTemplate: profile.workflow_template,
    startDate: profile.start_date.toISOString().slice(0, 10),
    exitDate: profile.exit_date ? profile.exit_date.toISOString().slice(0, 10) : null,
    targetDurationDays: profile.target_duration_days ?? null,
    linkToken: profile.link_token,
    linkExpiresAt: profile.link_expires_at.toISOString(),
    status: profile.status,
    buddyName: profile.buddy?.user_profile?.full_name
      ? titleCaseName(profile.buddy.user_profile.full_name)
      : profile.buddy?.email ?? null,
    buddyEmail: profile.buddy?.email ?? null,
    steps: profile.steps.map((s) => ({
      id: s.id,
      stepNumber: s.step_number,
      title: s.title,
      description: s.description,
      responsibleName: s.responsible_person?.user_profile?.full_name
        ? titleCaseName(s.responsible_person.user_profile.full_name)
        : s.responsible_person?.email ?? null,
      responsibleEmail: s.responsible_person?.email ?? null,
      dueDate: s.due_date.toISOString().slice(0, 10),
      status: (s.status as InductionStepView["status"]) ?? "Pending",
      completedAt: s.completed_at ? s.completed_at.toISOString() : null,
      evidenceFileId: s.evidence_file_id ?? null,
      evidenceUploadedAt: s.evidence_uploaded_at ? s.evidence_uploaded_at.toISOString() : null,
    })),
  };
}

// ============ Combined hires/exits (local employment + ebrightleads candidates) ============

export interface CombinedHireRow {
  source: "local" | "ebrightleads";
  key: string;
  userId: number | null;
  email: string | null;
  fullName: string;
  position: string | null;
  departmentName: string | null;
  startDate: string;
  daysUntilStart: number;
  isWithin7Days: boolean;
  hasPendingRequest: boolean;
  inductionProfileStatus: string | null;
}

export interface CombinedExitRow {
  source: "local" | "ebrightleads";
  key: string;
  userId: number | null;
  email: string | null;
  fullName: string;
  position: string | null;
  departmentName: string | null;
  endDate: string;
  daysUntilEnd: number;
  isWithin7Days: boolean;
  hasPendingRequest: boolean;
  inductionProfileStatus: string | null;
}

export async function getCombinedUpcomingHires(
  daysAhead: number = 180,
  daysBack: number = 0,
): Promise<CombinedHireRow[]> {
  const today = startOfTodayUtc();
  const horizon = addDaysUtc(today, daysAhead);
  const backstop = addDaysUtc(today, -daysBack);

  const [local, candidates] = await Promise.all([
    getUpcomingHires(daysAhead, daysBack),
    prisma.onboarding_candidate.findMany({
      where: { start_date: { gte: backstop, lte: horizon } },
      orderBy: { start_date: "asc" },
    }),
  ]);

  const localRows: CombinedHireRow[] = local
    // Completed inductions are archived to the Control Centre only — drop them
    // from the active onboarding/HR dashboards so they don't crowd the list.
    .filter((h) => h.inductionProfileStatus !== "Completed")
    .map((h) => ({
      source: "local",
      key: `local-${h.userId}`,
      userId: h.userId,
      email: h.email,
      fullName: h.fullName,
      position: h.position,
      departmentName: h.departmentName,
      startDate: h.startDate,
      daysUntilStart: h.daysUntilStart,
      isWithin7Days: h.isWithin7Days,
      hasPendingRequest: h.hasPendingRequest,
      inductionProfileStatus: h.inductionProfileStatus,
    }));

  const localKeys = new Set(
    localRows.map((r) => nameDateKey(r.fullName, r.startDate)),
  );

  const candRows: CombinedHireRow[] = candidates
    .map((c) => {
      const fullName = titleCaseName(c.name) || c.name;
      const startDate = formatDateMYT(c.start_date);
      return {
        source: "ebrightleads" as const,
        // Key uses source_id (the original ebrightleads ID) — matches the
        // lookup column used by createInductionRequestForEbrightCandidate.
        key: `ebr-${c.source_id}`,
        userId: null,
        email: null,
        fullName,
        position: c.position,
        departmentName: c.department_branch,
        startDate,
        daysUntilStart: diffInDaysUtc(c.start_date, today),
        isWithin7Days: diffInDaysUtc(c.start_date, today) <= 7,
        hasPendingRequest: false,
        inductionProfileStatus: null,
      };
    })
    // Drop candidates whose normalized name + start date already came from
    // the local employment table — local rows are richer (they have email,
    // userId, induction status) so they win.
    .filter((c) => !localKeys.has(nameDateKey(c.fullName, c.startDate)));

  return [...localRows, ...candRows].sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  );
}

export async function getCombinedUpcomingExits(
  daysAhead: number = 60,
  daysBack: number = 0,
): Promise<CombinedExitRow[]> {
  const today = startOfTodayUtc();
  const horizon = addDaysUtc(today, daysAhead);
  const backstop = addDaysUtc(today, -daysBack);

  const [local, candidates] = await Promise.all([
    getUpcomingExits(daysAhead, daysBack),
    prisma.onboarding_candidate.findMany({
      where: { end_date: { gte: backstop, lte: horizon } },
      orderBy: { end_date: "asc" },
    }),
  ]);

  const localRows: CombinedExitRow[] = local
    // Completed offboardings are archived to Control Centre only.
    .filter((e) => e.inductionProfileStatus !== "Completed")
    .map((e) => ({
      source: "local",
      key: `local-${e.userId}`,
      userId: e.userId,
      email: e.email,
      fullName: e.fullName,
      position: e.position,
      departmentName: e.departmentName,
      endDate: e.endDate,
      daysUntilEnd: e.daysUntilEnd,
      isWithin7Days: e.isWithin7Days,
      hasPendingRequest: e.hasPendingRequest,
      inductionProfileStatus: e.inductionProfileStatus,
    }));

  const localKeys = new Set(
    localRows.map((r) => nameDateKey(r.fullName, r.endDate)),
  );

  const candRows: CombinedExitRow[] = candidates
    .filter((c) => c.end_date !== null)
    .map((c) => {
      const endDate = c.end_date as Date;
      const fullName = titleCaseName(c.name) || c.name;
      const endDateStr = formatDateMYT(endDate);
      return {
        source: "ebrightleads" as const,
        // Key uses source_id (the original ebrightleads ID) — matches the
        // lookup column used by createInductionRequestForEbrightCandidate.
        key: `ebr-${c.source_id}`,
        userId: null,
        email: null,
        fullName,
        position: c.position,
        departmentName: c.department_branch,
        endDate: endDateStr,
        daysUntilEnd: diffInDaysUtc(endDate, today),
        isWithin7Days: diffInDaysUtc(endDate, today) <= 7,
        hasPendingRequest: false,
        inductionProfileStatus: null,
      };
    })
    // Drop candidates whose normalized name + end date already came from
    // the local employment table — local rows win because they have richer
    // attributes (email, userId, induction status).
    .filter((c) => !localKeys.has(nameDateKey(c.fullName, c.endDate)));

  return [...localRows, ...candRows].sort((a, b) =>
    a.endDate.localeCompare(b.endDate),
  );
}

// ============ Combined MC / Annual Leave windows ============

async function getLeavesInDateWindow(
  typeCode: string,
  fromDate: Date,
  toDate: Date,
): Promise<LeaveOnDateRow[]> {
  const rows = await prisma.leave_request.findMany({
    where: {
      status: "approved",
      start_date: { lte: toDate },
      end_date: { gte: fromDate },
      leave_types: { leave_type_code: typeCode },
    },
    include: {
      users_leave_request_user_idTousers: {
        include: { user_profile: { select: { full_name: true } } },
      },
      leave_types: true,
    },
    orderBy: { start_date: "desc" },
  });

  return rows.map((r) => {
    const user = r.users_leave_request_user_idTousers;
    return {
      leaveId: r.leave_id,
      userId: r.user_id,
      fullName: titleCaseName(user.user_profile?.full_name) || user.email,
      email: user.email,
      leaveTypeCode: r.leave_types.leave_type_code,
      leaveTypeName: r.leave_types.name,
      startDate: r.start_date.toISOString().slice(0, 10),
      endDate: r.end_date.toISOString().slice(0, 10),
    };
  });
}

// MC: last 7 days through today
export async function getCombinedMcLeavesPastWeek(): Promise<LeaveOnDateRow[]> {
  const today = startOfTodayUtc();
  const sevenDaysAgo = addDaysUtc(today, -7);

  // Local leave_types uses code "SL" (Sick Leave) for what HRMS labels "MC".
  // Heidi's LeaveTransaction.LeaveTypeCode is also "SL". The "MC" naming on
  // this function and the dashboard card is the colloquial Malaysian term;
  // the actual code stored everywhere is "SL".
  const [local, ebr] = await Promise.all([
    getLeavesInDateWindow("SL", sevenDaysAgo, today),
    fetchOptionalCache("mc_record", () =>
      prisma.mc_record.findMany({
        where: { mc_date: { gte: sevenDaysAgo, lte: today } },
        orderBy: { mc_date: "desc" },
      }),
    ),
  ]);

  const ebrRows: LeaveOnDateRow[] = ebr.map((r) => {
    const dateStr = formatDateMYT(r.mc_date);
    return {
      leaveId: -r.id,
      userId: -r.id,
      fullName: titleCaseName(r.name) || r.name,
      email: r.department_branch,
      leaveTypeCode: "MC",
      leaveTypeName: r.reason ?? "MC",
      startDate: dateStr,
      endDate: dateStr,
    };
  });

  return [...local, ...ebrRows].sort((a, b) =>
    b.startDate.localeCompare(a.startDate),
  );
}

// Annual Leave: today through the next 14 days (forward-looking).
// AL is planned in advance — HR wants to see who is going on leave soon,
// not who has already taken it. Mirrors the standard HRMS "upcoming AL"
// view so the dashboard data aligns with other tools.
// "2 Days" / "1 Day" / "0.5 Day" → number of days (defaults to 1 on parse fail).
function parseAlDurationDays(s: string | null): number {
  if (!s) return 1;
  const m = /(\d+(?:\.\d+)?)/.exec(s);
  const n = m ? parseFloat(m[1]) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export async function getCombinedAnnualLeavesUpcoming(): Promise<LeaveOnDateRow[]> {
  // Use MYT-today so leaves dated "today" in Malaysian time are included
  // regardless of the server's UTC clock at request time.
  const today = startOfTodayMyt();
  const twoWeeksAhead = addDaysUtc(today, 14);
  // annual_leave_record has a single al_date column (no end date), but the
  // al_duration text encodes multi-day spans like "2 Days". Look back two
  // weeks so we don't drop multi-day leaves that started before today but
  // are still active — we filter on the computed end date in JS.
  const lookBack = addDaysUtc(today, -14);

  const [local, ebr] = await Promise.all([
    getLeavesInDateWindow("AL", today, twoWeeksAhead),
    fetchOptionalCache("annual_leave_record", () =>
      prisma.annual_leave_record.findMany({
        where: { al_date: { gte: lookBack, lte: twoWeeksAhead } },
        orderBy: { al_date: "asc" },
      }),
    ),
  ]);

  const ebrRows: LeaveOnDateRow[] = ebr
    .map((r) => {
      const days = parseAlDurationDays(r.al_duration);
      // Inclusive end date: 1-day leave ends on al_date; 2-day on al_date+1.
      const startDateUtc = r.al_date;
      const endDateUtc = addDaysUtc(startDateUtc, Math.ceil(days) - 1);
      return { r, startDateUtc, endDateUtc, days };
    })
    // Keep only leaves still active or upcoming in the window.
    .filter(({ endDateUtc }) => endDateUtc.getTime() >= today.getTime())
    .map(({ r, startDateUtc, endDateUtc, days }) => ({
      leaveId: -r.id,
      userId: -r.id,
      fullName: titleCaseName(r.name) || r.name,
      email: r.department_branch,
      leaveTypeCode: "AL",
      leaveTypeName: r.al_duration ?? "Annual Leave",
      startDate: formatDateMYT(startDateUtc),
      endDate: days > 1 ? formatDateMYT(endDateUtc) : formatDateMYT(startDateUtc),
    }));

  return [...local, ...ebrRows].sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  );
}

export interface OnboardingDashboardStats {
  totalNewHiresThisMonth: number;
  branchesCovered: string[];
  pendingChecklists: number;
  averageCompletionRate: number;
}

export async function getOnboardingDashboardStats(): Promise<OnboardingDashboardStats> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const profiles = await prisma.induction_profile.findMany({
    where: { start_date: { gte: monthStart } },
    include: {
      steps: { select: { status: true } },
      user: {
        include: {
          employment: {
            where: { status: "active" },
            include: { department: true },
            orderBy: { start_date: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  const branches = new Set<string>();
  for (const p of profiles) {
    const dept = p.user.employment[0]?.department?.department_name;
    if (dept) branches.add(dept);
  }

  const pending = profiles.filter((p) => p.status !== "Completed").length;

  const avgCompletion =
    profiles.length > 0
      ? Math.round(
          (profiles.reduce((sum, p) => {
            const total = p.steps.length;
            const completed = p.steps.filter((s) => s.status === "Completed").length;
            return sum + (total > 0 ? completed / total : 0);
          }, 0) /
            profiles.length) *
            100
        )
      : 0;

  return {
    totalNewHiresThisMonth: profiles.length,
    branchesCovered: Array.from(branches),
    pendingChecklists: pending,
    averageCompletionRate: avgCompletion,
  };
}

// ============ Slice E: analytics & feedback ============

export async function getInductionHealthScore(): Promise<number> {
  const responses = await prisma.survey_response.findMany({
    select: { sentiment_score: true },
  });

  if (responses.length === 0) return 50;

  const avg =
    responses.reduce((sum, r) => sum + (r.sentiment_score ?? 0), 0) /
    responses.length;
  return Math.round(avg * 20);
}

export interface ConfidencePoint {
  milestone: string;
  averageScore: number;
}

export async function getConfidenceTrajectory(): Promise<ConfidencePoint[]> {
  const milestones = ["Day1", "Week2", "Month1", "Month3"] as const;
  const result: ConfidencePoint[] = [];

  for (const milestone of milestones) {
    const responses = await prisma.survey_response.findMany({
      where: { survey_template: { milestone } },
      select: { responses: true },
    });

    if (responses.length === 0) {
      result.push({ milestone, averageScore: 0 });
      continue;
    }

    const scores = responses.map((r) => {
      const data = (r.responses ?? {}) as Record<string, unknown>;
      const key = Object.keys(data).find((k) => k.includes("confidence"));
      const value = key ? data[key] : 3;
      return typeof value === "number" ? value : 3;
    });

    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    result.push({ milestone, averageScore: avg });
  }

  return result;
}

export interface ProblemArea {
  metricName: string;
  currentScore: number;
  percentageResponding: number;
  evidence: string;
}

export async function getProblemAreas(): Promise<ProblemArea[]> {
  const metrics = await prisma.analytics_metric.findMany({
    where: { value: { lt: 60 } },
    orderBy: { timestamp: "desc" },
  });

  return metrics.map((m) => ({
    metricName: m.metric_name,
    currentScore: Math.round(m.value),
    percentageResponding: 100 - Math.round(m.value),
    evidence: `${100 - Math.round(m.value)}% of new hires indicated issues with ${m.metric_name.toLowerCase()}`,
  }));
}

export interface RecommendationRow {
  id: number;
  title: string;
  evidence: string;
  actionItems: string[];
  status: string;
  priority: string;
}

export async function getRecommendations(): Promise<RecommendationRow[]> {
  const rows = await prisma.recommendation.findMany({
    orderBy: [{ status: "asc" }, { due_date: "asc" }],
    select: {
      id: true,
      title: true,
      evidence: true,
      action_items: true,
      status: true,
      priority: true,
    },
  });

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    evidence: r.evidence,
    actionItems: Array.isArray(r.action_items) ? (r.action_items as string[]) : [],
    status: r.status,
    priority: r.priority,
  }));
}

export interface ImpactLogRow {
  recommendationTitle: string;
  metricName: string;
  beforeValue: number;
  afterValue: number;
  improvementPercentage: number;
  measuredAt: string;
}

export async function getImpactLog(): Promise<ImpactLogRow[]> {
  const logs = await prisma.impact_log.findMany({
    include: { recommendation: { select: { title: true } } },
    orderBy: { measured_at: "desc" },
  });

  return logs.map((log) => ({
    recommendationTitle: log.recommendation.title,
    metricName: log.metric_name,
    beforeValue: log.value_before,
    afterValue: log.value_after,
    improvementPercentage: log.improvement_percentage,
    measuredAt: log.measured_at.toISOString().slice(0, 10),
  }));
}

export async function getInductionByToken(token: string): Promise<GetInductionByTokenResult> {
  if (!token || typeof token !== "string") return { ok: false, error: "not_found" };

  const profile = await prisma.induction_profile.findUnique({
    where: { link_token: token },
    include: {
      user: {
        include: {
          user_profile: { select: { full_name: true } },
          employment: {
            where: { status: "active" },
            include: { department: true },
            orderBy: { start_date: "desc" },
            take: 1,
          },
        },
      },
      buddy: { include: { user_profile: { select: { full_name: true } } } },
      steps: {
        include: {
          responsible_person: {
            select: { email: true, user_profile: { select: { full_name: true } } },
          },
        },
        orderBy: { step_number: "asc" },
      },
    },
  });

  if (!profile) return { ok: false, error: "not_found" };
  if (profile.link_expires_at.getTime() < Date.now()) {
    return { ok: false, error: "expired" };
  }

  const department =
    profile.user.employment[0]?.department?.department_name ?? null;
  const departmentId =
    profile.user.employment[0]?.department?.department_id ?? null;

  return {
    ok: true,
    profile: {
      id: profile.id,
      userId: profile.user_id,
      employeeName:
        titleCaseName(profile.user.user_profile?.full_name) || profile.user.email,
      employeeEmail: profile.user.email,
      departmentId,
      departmentName: department,
      inductionType: profile.induction_type,
      workflowTemplate: profile.workflow_template,
      startDate: profile.start_date.toISOString().slice(0, 10),
      exitDate: profile.exit_date ? profile.exit_date.toISOString().slice(0, 10) : null,
      targetDurationDays: profile.target_duration_days ?? null,
      linkToken: profile.link_token,
      linkExpiresAt: profile.link_expires_at.toISOString(),
      status: profile.status,
      buddyName: profile.buddy?.user_profile?.full_name
        ? titleCaseName(profile.buddy.user_profile.full_name)
        : profile.buddy?.email ?? null,
      buddyEmail: profile.buddy?.email ?? null,
      steps: profile.steps.map((s) => ({
        id: s.id,
        stepNumber: s.step_number,
        title: s.title,
        description: s.description,
        responsibleName: s.responsible_person?.user_profile?.full_name
          ? titleCaseName(s.responsible_person.user_profile.full_name)
          : s.responsible_person?.email ?? null,
        responsibleEmail: s.responsible_person?.email ?? null,
        dueDate: s.due_date.toISOString().slice(0, 10),
        status: (s.status as InductionStepView["status"]) ?? "Pending",
        completedAt: s.completed_at ? s.completed_at.toISOString() : null,
        evidenceFileId: s.evidence_file_id ?? null,
        evidenceUploadedAt: s.evidence_uploaded_at ? s.evidence_uploaded_at.toISOString() : null,
      })),
    },
  };
}
