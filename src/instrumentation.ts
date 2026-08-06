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

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Local CRM development: the HR background pollers (scanner-sync every 10s,
  // hourly sweeps) open extra connections to the portal DB and can exhaust a
  // connection-limited remote Postgres — which then starves the CRM's own
  // queries. Set DISABLE_BG_POLLERS=1 in .env to skip them while working on
  // the CRM. Never set this in production.
  if (process.env.DISABLE_BG_POLLERS === "1") {
    console.log("[instrumentation] background pollers disabled via DISABLE_BG_POLLERS");
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
}
