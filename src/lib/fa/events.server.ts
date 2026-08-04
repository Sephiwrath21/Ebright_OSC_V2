import "server-only";
import { pool } from "./db";
import { dateStrOf } from "./dates";
import {
  BranchCode,
  DayPolicy,
  EventBranchOverride,
  EventStatus,
  FAEvent,
  Invitation,
  InvitationStatus,
  Session,
  SessionQuota,
} from "./types";

const TENANT = "ebright";

// Sentinels used by createInvitationRow to distinguish business-rule rejects
// from real DB errors. The route translates these to 409 responses with a
// descriptive `reason` string.
export class InvitationRejected extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = "InvitationRejected";
  }
}

// ----------------------------------------------------------------------------
// Row shapes (snake_case from postgres) and mappers
// ----------------------------------------------------------------------------

interface EventRow {
  id: string;
  name: string;
  month: number;
  year: number;
  venue: string;
  start_date: Date | string;
  end_date: Date | string;
  number_of_days: number;
  invitation_open_date: Date | string;
  invitation_close_date: Date | string;
  status: string;
  video_upload_locked: boolean;
  created_by: string | null;
  created_at: Date | string;
  notes: string | null;
}

interface SessionRow {
  id: string;
  event_id: string;
  day_number: number;
  session_number: number;
  start_time: string;
  end_time: string;
  label: string | null;
}

interface QuotaRow {
  id: string;
  session_id: string;
  branch: string;
  quota: number;
}

interface InvitationRow {
  id: string;
  event_id: string;
  session_id: string;
  student_id: string;
  branch: string;
  target_grade: number | null;
  status: string;
  invited_by: string | null;
  invited_at: Date | string;
  confirmed_at: Date | string | null;
  attendance_marked_at: Date | string | null;
  attendance_marked_by: string | null;
  notes: string | null;
  student_name_snapshot?: string | null;
  /** video_link/proof_url predate the online/physical split and are kept as
   *  the PHYSICAL session's proof columns (existing data carries over
   *  unchanged); video_link_online/proof_url_online are the new, independent
   *  online-session proof pair. See Invitation.physicalVideoLink /
   *  onlineVideoLink in ./types. */
  video_link?: string | null;
  proof_url?: string | null;
  video_link_online?: string | null;
  proof_url_online?: string | null;
  /** practice_date/practice_time predate the online/physical split and are
   *  kept as the PHYSICAL session's columns (existing data carries over
   *  unchanged); practice_online_date/practice_online_time are the new,
   *  independent online-session pair. See Invitation.onlinePracticeDate /
   *  physicalPracticeDate in ./types. */
  practice_date?: string | null;
  practice_time?: string | null;
  practice_online_date?: string | null;
  practice_online_time?: string | null;
  /** Per-slot session type (max-two-practices era, 2026-07-17): the two
   *  column SETS are slots; each slot's real type (online/physical) is free.
   *  Null on legacy rows → slot keeps its historical meaning. */
  practice_type?: string | null;
  practice_online_type?: string | null;
}

// Self-provisioning columns for the confirm-proof + practice-scheduling
// feature. Same idea as ensureTable()/ensureColumns() elsewhere in this app
// (e.g. flagged_action_log, career_applications): run once per server process
// via ADD COLUMN IF NOT EXISTS, so the columns exist before any write touches
// them — no separate manual migration step required.
let columnsEnsured: Promise<void> | null = null;
function ensureConfirmProofColumns(): Promise<void> {
  if (!columnsEnsured) {
    columnsEnsured = pool.query(`
      ALTER TABLE fa_invitations
        ADD COLUMN IF NOT EXISTS video_link           text,
        ADD COLUMN IF NOT EXISTS proof_url            text,
        ADD COLUMN IF NOT EXISTS video_link_online    text,
        ADD COLUMN IF NOT EXISTS proof_url_online     text,
        ADD COLUMN IF NOT EXISTS practice_date        date,
        ADD COLUMN IF NOT EXISTS practice_time        text,
        ADD COLUMN IF NOT EXISTS practice_online_date date,
        ADD COLUMN IF NOT EXISTS practice_online_time text,
        ADD COLUMN IF NOT EXISTS practice_type        text,
        ADD COLUMN IF NOT EXISTS practice_online_type text
    `).then(() => undefined).catch((err) => {
      columnsEnsured = null; // let the next call retry
      throw err;
    });
  }
  return columnsEnsured;
}

// "Close invitations only" vs "close invitations + video" feature — lets a
// closed event still allow BM practice-video/proof uploads. Defaults TRUE so
// existing/older closed events keep their original all-or-nothing lock.
let videoLockColumnEnsured: Promise<void> | null = null;
function ensureVideoLockColumn(): Promise<void> {
  if (!videoLockColumnEnsured) {
    videoLockColumnEnsured = pool.query(`
      ALTER TABLE fa_events
        ADD COLUMN IF NOT EXISTS video_upload_locked boolean NOT NULL DEFAULT true
    `).then(() => undefined).catch((err) => {
      videoLockColumnEnsured = null;
      throw err;
    });
  }
  return videoLockColumnEnsured;
}

interface EventBranchOverrideRow {
  event_id: string;
  branch_code: string;
  day_policy: string | null;
  granted_by: string;
  granted_at: Date | string;
  reason: string | null;
}

function isoDate(d: Date | string): string {
  return dateStrOf(d);
}

function isoTimestamp(d: Date | string | null): string | undefined {
  if (d == null) return undefined;
  if (d instanceof Date) return d.toISOString();
  return String(d);
}

/** Date-only field (e.g. practice_date), null-safe. Postgres `date` columns
 *  come back as a LOCAL-midnight Date via node-pg — dateStrOf reads the
 *  calendar date with local getters, which is correct on every runtime we
 *  use (a toISOString() round-trip shifted the date back a day on KL dev
 *  machines). */
function isoDateOrNull(d: Date | string | null | undefined): string | undefined {
  if (d == null) return undefined;
  return dateStrOf(d);
}

function rowToEvent(r: EventRow): FAEvent {
  return {
    id: r.id,
    name: r.name,
    month: r.month,
    year: r.year,
    venue: r.venue,
    startDate: isoDate(r.start_date),
    endDate: isoDate(r.end_date),
    numberOfDays: (r.number_of_days as 1 | 2 | 3),
    invitationOpenDate: isoDate(r.invitation_open_date),
    invitationCloseDate: isoDate(r.invitation_close_date),
    status: r.status as EventStatus,
    videoUploadLocked: r.video_upload_locked ?? true,
    createdBy: r.created_by ?? "",
    createdAt: isoTimestamp(r.created_at) ?? new Date().toISOString(),
    notes: r.notes ?? undefined,
  };
}

function rowToSession(r: SessionRow): Session {
  return {
    id: r.id,
    eventId: r.event_id,
    dayNumber: r.day_number as 1 | 2 | 3,
    sessionNumber: r.session_number,
    startTime: r.start_time,
    endTime: r.end_time,
    label: r.label ?? undefined,
  };
}

function rowToQuota(r: QuotaRow): SessionQuota {
  return {
    id: r.id,
    sessionId: r.session_id,
    branch: r.branch as BranchCode,
    quota: r.quota,
  };
}

function rowToOverride(r: EventBranchOverrideRow): EventBranchOverride {
  return {
    eventId: r.event_id,
    branchCode: r.branch_code as BranchCode,
    dayPolicy: normalizeDayPolicy(r.day_policy),
    grantedBy: r.granted_by,
    grantedAt: isoTimestamp(r.granted_at) ?? new Date().toISOString(),
    reason: r.reason ?? undefined,
  };
}

/** Coerce a raw day_policy value (possibly null on pre-migration rows) into
 *  the DayPolicy union, defaulting to the legacy SAME_DAY behaviour. */
function normalizeDayPolicy(v: string | null | undefined): DayPolicy {
  return v === "DIFF_DAY" || v === "BOTH" ? v : "SAME_DAY";
}

function rowToInvitation(r: InvitationRow): Invitation {
  return {
    id: r.id,
    eventId: r.event_id,
    sessionId: r.session_id,
    studentId: r.student_id,
    branch: r.branch as BranchCode,
    targetGrade: r.target_grade ?? 0,
    status: r.status as InvitationStatus,
    invitedBy: r.invited_by ?? "",
    invitedAt: isoTimestamp(r.invited_at) ?? new Date().toISOString(),
    confirmedAt: isoTimestamp(r.confirmed_at),
    attendanceMarkedAt: isoTimestamp(r.attendance_marked_at),
    attendanceMarkedBy: r.attendance_marked_by ?? undefined,
    notes: r.notes ?? undefined,
    studentNameSnapshot: r.student_name_snapshot ?? undefined,
    physicalVideoLink: r.video_link ?? undefined,
    physicalProofUrl: r.proof_url ?? undefined,
    onlineVideoLink: r.video_link_online ?? undefined,
    onlineProofUrl: r.proof_url_online ?? undefined,
    physicalPracticeDate: isoDateOrNull(r.practice_date),
    physicalPracticeTime: r.practice_time ?? undefined,
    onlinePracticeDate: isoDateOrNull(r.practice_online_date),
    onlinePracticeTime: r.practice_online_time ?? undefined,
    physicalPracticeType: r.practice_type === "online" || r.practice_type === "physical" ? r.practice_type : undefined,
    onlinePracticeType: r.practice_online_type === "online" || r.practice_online_type === "physical" ? r.practice_online_type : undefined,
  };
}

// RETURNING column list for fa_invitations writes. ensureConfirmProofColumns()
// runs before every write that uses this, so video_link/proof_url/video_link_online/
// proof_url_online/practice_date/practice_time/practice_online_date/practice_online_time
// are always present by the time this SELECT runs.
const INV_RETURNING_FULL =
  `id, event_id, session_id, student_id, branch, target_grade, status, invited_by,
   invited_at, confirmed_at, attendance_marked_at, attendance_marked_by, notes, student_name_snapshot,
   video_link, proof_url, video_link_online, proof_url_online,
   practice_date, practice_time, practice_online_date, practice_online_time,
   practice_type, practice_online_type`;

// ----------------------------------------------------------------------------
// Reads
// ----------------------------------------------------------------------------

export async function fetchAllEventData(): Promise<{
  events: FAEvent[];
  sessions: Session[];
  quotas: SessionQuota[];
  invitations: Invitation[];
  overrides: EventBranchOverride[];
}> {
  await Promise.all([ensureConfirmProofColumns(), ensureVideoLockColumn()]);
  const [eventsRes, sessionsRes, quotasRes, invitationsRes, overridesRes] = await Promise.all([
    pool.query<EventRow>(
      `SELECT id, name, month, year, venue, start_date, end_date, number_of_days,
              invitation_open_date, invitation_close_date, status, video_upload_locked, created_by, created_at, notes
         FROM fa_events
        WHERE tenant_id = $1
        ORDER BY start_date DESC, created_at DESC`,
      [TENANT]
    ),
    pool.query<SessionRow>(
      `SELECT id, event_id, day_number, session_number, start_time, end_time, label
         FROM fa_sessions
        WHERE tenant_id = $1`,
      [TENANT]
    ),
    pool.query<QuotaRow>(
      `SELECT id, session_id, branch, quota
         FROM fa_session_quotas
        WHERE tenant_id = $1`,
      [TENANT]
    ),
    pool.query<InvitationRow>(
      `SELECT id, event_id, session_id, student_id, branch, target_grade, status, invited_by,
              invited_at, confirmed_at, attendance_marked_at, attendance_marked_by, notes,
              student_name_snapshot, video_link, proof_url, video_link_online, proof_url_online,
              practice_date, practice_time, practice_online_date, practice_online_time,
              practice_type, practice_online_type
         FROM fa_invitations
        WHERE tenant_id = $1`,
      [TENANT]
    ),
    // Per-event per-branch multi-grade overrides. The fa_event_branch_overrides
    // table may not exist on older deploys yet — wrap in a try so the FA
    // dashboard still loads if the migration hasn't been applied.
    pool.query<EventBranchOverrideRow>(
      `SELECT event_id, branch_code, day_policy, granted_by, granted_at, reason
         FROM fa_event_branch_overrides`,
    ).catch((err) => {
      const code = (err as { code?: string }).code;
      if (code === "42P01") {
        // undefined_table — overrides migration not applied yet
        return { rows: [] as EventBranchOverrideRow[] };
      }
      if (code === "42703") {
        // undefined_column — day_policy migration not applied yet. Read the
        // legacy shape; normalizeDayPolicy() defaults the missing column to
        // SAME_DAY so behaviour matches pre-day-policy deploys.
        return pool.query<EventBranchOverrideRow>(
          `SELECT event_id, branch_code, granted_by, granted_at, reason
             FROM fa_event_branch_overrides`,
        );
      }
      throw err;
    }),
  ]);

  return {
    events: eventsRes.rows.map(rowToEvent),
    sessions: sessionsRes.rows.map(rowToSession),
    quotas: quotasRes.rows.map(rowToQuota),
    invitations: invitationsRes.rows.map(rowToInvitation),
    overrides: overridesRes.rows.map(rowToOverride),
  };
}

// ----------------------------------------------------------------------------
// Events
// ----------------------------------------------------------------------------

// videoUploadLocked isn't accepted here — new events always start with the DB
// column default (true), same as any pre-existing closed event; it's only
// ever changed later via the "close invitations only" choice or the toggle
// on an already-closed event (see StatusActionBar / updateEventRow).
export async function createEventRow(
  ev: Omit<FAEvent, "id" | "createdAt" | "videoUploadLocked">
): Promise<FAEvent> {
  await ensureVideoLockColumn();
  const { rows } = await pool.query<EventRow>(
    `INSERT INTO fa_events
       (tenant_id, name, month, year, venue, start_date, end_date, number_of_days,
        invitation_open_date, invitation_close_date, status, created_by, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id, name, month, year, venue, start_date, end_date, number_of_days,
               invitation_open_date, invitation_close_date, status, video_upload_locked, created_by, created_at, notes`,
    [
      TENANT, ev.name, ev.month, ev.year, ev.venue, ev.startDate, ev.endDate, ev.numberOfDays,
      ev.invitationOpenDate, ev.invitationCloseDate, ev.status, ev.createdBy || null, ev.notes ?? null,
    ]
  );
  return rowToEvent(rows[0]);
}

/**
 * Clone an event: copies the source's session layout + per-branch quotas into
 * a new DRAFT event with the supplied name/dates. Sessions are day-relative so
 * no date-shift math is needed; quotas are rewired to the new session ids.
 * Invitations and multi-grade overrides are NOT copied — the clone starts empty.
 */
export async function duplicateEventRow(
  sourceEventId: string,
  overrides: {
    name: string;
    startDate: string;          // ISO
    endDate: string;            // ISO
    invitationOpenDate: string;
    invitationCloseDate: string;
    createdBy: string;
    notes?: string;
  },
): Promise<FAEvent | null> {
  await ensureVideoLockColumn();
  const srcRes = await pool.query<EventRow>(
    `SELECT id, name, month, year, venue, start_date, end_date, number_of_days,
            invitation_open_date, invitation_close_date, status, video_upload_locked, created_by, created_at, notes
       FROM fa_events WHERE id = $1 AND tenant_id = $2`,
    [sourceEventId, TENANT],
  );
  if (!srcRes.rows[0]) return null;
  const src = rowToEvent(srcRes.rows[0]);
  const startD = new Date(overrides.startDate);

  const newEvent = await createEventRow({
    name: overrides.name,
    month: startD.getMonth() + 1,
    year: startD.getFullYear(),
    venue: src.venue,
    startDate: overrides.startDate,
    endDate: overrides.endDate,
    numberOfDays: src.numberOfDays,
    invitationOpenDate: overrides.invitationOpenDate,
    invitationCloseDate: overrides.invitationCloseDate,
    status: "draft",
    createdBy: overrides.createdBy,
    notes: overrides.notes ?? src.notes,
  });

  // Copy sessions, remembering old → new id so quotas can be rewired.
  const sessionRowsRes = await pool.query<SessionRow>(
    `SELECT id, event_id, day_number, session_number, start_time, end_time, label
       FROM fa_sessions WHERE event_id = $1 AND tenant_id = $2`,
    [sourceEventId, TENANT],
  );
  const idMap = new Map<string, string>();
  for (const r of sessionRowsRes.rows) {
    const ins = await pool.query<SessionRow>(
      `INSERT INTO fa_sessions
         (tenant_id, event_id, day_number, session_number, start_time, end_time, label)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, event_id, day_number, session_number, start_time, end_time, label`,
      [TENANT, newEvent.id, r.day_number, r.session_number, r.start_time, r.end_time, r.label],
    );
    idMap.set(r.id, ins.rows[0].id);
  }

  // Copy quotas, swapping session_id via the map.
  if (sessionRowsRes.rows.length > 0) {
    const quotaRowsRes = await pool.query<QuotaRow>(
      `SELECT id, session_id, branch, quota
         FROM fa_session_quotas WHERE session_id = ANY($1::text[]) AND tenant_id = $2`,
      [sessionRowsRes.rows.map(r => r.id), TENANT],
    );
    for (const q of quotaRowsRes.rows) {
      const newSessionId = idMap.get(q.session_id);
      if (!newSessionId) continue;
      await pool.query(
        `INSERT INTO fa_session_quotas (tenant_id, session_id, branch, quota)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (session_id, branch) DO NOTHING`,
        [TENANT, newSessionId, q.branch, q.quota],
      );
    }
  }

  return newEvent;
}

export async function updateEventRow(
  id: string,
  patch: Partial<FAEvent>
): Promise<FAEvent | null> {
  await ensureVideoLockColumn();
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  const map: Record<string, string> = {
    name: "name",
    month: "month",
    year: "year",
    venue: "venue",
    startDate: "start_date",
    endDate: "end_date",
    numberOfDays: "number_of_days",
    invitationOpenDate: "invitation_open_date",
    invitationCloseDate: "invitation_close_date",
    status: "status",
    videoUploadLocked: "video_upload_locked",
    notes: "notes",
  };
  for (const [k, col] of Object.entries(map)) {
    const v = (patch as Record<string, unknown>)[k];
    if (v !== undefined) {
      fields.push(`${col} = $${i++}`);
      values.push(v);
    }
  }
  if (fields.length === 0) {
    const { rows } = await pool.query<EventRow>(
      `SELECT id, name, month, year, venue, start_date, end_date, number_of_days,
              invitation_open_date, invitation_close_date, status, video_upload_locked, created_by, created_at, notes
         FROM fa_events WHERE id = $1 AND tenant_id = $2`,
      [id, TENANT]
    );
    return rows[0] ? rowToEvent(rows[0]) : null;
  }
  fields.push(`updated_at = now()`);
  values.push(id, TENANT);
  const { rows } = await pool.query<EventRow>(
    `UPDATE fa_events SET ${fields.join(", ")} WHERE id = $${i++} AND tenant_id = $${i}
     RETURNING id, name, month, year, venue, start_date, end_date, number_of_days,
               invitation_open_date, invitation_close_date, status, video_upload_locked, created_by, created_at, notes`,
    values
  );
  return rows[0] ? rowToEvent(rows[0]) : null;
}

export async function deleteEventRow(id: string): Promise<void> {
  // ON DELETE CASCADE on sessions/quotas/invitations handles cleanup
  await pool.query(`DELETE FROM fa_events WHERE id = $1 AND tenant_id = $2`, [id, TENANT]);
}

// ----------------------------------------------------------------------------
// Sessions
// ----------------------------------------------------------------------------

export async function createSessionRow(s: Omit<Session, "id">): Promise<Session> {
  const { rows } = await pool.query<SessionRow>(
    `INSERT INTO fa_sessions
       (tenant_id, event_id, day_number, session_number, start_time, end_time, label)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, event_id, day_number, session_number, start_time, end_time, label`,
    [TENANT, s.eventId, s.dayNumber, s.sessionNumber, s.startTime, s.endTime, s.label ?? null]
  );
  return rowToSession(rows[0]);
}

export async function updateSessionRow(
  id: string,
  patch: Partial<Session>
): Promise<Session | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  const map: Record<string, string> = {
    dayNumber: "day_number",
    sessionNumber: "session_number",
    startTime: "start_time",
    endTime: "end_time",
    label: "label",
  };
  for (const [k, col] of Object.entries(map)) {
    const v = (patch as Record<string, unknown>)[k];
    if (v !== undefined) {
      fields.push(`${col} = $${i++}`);
      values.push(v);
    }
  }
  if (fields.length === 0) return null;
  fields.push(`updated_at = now()`);
  values.push(id, TENANT);
  const { rows } = await pool.query<SessionRow>(
    `UPDATE fa_sessions SET ${fields.join(", ")} WHERE id = $${i++} AND tenant_id = $${i}
     RETURNING id, event_id, day_number, session_number, start_time, end_time, label`,
    values
  );
  return rows[0] ? rowToSession(rows[0]) : null;
}

export async function deleteSessionRow(id: string): Promise<void> {
  await pool.query(`DELETE FROM fa_sessions WHERE id = $1 AND tenant_id = $2`, [id, TENANT]);
}

// ----------------------------------------------------------------------------
// Quotas
// ----------------------------------------------------------------------------

export async function upsertQuotaRow(
  sessionId: string,
  branch: BranchCode,
  quota: number
): Promise<SessionQuota | null> {
  if (quota <= 0) {
    await pool.query(
      `DELETE FROM fa_session_quotas
        WHERE session_id = $1 AND branch = $2 AND tenant_id = $3`,
      [sessionId, branch, TENANT]
    );
    return null;
  }
  const { rows } = await pool.query<QuotaRow>(
    `INSERT INTO fa_session_quotas (tenant_id, session_id, branch, quota)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (session_id, branch) DO UPDATE SET quota = EXCLUDED.quota, updated_at = now()
     RETURNING id, session_id, branch, quota`,
    [TENANT, sessionId, branch, quota]
  );
  return rowToQuota(rows[0]);
}

// ----------------------------------------------------------------------------
// Invitations
// ----------------------------------------------------------------------------

// Guard: the studentId MUST resolve to a real student before we create an
// invitation — otherwise we manufacture an orphan that later renders as
// "(not in records)". Active students live in studentrecords (numeric id);
// archived students in archived_students (`arch-<no>`). Throws InvitationRejected
// when the student definitively doesn't exist. Fails OPEN (allows the invite)
// only if the lookup query itself can't run, so an infra hiccup never blocks
// legitimate invites.
async function assertStudentExists(studentId: string): Promise<void> {
  try {
    if (studentId.startsWith("arch-")) {
      // Match on student_id (the loaded id) first; `no` only as a legacy fallback
      // since it no longer equals the original id for newer archives.
      const no = Number(studentId.slice("arch-".length));
      const hasNo = Number.isFinite(no);
      const r = await pool.query(
        `SELECT 1 FROM archived_students WHERE student_id = $1${hasNo ? " OR no = $2" : ""} LIMIT 1`,
        hasNo ? [studentId, no] : [studentId],
      );
      if (r.rowCount === 0) throw new InvitationRejected("Student not found in records — cannot invite an unknown student.");
    } else {
      const id = Number(studentId);
      if (!Number.isFinite(id)) throw new InvitationRejected("Invalid student id — cannot invite an unknown student.");
      const r = await pool.query(`SELECT 1 FROM studentrecords WHERE id = $1 LIMIT 1`, [id]);
      if (r.rowCount === 0) throw new InvitationRejected("Student not found in records — cannot invite an unknown student.");
    }
  } catch (err) {
    if (err instanceof InvitationRejected) throw err;
    console.warn("[fa] student-exists check skipped (lookup failed):", (err as Error).message);
  }
}

// Guard: a grade can only be showcased ONCE per student, ever. "Done" means
// the FA tick — set when attendance is marked (attended / walk_in) at any
// event, active or archived, which writes fa_progress_json (see
// markFaProgressForStudent). Two sources are checked so a missed progress-json
// update can't slip a duplicate through:
//   1. fa_progress_json on the student's record (the tick itself);
//   2. any attended/walk_in invitation for this grade at ANOTHER event.
// Declined / no-show / still-pending invitations block nothing — a student
// who missed a showcase stays invitable for the same grade next time.
// Same fail-OPEN posture as assertStudentExists: only a definitive "already
// done" rejects; a lookup hiccup never blocks legitimate invites.
async function assertGradeNotAlreadyShowcased(
  studentId: string,
  targetGrade: number,
  eventId: string,
): Promise<void> {
  if (!Number.isFinite(targetGrade) || targetGrade < 1) return;
  try {
    // 1. The FA tick (fa_progress_json index grade-1), live or archived row.
    let progress: unknown = null;
    if (studentId.startsWith("arch-")) {
      const no = Number(studentId.slice("arch-".length));
      const hasNo = Number.isFinite(no);
      const r = await pool.query<{ fa_progress_json: unknown }>(
        `SELECT fa_progress_json FROM archived_students WHERE student_id = $1${hasNo ? " OR no = $2" : ""} LIMIT 1`,
        hasNo ? [studentId, no] : [studentId],
      );
      progress = r.rows[0]?.fa_progress_json ?? null;
    } else {
      const r = await pool.query<{ fa_progress_json: unknown }>(
        `SELECT fa_progress_json FROM studentrecords WHERE id::text = $1 LIMIT 1`,
        [studentId],
      );
      progress = r.rows[0]?.fa_progress_json ?? null;
    }
    if (Array.isArray(progress) && progress[targetGrade - 1] === true) {
      throw new InvitationRejected(
        `Grade ${targetGrade} FA is already done — this grade was showcased at an earlier event and can only be showcased once.`,
      );
    }

    // 2. Belt-and-braces: an attended/walk_in invitation for this grade at a
    // different event (covers ticks that failed to write back).
    const dup = await pool.query<{ event_name: string | null }>(
      `SELECT e.name AS event_name
         FROM fa_invitations i
         LEFT JOIN fa_events e ON e.id = i.event_id
        WHERE i.tenant_id = $1 AND i.student_id = $2 AND i.target_grade = $3
          AND i.event_id <> $4 AND i.status IN ('attended', 'walk_in')
        LIMIT 1`,
      [TENANT, studentId, targetGrade, eventId],
    );
    if (dup.rows.length > 0) {
      const at = dup.rows[0].event_name ? ` at "${dup.rows[0].event_name}"` : " at an earlier event";
      throw new InvitationRejected(
        `Grade ${targetGrade} FA is already done — this student attended${at} for this grade, and a grade can only be showcased once.`,
      );
    }
  } catch (err) {
    if (err instanceof InvitationRejected) throw err;
    console.warn("[fa] grade-already-showcased check skipped (lookup failed):", (err as Error).message);
  }
}

export async function createInvitationRow(args: {
  eventId: string;
  sessionId: string;
  studentId: string;
  branch: BranchCode;
  targetGrade: number;
  status: InvitationStatus;
  invitedBy: string;
}): Promise<Invitation> {
  // 0. The student must exist (active or archived) — never create an orphan.
  await assertStudentExists(args.studentId);

  // 0b. A grade can only be showcased ONCE, ever: if the student's FA tick
  // for this grade is already done — attendance was marked (attended or
  // walk_in) at ANY event, active or archived, which also writes
  // fa_progress_json — reject. Declined / no-show invitations never set the
  // tick, so a student who missed a showcase stays invitable for that grade.
  // Checks both the tick (fa_progress_json) and attended invitations, so a
  // missing progress-json update can't slip a duplicate through.
  await assertGradeNotAlreadyShowcased(args.studentId, args.targetGrade, args.eventId);

  // Multi-step business-rule check, run as one logical transaction:
  //   1. Is this (event, branch) opted into multi-grade invites, and under
  //      which day-policy (SAME_DAY / DIFF_DAY / BOTH)?
  //   2. Look up existing invitations for this (event, student).
  //      • If none → free to insert.
  //      • If toggle OFF → reject (any prior invite blocks).
  //      • If toggle ON → target_grade must differ, AND the day must satisfy
  //        the branch's day-policy:
  //          SAME_DAY → must be the same day as every prior invite.
  //          DIFF_DAY → must be a different day from every prior invite.
  //          BOTH     → any day allowed.
  //   3. INSERT. The DB still has a final UNIQUE on (event, student, grade)
  //      as a race-condition safety net (23505 trips → "duplicate grade").
  //
  // All rejects surface as InvitationRejected — the route catches it and
  // returns 409 with a descriptive reason.

  // 1. Override check
  const overrideRes = await pool.query<{ day_policy: string | null }>(
    `SELECT day_policy
       FROM fa_event_branch_overrides
      WHERE event_id = $1 AND branch_code = $2
      LIMIT 1`,
    [args.eventId, args.branch],
  ).catch(async (err) => {
    const code = (err as { code?: string }).code;
    // Overrides table missing entirely → treat as no overrides.
    if (code === "42P01") return { rows: [] as { day_policy: string | null }[] };
    // day_policy column not migrated yet → existence check only, default policy.
    if (code === "42703") {
      const legacy = await pool.query<{ branch_code: string }>(
        `SELECT branch_code
           FROM fa_event_branch_overrides
          WHERE event_id = $1 AND branch_code = $2
          LIMIT 1`,
        [args.eventId, args.branch],
      );
      return { rows: legacy.rows.map(() => ({ day_policy: null })) };
    }
    throw err;
  });
  const multiGradeAllowed = overrideRes.rows.length > 0;
  const dayPolicy: DayPolicy = normalizeDayPolicy(overrideRes.rows[0]?.day_policy);

  // 2. Look up prior invites + the new session's day number in one query
  const priorRes = await pool.query<{
    target_grade: number | null;
    day_number: number;
    new_day_number: number;
  }>(
    `SELECT i.target_grade,
            s_existing.day_number,
            s_new.day_number AS new_day_number
       FROM fa_sessions s_new
       LEFT JOIN fa_invitations i
         ON i.event_id = $1 AND i.student_id = $2 AND i.tenant_id = $3
       LEFT JOIN fa_sessions s_existing
         ON s_existing.id = i.session_id
      WHERE s_new.id = $4 AND s_new.tenant_id = $3`,
    [args.eventId, args.studentId, TENANT, args.sessionId],
  );

  if (priorRes.rows.length === 0) {
    throw new InvitationRejected("Session not found");
  }
  const newDayNumber = priorRes.rows[0].new_day_number;
  const priorInvites = priorRes.rows
    .filter((r) => r.target_grade != null)
    .map((r) => ({ grade: r.target_grade as number, day: r.day_number }));

  if (priorInvites.length > 0) {
    // Toggle off → first prior invite wins, reject any second.
    if (!multiGradeAllowed) {
      throw new InvitationRejected("Already invited");
    }
    // Toggle on → different target_grade is always required.
    const dupGrade = priorInvites.some((p) => p.grade === args.targetGrade);
    if (dupGrade) {
      throw new InvitationRejected(`Already invited for grade ${args.targetGrade}`);
    }
    // …and the day must satisfy the branch's day-policy.
    if (dayPolicy === "SAME_DAY") {
      const otherDay = priorInvites.find((p) => p.day !== newDayNumber);
      if (otherDay) {
        throw new InvitationRejected(`Booked on day ${otherDay.day} — same-day invites only`);
      }
    } else if (dayPolicy === "DIFF_DAY") {
      const sameDay = priorInvites.find((p) => p.day === newDayNumber);
      if (sameDay) {
        throw new InvitationRejected(`Already booked on day ${newDayNumber} — different-day invites only`);
      }
    }
    // dayPolicy === "BOTH" → no day restriction.
  }

  // 3. INSERT — final DB safety net via UNIQUE(event, student, target_grade).
  await ensureConfirmProofColumns();
  const insertArgs = [TENANT, args.eventId, args.sessionId, args.studentId, args.branch, args.targetGrade, args.status, args.invitedBy];
  try {
    const { rows } = await pool.query<InvitationRow>(
      `INSERT INTO fa_invitations
           (tenant_id, event_id, session_id, student_id, branch, target_grade, status, invited_by, invited_at, confirmed_at, student_name_snapshot)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), CASE WHEN $7 IN ('confirmed', 'walk_in') THEN now() ELSE NULL END,
                 -- Snapshot the student's name at invite time so the roster can
                 -- still show who this is even if the student id later breaks
                 -- (archive/restore/delete). Mirrors pcm_invitations.
                 COALESCE(
                   (SELECT name FROM studentrecords WHERE id::text = $4),
                   (SELECT name FROM archived_students
                     WHERE student_id = $4 OR student_id = 'arch-' || $4 OR no::text = $4
                     LIMIT 1)
                 ))
         RETURNING ${INV_RETURNING_FULL}`,
      insertArgs,
    );
    return rowToInvitation(rows[0]);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "23505") {
      // Race condition: another concurrent insert beat us to this grade.
      throw new InvitationRejected(`Already invited for grade ${args.targetGrade}`);
    }
    throw err;
  }
}

export async function updateInvitationRow(
  id: string,
  patch: {
    status?: InvitationStatus;
    sessionId?: string;
    markedBy?: string;
    /** Online practice session: link to the student's testing video / Google
     *  Drive proof image. Independent of the physical session's pair. */
    onlineVideoLink?: string;
    onlineProofUrl?: string;
    /** Physical practice session: same idea, its own pair. */
    physicalVideoLink?: string;
    physicalProofUrl?: string;
    /** Practice-session scheduling: the two slots are independent —
     *  all optional, none gate any other. */
    onlinePracticeDate?: string | null;
    onlinePracticeTime?: string | null;
    physicalPracticeDate?: string | null;
    physicalPracticeTime?: string | null;
    /** Per-slot session type (max-two-practices era): each slot may be
     *  online or physical, freely. Null clears back to the legacy default. */
    physicalPracticeType?: string | null;
    onlinePracticeType?: string | null;
  }
): Promise<Invitation | null> {
  await ensureConfirmProofColumns();
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (patch.status !== undefined) {
    fields.push(`status = $${i++}`);
    values.push(patch.status);
    if (patch.status === "confirmed") {
      fields.push(`confirmed_at = now()`);
    }
    if (patch.status === "attended" || patch.status === "no_show" || patch.status === "walk_in") {
      fields.push(`attendance_marked_at = now()`);
      if (patch.markedBy) {
        fields.push(`attendance_marked_by = $${i++}`);
        values.push(patch.markedBy);
      }
    }
  }
  if (patch.sessionId !== undefined) {
    fields.push(`session_id = $${i++}`);
    values.push(patch.sessionId);
  }
  if (patch.physicalVideoLink !== undefined) {
    fields.push(`video_link = $${i++}`);
    values.push(patch.physicalVideoLink || null);
  }
  if (patch.physicalProofUrl !== undefined) {
    fields.push(`proof_url = $${i++}`);
    values.push(patch.physicalProofUrl || null);
  }
  if (patch.onlineVideoLink !== undefined) {
    fields.push(`video_link_online = $${i++}`);
    values.push(patch.onlineVideoLink || null);
  }
  if (patch.onlineProofUrl !== undefined) {
    fields.push(`proof_url_online = $${i++}`);
    values.push(patch.onlineProofUrl || null);
  }
  if (patch.physicalPracticeDate !== undefined) {
    fields.push(`practice_date = $${i++}`);
    values.push(patch.physicalPracticeDate || null);
  }
  if (patch.physicalPracticeTime !== undefined) {
    fields.push(`practice_time = $${i++}`);
    values.push(patch.physicalPracticeTime || null);
  }
  if (patch.onlinePracticeDate !== undefined) {
    fields.push(`practice_online_date = $${i++}`);
    values.push(patch.onlinePracticeDate || null);
  }
  if (patch.onlinePracticeTime !== undefined) {
    fields.push(`practice_online_time = $${i++}`);
    values.push(patch.onlinePracticeTime || null);
  }
  if (patch.physicalPracticeType !== undefined) {
    fields.push(`practice_type = $${i++}`);
    values.push(patch.physicalPracticeType === "online" || patch.physicalPracticeType === "physical" ? patch.physicalPracticeType : null);
  }
  if (patch.onlinePracticeType !== undefined) {
    fields.push(`practice_online_type = $${i++}`);
    values.push(patch.onlinePracticeType === "online" || patch.onlinePracticeType === "physical" ? patch.onlinePracticeType : null);
  }
  if (fields.length === 0) return null;
  fields.push(`updated_at = now()`);
  values.push(id, TENANT);
  const { rows } = await pool.query<InvitationRow>(
    `UPDATE fa_invitations SET ${fields.join(", ")} WHERE id = $${i++} AND tenant_id = $${i}
     RETURNING ${INV_RETURNING_FULL}`,
    values,
  );
  const row = rows[0] ?? null;
  if (!row) return null;
  const invitation = rowToInvitation(row);
  // Keep the student's FA tick (fa_progress_json) in step with attendance:
  //   • marked attended / walk_in → set the grade tick (persists after the event);
  //   • moved to any OTHER status (no_show / confirmed / declined / invited) →
  //     UN-tick it, so a mis-tick that's corrected doesn't leave the grade
  //     showing "done" on the student record — but only when no other
  //     attended/walk_in invitation for that grade remains (see the helper).
  // The status UPDATE above has already committed, so the "still done
  // elsewhere?" check inside clearFaProgressIfUnattended correctly excludes
  // this now-un-marked invitation.
  if (invitation.targetGrade > 0 && patch.status !== undefined) {
    if (patch.status === "attended" || patch.status === "walk_in") {
      await markFaProgressForStudent(invitation.studentId, invitation.targetGrade);
    } else {
      await clearFaProgressIfUnattended(invitation.studentId, invitation.targetGrade);
    }
  }
  return invitation;
}

/** Mark grade `grade` as completed in a student's fa_progress_json array.
 *  The array is indexed 0-based (index `grade-1` = entry for grade `grade`).
 *  Read-modify-write so we handle shorter/null arrays defensively. */
export async function markFaProgressForStudent(
  studentId: string,
  grade: number,
): Promise<void> {
  if (grade < 1) return;
  // Archived students live in a different table keyed by `no` (id = "arch-<no>").
  // Route their FA-progress writeback there so the tick survives just like a
  // live student's.
  if (studentId.startsWith("arch-")) {
    await markArchivedFaProgress(studentId, grade);
    return;
  }
  const sid = Number(studentId);
  if (!Number.isFinite(sid)) return;
  const { rows } = await pool.query<{ fa_progress_json: unknown }>(
    `SELECT fa_progress_json FROM studentrecords WHERE id = $1`,
    [sid]
  );
  if (!rows[0]) return;
  const arr: boolean[] = Array.isArray(rows[0].fa_progress_json)
    ? (rows[0].fa_progress_json as unknown[]).map(v => v === true)
    : [];
  while (arr.length < grade) arr.push(false);
  arr[grade - 1] = true;
  await pool.query(
    `UPDATE studentrecords SET fa_progress_json = $1::jsonb WHERE id = $2`,
    [JSON.stringify(arr), sid]
  );
}

/** FA-progress writeback for an archived student (id "arch-<no>"). Mirrors
 *  markFaProgressForStudent but targets the `archived_students` table keyed on
 *  its `no` column. */
async function markArchivedFaProgress(studentId: string, grade: number): Promise<void> {
  if (grade < 1) return;
  // Resolve the archived row by `student_id` (= the loaded FA id) first, falling
  // back to `no` for legacy rows. `no` is a fresh sequence for archives created
  // after it stopped equalling the original id, so student_id is the reliable key.
  const parsedNo = Number(studentId.slice("arch-".length));
  const hasNo = Number.isFinite(parsedNo);
  const { rows } = await pool.query<{ no: number; fa_progress_json: unknown }>(
    `SELECT no, fa_progress_json FROM archived_students
      WHERE student_id = $1${hasNo ? " OR no = $2" : ""} LIMIT 1`,
    hasNo ? [studentId, parsedNo] : [studentId]
  );
  if (!rows[0]) return;
  const arr: boolean[] = Array.isArray(rows[0].fa_progress_json)
    ? (rows[0].fa_progress_json as unknown[]).map(v => v === true)
    : [];
  while (arr.length < grade) arr.push(false);
  arr[grade - 1] = true;
  await pool.query(
    `UPDATE archived_students SET fa_progress_json = $1::jsonb WHERE no = $2`,
    [JSON.stringify(arr), rows[0].no]
  );
}

/** Clear the FA tick for `grade` when the student's attendance for it was
 *  undone AND no other attended/walk_in invitation for that grade remains — so
 *  a corrected mis-tick stops showing the grade as "done" on the student
 *  record. Inverse of markFaProgressForStudent. Fail-open: a lookup hiccup
 *  never wrongly wipes a tick (it just leaves it as-is). */
async function clearFaProgressIfUnattended(studentId: string, grade: number): Promise<void> {
  if (grade < 1) return;
  try {
    // Any OTHER event where this student is still attended/walk_in for the same
    // grade keeps it legitimately "done" — the caller already committed this
    // invitation's new (non-attended) status, so it's excluded automatically.
    const { rows } = await pool.query(
      `SELECT 1 FROM fa_invitations
        WHERE tenant_id = $1 AND student_id = $2 AND target_grade = $3
          AND status IN ('attended', 'walk_in') LIMIT 1`,
      [TENANT, studentId, grade],
    );
    if (rows.length > 0) return; // still done elsewhere → keep the tick
    await unmarkFaProgressForStudent(studentId, grade);
  } catch (err) {
    console.warn("[fa] clear FA progress skipped (lookup failed):", (err as Error).message);
  }
}

/** Set grade `grade` back to false in a student's fa_progress_json (live or
 *  archived). No-op when it wasn't set. Mirror of markFaProgressForStudent. */
async function unmarkFaProgressForStudent(studentId: string, grade: number): Promise<void> {
  if (grade < 1) return;
  if (studentId.startsWith("arch-")) { await unmarkArchivedFaProgress(studentId, grade); return; }
  const sid = Number(studentId);
  if (!Number.isFinite(sid)) return;
  const { rows } = await pool.query<{ fa_progress_json: unknown }>(
    `SELECT fa_progress_json FROM studentrecords WHERE id = $1`, [sid],
  );
  if (!rows[0] || !Array.isArray(rows[0].fa_progress_json)) return;
  const arr = (rows[0].fa_progress_json as unknown[]).map(v => v === true);
  if (arr.length < grade || arr[grade - 1] !== true) return; // nothing to clear
  arr[grade - 1] = false;
  await pool.query(
    `UPDATE studentrecords SET fa_progress_json = $1::jsonb WHERE id = $2`,
    [JSON.stringify(arr), sid],
  );
}

async function unmarkArchivedFaProgress(studentId: string, grade: number): Promise<void> {
  if (grade < 1) return;
  const parsedNo = Number(studentId.slice("arch-".length));
  const hasNo = Number.isFinite(parsedNo);
  const { rows } = await pool.query<{ no: number; fa_progress_json: unknown }>(
    `SELECT no, fa_progress_json FROM archived_students
      WHERE student_id = $1${hasNo ? " OR no = $2" : ""} LIMIT 1`,
    hasNo ? [studentId, parsedNo] : [studentId],
  );
  if (!rows[0] || !Array.isArray(rows[0].fa_progress_json)) return;
  const arr = (rows[0].fa_progress_json as unknown[]).map(v => v === true);
  if (arr.length < grade || arr[grade - 1] !== true) return;
  arr[grade - 1] = false;
  await pool.query(
    `UPDATE archived_students SET fa_progress_json = $1::jsonb WHERE no = $2`,
    [JSON.stringify(arr), rows[0].no],
  );
}

export async function deleteInvitationRow(id: string): Promise<void> {
  await pool.query(`DELETE FROM fa_invitations WHERE id = $1 AND tenant_id = $2`, [id, TENANT]);
}

export async function countInvitationsForSessionBranch(
  sessionId: string,
  branch: BranchCode
): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM fa_invitations
      WHERE session_id = $1 AND branch = $2 AND tenant_id = $3`,
    [sessionId, branch, TENANT]
  );
  return Number(rows[0]?.count ?? "0");
}

export async function getEventStatus(eventId: string): Promise<EventStatus | null> {
  const { rows } = await pool.query<{ status: string }>(
    `SELECT status FROM fa_events WHERE id = $1 AND tenant_id = $2`,
    [eventId, TENANT]
  );
  return rows[0] ? (rows[0].status as EventStatus) : null;
}

export interface InvitationEventLock {
  status: EventStatus;
  /** True once a Branch Manager can no longer invite/confirm/reject/delete —
   *  i.e. the event is not "open" or "ongoing". */
  invitationLocked: boolean;
  /** True once a Branch Manager can no longer upload practice video/proof.
   *  Same as invitationLocked EXCEPT when the event is "closed" with
   *  videoUploadLocked = false ("close invitations only") — in that one
   *  case practice uploads stay open even though invites are locked. */
  practiceLocked: boolean;
}

// Status + upload-lock of the event a given invitation belongs to, combined
// into ready-to-use BM write-permission flags. Used by the invitation
// PATCH/DELETE routes (invitationLocked) and the proof-upload route
// (practiceLocked) to enforce per-role write windows.
export async function getEventLockByInvitation(
  invitationId: string
): Promise<InvitationEventLock | null> {
  await ensureVideoLockColumn();
  const { rows } = await pool.query<{ status: string; video_upload_locked: boolean }>(
    `SELECT e.status, e.video_upload_locked
       FROM fa_invitations i
       JOIN fa_events e ON e.id = i.event_id AND e.tenant_id = i.tenant_id
      WHERE i.id = $1 AND i.tenant_id = $2`,
    [invitationId, TENANT]
  );
  const row = rows[0];
  if (!row) return null;
  const status = row.status as EventStatus;
  const activeWindow = status === "open" || status === "ongoing";
  return {
    status,
    invitationLocked: !activeWindow,
    practiceLocked: !(activeWindow || (status === "closed" && !row.video_upload_locked)),
  };
}

// ----------------------------------------------------------------------------
// Event branch overrides (multi-grade exception per event per branch)
// ----------------------------------------------------------------------------

export async function upsertEventBranchOverrideRow(args: {
  eventId: string;
  branchCode: BranchCode;
  dayPolicy?: DayPolicy;
  grantedBy: string;
  reason?: string;
}): Promise<EventBranchOverride> {
  const dayPolicy = normalizeDayPolicy(args.dayPolicy);
  const { rows } = await pool.query<EventBranchOverrideRow>(
    `INSERT INTO fa_event_branch_overrides (event_id, branch_code, day_policy, granted_by, reason)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (event_id, branch_code) DO UPDATE
       SET day_policy = EXCLUDED.day_policy,
           granted_by = EXCLUDED.granted_by,
           granted_at = now(),
           reason     = EXCLUDED.reason
     RETURNING event_id, branch_code, day_policy, granted_by, granted_at, reason`,
    [args.eventId, args.branchCode, dayPolicy, args.grantedBy, args.reason ?? null]
  );
  return rowToOverride(rows[0]);
}

export async function deleteEventBranchOverrideRow(
  eventId: string,
  branchCode: BranchCode
): Promise<void> {
  await pool.query(
    `DELETE FROM fa_event_branch_overrides WHERE event_id = $1 AND branch_code = $2`,
    [eventId, branchCode]
  );
}

export async function getQuotaForSessionBranch(
  sessionId: string,
  branch: BranchCode
): Promise<number | null> {
  const { rows } = await pool.query<{ quota: number }>(
    `SELECT quota FROM fa_session_quotas
      WHERE session_id = $1 AND branch = $2 AND tenant_id = $3`,
    [sessionId, branch, TENANT]
  );
  return rows[0] ? rows[0].quota : null;
}
