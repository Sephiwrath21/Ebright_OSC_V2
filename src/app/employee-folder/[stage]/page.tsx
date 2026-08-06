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
  summarizeStageByBranch,
  summarizeStageByDepartment,
} from "@/lib/employeeQueries";
import {
  lookupCareerApplicationsByName,
  lookupBranchStaffLocationByName,
  enrichRowsWithBranchStaffLocation,
  computeOnboardingDualListedRows,
  matchIsProbationPipeline,
  matchIsProbationOverrideExcluded,
  normalizeName,
} from "@/lib/careerApplicationSync";
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
    let stageRows = rows.filter((r) => r.stage === stage);
    // ebrightleads (onboarding_candidate) is no longer merged into Pre —
    // disabled per decision; Pre now only reflects real employment rows
    // (status="pre") plus, going forward, ebright_hrfs/career_applications
    // syncs. Still fetch Branch/Department for the "+ Add" form.
    let branches: Awaited<ReturnType<typeof listBranches>> | undefined;
    let departments: Awaited<ReturnType<typeof listDepartments>> | undefined;
    if (stage === "pre") {
      const [branchList, departmentList, careerApplications] = await Promise.all([
        listBranches(),
        listDepartments(),
        lookupCareerApplicationsByName(),
      ]);
      branches = branchList;
      departments = departmentList;
      // Status column shows the matching career_applications row's current
      // board_stage — live, not a snapshot from sync time. Rows with no
      // match (e.g. manually added via addPreStageEmployee) keep boardStage
      // undefined, so the list falls back to the plain "Pre" pill.
      for (const row of stageRows) {
        row.boardStage = careerApplications.get(normalizeName(row.fullName))?.boardStage ?? null;
      }
    } else if (stage === "probation") {
      // Probation-list membership, per explicit decision (see
      // conversation): a person belongs here if EITHER
      // career_applications.board_stage OR rec_recruit/rec_stage.name reads
      // "Probation" — an OR across both external pipeline fields, since
      // each has separately been caught disagreeing with reality (and with
      // each other). This can both ADD a row whose real, stored stage is
      // something else entirely — Onboarding, or even Active, since the
      // recruitment pipeline can lag behind someone's real progress — and
      // REMOVE a row whose employment.probation flag is true (set by a
      // manual "Proceed" click) when NEITHER pipeline field corroborates it
      // anymore (matchIsProbationOverrideExcluded). No change to what's
      // stored either way — this is display-only, same as before. A row's
      // profile link always stays on /probation/employee/[id] here;
      // [id]/page.tsx's guard (isDualListedOnProbation) allows it through
      // for anyone this same OR-rule matches and renders the Probation
      // profile template, while visiting that same person from their real
      // stage's own list still shows that stage's own template.
      const [careerApplications, branchList, departmentList] = await Promise.all([
        lookupCareerApplicationsByName(),
        listBranches(),
        listDepartments(),
      ]);
      branches = branchList;
      departments = departmentList;
      const branchStaffByName = await lookupBranchStaffLocationByName(branchList, departmentList);

      stageRows = stageRows.filter(
        (row) => !matchIsProbationOverrideExcluded(careerApplications.get(normalizeName(row.fullName))),
      );

      const otherRows = rows.filter((r) => r.stage !== "probation");
      for (const row of otherRows) {
        if (!matchIsProbationPipeline(careerApplications.get(normalizeName(row.fullName)))) continue;
        // Branch/Department: prefer the row's own real employment data;
        // BranchStaff (ebright_hrfs's operational roster) only fills in
        // when that's null — mid-pipeline dual-listed rows commonly have
        // neither branch_id nor department_id set yet in our own system.
        const loc = branchStaffByName.get(normalizeName(row.fullName));
        stageRows.push({
          ...row,
          branchCode: row.branchCode ?? loc?.branchCode ?? null,
          branchName: row.branchName ?? loc?.branchName ?? null,
          departmentCode: row.departmentCode ?? loc?.departmentCode ?? null,
          departmentName: row.departmentName ?? loc?.departmentName ?? null,
        });
      }
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

  const [rowsBase, branches, departments] = await Promise.all([
    listEmployeeOverviewRows(),
    listBranches(),
    listDepartments(),
  ]);
  // Real Probation-stage Full-Time people, and real Active-stage Full-Time
  // people whose recruitment pipeline still reads "Probation", also count
  // toward Onboarding here — see computeOnboardingDualListedRows — as
  // clones with stage overridden to "onboarding" so the existing
  // r.stage === stage filtering inside summarizeStageByBranch/Department
  // picks them up for free. Their own stored stage is untouched; this
  // array only exists for this render.
  const rowsRaw =
    stage === "onboarding"
      ? [...rowsBase, ...(await computeOnboardingDualListedRows(rowsBase)).map((r) => ({ ...r, stage: "onboarding" as const }))]
      : rowsBase;
  // Same live BranchStaff fallback the Probation list uses — someone whose
  // own employment row has neither branch_id nor department_id set yet
  // (e.g. Onboarding/Active people still mid-pipeline) would otherwise only
  // ever show up under "Unassigned" here despite the operational HR roster
  // already having their real location. Read-only: fills in this summary's
  // counts/grouping only, never writes back to the employment record.
  const rows = await enrichRowsWithBranchStaffLocation(rowsRaw, branches, departments);

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
