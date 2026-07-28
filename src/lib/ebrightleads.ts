import "server-only";
import { Pool, type QueryResult, type QueryResultRow } from "pg";

type PoolCacheEntry = { signature: string; pool: Pool };
const globalForPool = globalThis as unknown as {
  __ebrightleads_pool?: PoolCacheEntry;
};

function configSignature(): string {
  return [
    process.env.LEADS_DB_URL ?? "",
    process.env.EBRIGHTLEADS_HOST ?? "",
    process.env.EBRIGHTLEADS_PORT ?? "",
    process.env.EBRIGHTLEADS_USER ?? "",
    process.env.EBRIGHTLEADS_PASSWORD ?? "",
    process.env.EBRIGHTLEADS_DATABASE ?? "",
  ].join("|");
}

function makePool(): Pool {
  // Prefer a single connection string (LEADS_DB_URL); fall back to EBRIGHTLEADS_* parts.
  const url = process.env.LEADS_DB_URL;
  if (url) {
    return new Pool({
      connectionString: url,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  const host = process.env.EBRIGHTLEADS_HOST;
  const database = process.env.EBRIGHTLEADS_DATABASE;
  if (!host || !database) {
    throw new Error(
      `Leads DB not configured: set LEADS_DB_URL (or EBRIGHTLEADS_HOST/DATABASE). Restart dev server after editing .env.`,
    );
  }
  return new Pool({
    host,
    port: parseInt(process.env.EBRIGHTLEADS_PORT || "5433", 10),
    user: process.env.EBRIGHTLEADS_USER,
    password: process.env.EBRIGHTLEADS_PASSWORD,
    database,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
}

function getPool(): Pool {
  const signature = configSignature();
  const cached = globalForPool.__ebrightleads_pool;
  if (cached && cached.signature === signature) {
    return cached.pool;
  }
  if (cached) {
    cached.pool.end().catch(() => {});
  }
  const pool = makePool();
  if (process.env.NODE_ENV !== "production") {
    globalForPool.__ebrightleads_pool = { signature, pool };
  }
  return pool;
}

export async function queryEbrightLeads<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  try {
    return (await getPool().query(sql, params as never)) as QueryResult<T>;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[ebrightleads] Query error:", msg);
    throw new Error(`Failed to query ebrightleads_db: ${msg}`);
  }
}

export type StaffMovementFilter =
  | "onboarding"
  | "offboarding"
  | "recent_join"
  | "active";

export interface StaffMovementRow {
  id: number;
  name: string;
  position: string;
  department_branch: string;
  start_date: Date;
  end_date: Date | null;
}

export async function getStaffMovements(filters?: {
  type?: StaffMovementFilter;
}): Promise<StaffMovementRow[]> {
  let sql =
    "SELECT id, name, position, department_branch, start_date, end_date FROM hr_staff_movements WHERE 1=1";

  if (filters?.type === "onboarding") {
    sql += " AND start_date > NOW()";
  } else if (filters?.type === "offboarding") {
    sql += " AND end_date > NOW() AND end_date <= NOW() + INTERVAL '30 days'";
  } else if (filters?.type === "recent_join") {
    sql +=
      " AND start_date >= NOW() - INTERVAL '30 days' AND start_date <= NOW()";
  } else if (filters?.type === "active") {
    sql += " AND (end_date IS NULL OR end_date > NOW())";
  }

  sql += " ORDER BY start_date ASC LIMIT 1000";

  const result = await queryEbrightLeads<StaffMovementRow>(sql);
  return result.rows;
}

// ── Events (public.events in the leads DB) ───────────────────────────────────
export type EventStatus = "upcoming" | "ongoing" | "completed";

export interface DeptEvent {
  id: string;
  title: string;
  venue: string;
  date: string; // "DD Mon"
  tone: string;
  status: EventStatus;
}

const EVENT_TONE: Record<EventStatus, string> = {
  upcoming: "#185FA5",
  ongoing: "#0F6E56",
  completed: "#64748B",
};

/** All events from public.events, with status computed by date (DB CURRENT_DATE). */
export async function getEvents(): Promise<DeptEvent[]> {
  const { rows } = await queryEbrightLeads<{
    id: string;
    event_name: string;
    location: string | null;
    date_label: string;
    status: EventStatus;
  }>(`
    SELECT
      id,
      event_name,
      location,
      to_char(date_from, 'DD Mon') AS date_label,
      CASE
        WHEN date_to   < CURRENT_DATE THEN 'completed'
        WHEN date_from > CURRENT_DATE THEN 'upcoming'
        ELSE 'ongoing'
      END AS status
    FROM public.events
    ORDER BY
      CASE
        WHEN date_to   < CURRENT_DATE THEN 2  -- completed group
        WHEN date_from > CURRENT_DATE THEN 0  -- upcoming group
        ELSE 1                                -- ongoing group
      END,
      -- completed: most recent first (nearest day); others: soonest first
      CASE WHEN date_to < CURRENT_DATE THEN date_from END DESC NULLS LAST,
      date_from ASC
  `);

  return rows.map((r) => ({
    id: r.id,
    title: r.event_name,
    venue: r.location ?? "—",
    date: r.date_label.trim(),
    tone: EVENT_TONE[r.status],
    status: r.status,
  }));
}

export async function closePool(): Promise<void> {
  const cached = globalForPool.__ebrightleads_pool;
  if (cached) {
    await cached.pool.end();
    globalForPool.__ebrightleads_pool = undefined;
  }
}
