import "server-only";
import { queryCrmDb } from "@/lib/crm-db";

// ─────────────────────────────────────────────────────────────────────────────
// Read-only port of v1's /api/crm/region/day-distribution, against ebright_crm.
// Superadmin all-branches view. Counts CT and ENR opportunities per branch,
// grouped by the contact's preferredTrialDay (WED/THU/FRI/SAT/SUN).
//
// Branch mapping is by branchId (crm_branch.id) — the region/branch filters and
// every counted row are keyed on branchId, never by name-matching.
//
// Tally rules (identical to v1):
//   • window filters o.createdAt (UTC-wall naive — bound via toNaiveUtc)
//   • CT  = stage.shortCode='CT'  OR name ~* '^confirmed for trial$'
//   • ENR = stage.shortCode='ENR' OR name ~* '^enrolled$'
//   • only rows with a non-null preferredTrialDay are bucketed
// ─────────────────────────────────────────────────────────────────────────────

export type RegionPreset =
  | "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "custom";

export type TrialDay = "WED" | "THU" | "FRI" | "SAT" | "SUN";
export type Region = "A" | "B" | "C";
export const REGION_DAYS: TrialDay[] = ["WED", "THU", "FRI", "SAT", "SUN"];

export interface DayCounts { CT: number; ENR: number }
export interface RegionBranch {
  branchId: string;
  branchName: string;
  shortName: string;
  region: Region | null;
  totals: DayCounts;
  days: Record<TrialDay, DayCounts>;
}
export interface RegionResult {
  range: { from: string; to: string };
  availableRegions: Region[];
  overall: { totals: DayCounts; days: Record<TrialDay, DayCounts> };
  branches: RegionBranch[];
}

// KL has no DST — a fixed +8h offset is safe. All presets are KL wall-clock.
const KL_OFFSET_MS = 8 * 3600 * 1000;

function startOfDayKL(now: Date = new Date()): Date {
  const wall = new Date(now.getTime() + KL_OFFSET_MS);
  const midnightKL = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
  return new Date(midnightKL - KL_OFFSET_MS);
}

function parseDateRange(preset: RegionPreset, fromStr?: string, toStr?: string): { from: Date; to: Date } {
  const today = startOfDayKL();
  const endOfToday = new Date(today.getTime() + 24 * 3600 * 1000 - 1);
  const DAY = 24 * 3600 * 1000;

  if (preset === "custom") {
    return { from: fromStr ? new Date(fromStr) : today, to: toStr ? new Date(toStr) : endOfToday };
  }

  const wall = new Date(today.getTime() + KL_OFFSET_MS);
  const dow = wall.getUTCDay(); // 0 = Sun
  const daysSinceMon = dow === 0 ? 6 : dow - 1;

  switch (preset) {
    case "today":
      return { from: today, to: endOfToday };
    case "yesterday":
      return { from: new Date(today.getTime() - DAY), to: new Date(today.getTime() - 1) };
    case "last_week":
      return {
        from: new Date(today.getTime() - (daysSinceMon + 7) * DAY),
        to: new Date(today.getTime() - daysSinceMon * DAY - 1),
      };
    case "this_month":
      return { from: new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), 1) - KL_OFFSET_MS), to: endOfToday };
    case "last_month":
      return {
        from: new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth() - 1, 1) - KL_OFFSET_MS),
        to: new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), 1) - KL_OFFSET_MS - 1),
      };
    case "this_week":
    default:
      return { from: new Date(today.getTime() - daysSinceMon * DAY), to: endOfToday };
  }
}

// CRM timestamp cols are `timestamp without time zone` (UTC-wall). node-pg
// serializes JS Date params in the process LOCAL tz, shifting the window 8h; so
// bind the instant's UTC wall-time as a naive string. Matches crm-leads-metrics.
function toNaiveUtc(d: Date): string {
  return d.toISOString().replace("T", " ").replace("Z", "");
}

/** "17 Ebright (Bandar Rimbayu)" → "Bandar Rimbayu" (graceful fallback). */
function shortNameOf(branchName: string): string {
  const m = branchName.match(/\(([^)]+)\)/);
  return m?.[1]?.trim() ?? branchName;
}

function zeroDays(): Record<TrialDay, DayCounts> {
  return {
    WED: { CT: 0, ENR: 0 }, THU: { CT: 0, ENR: 0 }, FRI: { CT: 0, ENR: 0 },
    SAT: { CT: 0, ENR: 0 }, SUN: { CT: 0, ENR: 0 },
  };
}

async function resolveTenantId(): Promise<string | null> {
  const r = await queryCrmDb<{ id: string }>(
    `SELECT id FROM crm.crm_tenant WHERE slug IN ('ebright','ebright-demo') ORDER BY "createdAt" ASC LIMIT 1`,
  );
  if (!r) return null;
  if (r.rows[0]?.id) return r.rows[0].id;
  const f = await queryCrmDb<{ id: string }>(`SELECT id FROM crm.crm_tenant ORDER BY "createdAt" ASC LIMIT 1`);
  return f?.rows[0]?.id ?? null;
}

export async function getRegionDayDistribution(opts: {
  preset?: string; from?: string; to?: string; region?: string; branchId?: string;
  /** Access-enforced crm_branch allow-list. null = no restriction. */
  allowedBranchIds?: string[] | null;
}): Promise<RegionResult | null> {
  const tenantId = await resolveTenantId();
  if (!tenantId) return null;

  const preset = (opts.preset ?? "this_week") as RegionPreset;
  const { from, to } = parseDateRange(preset, opts.from, opts.to);
  const regionParam = (opts.region ?? "all").toUpperCase();
  const branchIdParam = opts.branchId ?? "all";

  // ─── Visible branches (region/branch filtered, then clamped to access) ───
  const bParams: unknown[] = [tenantId];
  const bFilters = [`"tenantId" = $1`];
  if (regionParam !== "ALL") { bParams.push(regionParam); bFilters.push(`region = $${bParams.length}`); }
  if (branchIdParam !== "all") { bParams.push(branchIdParam); bFilters.push(`id = $${bParams.length}`); }
  if (opts.allowedBranchIds != null) { bParams.push(opts.allowedBranchIds); bFilters.push(`id = ANY($${bParams.length}::text[])`); }

  const branchRes = await queryCrmDb<{ id: string; name: string; region: string | null }>(
    `SELECT id, name, region FROM crm.crm_branch WHERE ${bFilters.join(" AND ")} ORDER BY name ASC`,
    bParams,
  );
  const branchRows = branchRes?.rows ?? [];

  const empty: RegionResult = {
    range: { from: from.toISOString(), to: to.toISOString() },
    availableRegions: [],
    overall: { totals: { CT: 0, ENR: 0 }, days: zeroDays() },
    branches: [],
  };
  if (branchRows.length === 0) return empty;

  const branchIds = branchRows.map((b) => b.id);

  // ─── Grouped counts: per (branch, preferredTrialDay, CT|ENR bucket) ──────────
  const params: unknown[] = [tenantId, toNaiveUtc(from), toNaiveUtc(to)];
  const idPlaceholders = branchIds.map((id) => { params.push(id); return `$${params.length}`; }).join(", ");

  const rows = await queryCrmDb<{ branchId: string; day: TrialDay | null; bucket: "CT" | "ENR"; cnt: string }>(
    `SELECT
        o."branchId"                AS "branchId",
        c."preferredTrialDay"::text AS day,
        CASE
          WHEN s."shortCode" = 'CT'  OR s.name ~* '^confirmed for trial$' THEN 'CT'
          WHEN s."shortCode" = 'ENR' OR s.name ~* '^enrolled$'            THEN 'ENR'
        END                         AS bucket,
        COUNT(*)::bigint            AS cnt
       FROM crm.crm_opportunity o
       JOIN crm.crm_contact c ON c.id = o."contactId"
       JOIN crm.crm_stage   s ON s.id = o."stageId"
      WHERE o."tenantId"  = $1
        AND o."createdAt" >= $2
        AND o."createdAt" <= $3
        AND o."branchId"  IN (${idPlaceholders})
        AND o."deletedAt" IS NULL
        AND c."preferredTrialDay" IS NOT NULL
        AND (s."shortCode" IN ('CT','ENR') OR s.name ~* '^(confirmed for trial|enrolled)$')
      GROUP BY o."branchId", c."preferredTrialDay", bucket`,
    params,
  );

  const byBranch = new Map<string, RegionBranch>();
  for (const b of branchRows) {
    byBranch.set(b.id, {
      branchId: b.id,
      branchName: b.name,
      shortName: shortNameOf(b.name),
      region: (b.region as Region | null) ?? null,
      totals: { CT: 0, ENR: 0 },
      days: zeroDays(),
    });
  }

  const overallDays = zeroDays();
  const overallTotals: DayCounts = { CT: 0, ENR: 0 };

  for (const r of rows?.rows ?? []) {
    if (!r.day || !r.bucket) continue;
    const branch = byBranch.get(r.branchId);
    if (!branch) continue;
    const cnt = Number(r.cnt);
    branch.days[r.day][r.bucket] += cnt;
    branch.totals[r.bucket] += cnt;
    overallDays[r.day][r.bucket] += cnt;
    overallTotals[r.bucket] += cnt;
  }

  const availableRegions = Array.from(
    new Set(branchRows.map((b) => b.region as Region | null).filter((r): r is Region => !!r)),
  ).sort();

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    availableRegions,
    overall: { totals: overallTotals, days: overallDays },
    branches: Array.from(byBranch.values()),
  };
}
