-- Adds employment.offer_letter_file_id — backs Pre stage's Personal Info
-- "Signed Offer Letter" upload field with a real Google Drive file (same
-- convention as resume.resume_file_id/cv_file_id), replacing the old
-- PlaceholderUploadField (session-only, nothing persisted).
-- Idempotent — safe to re-run.

ALTER TABLE employment ADD COLUMN IF NOT EXISTS offer_letter_file_id VARCHAR(128);
