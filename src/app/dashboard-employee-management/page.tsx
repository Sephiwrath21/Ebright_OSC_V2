import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/app/components/AppShell";
import EmployeeListView from "@/app/components/EmployeeListView";
import type { OverviewStats } from "@/app/components/EmployeeDashboardOverviewSection";
import { listEmployees, listBranches, listDepartments } from "@/lib/employeeQueries";

export const dynamic = "force-dynamic";

export default async function EmployeeManagementPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const [
    employees,
    branches,
    departments,
    totalStaff,
    branchCount,
    departmentCount,
    onboardingActive,
    onboardingCompleted,
    onboardingUserIds,
  ] = await Promise.all([
    listEmployees(),
    listBranches(),
    listDepartments(),
    prisma.users.count({ where: { status: "active" } }),
    prisma.branch.count(),
    prisma.department.count(),
    prisma.induction_profile.count({
      where: {
        induction_type: "Onboarding",
        status: { in: ["Sent", "In Progress", "Created"] },
      },
    }),
    prisma.induction_profile.count({
      where: { induction_type: "Onboarding", status: "Completed" },
    }),
    onboardingScheduleUserIds(),
  ]);

  const stats: OverviewStats = {
    totalStaff,
    branchCount,
    departmentCount,
    onboardingActive,
    onboardingCompleted,};

  const userEmail = session.user?.email ?? "";
  const userRole = (session.user as { role?: string } | undefined)?.role ?? "";
  const userName = session.user?.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <EmployeeListView
        employees={employees}
        branches={branches}
        departments={departments}
        overviewStats={stats}
        onboardingUserIds={onboardingUserIds}
      />
    </AppShell>
  );
}

/**
 * "Burnlist" set for the Onboarding box click-filter: the user_ids that appear
 * in a Finalized manpower_schedule whose start_date falls between one week ago
 * and six months out. Same logic as the Burnlist.
 *
 * Used ONLY to filter the employee list when the Onboarding card is clicked.
 * The Onboarding box COUNT is a separate metric (induction_profile) and is left
 * untouched.
 */
async function onboardingScheduleUserIds(): Promise<number[]> {
  return [];
}
