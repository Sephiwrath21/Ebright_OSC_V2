import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import StageLocationsView from "@/app/components/StageLocationsView";
import StageFlatListView from "@/app/components/StageFlatListView";
import {
  isEmployeeStage,
  listBranches,
  listDepartments,
  listEmployeeOverviewRows,
  summarizeStageByBranch,
  summarizeStageByDepartment,
} from "@/lib/employeeQueries";
import { STAGE_PROFILE_CONFIG } from "@/lib/stageProfileConfig";
import { getCurrentEmployeeScope } from "@/lib/employeeScope";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ stage: string }>;
  searchParams: Promise<{ by?: string }>;
}

export default async function EmployeeFolderStagePage({ params, searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const { stage } = await params;
  if (!isEmployeeStage(stage)) notFound();

  const userEmail = session.user.email;
  const userRole = (session.user as { role?: string }).role ?? "";
  const userName = session.user.name ?? null;

  // Reference (pre.html / probation.html): these two stages skip the
  // Branch/Department drill-down entirely — flat list straight to a profile.
  if (!STAGE_PROFILE_CONFIG[stage].hasLocationLayer) {
    const rows = await listEmployeeOverviewRows();
    const stageRows = rows.filter((r) => r.stage === stage);
    return (
      <AppShell email={userEmail} role={userRole} name={userName}>
        <StageFlatListView stage={stage} rows={stageRows} />
      </AppShell>
    );
  }

  // Department/branch-scoped accounts have only one possible location to
  // drill into (their own) — skip the "By Branch / By Department" selection
  // screen entirely and land them straight on their own filtered list,
  // consistent with the breadcrumb pattern (Employee Overview > Active >
  // Marketing) rather than making them pick their own department from a
  // list of every department. HR/Superadmin (fullAccess) keep seeing the
  // selection screen unchanged.
  const scope = await getCurrentEmployeeScope();
  if (scope && !scope.fullAccess) {
    if (scope.departmentCode) redirect(`/employee-folder/${stage}/department/${scope.departmentCode}`);
    if (scope.branchCode) redirect(`/employee-folder/${stage}/branch/${scope.branchCode}`);
  }

  const { by } = await searchParams;
  const groupBy = by === "department" ? "department" : "branch";

  const [rows, branches, departments] = await Promise.all([
    listEmployeeOverviewRows(),
    listBranches(),
    listDepartments(),
  ]);

  const locations =
    groupBy === "branch"
      ? summarizeStageByBranch(rows, stage, branches)
      : summarizeStageByDepartment(rows, stage, departments);

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <StageLocationsView stage={stage} groupBy={groupBy} locations={locations} />
    </AppShell>
  );
}
