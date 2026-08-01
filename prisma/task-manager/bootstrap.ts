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
import { FLOW_DEPARTMENTS } from "../../src/task-manager/ui/types";
import {
  diffUserFields,
  EXTRA_USERS,
  mapHrfsUser,
  mapPortalEmployee,
  normalizeSourceDepartment,
  type HrfsUserRow,
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
    const result = await pool.query<{ id: number; email: string; name: string | null; role: string; branchName: string | null; status: string }>(
      `select id, email, name, role, "branchName", status from "User" where status = 'ACTIVE'`,
    );
    return result.rows.map((r) => ({
      id: r.id,
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

/** OSC_PORTAL_DATABASE_URL wins if set; otherwise fall back to
 *  TASK_MANAGER_DATABASE_URL with the DB name (pathname) swapped to `hrfs` —
 *  the OSC portal's own database, same Postgres server, same credentials, by
 *  convention (same pattern as resolveHrfsUrl above). */
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

/** Read-only: department per (lowercased) login email from the OSC portal's
 *  employment records — the same data the portal's HR staff directory
 *  displays. 2026-07-25 root-cause finding: ebright_hrfs.User has NO
 *  department column at all, so mapping alone imported every generic staff
 *  member department-less; the real assignments live HERE (hrfs database:
 *  users -> employment -> department). Only ACTIVE employments count, and
 *  only department names that are real FLOW_DEPARTMENTS values — the portal
 *  also carries non-Task-Manager units ("IOP", "CEO"), which are skipped. */
async function fetchPortalDepartments(): Promise<Map<string, string>> {
  const pool = new Pool({
    connectionString: resolvePortalUrl(),
    max: 3,
    connectionTimeoutMillis: 10_000,
  });
  try {
    const result = await pool.query<{ email: string; department_name: string }>(
      `select lower(u.email) as email, d.department_name
       from users u
       join employment e on e.user_id = u.user_id
       join department d on d.department_id = e.department_id
       where e.status = 'active' and u.deleted_at is null`,
    );
    const byEmail = new Map<string, string>();
    for (const r of result.rows) {
      // Portal still says "Operation" — normalize to the renamed value.
      const dept = normalizeSourceDepartment(r.department_name);
      if (dept && (FLOW_DEPARTMENTS as readonly string[]).includes(dept)) {
        byEmail.set(r.email, dept);
      }
    }
    return byEmail;
  } finally {
    await pool.end();
  }
}

/** Fill department for department-side staff the mapping left department-
 *  less. Never touches branch staff (branch/department mutual exclusivity)
 *  and never overwrites an already-set department — ROLE_MAP's fixed values
 *  (ACADEMY/HR) and OVERRIDES both win simply by already being set. Returns
 *  how many users were filled. */
function enrichDepartments(toImport: MappedUser[], byEmail: Map<string, string>): number {
  let filled = 0;
  for (const user of toImport) {
    if (user.department !== null || user.branch !== null) continue;
    if (user.role !== "MEMBER" && user.role !== "HOD") continue;
    const dept = byEmail.get(user.email.toLowerCase());
    if (!dept) continue;
    user.department = dept;
    filled++;
  }
  return filled;
}

/** Read-only: ACTIVE portal employees (active login + their ACTIVE
 *  employment's position/department/branch). Employees with NO active
 *  employment row still return (position null) so they surface as loud
 *  unknown-position skips instead of silently vanishing. Second bootstrap
 *  source — see mapPortalEmployee's header in hrfs-map.ts. */
async function fetchPortalEmployees(): Promise<PortalEmployeeRow[]> {
  const pool = new Pool({
    connectionString: resolvePortalUrl(),
    max: 3,
    connectionTimeoutMillis: 10_000,
  });
  try {
    const result = await pool.query<PortalEmployeeRow>(
      `select lower(u.email) as email, up.full_name as name, e.position,
              d.department_name as department, b.branch_name as branch
       from users u
       join user_profile up on up.user_id = u.user_id
       left join employment e on e.user_id = u.user_id and e.status = 'active'
       left join department d on d.department_id = e.department_id
       left join branch b on b.branch_id = e.branch_id
       where u.deleted_at is null and u.status = 'active'
       order by u.email`,
    );
    return result.rows;
  } finally {
    await pool.end();
  }
}

/** One skipped row, kept structured (not just its printable reason string)
 *  so callers can act on `email` directly — e.g. the real-run STALE check,
 *  which needs to look each skipped email up in the Task Manager db. */
interface SkippedRow {
  email: string;
  reason: string; // already "<email>: <message>" — see mapHrfsUser/below.
}

interface MapAllResult {
  hrfsRowCount: number;
  toImport: MappedUser[];
  skipped: SkippedRow[];
  warnings: string[]; // one entry per warning, "<email>: <warning>"
}

/** Maps every HRFS row through mapHrfsUser, appends EXTRA_USERS verbatim,
 *  and buckets the results — pure aggregation, no I/O. Guards against HRFS
 *  returning the same (lowercased) email twice: the FIRST occurrence is
 *  mapped normally; every later one is skipped outright as a duplicate,
 *  regardless of what its own row would otherwise have mapped to. */
function mapAll(rows: HrfsUserRow[]): MapAllResult {
  const toImport: MappedUser[] = [];
  const skipped: SkippedRow[] = [];
  const warnings: string[] = [];
  const seenEmails = new Set<string>();

  for (const row of rows) {
    const email = (row.email ?? "").trim().toLowerCase();
    if (seenEmails.has(email)) {
      skipped.push({ email, reason: `${email}: duplicate HRFS email` });
      continue;
    }
    seenEmails.add(email);

    const result = mapHrfsUser(row);
    if (result.ok) {
      toImport.push(result.user);
      warnings.push(...result.warnings);
    } else {
      skipped.push({ email, reason: result.reason });
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
  const duplicateSkips = result.skipped.filter((s) => s.reason.includes("duplicate HRFS email"));
  const unresolvedCodes = extractUnresolvedBranchCodes([...result.skipped.map((s) => s.reason), ...branchWarnings]);

  console.log(`\n[bootstrap] ${opts.dryRun ? "DRY RUN — " : ""}mapping summary`);
  console.log(`[bootstrap]   HRFS ACTIVE rows fetched:   ${result.hrfsRowCount}`);
  console.log(`[bootstrap]   EXTRA_USERS appended:       ${EXTRA_USERS.length}`);
  console.log(`[bootstrap]   mapped for import:          ${result.toImport.length}`);
  console.log(
    `[bootstrap]   skipped:                    ${result.skipped.length} (of which ${duplicateSkips.length} duplicate HRFS emails)`,
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

  const rows = await fetchHrfsRows();
  const result = mapAll(rows);

  // SECOND SOURCE (2026-07-25): active portal employees ebright_hrfs doesn't
  // cover — 63 of the Employee Management page's active staff had no
  // ebright_hrfs row at all. Primary-source emails always win; duplicates
  // within the portal result (multiple active employments) collapse to the
  // first row.
  try {
    const portalEmployees = await fetchPortalEmployees();
    const covered = new Set(result.toImport.map((u) => u.email.toLowerCase()));
    let added = 0;
    const portalSkipped: SkippedRow[] = [];
    const portalWarnings: string[] = [];
    for (const row of portalEmployees) {
      const email = (row.email ?? "").trim().toLowerCase();
      if (!email || covered.has(email)) continue;
      covered.add(email);
      const mapped = mapPortalEmployee(row);
      if (mapped.ok) {
        result.toImport.push(mapped.user);
        added++;
        portalWarnings.push(...mapped.warnings);
      } else {
        portalSkipped.push({ email, reason: mapped.reason });
      }
    }
    console.log(
      `[bootstrap] portal second source: ${portalEmployees.length} active employees checked, ${added} added from the portal, ${portalSkipped.length} skipped`,
    );
    for (const s of portalSkipped) console.log(`  - ${s.reason}`);
    for (const w of portalWarnings) console.log(`  - WARN ${w}`);
  } catch (err) {
    console.warn(
      `[bootstrap] WARNING: portal database unreachable — portal-only employees NOT imported (${err instanceof Error ? err.message : err})`,
    );
  }

  // Department enrichment from the portal DB (read-only — runs in dry-run
  // too). Non-fatal: if the portal database is unreachable, the import still
  // proceeds exactly as before, just without filled departments.
  let filled = 0;
  try {
    const portalDepartments = await fetchPortalDepartments();
    filled = enrichDepartments(result.toImport, portalDepartments);
    // Drop the "no department" warnings that enrichment just resolved, so
    // the printed report reflects what will actually be imported.
    if (filled > 0) {
      const deptByEmail = new Map(result.toImport.map((u) => [u.email.toLowerCase(), u.department]));
      result.warnings = result.warnings.filter((w) => {
        if (!w.includes("no department override")) return true;
        const email = w.split(":")[0]?.trim().toLowerCase();
        return !(email && deptByEmail.get(email));
      });
    }
  } catch (err) {
    console.warn(
      `[bootstrap] WARNING: portal database unreachable — departments NOT enriched (${err instanceof Error ? err.message : err})`,
    );
  }
  console.log(`[bootstrap] departments filled from portal HR records: ${filled}`);

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
