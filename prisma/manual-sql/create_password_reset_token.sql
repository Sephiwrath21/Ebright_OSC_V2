-- Password reset tokens for the /forgot-password flow.
-- Project has no prisma/migrations folder (schema-first), so this table is
-- applied manually and kept here as the record. Idempotent — safe to re-run.
--
-- Only the SHA-256 hash of the token is stored: a leaked DB dump must not hand
-- over working reset links. used_at makes a token single-use; rows are kept
-- after use so a reset is auditable.

CREATE TABLE IF NOT EXISTS password_reset_token (
  token_id     SERIAL PRIMARY KEY,
  user_id      INTEGER      NOT NULL,
  token_hash   VARCHAR(64)  NOT NULL,
  expires_at   TIMESTAMPTZ  NOT NULL,
  used_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  requested_ip VARCHAR(64)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_password_reset_token_hash
  ON password_reset_token (token_hash);

CREATE INDEX IF NOT EXISTS idx_password_reset_user
  ON password_reset_token (user_id);

CREATE INDEX IF NOT EXISTS idx_password_reset_expires
  ON password_reset_token (expires_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_password_reset_user'
  ) THEN
    ALTER TABLE password_reset_token
      ADD CONSTRAINT fk_password_reset_user
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;
