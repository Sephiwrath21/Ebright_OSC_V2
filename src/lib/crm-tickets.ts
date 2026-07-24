import "server-only";
import { queryCrmDb } from "@/lib/crm-db";

// ─────────────────────────────────────────────────────────────────────────────
// Read-only port of v1's ticket module (tkt_* tables in ebright_crm). Superadmin
// (super_admin) view — sees every ticket in the tenant. NO writes.
//
// The tkt module is an internal ops-request system: each ticket has a platform
// (Lead/Aone/ClickUp/Process Street/Others), a sub_type (the request kind, e.g.
// extend / delete_invoice / freeze_student), a submitter, a branch, a JSON
// `fields` payload (studentName, reason, …) and a status.
//
// v1 raw statuses → v2 display labels (kept so the existing UI badges work):
//   received    → Open
//   in_progress → In Progress
//   approved    → In Progress   (approved, not yet completed)
//   complete    → Resolved
//   rejected    → Closed
// ─────────────────────────────────────────────────────────────────────────────

export type TicketStatusLabel = "Open" | "In Progress" | "Resolved" | "Closed";

const STATUS_LABEL: Record<string, TicketStatusLabel> = {
  received: "Open",
  in_progress: "In Progress",
  approved: "In Progress",
  complete: "Resolved",
  rejected: "Closed",
};
// v2 tab label → the raw statuses it covers.
const LABEL_TO_RAW: Record<TicketStatusLabel, string[]> = {
  "Open": ["received"],
  "In Progress": ["in_progress", "approved"],
  "Resolved": ["complete"],
  "Closed": ["rejected"],
};

export function statusLabel(raw: string): TicketStatusLabel {
  return STATUS_LABEL[raw] ?? "Open";
}

// "freeze_student" → "Freeze Student"
export function humanize(s: string | null): string {
  if (!s) return "—";
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// tkt timestamps are `timestamp without time zone` (UTC-wall). Bind naive UTC.
function toNaiveUtc(d: Date): string {
  return d.toISOString().replace("T", " ").replace("Z", "");
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

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TicketRow {
  id: string;
  ticketNumber: string;
  subject: string;        // humanized sub_type
  subType: string | null;
  studentName: string | null;
  submitterName: string | null;
  platform: string;
  platformSlug: string | null;
  accentColor: string | null;
  branchName: string | null;
  branchCode: string | null;
  status: TicketStatusLabel;
  rawStatus: string;
  createdAt: string;      // ISO (UTC)
}

export interface TicketListResult {
  data: TicketRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<"All" | TicketStatusLabel, number>;
}

interface RawTicket {
  id: string; ticket_number: string; sub_type: string | null; status: string;
  fields: Record<string, unknown> | null; created_at: string;
  platform_name: string; platform_slug: string | null; accent_color: string | null;
  branch_name: string | null; branch_code: string | null;
  submitter_name: string | null;
}

function shapeRow(r: RawTicket): TicketRow {
  const student = r.fields && typeof r.fields.studentName === "string" ? (r.fields.studentName as string).trim() : null;
  return {
    id: r.id,
    ticketNumber: r.ticket_number,
    subject: humanize(r.sub_type),
    subType: r.sub_type,
    studentName: student || null,
    submitterName: r.submitter_name,
    platform: r.platform_name,
    platformSlug: r.platform_slug,
    accentColor: r.accent_color,
    branchName: r.branch_name,
    branchCode: r.branch_code,
    status: statusLabel(r.status),
    rawStatus: r.status,
    createdAt: new Date(`${r.created_at.replace(" ", "T")}Z`).toISOString(),
  };
}

const SELECT_COLS = `
  tk.id, tk.ticket_number, tk.sub_type, tk.status, tk.fields,
  to_char(tk.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at,
  p.name AS platform_name, p.slug AS platform_slug, p.accent_color,
  b.name AS branch_name, b.code AS branch_code,
  au.name AS submitter_name`;

const FROM_JOINS = `
  FROM crm.tkt_ticket tk
  JOIN crm.tkt_platform p ON p.id = tk.platform_id
  LEFT JOIN crm.tkt_branch b ON b.id = tk.branch_id
  LEFT JOIN crm.crm_auth_user au ON au.id = tk.user_id`;

// ─── List (My Tickets / Recent) ──────────────────────────────────────────────

export async function getTickets(opts: {
  status?: string; platformId?: string; branchId?: string; search?: string;
  page?: number; pageSize?: number;
}): Promise<TicketListResult | null> {
  const tenantId = await resolveTenantId();
  if (!tenantId) return null;

  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, opts.pageSize ?? 50));

  // Base filter (platform/branch/search) — NO status. Reused for the tab counts.
  const baseParams: unknown[] = [tenantId];
  const baseFilters = [`tk.tenant_id = $1`];
  if (opts.platformId) { baseParams.push(opts.platformId); baseFilters.push(`tk.platform_id = $${baseParams.length}`); }
  if (opts.branchId) { baseParams.push(opts.branchId); baseFilters.push(`tk.branch_id = $${baseParams.length}`); }
  if (opts.search?.trim()) {
    baseParams.push(`%${opts.search.trim()}%`);
    const like = `$${baseParams.length}`;
    baseFilters.push(`(tk.ticket_number ILIKE ${like} OR au.name ILIKE ${like} OR tk.fields->>'studentName' ILIKE ${like})`);
  }
  const baseWhere = baseFilters.join(" AND ");

  // Tab counts across the base scope (ignoring the active status tab).
  const countRes = await queryCrmDb<{ status: string; n: string }>(
    `SELECT tk.status, COUNT(*)::int AS n ${FROM_JOINS} WHERE ${baseWhere} GROUP BY tk.status`,
    baseParams,
  );
  const counts: Record<"All" | TicketStatusLabel, number> = { All: 0, "Open": 0, "In Progress": 0, "Resolved": 0, "Closed": 0 };
  for (const r of countRes?.rows ?? []) {
    const l = statusLabel(r.status);
    counts[l] += Number(r.n);
    counts.All += Number(r.n);
  }

  // Add the status-tab filter for the total + page query.
  const params = baseParams.slice();
  const filters = baseFilters.slice();
  const label = opts.status && opts.status !== "All" ? (opts.status as TicketStatusLabel) : null;
  if (label && LABEL_TO_RAW[label]) {
    params.push(LABEL_TO_RAW[label]);
    filters.push(`tk.status = ANY($${params.length}::text[])`);
  }
  const where = filters.join(" AND ");

  const totalRes = await queryCrmDb<{ n: string }>(
    `SELECT COUNT(*)::int AS n ${FROM_JOINS} WHERE ${where}`,
    params,
  );
  const total = Number(totalRes?.rows[0]?.n ?? 0);

  const listParams = [...params, pageSize, (page - 1) * pageSize];
  const rowsRes = await queryCrmDb<RawTicket>(
    `SELECT ${SELECT_COLS} ${FROM_JOINS} WHERE ${where}
      ORDER BY tk.created_at DESC
      LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );

  return {
    data: (rowsRes?.rows ?? []).map(shapeRow),
    total, page, pageSize, counts,
  };
}

// ─── Dashboard aggregates ────────────────────────────────────────────────────

export interface TicketDashboard {
  totals: { all: number; open: number; inProgress: number; resolved: number; closed: number };
  avgResolutionHours: number;
  categories: Array<{ label: string; subType: string; count: number; pct: number }>;
  byPlatform: Array<{ id: string; name: string; slug: string | null; accent: string | null; count: number }>;
  recent: TicketRow[];
}

export async function getTicketDashboard(): Promise<TicketDashboard | null> {
  const tenantId = await resolveTenantId();
  if (!tenantId) return null;

  const [statusRes, catRes, platRes, avgRes, recentRes] = await Promise.all([
    queryCrmDb<{ status: string; n: string }>(
      `SELECT status, COUNT(*)::int AS n FROM crm.tkt_ticket WHERE tenant_id = $1 GROUP BY status`,
      [tenantId],
    ),
    queryCrmDb<{ sub_type: string | null; n: string }>(
      `SELECT sub_type, COUNT(*)::int AS n FROM crm.tkt_ticket WHERE tenant_id = $1 GROUP BY sub_type ORDER BY n DESC LIMIT 6`,
      [tenantId],
    ),
    queryCrmDb<{ id: string; name: string; slug: string | null; accent_color: string | null; n: string }>(
      `SELECT p.id, p.name, p.slug, p.accent_color, COUNT(tk.id)::int AS n
         FROM crm.tkt_platform p
         LEFT JOIN crm.tkt_ticket tk ON tk.platform_id = p.id AND tk.tenant_id = $1
        WHERE p.tenant_id = $1
        GROUP BY p.id ORDER BY n DESC`,
      [tenantId],
    ),
    queryCrmDb<{ hours: string | null }>(
      `SELECT AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600.0) AS hours
         FROM crm.tkt_ticket WHERE tenant_id = $1 AND status = 'complete' AND completed_at IS NOT NULL`,
      [tenantId],
    ),
    queryCrmDb<RawTicket>(
      `SELECT ${SELECT_COLS} ${FROM_JOINS} WHERE tk.tenant_id = $1 ORDER BY tk.created_at DESC LIMIT 8`,
      [tenantId],
    ),
  ]);

  const byStatus = new Map((statusRes?.rows ?? []).map((r) => [r.status, Number(r.n)]));
  const all = Array.from(byStatus.values()).reduce((s, n) => s + n, 0);
  const totals = {
    all,
    open: byStatus.get("received") ?? 0,
    inProgress: (byStatus.get("in_progress") ?? 0) + (byStatus.get("approved") ?? 0),
    resolved: byStatus.get("complete") ?? 0,
    closed: byStatus.get("rejected") ?? 0,
  };

  const catTotal = (catRes?.rows ?? []).reduce((s, r) => s + Number(r.n), 0) || 1;
  const categories = (catRes?.rows ?? []).map((r) => ({
    label: humanize(r.sub_type),
    subType: r.sub_type ?? "",
    count: Number(r.n),
    pct: Math.round((Number(r.n) / catTotal) * 100),
  }));

  const byPlatform = (platRes?.rows ?? []).map((r) => ({
    id: r.id, name: r.name, slug: r.slug, accent: r.accent_color, count: Number(r.n),
  }));

  const avgResolutionHours = Number(avgRes?.rows[0]?.hours ?? 0) || 0;
  const recent = (recentRes?.rows ?? []).map(shapeRow);

  return { totals, avgResolutionHours, categories, byPlatform, recent };
}

// ─── Platforms page ──────────────────────────────────────────────────────────

export interface PlatformRow {
  id: string; name: string; slug: string | null; code: string | null;
  accent: string | null; tickets: number;
}

export async function getPlatforms(): Promise<PlatformRow[] | null> {
  const tenantId = await resolveTenantId();
  if (!tenantId) return null;
  const res = await queryCrmDb<{ id: string; name: string; slug: string | null; code: string | null; accent_color: string | null; n: string }>(
    `SELECT p.id, p.name, p.slug, p.code, p.accent_color, COUNT(tk.id)::int AS n
       FROM crm.tkt_platform p
       LEFT JOIN crm.tkt_ticket tk ON tk.platform_id = p.id AND tk.tenant_id = $1
      WHERE p.tenant_id = $1
      GROUP BY p.id ORDER BY p.code ASC NULLS LAST, p.name ASC`,
    [tenantId],
  );
  if (!res) return null;
  return res.rows.map((r) => ({
    id: r.id, name: r.name, slug: r.slug, code: r.code, accent: r.accent_color, tickets: Number(r.n),
  }));
}

// ─── Reference data (New Ticket dropdowns) ───────────────────────────────────

export interface TicketRefData {
  platforms: Array<{ id: string; name: string; slug: string | null; code: string | null; accent: string | null }>;
  branches: Array<{ id: string; name: string; code: string | null; branchNumber: string | null }>;
  subTypes: string[];
}

export async function getTicketRefData(): Promise<TicketRefData | null> {
  const tenantId = await resolveTenantId();
  if (!tenantId) return null;
  const [plat, branch, sub] = await Promise.all([
    queryCrmDb<{ id: string; name: string; slug: string | null; code: string | null; accent_color: string | null }>(
      `SELECT id, name, slug, code, accent_color FROM crm.tkt_platform WHERE tenant_id = $1 ORDER BY code ASC NULLS LAST`,
      [tenantId],
    ),
    queryCrmDb<{ id: string; name: string; code: string | null; branch_number: string | null }>(
      `SELECT id, name, code, branch_number FROM crm.tkt_branch WHERE tenant_id = $1 ORDER BY branch_number ASC NULLS LAST`,
      [tenantId],
    ),
    queryCrmDb<{ sub_type: string | null }>(
      `SELECT DISTINCT sub_type FROM crm.tkt_ticket WHERE tenant_id = $1 AND sub_type IS NOT NULL ORDER BY sub_type ASC`,
      [tenantId],
    ),
  ]);
  return {
    platforms: (plat?.rows ?? []).map((p) => ({ id: p.id, name: p.name, slug: p.slug, code: p.code, accent: p.accent_color })),
    branches: (branch?.rows ?? []).map((b) => ({ id: b.id, name: b.name, code: b.code, branchNumber: b.branch_number })),
    subTypes: (sub?.rows ?? []).map((s) => s.sub_type!).filter(Boolean),
  };
}

// ─── Opportunities (status kanban) ───────────────────────────────────────────

export interface TicketKanbanColumn {
  key: string; label: string; count: number; cards: TicketRow[];
}
export const TICKET_KANBAN_STATUSES: Array<{ key: string; label: string }> = [
  { key: "received", label: "Received" },
  { key: "in_progress", label: "In Progress" },
  { key: "approved", label: "Approved" },
  { key: "complete", label: "Complete" },
  { key: "rejected", label: "Rejected" },
];
const KANBAN_CARDS_PER_COL = 40;

export async function getTicketKanban(): Promise<{ columns: TicketKanbanColumn[]; total: number } | null> {
  const tenantId = await resolveTenantId();
  if (!tenantId) return null;

  const countRes = await queryCrmDb<{ status: string; n: string }>(
    `SELECT status, COUNT(*)::int AS n FROM crm.tkt_ticket WHERE tenant_id = $1 GROUP BY status`,
    [tenantId],
  );
  const countByStatus = new Map((countRes?.rows ?? []).map((r) => [r.status, Number(r.n)]));

  // Capped cards per status via ROW_NUMBER window.
  const cardsRes = await queryCrmDb<RawTicket & { rn: number }>(
    `WITH ranked AS (
       SELECT tk.*, ROW_NUMBER() OVER (PARTITION BY tk.status ORDER BY tk.created_at DESC) AS rn
         FROM crm.tkt_ticket tk WHERE tk.tenant_id = $1
     )
     SELECT ${SELECT_COLS}, tk.rn AS rn
       FROM ranked tk
       JOIN crm.tkt_platform p ON p.id = tk.platform_id
       LEFT JOIN crm.tkt_branch b ON b.id = tk.branch_id
       LEFT JOIN crm.crm_auth_user au ON au.id = tk.user_id
      WHERE tk.rn <= $2
      ORDER BY tk.created_at DESC`,
    [tenantId, KANBAN_CARDS_PER_COL],
  );
  const cardsByStatus = new Map<string, TicketRow[]>();
  for (const r of cardsRes?.rows ?? []) {
    const arr = cardsByStatus.get(r.status) ?? [];
    arr.push(shapeRow(r));
    cardsByStatus.set(r.status, arr);
  }

  let total = 0;
  const columns = TICKET_KANBAN_STATUSES.map((s) => {
    const count = countByStatus.get(s.key) ?? 0;
    total += count;
    return { key: s.key, label: s.label, count, cards: cardsByStatus.get(s.key) ?? [] };
  });
  return { columns, total };
}
