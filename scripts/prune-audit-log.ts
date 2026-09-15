/**
 * Delete audit_log rows older than the retention window.
 *
 * NOT SCHEDULED. By decision (2026-09-15) audit entries are kept indefinitely,
 * so this runs only when a person runs it — there is no cron entry, no
 * workflow step and no npm script wiring it up, and adding one is a policy
 * change, not a tidy-up. It exists so that bounding the table is a single
 * command when the time comes.
 *
 * The audit trail is append-only from the application's side, so this script
 * is the only thing that can remove rows. Safe to run repeatedly.
 *
 *   npx tsx scripts/prune-audit-log.ts             # delete, 365-day default
 *   npx tsx scripts/prune-audit-log.ts --dry-run   # report only, delete nothing
 *   AUDIT_LOG_RETENTION_DAYS=730 npx tsx scripts/prune-audit-log.ts
 *
 * Deletes in batches so a first run against a large table does not hold one
 * enormous transaction open — this database's pool has a 30s
 * idle_in_transaction_session_timeout (see src/lib/prisma.ts).
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DEFAULT_RETENTION_DAYS = 365;
const BATCH_SIZE = 10_000;

function retentionDays(): number {
  const raw = process.env.AUDIT_LOG_RETENTION_DAYS;
  if (!raw) return DEFAULT_RETENTION_DAYS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(
      `AUDIT_LOG_RETENTION_DAYS must be a positive integer, got ${JSON.stringify(raw)}`,
    );
  }
  return parsed;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const days = retentionDays();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // A plain client: the audit extension deliberately skips the audit_log model,
  // but there is no reason to load it for a maintenance script either.
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? process.env.HRFS_DATABASE_URL,
    options: "-c TimeZone=UTC",
  });
  const prisma = new PrismaClient({ adapter });

  try {
    const where = { occurred_at: { lt: cutoff } };
    const doomed = await prisma.audit_log.count({ where });

    console.log(
      `[prune-audit-log] retention ${days}d — cutoff ${cutoff.toISOString()}, ` +
        `${doomed.toLocaleString()} row(s) older than that`,
    );

    if (doomed === 0) return;
    if (dryRun) {
      console.log("[prune-audit-log] --dry-run: nothing deleted");
      return;
    }

    let removed = 0;
    for (;;) {
      // deleteMany has no `take`, so the batch is selected first by id.
      const batch = await prisma.audit_log.findMany({
        where,
        select: { id: true },
        orderBy: { id: "asc" },
        take: BATCH_SIZE,
      });
      if (batch.length === 0) break;

      const { count } = await prisma.audit_log.deleteMany({
        where: { id: { in: batch.map((r) => r.id) } },
      });
      removed += count;
      console.log(`[prune-audit-log] deleted ${removed.toLocaleString()}/${doomed.toLocaleString()}`);
      if (batch.length < BATCH_SIZE) break;
    }

    console.log(`[prune-audit-log] done — removed ${removed.toLocaleString()} row(s)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[prune-audit-log] failed:", err);
  process.exitCode = 1;
});
