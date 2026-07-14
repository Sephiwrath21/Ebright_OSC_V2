import "server-only";
import { prisma } from "@/lib/prisma";
import { titleCaseName } from "@/lib/text";

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
  };
}
