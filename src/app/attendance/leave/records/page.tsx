import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import AppShell from "@/app/components/AppShell";
import LeaveRecordsView from "@/app/components/LeaveRecordsView";
import {
  resolveLeaveRecordsAccess,
  OPTIMISATION_DEPARTMENT_NAME,
  HR_OVERVIEW_EMAIL,
} from "../approval-logic";
import {
  getActiveDepartmentId,
  getDepartmentIdByName,
  loadAllLeaveRecords,
  loadDepartmentLeaveRecords,
  type LeaveRecordRow,
} from "../approval-queries";

export const dynamic = "force-dynamic";

export default async function LeaveRecordsPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const role = (session.user as { role?: string } | undefined)?.role ?? "";
  const email = session.user.email;
  const access = resolveLeaveRecordsAccess({ role, email });
  if (access.kind === "none") redirect("/home");

  let rows: LeaveRecordRow[] = [];
  let scopeLabel = "Leave Requests";

  if (access.kind === "all") {
    rows = await loadAllLeaveRecords();
    scopeLabel = "All Leave Requests";
  } else if (access.kind === "optimisation") {
    const deptId = await getDepartmentIdByName(OPTIMISATION_DEPARTMENT_NAME);
    rows = deptId != null ? await loadDepartmentLeaveRecords(deptId) : [];
    scopeLabel = `${OPTIMISATION_DEPARTMENT_NAME} Leave Requests`;
  } else {
    const me = await prisma.users.findUnique({
      where: { email },
      select: { user_id: true },
    });
    const deptId = me ? await getActiveDepartmentId(me.user_id) : null;
    rows = deptId != null ? await loadDepartmentLeaveRecords(deptId) : [];
    scopeLabel = rows[0]?.departmentName
      ? `${rows[0].departmentName} Leave Requests`
      : "Department Leave Requests";
  }

  const userName = session.user.name ?? null;
  const canApprove = email.toLowerCase() === HR_OVERVIEW_EMAIL;

  return (
    <AppShell email={email} role={role} name={userName}>
      <LeaveRecordsView scopeLabel={scopeLabel} rows={rows} canApprove={canApprove} />
    </AppShell>
  );
}
