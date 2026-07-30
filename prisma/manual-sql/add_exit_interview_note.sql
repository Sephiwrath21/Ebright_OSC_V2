-- New table: exit_interview_note — Exit stage's own "Exit Interview Notes"
-- tab (Interview Date/Interviewer/Primary Reason for Leaving/Feedback-
-- Notes). Singleton — one row per user_id (resume/medical_check/probation-
-- style 1:1 relation), confirmed via the mock's single-form-only rendering
-- (no "+Add"/history list, unlike Achievement/Promotion/Transfer/Training).
-- No attachment field — matches the mock, which has none for this tab.
-- reason is constrained to career/compensation/relocation/personal/other
-- via a CHECK constraint — the mock's own <select> option set.
-- Project has no prisma/migrations folder (schema-first), so this is applied
-- manually and kept here as the record. Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS exit_interview_note (
  exit_interview_note_id SERIAL PRIMARY KEY,
  user_id                 INTEGER NOT NULL UNIQUE,
  date                    DATE,
  interviewer             VARCHAR(100),
  reason                  VARCHAR(20),
  note                    TEXT
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_exit_interview_note_user'
  ) THEN
    ALTER TABLE exit_interview_note
      ADD CONSTRAINT fk_exit_interview_note_user
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_exit_interview_note_reason'
  ) THEN
    ALTER TABLE exit_interview_note
      ADD CONSTRAINT chk_exit_interview_note_reason
      CHECK (reason IS NULL OR reason IN ('career', 'compensation', 'relocation', 'personal', 'other'));
  END IF;
END $$;
