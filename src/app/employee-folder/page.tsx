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
import {
  lookupCareerApplicationsByName,
  enrichRowsWithBranchStaffLocation,
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

  const rowsRaw = await listEmployeeOverviewRows();
  // Same live BranchStaff fallback the Probation/Onboarding pages use — the
  // "Employee Records" table (EmployeeOverviewView) shows this same
  // Branch/Department column, so it needs the same read-only fallback for
  // rows whose own employment record has neither set yet. Fills in
  // display only, never writes back.
  const [branches, departments] = await Promise.all([listBranches(), listDepartments()]);
  const rows = await enrichRowsWithBranchStaffLocation(rowsRaw, branches, departments);
  const counts = countEmployeeStages(rows);
  // ebrightleads (onboarding_candidate) is no longer merged into Pre —
  // disabled per decision; Pre now only reflects real employment rows
  // (status="pre") plus, going forward, ebright_hrfs/career_applications
  // syncs. See listUpcomingOnboardingCandidates in employeeQueries.ts,
  // still defined but no longer called from here.
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
  counts.onboarding += onboardingDualListedCount;
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
