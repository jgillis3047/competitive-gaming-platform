-- AI review fields on court attempts + expand match_proofs sport_key

ALTER TABLE public.court_attempts
  ADD COLUMN IF NOT EXISTS ai_verdict text CHECK (ai_verdict IN ('approved', 'needs_review', 'rejected')),
  ADD COLUMN IF NOT EXISTS ai_confidence numeric,
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS ai_detected_score text,
  ADD COLUMN IF NOT EXISTS ai_flags jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.match_proofs DROP CONSTRAINT IF EXISTS match_proofs_sport_key_check;
ALTER TABLE public.match_proofs ADD CONSTRAINT match_proofs_sport_key_check
  CHECK (sport_key IS NULL OR sport_key IN (
    'basketball', 'golf', 'running', 'fitness', 'pickleball',
    'tennis', 'soccer', 'volleyball', 'frisbee', 'other'
  ));
