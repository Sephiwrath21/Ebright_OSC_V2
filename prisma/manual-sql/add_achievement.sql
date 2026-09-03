-- New table: achievement — Active stage's own "Achievement" tab (+ Employee
-- Record's Active Employment > "Cert./ Achievement" tab, same concept).
-- Repeatable — an employee can have many achievements over their tenure —
-- so this follows leave_request/employee_rate_history's convention (own
-- serial PK, user_id NOT unique) rather than resume/medical_check's 1:1
-- pattern. Confirmed via the mock's own "+ Add certificate or achievement"
-- RecordTable pattern (both active_achievement.html and the pre-existing
-- CertPanel placeholder).
-- attachment_file_id follows resume.resume_file_id's exact pattern:
-- nullable varchar(128) Google Drive file-ID reference.
-- Project has no prisma/migrations folder (schema-first), so this is applied
-- manually and kept here as the record. Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS achievement (
  achievement_id    SERIAL PRIMARY KEY,
  user_id           INTEGER NOT NULL,
  name              VARCHAR(255),
  date              DATE,
  attachment_file_id VARCHAR(128)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_achievement_user'
  ) THEN
    ALTER TABLE achievement
      ADD CONSTRAINT fk_achievement_user
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_achievement_user'
  ) THEN
    CREATE INDEX idx_achievement_user ON achievement(user_id);
  END IF;
END $$;
