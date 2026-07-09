import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/app/components/AppShell";
import LeaveRequestsView, {
  type LeaveRow,
  type LeaveStatusCounts,
} from "@/app/components/LeaveRequestsView";
import { HOD_POSITION, formatLeaveDisplayId, resolveLeaveRecordsAccess } from "./approval-logic";
import { getActiveDepartmentId, loadHodPending } from "./approval-queries";

export const dynamic = "force-dynamic";

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");


  if (
    resolveLeaveRecordsAccess({
      role: (session.user as { role?: string } | undefined)?.role ?? "",
      email: session.user.email,
    }).kind !== "none"
  ) {
    redirect("/attendance/leave/records");
  }

  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: {
      user_id: true,
      employment: {
        where: { status: "active" },
        take: 1,
        select: { department: { select: { department_code: true, department_name: true } } },
      },
    },
  });
  if (!me) redirect("/login");

  const userRole = (session.user as { role?: string } | undefined)?.role ?? "";
  const userPosition = (session.user as { position?: string | null } | undefined)?.position ?? "";

  const myDept = me.employment[0]?.department;
  const deptCode = myDept?.department_code?.toUpperCase() ?? "";
  const deptName = myDept?.department_name?.toLowerCase() ?? "";
  const isHR = deptCode === "HR" || deptName.includes("human resource");
  const viewOnly = userRole === "superadmin" || isHR;

  const requests = await prisma.leave_request.findMany({
    where: viewOnly ? {} : { user_id: me.user_id },
    orderBy: { applied_at: "desc" },
    include: {
      leave_types: { select: { leave_type_code: true, name: true } },
      users_leave_request_user_idTousers: viewOnly
        ? {
            select: {
              email: true,
              user_profile: { select: { full_name: true } },
            },
          }
        : false,
    },
  });

  const rows: LeaveRow[] = requests.map((r) => ({
    leaveId: r.leave_id,
    displayId: formatLeaveDisplayId(r.leave_types.leave_type_code, r.leave_id),
    leaveTypeCode: r.leave_types.leave_type_code,
    leaveTypeName: r.leave_types.name,
    startDate: r.start_date.toISOString().slice(0, 10),
    endDate: r.end_date.toISOString().slice(0, 10),
    totalDays: Number(r.total_days),
    reason: r.reason,
    rejectionReason: r.remarks,
    status: r.status,
    appliedAt: r.applied_at.toISOString(),
  }));

  const counts: LeaveStatusCounts = {
    total: rows.length,
    pending: 0,
    hod_approved: 0,
    approved: 0,
    rejected: 0,
    cancelled: 0,
  };
  for (const r of rows) {
    if (r.status in counts) counts[r.status as keyof LeaveStatusCounts] += 1;
  }

  const userEmail = session.user?.email ?? "";
  const userName = session.user?.name ?? null;

  const isHod = userPosition === HOD_POSITION;
  const departmentId = isHod ? await getActiveDepartmentId(me.user_id) : null;
  const approvalItems = departmentId != null ? await loadHodPending(departmentId) : [];

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <LeaveRequestsView
        rows={rows}
        counts={counts}
        canApprove={isHod}
        viewerIsHod={isHod}
        approvalItems={approvalItems}
      />
    </AppShell>
  );
}
