import "server-only";
import { prisma } from "@/lib/prisma";
import { positionGroup } from "@/lib/employeeStages";

// Scheduled sweep (see instrumentation.ts) for the two "N days since
// entering this stage, if nobody clicked Next first" auto-transitions —
// Onboarding -> Active and Probation -> next stage. Both reuse
// employment.start_date as the "entered this stage" timestamp: it's set
// once, to today, whenever proceedFromPreStage() runs (the Pre -> Onboarding
// /Probation transition), and no later proceedFrom* action ever touches it
// again — so for an employee who is CURRENTLY in Onboarding or Probation,
// start_date already means exactly "when they entered that stage." (User-
// confirmed decision — no new column.)
//
// Both sweeps are safe to re-run on every interval without a "was this
// already processed" marker (unlike transferAutomation.ts's reverted_at):
// the WHERE clause that selects candidates (status === "onboarding", or
// probation === true) stops matching the instant the row is actually
// advanced, so an already-processed employee simply falls out of the next
// sweep's own query — no risk of double-processing or of touching an
// employee who has since moved further along.

// Day-of-week exclusion rule, per user decision — NOT calendar days and NOT
// the standard Mon-Fri business-day convention:
//   - HQ employees (employment.department_id set): only Tue/Wed/Thu/Fri/Sat
//     count toward the 3 days; Sun and Mon are skipped entirely.
//   - Everyone else (branch_id set — Coach/BM/Protege/Intern/etc.): only
//     Wed/Thu/Fri/Sat/Sun count; Mon and Tue are skipped.
// An employment row with neither branch_id nor department_id set (no
// location on file at all) defaults to the branch rule, since department_id
// is the specific HQ marker and its absence more likely means "not HQ."
// getUTCDay(): 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat.
const HQ_EXCLUDED_DAYS = new Set([0, 1]); // Sun, Mon
const BRANCH_EXCLUDED_DAYS = new Set([1, 2]); // Mon, Tue

// Counts qualifying days strictly AFTER `enteredAt` up to and including
// `today` — "3 days have passed since they entered" means 3 days elapsed
// after entry, not counting the entry day itself.
export function countQualifyingDaysSince(enteredAt: Date, today: Date, isHQ: boolean): number {
  const excluded = isHQ ? HQ_EXCLUDED_DAYS : BRANCH_EXCLUDED_DAYS;
  const cursor = new Date(Date.UTC(enteredAt.getUTCFullYear(), enteredAt.getUTCMonth(), enteredAt.getUTCDate()));
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  const todayMidnight = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  let count = 0;
  while (cursor <= todayMidnight) {
    if (!excluded.has(cursor.getUTCDay())) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

const REQUIRED_QUALIFYING_DAYS = 3;

// Pre -> Onboarding/Probation, the "start_date has arrived, nobody clicked
// Next first" path — proceedFromPreStage (employeeRecordActions.ts) already
// exists for the manual click and writes the identical fields; this sweep
// applies the same end state the instant start_date passes, no elapsed-day
// count involved (unlike the two sweeps above). employment.status is
// literally "pre" only for employees still awaiting this exact transition —
// addPreStageEmployee sets it at creation, and this is the only place it
// gets written away from "pre" automatically (the click path also does,
// unconditionally). Once this runs, the row no longer matches this sweep's
// own WHERE clause, so re-running it on every interval is safe.
export async function advancePreStageEmployees(): Promise<number> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const rows = await prisma.employment.findMany({
    // `not: null` is explicit, not load-bearing — `lte` already excludes
    // NULL start_date rows under normal SQL three-valued logic (a Pre row
    // synced from career_applications with no start_date yet just never
    // matches this WHERE clause until one is set). Spelled out anyway so
    // that's obvious from reading this query alone.
    where: { status: "pre", start_date: { not: null, lte: new Date(`${todayIso}T00:00:00Z`) } },
    select: { employment_id: true, position: true },
  });

  let advanced = 0;
  for (const emp of rows) {
    const isFullTime = positionGroup(emp.position) === "Full Time";
    await prisma.employment.update({
      where: { employment_id: emp.employment_id },
      data: { status: isFullTime ? "active" : "onboarding", probation: isFullTime },
    });
    advanced++;
  }
  return advanced;
}

// Onboarding -> Active, the "3 days passed, nobody clicked Next" path —
// the button-click path (proceedFromOnboarding, employeeRecordActions.ts)
// already exists and writes the identical fields; this sweep just applies
// the same end state on a timer instead of waiting for a click.
export async function advanceOnboardingToActive(): Promise<number> {
  const rows = await prisma.employment.findMany({
    where: { status: "onboarding", start_date: { not: null } },
    select: { employment_id: true, start_date: true, department_id: true },
  });

  const today = new Date();
  let advanced = 0;
  for (const emp of rows) {
    if (!emp.start_date) continue;
    const isHQ = emp.department_id !== null;
    if (countQualifyingDaysSince(emp.start_date, today, isHQ) >= REQUIRED_QUALIFYING_DAYS) {
      await prisma.employment.update({
        where: { employment_id: emp.employment_id },
        data: { status: "active", probation: false },
      });
      advanced++;
    }
  }
  return advanced;
}

// Probation -> next stage (onboarding — same target proceedFromProbation
// already uses), per the 3-tier priority rule:
//   1. probation_status is "Stopped" or "Extended" -> never auto-advance,
//      regardless of elapsed time or anything else.
//   2. (handled by the existing manual "Next" button/proceedFromProbation,
//      not this sweep — that action already requires probation_status
//      === "Confirmed" and fires immediately on click.)
//   3. probation_status is empty/unset (null) AND 3 qualifying days have
//      passed since entering Probation -> auto-advance.
// Any other non-empty status (e.g. "In Progress", "Confirmed") falls
// through both this sweep's own check and rule 1's block — per the letter
// of the spec, only a literally-empty status is eligible for the automatic
// path; "Confirmed" still requires the manual click.
export async function advanceProbationToNext(): Promise<number> {
  const rows = await prisma.employment.findMany({
    where: { probation: true, start_date: { not: null } },
    select: { employment_id: true, user_id: true, start_date: true, department_id: true },
  });
  if (rows.length === 0) return 0;

  const probationRows = await prisma.probation.findMany({
    where: { user_id: { in: rows.map((r) => r.user_id) } },
    select: { user_id: true, probation_status: true },
  });
  const statusByUserId = new Map(probationRows.map((p) => [p.user_id, p.probation_status]));

  const today = new Date();
  let advanced = 0;
  for (const emp of rows) {
    if (!emp.start_date) continue;
    const status = statusByUserId.get(emp.user_id) ?? null;
    if (status) continue; // Stopped/Extended (rule 1) and anything else non-empty (e.g. Confirmed/In Progress) are all skipped here
    const isHQ = emp.department_id !== null;
    if (countQualifyingDaysSince(emp.start_date, today, isHQ) >= REQUIRED_QUALIFYING_DAYS) {
      await prisma.employment.update({
        where: { employment_id: emp.employment_id },
        data: { status: "onboarding", probation: false },
      });
      advanced++;
    }
  }
  return advanced;
}
