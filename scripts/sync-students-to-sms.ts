// Pushes CNS (CRM) students into ebrightsms (student management system).
//
// Usage (needs env from .env — loaded below):
//   npm run sync:sms-students -- --since=2026-09-04                 # dry run
//   npm run sync:sms-students -- --since=2026-09-04 --limit=5       # dry run, first 5
//   npm run sync:sms-students -- --since=2026-09-04 --limit=1 --apply
//   npm run sync:sms-students -- --since=2026-09-04 --apply
//
// A dry run touches nothing. --apply CREATES student records in ebrightsms, so
// run with --limit first and read what comes back.
//
// --since is required: the report holds enrolments back to May 2026 and some of
// those children are already in ebrightsms from the September leads import, so
// there is no safe default. Use the moment this sync goes live.

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
      "[sms-student-sync] --since=YYYY-MM-DD is required. It is the cutoff: only records verified\n" +
        "                   after it are offered. Use the date this sync goes live.",
    );
    process.exit(1);
  }

  const since = new Date(sinceRaw);
  if (Number.isNaN(since.getTime())) {
    console.error(`[sms-student-sync] --since="${sinceRaw}" is not a date.`);
    process.exit(1);
  }

  console.log(
    `[sms-student-sync] ${apply ? "APPLYING" : "dry run"} · verified after ${since.toISOString()}` +
      `${limit ? ` · first ${limit}` : ""}`,
  );

  const { records, skipped, outcome } = await runSmsStudentSync({ apply, limit, since });

  console.log(`\nWould send ${records.length} student(s).`);
  if (records.length > 0) {
    console.table(countBy(records, (r) => r.branchCode));
    console.log(
      `stage: ${JSON.stringify(countBy(records, (r) => r.externalStage ?? "(none)"))}` +
        `\ndate of birth present: ${records.filter((r) => r.student.dateOfBirth).length}` +
        ` · gender present: ${records.filter((r) => r.student.gender).length}` +
        ` · guardian present: ${records.filter((r) => r.guardian).length}` +
        ` · guardian phone: ${records.filter((r) => r.guardian?.phoneNo).length}`,
    );
  }

  if (skipped.length > 0) {
    console.log(`\nSkipped ${skipped.length}:`);
    console.table(countBy(skipped, (s) => s.reason));
    for (const student of skipped) {
      console.log(`  ${student.externalId} (${student.stage}): ${student.reason}`);
    }
  }

  if (!outcome) {
    console.log("\nDry run — nothing was sent. Re-run with --apply to create these students.");
    return;
  }

  console.log(
    `\ncreated: ${outcome.created} · already linked: ${outcome.updated} · failed: ${outcome.failures.length}`,
  );
  for (const failure of outcome.failures) {
    console.log(`  FAILED ${failure.externalId}: ${failure.error}`);
  }
  process.exitCode = outcome.failures.length > 0 ? 1 : 0;
})().catch((error) => {
  console.error("[sms-student-sync] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
