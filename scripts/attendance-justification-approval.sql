-- Adds an approval workflow to attendance_justification (ebright_hrfs / operational HRFS).
-- Staff can now submit their own justifications (status='pending', source='staff');
-- HR/HOD approve or reject them. Existing HR-entered rows are treated as already
-- approved so nothing that was justified before this change silently un-justifies.
--
-- Run against the operational HRFS DB (EBRIGHT_HRFS_URL / HRFS_DATABASE_URL),
-- the same DB the justification server actions already write to.

BEGIN;

ALTER TABLE public.attendance_justification
  ADD COLUMN IF NOT EXISTS status      text        NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS source      text        NOT NULL DEFAULT 'hr',
  ADD COLUMN IF NOT EXISTS reviewed_by text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text;

-- Every pre-existing row was entered by HR → already approved.
UPDATE public.attendance_justification
   SET status = 'approved'
 WHERE status IS NULL OR status = '';
UPDATE public.attendance_justification
   SET source = 'hr'
 WHERE source IS NULL OR source = '';

-- Constrain the status vocabulary.
ALTER TABLE public.attendance_justification
  DROP CONSTRAINT IF EXISTS attendance_justification_status_chk;
ALTER TABLE public.attendance_justification
  ADD CONSTRAINT attendance_justification_status_chk
  CHECK (status IN ('pending', 'approved', 'rejected'));

-- HR's approval queue filters by status; this keeps it quick.
CREATE INDEX IF NOT EXISTS attendance_justification_status_idx
  ON public.attendance_justification (status, just_date);

COMMIT;

-- Verify:
--   SELECT status, source, count(*)
--     FROM public.attendance_justification
--    GROUP BY 1, 2 ORDER BY 1, 2;
