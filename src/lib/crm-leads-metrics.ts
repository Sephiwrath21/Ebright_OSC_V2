import "server-only";
import { queryCrmDb } from "@/lib/crm-db";

// ─────────────────────────────────────────────────────────────────────────────
// Read-only port of v1's app/api/crm/dashboard/leads-metrics/route.ts, computed
// straight against ebright_crm. Superadmin (elevated / all-branches) view only.
//
// Counting model — must match v1 exactly so the numbers tally with the live
// CNS dashboard:
//   NL  — opportunities CREATED in range (any stage).
//   BUF — snapshot: range opps whose CURRENT stage is a Buffer stage.
//   SU  — distinct opps with a stage-history ENTRY into a Show-Up stage in range.
//   ENR — distinct opps with a stage-history ENTRY into an Enrolled stage.
//   CT  — distinct contacts with a "Trial Class" appointment whose class date is
//         in range AND who still sit in a trial-counting stage (CT/SU/SNE/CNS/ENR).
// All filters exclude soft-deleted opps and soft-deleted contacts.
// ─────────────────────────────────────────────────────────────────────────────

export type Region = "A" | "B" | "C";
export type Preset =
  | "today" | "yesterday" | "this_week" | "next_week" | "last_week" | "30d" | "custom";

export interface BranchMetrics {
  id: string;
  code: string;
  name: string;
  region: Region | null;
  NL: number;
  CT: number;
  SU: number;
  ENR: number;
  BUF: number;
}

export interface RegionTotals { NL: number; CT: number; SU: number; ENR: number }
export interface MainTotals extends RegionTotals {
  BUF: number;
  convRate: number;
  confRate: number;
  showUpRate: number;
  enrolRate: number;
}

export interface MonthPoint { month: string; NL: number; CT: number; SU: number; ENR: number }

export interface LeadsMetricsResult {
  range: { from: string; to: string };
  main: MainTotals;
  regions: Record<Region, RegionTotals>;
  branches: BranchMetrics[];
  trend?: MonthPoint[]; // 6-month rolling series (only when opts.trend)
}

// KL has no DST — a fixed +8h offset is safe. All presets are KL wall-clock.
const KL_OFFSET_MS = 8 * 3600 * 1000;
// Display floor: leads created before this are historical noise (matches v1's
// lib/crm/display-cutoff.ts DISPLAY_MIN_CREATED_AT).
const DISPLAY_MIN = new Date("2026-05-01T00:00:00+08:00");

function startOfDayKL(now: Date = new Date()): Date {
  const wall = new Date(now.getTime() + KL_OFFSET_MS);
  const midnightKL = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
  return new Date(midnightKL - KL_OFFSET_MS);
}

export function parseDateRange(preset: Preset, fromStr?: string, toStr?: string): { from: Date; to: Date } {
  const today = startOfDayKL();
  const endOfToday = new Date(today.getTime() + 24 * 3600 * 1000 - 1);
  const DAY = 24 * 3600 * 1000;

  switch (preset) {
    case "custom": {
      return {
        from: fromStr ? new Date(fromStr) : today,
        to: toStr ? new Date(toStr) : endOfToday,
      };
    }
    case "yesterday":
      return { from: new Date(today.getTime() - DAY), to: new Date(today.getTime() - 1) };
    case "today":
      return { from: today, to: endOfToday };
    case "last_week": {
      const wall = new Date(today.getTime() + KL_OFFSET_MS);
      const dow = wall.getUTCDay();
      const daysSinceMon = dow === 0 ? 6 : dow - 1;
      return {
        from: new Date(today.getTime() - (daysSinceMon + 7) * DAY),
        to: new Date(today.getTime() - daysSinceMon * DAY - 1),
      };
    }
    case "next_week": {
      const wall = new Date(today.getTime() + KL_OFFSET_MS);
      const dow = wall.getUTCDay();
      const daysSinceMon = dow === 0 ? 6 : dow - 1;
      const nextMon = today.getTime() + (7 - daysSinceMon) * DAY;
      return { from: new Date(nextMon), to: new Date(nextMon + 7 * DAY - 1) };
    }
    case "30d":
      return { from: new Date(today.getTime() - 29 * DAY), to: endOfToday };
    case "this_week":
    default: {
      const wall = new Date(today.getTime() + KL_OFFSET_MS);
      const dow = wall.getUTCDay();
      const daysBack = dow === 0 ? 6 : dow - 1;
      const from = new Date(today.getTime() - daysBack * DAY);
      return { from, to: new Date(from.getTime() + 7 * DAY - 1) };
    }
  }
}

function clampToDisplayMin(d: Date): Date {
  return d < DISPLAY_MIN ? DISPLAY_MIN : d;
}

// The CRM timestamp columns are `timestamp without time zone` (naive). Prisma
// (v1) writes/reads them as UTC wall-clock. node-pg, however, serializes a JS
// Date param using the Node process's LOCAL timezone — on a KL host that lands
// the window 8h off and silently mis-counts NL at the day boundaries. So we
// bind bounds as explicit naive strings instead of Date objects:
//   - createdAt / changedAt are stored UTC-wall → bind the instant's UTC wall
//     time (toNaiveUtc).
//   - appointment.startAt is stored KL-wall ("naive-KL-as-UTC") → bind the
//     instant already shifted +8h (callers pass apptFrom/apptTo).
// This makes the raw-pg reads tally exactly with v1's Prisma dashboard.
function toNaiveUtc(d: Date): string {
  return d.toISOString().replace("T", " ").replace("Z", "");
}

// ─── Stage categorisation (matches v1 STAGE_PATTERN + ctKeepStageIds) ────────
const STAGE_PATTERN = {
  CT: /^confirmed for trial$/i,
  SU: /^show[- ]up$/i,
  ENR: /^enrolled$/i,
  BUF: /^(self[- ]generated|buffer)/i,
};
const CT_KEEP_CODES = new Set(["CT", "SU", "SNE", "CNS", "ENR"]);

interface StageRow { id: string; name: string; shortCode: string | null }

function categorizeStages(stages: StageRow[]) {
  const suIds: string[] = [];
  const enrIds: string[] = [];
  const bufIds: string[] = [];
  const ctKeepIds: string[] = [];
  for (const s of stages) {
    const code = (s.shortCode ?? "").toUpperCase().replace(/_/g, "");
    // Buffer: identified by short-code SG first, else by name pattern.
    if (s.shortCode === "SG" || STAGE_PATTERN.BUF.test(s.name)) bufIds.push(s.id);
    if (STAGE_PATTERN.SU.test(s.name)) suIds.push(s.id);
    if (STAGE_PATTERN.ENR.test(s.name)) enrIds.push(s.id);
    if (
      CT_KEEP_CODES.has(code) ||
      STAGE_PATTERN.CT.test(s.name) ||
      STAGE_PATTERN.SU.test(s.name) ||
      STAGE_PATTERN.ENR.test(s.name)
    ) {
      ctKeepIds.push(s.id);
    }
  }
  return { suIds, enrIds, bufIds, ctKeepIds };
}

// Turn "02 Ebright (Subang Taipan)" → { code: "02", name: "Subang Taipan" }.
// Falls back to the crm_branch.code + full name when the pattern doesn't match.
function displayBranch(name: string, code: string | null): { code: string; name: string } {
  const m = name.match(/^(\d+)\s+Ebright\s*\((.+)\)\s*$/i);
  if (m) return { code: m[1], name: m[2] };
  return { code: code ?? "", name };
}

function computeRates(m: RegionTotals) {
  return {
    convRate: m.NL ? m.ENR / m.NL : 0,
    confRate: m.NL ? m.CT / m.NL : 0,
    showUpRate: m.CT ? m.SU / m.CT : 0,
    enrolRate: m.SU ? m.ENR / m.SU : 0,
  };
}

/**
 * Compute the superadmin leads-metrics payload from ebright_crm. Returns null
 * when the CRM link isn't configured (isCrmAvailable() === false) so callers
 * can surface a clean "not connected" state.
 */
export async function getLeadsMetrics(opts: {
  preset: Preset;
  from?: string;
  to?: string;
  trend?: boolean;
}): Promise<LeadsMetricsResult | null> {
  // Resolve tenant (single-tenant 'ebright' in practice; fall back to earliest).
  const tenantRes = await queryCrmDb<{ id: string }>(
    `SELECT id FROM crm.crm_tenant
      WHERE slug IN ('ebright','ebright-demo')
      ORDER BY "createdAt" ASC LIMIT 1`,
  );
  if (!tenantRes) return null; // CRM link not configured
  let tenantId: string | undefined = tenantRes.rows[0]?.id;
  if (!tenantId) {
    const first = await queryCrmDb<{ id: string }>(
      `SELECT id FROM crm.crm_tenant ORDER BY "createdAt" ASC LIMIT 1`,
    );
    tenantId = first?.rows[0]?.id;
  }
  if (!tenantId) return null;

  const range = parseDateRange(opts.preset, opts.from, opts.to);
  const from = clampToDisplayMin(range.from);
  const to = range.to;
  // Appointment startAt is stored naive-KL-as-UTC; shift the window forward so
  // late-/Sunday-KL trials at the edges aren't dropped (matches v1).
  const apptFrom = new Date(from.getTime() + KL_OFFSET_MS);
  const apptTo = new Date(to.getTime() + KL_OFFSET_MS);
  // Naive bind values (see toNaiveUtc doc): UTC-wall for created/changed,
  // KL-wall (already +8h shifted) for appointment startAt.
  const fromN = toNaiveUtc(from);
  const toN = toNaiveUtc(to);
  const apptFromN = toNaiveUtc(apptFrom);
  const apptToN = toNaiveUtc(apptTo);

  // Stages → category id arrays.
  const stagesRes = await queryCrmDb<StageRow>(
    `SELECT id, name, "shortCode" FROM crm.crm_stage WHERE "tenantId" = $1`,
    [tenantId],
  );
  const { suIds, enrIds, bufIds, ctKeepIds } = categorizeStages(stagesRes?.rows ?? []);

  // Elevated view counts over every regioned (A/B/C) branch.
  const branchesRes = await queryCrmDb<{ id: string; name: string; region: string | null; code: string | null }>(
    `SELECT id, name, region, code FROM crm.crm_branch
      WHERE "tenantId" = $1 AND region IN ('A','B','C')`,
    [tenantId],
  );
  const branches = branchesRes?.rows ?? [];
  const branchIds = branches.map((b) => b.id);
  if (branchIds.length === 0) {
    const empty: RegionTotals = { NL: 0, CT: 0, SU: 0, ENR: 0 };
    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      main: { ...empty, BUF: 0, ...computeRates(empty) },
      regions: { A: { ...empty }, B: { ...empty }, C: { ...empty } },
      branches: [],
    };
  }

  const suEnrIds = [...suIds, ...enrIds];

  // NL + BUF, SU + ENR, CT — three grouped aggregate queries.
  const [nlBuf, suEnr, ct] = await Promise.all([
    queryCrmDb<{ branchId: string; nl: string; buf: string }>(
      `SELECT o."branchId" AS "branchId",
              COUNT(*) AS nl,
              COUNT(*) FILTER (WHERE o."stageId" = ANY($4::text[])) AS buf
         FROM crm.crm_opportunity o
         JOIN crm.crm_contact c ON c.id = o."contactId"
        WHERE o."tenantId" = $1
          AND o."deletedAt" IS NULL
          AND c."deletedAt" IS NULL
          AND o."createdAt" >= $2 AND o."createdAt" <= $3
          AND o."branchId" = ANY($5::text[])
        GROUP BY o."branchId"`,
      [tenantId, fromN, toN, bufIds, branchIds],
    ),
    suEnrIds.length === 0
      ? Promise.resolve({ rows: [] as Array<{ branchId: string; su: string; enr: string }> })
      : queryCrmDb<{ branchId: string; su: string; enr: string }>(
          `SELECT o."branchId" AS "branchId",
                  COUNT(DISTINCT sh."opportunityId") FILTER (WHERE sh."toStageId" = ANY($4::text[])) AS su,
                  COUNT(DISTINCT sh."opportunityId") FILTER (WHERE sh."toStageId" = ANY($5::text[])) AS enr
             FROM crm.crm_stage_history sh
             JOIN crm.crm_opportunity o ON o.id = sh."opportunityId"
             JOIN crm.crm_contact c ON c.id = o."contactId"
            WHERE sh."tenantId" = $1
              AND sh."changedAt" >= $2 AND sh."changedAt" <= $3
              AND sh."toStageId" = ANY($6::text[])
              AND o."deletedAt" IS NULL
              AND c."deletedAt" IS NULL
              AND o."branchId" = ANY($7::text[])
            GROUP BY o."branchId"`,
          [tenantId, fromN, toN, suIds, enrIds, suEnrIds, branchIds],
        ),
    ctKeepIds.length === 0
      ? Promise.resolve({ rows: [] as Array<{ branchId: string; ct: string }> })
      : queryCrmDb<{ branchId: string; ct: string }>(
          `SELECT a."branchId" AS "branchId",
                  COUNT(DISTINCT a."contactId") AS ct
             FROM crm.crm_appointment a
             JOIN crm.crm_contact c ON c.id = a."contactId"
            WHERE a."tenantId" = $1
              AND a.title = 'Trial Class'
              AND a."startAt" >= $2 AND a."startAt" <= $3
              AND c."deletedAt" IS NULL
              AND a."branchId" = ANY($5::text[])
              AND EXISTS (
                SELECT 1 FROM crm.crm_opportunity o2
                 WHERE o2."contactId" = a."contactId"
                   AND o2."deletedAt" IS NULL
                   AND o2."stageId" = ANY($4::text[])
              )
            GROUP BY a."branchId"`,
          [tenantId, apptFromN, apptToN, ctKeepIds, branchIds],
        ),
  ]);

  const nlMap = new Map(nlBuf?.rows.map((r) => [r.branchId, r]) ?? []);
  const suMap = new Map(suEnr?.rows.map((r) => [r.branchId, r]) ?? []);
  const ctMap = new Map(ct?.rows.map((r) => [r.branchId, r]) ?? []);

  const branchMetrics: BranchMetrics[] = branches.map((b) => {
    const nb = nlMap.get(b.id);
    const se = suMap.get(b.id);
    const c = ctMap.get(b.id);
    const disp = displayBranch(b.name, b.code);
    const region = b.region === "A" || b.region === "B" || b.region === "C" ? b.region : null;
    return {
      id: b.id,
      code: disp.code,
      name: disp.name,
      region,
      NL: Number(nb?.nl ?? 0),
      BUF: Number(nb?.buf ?? 0),
      SU: Number(se?.su ?? 0),
      ENR: Number(se?.enr ?? 0),
      CT: Number(c?.ct ?? 0),
    };
  });

  // Sort by the "NN …" numeric prefix so table + chart read 01 → 02 → 03.
  branchMetrics.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  const aggregate = (region: Region): RegionTotals => {
    const list = branchMetrics.filter((m) => m.region === region);
    return {
      NL: list.reduce((s, x) => s + x.NL, 0),
      CT: list.reduce((s, x) => s + x.CT, 0),
      SU: list.reduce((s, x) => s + x.SU, 0),
      ENR: list.reduce((s, x) => s + x.ENR, 0),
    };
  };
  const regionA = aggregate("A");
  const regionB = aggregate("B");
  const regionC = aggregate("C");

  const mainBase: RegionTotals = {
    NL: regionA.NL + regionB.NL + regionC.NL,
    CT: regionA.CT + regionB.CT + regionC.CT,
    SU: regionA.SU + regionB.SU + regionC.SU,
    ENR: regionA.ENR + regionB.ENR + regionC.ENR,
  };
  const main: MainTotals = {
    ...mainBase,
    BUF: branchMetrics.reduce((s, x) => s + x.BUF, 0),
    ...computeRates(mainBase),
  };

  // ── Monthly trend (6-month rolling, all regioned branches) ──────────────────
  // Same counting model as above, but bucketed by KL month instead of summed
  // for one range. Only computed when requested (Analytics page). Matches v1's
  // ?trend=1 elevated series.
  let trend: MonthPoint[] | undefined;
  if (opts.trend) {
    trend = await computeTrend({
      tenantId, to, branchIds, suIds, enrIds, suEnrIds, ctKeepIds,
    });
  }

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    main,
    regions: { A: regionA, B: regionB, C: regionC },
    branches: branchMetrics,
    ...(trend ? { trend } : {}),
  };
}

// 6-month rolling series ending on the KL month of `to`. NL by createdAt month,
// SU/ENR by stage-history changedAt month (distinct opp per month/category), CT
// by trial class-date month (distinct contact, current stage in the keep set).
async function computeTrend(a: {
  tenantId: string; to: Date; branchIds: string[];
  suIds: string[]; enrIds: string[]; suEnrIds: string[]; ctKeepIds: string[];
}): Promise<MonthPoint[]> {
  const wall = new Date(a.to.getTime() + KL_OFFSET_MS);
  // First day of the month 5 months before `to`, as a real UTC instant.
  const sixMonthsBack = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth() - 5, 1) - KL_OFFSET_MS);
  const fromN = toNaiveUtc(sixMonthsBack);
  const toN = toNaiveUtc(a.to);
  const apptFromN = toNaiveUtc(new Date(sixMonthsBack.getTime() + KL_OFFSET_MS));
  const apptToN = toNaiveUtc(new Date(a.to.getTime() + KL_OFFSET_MS));

  // Pre-seed the 6 month keys so the chart shows zeros instead of gaps.
  const seed = new Map<string, MonthPoint>();
  const order: string[] = [];
  for (let m = 0; m < 6; m++) {
    const d = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth() - 5 + m, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    order.push(key);
    seed.set(key, { month: key, NL: 0, CT: 0, SU: 0, ENR: 0 });
  }

  const [nl, suEnr, ct] = await Promise.all([
    queryCrmDb<{ ym: string; n: string }>(
      `SELECT to_char(o."createdAt" + interval '8 hours', 'YYYY-MM') AS ym, COUNT(*) AS n
         FROM crm.crm_opportunity o
         JOIN crm.crm_contact c ON c.id = o."contactId"
        WHERE o."tenantId" = $1 AND o."deletedAt" IS NULL AND c."deletedAt" IS NULL
          AND o."createdAt" >= $2 AND o."createdAt" <= $3
          AND o."branchId" = ANY($4::text[])
        GROUP BY ym`,
      [a.tenantId, fromN, toN, a.branchIds],
    ),
    a.suEnrIds.length === 0
      ? Promise.resolve({ rows: [] as Array<{ ym: string; su: string; enr: string }> })
      : queryCrmDb<{ ym: string; su: string; enr: string }>(
          `SELECT to_char(sh."changedAt" + interval '8 hours', 'YYYY-MM') AS ym,
                  COUNT(DISTINCT sh."opportunityId") FILTER (WHERE sh."toStageId" = ANY($4::text[])) AS su,
                  COUNT(DISTINCT sh."opportunityId") FILTER (WHERE sh."toStageId" = ANY($5::text[])) AS enr
             FROM crm.crm_stage_history sh
             JOIN crm.crm_opportunity o ON o.id = sh."opportunityId"
             JOIN crm.crm_contact c ON c.id = o."contactId"
            WHERE sh."tenantId" = $1
              AND sh."changedAt" >= $2 AND sh."changedAt" <= $3
              AND sh."toStageId" = ANY($6::text[])
              AND o."deletedAt" IS NULL AND c."deletedAt" IS NULL
              AND o."branchId" = ANY($7::text[])
            GROUP BY ym`,
          [a.tenantId, fromN, toN, a.suIds, a.enrIds, a.suEnrIds, a.branchIds],
        ),
    a.ctKeepIds.length === 0
      ? Promise.resolve({ rows: [] as Array<{ ym: string; n: string }> })
      : queryCrmDb<{ ym: string; n: string }>(
          `SELECT to_char(ap."startAt", 'YYYY-MM') AS ym, COUNT(DISTINCT ap."contactId") AS n
             FROM crm.crm_appointment ap
             JOIN crm.crm_contact c ON c.id = ap."contactId"
            WHERE ap."tenantId" = $1 AND ap.title = 'Trial Class'
              AND ap."startAt" >= $2 AND ap."startAt" <= $3
              AND c."deletedAt" IS NULL
              AND ap."branchId" = ANY($5::text[])
              AND EXISTS (
                SELECT 1 FROM crm.crm_opportunity o2
                 WHERE o2."contactId" = ap."contactId"
                   AND o2."deletedAt" IS NULL
                   AND o2."stageId" = ANY($4::text[])
              )
            GROUP BY ym`,
          [a.tenantId, apptFromN, apptToN, a.ctKeepIds, a.branchIds],
        ),
  ]);

  for (const r of nl?.rows ?? []) { const p = seed.get(r.ym); if (p) p.NL = Number(r.n); }
  for (const r of suEnr?.rows ?? []) { const p = seed.get(r.ym); if (p) { p.SU = Number(r.su); p.ENR = Number(r.enr); } }
  for (const r of ct?.rows ?? []) { const p = seed.get(r.ym); if (p) p.CT = Number(r.n); }

  return order.map((k) => seed.get(k)!);
}
