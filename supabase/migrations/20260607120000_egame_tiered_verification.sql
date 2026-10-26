-- Tiered e-game result verification: winner reports, loser confirms/disputes, auto-confirm after deadline.

ALTER TABLE public.challenges
  DROP CONSTRAINT IF EXISTS challenges_status_check;

ALTER TABLE public.challenges
  ADD CONSTRAINT challenges_status_check
  CHECK (status = ANY (ARRAY[
    'open'::text,
    'accepted'::text,
    'in-progress'::text,
    'checked-in'::text,
    'awaiting_confirmation'::text,
    'completed'::text,
    'cancelled'::text,
    'disputed'::text
  ]));

ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS pending_winner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS result_reported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS result_reported_at timestamptz,
  ADD COLUMN IF NOT EXISTS result_confirm_by timestamptz,
  ADD COLUMN IF NOT EXISTS result_proof_path text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS match_dispute_count integer NOT NULL DEFAULT 0;

-- Participants may set awaiting_confirmation / disputed during e-game flows.
DROP POLICY IF EXISTS "challenges_update_policy" ON public.challenges;

CREATE POLICY "challenges_update_policy" ON public.challenges
FOR UPDATE TO authenticated
USING (
  auth.uid() = created_by
  OR auth.uid() = winner_user_id
  OR status = 'open'::text
  OR EXISTS (
    SELECT 1
    FROM public.challenge_players cp
    WHERE cp.challenge_id = challenges.id
      AND cp.user_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() = created_by
  OR auth.uid() = winner_user_id
  OR EXISTS (
    SELECT 1
    FROM public.challenge_players cp
    WHERE cp.challenge_id = challenges.id
      AND cp.user_id = auth.uid()
  )
  OR status = ANY (ARRAY[
    'accepted'::text,
    'in-progress'::text,
    'checked-in'::text,
    'awaiting_confirmation'::text,
    'completed'::text,
    'disputed'::text
  ])
);
