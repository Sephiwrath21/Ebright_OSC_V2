-- Per-day attendance lock for the Manpower Schedule (Update mode). One row per
-- (branch, date). A row's `locked` value OVERRIDES the automatic "past day is
-- locked" rule in both directions (lock a day early, or reopen a past day for a
-- correction). No row → fall back to the auto rule (date < today ⇒ locked).
CREATE TABLE IF NOT EXISTS manpower_attendance_day_lock (
  day_lock_id  SERIAL       PRIMARY KEY,
  branch_id    INT          NOT NULL,
  date         DATE         NOT NULL,
  locked       BOOLEAN      NOT NULL DEFAULT true,
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_madl_branch_date UNIQUE (branch_id, date),
  CONSTRAINT fk_madl_branch FOREIGN KEY (branch_id)
    REFERENCES branch (branch_id) ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX IF NOT EXISTS idx_madl_date ON manpower_attendance_day_lock (date);
