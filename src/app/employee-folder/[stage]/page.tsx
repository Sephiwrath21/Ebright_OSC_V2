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
import { lookupCareerApplicationsByName, normalizeName } from "@/lib/careerApplicationSync";
import { BOARD_STAGE_TO_OUR_STAGE } from "@/lib/boardStageMapping";
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
      // Dual-listing, display-only — per explicit decision (see
      // conversation): someone whose career_applications board_stage is
      // "Probation" keeps their real, stored stage of Onboarding (the sync's
      // mapping deliberately folds board_stage=Probation into Onboarding,
      // not a separate stage) — but the Probation list ALSO shows them,
      // alongside genuinely-Probation-stage rows. No change to what's
      // stored; row.profileStage points their link at their real
      // (Onboarding) profile, since that's where it actually lives. Driven
      // by board_stage directly, NOT rec_recruit/rec_stage — the two
      // disagree often enough (see conversation) that rec_stage was dropped
      // entirely from this logic.
      const onboardingRows = rows.filter((r) => r.stage === "onboarding");
      if (onboardingRows.length > 0) {
        const careerApplications = await lookupCareerApplicationsByName();
        for (const row of onboardingRows) {
          const match = careerApplications.get(normalizeName(row.fullName));
          if (match?.boardStage && BOARD_STAGE_TO_OUR_STAGE[match.boardStage]?.alsoShowOnProbationList) {
            stageRows.push({ ...row, profileStage: "onboarding" });
          }
        }
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
