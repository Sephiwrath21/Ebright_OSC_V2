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
  const enrichedRows = await enrichRowsWithBranchStaffLocation(rowsRaw, branches, departments);

  // Correct Pre-stage membership to match computePreStageRows() — the same
  // definition the dedicated Pre list and its own summary card use — per
  // explicit decision (see conversation): the Employee Records table's
  // Status filter was disagreeing with the summary card (209 raw
  // employment.status="pre" rows vs the card's correct 41) because it read
  // row.stage straight from the old stageForRow() computation. Applied here
  // upstream, once, so EmployeeOverviewView's own filter logic
  // (row.stage !== statusFilter) needs no separate copy of this correction —
  // it just reads the already-corrected value.
  const [correctedPreRows, prePassedRows] = await Promise.all([
    computePreStageRows(),
    computePreStartDatePassedRows(),
  ]);
  // Real accounts, corrected in place below. onboarding_candidate-only
  // people (negative id, no portal account yet; see isCandidate) are kept
  // separately and appended after — getOnboardingCandidateDetail (see
  // employeeQueries.ts) gives /employee-record/[id] a real route for a
  // negative id now, same as the dedicated Pre list's own profile page, so
  // they belong in this table too, not just the summary card's total.
  // computePreStageRows() itself returns unscoped rows (see its own
  // comment), so — same as the dedicated Pre list page — these need their
  // own explicit filterRowsByScope call; unlike the real accounts above,
  // they never passed through listEmployeeOverviewRows()'s own internal
  // scoping, so skipping this would leak candidates outside a department/
  // branch-scoped viewer's own scope straight into this table.
  const correctedPreCandidates = scope
    ? filterRowsByScope(scope, correctedPreRows.filter((r) => r.isCandidate))
    : [];
  const correctedPreById = new Map(correctedPreRows.filter((r) => !r.isCandidate).map((r) => [r.id, r]));
  const prePassedById = new Map(prePassedRows.map((r) => [r.id, r]));
  const rows = enrichedRows
    .filter((r) => r.stage !== "pre" || correctedPreById.has(r.id) || prePassedById.has(r.id))
    .map((r) => {
      // Real stage says something other than Pre (e.g. Tang Rui's own
      // employment.status="active") but the corrected Pre definition —
      // including its own narrow, id-keyed exceptions (see
      // PRE_OVERRIDE_EXCEPTION_USER_IDS) — says they belong on Pre instead.
      // Must be checked even when r.stage !== "pre", not just when it is —
      // that's exactly the Tang Rui case, and the earlier version of this
      // fix silently missed it by only ever converting existing "pre" rows.
      const corrected = correctedPreById.get(r.id);
      if (corrected) return { ...r, stage: "pre" as const, date: corrected.date };
      const passed = prePassedById.get(r.id);
      return passed ? { ...r, stage: passed.stage, date: passed.date } : r;
    })
    .concat(correctedPreCandidates);

  const counts = countEmployeeStages(rows);
  // `rows` above already includes the scope-filtered candidates, so this
  // recomputes the same number countEmployeeStages(rows) just derived —
  // kept explicit (rather than relied on implicitly) so this card's count
  // stays correct even if a future change to `rows` above narrows what the
  // table itself displays.
  counts.pre = scope ? filterRowsByScope(scope, correctedPreRows).length : 0;
  //
  // Probation's card count must match what its own list page shows —
  // Probation's membership rule is an OR across career_applications.
  // board_stage and rec_recruit/rec_stage.name (see matchIsProbationPipeline),
  // which can both ADD non-Probation-stage rows and REMOVE real-Probation-
  // stage rows whose manual flag neither pipeline field corroborates
  // anymore (matchIsProbationOverrideExcluded); Onboarding's dual-listing
  // ADDS real Probation-stage Full-Time rows and real Active-stage
  // Full-Time rows the same pipeline check flags Probation
  // (matchBelongsOnOnboardingList) — see [stage]/page.tsx for the full
  // rationale on both. Same lookup, same rules, applied here just for the
  // counts — deliberately over enrichedRows (the full, pre-correction
  // population), not the Pre-corrected `rows` above: this OR-rule is its
  // own independent, still list-only mechanism (per explicit decision, NOT
  // folded into row.stage itself — see conversation), unaffected by the
  // separate Pre correction. The "Employee Records" table below keeps
  // showing each person once, under their real stage, so this only adjusts
  // counts, never rows.
  const careerApplications = await lookupCareerApplicationsByName();
  let probationCount = 0;
  let onboardingDualListedCount = 0;
  for (const row of enrichedRows) {
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
