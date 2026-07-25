import "server-only";
import { queryCrmDb } from "@/lib/crm-db";

// ─────────────────────────────────────────────────────────────────────────────
// Read-only port of v1's server/queries/contacts.ts (getContactsByTenant),
// computed against ebright_crm. Superadmin all-branches (elevated) view — no
// branch limit, matching v1's elevated scope so the total + rows tally with the
// live CNS contacts list.
//
// Each contact carries its CURRENT stage (latest non-deleted opportunity by
// lastStageChangeAt), lead source, assigned user, and tags — the exact shape
// v1's contact list row renders.
// ─────────────────────────────────────────────────────────────────────────────

export interface ContactRow {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
  stage: { name: string; shortCode: string | null; color: string } | null;
  leadSource: { id: string; name: string } | null;
  assignedUser: { id: string; name: string | null } | null;
  tags: Array<{ id: string; name: string; color: string }>;
}

export interface ContactsPage {
  data: ContactRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ContactsFilter {
  search?: string;
  stageName?: string;      // filter by stage NAME (groups the _/- shortCode variants + all per-branch pipelines)
  leadSourceId?: string;
  assignedUserId?: string;
  page?: number;
  pageSize?: number;
  sortBy?: "name" | "createdAt";
  sortDir?: "asc" | "desc";
}

async function resolveTenantId(): Promise<string | null> {
  const bySlug = await queryCrmDb<{ id: string }>(
    `SELECT id FROM crm.crm_tenant WHERE slug IN ('ebright','ebright-demo') ORDER BY "createdAt" ASC LIMIT 1`,
  );
  if (!bySlug) return null; // CRM link not configured
  if (bySlug.rows[0]?.id) return bySlug.rows[0].id;
  const first = await queryCrmDb<{ id: string }>(`SELECT id FROM crm.crm_tenant ORDER BY "createdAt" ASC LIMIT 1`);
  return first?.rows[0]?.id ?? null;
}

// Build the shared WHERE clause + params (used by both the page query and the
// count query). Starts params at $1 = tenantId.
function buildWhere(tenantId: string, f: ContactsFilter): { clause: string; params: unknown[] } {
  const params: unknown[] = [tenantId];
  const parts: string[] = [`c."tenantId" = $1`, `c."deletedAt" IS NULL`];

  if (f.search && f.search.trim() !== "") {
    const q = f.search.trim();
    const digits = q.replace(/\D/g, "");
    params.push(`%${q}%`);
    const like = `$${params.length}`;
    const ors = [
      `c."firstName" ILIKE ${like}`,
      `c."lastName" ILIKE ${like}`,
      `c.email ILIKE ${like}`,
      `c.phone ILIKE ${like}`,
      `c."childName1" ILIKE ${like}`,
      `c."childName2" ILIKE ${like}`,
    ];
    if (digits.length >= 3) {
      params.push(`%${digits}%`);
      ors.push(`regexp_replace(c.phone, '\\D', '', 'g') ILIKE $${params.length}`);
    }
    parts.push(`(${ors.join(" OR ")})`);
  }

  if (f.leadSourceId) {
    params.push(f.leadSourceId);
    parts.push(`c."leadSourceId" = $${params.length}`);
  }
  if (f.assignedUserId) {
    params.push(f.assignedUserId);
    parts.push(`c."assignedUserId" = $${params.length}`);
  }
  if (f.stageName) {
    params.push(f.stageName);
    parts.push(
      `EXISTS (SELECT 1 FROM crm.crm_opportunity o2 JOIN crm.crm_stage s2 ON s2.id = o2."stageId"
               WHERE o2."contactId" = c.id AND o2."deletedAt" IS NULL AND s2.name = $${params.length})`,
    );
  }

  return { clause: parts.join(" AND "), params };
}

export async function getContacts(filter: ContactsFilter = {}): Promise<ContactsPage | null> {
  const tenantId = await resolveTenantId();
  if (!tenantId) return null;

  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 25));
  const skip = (page - 1) * pageSize;
  const sortDir = filter.sortDir === "asc" ? "ASC" : "DESC";
  const sortCol = filter.sortBy === "name" ? `c."firstName"` : `c."createdAt"`;

  const { clause, params } = buildWhere(tenantId, filter);

  const listParams = [...params, pageSize, skip];
  const listSql = `
    SELECT c.id,
           c."firstName" AS "firstName",
           c."lastName" AS "lastName",
           c.email AS email,
           c.phone AS phone,
           to_char(c."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS') AS "createdAt",
           ls.id AS "leadSourceId", ls.name AS "leadSourceName",
           au.id AS "assignedUserId", au.name AS "assignedUserName",
           st.name AS "stageName", st."shortCode" AS "stageShortCode", st.color AS "stageColor",
           COALESCE(tg.tags, '[]'::json) AS tags
      FROM crm.crm_contact c
      LEFT JOIN crm.crm_lead_source ls ON ls.id = c."leadSourceId"
      LEFT JOIN crm.crm_auth_user au ON au.id = c."assignedUserId"
      LEFT JOIN LATERAL (
        SELECT s.name, s."shortCode", s.color
          FROM crm.crm_opportunity o JOIN crm.crm_stage s ON s.id = o."stageId"
         WHERE o."contactId" = c.id AND o."deletedAt" IS NULL
         ORDER BY o."lastStageChangeAt" DESC LIMIT 1
      ) st ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color)) AS tags
          FROM crm.crm_contact_tag ctg JOIN crm.crm_tag t ON t.id = ctg."tagId"
         WHERE ctg."contactId" = c.id
      ) tg ON true
     WHERE ${clause}
     ORDER BY ${sortCol} ${sortDir}
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

  const countSql = `SELECT COUNT(*)::int AS n FROM crm.crm_contact c WHERE ${clause}`;

  const [listRes, countRes] = await Promise.all([
    queryCrmDb<{
      id: string; firstName: string; lastName: string | null; email: string | null; phone: string | null;
      createdAt: string; leadSourceId: string | null; leadSourceName: string | null;
      assignedUserId: string | null; assignedUserName: string | null;
      stageName: string | null; stageShortCode: string | null; stageColor: string | null;
      tags: Array<{ id: string; name: string; color: string }>;
    }>(listSql, listParams),
    queryCrmDb<{ n: number }>(countSql, params),
  ]);
  if (!listRes || !countRes) return null;

  const data: ContactRow[] = listRes.rows.map((r) => ({
    id: r.id,
    firstName: r.firstName,
    lastName: r.lastName,
    email: r.email,
    phone: r.phone,
    createdAt: r.createdAt,
    stage: r.stageName ? { name: r.stageName, shortCode: r.stageShortCode, color: r.stageColor ?? "blue" } : null,
    leadSource: r.leadSourceId ? { id: r.leadSourceId, name: r.leadSourceName ?? "" } : null,
    assignedUser: r.assignedUserId ? { id: r.assignedUserId, name: r.assignedUserName } : null,
    tags: Array.isArray(r.tags) ? r.tags : [],
  }));

  return { data, total: countRes.rows[0]?.n ?? 0, page, pageSize };
}

// ─── Reference data for the filter dropdowns ──────────────────────────────────

export interface ContactsMeta {
  stages: Array<{ name: string; shortCode: string | null }>;
  leadSources: Array<{ id: string; name: string }>;
  assignedUsers: Array<{ id: string; name: string | null }>;
}

export async function getContactsMeta(): Promise<ContactsMeta | null> {
  const tenantId = await resolveTenantId();
  if (!tenantId) return null;

  const [stages, sources, users] = await Promise.all([
    queryCrmDb<{ name: string; shortCode: string | null }>(
      `SELECT name, MIN("shortCode") AS "shortCode", MIN("order") AS ord
         FROM crm.crm_stage WHERE "tenantId" = $1 GROUP BY name ORDER BY ord ASC`,
      [tenantId],
    ),
    queryCrmDb<{ id: string; name: string }>(
      `SELECT id, name FROM crm.crm_lead_source WHERE "tenantId" = $1 ORDER BY name ASC`,
      [tenantId],
    ),
    queryCrmDb<{ id: string; name: string | null }>(
      `SELECT DISTINCT au.id, au.name
         FROM crm.crm_contact c JOIN crm.crm_auth_user au ON au.id = c."assignedUserId"
        WHERE c."tenantId" = $1 AND c."deletedAt" IS NULL
        ORDER BY au.name ASC NULLS LAST`,
      [tenantId],
    ),
  ]);
  if (!stages || !sources || !users) return null;

  return {
    stages: stages.rows.map((s) => ({ name: s.name, shortCode: s.shortCode })),
    leadSources: sources.rows,
    assignedUsers: users.rows,
  };
}
