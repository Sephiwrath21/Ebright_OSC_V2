import { Pool } from "pg";

// Hands CNS leads to the ebrightsms enrollment queue, which cannot pull them:
// it holds no CRM credentials and has no route to that database. Mirrors
// smsStaffSync.ts — POST /api/v1/enrollments/submissions, authenticated with an
// ebrightsms API key carrying the students:create scope.
//
// Nothing here creates a student. A lead lands in the same review queue staff
// already work for the public enrollment form, and a branch manager completes
// it and approves it. That is the whole point of the handover: CNS records the
// parent and the phone, and names the child in about one lead in eight, so the
// details have to be finished by someone who can pick up a phone.
//
// Deliberately self-contained (its own pg pool, NO `import "server-only"`) so
// it runs both inside Next and from a plain CLI (npm run sync:sms-students),
// following smsStaffSync.ts.
//
// SOURCE: crm.crm_trial_enrolment_report, a report table CNS refreshes.
// opportunity_id is its primary key and is what ebrightsms remembers, so the
// same lead arriving again updates the request it already has rather than
// making a second one.

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

/** The stages a child is handed over at, and nothing else.
 *
 * A child goes to SMS when their trial is BOOKED — the coach needs them on the
 * register before they walk in — and again if they enroll. Everything
 * downstream (showed up, no-showed, showed up and didn't enroll) happens to a
 * record SMS already holds: 584 of the 601 enrolled leads carry a trial date.
 * The stages that never reached a trial at all (cold, unresponsive, do not
 * disturb, follow-ups) are not students and stay in CNS. */
const HANDOVER_STAGES = ["CT", "CTB", "RSD", "ENR", "DEP"] as const;

interface ReportRow {
  branch_code: string | null;
  child_dob: string | null;
  child_gender: string | null;
  child_name: string | null;
  current_stage: string | null;
  current_stage_code: string | null;
  email: string | null;
  opportunity_id: string;
  parent_full_name: string | null;
  parent_gender: string | null;
  parent_name: string | null;
  phone: string | null;
  relationship: string | null;
  trial_date: Date | null;
}

/** The payload shape of ebrightsms's CnsSubmissionSchema. */
export interface SmsEnrollmentRequest {
  branchCode: string;
  externalSourceId: string;
  externalStageCode: string;
  externalTrialDate?: string;
  note: string;
  parents: {
    guardianEmail?: string;
    guardianFullName: string;
    guardianGender?: string;
    guardianPhone?: string;
    guardianRelationship?: string;
  }[];
  student: {
    studentDateOfBirth?: string;
    studentFullName?: string;
    studentGender?: string;
  };
}

export interface SkippedLead {
  externalId: string;
  reason: string;
  stage: string;
}

export interface CollectOptions {
  /** Only leads that have moved since this moment. REQUIRED — there is no
   * "everything" mode on purpose: the report holds leads back to May, and a
   * blind first run would drop the whole back catalogue on one branch's queue
   * at once. Deciding to load history is a separate, deliberate act. */
  since: Date;
  /** Cap the batch — a cautious first live run. */
  limit?: number;
}

export interface CollectResult {
  records: SmsEnrollmentRequest[];
  skipped: SkippedLead[];
}

// What has moved since `since`.
//
// refreshed_at is no use here: CNS stamps every row with the same value each
// time it rebuilds the report, so it says when the table was written, not when
// a lead changed. These three are per-row and between them cover everything
// worth sending again — a new lead, a stage move (which is how an enrollment
// reaches SMS: as a second push of a child sent earlier as a trial), and the
// moment somebody finally filled the child's details in.
const CHANGED_SINCE = `
  SELECT opportunity_id, current_stage, current_stage_code, trial_date,
         child_name, child_dob, child_gender,
         parent_name, parent_full_name, parent_gender, relationship, email, phone,
         branch_code
    FROM crm.crm_trial_enrolment_report
   WHERE current_stage_code = ANY($1)
     AND greatest(
           coalesce(last_stage_change_at, 'epoch'::timestamptz),
           coalesce(details_verified_at,  'epoch'::timestamptz),
           coalesce(lead_created_at,      'epoch'::timestamptz)
         ) > $2
   ORDER BY greatest(
              coalesce(last_stage_change_at, 'epoch'::timestamptz),
              coalesce(details_verified_at,  'epoch'::timestamptz),
              coalesce(lead_created_at,      'epoch'::timestamptz)
            ) ASC
`;

/** The CRM writes '' rather than NULL for most absent text. */
function text(value: string | null): string | undefined {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** child_dob is free text in the CRM. Only an unambiguous date is passed on —
 * a guess here would be indistinguishable from a real date of birth. */
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

/** The calendar day a timestamp falls on in Malaysia.
 *
 * toISOString() would answer in UTC, and a trial at 9am on the 24th is
 * 2026-09-24T01:00Z — fine — while one at 8am is 2026-09-24T00:00Z and one at
 * 7am is the 23rd. Branch staff read this as the day of the trial, so it has
 * to be the day where the trial happens. */
function kualaLumpurDate(value: Date | null): string | undefined {
  if (!value || Number.isNaN(value.getTime())) return undefined;
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
  }).format(value);
}

export async function collectLeadsForSms(options: CollectOptions): Promise<CollectResult> {
  const { rows } = await crmPool().query<ReportRow>(CHANGED_SINCE, [
    [...HANDOVER_STAGES],
    options.since,
  ]);

  const records: SmsEnrollmentRequest[] = [];
  const skipped: SkippedLead[] = [];

  for (const row of rows) {
    const stage = text(row.current_stage_code) ?? "(none)";
    const branchCode = text(row.branch_code)?.toUpperCase();

    // parent_full_name is the parent proper; parent_name falls back to the
    // contact's own first/last name, which for a contact with no parentFullName
    // is the SAME string the child's name is derived from. Preferring the
    // explicit column keeps a parent from being filed under their child's name.
    const guardianName = text(row.parent_full_name) ?? text(row.parent_name);
    const email = text(row.email);
    const phone = text(row.phone);

    // The receiver's floor, checked here so a lead that cannot be worked never
    // becomes a row in somebody's queue. A missing child name is NOT a reason
    // to skip — that is the ordinary case, and filling it in is the job.
    if (!branchCode) {
      skipped.push({ externalId: row.opportunity_id, reason: "no branch code", stage });
      continue;
    }
    if (!guardianName) {
      skipped.push({ externalId: row.opportunity_id, reason: "no parent name", stage });
      continue;
    }
    if (!email && !phone) {
      skipped.push({ externalId: row.opportunity_id, reason: "no phone or email", stage });
      continue;
    }

    records.push({
      branchCode,
      externalSourceId: row.opportunity_id,
      externalStageCode: stage,
      externalTrialDate: kualaLumpurDate(row.trial_date),
      note: `From CNS — ${text(row.current_stage) ?? stage}.`,
      parents: [
        {
          guardianEmail: email,
          guardianFullName: guardianName,
          guardianGender: text(row.parent_gender),
          guardianPhone: phone,
          guardianRelationship: text(row.relationship),
        },
      ],
      student: {
        studentDateOfBirth: isoDate(row.child_dob),
        studentFullName: text(row.child_name),
        studentGender: text(row.child_gender),
      },
    });

    if (options.limit && records.length >= options.limit) break;
  }

  return { records, skipped };
}

export interface PushOutcome {
  created: number;
  failures: { error: string; externalId: string }[];
  /** Already approved or declined, and nothing about it moved. */
  left: number;
  /** A request already in the queue, brought up to date. */
  refreshed: number;
  /** An approved trial, or a declined lead, back in the queue having enrolled. */
  reopened: number;
}

/** One request per lead. The endpoint takes a single submission, and a night's
 * work is a handful of leads — 364 moved in the whole of the last 30 days. */
export async function pushLeadsToSms(records: SmsEnrollmentRequest[]): Promise<PushOutcome> {
  const baseUrl = process.env.SMS_BASE_URL;
  const apiKey = process.env.SMS_STUDENT_SYNC_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error(
      "SMS_BASE_URL and SMS_STUDENT_SYNC_API_KEY must both be set to push leads to ebrightsms.",
    );
  }

  const endpoint = `${baseUrl.replace(/\/+$/, "")}/api/v1/enrollments/submissions`;
  const outcome: PushOutcome = { created: 0, failures: [], left: 0, refreshed: 0, reopened: 0 };

  for (const record of records) {
    const response = await fetch(endpoint, {
      body: JSON.stringify(record),
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      method: "POST",
    });

    const body = (await response.json().catch(() => null)) as
      | { action?: string; fieldErrors?: Record<string, string[]>; message?: string; ok?: boolean }
      | null;

    if (!response.ok || !body?.ok) {
      const detail = Object.entries(body?.fieldErrors ?? {})
        .map(([field, errors]) => `${field}: ${errors.join(", ")}`)
        .join("; ");
      outcome.failures.push({
        error: `HTTP ${response.status} — ${body?.message ?? "no message"}${detail ? ` (${detail})` : ""}`,
        externalId: record.externalSourceId,
      });
      continue;
    }

    switch (body.action) {
      case "CREATED":
        outcome.created++;
        break;
      case "REFRESH":
        outcome.refreshed++;
        break;
      case "REOPEN":
        outcome.reopened++;
        break;
      default:
        outcome.left++;
    }
  }

  return outcome;
}

export interface SyncSummary extends CollectResult {
  outcome: PushOutcome | null;
}

/** One sweep. Collects, and pushes only when `apply` is true — every caller
 * defaults to a dry run so the leads can be read before any of them lands in
 * a branch's queue. */
export async function runSmsStudentSync(
  options: CollectOptions & { apply?: boolean },
): Promise<SyncSummary> {
  const collected = await collectLeadsForSms(options);
  if (!options.apply) return { ...collected, outcome: null };
  return { ...collected, outcome: await pushLeadsToSms(collected.records) };
}
