-- attendance_all — normalized daily attendance, one row per (employee_id, date).
--
-- Derived from ebright_hrfs.hikvision_attendance_all (READ-ONLY source; this
-- table lives in the `hrfs` DB and never writes back to the source). Populated
-- by src/lib/sync-attendance.ts, exposed as:
--   • POST /api/attendance/sync   (schedulable)
--   • npm run backfill:attendance (manual CLI)
--
-- Join chain: hikvision.person_id --(ST remap)--> employee_id
--             employee_id = employment.employee_id --> employment.branch_id
--
-- The sync also runs this DDL (CREATE TABLE IF NOT EXISTS) so it is
-- self-bootstrapping; this file is kept for reference / manual apply.

CREATE TABLE IF NOT EXISTS attendance_all (
  id              SERIAL       PRIMARY KEY,
  employee_id     VARCHAR(50)  NOT NULL,          -- = hikvision person_id (post ST remap)
  branch_id       INTEGER,                        -- from employment match; NULL if unmatched
  date            DATE         NOT NULL,
  clock_in_time   TIME,                           -- first scan of the day
  clock_out_time  TIME,                           -- last scan of the day
  status          VARCHAR(20)  NOT NULL DEFAULT 'no record',  -- 'present' | 'no record'
  synced_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_attendance_all_emp_date UNIQUE (employee_id, date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_all_date   ON attendance_all (date);
CREATE INDEX IF NOT EXISTS idx_attendance_all_branch ON attendance_all (branch_id);
