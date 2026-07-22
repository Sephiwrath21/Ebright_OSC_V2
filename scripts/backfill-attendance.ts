// Manual backfill / refresh of attendance_all from the hikvision scan log.
//
// Usage (needs env from .env — loaded below):
//   npm run backfill:attendance                 # full rebuild (all history)
//   npm run backfill:attendance -- --since=2026-07-01
//
// Reads ebright_hrfs.hikvision_attendance_all (READ-ONLY) and upserts into
// hrfs.attendance_all. Safe to re-run.

import { config } from "dotenv";
import { syncAttendance } from "../src/lib/sync-attendance";

config(); // load .env

function parseSince(): string | undefined {
  const arg = process.argv.find((a) => a.startsWith("--since="));
  return arg ? arg.slice("--since=".length) : undefined;
}

(async () => {
  const since = parseSince();
  console.log(`[backfill] starting${since ? ` (since ${since})` : " (full rebuild)"}…`);
  const r = await syncAttendance({ since });
  console.log("[backfill] done:");
  console.table({
    scansRead: r.scansRead,
    rowsUpserted: r.rowsUpserted,
    distinctEmployees: r.distinctEmployees,
    branchMatched: r.branchMatched,
    branchUnmatched: r.branchUnmatched,
    ranMs: r.ranMs,
  });
  process.exit(0);
})().catch((err) => {
  console.error("[backfill] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
