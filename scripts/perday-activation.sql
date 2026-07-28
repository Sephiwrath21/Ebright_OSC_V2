-- Per-day columns: replace per-week activation with per-DATE activation.
-- Seat definitions (branch_position) and assignments (manpower_schedule) are
-- unaffected. Fresh test data, so no activation data to preserve.
BEGIN;

DROP TABLE IF EXISTS branch_position_week;

CREATE TABLE branch_position_day (
  branch_position_day_id SERIAL  PRIMARY KEY,
  branch_position_id     INTEGER NOT NULL,
  date                   DATE    NOT NULL,
  is_active              BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT fk_bpd_position FOREIGN KEY (branch_position_id)
    REFERENCES branch_position(branch_position_id) ON DELETE CASCADE,
  CONSTRAINT uq_bpd_position_date UNIQUE (branch_position_id, date)
);
CREATE INDEX idx_bpd_date ON branch_position_day (date);

COMMIT;
