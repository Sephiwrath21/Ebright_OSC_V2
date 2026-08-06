import "server-only";
import { prisma } from "@/lib/prisma";
// Task Manager lives in a separate database (ebright_task_manager, via
// TASK_MANAGER_DATABASE_URL) with its own generated Prisma client — aliased
// here to avoid colliding with this file's own `prisma` (the main hrfs db).
import { prisma as taskManagerPrisma } from "@/task-manager/prisma";
import { titleCaseName } from "@/lib/text";
import { EMPLOYEE_STAGES, STAGE_LABELS, isEmployeeStage, positionGroup, type EmployeeStage } from "@/lib/employeeStages";
import { getCurrentEmployeeScope, filterRowsByScope, isRowInScope } from "@/lib/employeeScope";

export { EMPLOYEE_STAGES, STAGE_LABELS, isEmployeeStage };
export type { EmployeeStage };

export const ROLE_OPTIONS = ["FT CEO", "FT HOD", "FT EXEC", "BM", "FT COACH", "PT COACH", "INTERN", "PROTEGE INTERN", "HQ INTERN"] as const;
export type RoleOption = (typeof ROLE_OPTIONS)[number];

export const STATUS_OPTIONS = ["active", "onboarding", "inactive", "archive"] as const;
export type StatusOption = (typeof STATUS_OPTIONS)[number];

// role_id values from the `role` table: 1 superadmin, 2 ceo, 3 department,
// 4 branch, 5 regional manager, 6 staff, 7 hod, 8 Branch Manager.
export const STAFF_ROLE_ID = 6;

// Employee Overview/lifecycle stages should cover every real individual
// employee, not just plain "staff" — HOD (7) and Branch Manager (8) are also
// real individual employees with their own position/employment record (e.g.
// Iqbal Hakim Bin Halim, FT HOD @ Optimisation); the elevated role_id is only
// for permission scoping, same as "staff" being the baseline. "department"/
// "branch"/"regional manager"/superadmin/ceo are excluded on purpose — those
// are shared/administrative scoping-only logins, not individual staff to
// track through the lifecycle stages.
const EMPLOYEE_LIFECYCLE_ROLE_IDS = [STAFF_ROLE_ID, 7, 8];

export interface EmployeeRow {
  id: number;
  email: string;
  employeeId: string | null;
  fullName: string;
  nickName: string | null;
  dob: string | null;
  phone: string | null;
  role: string | null;
  branchCode: string | null;
  branchName: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  status: string | null;
  startDate: string | null;
  endDate: string | null;
  pendingOnboarding: boolean;
}

export interface EmployeeDetailFull extends EmployeeRow {
  gender: string | null;
  dob: string | null;
  phone: string | null;
  nationality: string | null;
  nric: string | null;
  homeAddress: string | null;
  position: string | null;
  endDate: string | null;
  employmentType: string | null;
  probation: boolean;
  rate: string | null;
  branchId: number | null;
  departmentId: number | null;
  employmentId: number | null;
  bankName: string | null;
  bankAccount: string | null;
  accountName: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  emergencyRelation: string | null;
  emergencyEmail: string | null;
  emergencyAddress: string | null;
  offerLetterFileId: string | null;
}

export interface BranchOpt { id: number; code: string; name: string }
export interface DepartmentOpt { id: number; code: string; name: string }

export async function listBranches(): Promise<BranchOpt[]> {
  const rows = await prisma.branch.findMany({
    select: { branch_id: true, branch_code: true, branch_name: true },
    orderBy: { branch_name: "asc" },
  });
  return rows.map((r) => ({ id: r.branch_id, code: r.branch_code ?? "", name: r.branch_name }));
}

export async function listDepartments(): Promise<DepartmentOpt[]> {
  const rows = await prisma.department.findMany({
    select: { department_id: true, department_code: true, department_name: true },
    orderBy: { department_name: "asc" },
  });
  return rows.map((r) => ({ id: r.department_id, code: r.department_code, name: r.department_name }));
}

export interface ListFilters {
  search?: string;
  branchCode?: string;
  deptCode?: string;
  role?: string;
  status?: string;
}

export async function listEmployees(filters: ListFilters = {}): Promise<EmployeeRow[]> {
  const employmentWhere: Record<string, unknown> = {};
  if (filters.branchCode) employmentWhere.branch = { branch_code: filters.branchCode };
  if (filters.deptCode) employmentWhere.department = { department_code: filters.deptCode };
  if (filters.role) employmentWhere.position = filters.role;
  if (filters.status) employmentWhere.status = filters.status;

  // Staff only (role_id 6) — the workforce, excluding admin/management
  // accounts (superadmin, ceo, department, branch, regional manager).
  const whereUser: Record<string, unknown> = {
    role_id: STAFF_ROLE_ID,
  };

  if (Object.keys(employmentWhere).length > 0) {
    whereUser.employment = { some: employmentWhere };
  }

  const q = filters.search?.trim();
  if (q) {
    whereUser.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { user_profile: { full_name: { contains: q, mode: "insensitive" } } },
      { user_profile: { nick_name: { contains: q, mode: "insensitive" } } },
      { employment: { some: { employee_id: { contains: q, mode: "insensitive" } } } },
    ];
  }

  const rows = await prisma.users.findMany({
    where: whereUser,
    include: {
      user_profile: true,
      employment: {
        where: Object.keys(employmentWhere).length > 0 ? employmentWhere : undefined,
        include: { branch: true, department: true },
        orderBy: { start_date: "desc" },
        take: 1,
      },
    },
    orderBy: { created_at: "desc" },
  });

  return rows.map((u): EmployeeRow => {
    const emp = u.employment[0];
    return {
      id: u.user_id,
      email: u.email,
      employeeId: emp?.employee_id ?? null,
      fullName: titleCaseName(u.user_profile?.full_name) || u.email,
      nickName: u.user_profile?.nick_name ? titleCaseName(u.user_profile.nick_name) : null,
      dob: u.user_profile?.dob ? u.user_profile.dob.toISOString().slice(0, 10) : null,
      phone: u.user_profile?.phone ?? null,
      role: emp?.position ?? null,
      branchCode: emp?.branch?.branch_code ?? null,
      branchName: emp?.branch?.branch_name ?? null,
      departmentCode: emp?.department?.department_code ?? null,
      departmentName: emp?.department?.department_name ?? null,
      status: emp?.status ?? u.status ?? null,
      startDate: emp?.start_date ? emp.start_date.toISOString().slice(0, 10) : null,
      endDate: emp?.end_date ? emp.end_date.toISOString().slice(0, 10) : null,
      pendingOnboarding: !u.user_profile,
    };
  });
}

export interface EmployeeOverviewRow {
  id: number;
  /** employment.employee_id — the assigned staff code. Only ever set once an
   *  employee reaches Probation/Onboarding (Pre stage never has one). */
  employeeId: string | null;
  fullName: string;
  position: string | null;
  branchCode: string | null;
  branchName: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  employmentType: string | null;
  date: string | null;
  stage: EmployeeStage;
  /** True only for onboarding_candidate rows (see listUpcomingOnboardingCandidates)
   *  — a future hire sourced from ebrightleads with no real portal account yet,
   *  so there's no Employee Record to open. `id` is a negative sentinel
   *  (-source_id) for these, never a real user_id. */
  isCandidate?: boolean;
  /** Pre stage list only — the matching career_applications row's current
   *  board_stage (see lookupCareerApplicationsByName), attached by the page,
   *  not this query. Undefined for every other stage and for Pre rows with
   *  no career_applications match (e.g. manually added via
   *  addPreStageEmployee). */
  boardStage?: string | null;
}

// Exit priority: end_date wins whenever it's set — "exit" only if it's
// already passed (calendar-date comparison, not timestamp); a set end_date
// that's today/in the future is NOT exit regardless of status. status is
// only consulted as a fallback when end_date is null at all, and only
// "inactive" qualifies (not "archive" — not named in the spec, so an
// archive-status employee with no end_date falls through to active/
// onboarding/probation like anyone else). "probation" is derived from the
// probation flag — there's no separate DB stage for it.
function stageFromEmployment(
  status: string | null,
  endIso: string | null,
  todayIso: string,
  probation: boolean,
  position: string | null,
): EmployeeStage {
  if (endIso) return endIso < todayIso ? "exit" : nonExitStage(status, probation, position);
  if (status === "inactive") return "exit";
  return nonExitStage(status, probation, position);
}

// status === "pre" means start_date has arrived but the Pre -> Onboarding/
// Probation transition (proceedFromPreStage, or the automatic sweep in
// stageTransitionAutomation.ts) hasn't actually run yet — same lag a click-
// or hourly-sweep-driven transition always has. Rather than display "Active"
// (the old, wrong fallback) during that gap, compute live what the
// transition WILL resolve to the instant it runs, mirroring the exact
// Full-Time/not split proceedFromPreStage itself uses. No field is written
// here — this is display-only; the actual status/probation write still
// happens via the click or the sweep.
// Exit falls back to updated_at, everything else falls back to created_at —
// EXCEPT Pre, where a missing start_date must stay null (not silently
// backfilled) so the UI can show/sort "no date yet" rows distinctly, e.g.
// career_applications-synced Pre employees before HR fills in a start_date.
function dateSourceFor(stage: EmployeeStage, emp: { start_date: Date | null; end_date: Date | null } | undefined, u: { created_at: Date; updated_at: Date }): Date | null {
  if (stage === "exit") return emp?.end_date ?? u.updated_at;
  if (stage === "pre") return emp?.start_date ?? null;
  return emp?.start_date ?? u.created_at;
}

function nonExitStage(status: string | null, probation: boolean, position: string | null): EmployeeStage {
  if (status === "onboarding") return "onboarding";
  if (probation) return "probation";
  if (status === "pre") return positionGroup(position) === "Full Time" ? "probation" : "onboarding";
  return "active";
}

// `skipScopeFilter` exists only for callers that deliberately need every
// employee regardless of the current session's own department/branch scope
// (e.g. a future system/background job) — every existing caller is an
// Employee Overview/Record page, so the default (scoped) is what every one
// of them should get; opt OUT explicitly rather than opt in, so a new
// caller that forgets about scope still fails closed instead of open.
// Pre stage = employment.start_date hasn't arrived yet. This is checked
// FIRST and wins regardless of users.status/employment.status — a staff-role
// employee already marked "active" with a future start_date still belongs in
// Pre. A user still stuck at users.status "pending" with no start_date at all
// yet (brand new registration, no employment row processed) also stays in
// Pre. A pending user whose start_date has already arrived/passed falls out
// of every stage (returns null, filtered below) — their account genuinely
// hasn't been moved along by whatever workflow step does that, so there's no
// stage that correctly represents them yet.
function stageForRow(
  usersStatus: string | null,
  emp:
    | { status: string | null; probation: boolean; start_date: Date | null; end_date: Date | null; position: string | null }
    | undefined,
  todayIso: string,
): EmployeeStage | null {
  const startIso = emp?.start_date ? emp.start_date.toISOString().slice(0, 10) : null;
  if (startIso && startIso > todayIso) return "pre";
  // status="pre" with no start_date at all (e.g. synced from
  // career_applications with no known start date yet) — still Pre, just
  // without a date to compare against today. Distinct from the "startIso in
  // the past, sweep hasn't run yet" case below, which nonExitStage predicts
  // via position instead.
  if (!startIso && emp?.status === "pre") return "pre";
  if (usersStatus === "pending") {
    return startIso ? null : "pre";
  }
  const endIso = emp?.end_date ? emp.end_date.toISOString().slice(0, 10) : null;
  return stageFromEmployment(emp?.status ?? usersStatus, endIso, todayIso, emp?.probation ?? false, emp?.position ?? null);
}

export async function listEmployeeOverviewRows(options: { skipScopeFilter?: boolean } = {}): Promise<EmployeeOverviewRow[]> {
  // One combined population: every staff-role user (any status) plus every
  // still-pending user regardless of role — status alone no longer decides
  // Pre membership (see stageForRow), so both groups have to be considered
  // together rather than as two disjoint queries.
  const users = await prisma.users.findMany({
    where: { OR: [{ status: "pending" }, { role_id: { in: EMPLOYEE_LIFECYCLE_ROLE_IDS } }] },
    include: {
      user_profile: true,
      employment: { include: { branch: true, department: true }, orderBy: { start_date: "desc" }, take: 1 },
    },
    orderBy: { created_at: "desc" },
  });

  const todayIso = new Date().toISOString().slice(0, 10);
  const rows: EmployeeOverviewRow[] = [];
  for (const u of users) {
    const emp = u.employment[0];
    const stage = stageForRow(u.status ?? null, emp, todayIso);
    if (!stage) continue;
    const dateSource = dateSourceFor(stage, emp, u);
    rows.push({
      id: u.user_id,
      employeeId: emp?.employee_id ?? null,
      fullName: titleCaseName(u.user_profile?.full_name) || u.email,
      position: emp?.position ?? null,
      branchCode: emp?.branch?.branch_code ?? null,
      branchName: emp?.branch?.branch_name ?? null,
      departmentCode: emp?.department?.department_code ?? null,
      departmentName: emp?.department?.department_name ?? null,
      employmentType: emp?.employment_type ?? null,
      date: dateSource ? dateSource.toISOString().slice(0, 10) : null,
      stage,
    });
  }

  if (options.skipScopeFilter) return rows;

  const scope = await getCurrentEmployeeScope();
  // No session -> the caller's own auth() gate (already required before
  // reaching any page that calls this) will have redirected; returning
  // everything unfiltered here would only matter if that gate were ever
  // missing, so fail closed instead.
  if (!scope) return [];
  return filterRowsByScope(scope, rows);
}

// Single-employee counterpart to listEmployeeOverviewRows() above — every
// profile/record page only ever needs ONE employee's row (to confirm they
// exist, get their stage, and check scope), but was calling the full-list
// version and doing `rows.find(...)` just to get it. Measured directly: the
// full list (~220 employees, joined to employment/branch/department) takes
// ~550ms; this single-row query takes ~18ms. Reuses the exact same stage
// computation (stageForRow) and scope check (isRowInScope) as the full-list
// version, so results are identical — just for one user_id instead of everyone.
export async function getEmployeeOverviewRowById(id: number): Promise<EmployeeOverviewRow | null> {
  const u = await prisma.users.findUnique({
    where: { user_id: id },
    include: {
      user_profile: true,
      employment: { include: { branch: true, department: true }, orderBy: { start_date: "desc" }, take: 1 },
    },
  });
  if (!u) return null;
  // Same population gate as the full-list query's WHERE clause — a user
  // outside role_id 6/7/8 and not "pending" (e.g. a department/branch shared
  // login account) was never part of Employee Overview to begin with.
  if (u.status !== "pending" && !EMPLOYEE_LIFECYCLE_ROLE_IDS.includes(u.role_id)) return null;

  const emp = u.employment[0];
  const todayIso = new Date().toISOString().slice(0, 10);
  const stage = stageForRow(u.status ?? null, emp, todayIso);
  if (!stage) return null;

  const dateSource = dateSourceFor(stage, emp, u);
  const row: EmployeeOverviewRow = {
    id: u.user_id,
    employeeId: emp?.employee_id ?? null,
    fullName: titleCaseName(u.user_profile?.full_name) || u.email,
    position: emp?.position ?? null,
    branchCode: emp?.branch?.branch_code ?? null,
    branchName: emp?.branch?.branch_name ?? null,
    departmentCode: emp?.department?.department_code ?? null,
    departmentName: emp?.department?.department_name ?? null,
    employmentType: emp?.employment_type ?? null,
    date: dateSource ? dateSource.toISOString().slice(0, 10) : null,
    stage,
  };

  const scope = await getCurrentEmployeeScope();
  if (!scope) return null;
  if (!isRowInScope(scope, row)) return null;

  return row;
}

// Normalizes name+date into a dedup key — mirrors induction/queries.ts's own
// nameDateKey, used there for the exact same reason: ebrightleads candidates
// and real portal employees are matched by name+date since there's no shared
// id between the two systems.
function nameDateKey(name: string, dateStr: string): string {
  const norm = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `${norm}|${dateStr}`;
}

// department_branch is free text synced from ebrightleads, not a real FK —
// it's usually a real department/branch code or name (e.g. "MKT", "AMP",
// "Bandar Seri Putra") but sometimes neither (e.g. "OD", "Coaching", "TSB").
// Resolved against the real department/branch tables on a best-effort basis;
// department wins if both match (mirrors the department-priority display
// rule used everywhere else).
export function resolveDepartmentBranch(
  raw: string,
  departments: DepartmentOpt[],
  branches: BranchOpt[],
): { branchCode: string | null; branchName: string | null; departmentCode: string | null; departmentName: string | null } {
  const key = raw.trim().toLowerCase();
  const dept = departments.find((d) => d.code.toLowerCase() === key || d.name.toLowerCase() === key);
  const branch = !dept ? branches.find((b) => b.code.toLowerCase() === key || b.name.toLowerCase() === key) : undefined;
  return {
    branchCode: branch?.code ?? null,
    branchName: branch?.name ?? null,
    departmentCode: dept?.code ?? null,
    departmentName: dept?.name ?? (!branch ? raw : null),
  };
}

// NOT CURRENTLY CALLED from the Pre stage list/count — disabled per decision
// (ebrightleads no longer feeds Pre; see employee-folder/page.tsx and
// employee-folder/[stage]/page.tsx). Left defined rather than deleted since
// the underlying onboarding_candidate sync/table is still populated and this
// may be reintroduced or reused elsewhere later.
//
// Pre stage's real-employee population (above) only covers people who
// already have a portal account. Future hires still sitting in the external
// ebrightleads pipeline — synced into onboarding_candidate, same source the
// Induction module's own Onboarding Detail page shows as "ebrightleads" rows
// — belong in Pre too, just with no Employee Record to open yet (isCandidate).
//
// Two separate de-dup layers, since neither alone is reliable:
// - Excludes any candidate whose induction_profile_id is already set (has
//   been formally converted to a portal account via the induction flow).
// - Excludes any candidate whose normalized name+start_date matches an
//   `existingRows` entry — some real employees already exist in the portal
//   without ever going through that induction_profile linking step, so
//   induction_profile_id alone missed real duplicates (confirmed against
//   live data: 3 of 11 candidates were exact name+date matches of employees
//   already in Pre via the real-account query).
//
// Applies the same scope filter as listEmployeeOverviewRows so a department/
// branch-scoped account only sees candidates that resolve to their own
// department/branch — an unresolved value has no code to match against, so
// it fails closed (hidden from scoped accounts, still shown to full-access
// HR/Superadmin with the raw synced text as its Branch/Department display).
export async function listUpcomingOnboardingCandidates(existingRows: EmployeeOverviewRow[]): Promise<EmployeeOverviewRow[]> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [candidates, departments, branches] = await Promise.all([
    prisma.onboarding_candidate.findMany({
      where: { induction_profile_id: null, start_date: { gt: new Date(todayIso) } },
    }),
    listDepartments(),
    listBranches(),
  ]);

  const existingKeys = new Set(existingRows.filter((r) => r.date).map((r) => nameDateKey(r.fullName, r.date as string)));

  const rows: EmployeeOverviewRow[] = candidates
    .filter((c) => !existingKeys.has(nameDateKey(titleCaseName(c.name) || c.name, c.start_date.toISOString().slice(0, 10))))
    .map((c) => {
      const loc = resolveDepartmentBranch(c.department_branch, departments, branches);
      return {
        id: -c.source_id,
        employeeId: null,
        fullName: titleCaseName(c.name) || c.name,
        position: c.position || null,
        ...loc,
        employmentType: null,
        date: c.start_date.toISOString().slice(0, 10),
        stage: "pre",
        isCandidate: true,
      };
    });

  const scope = await getCurrentEmployeeScope();
  if (!scope) return [];
  return filterRowsByScope(scope, rows);
}

// A candidate's own profile page uses the exact same StageProfileView/
// PersonalInfoPanel as a real employee — same template, blank fields where
// there's genuinely nothing recorded yet (no separate simplified UI). This
// synthesizes an EmployeeDetailFull-shaped object from the handful of fields
// onboarding_candidate actually has (name/position/department_branch/
// start_date); everything else (DOB, IC, phone, bank details, emergency
// contact, ...) is null, same as a real employee who just hasn't had that
// data entered yet. `sourceId` is the candidate's own onboarding_candidate.
// source_id (positive) — callers pass `-row.id` since candidate rows use
// `-source_id` as their EmployeeOverviewRow.id sentinel.
export async function getOnboardingCandidateDetail(sourceId: number): Promise<EmployeeDetailFull | null> {
  const [candidate, departments, branches] = await Promise.all([
    prisma.onboarding_candidate.findUnique({ where: { source_id: sourceId } }),
    listDepartments(),
    listBranches(),
  ]);
  if (!candidate) return null;
  const loc = resolveDepartmentBranch(candidate.department_branch, departments, branches);
  return {
    id: -candidate.source_id,
    email: "",
    employeeId: null,
    fullName: titleCaseName(candidate.name) || candidate.name,
    nickName: null,
    role: candidate.position || null,
    ...loc,
    status: null,
    startDate: candidate.start_date.toISOString().slice(0, 10),
    pendingOnboarding: false,
    gender: null,
    dob: null,
    phone: null,
    nationality: null,
    nric: null,
    homeAddress: null,
    position: candidate.position || null,
    endDate: candidate.end_date ? candidate.end_date.toISOString().slice(0, 10) : null,
    employmentType: null,
    probation: false,
    rate: null,
    branchId: null,
    departmentId: null,
    employmentId: null,
    bankName: null,
    bankAccount: null,
    accountName: null,
    emergencyName: null,
    emergencyPhone: null,
    emergencyRelation: null,
    emergencyEmail: null,
    emergencyAddress: null,
    offerLetterFileId: null,
  };
}

// Real salary_revision table — Active stage's own "Salary Revision" tab.
// Deliberately separate from employee_rate_history, which still
// independently feeds manpower cost calculations (src/lib/manpowerCost.ts)
// and isn't touched by this — that table has no matching user-facing "add"
// UI anywhere in the mock, while salary_revision's add-form + history is
// exactly what active_salaryRev.html shows.
export interface SalaryRevisionEntry {
  id: number;
  issuedDate: string | null;
  effectiveDate: string | null;
  currentSalary: string | null;
  newSalary: string | null;
  reason: string | null;
  salaryAdjustment: string | null;
  approvedBy: string | null;
  attachmentFileId: string | null;
}

export async function listSalaryRevisions(userId: number): Promise<SalaryRevisionEntry[]> {
  const rows = await prisma.salary_revision.findMany({
    where: { user_id: userId },
    orderBy: { effective_date: "desc" },
  });
  return rows.map((r) => ({
    id: r.salary_revision_id,
    issuedDate: r.issued_date ? r.issued_date.toISOString().slice(0, 10) : null,
    effectiveDate: r.effective_date ? r.effective_date.toISOString().slice(0, 10) : null,
    currentSalary: r.current_salary?.toString() ?? null,
    newSalary: r.new_salary?.toString() ?? null,
    reason: r.reason,
    salaryAdjustment: r.salary_adjustment?.toString() ?? null,
    approvedBy: r.approved_by,
    attachmentFileId: r.attachment_file_id,
  }));
}

export interface LeaveHistoryRow {
  leaveId: number;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  totalDays: string;
  reason: string | null;
  attachment: string | null;
  status: string;
}

// employment.status/leave_request predate mc_record/annual_leave_record — those
// two are one-time migration sources already consolidated into leave_request
// (see api/migrations/consolidate-leave-records), so leave_request is the
// canonical, user_id-linked source for this tab.
export async function listLeaveHistory(userId: number): Promise<LeaveHistoryRow[]> {
  const rows = await prisma.leave_request.findMany({
    where: { user_id: userId },
    include: { leave_types: true },
    orderBy: { start_date: "desc" },
  });
  return rows.map((r) => ({
    leaveId: r.leave_id,
    leaveTypeName: r.leave_types.name,
    startDate: r.start_date.toISOString().slice(0, 10),
    endDate: r.end_date.toISOString().slice(0, 10),
    totalDays: r.total_days.toString(),
    reason: r.reason,
    attachment: r.attachment,
    status: r.status,
  }));
}

// Real achievement table — Active stage's own "Achievement" tab + Employee
// Record's Active Employment > "Cert./ Achievement" tab, same concept.
// Repeatable (see add_achievement.sql) — every field nullable, newest first.
export interface AchievementEntry {
  id: number;
  name: string | null;
  date: string | null;
  attachmentFileId: string | null;
}

export async function listAchievements(userId: number): Promise<AchievementEntry[]> {
  const rows = await prisma.achievement.findMany({ where: { user_id: userId }, orderBy: { date: "desc" } });
  return rows.map((r) => ({
    id: r.achievement_id,
    name: r.name,
    date: r.date ? r.date.toISOString().slice(0, 10) : null,
    attachmentFileId: r.attachment_file_id,
  }));
}

// Real promotion table — Active stage's own "Promotion" tab + Employee
// Record's Active Employment > "Promotion" tab's "add new" form/history.
export interface PromotionEntry {
  id: number;
  promotionDate: string | null;
  effectiveDate: string | null;
  currentPosition: string | null;
  newPosition: string | null;
  reason: string | null;
  approvedBy: string | null;
  attachmentFileId: string | null;
}

export async function listPromotions(userId: number): Promise<PromotionEntry[]> {
  const rows = await prisma.promotion.findMany({ where: { user_id: userId }, orderBy: { effective_date: "desc" } });
  return rows.map((r) => ({
    id: r.promotion_id,
    promotionDate: r.promotion_date ? r.promotion_date.toISOString().slice(0, 10) : null,
    effectiveDate: r.effective_date ? r.effective_date.toISOString().slice(0, 10) : null,
    currentPosition: r.current_position,
    newPosition: r.new_position,
    reason: r.reason,
    approvedBy: r.approved_by,
    attachmentFileId: r.attachment_file_id,
  }));
}

// Real transfer table — Active stage's own "Transfer" tab + Employee
// Record's Active Employment > "Transfer" tab's "add new" form/history.
export interface TransferEntry {
  id: number;
  type: string | null;
  effectiveDate: string | null;
  fromLocation: string | null;
  toLocation: string | null;
  reason: string | null;
  attachmentFileId: string | null;
  /** Temporary Transfer only — the date this reverts back to fromLocation. */
  endDate: string | null;
}

export async function listTransfers(userId: number): Promise<TransferEntry[]> {
  const rows = await prisma.transfer.findMany({ where: { user_id: userId }, orderBy: { effective_date: "desc" } });
  return rows.map((r) => ({
    id: r.transfer_id,
    type: r.type,
    effectiveDate: r.effective_date ? r.effective_date.toISOString().slice(0, 10) : null,
    fromLocation: r.from_location,
    toLocation: r.to_location,
    reason: r.reason,
    attachmentFileId: r.attachment_file_id,
    endDate: r.end_date ? r.end_date.toISOString().slice(0, 10) : null,
  }));
}

// Real training table — Active stage's own "Training" tab + Employee
// Record's Active Employment > "Training" tab. No attachment field.
export interface TrainingEntry {
  id: number;
  name: string | null;
  date: string | null;
  status: string | null;
}

export async function listTrainings(userId: number): Promise<TrainingEntry[]> {
  const rows = await prisma.training.findMany({ where: { user_id: userId }, orderBy: { date: "desc" } });
  return rows.map((r) => ({ id: r.training_id, name: r.name, date: r.date ? r.date.toISOString().slice(0, 10) : null, status: r.status }));
}

// Real nda table — Active stage's own "NDA" tab (NDA fields only) +
// Employee Record's HR Info > "NDA/ NC" tab (combined with non_compete).
// Singleton — returns null if no row saved yet.
export interface NdaInfo {
  signDate: string | null;
  effectiveDate: string | null;
  status: string | null;
  attachmentFileId: string | null;
}

export async function getNda(userId: number): Promise<NdaInfo | null> {
  const row = await prisma.nda.findUnique({ where: { user_id: userId } });
  if (!row) return null;
  return {
    signDate: row.sign_date ? row.sign_date.toISOString().slice(0, 10) : null,
    effectiveDate: row.effective_date ? row.effective_date.toISOString().slice(0, 10) : null,
    status: row.status,
    attachmentFileId: row.attachment_file_id,
  };
}

// Real non_compete table — Active stage's own "Non-Compete" tab (NC fields
// only) + Employee Record's HR Info > "NDA/ NC" tab (combined with nda).
// Singleton — returns null if no row saved yet.
export interface NonCompeteInfo {
  signDate: string | null;
  expiryDate: string | null;
  duration: string | null;
  attachmentFileId: string | null;
}

export async function getNonCompete(userId: number): Promise<NonCompeteInfo | null> {
  const row = await prisma.non_compete.findUnique({ where: { user_id: userId } });
  if (!row) return null;
  return {
    signDate: row.sign_date ? row.sign_date.toISOString().slice(0, 10) : null,
    expiryDate: row.expiry_date ? row.expiry_date.toISOString().slice(0, 10) : null,
    duration: row.duration,
    attachmentFileId: row.attachment_file_id,
  };
}

// Real domestic_inquiry/suspension_letter/showcause_warning_letter/pip
// tables — Employee Record's Disciplinary category's 4 sub-tabs (the real
// add-forms, one query per type below). listDisciplinarySummary further
// down merges all 4 into one read-only Date/Type/Description list for the
// Active stage's own single "Disciplinary" tab, which — per
// active_disciplinary.html — only ever shows that combined summary, not the
// per-type detail forms.
export interface DomesticInquiryEntry {
  id: number;
  date: string | null;
  panel: string | null;
  caseSummary: string | null;
  decision: string | null;
  attachmentFileId: string | null;
}

export async function listDomesticInquiries(userId: number): Promise<DomesticInquiryEntry[]> {
  const rows = await prisma.domestic_inquiry.findMany({ where: { user_id: userId }, orderBy: { date: "desc" } });
  return rows.map((r) => ({
    id: r.domestic_inquiry_id,
    date: r.date ? r.date.toISOString().slice(0, 10) : null,
    panel: r.panel,
    caseSummary: r.case_summary,
    decision: r.decision,
    attachmentFileId: r.attachment_file_id,
  }));
}

export interface SuspensionLetterEntry {
  id: number;
  startDate: string | null;
  endDate: string | null;
  type: string | null;
  reason: string | null;
  issuedBy: string | null;
  attachmentFileId: string | null;
}

export async function listSuspensionLetters(userId: number): Promise<SuspensionLetterEntry[]> {
  const rows = await prisma.suspension_letter.findMany({ where: { user_id: userId }, orderBy: { start_date: "desc" } });
  return rows.map((r) => ({
    id: r.suspension_letter_id,
    startDate: r.start_date ? r.start_date.toISOString().slice(0, 10) : null,
    endDate: r.end_date ? r.end_date.toISOString().slice(0, 10) : null,
    type: r.type,
    reason: r.reason,
    issuedBy: r.issued_by,
    attachmentFileId: r.attachment_file_id,
  }));
}

export interface ShowcauseWarningLetterEntry {
  id: number;
  type: string | null;
  date: string | null;
  issuedBy: string | null;
  status: string | null;
  reason: string | null;
  empResponse: string | null;
  attachmentFileId: string | null;
}

export async function listShowcauseWarningLetters(userId: number): Promise<ShowcauseWarningLetterEntry[]> {
  const rows = await prisma.showcause_warning_letter.findMany({ where: { user_id: userId }, orderBy: { date: "desc" } });
  return rows.map((r) => ({
    id: r.showcause_warning_letter_id,
    type: r.type,
    date: r.date ? r.date.toISOString().slice(0, 10) : null,
    issuedBy: r.issued_by,
    status: r.status,
    reason: r.reason,
    empResponse: r.emp_response,
    attachmentFileId: r.attachment_file_id,
  }));
}

export interface PipEntry {
  id: number;
  startDate: string | null;
  endDate: string | null;
  supervisor: string | null;
  reviewResult: string | null;
  improvementGoal: string | null;
  remark: string | null;
}

export async function listPips(userId: number): Promise<PipEntry[]> {
  const rows = await prisma.pip.findMany({ where: { user_id: userId }, orderBy: { start_date: "desc" } });
  return rows.map((r) => ({
    id: r.pip_id,
    startDate: r.start_date ? r.start_date.toISOString().slice(0, 10) : null,
    endDate: r.end_date ? r.end_date.toISOString().slice(0, 10) : null,
    supervisor: r.supervisor,
    reviewResult: r.review_result,
    improvementGoal: r.improvement_goal,
    remark: r.remark,
  }));
}

export interface DisciplinarySummaryRow {
  date: string | null;
  type: string;
  description: string | null;
}

// Merges all 4 disciplinary tables into one read-only Date/Type/Description
// list, newest first — matches active_disciplinary.html's combined summary
// table exactly (the stage-flow's Disciplinary tab has no per-type add form;
// those live in Employee Record's Disciplinary category instead).
export async function listDisciplinarySummary(userId: number): Promise<DisciplinarySummaryRow[]> {
  const [inquiries, suspensions, showcauses, pips] = await Promise.all([
    listDomesticInquiries(userId),
    listSuspensionLetters(userId),
    listShowcauseWarningLetters(userId),
    listPips(userId),
  ]);
  const rows: DisciplinarySummaryRow[] = [
    ...inquiries.map((r) => ({ date: r.date, type: "Domestic Inquiry", description: r.caseSummary })),
    ...suspensions.map((r) => ({ date: r.startDate, type: "Suspension Letter", description: r.reason })),
    ...showcauses.map((r) => ({ date: r.date, type: "Showcause/ Warning Letter", description: r.reason })),
    ...pips.map((r) => ({ date: r.startDate, type: "Performance Improvement Plan", description: r.reviewResult })),
  ];
  rows.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return rows;
}

// ─── Exit stage's 3 singleton tables (resignation/reference_letter/
// exit_interview_note) — same "return null if no row" convention as nda/
// probation. ───

export interface ResignationInfo {
  submissionDate: string | null;
  lastWorkingDate: string | null;
  reason: string | null;
  resignLetterFileId: string | null;
  acceptLetterFileId: string | null;
  exitType: string | null;
}

export async function getResignation(userId: number): Promise<ResignationInfo | null> {
  const row = await prisma.resignation.findUnique({ where: { user_id: userId } });
  if (!row) return null;
  return {
    submissionDate: row.submission_date ? row.submission_date.toISOString().slice(0, 10) : null,
    lastWorkingDate: row.last_working_date ? row.last_working_date.toISOString().slice(0, 10) : null,
    reason: row.reason,
    resignLetterFileId: row.resign_letter_file_id,
    acceptLetterFileId: row.accept_letter_file_id,
    exitType: row.exit_type,
  };
}

export interface ReferenceLetterInfo {
  requestDate: string | null;
  type: string | null;
  issuedDate: string | null;
  issuedBy: string | null;
  remark: string | null;
  issuedLetterFileId: string | null;
}

export async function getReferenceLetter(userId: number): Promise<ReferenceLetterInfo | null> {
  const row = await prisma.reference_letter.findUnique({ where: { user_id: userId } });
  if (!row) return null;
  return {
    requestDate: row.request_date ? row.request_date.toISOString().slice(0, 10) : null,
    type: row.type,
    issuedDate: row.issued_date ? row.issued_date.toISOString().slice(0, 10) : null,
    issuedBy: row.issued_by,
    remark: row.remark,
    issuedLetterFileId: row.issued_letter_file_id,
  };
}

export interface ExitInterviewNoteInfo {
  date: string | null;
  interviewer: string | null;
  reason: string | null;
  note: string | null;
}

export async function getExitInterviewNote(userId: number): Promise<ExitInterviewNoteInfo | null> {
  const row = await prisma.exit_interview_note.findUnique({ where: { user_id: userId } });
  if (!row) return null;
  return {
    date: row.date ? row.date.toISOString().slice(0, 10) : null,
    interviewer: row.interviewer,
    reason: row.reason,
    note: row.note,
  };
}

// Exit list's "Exit Type" column/filter follows the Resignation tab's own
// Exit Type field (resignation.exit_type) — same value the user sets on that
// profile page, stored as the exact display label ("Resignation"/"End of
// Contract"/"Internship Completed"/"Termination/Dismissal"). An employee with
// no value saved there yet simply gets no badge.
export async function listResignationExitTypesByUserId(userIds: number[]): Promise<Record<number, string>> {
  if (userIds.length === 0) return {};
  const rows = await prisma.resignation.findMany({
    where: { user_id: { in: userIds }, exit_type: { not: null } },
    select: { user_id: true, exit_type: true },
  });
  const map: Record<number, string> = {};
  for (const r of rows) {
    if (r.exit_type) map[r.user_id] = r.exit_type;
  }
  return map;
}

// Exit list's "Last Date" column — resignation.last_working_date is the
// authoritative HR-recorded last day for a resignation exit; employees
// without a resignation row (e.g. end-of-contract) have no such value here,
// so callers fall back to the overview row's own `date` (employment.end_date)
// for those.
export async function listLastWorkingDatesByUserId(userIds: number[]): Promise<Record<number, string>> {
  if (userIds.length === 0) return {};
  const rows = await prisma.resignation.findMany({
    where: { user_id: { in: userIds }, last_working_date: { not: null } },
    select: { user_id: true, last_working_date: true },
  });
  const map: Record<number, string> = {};
  for (const r of rows) {
    if (r.last_working_date) map[r.user_id] = r.last_working_date.toISOString().slice(0, 10);
  }
  return map;
}

// Resolves a branch/department CODE (carried through the profile URL's own
// ?locGroup=/?locCode=, set when an employee card is opened from a branch/
// dept-scoped namelist) to its display name, for the profile breadcrumb —
// mirrors js/branch-code-map.js/js/dept-code-map.js's role in the mock's own
// profile-breadcrumb.js, just resolved server-side from a code instead of a
// client-side JS map.
export async function resolveLocationName(
  group: "branch" | "department" | null,
  code: string | null,
): Promise<string | null> {
  if (!group || !code) return null;
  if (group === "branch") {
    const branches = await listBranches();
    return branches.find((b) => b.code === code)?.name ?? null;
  }
  const departments = await listDepartments();
  return departments.find((d) => d.code === code)?.name ?? null;
}

export function countEmployeeStages(rows: EmployeeOverviewRow[]): Record<EmployeeStage, number> {
  const counts: Record<EmployeeStage, number> = { pre: 0, probation: 0, onboarding: 0, active: 0, exit: 0 };
  for (const r of rows) counts[r.stage]++;
  return counts;
}

export interface StageLocationSummary {
  code: string;
  name: string;
  count: number;
}

// Sentinel location code for employees with neither a branch nor a
// department set — e.g. career_applications-synced people whose branch/
// department text didn't match anything real (see careerApplicationSync.ts).
// Without this bucket, these people were counted on the Employee Overview
// card but had no "By Branch"/"By Department" entry that would ever show
// them. Deliberately NOT used for Onboarding (see the stage === "onboarding"
// checks below) — per explicit decision, removed there once the BranchStaff
// live fallback (enrichRowsWithBranchStaffLocation) made it consistently
// empty in practice; Active/Exit keep it, their own backfill decisions are
// still pending (see conversation).
export const UNASSIGNED_LOCATION_CODE = "unassigned";
const UNASSIGNED_LOCATION_NAME = "Unassigned";

export function summarizeStageByBranch(
  rows: EmployeeOverviewRow[],
  stage: EmployeeStage,
  branches: BranchOpt[],
): StageLocationSummary[] {
  const stageRows = rows.filter((r) => r.stage === stage);
  // HQ isn't a real standalone branch location for this drill-down — every
  // Department already sits under it, so listing it as a peer of actual
  // branches (Ampang, Klang, ...) duplicates the "By Department" view and
  // confuses the two groupings. Excluded here only (not from listBranches()
  // itself, which other callers — Transfer's dropdown, the Add-employee
  // form — still need HQ in).
  const byBranch = branches
    .filter((b) => b.code !== "HQ")
    .map((b) => {
      const inBranch = stageRows.filter((r) => r.branchCode === b.code);
      return { code: b.code, name: b.name, count: inBranch.length };
    });
  if (stage === "onboarding") return byBranch;
  const unassignedCount = stageRows.filter((r) => !r.branchCode && !r.departmentCode).length;
  return [...byBranch, { code: UNASSIGNED_LOCATION_CODE, name: UNASSIGNED_LOCATION_NAME, count: unassignedCount }];
}

export function summarizeStageByDepartment(
  rows: EmployeeOverviewRow[],
  stage: EmployeeStage,
  departments: DepartmentOpt[],
): StageLocationSummary[] {
  const stageRows = rows.filter((r) => r.stage === stage);
  const byDept = departments.map((d) => {
    const inDept = stageRows.filter((r) => r.departmentCode === d.code);
    return { code: d.code, name: d.name, count: inDept.length };
  });
  if (stage === "onboarding") return byDept;
  const unassignedCount = stageRows.filter((r) => !r.branchCode && !r.departmentCode).length;
  return [...byDept, { code: UNASSIGNED_LOCATION_CODE, name: UNASSIGNED_LOCATION_NAME, count: unassignedCount }];
}

export function filterStageByLocation(
  rows: EmployeeOverviewRow[],
  stage: EmployeeStage,
  groupBy: "branch" | "department",
  code: string,
): EmployeeOverviewRow[] {
  if (code === UNASSIGNED_LOCATION_CODE) {
    if (stage === "onboarding") return [];
    return rows.filter((r) => r.stage === stage && !r.branchCode && !r.departmentCode);
  }
  return rows.filter((r) => r.stage === stage && (groupBy === "branch" ? r.branchCode === code : r.departmentCode === code));
}

// Onboarding-list dual-listing (real Probation-stage Full-Time people, and
// real Active-stage Full-Time people whose recruitment pipeline still reads
// "Probation") lives in careerApplicationSync.ts as
// matchBelongsOnOnboardingList/computeOnboardingDualListedRows — it needs
// the external career_applications/rec_recruit lookup this file doesn't
// have, so it can't be a pure function here the way isDualListedOnProbation's
// pure half is.

export interface PendingRegistration {
  id: number;
  email: string;
  fullName: string | null;
  position: string | null;
  branchCode: string | null;
  branchName: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  createdAt: string;
}

export async function listPendingRegistrations(): Promise<PendingRegistration[]> {
  const rows = await prisma.users.findMany({
    where: { status: "pending" },
    include: {
      user_profile: true,
      employment: {
        include: { branch: true, department: true },
        orderBy: { employment_id: "desc" },
        take: 1,
      },
    },
    orderBy: { created_at: "desc" },
  });
  return rows.map((u) => {
    const emp = u.employment[0];
    return {
      id: u.user_id,
      email: u.email,
      fullName: u.user_profile?.full_name ? titleCaseName(u.user_profile.full_name) : null,
      position: emp?.position ?? null,
      branchCode: emp?.branch?.branch_code ?? null,
      branchName: emp?.branch?.branch_name ?? null,
      departmentCode: emp?.department?.department_code ?? null,
      departmentName: emp?.department?.department_name ?? null,
      createdAt: u.created_at.toISOString(),
    };
  });
}

export interface TeamMember {
  id: number;
  email: string;
  fullName: string | null;
  position: string | null;
  status: string | null;
  roleType: string | null;
}

export async function listTeamMembersByDepartment(
  departmentCode: string,
  excludeUserId: number,
): Promise<TeamMember[]> {
  const rows = await prisma.users.findMany({
    where: {
      NOT: {
        OR: [
          { user_id: excludeUserId },
          { status: { in: ["pending", "archive"] } },
        ],
      },
      employment: {
        some: { department: { department_code: departmentCode } },
      },
    },
    include: {
      role: true,
      user_profile: true,
      employment: {
        where: { department: { department_code: departmentCode } },
        orderBy: { start_date: "desc" },
        take: 1,
      },
    },
    orderBy: { created_at: "asc" },
  });
  return rows.map((u) => ({
    id: u.user_id,
    email: u.email,
    fullName: u.user_profile?.full_name ? titleCaseName(u.user_profile.full_name) : null,
    position: u.employment[0]?.position ?? null,
    status: u.employment[0]?.status ?? u.status ?? null,
    roleType: u.role?.role_type ?? null,
  }));
}

export interface ResumeInfo {
  resumeFileId: string | null;
  cvFileId: string | null;
}

// Real resume table (resume_id/user_id/resume_file_id/cv_file_id) — the
// file IDs are Google Drive IDs from uploadToDrive, same storage pattern as
// leave_request.attachment/claim.attachment/offboarding_case's *_file_id
// columns. Returns nulls (not a missing row) when nothing's been uploaded
// yet, since a user with no resume/CV on file is the normal case, not an error.
export async function getResumeInfo(userId: number): Promise<ResumeInfo> {
  const row = await prisma.resume.findUnique({ where: { user_id: userId } });
  return { resumeFileId: row?.resume_file_id ?? null, cvFileId: row?.cv_file_id ?? null };
}

export interface InterviewAssessmentInfo {
  intDate: string | null;
  overallRate: number | null;
  recommendation: string | null;
  strength: string | null;
  weakness: string | null;
  hiringNote: string | null;
}

// Real interview_assessment table — Pre stage's own Interview Assessment tab
// only (NOT HR Info's "Hiring Notes" tab, which shares the same field labels
// but uses different dropdown vocabularies in the mock — Excellent/Good/
// Average/Below Average and Hire/Hold/Reject there vs. this table's 1-5
// numeric rating and Proceed/Hire/Hold/Reject, confirmed by reading both
// hr_hiringNotes.html and pre_PersonalInfo.html directly. Genuinely two
// separate forms, not a duplicate to unify like Resume/Personal Info were.
//
// hiringNote falls back to the matching career_applications row's
// feedback1 (then feedback2) when there's no real hiring_note on file yet —
// applies even when there's no interview_assessment row at all, which is the
// normal case for a freshly career_applications-synced Pre employee (every
// other field here still shows "Not provided" via the UI's own null
// handling; only hiringNote gets this fallback). `fullName` is optional so
// existing callers that don't have it handy keep working with no fallback.
export async function getInterviewAssessment(userId: number, fullName?: string): Promise<InterviewAssessmentInfo | null> {
  const row = await prisma.interview_assessment.findUnique({ where: { user_id: userId } });
  let hiringNote = row?.hiring_note ?? null;
  if (!hiringNote && fullName) {
    const { lookupCareerApplicationsByName, normalizeName } = await import("@/lib/careerApplicationSync");
    const match = (await lookupCareerApplicationsByName()).get(normalizeName(fullName));
    hiringNote = match?.hiringNote ?? null;
  }
  if (!row && !hiringNote) return null;
  return {
    intDate: row?.int_date ? row.int_date.toISOString().slice(0, 10) : null,
    overallRate: row?.overall_rate ?? null,
    recommendation: row?.recommendation ?? null,
    strength: row?.strength ?? null,
    weakness: row?.weakness ?? null,
    hiringNote,
  };
}

export interface ReferenceCheckInfo {
  refName: string | null;
  company: string | null;
  relationship: string | null;
  position: string | null;
  contactNumber: string | null;
  email: string | null;
}

// Real reference_check table — shared between Pre stage's own "Reference
// Check" tab and Employee Record's HR Info > "Reference" tab, same as
// Resume/CV. Confirmed identical field set in both mocks (Reference Name/
// Company/Relationship/Position/Contact Number/Email), unlike Interview
// Assessment/Hiring Notes which turned out to be genuinely different forms.
export async function getReferenceCheck(userId: number): Promise<ReferenceCheckInfo | null> {
  const row = await prisma.reference_check.findUnique({ where: { user_id: userId } });
  if (!row) return null;
  return {
    refName: row.ref_name,
    company: row.company,
    relationship: row.relationship,
    position: row.position,
    contactNumber: row.contact_number,
    email: row.email,
  };
}

export interface MedicalCheckInfo {
  medicalReportFileId: string | null;
  result: string | null;
}

// Real medical_check table — shared between Pre stage's own "Medical Check"
// tab and Employee Record's HR Info > "Medical Check" tab, same as Resume/CV.
// Confirmed identical field set/options in both mocks. medicalReportFileId is
// a Google Drive file ID, same storage pattern as resume.resume_file_id.
export async function getMedicalCheck(userId: number): Promise<MedicalCheckInfo | null> {
  const row = await prisma.medical_check.findUnique({ where: { user_id: userId } });
  if (!row) return null;
  return { medicalReportFileId: row.medical_report_file_id, result: row.result };
}

export interface ProbationInfo {
  probationStatus: string | null;
  startDate: string | null;
  endDate: string | null;
  confirmDate: string | null;
  extEndDate: string | null;
  confirmationLetterFileId: string | null;
  extensionLetterFileId: string | null;
}

// Real probation table — Probation stage's own tab only (no Employee Record
// equivalent exists in the mock). confirmationLetterFileId/
// extensionLetterFileId are Google Drive file IDs, same storage pattern as
// resume.resume_file_id.
export async function getProbationInfo(userId: number): Promise<ProbationInfo | null> {
  const row = await prisma.probation.findUnique({ where: { user_id: userId } });
  if (!row) return null;
  return {
    probationStatus: row.probation_status,
    startDate: row.start_date ? row.start_date.toISOString().slice(0, 10) : null,
    endDate: row.end_date ? row.end_date.toISOString().slice(0, 10) : null,
    confirmDate: row.confirm_date ? row.confirm_date.toISOString().slice(0, 10) : null,
    extEndDate: row.ext_end_date ? row.ext_end_date.toISOString().slice(0, 10) : null,
    confirmationLetterFileId: row.confirmation_letter_file_id,
    extensionLetterFileId: row.extension_letter_file_id,
  };
}

export interface DocumentsInfo {
  employmentContractFileId: string | null;
  employeeHandbookFileId: string | null;
}

// Real documents table — shared between Onboarding stage's own "Documents"
// tab (Employment Contract + Employee Handbook Acknowledge) and Employee
// Record's HR Info > "Handbook" tab (confirmed identical single field in
// both mocks — hr_handbook.html has only "Employee Handbook Acknowledge",
// same label as onboarding_document.html's second field). Employment
// Contract has no Employee Record equivalent anywhere in the mock.
// employmentContractFileId/employeeHandbookFileId are Google Drive file IDs,
// same pattern as resume.resume_file_id, each routed to its own dedicated
// Drive folder (GOOGLE_DRIVE_EMP_CONTRACT_FOLDER_ID/GOOGLE_DRIVE_HANDBOOK_FOLDER_ID).
export async function getDocuments(userId: number): Promise<DocumentsInfo | null> {
  const row = await prisma.documents.findUnique({ where: { user_id: userId } });
  if (!row) return null;
  return { employmentContractFileId: row.employment_contract_file_id, employeeHandbookFileId: row.employee_handbook_file_id };
}

export interface PayrollInfo {
  epfNumber: string | null;
  socsoNumber: string | null;
  eisNumber: string | null;
  taxNumber: string | null;
  pcbForm: string | null;
  pcbAttachmentFileId: string | null;
}

// Real payroll table — shared between Onboarding stage's own "Payroll" tab's
// Statutory Information + PCB subsections and Employee Record's Finance >
// "Tax Info" tab (confirmed identical EPF/SOCSO/EIS/Tax Number fields and
// PCB Form/PCB upload concept in both mocks — finance_taxInfo.html's PCB
// Form dropdown only shows TP1/TP3 while the schema supports TP1/TP2/TP3
// per explicit spec, a mock omission not a different form). Payroll's own
// Bank Details subsection and Employee Record's Finance > "Payroll/Payslip"
// tab are deliberately NOT covered here — Bank Details reuses the existing
// bank_details table (already on EmployeeDetailFull), and Payroll/Payslip
// (Basic Pay/Salary Type/Salary Revision History) is a genuinely different,
// still-unbacked form.
export async function getPayrollInfo(userId: number): Promise<PayrollInfo | null> {
  const row = await prisma.payroll.findUnique({ where: { user_id: userId } });
  if (!row) return null;
  return {
    epfNumber: row.epf_number,
    socsoNumber: row.socso_number,
    eisNumber: row.eis_number,
    taxNumber: row.tax_number,
    pcbForm: row.pcb_form,
    pcbAttachmentFileId: row.pcb_attachment_file_id,
  };
}

export async function getEmployeeById(userId: number): Promise<EmployeeDetailFull | null> {
  const u = await prisma.users.findUnique({
    where: { user_id: userId },
    include: {
      user_profile: true,
      bank_details: true,
      emergency_contact: { take: 1 },
      employment: {
        include: { branch: true, department: true },
        orderBy: { start_date: "desc" },
        take: 1,
      },
    },
  });
  if (!u) return null;
  const emp = u.employment[0];
  const bank = u.bank_details;
  const em = u.emergency_contact[0];
  const profile = u.user_profile;
  return {
    id: u.user_id,
    email: u.email,
    employeeId: emp?.employee_id ?? null,
    fullName: titleCaseName(profile?.full_name) || u.email,
    nickName: profile?.nick_name ? titleCaseName(profile.nick_name) : null,
    role: emp?.position ?? null,
    branchCode: emp?.branch?.branch_code ?? null,
    branchName: emp?.branch?.branch_name ?? null,
    departmentCode: emp?.department?.department_code ?? null,
    departmentName: emp?.department?.department_name ?? null,
    status: emp?.status ?? u.status ?? null,
    startDate: emp?.start_date ? emp.start_date.toISOString().slice(0, 10) : null,
    pendingOnboarding: !profile,
    gender: profile?.gender ?? null,
    dob: profile?.dob ? profile.dob.toISOString().slice(0, 10) : null,
    phone: profile?.phone ?? null,
    nationality: profile?.nationality ?? null,
    nric: profile?.nric ?? null,
    homeAddress: profile?.home_address ?? null,
    position: emp?.position ?? null,
    endDate: emp?.end_date ? emp.end_date.toISOString().slice(0, 10) : null,
    employmentType: emp?.employment_type ?? null,
    probation: emp?.probation ?? false,
    rate: emp?.rate ?? null,
    branchId: emp?.branch_id ?? null,
    departmentId: emp?.department_id ?? null,
    employmentId: emp?.employment_id ?? null,
    bankName: bank?.bank_name ?? null,
    bankAccount: bank?.bank_account ?? null,
    accountName: bank?.account_name ?? null,
    emergencyName: em?.name ? titleCaseName(em.name) : null,
    emergencyPhone: em?.phone ?? null,
    emergencyRelation: em?.relation ?? null,
    emergencyEmail: em?.email ?? null,
    emergencyAddress: em?.address ?? null,
    offerLetterFileId: emp?.offer_letter_file_id ?? null,
  };
}

// ─── Employee Record singleton/repeatable tables added alongside
// resignation/reference_letter/exit_interview_note above ───

// Repeatable — confirmed via the mock's own real "Add Another" button
// (pinfo_guardianInfo.html) — same convention as achievement.
export interface GuardianInfoEntry {
  id: number;
  name: string | null;
  relationship: string | null;
  gender: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
}

export async function listGuardianInfo(userId: number): Promise<GuardianInfoEntry[]> {
  const rows = await prisma.guardian_info.findMany({ where: { user_id: userId }, orderBy: { guardian_info_id: "asc" } });
  return rows.map((r) => ({
    id: r.guardian_info_id,
    name: r.name,
    relationship: r.relationship,
    gender: r.gender,
    email: r.email,
    phone: r.phone,
    address: r.address,
  }));
}

// Singleton — Personal Info > Payment & Bank Info's own "Payment"
// subsection (separate from bank_details, which backs "Bank Details").
export interface PaymentInfoData {
  paymentMethod: string | null;
  paymentFrequency: string | null;
  payDate: string | null;
  remark: string | null;
}

export async function getPaymentInfo(userId: number): Promise<PaymentInfoData | null> {
  const row = await prisma.payment_info.findUnique({ where: { user_id: userId } });
  if (!row) return null;
  return {
    paymentMethod: row.payment_method,
    paymentFrequency: row.payment_frequency,
    payDate: row.pay_date ? row.pay_date.toISOString().slice(0, 10) : null,
    remark: row.remark,
  };
}

// Repeatable — same shape/convention as salary_revision (own serial PK,
// user_id not unique, newest first): the form shows entries[0] ("latest"),
// the full array backs the "Performance Review History" table below it.
export interface PerformanceReviewEntry {
  id: number;
  period: string | null;
  reviewDate: string | null;
  reviewer: string | null;
  overallRating: string | null;
  comment: string | null;
  attachmentFileId: string | null;
}

export async function listPerformanceReviews(userId: number): Promise<PerformanceReviewEntry[]> {
  const rows = await prisma.performance_review.findMany({
    where: { user_id: userId },
    orderBy: { review_date: "desc" },
  });
  return rows.map((row) => ({
    id: row.performance_review_id,
    period: row.period,
    reviewDate: row.review_date ? row.review_date.toISOString().slice(0, 10) : null,
    reviewer: row.reviewer,
    overallRating: row.overall_rating,
    comment: row.comment,
    attachmentFileId: row.attachment_file_id,
  }));
}

// Singleton — Finance > Payroll/Payslip's "Basic Pay" + "Payslip"
// subsections (deliberately separate from the existing payroll table's
// EPF/SOCSO/EIS/Tax/PCB fields — no overlap).
export interface PayslipInfo {
  basicPay: string | null;
  type: string | null;
  attachmentFileId: string | null;
}

export async function getPayslip(userId: number): Promise<PayslipInfo | null> {
  const row = await prisma.payslip.findUnique({ where: { user_id: userId } });
  if (!row) return null;
  return {
    basicPay: row.basic_pay?.toString() ?? null,
    type: row.type,
    attachmentFileId: row.attachment_file_id,
  };
}

// ─── Employee Record > Task (Pending/Overdue) ───
//
// There is no daily/monthly/ceo_assigned_task/hod_assigned_task/adhoc_task
// table anywhere, in either database — Task Manager's real execution-instance
// model is a single `RunBlock` row per task, with a nullable `cadence` field
// (DAILY/MONTHLY/ADHOC) only ever set by its own "+ Add Task" quick-assign
// form. "Who assigned it" (CEO/HOD/ad hoc) isn't a table either — it's
// derived from the run's own starter role. None of that distinction matters
// here: every RunBlock a given employee is the assignee of counts, regardless
// of cadence or who assigned it.
//
// Task Manager's own User table lives in ITS OWN database
// (ebright_task_manager, via TASK_MANAGER_DATABASE_URL) — bootstrap-IMPORTED
// from hrfs (see prisma/task-manager/hrfs-map.ts), not a live join. The only
// way to find "this employee's Task Manager account" at request time is by
// matching email (unique on both sides) — an employee who was never
// bootstrapped into Task Manager (or has no account yet) simply has no tasks
// to show, not an error.
export interface EmployeeTaskRow {
  id: string;
  name: string;
  dueDate: string | null;
  /** due_date < today (strictly before, not <=) and not completed — same
   *  rule as the overdue query itself, also exposed per-row so the Pending
   *  tab can highlight the subset of pending tasks that are also overdue. */
  isOverdue: boolean;
  /** "{Role} Assigned · {Cadence}" (e.g. "HOD Assigned · Daily"), cadence
   *  omitted when untagged (e.g. "HOD Assigned"). Role is the RunBlock's
   *  own FlowRun.startedById's Task Manager role — "Self-assigned" when
   *  startedById is this same employee's own Task Manager account — same
   *  resolution groupByAssignerRole (task-manager/analytics/_lib.ts) uses,
   *  just formatted as one string instead of a bucket key. */
  source: string;
}

export interface EmployeeTasksSummary {
  pending: EmployeeTaskRow[];
  overdue: EmployeeTaskRow[];
}

// Overdue means due_date < today, NOT due_date < this exact instant — a task
// due today (stored as today's date at UTC midnight, same convention as
// every other date-only field in this codebase) must NOT count as overdue
// just because "now" is later in the day than midnight. Shared by every
// overdue check below so they can't drift out of sync with each other.
function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// Mirrors groupByAssignerRole's own bucket keys (task-manager/analytics/
// _lib.ts) — CEO/OPS/ADMIN/DEPT_SITE/BRANCH/HOD/MEMBER, plus BRANCH_SITE
// (a real Role enum value that function's own order[] omits, handled here
// defensively) — as the "{Role} Assigned" half of the Source column.
const ASSIGNER_ROLE_LABELS: Record<string, string> = {
  CEO: "CEO Assigned",
  OPS: "OPS Assigned",
  ADMIN: "Admin Assigned",
  DEPT_SITE: "Dept Site Assigned",
  BRANCH: "Branch Assigned",
  HOD: "HOD Assigned",
  MEMBER: "Member Assigned",
  BRANCH_SITE: "Branch Site Assigned",
};

// Mirrors RunBlock.cadence's Cadence enum (prisma/task-manager/schema.prisma)
// as the "· {Cadence}" half of the Source column — omitted entirely when
// cadence is null (untagged; see the field's own schema comment).
const TASK_CADENCE_LABELS: Record<string, string> = {
  DAILY: "Daily",
  MONTHLY: "Monthly",
  ADHOC: "Ad-hoc",
};

function taskSourceLabel(
  startedById: string,
  selfTmUserId: string,
  starterRoles: Map<string, string>,
  cadence: string | null,
): string {
  const roleLabel =
    startedById === selfTmUserId
      ? "Self-assigned"
      : ASSIGNER_ROLE_LABELS[starterRoles.get(startedById) ?? "MEMBER"] ?? ASSIGNER_ROLE_LABELS.MEMBER;
  const cadenceLabel = cadence ? TASK_CADENCE_LABELS[cadence] : null;
  return cadenceLabel ? `${roleLabel} · ${cadenceLabel}` : roleLabel;
}

function toEmployeeTaskRow(
  row: { id: string; title: string; dueAt: Date | null; cadence: string | null; run: { startedById: string } },
  startOfToday: Date,
  selfTmUserId: string,
  starterRoles: Map<string, string>,
): EmployeeTaskRow {
  return {
    id: row.id,
    name: row.title,
    dueDate: row.dueAt ? row.dueAt.toISOString().slice(0, 10) : null,
    isOverdue: row.dueAt !== null && row.dueAt < startOfToday,
    source: taskSourceLabel(row.run.startedById, selfTmUserId, starterRoles, row.cadence),
  };
}

export async function listEmployeeTasks(userId: number): Promise<EmployeeTasksSummary> {
  const user = await prisma.users.findUnique({ where: { user_id: userId }, select: { email: true } });
  if (!user?.email) return { pending: [], overdue: [] };

  // Task Manager's bootstrap normalizes every imported email to lowercase
  // (see hrfs-map.ts's mapHrfsUser) — match the same way here.
  const tmUser = await taskManagerPrisma.user.findUnique({
    where: { email: user.email.trim().toLowerCase() },
    select: { id: true },
  });
  if (!tmUser) return { pending: [], overdue: [] };

  const startOfToday = startOfTodayUtc();

  const [pendingRows, overdueRows] = await Promise.all([
    // "Pending" here matches Task Manager's own bucketOf() convention
    // (analytics/_lib.ts) — PENDING/ACTIVE/OVERDUE/ESCALATED all bucket to
    // "pending" there (only DONE and SKIPPED don't), not the literal
    // BlockStatus.PENDING value alone. That's not just for consistency: live
    // data confirms every currently-open task in the DB has status ACTIVE,
    // none are literally "PENDING" (the initial state before anyone opens
    // it), so filtering on the literal enum value alone would show an empty
    // tab for every employee despite real open tasks existing.
    taskManagerPrisma.runBlock.findMany({
      where: { assigneeId: tmUser.id, status: { notIn: ["DONE", "SKIPPED"] } },
      orderBy: { dueAt: "asc" },
      select: { id: true, title: true, dueAt: true, cadence: true, run: { select: { startedById: true } } },
    }),
    // Due date strictly before today and not completed — independent of the
    // current `status` label (Task Manager's own OVERDUE status is only set
    // when a periodic reminder sweep gets to it, so a still-"PENDING" row
    // past its due date belongs here too; a row can appear in both lists at
    // once).
    taskManagerPrisma.runBlock.findMany({
      where: { assigneeId: tmUser.id, status: { notIn: ["DONE", "SKIPPED"] }, dueAt: { lt: startOfToday } },
      orderBy: { dueAt: "asc" },
      select: { id: true, title: true, dueAt: true, cadence: true, run: { select: { startedById: true } } },
    }),
  ]);

  // One batched role lookup for every distinct starter across both lists
  // (they overlap heavily — overdue is a subset of pending) rather than a
  // lookup per row, same batching rationale as getOverdueTaskCounts below.
  const starterIds = new Set<string>();
  for (const r of [...pendingRows, ...overdueRows]) starterIds.add(r.run.startedById);
  const starters = await taskManagerPrisma.user.findMany({
    where: { id: { in: [...starterIds] } },
    select: { id: true, role: true },
  });
  const starterRoles = new Map(starters.map((s) => [s.id, s.role as string]));

  return {
    pending: pendingRows.map((r) => toEmployeeTaskRow(r, startOfToday, tmUser.id, starterRoles)),
    overdue: overdueRows.map((r) => toEmployeeTaskRow(r, startOfToday, tmUser.id, starterRoles)),
  };
}

// ─── Employee Folder stage namelists — red overdue-task dot ───
//
// Batched (one email lookup + one Task Manager user lookup + one grouped
// count, regardless of how many employees are on the page) rather than
// calling listEmployeeTasks per row — a namelist page can show 100+ rows at
// once, and per-row queries would mean 100+ round trips to a SEPARATE
// database. Returns a plain object (not a Map) since this is passed straight
// through from a Server Component page to a "use client" list view as a prop.
export async function getOverdueTaskCounts(userIds: number[]): Promise<Record<number, number>> {
  if (userIds.length === 0) return {};

  const users = await prisma.users.findMany({ where: { user_id: { in: userIds } }, select: { user_id: true, email: true } });
  if (users.length === 0) return {};

  const emailToUserId = new Map<string, number>();
  for (const u of users) emailToUserId.set(u.email.trim().toLowerCase(), u.user_id);

  const tmUsers = await taskManagerPrisma.user.findMany({
    where: { email: { in: [...emailToUserId.keys()] } },
    select: { id: true, email: true },
  });
  if (tmUsers.length === 0) return {};

  const tmIdToUserId = new Map<string, number>();
  for (const u of tmUsers) {
    const employeeId = emailToUserId.get(u.email);
    if (employeeId !== undefined) tmIdToUserId.set(u.id, employeeId);
  }

  const grouped = await taskManagerPrisma.runBlock.groupBy({
    by: ["assigneeId"],
    where: {
      assigneeId: { in: [...tmIdToUserId.keys()] },
      status: { notIn: ["DONE", "SKIPPED"] },
      dueAt: { lt: startOfTodayUtc() },
    },
    _count: { _all: true },
  });

  const counts: Record<number, number> = {};
  for (const g of grouped) {
    const employeeId = tmIdToUserId.get(g.assigneeId);
    if (employeeId !== undefined) counts[employeeId] = g._count._all;
  }
  return counts;
}
