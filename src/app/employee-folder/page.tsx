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
  lookupBranchStaffPositionGroupByName,
  enrichRowsWithBranchStaffLocation,
  computePreStageRows,
  computePreStartDatePassedRows,
  computeRealAccountLifecycleOverrides,
} from "@/lib/careerApplicationSync";
import { computeProbationReminderCandidates } from "@/lib/probationDecision";

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
  const enrichedRowsAll = await enrichRowsWithBranchStaffLocation(rowsRaw, branches, departments);

  // The old "manual probation flag vs. recruitment pipeline contradiction"
  // exclusion (excludeOverrideRejectedRows) no longer applies — Probation/
  // Onboarding/Active membership for real accounts is now decided by
  // computeRealAccountLifecycleOverrides (start_date + position + Probation
  // Confirm/day-count), not by career_applications board_stage/rec_stage at
  // all, so there's nothing left for that contradiction check to catch.
  // careerApplications is still fetched here — computeRealAccountLifecycle
  // Overrides' Confirm check (via isEffectivelyConfirmed) still reads
  // status2, and the Probation reminder card further down still needs it.
  // branchStaffPositionGroups is fetched once here and threaded through
  // every call below that needs it (computePreStageRows/
  // computePreStartDatePassedRows, computeRealAccountLifecycleOverrides,
  // computeProbationReminderCandidates) — this page used to trigger that
  // same unfiltered BranchStaff query up to 5 times independently.
  const [careerApplications, branchStaffPositionGroups] = await Promise.all([
    lookupCareerApplicationsByName(),
    lookupBranchStaffPositionGroupByName(),
  ]);
  const enrichedRows = enrichedRowsAll;

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
    computePreStageRows(branchStaffPositionGroups),
    computePreStartDatePassedRows(branchStaffPositionGroups),
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
  // Candidate-only rows whose start_date has passed (see
  // computePreStartDatePassedRows) — same treatment as correctedPreCandidates
  // above, just landing on Onboarding (+ Probation extraStages for Full
  // Time) instead of Pre.
  const passedPreCandidates = scope
    ? filterRowsByScope(scope, prePassedRows.filter((r) => r.isCandidate))
    : [];
  const correctedPreById = new Map(correctedPreRows.filter((r) => !r.isCandidate).map((r) => [r.id, r]));
  const prePassedById = new Map(prePassedRows.map((r) => [r.id, r]));

  // Real-account Probation/Onboarding/Active membership — see
  // computeRealAccountLifecycleOverrides's own comment in
  // careerApplicationSync.ts. Candidate-only rows (passedPreCandidates) are
  // untouched by this, unrelated feature — counted separately below.
  const overrides = await computeRealAccountLifecycleOverrides(enrichedRows, careerApplications, branchStaffPositionGroups);

  let probationCount = 0;
  let onboardingDualListedCount = 0;
  for (const o of overrides.values()) {
    if (o.stage === "probation") probationCount += 1;
    if (o.extraStages?.includes("onboarding")) onboardingDualListedCount += 1;
  }
  // Candidate-only rows whose start_date has passed and resolve Full Time
  // (see passedPreCandidates above) count toward Probation too — they never
  // pass through overrides above since they have no real users/employment
  // row to be in enrichedRows with.
  for (const c of passedPreCandidates) {
    if (c.extraStages?.includes("probation")) probationCount += 1;
  }

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
      const passed = prePassedById.get(r.id);
      const base = corrected
        ? { ...r, stage: "pre" as const, date: corrected.date }
        : passed
          ? { ...r, stage: passed.stage, date: passed.date }
          : r;
      // Real-account Probation/Onboarding/Active override (see
      // computeRealAccountLifecycleOverrides) — genuinely Active now,
      // Probation+Onboarding dual-listed, or Onboarding-only, whatever the
      // raw base stage said.
      const override = overrides.get(r.id);
      if (!override) return base;
      return { ...base, stage: override.stage, extraStages: override.extraStages };
    })
    .concat(correctedPreCandidates)
    .concat(passedPreCandidates);

  const counts = countEmployeeStages(rows);
  // `rows` above already includes the scope-filtered candidates, so this
  // recomputes the same number countEmployeeStages(rows) just derived —
  // kept explicit (rather than relied on implicitly) so this card's count
  // stays correct even if a future change to `rows` above narrows what the
  // table itself displays.
  counts.pre = scope ? filterRowsByScope(scope, correctedPreRows).length : 0;
  counts.probation = probationCount;
  counts.onboarding += onboardingDualListedCount;
  const overdueTaskCounts = await getOverdueTaskCounts(rows.map((r) => r.id));

  // Red dot on the Probation card — same reminder rule as the notification
  // bell (see probationDecision.ts's computeProbationReminderCandidates),
  // fed by the same real-account Probation population computeRealAccount
  // LifecycleOverrides above just resolved (Full Time, not yet Confirmed).
  const probationBadgedCandidates = enrichedRows.filter((r) => overrides.get(r.id)?.stage === "probation");
  const probationReminders = await computeProbationReminderCandidates(
    probationBadgedCandidates,
    careerApplications,
    branchStaffPositionGroups,
  );

  const userEmail = session.user.email;
  const userRole = (session.user as { role?: string }).role ?? "";
  const userName = session.user.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <EmployeeOverviewView
        rows={rows}
        counts={counts}
        userName={userName}
        overdueTaskCounts={overdueTaskCounts}
        probationReminderNames={probationReminders.map((r) => r.fullName)}
      />
    </AppShell>
  );
}
