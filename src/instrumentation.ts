/**
 * instrumentation.ts — Next.js server startup hook.
 *
 * register() is called once when the Node.js server boots. We start the
 * scanner-sync polling loop here so it runs in the same process as the app.
 * Guarded by NEXT_RUNTIME so it doesn't run in the Edge runtime or browser.
 *
 * Docs: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */

const SCANNER_SYNC_INTERVAL_MS = 10_000; // 10 seconds — matches the old app's cadence

const TASK_RECURRENCE_SWEEP_MS = 60 * 60 * 1000; // hourly

const TRANSFER_REVERT_SWEEP_MS = 60 * 60 * 1000; // hourly — end_date is a calendar date, not a time, so hourly is more than enough resolution

const STAGE_TRANSITION_SWEEP_MS = 60 * 60 * 1000; // hourly — same reasoning as the transfer-revert sweep, day-level granularity only

// Disabled per explicit decision — Onboarding -> Active and Probation ->
// next-stage should only happen via the manual "Next" button for now, not
// automatically after 3 qualifying days. Code is left in place (not
// deleted) in stageTransitionAutomation.ts's advanceOnboardingToActive() and
// advanceProbationToNext(); flip this back to true to re-enable both. This
// does NOT affect advancePreStageEmployees() (Pre -> Onboarding/Probation
// the instant start_date arrives — a different, still-active mechanism) or
// the career-application sync, both of which keep running below regardless.
const ONBOARDING_PROBATION_SWEEP_ENABLED = false;

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Local-dev safety valve: when DISABLE_BACKGROUND_JOBS is set, skip ALL the
  // background sweeps below. These sweeps WRITE to the database (transfer
  // reverts, stage advances, scanner + career-application sync), so running a
  // dev instance against the live/production DB would mutate real data from a
  // laptop. Set DISABLE_BACKGROUND_JOBS=true in that .env to boot the app for
  // UI/SSO testing without any of the writers firing. Unset in real
  // deployments — default behaviour is unchanged when the flag is absent.
  if (process.env.DISABLE_BACKGROUND_JOBS === "true") {
    console.log(
      "[instrumentation] DISABLE_BACKGROUND_JOBS=true — skipping all background sweeps (scanner-sync, transfer-revert, stage-transition, career-application-sync).",
    );
    return;
  }

  const { syncScannerToDb } = await import("@/lib/scanner-sync");

  console.log(
    `[scanner-sync] background poller starting — every ${SCANNER_SYNC_INTERVAL_MS / 1000}s`,
  );

  // Fire one cycle immediately so we don't wait the first interval.
  void syncScannerToDb();

  setInterval(() => {
    void syncScannerToDb();
  }, SCANNER_SYNC_INTERVAL_MS);

  // Task Manager weekly recurrence — hourly in-server sweep so Daily tasks
  // roll into their next weekly occurrence even if nobody opens the app
  // (the data reads also run a lazy catch-up; both are idempotent, and a
  // boot-time run self-heals after downtime — see engine/recurrence.ts).
  // Skipped entirely until the Task Manager database is connected.
  if (process.env.TASK_MANAGER_DATABASE_URL) {
    const { advanceRecurringBlocks, resetRecurrenceThrottle } = await import(
      "@/task-manager/engine/recurrence"
    );
    const sweep = async () => {
      try {
        resetRecurrenceThrottle();
        const created = await advanceRecurringBlocks();
        if (created > 0) {
          console.log(`[task-recurrence] advanced ${created} task(s) into their next weekly occurrence`);
        }
      } catch (err) {
        console.warn(
          `[task-recurrence] sweep failed (will retry next interval): ${err instanceof Error ? err.message : err}`,
        );
      }
    };
    console.log("[task-recurrence] hourly sweep starting");
    void sweep();
    setInterval(() => {
      void sweep();
    }, TASK_RECURRENCE_SWEEP_MS);
  }

  // Transfer's "Temporary Transfer" type — auto-reverts the employee's
  // Branch/Department back to "From" once end_date has passed. Same
  // idempotent/self-healing shape as the task-recurrence sweep above: fires
  // once at boot (catches anything due while the server was down), then
  // hourly.
  const { revertExpiredTemporaryTransfers } = await import("@/lib/transferAutomation");
  const revertSweep = async () => {
    try {
      const reverted = await revertExpiredTemporaryTransfers();
      if (reverted > 0) {
        console.log(`[transfer-revert] reverted ${reverted} expired temporary transfer(s)`);
      }
    } catch (err) {
      console.warn(
        `[transfer-revert] sweep failed (will retry next interval): ${err instanceof Error ? err.message : err}`,
      );
    }
  };
  console.log("[transfer-revert] hourly sweep starting");
  void revertSweep();
  setInterval(() => {
    void revertSweep();
  }, TRANSFER_REVERT_SWEEP_MS);

  // Career-application intake — pulls EVERY row (every stage, including
  // rejected) from ebright_hrfs.career_applications into our own Pre stage
  // (see careerApplicationSync.ts for the matching/dedup rules), and also
  // advances already-synced applicants to Onboarding based on their own
  // board_stage (Trial/Training Day 1-2-3/Probation). Runs first in the
  // same tick as the stage-transition sweep below so a newly-synced row is
  // immediately visible to it.
  const { syncCareerApplicationsToPreStage } = await import("@/lib/careerApplicationSync");
  const careerApplicationSweep = async () => {
    try {
      const { created, updated, gaps } = await syncCareerApplicationsToPreStage();
      if (created > 0) console.log(`[career-application-sync] created ${created} new Pre-stage employee(s)`);
      if (updated > 0) console.log(`[career-application-sync] advanced ${updated} employee(s) to Onboarding/Active per HRFS stage`);
      if (gaps.length > 0) {
        console.log(`[career-application-sync] ${gaps.length} applicant(s) not synced/advanced:`);
        for (const g of gaps) console.log(`  - #${g.applicationId} ${g.name}: ${g.reason}`);
      }
    } catch (err) {
      console.warn(
        `[career-application-sync] sweep failed (will retry next interval): ${err instanceof Error ? err.message : err}`,
      );
    }
  };

  // Employee Folder stage auto-advance — Pre -> Onboarding/Probation the
  // instant start_date arrives (advancePreStageEmployees, always on), plus —
  // when ONBOARDING_PROBATION_SWEEP_ENABLED is flipped back to true —
  // Onboarding -> Active and Probation -> next stage once enough qualifying
  // days have passed since entering that stage (see
  // stageTransitionAutomation.ts for the exact day-counting rule and
  // per-transition conditions). Same idempotent/self-healing shape as the
  // sweeps above.
  const { advancePreStageEmployees, advanceOnboardingToActive, advanceProbationToNext } = await import(
    "@/lib/stageTransitionAutomation"
  );
  const stageTransitionSweep = async () => {
    try {
      await careerApplicationSweep();
      const fromPre = await advancePreStageEmployees();
      if (fromPre > 0) console.log(`[stage-transition] advanced ${fromPre} employee(s) from Pre to Onboarding/Probation`);

      if (ONBOARDING_PROBATION_SWEEP_ENABLED) {
        const [toActive, toNextFromProbation] = await Promise.all([
          advanceOnboardingToActive(),
          advanceProbationToNext(),
        ]);
        if (toActive > 0) console.log(`[stage-transition] advanced ${toActive} employee(s) from Onboarding to Active`);
        if (toNextFromProbation > 0) console.log(`[stage-transition] advanced ${toNextFromProbation} employee(s) from Probation to Onboarding`);
      }
    } catch (err) {
      console.warn(
        `[stage-transition] sweep failed (will retry next interval): ${err instanceof Error ? err.message : err}`,
      );
    }
  };
  console.log("[stage-transition] hourly sweep starting");
  void stageTransitionSweep();
  setInterval(() => {
    void stageTransitionSweep();
  }, STAGE_TRANSITION_SWEEP_MS);
}
