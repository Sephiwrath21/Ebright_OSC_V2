import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import EmployeeNamelistView from "@/app/components/EmployeeNamelistView";
import {
  filterStageByLocation,
  isEmployeeStage,
  listDepartments,
  listEmployeeOverviewRows,
  listExitTypesByUserId,
} from "@/lib/employeeQueries";
import { getCurrentEmployeeScope } from "@/lib/employeeScope";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ stage: string; code: string }>;
}

export default async function EmployeeFolderDepartmentNamelistPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const { stage, code } = await params;
  if (!isEmployeeStage(stage)) notFound();

  // Block direct-URL access to another department's namelist for a scoped
  // account — same reasoning as the branch namelist page.
  const scope = await getCurrentEmployeeScope();
  if (!scope) redirect("/login");
  if (!scope.fullAccess && scope.departmentCode !== code) notFound();

  const [rows, departments] = await Promise.all([listEmployeeOverviewRows(), listDepartments()]);
  const department = departments.find((d) => d.code === code);
  if (!department) notFound();

  const namelistRows = filterStageByLocation(rows, stage, "department", code);
  const exitTypeByUserId =
    stage === "exit" ? await listExitTypesByUserId(namelistRows.map((r) => r.id)) : undefined;

  const userEmail = session.user.email;
  const userRole = (session.user as { role?: string }).role ?? "";
  const userName = session.user.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <EmployeeNamelistView
        stage={stage}
        groupBy="department"
        locationCode={code}
        locationName={department.name}
        rows={namelistRows}
        exitTypeByUserId={exitTypeByUserId}
      />
    </AppShell>
  );
}
