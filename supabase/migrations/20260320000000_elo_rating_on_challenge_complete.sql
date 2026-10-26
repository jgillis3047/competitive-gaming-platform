-- Update both players' Elo rating when a 1v1 challenge completes.
-- Uses standard Elo: K=32, expected score E = 1/(1+10^((R_opp-R_self)/400))
-- Winner gains, loser loses; tie gives both 0.5 actual score.
-- Runs on first transition to status='completed'; ignores subsequent updates.

CREATE OR REPLACE FUNCTION public.update_elo_on_challenge_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p1 uuid;
  v_p2 uuid;
  v_r1 int;
  v_r2 int;
  v_e1 float;
  v_e2 float;
  v_k int := 32;
  v_s1 float;
  v_s2 float;
  v_new1 int;
  v_new2 int;
BEGIN
  IF OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;
  IF NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;

  -- Only 1v1 challenges (no team vs team)
  IF NEW.creator_team_id IS NOT NULL OR NEW.opponent_team_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT min(user_id), max(user_id) INTO v_p1, v_p2
  FROM public.challenge_players
  WHERE challenge_id = NEW.id;

  IF v_p1 IS NULL OR v_p2 IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(rating, 1000) INTO v_r1 FROM public.profiles WHERE id = v_p1;
  SELECT coalesce(rating, 1000) INTO v_r2 FROM public.profiles WHERE id = v_p2;

  v_e1 := 1.0 / (1.0 + power(10.0, (v_r2::float - v_r1) / 400.0));
  v_e2 := 1.0 - v_e1;

  IF NEW.winner_user_id IS NULL THEN
    v_s1 := 0.5;
    v_s2 := 0.5;
  ELSIF NEW.winner_user_id = v_p1 THEN
    v_s1 := 1.0;
    v_s2 := 0.0;
  ELSE
    v_s1 := 0.0;
    v_s2 := 1.0;
  END IF;

  v_new1 := greatest(100, least(3000, v_r1 + round(v_k * (v_s1 - v_e1))::int));
  v_new2 := greatest(100, least(3000, v_r2 + round(v_k * (v_s2 - v_e2))::int));

  UPDATE public.profiles SET rating = v_new1, updated_at = now() WHERE id = v_p1;
  UPDATE public.profiles SET rating = v_new2, updated_at = now() WHERE id = v_p2;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_challenge_completed_elo ON public.challenges;
CREATE TRIGGER on_challenge_completed_elo
  AFTER UPDATE ON public.challenges
  FOR EACH ROW
  WHEN (
    OLD.status IS DISTINCT FROM NEW.status
    AND NEW.status = 'completed'
  )
  EXECUTE FUNCTION public.update_elo_on_challenge_complete();
