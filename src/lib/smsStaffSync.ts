import { Pool } from "pg";
import { z } from "zod";

import { normalizeName } from "@/lib/normalizeName";
import { prisma } from "@/lib/prisma";

// Pushes staff identity into ebrightsms (the student management system), which
// cannot pull: LearningClass.coachId is a NOT NULL FK to its own User table, so
// a coach has to exist as a real row over there before any class can name them.
// This module is the only writer of that integration — POST
// /api/v1/staff/sync/bulk, authenticated with an ebrightsms API key carrying
// the personnel:sync scope.
//
// Deliberately self-contained (its own pg pool, NO `import "server-only"`) so
// it runs both inside Next and from a plain CLI (npm run sync:sms-staff),
// following sync-attendance.ts. That is also why STAFF_ROLE_ID and the
// BranchStaff read are restated here rather than imported from
// employeeQueries.ts / branchStaffProfile.ts, both of which are server-only.

// employeeQueries.ts's STAFF_ROLE_ID — role_type "staff", the workforce, as
// opposed to the shared branch/department mailboxes and the admin accounts.
// Every coach and branch manager holds it; keep the two in step.
const STAFF_ROLE_ID = 6;

interface BranchStaffRow {
  branch: string | null;
  name: string | null;
  role: string | null;
}

const globalForPool = globalThis as unknown as { __smsStaffSyncPool?: Pool };

/** ebright_hrfs — READ-ONLY here. Job titles live in BranchStaff.role, which
 * the employee directory already prefers over employment.position. */
function branchStaffPool(): Pool {
  if (globalForPool.__smsStaffSyncPool) return globalForPool.__smsStaffSyncPool;
  const connectionString = process.env.EBRIGHT_HRFS_DATABASE_URL ?? process.env.HRFS_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "EBRIGHT_HRFS_DATABASE_URL missing — points at the ebright_hrfs DB (BranchStaff). Add it to .env.",
    );
  }
  globalForPool.__smsStaffSyncPool = new Pool({
    connectionString,
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 30_000,
    max: 3,
  });
  return globalForPool.__smsStaffSyncPool;
}

async function loadBranchStaffByName(): Promise<Map<string, BranchStaffRow[]>> {
  const { rows } = await branchStaffPool().query<BranchStaffRow>(
    'SELECT name, role, branch FROM public."BranchStaff"',
  );
  const byName = new Map<string, BranchStaffRow[]>();
  for (const row of rows) {
    const key = normalizeName(row.name ?? "");
    if (!key) continue;
    const bucket = byName.get(key);
    if (bucket) bucket.push(row);
    else byName.set(key, [row]);
  }
  return byName;
}

/** ebrightsms is a separate product with its own branch list; a branch is
 * addressed by the branch_id it was mapped to in ebrightsms's
 * branch_external_link table (externalSystem "ebright_osc_v2"). */
export interface SmsStaffRecord {
  email: string;
  externalBranchId: string;
  externalId: string;
  externalPositionType: "coach" | "intern" | "manager";
  fullName: string;
  nickname?: string;
  phoneNumber?: string;
  status: "active" | "inactive";
}

export interface SkippedStaff {
  branch: string;
  fullName: string;
  reason: string;
  userId: number;
}

export interface CollectOptions {
  /** Restrict to one branch by name — for a cautious first live run. */
  branchName?: string;
  /** Set false to stop sending people who have left. On by default since the
   * initial import landed (2026-08-27): ebrightsms only ever learns of a
   * departure from a record pushed to it, so leaving them out means nobody is
   * ever archived there. It was off for that first run because leavers do not
   * exist in ebrightsms yet, so including them creates an archived account
   * rather than archiving an existing one — a one-off backfill of ex-staff
   * that is only worth paying once. */
  includeLeavers?: boolean;
}

export interface CollectResult {
  records: SmsStaffRecord[];
  skipped: SkippedStaff[];
}

// HQ is deliberately out of scope — ebrightsms has no HQ branch and its staff
// do not teach or run a centre.
const EXCLUDED_BRANCH_NAMES = new Set(["HQ"]);

// Employment statuses that mean "currently working here". "pre" is excluded on
// purpose: a pre-hire has not started, and HRMS advances them to onboarding by
// itself on their start date (stageTransitionAutomation.ts), so the next run
// picks them up with no human involved.
const PRESENT_STATUSES = new Set(["active", "onboarding"]);

// Mirrors StaffSyncSchema.email in ebrightsms's lib/staff-sync.ts.
const EMAIL = z.string().trim().toLowerCase().email();

// Test rows that live in the real staff tables. Pinned by user_id rather than
// by name so a later rename cannot quietly let them through.
const EXCLUDED_USER_IDS = new Map<number, string>([
  [309, "Test Branch Exec (Klang) — also the phantom 2nd Klang manager"],
  [2604, "YC TESTING (Tropicana Sungai Buloh)"],
]);

// Where the two HRMS records disagree and a human has ruled. Keyed by
// normalizeName() so spelling/spacing drift cannot break the override.
const POSITION_TYPE_OVERRIDES = new Map<string, SmsStaffRecord["externalPositionType"]>([
  // employment.position says INTERN, BranchStaff.role says BM. Ruled: intern.
  [normalizeName("Siti Nurul Huda Natasha Binti Hasrin"), "intern"],
  // employment.position says FULL TIME, BranchStaff.role says BM. Ruled: BM.
  [normalizeName("PUTRI ELLYA SARI BINTI SHARIF"), "manager"],
]);

/** HRMS job titles are free text and live in two places: BranchStaff.role
 * ("PT Coach" | "FT Coach" | "BM" | "INT" | "FT EXEC" | "FT HOD" | "CEO"), and
 * employment.position, which is blank for a good share of current staff. The
 * employee directory already prefers BranchStaff and falls back to employment
 * (resolveEffectivePositionGroup), so this does the same — otherwise ~26
 * people bounce for a missing title they visibly have on screen.
 *
 * Returns null for anything unrecognised rather than guessing. FT EXEC/FT
 * HOD/CEO land here today only if such a person is ever posted to a branch;
 * they have no ebrightsms equivalent and want a human decision, not a default.
 * Intern is tested first: "INT" is the intern abbreviation, and no coach title
 * contains it. */
export function positionTypeFromTitle(title: string | null): SmsStaffRecord["externalPositionType"] | null {
  const value = (title ?? "").toUpperCase().trim();
  if (!value) return null;
  if (/\bINT\b|INTERN/.test(value)) return "intern";
  if (/COACH/.test(value)) return "coach";
  // Executives run classes alongside their desk work, so they take the Coach
  // role too. Kept below COACH so hybrid titles are unaffected either way.
  if (/\bEXEC/.test(value)) return "coach";
  if (/^BM$|BRANCH MANAGER|MANAGER/.test(value)) return "manager";
  return null;
}

function branchStaffTitle(
  index: Map<string, BranchStaffRow[]>,
  fullName: string,
  branchName: string,
): string | null {
  const candidates = index.get(normalizeName(fullName));
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].role;
  // Same name twice in BranchStaff — prefer the row sitting at the same branch
  // rather than picking arbitrarily, and give up if that does not separate them.
  const atBranch = candidates.filter((row) => (row.branch ?? "").trim().toLowerCase() === branchName.toLowerCase());
  return atBranch.length === 1 ? atBranch[0].role : null;
}

export async function collectStaffForSms(options: CollectOptions = {}): Promise<CollectResult> {
  const [staff, index] = await Promise.all([
    prisma.users.findMany({
      orderBy: { user_id: "asc" },
      select: {
        user_id: true,
        email: true,
        user_profile: { select: { full_name: true, nick_name: true, phone: true } },
        employment: {
          orderBy: { start_date: "desc" },
          select: { branch: { select: { branch_name: true, branch_id: true } }, position: true, status: true },
          take: 1,
        },
      },
      where: { deleted_at: null, role_id: STAFF_ROLE_ID },
    }),
    loadBranchStaffByName(),
  ]);

  const records: SmsStaffRecord[] = [];
  const skipped: SkippedStaff[] = [];

  for (const person of staff) {
    const employment = person.employment[0];
    const branchName = employment?.branch?.branch_name ?? "";
    const fullName = person.user_profile?.full_name?.trim() ?? "";
    const note = (reason: string) =>
      skipped.push({ branch: branchName || "(none)", fullName: fullName || person.email, reason, userId: person.user_id });

    const excluded = EXCLUDED_USER_IDS.get(person.user_id);
    if (excluded) { note(`excluded: ${excluded}`); continue; }
    if (!employment?.branch) { note("no branch on their employment record"); continue; }
    if (EXCLUDED_BRANCH_NAMES.has(branchName)) { note(`branch out of scope (${branchName})`); continue; }
    if (options.branchName && branchName !== options.branchName) continue;

    const status = employment.status ?? "";
    const present = PRESENT_STATUSES.has(status);
    const includeLeavers = options.includeLeavers ?? true;
    if (!present && !(includeLeavers && status === "inactive")) {
      note(`employment status "${status || "(none)"}"`);
      continue;
    }

    if (!fullName) { note("no full name recorded"); continue; }
    if (!person.email?.trim()) { note("no email address"); continue; }
    // The bulk endpoint parses the WHOLE batch before writing any of it, so a
    // single unparseable address rejects all 247 records rather than its own.
    // HRMS holds addresses nobody validated on the way in (a trailing
    // backslash, at time of writing), so screen them here against the same
    // rule the receiving schema applies and report the row instead.
    if (!EMAIL.safeParse(person.email).success) { note(`email "${person.email.trim()}" is not a valid address`); continue; }

    const title = branchStaffTitle(index, fullName, branchName) ?? employment.position;
    const positionType = POSITION_TYPE_OVERRIDES.get(normalizeName(fullName)) ?? positionTypeFromTitle(title);
    if (!positionType) { note(`job title "${(title ?? "").trim() || "(blank)"}" has no ebrightsms role`); continue; }

    records.push({
      email: person.email.trim().toLowerCase(),
      externalBranchId: String(employment.branch.branch_id),
      // The user_id, not the employment_id: it survives transfers and rehires,
      // which is what keeps ebrightsms updating one person instead of
      // accumulating duplicates for them.
      externalId: String(person.user_id),
      externalPositionType: positionType,
      fullName,
      nickname: person.user_profile?.nick_name?.trim() || undefined,
      phoneNumber: person.user_profile?.phone?.trim() || undefined,
      status: present ? "active" : "inactive",
    });
  }

  return { records, skipped };
}

export interface PushOutcome {
  created: number;
  failures: { error: string; externalId: string }[];
  updated: number;
}

// The bulk endpoint caps a request at 500 records; chunking keeps this correct
// if the workforce ever outgrows a single call.
const BATCH_SIZE = 500;

export async function pushStaffToSms(records: SmsStaffRecord[]): Promise<PushOutcome> {
  const baseUrl = process.env.SMS_BASE_URL;
  const apiKey = process.env.SMS_STAFF_SYNC_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("SMS_BASE_URL and SMS_STAFF_SYNC_API_KEY must both be set to push staff to ebrightsms.");
  }

  const outcome: PushOutcome = { created: 0, failures: [], updated: 0 };

  for (let start = 0; start < records.length; start += BATCH_SIZE) {
    const batch = records.slice(start, start + BATCH_SIZE);
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/v1/staff/sync/bulk`, {
      body: JSON.stringify({ staff: batch }),
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      method: "POST",
    });

    const body = (await response.json().catch(() => null)) as
      | { results?: { ok: boolean; created?: boolean; error?: string; externalId: string }[]; message?: string }
      | null;

    if (!response.ok) {
      throw new Error(`ebrightsms rejected the batch (HTTP ${response.status}): ${body?.message ?? "no message"}`);
    }

    for (const result of body?.results ?? []) {
      if (!result.ok) outcome.failures.push({ error: result.error ?? "unknown error", externalId: result.externalId });
      else if (result.created) outcome.created++;
      else outcome.updated++;
    }
  }

  return outcome;
}

export interface SyncSummary extends CollectResult {
  outcome: PushOutcome | null;
}

/** One sweep. Collects, and pushes only when `apply` is true — every caller
 * defaults to a dry run so the record set can be read before anyone is
 * provisioned and emailed. */
export async function runSmsStaffSync(
  options: CollectOptions & { apply?: boolean } = {},
): Promise<SyncSummary> {
  const collected = await collectStaffForSms(options);
  if (!options.apply) return { ...collected, outcome: null };
  return { ...collected, outcome: await pushStaffToSms(collected.records) };
}
