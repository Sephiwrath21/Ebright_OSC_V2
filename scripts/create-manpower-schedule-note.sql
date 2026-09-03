-- Adds the per-slot remarks table for manpower scheduling.
-- Additive only: creates one new table + its indexes. Touches nothing existing.
CREATE TABLE IF NOT EXISTS manpower_schedule_note (
  note_id       SERIAL       PRIMARY KEY,
  date          DATE         NOT NULL,
  slot_id       INTEGER      NOT NULL,
  schedule_type VARCHAR(10)  NOT NULL DEFAULT 'planning',
  remark        TEXT         NOT NULL,
  updated_at    TIMESTAMP(6) NOT NULL DEFAULT now(),
  CONSTRAINT fk_msn_slot FOREIGN KEY (slot_id) REFERENCES slot(slot_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_msn_date_slot_type
  ON manpower_schedule_note (date, slot_id, schedule_type);

CREATE INDEX IF NOT EXISTS idx_msn_date
  ON manpower_schedule_note (date);
