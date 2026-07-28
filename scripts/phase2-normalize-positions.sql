-- Phase 2: normalize manpower positions.
-- Replaces the per-week-cloned branch_duty_position with:
--   branch_position       (stable seat definitions, one per branch)
--   branch_position_week  (per-week activation, so seat counts can vary by week)
-- Wipes SCHEDULE data only (test data). KEEPS time-slot settings
-- (branch_operating_day, slot). Coordinated with the new application code.
BEGIN;

-- 1. Drop the old FK so we can rebuild manpower_schedule's position reference.
ALTER TABLE manpower_schedule DROP CONSTRAINT IF EXISTS fk_mps_position;

-- 2. Wipe schedule test data (settings tables untouched).
TRUNCATE TABLE manpower_schedule_note RESTART IDENTITY;
TRUNCATE TABLE manpower_cost_report   RESTART IDENTITY;
TRUNCATE TABLE schedule_period_status RESTART IDENTITY;
TRUNCATE TABLE manpower_schedule      RESTART IDENTITY;

-- 3. Retire the old positions table.
DROP TABLE IF EXISTS branch_duty_position;

-- 4. Stable position definitions (one row per seat per branch).
CREATE TABLE branch_position (
  branch_position_id SERIAL       PRIMARY KEY,
  branch_id          INTEGER      NOT NULL,
  position_type      VARCHAR(20)  NOT NULL,
  seat_number        INTEGER      NOT NULL,
  position_label     VARCHAR(50)  NOT NULL,
  display_order      INTEGER      NOT NULL DEFAULT 0,
  CONSTRAINT fk_bp_branch FOREIGN KEY (branch_id) REFERENCES branch(branch_id),
  CONSTRAINT uq_bp_branch_type_seat UNIQUE (branch_id, position_type, seat_number)
);
CREATE INDEX idx_bp_branch ON branch_position (branch_id);

-- 5. Per-week activation of a definition (drives per-week seat counts).
CREATE TABLE branch_position_week (
  branch_position_week_id SERIAL  PRIMARY KEY,
  branch_position_id      INTEGER NOT NULL,
  week_start_date         DATE    NOT NULL,
  is_active               BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT fk_bpw_position FOREIGN KEY (branch_position_id)
    REFERENCES branch_position(branch_position_id) ON DELETE CASCADE,
  CONSTRAINT uq_bpw_position_week UNIQUE (branch_position_id, week_start_date)
);
CREATE INDEX idx_bpw_week ON branch_position_week (week_start_date);

-- 6. Repoint manpower_schedule.position_id at the stable definitions.
ALTER TABLE manpower_schedule
  ADD CONSTRAINT fk_mps_position FOREIGN KEY (position_id)
    REFERENCES branch_position(branch_position_id);

COMMIT;
