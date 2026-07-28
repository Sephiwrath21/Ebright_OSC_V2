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

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

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
}
