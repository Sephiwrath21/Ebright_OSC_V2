import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import DepartmentDashboard from "@/app/components/DepartmentDashboard";
import { getDepartment } from "@/lib/departments";
import { resolveAllowedDepartments } from "@/lib/department-access";
import { getDepartmentDataset } from "@/lib/clickup-api";
import { getEvents } from "@/lib/ebrightleads";
import { getHqAttendanceToday } from "@/lib/ebright-hrfs";

export const dynamic = "force-dynamic";

export default async function ClickUpDepartmentPage({
  params,
}: {
  params: Promise<{ dept: string }>;
}) {
  const { dept } = await params;
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const department = getDepartment(dept);
  if (!department) notFound();

  const userEmail = session.user?.email ?? "";
  const userRole = (session.user as { role?: string } | undefined)?.role ?? "";
  const userName = session.user?.name ?? null;

  // Access control: send users back to the picker if this department isn't
  // one they're allowed to open. (Build-first: everyone is allowed all.)
  const allowed = await resolveAllowedDepartments(userEmail, userRole);
  if (!allowed.some((d) => d.slug === department.slug)) {
    redirect("/clickup-task");
  }

  const dataset = await getDepartmentDataset(department.slug);
  const events = await getEvents().catch(() => []);
  const attendance = await getHqAttendanceToday().catch(() => ({
    present: 0,
    absent: 0,
    mc: 0,
    annualLeave: 0,
    presentNames: [],
    absentNames: [],
    mcNames: [],
    annualLeaveNames: [],
  }));

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <DepartmentDashboard
        departmentName={department.name}
        slug={department.slug}
        dataset={dataset}
        attendance={attendance}
        events={events}
        userName={userName}
        userEmail={userEmail}
      />
    </AppShell>
  );
}
