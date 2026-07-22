// Attendance sync: reads raw scans from ebright_hrfs.hikvision_attendance_all
// and materializes one normalized row per (employee_id, date) into
// hrfs.attendance_all.
//
// IMPORTANT: this module only ever SELECTs from the hikvision source — it
// never writes to it. All writes target attendance_all in the `hrfs` DB.
//
// Deliberately self-contained (its own pg pools, NO `import "server-only"`) so
// it can run both inside Next (POST /api/attendance/sync) and from a plain
// CLI (npm run backfill:attendance) without the server-only guard throwing.

import { Pool } from "pg";
import { remapStScan } from "./scan-identity";

// ── connection pools (cached across hot-reloads / repeated route calls) ──────
type PoolCache = { source?: Pool; target?: Pool };
const g = globalThis as unknown as { __attendanceSyncPools?: PoolCache };
const pools: PoolCache = (g.__attendanceSyncPools ??= {});

/** ebright_hrfs — the raw hikvision scan log (READ-ONLY here). */
function sourcePool(): Pool {
  if (pools.source) return pools.source;
  const connectionString = process.env.EBRIGHT_HRFS_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "EBRIGHT_HRFS_DATABASE_URL missing — points at the ebright_hrfs DB " +
        "(hikvision_attendance_all). Add it to .env and restart.",
    );
  }
  pools.source = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    keepAlive: true,
  });
  return pools.source;
}

/** hrfs — where attendance_all + the portal `employment` table live. */
function targetPool(): Pool {
  if (pools.target) return pools.target;
  const connectionString = process.env.HRFS_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("HRFS_DATABASE_URL missing — the target DB for attendance_all.");
  }
  pools.target = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    keepAlive: true,
  });
  return pools.target;
}

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS attendance_all (
  id              SERIAL       PRIMARY KEY,
  employee_id     VARCHAR(50)  NOT NULL,
  branch_id       INTEGER,
  date            DATE         NOT NULL,
  clock_in_time   TIME,
  clock_out_time  TIME,
  status          VARCHAR(20)  NOT NULL DEFAULT 'no record',
  synced_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_attendance_all_emp_date UNIQUE (employee_id, date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_all_date   ON attendance_all (date);
CREATE INDEX IF NOT EXISTS idx_attendance_all_branch ON attendance_all (branch_id);
`;

export interface SyncOptions {
  /** Only reprocess scans on/after this YYYY-MM-DD (inclusive). Omit = all time. */
  since?: string;
}

export interface SyncResult {
  scansRead: number;
  rowsUpserted: number;
  branchMatched: number;
  branchUnmatched: number;
  since: string | null;
  distinctEmployees: number;
  ranMs: number;
}

interface DayAgg {
  employeeId: string;
  date: string; // YYYY-MM-DD
  clockIn: string; // HH:MM:SS
  clockOut: string; // HH:MM:SS
}

/**
 * Rebuild/refresh attendance_all from the hikvision scan log. Idempotent:
 * upserts on (employee_id, date), so re-running (or narrowing with `since`)
 * is always safe.
 */
export async function syncAttendance(opts: SyncOptions = {}): Promise<SyncResult> {
  const startedAt = Date.now();
  const src = sourcePool();
  const tgt = targetPool();

  // 0) ensure the destination table exists.
  await tgt.query(CREATE_TABLE_SQL);

  // 1) employee_id -> branch_id map from the portal roster.
  const empRes = await tgt.query<{ employee_id: string; branch_id: number | null }>(
    `SELECT employee_id, branch_id FROM employment WHERE employee_id IS NOT NULL`,
  );
  const branchByEmp = new Map<string, number | null>();
  for (const r of empRes.rows) branchByEmp.set(String(r.employee_id).trim(), r.branch_id);

  // 2) raw scans. Extract date/time as TEXT in SQL to sidestep any driver
  //    timezone reinterpretation of `timestamp without time zone`.
  const params: unknown[] = [];
  let where = `person_id IS NOT NULL AND person_id <> '' AND person_id <> '0'`;
  if (opts.since) {
    params.push(opts.since);
    where += ` AND event_time >= $1::date`;
  }
  const scanRes = await src.query<{
    person_id: string;
    device_id: string | null;
    d: string;
    t: string;
  }>(
    `SELECT person_id,
            device_id,
            to_char(event_time, 'YYYY-MM-DD') AS d,
            to_char(event_time, 'HH24:MI:SS') AS t
       FROM public.hikvision_attendance_all
      WHERE ${where}
      ORDER BY event_time ASC`,
    params,
  );

  // 3) group to first-in / last-out per (effective employee_id, date).
  const byDay = new Map<string, DayAgg>();
  for (const row of scanRes.rows) {
    const { personId } = remapStScan(row.device_id, row.person_id);
    const employeeId = personId.trim();
    if (!employeeId) continue;
    const key = `${employeeId}|${row.d}`;
    const existing = byDay.get(key);
    if (!existing) {
      byDay.set(key, { employeeId, date: row.d, clockIn: row.t, clockOut: row.t });
    } else {
      if (row.t < existing.clockIn) existing.clockIn = row.t;
      if (row.t > existing.clockOut) existing.clockOut = row.t;
    }
  }

  // 4) upsert in chunks.
  const aggs = [...byDay.values()];
  let branchMatched = 0;
  let branchUnmatched = 0;
  const CHUNK = 300;
  for (let i = 0; i < aggs.length; i += CHUNK) {
    const chunk = aggs.slice(i, i + CHUNK);
    const values: string[] = [];
    const p: unknown[] = [];
    chunk.forEach((a, j) => {
      const branchId = branchByEmp.has(a.employeeId) ? branchByEmp.get(a.employeeId)! : null;
      if (branchByEmp.has(a.employeeId)) branchMatched++;
      else branchUnmatched++;
      // clock_in always present here → status 'present'.
      const status = a.clockIn ? "present" : "no record";
      const b = j * 6;
      values.push(`($${b + 1}, $${b + 2}, $${b + 3}::date, $${b + 4}::time, $${b + 5}::time, $${b + 6})`);
      p.push(a.employeeId, branchId, a.date, a.clockIn, a.clockOut, status);
    });
    await tgt.query(
      `INSERT INTO attendance_all
         (employee_id, branch_id, date, clock_in_time, clock_out_time, status)
       VALUES ${values.join(", ")}
       ON CONFLICT (employee_id, date) DO UPDATE SET
         branch_id      = EXCLUDED.branch_id,
         clock_in_time  = EXCLUDED.clock_in_time,
         clock_out_time = EXCLUDED.clock_out_time,
         status         = EXCLUDED.status,
         synced_at      = now()`,
      p,
    );
  }

  return {
    scansRead: scanRes.rows.length,
    rowsUpserted: aggs.length,
    branchMatched,
    branchUnmatched,
    since: opts.since ?? null,
    distinctEmployees: new Set(aggs.map((a) => a.employeeId)).size,
    ranMs: Date.now() - startedAt,
  };
}
