// Hands CNS (CRM) leads to the ebrightsms enrollment queue.
//
// Usage (needs env from .env — loaded below):
//   npm run sync:sms-students -- --since=2026-09-05                 # dry run
//   npm run sync:sms-students -- --since=2026-09-05 --limit=5       # dry run, first 5
//   npm run sync:sms-students -- --since=2026-09-05 --limit=1 --apply
//   npm run sync:sms-students -- --since=2026-09-05 --apply
//
// A dry run touches nothing. --apply puts requests into a branch's review
// queue — it does NOT create students; a branch manager completes and approves
// each one. Run with --limit first and read what comes back.
//
// --since is required: the report holds leads back to May 2026, and dropping
// the whole back catalogue into one queue is a deliberate act, not a default.
// Only leads that have MOVED since then are offered — a new lead, a stage
// change, or the moment somebody filled the child's details in.

// Side-effect import, and it MUST stay first — see sync-staff-to-sms.ts.
import "dotenv/config";

import { runSmsStudentSync } from "../src/lib/smsStudentSync";

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg?.slice(prefix.length);
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const k = key(item);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
}

(async () => {
  const apply = flag("apply");
  const sinceRaw = option("since");
  const limit = Number(option("limit")) || undefined;

  if (!sinceRaw) {
    console.error(
      "[sms-student-sync] --since=YYYY-MM-DD is required. It is the cutoff: only leads that have\n" +
        "                   moved since then are offered. Use the date this sync goes live.",
    );
    process.exit(1);
  }

  const since = new Date(sinceRaw);
  if (Number.isNaN(since.getTime())) {
    console.error(`[sms-student-sync] --since="${sinceRaw}" is not a date.`);
    process.exit(1);
  }

  console.log(
    `[sms-student-sync] ${apply ? "APPLYING" : "dry run"} · moved since ${since.toISOString()}` +
      `${limit ? ` · first ${limit}` : ""}`,
  );

  const { records, skipped, outcome } = await runSmsStudentSync({ apply, limit, since });

  console.log(`\nWould send ${records.length} lead(s).`);
  if (records.length > 0) {
    console.table(countBy(records, (r) => r.branchCode));
    console.log(
      `stage: ${JSON.stringify(countBy(records, (r) => r.externalStageCode + (r.updateOnly ? " (update only)" : "")))}` +
        `\nchild named: ${records.filter((r) => r.student.studentFullName).length}` +
        ` · date of birth: ${records.filter((r) => r.student.studentDateOfBirth).length}` +
        ` · gender: ${records.filter((r) => r.student.studentGender).length}` +
        `\nparent phone: ${records.filter((r) => r.parents[0]?.guardianPhone).length}` +
        ` · parent email: ${records.filter((r) => r.parents[0]?.guardianEmail).length}` +
        ` · trial date: ${records.filter((r) => r.externalTrialDate).length}`,
    );
  }

  if (skipped.length > 0) {
    console.log(`\nSkipped ${skipped.length}:`);
    console.table(countBy(skipped, (s) => s.reason));
    for (const lead of skipped) {
      console.log(`  ${lead.externalId} (${lead.stage}): ${lead.reason}`);
    }
  }

  if (!outcome) {
    console.log(
      "\nDry run — nothing was sent. Re-run with --apply to put these in the review queue.",
    );
    return;
  }

  console.log(
    `\nnew requests: ${outcome.created} · refreshed: ${outcome.refreshed}` +
      ` · reopened: ${outcome.reopened} · left alone: ${outcome.left}` +
      ` · nothing to update: ${outcome.skipped} · failed: ${outcome.failures.length}`,
  );
  for (const failure of outcome.failures) {
    console.log(`  FAILED ${failure.externalId}: ${failure.error}`);
  }
  process.exitCode = outcome.failures.length > 0 ? 1 : 0;
})().catch((error) => {
  console.error("[sms-student-sync] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
