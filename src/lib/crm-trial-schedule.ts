import "server-only";
import { queryCrmDb } from "@/lib/crm-db";

// ─────────────────────────────────────────────────────────────────────────────
// Read-only port of v1's app/api/crm/dashboard/trial-schedule/route.ts, computed
// against ebright_crm. Superadmin all-branches (elevated, read-only) view.
//
// Buckets crm_appointment rows (title = 'Trial Class') by day-of-week × time
// slot so the UI can render the GHL-style grid AND the drill-in student list
// from a single fetch. A trial only shows while its lead still occupies a live
// slot — current stage CT (booked) or SU (showed up).
//
// Branch mapping is by branchId (crm_branch.id): the picker sends a branchId,
// and every student is labelled with branchName + region resolved from its
// branchId — never by name-matching.
// ─────────────────────────────────────────────────────────────────────────────

export type SchedulePreset =
  | "today" | "yesterday" | "this_week" | "last_week" | "next_week" | "this_month" | "custom";

export interface TrialStudent {
  appointmentId: string;
  contactId: string;
  opportunityId: string | null;
  name: string;
  phone: string | null;
  branchId: string;
  branchName: string | null;
  region: "A" | "B" | "C" | null;
  source: string | null;
  childAge: string | null;
  startAt: string; // naive KL wall-clock ISO (no offset)
}

export interface SlotCell { slot: string; count: number; students: TrialStudent[] }
export interface DayBucket { key: string; label: string; slots: SlotCell[] }

export interface TrialScheduleResult {
  range: { from: string | null; to: string | null };
  branchIds: string[];
  branches: Array<{ id: string; name: string }>;
  days: DayBucket[];
}

// Day-of-week display order (Wed→Sun); Mon/Tue excluded (no classes).
export const TRIAL_DAY_ORDER: ReadonlyArray<{ key: string; label: string; dayIndex: number }> = [
  { key: "wed", label: "Wednesday", dayIndex: 3 },
  { key: "thu", label: "Thursday", dayIndex: 4 },
  { key: "fri", label: "Friday", dayIndex: 5 },
  { key: "sat", label: "Saturday", dayIndex: 6 },
  { key: "sun", label: "Sunday", dayIndex: 0 },
];

const TRIAL_WEEKEND_SLOTS = ["09:15 AM", "10:30 AM", "12:00 PM", "01:15 PM", "02:45 PM", "04:00 PM", "05:30 PM"];
const TRIAL_WEEKDAY_SLOTS = ["06:00 PM", "07:15 PM", "08:30 PM"];
export const TRIAL_ALL_SLOTS = Array.from(new Set([...TRIAL_WEEKEND_SLOTS, ...TRIAL_WEEKDAY_SLOTS]));

const KL_OFFSET_MS = 8 * 3600 * 1000;

function startOfDayKL(d: Date = new Date()): Date {
  const wall = new Date(d.getTime() + KL_OFFSET_MS);
  const mid = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
  return new Date(mid - KL_OFFSET_MS);
}

function parseRange(preset: SchedulePreset, fromStr?: string, toStr?: string): { from: Date; to: Date } {
  const today = startOfDayKL();
  const DAY = 24 * 3600 * 1000;
  const WEEK = 7 * DAY;
  const wall = new Date(today.getTime() + KL_OFFSET_MS);
  const dow = wall.getUTCDay();
  const daysBackToMon = dow === 0 ? 6 : dow - 1;
  const thisMonday = new Date(today.getTime() - daysBackToMon * DAY);

  switch (preset) {
    case "today":
      return { from: today, to: new Date(today.getTime() + DAY - 1) };
    case "yesterday":
      return { from: new Date(today.getTime() - DAY), to: new Date(today.getTime() - 1) };
    case "last_week":
      return { from: new Date(thisMonday.getTime() - WEEK), to: new Date(thisMonday.getTime() - 1) };
    case "next_week":
      return { from: new Date(thisMonday.getTime() + WEEK), to: new Date(thisMonday.getTime() + 2 * WEEK - 1) };
    case "this_month": {
      const from = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), 1) - KL_OFFSET_MS);
      const to = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth() + 1, 1) - KL_OFFSET_MS - 1);
      return { from, to };
    }
    case "custom": {
      const fp = fromStr?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const tp = toStr?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (fp && tp) {
        return {
          from: new Date(Date.UTC(+fp[1], +fp[2] - 1, +fp[3]) - KL_OFFSET_MS),
          to: new Date(Date.UTC(+tp[1], +tp[2] - 1, +tp[3]) + DAY - 1 - KL_OFFSET_MS),
        };
      }
      return { from: thisMonday, to: new Date(thisMonday.getTime() + WEEK - 1) };
    }
    case "this_week":
    default:
      return { from: thisMonday, to: new Date(thisMonday.getTime() + WEEK - 1) };
  }
}

// appointment.startAt is stored "naive-KL-as-UTC"; the query window is the KL
// wall-clock instant (from + 8h) formatted as a naive string so the raw-pg
// comparison is naive-to-naive and independent of the Node process timezone.
function toNaiveUtc(d: Date): string {
  return d.toISOString().replace("T", " ").replace("Z", "");
}

interface StageRow { id: string; name: string; shortCode: string | null }

// Live-slot stages: a trial shows only while its lead is at CT (booked) or SU
// (showed up). Mirrors v1 scheduleKeepStageIds.
function scheduleKeepStageIds(stages: StageRow[]): string[] {
  const KEEP = new Set(["CT", "SU"]);
  const CTr = /^confirmed for trial$/i;
  const SUr = /^show[- ]up$/i;
  return stages
    .filter((s) => {
      const code = (s.shortCode ?? "").toUpperCase().replace(/_/g, "");
      return KEEP.has(code) || CTr.test(s.name) || SUr.test(s.name);
    })
    .map((s) => s.id);
}

function emptyGrid(): DayBucket[] {
  return TRIAL_DAY_ORDER.map((d) => ({
    key: d.key,
    label: d.label,
    slots: TRIAL_ALL_SLOTS.map((slot) => ({ slot, count: 0, students: [] as TrialStudent[] })),
  }));
}

export async function getTrialSchedule(opts: {
  branchId?: string; // 'all' | <uuid> | undefined (undefined → all)
  preset: SchedulePreset;
  from?: string;
  to?: string;
}): Promise<TrialScheduleResult | null> {
  const tenantRes = await queryCrmDb<{ id: string }>(
    `SELECT id FROM crm.crm_tenant WHERE slug IN ('ebright','ebright-demo') ORDER BY "createdAt" ASC LIMIT 1`,
  );
  if (!tenantRes) return null;
  let tenantId: string | undefined = tenantRes.rows[0]?.id;
  if (!tenantId) {
    const first = await queryCrmDb<{ id: string }>(`SELECT id FROM crm.crm_tenant ORDER BY "createdAt" ASC LIMIT 1`);
    tenantId = first?.rows[0]?.id;
  }
  if (!tenantId) return null;

  // Branch universe for the picker + the "all branches" set = region A/B/C
  // branches (same scope as the leads dashboard, so totals tally with CT).
  const branchesRes = await queryCrmDb<{ id: string; name: string; region: string | null }>(
    `SELECT id, name, region FROM crm.crm_branch WHERE "tenantId" = $1 AND region IN ('A','B','C') ORDER BY name ASC`,
    [tenantId],
  );
  const allBranches = branchesRes?.rows ?? [];
  const branchOptions = allBranches.map((b) => ({ id: b.id, name: b.name }));

  const requested = opts.branchId;
  const branchIds =
    !requested || requested === "all"
      ? allBranches.map((b) => b.id)
      : allBranches.some((b) => b.id === requested)
        ? [requested]
        : [];

  const range = parseRange(opts.preset, opts.from, opts.to);
  const apptFromN = toNaiveUtc(new Date(range.from.getTime() + KL_OFFSET_MS));
  const apptToN = toNaiveUtc(new Date(range.to.getTime() + KL_OFFSET_MS));

  if (branchIds.length === 0) {
    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      branchIds: [],
      branches: branchOptions,
      days: emptyGrid(),
    };
  }

  const stagesRes = await queryCrmDb<StageRow>(
    `SELECT id, name, "shortCode" FROM crm.crm_stage WHERE "tenantId" = $1`,
    [tenantId],
  );
  const keepIds = scheduleKeepStageIds(stagesRes?.rows ?? []);
  if (keepIds.length === 0) {
    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      branchIds,
      branches: branchOptions,
      days: emptyGrid(),
    };
  }

  // Day-of-week + slot label are extracted in SQL (EXTRACT / to_char) so the
  // naive timestamp is read as KL wall-clock directly — avoids node-pg parsing
  // the timestamp into the Node process's local timezone and shifting hours.
  const rowsRes = await queryCrmDb<{
    appointmentId: string; startAtNaive: string; dow: number; slot: string;
    branchId: string; branchName: string | null; region: string | null;
    contactId: string; firstName: string | null; lastName: string | null;
    phone: string | null; childAge1: string | null; source: string | null;
    opportunityId: string | null;
  }>(
    `SELECT a.id AS "appointmentId",
            to_char(a."startAt", 'YYYY-MM-DD"T"HH24:MI:SS') AS "startAtNaive",
            EXTRACT(DOW FROM a."startAt")::int AS dow,
            to_char(a."startAt", 'HH12:MI AM') AS slot,
            a."branchId" AS "branchId",
            b.name AS "branchName",
            b.region AS region,
            c.id AS "contactId",
            c."firstName" AS "firstName",
            c."lastName" AS "lastName",
            c.phone AS phone,
            c."childAge1" AS "childAge1",
            ls.name AS source,
            (SELECT o.id FROM crm.crm_opportunity o
              WHERE o."contactId" = c.id AND o."deletedAt" IS NULL
              ORDER BY o."createdAt" DESC LIMIT 1) AS "opportunityId"
       FROM crm.crm_appointment a
       JOIN crm.crm_contact c ON c.id = a."contactId"
       JOIN crm.crm_branch b ON b.id = a."branchId"
       LEFT JOIN crm.crm_lead_source ls ON ls.id = c."leadSourceId"
      WHERE a."tenantId" = $1
        AND a.title = 'Trial Class'
        AND a."branchId" = ANY($2::text[])
        AND a."startAt" >= $3 AND a."startAt" <= $4
        AND c."deletedAt" IS NULL
        AND EXISTS (
          SELECT 1 FROM crm.crm_opportunity o2
           WHERE o2."contactId" = c.id AND o2."deletedAt" IS NULL
             AND o2."stageId" = ANY($5::text[])
        )
      ORDER BY a."startAt" ASC`,
    [tenantId, branchIds, apptFromN, apptToN, keepIds],
  );

  const days = emptyGrid();
  const byKey = new Map(days.map((d) => [d.key, d]));
  const dayByIndex = new Map(TRIAL_DAY_ORDER.map((d) => [d.dayIndex, d.key]));

  for (const r of rowsRes?.rows ?? []) {
    const dayKey = dayByIndex.get(r.dow);
    if (!dayKey) continue; // Mon/Tue — no class day
    const day = byKey.get(dayKey);
    const cell = day?.slots.find((s) => s.slot === r.slot);
    if (!cell) continue; // slot label outside the canonical set
    const name = `${r.firstName ?? ""}${r.lastName ? " " + r.lastName : ""}`.trim();
    const region = r.region === "A" || r.region === "B" || r.region === "C" ? r.region : null;
    cell.students.push({
      appointmentId: r.appointmentId,
      contactId: r.contactId,
      opportunityId: r.opportunityId,
      name: name || "(No name)",
      phone: r.phone,
      branchId: r.branchId,
      branchName: r.branchName,
      region,
      source: r.source,
      childAge: r.childAge1,
      startAt: r.startAtNaive,
    });
  }
  for (const d of days) for (const s of d.slots) s.count = s.students.length;

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    branchIds,
    branches: branchOptions,
    days,
  };
}
