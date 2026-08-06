import "server-only";
import { queryCrmDb } from "@/lib/crm-db";

// ─────────────────────────────────────────────────────────────────────────────
// Read-only port of v1's getPipelineKanban, computed against ebright_crm.
// Superadmin view. Columns are the canonical stage set (grouped by stage NAME
// across all per-branch pipelines, like v1's "All Branches" aggregate).
//
// Per-stage COUNT is the true count (tallies with v1). Cards are capped per
// column (CARDS_PER_STAGE) for performance — the header shows the real count
// and "+N more" when there are extras.
// ─────────────────────────────────────────────────────────────────────────────

const DISPLAY_MIN = "2026-05-01 00:00:00"; // UTC-wall naive (matches DISPLAY_MIN_CREATED_AT)
const CARDS_PER_STAGE = 60;

export interface OppCard {
  id: string;
  contactId: string;
  name: string;
  category: "Junior" | "Mid" | "Senior" | null;
  source: string | null;
  value: number;
  hoursInStage: number;
  tags: string[];
  trialDate: string | null;
  trialTime: string | null;
}
export interface KanbanColumn {
  id: string;
  name: string;
  shortCode: string | null;
  color: string;
  count: number;
  totalValue: number;
  cards: OppCard[];
}
export interface KanbanResult {
  stages: KanbanColumn[];
  total: number;
  branches: Array<{ id: string; name: string }>;
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

function ageCategory(age: string | null): OppCard["category"] {
  if (!age) return null;
  const n = parseInt(age, 10);
  if (Number.isNaN(n)) return null;
  if (n >= 7 && n <= 9) return "Junior";
  if (n >= 10 && n <= 12) return "Mid";
  if (n >= 13 && n <= 16) return "Senior";
  return null;
}

export async function getKanban(opts: {
  scope?: string;
  search?: string;
  /** Access-enforced branch allow-list. When set (non-null), the caller may only
   *  see these branches and the client `scope` picker is confined to them. */
  allowedBranchIds?: string[] | null;
}): Promise<KanbanResult | null> {
  const tenantId = await resolveTenantId();
  if (!tenantId) return null;

  const allowed = opts.allowedBranchIds ?? null;
  const branchesRes = await queryCrmDb<{ id: string; name: string }>(
    `SELECT id, name FROM crm.crm_branch WHERE "tenantId" = $1 ORDER BY name ASC`,
    [tenantId],
  );
  // Restrict the branch picker to what the caller may see.
  const branches = (branchesRes?.rows ?? []).filter(
    (b) => allowed === null || allowed.includes(b.id),
  );

  const scope = opts.scope && opts.scope !== "all" ? opts.scope : null; // branchId or all
  const search = opts.search?.trim() || null;

  // Canonical columns: distinct stage NAME across all pipelines, ordered by the
  // stage's position. shortCode/color from a representative row.
  const colsRes = await queryCrmDb<{ name: string; shortCode: string | null; color: string; ord: number }>(
    `SELECT name, MIN("shortCode") AS "shortCode", MIN(color) AS color, MIN("order") AS ord
       FROM crm.crm_stage WHERE "tenantId" = $1 GROUP BY name ORDER BY ord ASC`,
    [tenantId],
  );
  const cols = colsRes?.rows ?? [];

  // Shared filter fragment + params.
  const params: unknown[] = [tenantId, DISPLAY_MIN];
  const filters: string[] = [
    `o."tenantId" = $1`,
    `o."deletedAt" IS NULL`,
    `c."deletedAt" IS NULL`,
    `o."createdAt" >= $2`,
  ];
  // Hard access boundary: confine to the allowed branches (empty ⇒ nothing).
  if (allowed !== null) {
    params.push(allowed);
    filters.push(`o."branchId" = ANY($${params.length}::text[])`);
  }
  // Client-selected single branch (must be within the allowed set).
  if (scope && (allowed === null || allowed.includes(scope))) {
    params.push(scope);
    filters.push(`o."branchId" = $${params.length}`);
  }
  if (search) {
    const digits = search.replace(/\D/g, "");
    params.push(`%${search}%`);
    const like = `$${params.length}`;
    const ors = [`c."firstName" ILIKE ${like}`, `c."lastName" ILIKE ${like}`, `c.email ILIKE ${like}`, `c.phone ILIKE ${like}`, `c."childName1" ILIKE ${like}`];
    if (digits.length >= 3) { params.push(`%${digits}%`); ors.push(`regexp_replace(c.phone,'\\D','','g') ILIKE $${params.length}`); }
    filters.push(`(${ors.join(" OR ")})`);
  }
  const where = filters.join(" AND ");

  // Per-stage counts (true totals) + value sums.
  const countRes = await queryCrmDb<{ name: string; n: number; total: string }>(
    `SELECT s.name, COUNT(*)::int AS n, COALESCE(SUM(o.value),0)::text AS total
       FROM crm.crm_opportunity o
       JOIN crm.crm_stage s ON s.id = o."stageId"
       JOIN crm.crm_contact c ON c.id = o."contactId"
      WHERE ${where}
      GROUP BY s.name`,
    params,
  );
  const countByName = new Map((countRes?.rows ?? []).map((r) => [r.name, r]));

  // Capped cards per stage via ROW_NUMBER window.
  const cardParams = [...params, CARDS_PER_STAGE];
  const cardsRes = await queryCrmDb<{
    id: string; contactId: string; stageName: string; value: string; lsc: string;
    firstName: string; lastName: string | null; childName1: string | null; childAge1: string | null;
    source: string | null; trial: string | null; tags: string[];
  }>(
    `WITH ranked AS (
       SELECT o.id, o."contactId", o.value, o."lastStageChangeAt", o."createdAt",
              o."assignedUserId", s.name AS stage_name,
              ROW_NUMBER() OVER (PARTITION BY s.name ORDER BY o."createdAt" DESC) rn
         FROM crm.crm_opportunity o
         JOIN crm.crm_stage s ON s.id = o."stageId"
         JOIN crm.crm_contact c ON c.id = o."contactId"
        WHERE ${where}
     )
     SELECT r.id, r."contactId" AS "contactId", r.stage_name AS "stageName",
            r.value::text AS value,
            to_char(r."lastStageChangeAt", 'YYYY-MM-DD"T"HH24:MI:SS') AS lsc,
            ct."firstName" AS "firstName", ct."lastName" AS "lastName",
            ct."childName1" AS "childName1", ct."childAge1" AS "childAge1",
            ls.name AS source,
            (SELECT to_char(a."startAt", 'YYYY-MM-DD"T"HH24:MI:SS')
               FROM crm.crm_appointment a
              WHERE a."contactId" = r."contactId" AND a.title = 'Trial Class'
              ORDER BY a."startAt" DESC LIMIT 1) AS trial,
            COALESCE(tg.tags, '[]'::json) AS tags
       FROM ranked r
       JOIN crm.crm_contact ct ON ct.id = r."contactId"
       LEFT JOIN crm.crm_lead_source ls ON ls.id = ct."leadSourceId"
       LEFT JOIN LATERAL (
         SELECT json_agg(t.name) AS tags
           FROM crm.crm_contact_tag ctg JOIN crm.crm_tag t ON t.id = ctg."tagId"
          WHERE ctg."contactId" = r."contactId"
       ) tg ON true
      WHERE r.rn <= $${cardParams.length}
      ORDER BY r.stage_name, r."createdAt" DESC`,
    cardParams,
  );

  const now = Date.now();
  const cardsByStage = new Map<string, OppCard[]>();
  for (const r of cardsRes?.rows ?? []) {
    const arr = cardsByStage.get(r.stageName) ?? [];
    const name = (r.childName1 || `${r.firstName} ${r.lastName ?? ""}`).trim() || "(No name)";
    const lscMs = Date.parse(`${r.lsc}Z`);
    const trialDt = r.trial ? new Date(`${r.trial}Z`) : null;
    arr.push({
      id: r.id,
      contactId: r.contactId,
      name,
      category: ageCategory(r.childAge1),
      source: r.source,
      value: Number(r.value) || 0,
      hoursInStage: Number.isNaN(lscMs) ? 0 : Math.max(0, Math.floor((now - lscMs) / 3_600_000)),
      tags: Array.isArray(r.tags) ? r.tags.filter(Boolean) : [],
      trialDate: trialDt ? trialDt.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" }) : null,
      trialTime: trialDt ? trialDt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) : null,
    });
    cardsByStage.set(r.stageName, arr);
  }

  let total = 0;
  const stages: KanbanColumn[] = cols.map((col) => {
    const cnt = countByName.get(col.name);
    const count = cnt?.n ?? 0;
    total += count;
    return {
      id: col.name,
      name: col.name,
      shortCode: col.shortCode,
      color: col.color ?? "blue",
      count,
      totalValue: Number(cnt?.total ?? 0) || 0,
      cards: cardsByStage.get(col.name) ?? [],
    };
  });

  return { stages, total, branches };
}
