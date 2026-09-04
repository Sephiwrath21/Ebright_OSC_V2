import { Pool } from "pg";

// Pushes students from CNS (the CRM) into ebrightsms, which cannot pull: it
// holds no CRM credentials and has no route to that database. Mirrors
// smsStaffSync.ts — POST /api/v1/students/sync/bulk, authenticated with an
// ebrightsms API key carrying the students:sync scope.
//
// Deliberately self-contained (its own pg pool, NO `import "server-only"`) so
// it runs both inside Next and from a plain CLI (npm run sync:sms-students),
// following smsStaffSync.ts.
//
// SOURCE: crm.crm_trial_enrolment_report, a report table CNS refreshes. Its
// primary key (opportunity_id) is what ebrightsms remembers, so a record is
// only ever taken once.

const globalForPool = globalThis as unknown as { __smsStudentSyncPool?: Pool };

/** ebright_crm — READ-ONLY here. */
function crmPool(): Pool {
  if (globalForPool.__smsStudentSyncPool) return globalForPool.__smsStudentSyncPool;
  const connectionString = process.env.CRM_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "CRM_DATABASE_URL missing — points at the ebright_crm DB (crm_trial_enrolment_report). Add it to .env.",
    );
  }
  globalForPool.__smsStudentSyncPool = new Pool({
    connectionString,
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 30_000,
    max: 3,
  });
  return globalForPool.__smsStudentSyncPool;
}

interface ReportRow {
  branch_code: string | null;
  child_dob: string | null;
  child_gender: string | null;
  child_name: string | null;
  current_stage_code: string | null;
  details_verified_at: Date | null;
  email: string | null;
  enrolled_at: Date | null;
  opportunity_id: string;
  parent_full_name: string | null;
  parent_gender: string | null;
  parent_name: string | null;
  phone: string | null;
  relationship: string | null;
  student_id: string | null;
}

/** The payload shape of ebrightsms's StudentSyncSchema (lib/student-sync.ts). */
export interface SmsStudentRecord {
  branchCode: string;
  enrolledAt?: string;
  externalCode?: string;
  externalId: string;
  externalStage?: string;
  guardian?: {
    email?: string;
    fullName: string;
    gender?: string;
    phoneNo?: string;
    relationship?: string;
  };
  student: {
    dateOfBirth?: string;
    fullName: string;
    gender?: string;
  };
  verifiedAt?: string;
}

export interface SkippedStudent {
  externalId: string;
  reason: string;
  stage: string;
}

export interface CollectOptions {
  /** Only records verified strictly after this moment. REQUIRED — there is no
   * "everything" mode on purpose: the report holds enrolments going back to
   * May 2026, and 38 of its named children already exist in ebrightsms from the
   * September leads-database import. A blind first run would offer all of them
   * at once and lean entirely on the receiver's duplicate guard. */
  since: Date;
  /** Cap the batch — a cautious first live run. */
  limit?: number;
}

export interface CollectResult {
  records: SmsStudentRecord[];
  skipped: SkippedStudent[];
}

// `details_verified_at` is the gate, and it is not configurable.
//
// It is the only field in the report that predicts whether the child's details
// are actually there: of the rows carrying it, 100% have a name, a date of
// birth AND a gender; of the rows without it, 5% have a name and 0.5% a date of
// birth (measured 2026-09-04 over 2,451 rows). Stage is deliberately NOT
// filtered — today only enrolments are ever verified, so only enrolments flow;
// the day someone verifies a record at trial stage, that trial syncs by itself
// with no code change. That is how trials switch on.
const VERIFIED_ONLY = `
  SELECT opportunity_id, current_stage_code, details_verified_at, enrolled_at,
         child_name, child_dob, child_gender,
         parent_name, parent_full_name, parent_gender, relationship, email, phone,
         branch_code, student_id
    FROM crm.crm_trial_enrolment_report
   WHERE details_verified_at IS NOT NULL
     AND details_verified_at > $1
   ORDER BY details_verified_at ASC
`;

/** The CRM writes '' rather than NULL for most absent text. */
function text(value: string | null): string | undefined {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** child_dob is free text in the CRM. Only an unambiguous date is passed on —
 * a guess here would be indistinguishable from a real date of birth, and the
 * receiver's duplicate check uses it to tell two children apart. */
function isoDate(value: string | null): string | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!iso) return undefined;
  const parsed = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  // Guards against 2026-02-31 parsing into March.
  if (parsed.toISOString().slice(0, 10) !== `${iso[1]}-${iso[2]}-${iso[3]}`) return undefined;
  return parsed.toISOString().slice(0, 10);
}

export async function collectStudentsForSms(options: CollectOptions): Promise<CollectResult> {
  const { rows } = await crmPool().query<ReportRow>(VERIFIED_ONLY, [options.since]);

  const records: SmsStudentRecord[] = [];
  const skipped: SkippedStudent[] = [];

  for (const row of rows) {
    const stage = text(row.current_stage_code) ?? "(none)";
    const childName = text(row.child_name);
    const branchCode = text(row.branch_code)?.toUpperCase();

    // Both are hard requirements of the receiver. A verified row has always had
    // them so far; skipping rather than throwing keeps one bad row from
    // stopping the sweep.
    if (!childName) {
      skipped.push({ externalId: row.opportunity_id, reason: "no child name", stage });
      continue;
    }
    if (!branchCode) {
      skipped.push({ externalId: row.opportunity_id, reason: "no branch code", stage });
      continue;
    }

    // parent_full_name is the parent proper; parent_name falls back to the
    // contact's own first/last name, which for a contact with no
    // parentFullName is the SAME string the child's name is derived from.
    // Preferring the explicit column keeps a parent from being filed under
    // their child's name.
    const guardianName = text(row.parent_full_name) ?? text(row.parent_name);

    records.push({
      branchCode,
      enrolledAt: row.enrolled_at?.toISOString(),
      externalCode: text(row.student_id),
      externalId: row.opportunity_id,
      externalStage: text(row.current_stage_code),
      ...(guardianName
        ? {
            guardian: {
              email: text(row.email),
              fullName: guardianName,
              gender: text(row.parent_gender),
              phoneNo: text(row.phone),
              relationship: text(row.relationship),
            },
          }
        : {}),
      student: {
        dateOfBirth: isoDate(row.child_dob),
        fullName: childName,
        gender: text(row.child_gender),
      },
      verifiedAt: row.details_verified_at?.toISOString(),
    });

    if (options.limit && records.length >= options.limit) break;
  }

  return { records, skipped };
}

export interface PushOutcome {
  created: number;
  failures: { error: string; externalId: string }[];
  updated: number;
}

// Matches BulkStudentSyncSchema's cap in ebrightsms.
const BATCH_SIZE = 500;

export async function pushStudentsToSms(records: SmsStudentRecord[]): Promise<PushOutcome> {
  const baseUrl = process.env.SMS_BASE_URL;
  const apiKey = process.env.SMS_STUDENT_SYNC_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error(
      "SMS_BASE_URL and SMS_STUDENT_SYNC_API_KEY must both be set to push students to ebrightsms.",
    );
  }

  const outcome: PushOutcome = { created: 0, failures: [], updated: 0 };

  for (let start = 0; start < records.length; start += BATCH_SIZE) {
    const batch = records.slice(start, start + BATCH_SIZE);
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/v1/students/sync/bulk`, {
      body: JSON.stringify({ students: batch }),
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      method: "POST",
    });

    const body = (await response.json().catch(() => null)) as
      | { results?: { ok: boolean; created?: boolean; error?: string; externalId: string }[]; message?: string }
      | null;

    if (!response.ok) {
      throw new Error(
        `ebrightsms rejected the batch (HTTP ${response.status}): ${body?.message ?? "no message"}`,
      );
    }

    for (const result of body?.results ?? []) {
      if (!result.ok) {
        outcome.failures.push({ error: result.error ?? "unknown error", externalId: result.externalId });
      } else if (result.created) outcome.created++;
      else outcome.updated++;
    }
  }

  return outcome;
}

export interface SyncSummary extends CollectResult {
  outcome: PushOutcome | null;
}

/** One sweep. Collects, and pushes only when `apply` is true — every caller
 * defaults to a dry run so the record set can be read before any child is
 * created in ebrightsms. */
export async function runSmsStudentSync(
  options: CollectOptions & { apply?: boolean },
): Promise<SyncSummary> {
  const collected = await collectStudentsForSms(options);
  if (!options.apply) return { ...collected, outcome: null };
  return { ...collected, outcome: await pushStudentsToSms(collected.records) };
}
