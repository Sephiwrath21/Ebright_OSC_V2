import { prisma } from "@/lib/prisma";
import { formatLeaveDisplayId } from "./approval-logic";

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

export async function loadHodPending(departmentId: number): Promise<HodPendingRow[]> {
  const rows = await prisma.leave_request.findMany({
    where: pendingWhere(departmentId),
    orderBy: { applied_at: "asc" },
    include: {
      leave_types: { select: { leave_type_code: true, name: true } },
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
      displayId: formatLeaveDisplayId(r.leave_types.leave_type_code, r.leave_id),
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

/** HOD-approved requests, company-wide, awaiting HR's final approval. */
export async function loadHrQueue(): Promise<HodPendingRow[]> {
  const rows = await prisma.leave_request.findMany({
    where: { status: "hod_approved" },
    orderBy: { applied_at: "asc" },
    include: {
      leave_types: { select: { leave_type_code: true, name: true } },
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
      displayId: formatLeaveDisplayId(r.leave_types.leave_type_code, r.leave_id),
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

export async function countHrQueue(): Promise<number> {
  return prisma.leave_request.count({ where: { status: "hod_approved" } });
}


export interface LeaveRecordRow {
  leaveId: number;
  displayId: string;
  requesterName: string;
  departmentName: string | null;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string | null;
  rejectionReason: string | null;
  status: string;
  appliedAt: string;
}

const recordInclude = {
  leave_types: { select: { leave_type_code: true, name: true } },
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
} as const;

type LeaveRecordQueryRow = {
  leave_id: number;
  start_date: Date;
  end_date: Date;
  total_days: unknown;
  reason: string | null;
  remarks: string | null;
  status: string;
  applied_at: Date;
  leave_types: { leave_type_code: string; name: string };
  users_leave_request_user_idTousers: {
    user_profile: { full_name: string } | null;
    employment: { department: { department_name: string } | null }[];
  };
};

function toRecordRow(r: LeaveRecordQueryRow): LeaveRecordRow {
  const requester = r.users_leave_request_user_idTousers;
  return {
    leaveId: r.leave_id,
    displayId: formatLeaveDisplayId(r.leave_types.leave_type_code, r.leave_id),
    requesterName: requester.user_profile?.full_name ?? "Unknown",
    departmentName: requester.employment[0]?.department?.department_name ?? null,
    leaveTypeName: r.leave_types.name,
    startDate: r.start_date.toISOString().slice(0, 10),
    endDate: r.end_date.toISOString().slice(0, 10),
    totalDays: Number(r.total_days),
    reason: r.reason,
    rejectionReason: r.remarks,
    status: r.status,
    appliedAt: r.applied_at.toISOString(),
  };
}

export async function getDepartmentIdByName(name: string): Promise<number | null> {
  const dept = await prisma.department.findFirst({
    where: { department_name: name },
    select: { department_id: true },
  });
  return dept?.department_id ?? null;
}


export async function loadAllLeaveRecords(): Promise<LeaveRecordRow[]> {
  const rows = await prisma.leave_request.findMany({
    orderBy: { applied_at: "desc" },
    include: recordInclude,
  });
  return rows.map(toRecordRow);
}


export async function loadDepartmentLeaveRecords(departmentId: number): Promise<LeaveRecordRow[]> {
  const rows = await prisma.leave_request.findMany({
    where: {
      users_leave_request_user_idTousers: {
        employment: { some: { status: "active", department_id: departmentId } },
      },
    },
    orderBy: { applied_at: "desc" },
    include: recordInclude,
  });
  return rows.map(toRecordRow);
}
