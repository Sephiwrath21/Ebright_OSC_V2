import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import StageLocationsView from "@/app/components/StageLocationsView";
import StageFlatListView from "@/app/components/StageFlatListView";
import ExitListView from "@/app/components/ExitListView";
import {
  isEmployeeStage,
  listBranches,
  listDepartments,
  listEmployeeOverviewRows,
  listResignationExitTypesByUserId,
  listLastWorkingDatesByUserId,
  listUpcomingOnboardingCandidates,
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
    // Pre also includes future hires with no portal account yet, sourced
    // from the ebrightleads-synced onboarding_candidate table, plus the
    // Branch/Department option lists for the "+ Add" form.
    let branches: Awaited<ReturnType<typeof listBranches>> | undefined;
    let departments: Awaited<ReturnType<typeof listDepartments>> | undefined;
    if (stage === "pre") {
      const [candidates, branchList, departmentList] = await Promise.all([
        listUpcomingOnboardingCandidates(stageRows),
        listBranches(),
        listDepartments(),
      ]);
      stageRows.push(...candidates);
      branches = branchList;
      departments = departmentList;
    }
    return (
      <AppShell email={userEmail} role={userRole} name={userName}>
        <StageFlatListView stage={stage} rows={stageRows} branches={branches} departments={departments} />
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

  // Exit skips the By Branch/By Department selection screen entirely for
  // HR/Superadmin too — straight to one combined, cross-location list
  // (with its own Branch/Department column + filter) instead of making them
  // pick a location first, unlike Onboarding/Active which keep that step.
  if (stage === "exit" && scope?.fullAccess) {
    const [rows, branches, departments] = await Promise.all([listEmployeeOverviewRows(), listBranches(), listDepartments()]);
    const exitRows = rows.filter((r) => r.stage === "exit");
    const exitUserIds = exitRows.map((r) => r.id);
    const [exitTypeByUserId, lastWorkingDateByUserId] = await Promise.all([
      listResignationExitTypesByUserId(exitUserIds),
      listLastWorkingDatesByUserId(exitUserIds),
    ]);
    return (
      <AppShell email={userEmail} role={userRole} name={userName}>
        <ExitListView
          rows={exitRows}
          exitTypeByUserId={exitTypeByUserId}
          lastWorkingDateByUserId={lastWorkingDateByUserId}
          showLocation
          branches={branches}
          departments={departments}
        />
      </AppShell>
    );
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
