import "server-only";
import { prisma } from "@/lib/prisma";
import { titleCaseName } from "@/lib/text";
import { EMPLOYEE_STAGES, STAGE_LABELS, isEmployeeStage, type EmployeeStage } from "@/lib/employeeStages";

export { EMPLOYEE_STAGES, STAGE_LABELS, isEmployeeStage };
export type { EmployeeStage };

export const ROLE_OPTIONS = ["FT CEO", "FT HOD", "FT EXEC", "BM", "FT COACH", "PT COACH", "INTERN"] as const;
export type RoleOption = (typeof ROLE_OPTIONS)[number];

export const STATUS_OPTIONS = ["active", "onboarding", "inactive", "archive"] as const;
export type StatusOption = (typeof STATUS_OPTIONS)[number];

// role_id values from the `role` table: 1 superadmin, 2 ceo, 3 department,
// 4 branch, 5 regional manager, 6 staff.
export const STAFF_ROLE_ID = 6;

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
  fullName: string;
  position: string | null;
  branchCode: string | null;
  branchName: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  employmentType: string | null;
  date: string | null;
  stage: EmployeeStage;
}

// employment.status only distinguishes active/onboarding/inactive/archive, so
// "probation" and "exit" are derived from the probation flag and the
// inactive/archive statuses respectively — there's no separate DB stage for them.
function stageFromEmployment(status: string | null, probation: boolean): EmployeeStage {
  if (status === "onboarding") return "onboarding";
  if (status === "inactive" || status === "archive") return "exit";
  if (probation) return "probation";
  return "active";
}

export async function listEmployeeOverviewRows(): Promise<EmployeeOverviewRow[]> {
  const [pending, staff] = await Promise.all([
    prisma.users.findMany({
      where: { status: "pending" },
      include: {
        user_profile: true,
        employment: { include: { branch: true, department: true }, orderBy: { employment_id: "desc" }, take: 1 },
      },
      orderBy: { created_at: "desc" },
    }),
    prisma.users.findMany({
      where: { role_id: STAFF_ROLE_ID, NOT: { status: "pending" } },
      include: {
        user_profile: true,
        employment: { include: { branch: true, department: true }, orderBy: { start_date: "desc" }, take: 1 },
      },
      orderBy: { created_at: "desc" },
    }),
  ]);

  const pendingRows: EmployeeOverviewRow[] = pending.map((u) => {
    const emp = u.employment[0];
    return {
      id: u.user_id,
      fullName: titleCaseName(u.user_profile?.full_name) || u.email,
      position: emp?.position ?? null,
      branchCode: emp?.branch?.branch_code ?? null,
      branchName: emp?.branch?.branch_name ?? null,
      departmentCode: emp?.department?.department_code ?? null,
      departmentName: emp?.department?.department_name ?? null,
      employmentType: emp?.employment_type ?? null,
      date: u.created_at.toISOString().slice(0, 10),
      stage: "pre",
    };
  });

  const staffRows: EmployeeOverviewRow[] = staff.map((u) => {
    const emp = u.employment[0];
    const stage = stageFromEmployment(emp?.status ?? u.status ?? null, emp?.probation ?? false);
    const dateSource = stage === "exit" ? emp?.end_date ?? u.updated_at : emp?.start_date ?? u.created_at;
    return {
      id: u.user_id,
      fullName: titleCaseName(u.user_profile?.full_name) || u.email,
      position: emp?.position ?? null,
      branchCode: emp?.branch?.branch_code ?? null,
      branchName: emp?.branch?.branch_name ?? null,
      departmentCode: emp?.department?.department_code ?? null,
      departmentName: emp?.department?.department_name ?? null,
      employmentType: emp?.employment_type ?? null,
      date: dateSource.toISOString().slice(0, 10),
      stage,
    };
  });

  return [...pendingRows, ...staffRows];
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

export type RealExitType = "resignation" | "eoc";

// Real offboarding_case.case_type only distinguishes Resign/ContractEnded —
// the mock's other two exit types (Termination/Internship Completed) have no
// real signal, so employees without a matching case simply get no badge
// rather than a guessed one.
export async function listExitTypesByUserId(userIds: number[]): Promise<Record<number, RealExitType>> {
  if (userIds.length === 0) return {};
  const cases = await prisma.offboarding_case.findMany({
    where: { user_id: { in: userIds } },
    orderBy: { created_at: "desc" },
    distinct: ["user_id"],
    select: { user_id: true, case_type: true },
  });
  const map: Record<number, RealExitType> = {};
  for (const c of cases) {
    if (c.case_type === "Resign") map[c.user_id] = "resignation";
    else if (c.case_type === "ContractEnded") map[c.user_id] = "eoc";
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

export function summarizeStageByBranch(
  rows: EmployeeOverviewRow[],
  stage: EmployeeStage,
  branches: BranchOpt[],
): StageLocationSummary[] {
  const stageRows = rows.filter((r) => r.stage === stage);
  return branches.map((b) => {
    const inBranch = stageRows.filter((r) => r.branchCode === b.code);
    return { code: b.code, name: b.name, count: inBranch.length };
  });
}

export function summarizeStageByDepartment(
  rows: EmployeeOverviewRow[],
  stage: EmployeeStage,
  departments: DepartmentOpt[],
): StageLocationSummary[] {
  const stageRows = rows.filter((r) => r.stage === stage);
  return departments.map((d) => {
    const inDept = stageRows.filter((r) => r.departmentCode === d.code);
    return { code: d.code, name: d.name, count: inDept.length };
  });
}

export function filterStageByLocation(
  rows: EmployeeOverviewRow[],
  stage: EmployeeStage,
  groupBy: "branch" | "department",
  code: string,
): EmployeeOverviewRow[] {
  return rows.filter((r) => r.stage === stage && (groupBy === "branch" ? r.branchCode === code : r.departmentCode === code));
}

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
export async function getInterviewAssessment(userId: number): Promise<InterviewAssessmentInfo | null> {
  const row = await prisma.interview_assessment.findUnique({ where: { user_id: userId } });
  if (!row) return null;
  return {
    intDate: row.int_date ? row.int_date.toISOString().slice(0, 10) : null,
    overallRate: row.overall_rate,
    recommendation: row.recommendation,
    strength: row.strength,
    weakness: row.weakness,
    hiringNote: row.hiring_note,
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
  };
}
