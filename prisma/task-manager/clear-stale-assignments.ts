// Clears stale department/branch assignments that `tm:bootstrap` leaves
// behind. Root cause (2026-08-19, see conversation): bootstrap.ts's own
// upsertUsers() only ever writes to people it currently finds ACTIVE — once
// someone leaves, goes onboarding/pre, or their employment end_date passes,
// bootstrap simply stops mentioning them; it never revisits or clears their
// existing Task Manager row. Their `department`/`branch` field then stays
// frozen at whatever it was last set to, forever — so Task Manager's
// department/branch Daily & Monthly rosters (analytics/_payloads.ts's
// buildEntityPayload, a plain `where: { department: name }` lookup against
// that frozen field) keep showing people Employee Folder's LIVE view
// (employeeQueries.ts) has already dropped.
//
// This script is the fix, run separately from tm:bootstrap on purpose —
// bootstrap already surprised us once today by doing more than "add missing
// people" implied; this stays a deliberate, independently-run, narrowly-
// scoped step rather than a silent side effect of every bootstrap run.
//
// Scope, deliberately narrow: only clears `department`/`branch` — the two
// fields that directly drive buildEntityPayload's roster query. Does NOT
// touch `role`/`employmentType`/`coachSchedule` (a separate, larger
// question, and role changes are exactly what caused today's earlier
// incident) and does NOT touch DEPT_SITE/BRANCH_SITE accounts (their
// department/branch is a fixed, manually-assigned identity, not synced from
// employment — same exclusion buildEntityPayload itself already applies).
// "Currently active" is decided by the EXACT SAME stageFromEmployment rule
// Employee Folder uses (src/lib/employeeStages.ts) — not a new rule.
//
// Run: npm run tm:clear-stale -- --dry-run   (report only, default — see
//        DRY_RUN below; touches nothing)
//      npm run tm:clear-stale -- --execute   (writes, inside one transaction)
import { Pool } from "pg";
import { prisma } from "../../src/task-manager/prisma";
import { stageFromEmployment } from "../../src/lib/employeeStages";

/** Same OSC_PORTAL_DATABASE_URL / TASK_MANAGER_DATABASE_URL-pathname-swap
 *  convention as bootstrap.ts's resolvePortalUrl — duplicated rather than
 *  imported because bootstrap.ts unconditionally runs main() at import time
 *  (it's a script, not a library module); importing it here would trigger a
 *  real bootstrap run as a side effect of importing this file. */
function resolvePortalUrl(): string {
  if (process.env.OSC_PORTAL_DATABASE_URL) return process.env.OSC_PORTAL_DATABASE_URL;
  const base = process.env.TASK_MANAGER_DATABASE_URL;
  if (!base) {
    throw new Error(
      "clear-stale-assignments: neither OSC_PORTAL_DATABASE_URL nor TASK_MANAGER_DATABASE_URL is set — cannot locate the portal database.",
    );
  }
  const url = new URL(base);
  url.pathname = "/hrfs";
  return url.toString();
}

interface HrfsStatusRow {
  email: string;
  user_status: string;
  deleted_at: Date | null;
  emp_status: string | null;
  end_date: Date | null;
}

async function fetchHrfsStatuses(emails: string[]): Promise<Map<string, HrfsStatusRow>> {
  const pool = new Pool({ connectionString: resolvePortalUrl(), max: 3, connectionTimeoutMillis: 10_000 });
  try {
    const result = await pool.query<HrfsStatusRow>(
      `select lower(u.email) as email, u.status as user_status, u.deleted_at,
              e.status as emp_status, e.end_date
       from users u
       left join employment e on e.user_id = u.user_id
       where lower(u.email) = ANY($1)`,
      [emails],
    );
    return new Map(result.rows.map((r) => [r.email, r]));
  } finally {
    await pool.end();
  }
}

async function main() {
  const execute = process.argv.includes("--execute");

  const candidates = await prisma.user.findMany({
    where: {
      role: { notIn: ["DEPT_SITE", "BRANCH_SITE"] },
      OR: [{ department: { not: null } }, { branch: { not: null } }],
    },
    select: { id: true, email: true, name: true, role: true, department: true, branch: true },
  });
  console.log(`[clear-stale] candidates with a department/branch set (excl. site logins): ${candidates.length}`);

  const hrfsByEmail = await fetchHrfsStatuses(candidates.map((c) => c.email.toLowerCase()));
  const todayIso = new Date().toISOString().slice(0, 10);

  let noHrfsRow = 0;
  let stillActive = 0;
  const toClear: { id: string; email: string; name: string; department: string | null; branch: string | null; reason: string }[] = [];

  for (const u of candidates) {
    const h = hrfsByEmail.get(u.email.toLowerCase());
    if (!h) {
      noHrfsRow++;
      continue; // not hrfs-driven at all (e.g. an EXTRA_USERS/test account) — never touched
    }
    const endIso = h.end_date ? h.end_date.toISOString().slice(0, 10) : null;
    const stage = stageFromEmployment(h.emp_status ?? h.user_status, endIso, todayIso);
    const isStale = h.deleted_at != null || stage !== "active";
    if (!isStale) {
      stillActive++;
      continue;
    }
    const reason = h.deleted_at != null
      ? "deleted in hrfs"
      : `hrfs stage is "${stage}" (status=${h.emp_status ?? h.user_status}${endIso ? `, end_date=${endIso}` : ""})`;
    toClear.push({ id: u.id, email: u.email, name: u.name, department: u.department, branch: u.branch, reason });
  }

  console.log(`[clear-stale] no matching hrfs.users row (untouched, not hrfs-driven): ${noHrfsRow}`);
  console.log(`[clear-stale] confirmed still active (untouched): ${stillActive}`);
  console.log(`[clear-stale] stale — department/branch to clear: ${toClear.length}`);
  for (const c of toClear) {
    console.log(
      `  ${execute ? "CLEARED" : "WOULD CLEAR"} ${c.email} (${c.name}): department=${c.department ?? "(none)"} branch=${c.branch ?? "(none)"} — ${c.reason}`,
    );
  }

  if (!execute) {
    console.log("\n[clear-stale] DRY RUN — no writes made. Re-run with --execute to apply.");
    return;
  }
  if (toClear.length === 0) {
    console.log("\n[clear-stale] Nothing to clear.");
    return;
  }

  await prisma.$transaction(
    toClear.map((c) => prisma.user.update({ where: { id: c.id }, data: { department: null, branch: null } })),
  );
  console.log(`\n[clear-stale] COMMITTED — ${toClear.length} row(s) cleared.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[clear-stale] FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
