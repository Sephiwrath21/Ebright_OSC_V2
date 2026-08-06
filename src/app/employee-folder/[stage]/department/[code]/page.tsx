import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import EmployeeNamelistView from "@/app/components/EmployeeNamelistView";
import ExitListView from "@/app/components/ExitListView";
import {
  filterStageByLocation,
  isEmployeeStage,
  listBranches,
  listDepartments,
  listEmployeeOverviewRows,
  listResignationExitTypesByUserId,
  listLastWorkingDatesByUserId,
  UNASSIGNED_LOCATION_CODE,
} from "@/lib/employeeQueries";
import { enrichRowsWithBranchStaffLocation, computeOnboardingDualListedRows } from "@/lib/careerApplicationSync";
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

  const [rowsBase, branches, departments] = await Promise.all([listEmployeeOverviewRows(), listBranches(), listDepartments()]);
  // Onboarding has no Unassigned bucket (see summarizeStageByDepartment) —
  // direct URL access to it 404s like any other nonexistent department code.
  const department =
    code === UNASSIGNED_LOCATION_CODE && stage !== "onboarding"
      ? { code: UNASSIGNED_LOCATION_CODE, name: "Unassigned" }
      : departments.find((d) => d.code === code);
  if (!department) notFound();

  // Same dual-listing as the summary page above it (see
  // computeOnboardingDualListedRows).
  const rowsRaw =
    stage === "onboarding"
      ? [...rowsBase, ...(await computeOnboardingDualListedRows(rowsBase)).map((r) => ({ ...r, stage: "onboarding" as const }))]
      : rowsBase;
  // Same live BranchStaff fallback as the summary page above it — must be
  // applied here too, not just there, or someone whose grouping the summary
  // corrected would still show up empty-handed on the very bucket it now
  // counts them under.
  const rows = await enrichRowsWithBranchStaffLocation(rowsRaw, branches, departments);
  const namelistRows = filterStageByLocation(rows, stage, "department", code);
  const [exitTypeByUserId, lastWorkingDateByUserId] =
    stage === "exit"
      ? await Promise.all([
          listResignationExitTypesByUserId(namelistRows.map((r) => r.id)),
          listLastWorkingDatesByUserId(namelistRows.map((r) => r.id)),
        ])
      : [undefined, undefined];

  const userEmail = session.user.email;
  const userRole = (session.user as { role?: string }).role ?? "";
  const userName = session.user.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      {stage === "exit" ? (
        <ExitListView
          rows={namelistRows}
          exitTypeByUserId={exitTypeByUserId}
          lastWorkingDateByUserId={lastWorkingDateByUserId}
          showLocation={false}
          locationContext={{ groupBy: "department", code, name: department.name }}
        />
      ) : (
        <EmployeeNamelistView
          stage={stage}
          groupBy="department"
          locationCode={code}
          locationName={department.name}
          rows={namelistRows}
        />
      )}
    </AppShell>
  );
}
