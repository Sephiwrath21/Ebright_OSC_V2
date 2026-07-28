-- Manual attendance for the Manpower Schedule (Update mode). Fresh table in the
-- portal DB (hrfs). Keyed by (date, profile_id) to match manpower_schedule.
-- Completely separate from the biometric attendance_all sync.
CREATE TABLE IF NOT EXISTS manpower_schedule_attendance (
  attendance_id  SERIAL       PRIMARY KEY,
  date           DATE         NOT NULL,
  profile_id     INT          NOT NULL,
  branch_id      INT          NOT NULL,
  status         VARCHAR(10)  NOT NULL,          -- 'Present' | 'Absent' | 'Late'
  locked         BOOLEAN      NOT NULL DEFAULT false,
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_msa_date_profile UNIQUE (date, profile_id),
  CONSTRAINT fk_msa_profile FOREIGN KEY (profile_id)
    REFERENCES user_profile (profile_id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT fk_msa_branch FOREIGN KEY (branch_id)
    REFERENCES branch (branch_id) ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX IF NOT EXISTS idx_msa_date   ON manpower_schedule_attendance (date);
CREATE INDEX IF NOT EXISTS idx_msa_branch ON manpower_schedule_attendance (branch_id);
