/**
 * Import commits into the hotfix log.
 *
 * Reads `git log` output on stdin and upserts one hotfix_log row per commit,
 * keyed on the commit SHA. Run by the deploy workflow on every production
 * deploy (see .github/workflows/deploy.yml), which is exactly when the website
 * changed.
 *
 * Why stdin rather than the GitHub API: the production server already has the
 * full history on disk after the deploy script's `git reset --hard
 * origin/main`, and `.git` is excluded from the container image. So the host
 * runs git, the container parses — no API token to store anywhere, no rate
 * limit, and nothing to fail when GitHub is unreachable. That asymmetry (git
 * on the host, Node and DATABASE_URL in the container) is the whole reason for
 * the pipe.
 *
 * The deploy.yml side is deliberately three lines and no more. Its `script:`
 * block is ~24KB, and GitHub Actions rejects the ENTIRE workflow file — with
 * no usable error, just a run named after the file path and zero jobs — once
 * that block passes roughly 25KB. A first attempt at this feature added 22
 * lines of explanatory comment there and broke every deploy on the repo until
 * it was trimmed (2026-09-15; measured valid at 25,038 bytes, invalid at
 * 25,741). Hence: the explanation lives here, where it costs nothing.
 *
 * The git-log format string is duplicated in deploy.yml, because git runs on
 * the host while this parser runs in the container. It is spelled there as
 * "%x1e%H%x1f%ad%x1f%an%x1f%s%x1f%b%x1f", which is byte-identical to
 * GIT_LOG_FORMAT in src/lib/hotfix/gitlog.ts. Change one and you must change
 * the other.
 *
 * It is also wired up as non-fatal (`|| true`): by the time it runs the deploy
 * has already succeeded and been health-checked, so a changelog problem must
 * never turn a good deploy red.
 *
 *   # On the server, as the deploy script does:
 *   git log --no-merges --date=short --name-only --format=... -n 500 \
 *     | docker compose exec -T osc npx tsx scripts/sync-changelog.ts
 *
 *   # Locally, against the current checkout (runs git itself):
 *   npx tsx scripts/sync-changelog.ts --ref origin/main --limit 300
 *   npx tsx scripts/sync-changelog.ts --dry-run
 *
 * Idempotent: re-running imports nothing new and never disturbs curation.
 */

import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { deriveEntries, type DerivedEntry } from "../src/lib/hotfix/derive";
import { GIT_LOG_ARGS, parseGitLog } from "../src/lib/hotfix/gitlog";

const DEFAULT_LIMIT = 500;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function readStdin(): Promise<string> {
  // No pipe attached (a local run) — resolve empty and fall back to git.
  if (process.stdin.isTTY) return Promise.resolve("");
  return new Promise((resolve, reject) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (buf += chunk));
    process.stdin.on("end", () => resolve(buf));
    process.stdin.on("error", reject);
  });
}

function runGit(ref: string, limit: number): string {
  return execFileSync("git", [...GIT_LOG_ARGS, `-n${limit}`, ref], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const ref = arg("ref") ?? "HEAD";
  const limit = Number.parseInt(arg("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT;

  let raw = await readStdin();
  if (!raw.trim()) {
    console.log(`[sync-changelog] no stdin — running git log ${ref} -n${limit}`);
    raw = runGit(ref, limit);
  }

  const commits = parseGitLog(raw);
  const entries = deriveEntries(commits);
  console.log(
    `[sync-changelog] ${commits.length} commit(s) read, ${entries.length} entr(ies) after filtering`,
  );

  if (entries.length === 0) return;

  if (dryRun) {
    for (const e of entries.slice(0, 40)) {
      console.log(
        `  ${e.shippedOn}  ${e.category.padEnd(18)} [${e.tag}]${e.hidden ? " (hidden)" : ""} ${e.title}`,
      );
    }
    if (entries.length > 40) console.log(`  … and ${entries.length - 40} more`);
    console.log("[sync-changelog] --dry-run: nothing written");
    return;
  }

  // A plain client on purpose: going through src/lib/prisma would run every
  // one of these writes through the audit extension, filling the audit log
  // with hundreds of rows describing a changelog import.
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? process.env.HRFS_DATABASE_URL,
    options: "-c TimeZone=UTC",
  });
  const prisma = new PrismaClient({ adapter });

  let inserted = 0;
  let refreshed = 0;

  try {
    for (const e of entries) {
      const synced = syncedFields(e);
      const existing = await prisma.hotfix_log.findUnique({
        where: { commit_sha: e.commitSha },
        select: { id: true },
      });

      if (existing) {
        // `hidden` and `title_override` are deliberately absent: once a row
        // exists they belong to whoever curates the log, and a re-sync must
        // never undo that.
        await prisma.hotfix_log.update({
          where: { commit_sha: e.commitSha },
          data: { ...synced, updated_at: new Date() },
        });
        refreshed++;
      } else {
        await prisma.hotfix_log.create({
          data: { ...synced, hidden: e.hidden },
        });
        inserted++;
      }
    }

    console.log(`[sync-changelog] ${inserted} new, ${refreshed} refreshed`);
  } finally {
    await prisma.$disconnect();
  }
}

/** The half of the row the sync owns. */
function syncedFields(e: DerivedEntry) {
  return {
    commit_sha: e.commitSha,
    shipped_on: new Date(`${e.shippedOn}T00:00:00Z`),
    category: e.category,
    tag: e.tag,
    title: e.title,
    details: e.details,
    author_name: e.authorName,
  };
}

main().catch((err) => {
  console.error("[sync-changelog] failed:", err);
  process.exitCode = 1;
});
