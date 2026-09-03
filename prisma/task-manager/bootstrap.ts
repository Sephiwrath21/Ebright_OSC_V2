// Idempotent production provisioning for Task Manager, driven by the SHARED
// `hrfs` portal database (users -> user_profile / employment -> department /
// branch) rather than a hand-maintained roster.csv (see the header comment
// in ./hrfs-map.ts for why). 2026-08-20: the ebright_hrfs-backed primary
// source was removed on user instruction — ebright_hrfs is a separate,
// sometimes-stale login/role system (confirmed corrupted/placeholder data on
// live rows) and `hrfs` is the real HR system of record. Upserts:
//   1) staff Users, built from the portal's active employees through
//      hrfs-map.ts's mapPortalEmployee(), plus hrfs-map.ts's EXTRA_USERS
//      (site logins etc. that don't exist in the portal at all).
//   2) the ws-operations workspace.
//   3) the 5 quick-assign utility flows (Flow + single Block + one required
//      CHECKBOX item each) — assignFlowTask and the manpower slot-sync look
//      these up BY ID, so the ids must match the demo seed's exactly.
// Never deletes anything; safe to re-run any time — re-running (after HRFS
// changes, or after editing hrfs-map.ts's OVERRIDES/EXTRA_USERS) IS the
// ongoing user-management story until an admin UI exists.
//
// Run: npm run tm:bootstrap                 (real run)
//      npm run tm:bootstrap -- --dry-run     (report only, touches nothing)
//      BOOTSTRAP_DRY_RUN=1 npm run tm:bootstrap   (same, via env var)
import { Pool } from "pg";
import { Prisma } from "../../src/generated/task-manager-client";
import { prisma } from "../../src/task-manager/prisma";
// Same "is this employment row currently active" rule Employee Folder uses
// (src/lib/employeeQueries.ts) — end_date wins over a stale status, exactly
// as documented on stageFromEmployment itself. Pulled from employeeStages.ts
// specifically because that file is pure (no imports, no Prisma client
// construction) — importing employeeQueries.ts directly here would eagerly
// construct its two PrismaClient singletons as an unwanted side effect of
// this being a plain tsx script, not a Next.js-bundled module.
import { stageFromEmployment } from "../../src/lib/employeeStages";
import {
  diffUserFields,
  EXTRA_USERS,
  mapPortalEmployee,
  type MappedUser,
  type PortalEmployeeRow,
} from "./hrfs-map";

const UTILITY_FLOWS = [
  { flowId: "flow-adhoc",        name: "Ad hoc Tasks",        icon: "⚡",  description: "One-off tasks assigned from the '+ Assigned task' quick form.", order: 2, blockId: "block-adhoc",        nodeId: "node-adhoc",        blockTitle: "Ad hoc task",        itemId: "item-adhoc-done" },
  { flowId: "flow-ceo-assign",   name: "CEO Assigned Task",   icon: "📌", description: "Tasks assigned from the CEO's '+ Add Task' quick form.",         order: 3, blockId: "block-ceo-assign",   nodeId: "node-ceo-assign",   blockTitle: "CEO assigned task",   itemId: "item-ceo-assign-done" },
  { flowId: "flow-hod-assign",   name: "HOD Assigned Task",   icon: "📋", description: "Tasks assigned from an HOD's own 'Assign Task' form.",           order: 4, blockId: "block-hod-assign",   nodeId: "node-hod-assign",   blockTitle: "HOD assigned task",   itemId: "item-hod-assign-done" },
  { flowId: "flow-admin-assign", name: "Admin Assigned Task", icon: "🛡️", description: "Tasks assigned from Superadmin's own '+ Assigned task' form.",   order: 5, blockId: "block-admin-assign", nodeId: "node-admin-assign", blockTitle: "Admin assigned task", itemId: "item-admin-assign-done" },
  { flowId: "flow-ops-assign",   name: "Ops Assigned Task",   icon: "🗂️", description: "Tasks assigned from OPS's own '+ Assigned task' form.",          order: 6, blockId: "block-ops-assign",   nodeId: "node-ops-assign",   blockTitle: "Ops assigned task",   itemId: "item-ops-assign-done" },
] as const;

/** OSC_PORTAL_DATABASE_URL wins if set; otherwise fall back to
 *  TASK_MANAGER_DATABASE_URL with the DB name (pathname) swapped to `hrfs` —
 *  the OSC portal's own database, same Postgres server, same credentials, by
 *  convention. */
function resolvePortalUrl(): string {
  if (process.env.OSC_PORTAL_DATABASE_URL) return process.env.OSC_PORTAL_DATABASE_URL;
  const base = process.env.TASK_MANAGER_DATABASE_URL;
  if (!base) {
    throw new Error(
      "bootstrap: neither OSC_PORTAL_DATABASE_URL nor TASK_MANAGER_DATABASE_URL is set — cannot locate the portal database.",
    );
  }
  const url = new URL(base);
  url.pathname = "/hrfs";
  return url.toString();
}

/** Read-only: ACTIVE portal employees (active login + their currently-active
 *  employment's position/department/branch). "Currently active" is decided
 *  by stageFromEmployment — the exact same rule Employee Folder uses
 *  (end_date wins over a stale status column), not a bootstrap-specific
 *  check. Employees with NO currently-active employment row still return
 *  (position null) so they surface as loud unknown-position skips instead
 *  of silently vanishing. THE sole bootstrap source (2026-08-20: the
 *  ebright_hrfs-backed primary source was removed — see mapPortalEmployee's
 *  header in hrfs-map.ts and the file header below for why). */
async function fetchPortalEmployees(): Promise<PortalEmployeeRow[]> {
  const pool = new Pool({
    connectionString: resolvePortalUrl(),
    max: 3,
    connectionTimeoutMillis: 10_000,
  });
  try {
    const result = await pool.query<PortalEmployeeRow & { emp_status: string | null; end_date: Date | null }>(
      `select lower(u.email) as email, up.full_name as name, e.position,
              d.department_name as department, b.branch_name as branch,
              e.status as emp_status, e.end_date
       from users u
       join user_profile up on up.user_id = u.user_id
       left join employment e on e.user_id = u.user_id and e.status = 'active'
       left join department d on d.department_id = e.department_id
       left join branch b on b.branch_id = e.branch_id
       where u.deleted_at is null and u.status = 'active'
       order by u.email`,
    );
    const todayIso = new Date().toISOString().slice(0, 10);
    return result.rows.map((r) => {
      const endIso = r.end_date ? r.end_date.toISOString().slice(0, 10) : null;
      const isActive = r.emp_status != null && stageFromEmployment(r.emp_status, endIso, todayIso) === "active";
      return {
        email: r.email,
        name: r.name,
        position: isActive ? r.position : null,
        department: isActive ? r.department : null,
        branch: isActive ? r.branch : null,
      };
    });
  } finally {
    await pool.end();
  }
}

/** One skipped row, kept structured (not just its printable reason string)
 *  so callers can act on `email` directly — e.g. the real-run STALE check,
 *  which needs to look each skipped email up in the Task Manager db. */
interface SkippedRow {
  email: string;
  reason: string; // already "<email>: <message>" — see mapPortalEmployee/below.
}

interface MapAllResult {
  portalRowCount: number;
  toImport: MappedUser[];
  skipped: SkippedRow[];
  warnings: string[]; // one entry per warning, "<email>: <warning>"
}

/** Appends EXTRA_USERS verbatim, then maps every portal row through
 *  mapPortalEmployee, and buckets the results — pure aggregation, no I/O.
 *  EXTRA_USERS wins on email collision (checked first, matching the old
 *  primary-source-wins precedent from when ebright_hrfs was the primary
 *  source); any later duplicate — an EXTRA_USERS email re-appearing in the
 *  portal, or the portal returning the same (lowercased) email twice — is
 *  skipped outright, regardless of what its own row would otherwise have
 *  mapped to. */
function mapAll(rows: PortalEmployeeRow[]): MapAllResult {
  const toImport: MappedUser[] = [];
  const skipped: SkippedRow[] = [];
  const warnings: string[] = [];
  const seenEmails = new Set<string>();

  for (const extra of EXTRA_USERS) {
    toImport.push(extra);
    seenEmails.add(extra.email.toLowerCase());
  }

  for (const row of rows) {
    const email = (row.email ?? "").trim().toLowerCase();
    if (seenEmails.has(email)) {
      skipped.push({ email, reason: `${email}: duplicate email (EXTRA_USERS or repeated portal row)` });
      continue;
    }
    seenEmails.add(email);

    const result = mapPortalEmployee(row);
    if (result.ok) {
      toImport.push(result.user);
      warnings.push(...result.warnings);
    } else {
      skipped.push({ email, reason: result.reason });
    }
  }

  return { portalRowCount: rows.length, toImport, skipped, warnings };
}

/** Pulls every distinct raw branchName quoted inside "unresolved branch
 *  code ..." messages (skip reasons AND warnings both use this exact
 *  phrasing — see hrfs-map.ts) — i.e. every unresolved code ACTUALLY
 *  encountered in this run, not just the ones this file already knows
 *  about (UNRESOLVED_BRANCH_CODES is documentation; this is live evidence). */
function extractUnresolvedBranchCodes(messages: string[]): string[] {
  const re = /unresolved branch code (".*?"|null)/g;
  const codes = new Set<string>();
  for (const msg of messages) {
    for (const m of msg.matchAll(re)) codes.add(m[1]);
  }
  return [...codes].sort();
}

function printSummary(result: MapAllResult, opts: { dryRun: boolean }): void {
  const deptWarnings = result.warnings.filter((w) => w.includes("no department override"));
  const branchWarnings = result.warnings.filter((w) => w.includes("unresolved branch code"));
  const duplicateSkips = result.skipped.filter((s) => s.reason.includes("duplicate email"));
  const unresolvedCodes = extractUnresolvedBranchCodes([...result.skipped.map((s) => s.reason), ...branchWarnings]);

  console.log(`\n[bootstrap] ${opts.dryRun ? "DRY RUN — " : ""}mapping summary`);
  console.log(`[bootstrap]   portal ACTIVE rows fetched: ${result.portalRowCount}`);
  console.log(`[bootstrap]   EXTRA_USERS appended:       ${EXTRA_USERS.length}`);
  console.log(`[bootstrap]   mapped for import:          ${result.toImport.length}`);
  console.log(
    `[bootstrap]   skipped:                    ${result.skipped.length} (of which ${duplicateSkips.length} duplicate emails)`,
  );
  console.log(`[bootstrap]   "no department" warnings:   ${deptWarnings.length}`);
  console.log(`[bootstrap]   unresolved-branch warnings: ${branchWarnings.length}`);
  console.log(
    `[bootstrap]   unresolved branch codes actually encountered: ${unresolvedCodes.length ? unresolvedCodes.join(", ") : "(none)"}`,
  );
  if (opts.dryRun && result.skipped.length > 0) {
    console.log(
      "[bootstrap]   note: STALE checks (does a skipped email still hold a Task Manager account?) only run on a real run, not --dry-run.",
    );
  }

  if (result.skipped.length > 0) {
    console.log("\n[bootstrap] SKIPPED (every one, with reason):");
    for (const s of result.skipped) console.log(`  - ${s.reason}`);
  }
  if (deptWarnings.length > 0) {
    console.log("\n[bootstrap] \"NO DEPARTMENT\" WARNINGS (imported anyway, department = null):");
    for (const w of deptWarnings) console.log(`  - ${w}`);
  }
  if (branchWarnings.length > 0) {
    console.log("\n[bootstrap] UNRESOLVED-BRANCH WARNINGS (imported anyway, branch = null):");
    for (const w of branchWarnings) console.log(`  - ${w}`);
  }

  if (result.portalRowCount === 0) {
    console.warn("\n[bootstrap] portal database returned 0 ACTIVE rows — check the connection/credentials before trusting this run.");
  }
  if (opts.dryRun) {
    console.log("\n[bootstrap] DRY RUN — no connection to the Task Manager database was made; nothing was written.");
  }
}

async function upsertUsers(users: MappedUser[]): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  for (const user of users) {
    const data = {
      name: user.name,
      role: user.role,
      department: user.department,
      branch: user.branch,
      employmentType: user.employmentType,
      coachSchedule: user.coachSchedule,
      // Direct HRFS link (2026-07-31): written when this run's source row
      // supplied it; NEVER cleared when absent (portal-source updates and
      // manually-resolved mismatches must not be clobbered back to null).
      ...(user.hrfsUserId != null ? { hrfsUserId: user.hrfsUserId } : {}),
    };
    const existing = await prisma.user.findUnique({ where: { email: user.email } });
    if (existing) {
      // Loud, not silent: an OVERRIDES promotion removed (or any other
      // mapping change) between runs would otherwise demote/rewrite an
      // existing account with nobody noticing.
      const changes = diffUserFields(existing, user);
      if (changes.length > 0) {
        console.log(`[bootstrap] CHANGED ${user.email}: ${changes.join(", ")}`);
      }
      await prisma.user.update({ where: { email: user.email }, data });
      updated++;
    } else {
      await prisma.user.create({ data: { email: user.email, ...data } });
      created++;
    }
  }
  return { created, updated };
}

/** Real-run only (dry-run never connects to the Task Manager database at
 *  all — see the note printSummary prints instead). For each SKIPPED HRFS
 *  row, checks whether that email already has a Task Manager account; if
 *  so, prints a loud STALE line. "Skipped" only ever means "this run didn't
 *  touch them" — it does NOT mean their existing account was deactivated or
 *  removed; this makes that explicit instead of leaving it implicit. */
async function printStaleSkipWarnings(skipped: SkippedRow[]): Promise<void> {
  for (const s of skipped) {
    const existing = await prisma.user.findUnique({ where: { email: s.email }, select: { role: true } });
    if (existing) {
      console.log(
        `[bootstrap] STALE ${s.email}: skipped this run but still has a Task Manager account (role ${existing.role}) — row left untouched`,
      );
    }
  }
}

/** WORKSPACE + 5 UTILITY FLOWS — reused as designed in the original
 *  roster.csv-based bootstrap plan (Task 19 Step 6), unchanged: this part of
 *  the redesign is identical, only the user-sourcing above it changed. */
async function provisionUtilityFlows(): Promise<void> {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  const ownerId = admin?.id ?? "system";

  await prisma.workspace.upsert({
    where: { id: "ws-operations" },
    create: { id: "ws-operations", name: "Operations", icon: "🛠️", ownerId, department: "Operations", order: 1 },
    update: {},
  });

  for (const f of UTILITY_FLOWS) {
    const nodes = [
      {
        id: f.nodeId,
        type: "block",
        position: { x: 260, y: 0 },
        data: { kind: "block", blockId: f.blockId, title: f.blockTitle },
      },
    ] as unknown as Prisma.InputJsonValue;
    await prisma.flow.upsert({
      where: { id: f.flowId },
      create: {
        id: f.flowId,
        workspaceId: "ws-operations",
        name: f.name,
        icon: f.icon,
        description: f.description,
        ownerId,
        department: "Operation",
        order: f.order,
        version: 1,
        isPublished: true,
        nodes,
        edges: [] as unknown as Prisma.InputJsonValue,
      },
      update: { name: f.name, isPublished: true },
    });
    await prisma.block.upsert({
      where: { id: f.blockId },
      create: {
        id: f.blockId,
        flowId: f.flowId,
        nodeId: f.nodeId,
        title: f.blockTitle,
        reminderInterval: 24,
        strikeLimit: 3,
        escalateToUserId: admin?.id ?? null,
        outgoingEdges: [] as unknown as Prisma.InputJsonValue,
      },
      update: { escalateToUserId: admin?.id ?? null },
    });
    await prisma.blockItem.upsert({
      where: { id: f.itemId },
      create: {
        id: f.itemId,
        blockId: f.blockId,
        order: 0,
        type: "CHECKBOX",
        label: "Done",
        required: true,
        config: {},
      },
      update: {},
    });
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run") || process.env.BOOTSTRAP_DRY_RUN === "1";

  // 2026-08-20: the ebright_hrfs-backed primary source is gone — ebright_hrfs
  // carries stale/corrupted data (confirmed placeholder names like "Region
  // A"/"Region B"/"Region C" on live rows). The `hrfs` portal database
  // (users -> user_profile / employment -> department / branch) is now the
  // ONLY source of real staff; department/branch/position all come from the
  // same query, so no separate enrichment pass is needed.
  const rows = await fetchPortalEmployees();
  const result = mapAll(rows);

  printSummary(result, { dryRun });

  if (dryRun) {
    return;
  }

  await printStaleSkipWarnings(result.skipped);

  const { created, updated } = await upsertUsers(result.toImport);
  await provisionUtilityFlows();

  console.log(
    `\n[bootstrap] users: ${created} created, ${updated} updated; utility flows: ${UTILITY_FLOWS.length} ensured`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[bootstrap] FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
