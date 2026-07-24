// Idempotent production provisioning for Task Manager, driven by the SHARED
// ebright_hrfs database rather than a hand-maintained roster.csv (see the
// header comment in ./hrfs-map.ts for why). Upserts:
//   1) staff Users, built from HRFS's ACTIVE `User` rows through hrfs-map.ts's
//      mapHrfsUser(), plus hrfs-map.ts's EXTRA_USERS (site logins etc. that
//      don't exist in HRFS at all).
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
import { EXTRA_USERS, mapHrfsUser, type HrfsUserRow, type MappedUser } from "./hrfs-map";

const UTILITY_FLOWS = [
  { flowId: "flow-adhoc",        name: "Ad hoc Tasks",        icon: "⚡",  description: "One-off tasks assigned from the '+ Assigned task' quick form.", order: 2, blockId: "block-adhoc",        nodeId: "node-adhoc",        blockTitle: "Ad hoc task",        itemId: "item-adhoc-done" },
  { flowId: "flow-ceo-assign",   name: "CEO Assigned Task",   icon: "📌", description: "Tasks assigned from the CEO's '+ Add Task' quick form.",         order: 3, blockId: "block-ceo-assign",   nodeId: "node-ceo-assign",   blockTitle: "CEO assigned task",   itemId: "item-ceo-assign-done" },
  { flowId: "flow-hod-assign",   name: "HOD Assigned Task",   icon: "📋", description: "Tasks assigned from an HOD's own 'Assign Task' form.",           order: 4, blockId: "block-hod-assign",   nodeId: "node-hod-assign",   blockTitle: "HOD assigned task",   itemId: "item-hod-assign-done" },
  { flowId: "flow-admin-assign", name: "Admin Assigned Task", icon: "🛡️", description: "Tasks assigned from Superadmin's own '+ Assigned task' form.",   order: 5, blockId: "block-admin-assign", nodeId: "node-admin-assign", blockTitle: "Admin assigned task", itemId: "item-admin-assign-done" },
  { flowId: "flow-ops-assign",   name: "Ops Assigned Task",   icon: "🗂️", description: "Tasks assigned from OPS's own '+ Assigned task' form.",          order: 6, blockId: "block-ops-assign",   nodeId: "node-ops-assign",   blockTitle: "Ops assigned task",   itemId: "item-ops-assign-done" },
] as const;

/** HRFS_DATABASE_URL wins if set (lets ops point at a differently-hosted
 *  HRFS instance without touching TASK_MANAGER_DATABASE_URL). Otherwise fall
 *  back to TASK_MANAGER_DATABASE_URL with the DB name (pathname) swapped
 *  from whatever it is (e.g. ebright_task_manager / ebright_yqtm) to
 *  ebright_hrfs — same Postgres server, same credentials, by convention
 *  (verified: both TM and HRFS live on the one server). */
function resolveHrfsUrl(): string {
  if (process.env.HRFS_DATABASE_URL) return process.env.HRFS_DATABASE_URL;
  const base = process.env.TASK_MANAGER_DATABASE_URL;
  if (!base) {
    throw new Error(
      "bootstrap: neither HRFS_DATABASE_URL nor TASK_MANAGER_DATABASE_URL is set — cannot locate the HRFS database.",
    );
  }
  const url = new URL(base);
  url.pathname = "/ebright_hrfs";
  return url.toString();
}

/** Read-only: fetches every ACTIVE row from ebright_hrfs.User via a plain pg
 *  Pool (deliberately NOT the Prisma client — there's no Prisma schema for
 *  HRFS in this repo, and generating one for a database we only ever
 *  SELECT from would be overkill). Closes its own pool before returning. */
async function fetchHrfsRows(): Promise<HrfsUserRow[]> {
  const pool = new Pool({
    connectionString: resolveHrfsUrl(),
    max: 3,
    connectionTimeoutMillis: 10_000,
  });
  try {
    const result = await pool.query<{ email: string; name: string | null; role: string; branchName: string | null; status: string }>(
      `select email, name, role, "branchName", status from "User" where status = 'ACTIVE'`,
    );
    return result.rows.map((r) => ({
      email: r.email,
      name: r.name,
      role: r.role,
      branchName: r.branchName,
      status: r.status,
    }));
  } finally {
    await pool.end();
  }
}

interface MapAllResult {
  hrfsRowCount: number;
  toImport: MappedUser[];
  skipped: string[]; // one entry per skipped row, "<email>: <reason>"
  warnings: string[]; // one entry per warning, "<email>: <warning>"
}

/** Maps every HRFS row through mapHrfsUser, appends EXTRA_USERS verbatim,
 *  and buckets the results — pure aggregation, no I/O. */
function mapAll(rows: HrfsUserRow[]): MapAllResult {
  const toImport: MappedUser[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];

  for (const row of rows) {
    const result = mapHrfsUser(row);
    if (result.ok) {
      toImport.push(result.user);
      warnings.push(...result.warnings);
    } else {
      skipped.push(result.reason);
    }
  }
  for (const extra of EXTRA_USERS) toImport.push(extra);

  return { hrfsRowCount: rows.length, toImport, skipped, warnings };
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
  const unresolvedCodes = extractUnresolvedBranchCodes([...result.skipped, ...branchWarnings]);

  console.log(`\n[bootstrap] ${opts.dryRun ? "DRY RUN — " : ""}mapping summary`);
  console.log(`[bootstrap]   HRFS ACTIVE rows fetched:   ${result.hrfsRowCount}`);
  console.log(`[bootstrap]   EXTRA_USERS appended:       ${EXTRA_USERS.length}`);
  console.log(`[bootstrap]   mapped for import:          ${result.toImport.length}`);
  console.log(`[bootstrap]   skipped:                    ${result.skipped.length}`);
  console.log(`[bootstrap]   "no department" warnings:   ${deptWarnings.length}`);
  console.log(`[bootstrap]   unresolved-branch warnings: ${branchWarnings.length}`);
  console.log(
    `[bootstrap]   unresolved branch codes actually encountered: ${unresolvedCodes.length ? unresolvedCodes.join(", ") : "(none)"}`,
  );

  if (result.skipped.length > 0) {
    console.log("\n[bootstrap] SKIPPED (every one, with reason):");
    for (const reason of result.skipped) console.log(`  - ${reason}`);
  }
  if (deptWarnings.length > 0) {
    console.log("\n[bootstrap] \"NO DEPARTMENT\" WARNINGS (imported anyway, department = null):");
    for (const w of deptWarnings) console.log(`  - ${w}`);
  }
  if (branchWarnings.length > 0) {
    console.log("\n[bootstrap] UNRESOLVED-BRANCH WARNINGS (imported anyway, branch = null):");
    for (const w of branchWarnings) console.log(`  - ${w}`);
  }

  if (result.hrfsRowCount === 0) {
    console.warn("\n[bootstrap] HRFS returned 0 ACTIVE rows — check the connection/credentials before trusting this run.");
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
    };
    const existing = await prisma.user.findUnique({ where: { email: user.email } });
    if (existing) {
      await prisma.user.update({ where: { email: user.email }, data });
      updated++;
    } else {
      await prisma.user.create({ data: { email: user.email, ...data } });
      created++;
    }
  }
  return { created, updated };
}

/** WORKSPACE + 5 UTILITY FLOWS — reused as designed in the original
 *  roster.csv-based bootstrap plan (Task 19 Step 6), unchanged: this part of
 *  the redesign is identical, only the user-sourcing above it changed. */
async function provisionUtilityFlows(): Promise<void> {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  const ownerId = admin?.id ?? "system";

  await prisma.workspace.upsert({
    where: { id: "ws-operations" },
    create: { id: "ws-operations", name: "Operations", icon: "🛠️", ownerId, department: "Operation", order: 1 },
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

  const rows = await fetchHrfsRows();
  const result = mapAll(rows);
  printSummary(result, { dryRun });

  if (dryRun) {
    return;
  }

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
