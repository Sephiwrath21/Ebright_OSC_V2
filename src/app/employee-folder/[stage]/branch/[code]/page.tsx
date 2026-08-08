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
import {
  enrichRowsWithBranchStaffLocation,
  computeRealAccountLifecycleOverrides,
  computePreStartDatePassedRows,
  lookupCareerApplicationsByName,
} from "@/lib/careerApplicationSync";
import { getCurrentEmployeeScope } from "@/lib/employeeScope";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ stage: string; code: string }>;
}

export default async function EmployeeFolderBranchNamelistPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const { stage, code } = await params;
  if (!isEmployeeStage(stage)) notFound();

  // Block direct-URL access to another branch's namelist for a scoped
  // account — this account's own scope key isn't "this branch" (either
  // they're department-scoped, branch-scoped to a different branch, or
  // scoped to nothing), so there's nothing here for them to legitimately
  // browse to, not just an empty list.
  const scope = await getCurrentEmployeeScope();
  if (!scope) redirect("/login");
  if (!scope.fullAccess && scope.branchCode !== code) notFound();

  const [rowsBaseRaw, branches, departments, careerApplications] = await Promise.all([
    listEmployeeOverviewRows(),
    listBranches(),
    listDepartments(),
    lookupCareerApplicationsByName(),
  ]);
  // Onboarding has no Unassigned bucket (see summarizeStageByBranch) —
  // direct URL access to it 404s like any other nonexistent branch code.
  const branch =
    code === UNASSIGNED_LOCATION_CODE && stage !== "onboarding"
      ? { code: UNASSIGNED_LOCATION_CODE, name: "Unassigned" }
      : branches.find((b) => b.code === code);
  if (!branch) notFound();

  // Same real-account Probation/Onboarding/Active membership as Employee
  // Overview and this stage's own summary page (see
  // computeRealAccountLifecycleOverrides's own comment) — this namelist is
  // the leaf a summary card's count links through to, so it has to resolve
  // every row's stage identically, or the two disagree (see conversation:
  // this page used to run the old, pre-redesign computeOnboardingDualListedRows
  // independently of the summary page's overrides, producing duplicate rows
  // for anyone dual-listed on Probation+Onboarding).
  const overrides = await computeRealAccountLifecycleOverrides(rowsBaseRaw, careerApplications);
  const rowsBase = rowsBaseRaw.map((r) => {
    const o = overrides.get(r.id);
    return o ? { ...r, stage: o.stage } : r;
  });
  const rowsRaw =
    stage === "onboarding"
      ? [
          ...rowsBase,
          ...rowsBaseRaw
            .filter((r) => overrides.get(r.id)?.extraStages?.includes("onboarding"))
            .map((r) => ({ ...r, stage: "onboarding" as const })),
          ...(await computePreStartDatePassedRows()),
        ]
      : rowsBase;
  // Same live BranchStaff fallback as the summary page above it — must be
  // applied here too, not just there, or someone whose grouping the summary
  // corrected would still show up empty-handed on the very bucket it now
  // counts them under.
  const rows = await enrichRowsWithBranchStaffLocation(rowsRaw, branches, departments);
  const namelistRows = filterStageByLocation(rows, stage, "branch", code);
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
          locationContext={{ groupBy: "branch", code, name: branch.name }}
        />
      ) : (
        <EmployeeNamelistView
          stage={stage}
          groupBy="branch"
          locationCode={code}
          locationName={branch.name}
          rows={namelistRows}
        />
      )}
    </AppShell>
  );
}
