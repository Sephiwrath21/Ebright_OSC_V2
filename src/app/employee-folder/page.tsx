import { auth } from "@/auth";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import EmployeeOverviewView from "@/app/components/EmployeeOverviewView";
import {
  listEmployeeOverviewRows,
  listBranches,
  listDepartments,
  countEmployeeStages,
  getOverdueTaskCounts,
} from "@/lib/employeeQueries";
import { getCurrentEmployeeScope, filterRowsByScope } from "@/lib/employeeScope";
import {
  lookupCareerApplicationsByName,
  enrichRowsWithBranchStaffLocation,
  computePreStageRows,
  computePreStartDatePassedRows,
  matchIsProbationPipeline,
  matchIsProbationOverrideExcluded,
  matchBelongsOnOnboardingList,
  normalizeName,
} from "@/lib/careerApplicationSync";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Employee Folder",
};

export default async function EmployeeFolderPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  // Individual staff logins (ownUserId scope) skip this dashboard entirely —
  // straight to their own Employee Record (the same consolidated Personal
  // Info/HR Info/Finance/Active Employment/Disciplinary/Task view every
  // "Employee Records" table row links to — see EmployeeOverviewView.tsx —
  // not the stage-flow profile template), same as clicking any stage nav
  // link (see [stage]/page.tsx). /employee-record/[id] already applies this
  // same ownUserId scope check itself (via getEmployeeOverviewRowById), so
  // there's nothing more to validate here before redirecting. A dashboard
  // of cards/records showing just one row isn't a meaningful landing page
  // for an individual login anyway.
  const scope = await getCurrentEmployeeScope();
  if (scope?.ownUserId != null) redirect(`/employee-record/${scope.ownUserId}`);

  const rowsRaw = await listEmployeeOverviewRows();
  // Same live BranchStaff fallback the Probation/Onboarding pages use — the
  // "Employee Records" table (EmployeeOverviewView) shows this same
  // Branch/Department column, so it needs the same read-only fallback for
  // rows whose own employment record has neither set yet. Fills in
  // display only, never writes back.
  const [branches, departments] = await Promise.all([listBranches(), listDepartments()]);
  const rows = await enrichRowsWithBranchStaffLocation(rowsRaw, branches, departments);
  const counts = countEmployeeStages(rows);
  // Pre's card count must match what its own list page shows — Pre's
  // membership is no longer employment.status="pre" (see
  // computePreStageRows for the current, replaced definition); the
  // "Employee Records" table below still shows real employment.status="pre"
  // rows under a "Pre" pill regardless (their real employment row is
  // untouched by this), so the table's own per-row labels and this card's
  // total can now legitimately disagree — expected, not a bug, since they
  // answer two different questions (this session's own real-time
  // recruitment status vs. this table's stored employment record).
  const prePipelineRows = await computePreStageRows();
  counts.pre = scope ? filterRowsByScope(scope, prePipelineRows).length : 0;
  //
  // Both Probation's and Onboarding's card counts must match what their own
  // list pages show — Probation's membership rule is an OR across
  // career_applications.board_stage and rec_recruit/rec_stage.name (see
  // matchIsProbationPipeline), which can both ADD non-Probation-stage rows
  // and REMOVE real-Probation-stage rows whose manual flag neither pipeline
  // field corroborates anymore (matchIsProbationOverrideExcluded);
  // Onboarding's ADDS real Probation-stage Full-Time rows and real
  // Active-stage Full-Time rows the same pipeline check flags Probation
  // (matchBelongsOnOnboardingList) — see [stage]/page.tsx for the full
  // rationale on both. Same lookup, same rules, applied here just for the
  // counts; the "Employee Records" table below keeps showing each person
  // once, under their real stage, so this only adjusts counts, never rows.
  const careerApplications = await lookupCareerApplicationsByName();
  let probationCount = 0;
  let onboardingDualListedCount = 0;
  for (const row of rows) {
    const match = careerApplications.get(normalizeName(row.fullName));
    if (row.stage === "probation") {
      if (!matchIsProbationOverrideExcluded(match)) probationCount += 1;
    } else if (matchIsProbationPipeline(match)) {
      probationCount += 1;
    }
    if (matchBelongsOnOnboardingList(row, match)) onboardingDualListedCount += 1;
  }
  counts.probation = probationCount;
  // Real Pre-eligible people whose resolved start date has already passed
  // also count toward Onboarding — see computePreStartDatePassedRows.
  const prePassedRows = await computePreStartDatePassedRows();
  const prePassedCount = scope ? filterRowsByScope(scope, prePassedRows).length : 0;
  counts.onboarding += onboardingDualListedCount + prePassedCount;
  const overdueTaskCounts = await getOverdueTaskCounts(rows.map((r) => r.id));

  const userEmail = session.user.email;
  const userRole = (session.user as { role?: string }).role ?? "";
  const userName = session.user.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <EmployeeOverviewView rows={rows} counts={counts} userName={userName} overdueTaskCounts={overdueTaskCounts} />
    </AppShell>
  );
}
