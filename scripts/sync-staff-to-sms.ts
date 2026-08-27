// Pushes HRMS staff into ebrightsms (student management system).
//
// Usage (needs env from .env — loaded below):
//   npm run sync:sms-staff                              # dry run, prints what would be sent
//   npm run sync:sms-staff -- --branch="Rimbayu"        # dry run, one branch
//   npm run sync:sms-staff -- --branch="Rimbayu" --apply
//   npm run sync:sms-staff -- --apply                   # every branch
//   npm run sync:sms-staff -- --apply --include-leavers # also archive people who left
//
// A dry run touches nothing. --apply provisions accounts in ebrightsms AND
// sends each new person an activation email, so run a single branch first.

// Side-effect import, and it MUST stay first: src/lib/prisma.ts builds its
// connection at module-evaluation time, so .env has to be in process.env
// before that import is evaluated. `config()` called after the imports is too
// late — ES imports are evaluated before any statement in this file runs.
import "dotenv/config";

import { runSmsStaffSync, type SmsStaffRecord } from "../src/lib/smsStaffSync";

const ROLE_LABEL: Record<SmsStaffRecord["externalPositionType"], string> = {
  coach: "Coach",
  intern: "Protégé Intern",
  manager: "Branch Manager",
};

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
  const branchName = option("branch");
  const includeLeavers = flag("include-leavers");

  console.log(
    `[sms-staff-sync] ${apply ? "APPLYING" : "dry run"}` +
      `${branchName ? ` · branch "${branchName}"` : " · all branches"}` +
      `${includeLeavers ? " · including leavers" : ""}`,
  );

  const { records, skipped, outcome } = await runSmsStaffSync({ apply, branchName, includeLeavers });

  const byBranch = countBy(records, (r) => r.externalBranchId);
  console.log(`\nWould send ${records.length} staff across ${Object.keys(byBranch).length} branch(es).`);
  console.table(countBy(records, (r) => ROLE_LABEL[r.externalPositionType]));
  console.log(
    `nickname present: ${records.filter((r) => r.nickname).length}` +
      ` · phone present: ${records.filter((r) => r.phoneNumber).length}` +
      ` · marked inactive: ${records.filter((r) => r.status === "inactive").length}`,
  );

  if (skipped.length > 0) {
    console.log(`\nSkipped ${skipped.length}:`);
    console.table(countBy(skipped, (s) => s.reason));
    for (const person of skipped.filter((s) => s.reason.startsWith("job title"))) {
      console.log(`  needs a job title: ${person.fullName} (${person.branch}, user ${person.userId})`);
    }
  }

  if (!outcome) {
    console.log("\nDry run — nothing was sent. Re-run with --apply to provision these accounts.");
    return;
  }

  console.log(`\ncreated: ${outcome.created} · updated: ${outcome.updated} · failed: ${outcome.failures.length}`);
  for (const failure of outcome.failures) {
    console.log(`  FAILED ${failure.externalId}: ${failure.error}`);
  }
  process.exitCode = outcome.failures.length > 0 ? 1 : 0;
})().catch((error) => {
  console.error("[sms-staff-sync] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
