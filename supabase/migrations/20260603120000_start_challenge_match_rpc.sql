-- Allow any challenge participant to move accepted -> in-progress (Play Game).

CREATE OR REPLACE FUNCTION public.start_challenge_match(p_challenge_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT c.status INTO v_status
  FROM public.challenges c
  WHERE c.id = p_challenge_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challenge not found';
  END IF;

  IF v_status = 'in-progress' THEN
    RETURN p_challenge_id;
  END IF;

  IF v_status IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'Challenge is not ready to start (status=%)', v_status;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.challenge_players cp
    WHERE cp.challenge_id = p_challenge_id
      AND cp.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'You are not a participant in this challenge';
  END IF;

  UPDATE public.challenges
  SET
    status = 'in-progress',
    updated_at = now(),
    expires_at = now() + interval '30 minutes'
  WHERE id = p_challenge_id;

  RETURN p_challenge_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_challenge_match(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_challenge_match(uuid) TO authenticated;

-- Belt-and-suspenders: participants may update challenges they play in.
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
  OR status = ANY (ARRAY['accepted'::text, 'in-progress'::text, 'completed'::text])
);
