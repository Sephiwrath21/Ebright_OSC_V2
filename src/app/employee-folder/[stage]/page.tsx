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
  computePreStageRows,
  computePreStartDatePassedRows,
  computeRealAccountLifecycleOverrides,
  normalizeName,
} from "@/lib/careerApplicationSync";
import { STAGE_PROFILE_CONFIG } from "@/lib/stageProfileConfig";
import { getCurrentEmployeeScope, filterRowsByScope } from "@/lib/employeeScope";

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

  // Individual staff logins (ownUserId scope) never see any list/overview
  // here — regardless of which stage nav link they clicked, they land
  // straight on their own Employee Record (same consolidated view every
  // "Employee Records" table row links to, not the stage-flow profile
  // template — see employee-folder/page.tsx's matching redirect for the
  // full rationale). /employee-record/[id] applies this same ownUserId
  // scope check itself, so there's nothing more to validate before
  // redirecting. Fetched once and reused below (both by the department/
  // branch redirect further down and Exit's own fullAccess branch) instead
  // of re-querying getCurrentEmployeeScope() a second time.
  const scope = await getCurrentEmployeeScope();
  if (scope?.ownUserId != null) redirect(`/employee-record/${scope.ownUserId}`);

  // Reference (pre.html / probation.html): these two stages skip the
  // Branch/Department drill-down entirely — flat list straight to a profile.
  if (!STAGE_PROFILE_CONFIG[stage].hasLocationLayer) {
    // Pre membership, per explicit decision (see conversation) — REPLACES
    // the earlier "real employment.status='pre' or future start_date"
    // definition entirely (not additive, unlike Probation's OR-rule below):
    // computePreStageRows() is the sole source of truth now, live from
    // career_applications.board_stage / hrfs.onboarding_candidate, with its
    // own real-data-wins override baked in (see that function's own
    // comment). Scope-filtered here the same way listEmployeeOverviewRows()
    // filters everything else, since computePreStageRows() itself returns
    // unscoped rows (it needs every real row, unscoped, to correctly apply
    // its own override check before scope ever enters the picture).
    if (stage === "pre") {
      const [preRows, branchList, departmentList] = await Promise.all([
        computePreStageRows(),
        listBranches(),
        listDepartments(),
      ]);
      const stageRows = scope ? filterRowsByScope(scope, preRows) : [];
      return (
        <AppShell email={userEmail} role={userRole} name={userName}>
          <StageFlatListView stage={stage} rows={stageRows} branches={branchList} departments={departmentList} />
        </AppShell>
      );
    }

    const rows = await listEmployeeOverviewRows();
    let stageRows = rows.filter((r) => r.stage === stage);
    let branches: Awaited<ReturnType<typeof listBranches>> | undefined;
    let departments: Awaited<ReturnType<typeof listDepartments>> | undefined;
    if (stage === "probation") {
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
      const [careerApplications, branchList, departmentList, prePassedRows] = await Promise.all([
        lookupCareerApplicationsByName(),
        listBranches(),
        listDepartments(),
        computePreStartDatePassedRows(),
      ]);
      branches = branchList;
      departments = departmentList;
      const branchStaffByName = await lookupBranchStaffLocationByName(branchList, departmentList);

      // Real-account Probation membership — see
      // computeRealAccountLifecycleOverrides's own comment. Replaces the
      // old excludeOverrideRejectedRows/computeActivePipelineProbationPassedIds/
      // matchIsProbationPipeline-driven membership entirely for real
      // accounts; career_applications board_stage/rec_stage is no longer
      // consulted for this.
      const overrides = await computeRealAccountLifecycleOverrides(rows, careerApplications);

      // Real rows already at raw stage "probation" whose override says
      // otherwise (Confirmed -> active) drop off this list.
      stageRows = stageRows.filter((r) => {
        const o = overrides.get(r.id);
        return !o || o.stage === "probation";
      });

      // Anyone else (raw stage onboarding/active) whose override now says
      // "probation" joins this list too.
      for (const row of rows) {
        if (row.stage === "probation") continue;
        if (overrides.get(row.id)?.stage !== "probation") continue;
        // Branch/Department: prefer the row's own real employment data;
        // BranchStaff (ebright_hrfs's operational roster) only fills in
        // when that's null — mid-pipeline dual-listed rows commonly have
        // neither branch_id nor department_id set yet in our own system.
        const loc = branchStaffByName.get(normalizeName(row.fullName));
        stageRows.push({
          ...row,
          stage: "probation",
          branchCode: row.branchCode ?? loc?.branchCode ?? null,
          branchName: row.branchName ?? loc?.branchName ?? null,
          departmentCode: row.departmentCode ?? loc?.departmentCode ?? null,
          departmentName: row.departmentName ?? loc?.departmentName ?? null,
        });
      }

      // Candidate-only rows (no real portal account yet) whose start_date
      // has passed and who resolve Full Time also belong on this list —
      // see computePreStartDatePassedRows's own extraStages. Real accounts
      // with the same flag are already covered by the overrides loop above
      // (computeRealAccountLifecycleOverrides); this only adds the
      // candidate-only ones that function can't reach (out of scope for it,
      // see conversation).
      for (const passed of prePassedRows) {
        if (!passed.isCandidate) continue;
        if (!passed.extraStages?.includes("probation")) continue;
        stageRows.push(passed);
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

  const [rowsBaseRaw, branches, departments, careerApplications] = await Promise.all([
    listEmployeeOverviewRows(),
    listBranches(),
    listDepartments(),
    lookupCareerApplicationsByName(),
  ]);
  // Real-account Probation/Onboarding/Active membership — see
  // computeRealAccountLifecycleOverrides's own comment. Replaces
  // excludeOverrideRejectedRows/computeActivePipelineProbationPassedIds/
  // matchIsProbationPipeline/computeOnboardingDualListedRows's role in
  // deciding this for real accounts.
  const overrides = await computeRealAccountLifecycleOverrides(rowsBaseRaw, careerApplications);
  const rowsBase = rowsBaseRaw.map((r) => {
    const o = overrides.get(r.id);
    return o ? { ...r, stage: o.stage } : r;
  });
  // A raw-active-but-not-yet-Confirmed Full Time row's stage is already
  // overridden to "probation" in rowsBase above, so the Active branch's own
  // r.stage === "active" filtering (inside summarizeStageByBranch/
  // Department) naturally excludes it — no separate filter needed here.
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
