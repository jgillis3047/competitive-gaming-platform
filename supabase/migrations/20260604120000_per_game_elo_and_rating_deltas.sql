-- Per-game ELO ratings + store rating deltas on completed challenges.

CREATE TABLE IF NOT EXISTS public.user_game_ratings (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  game_type text NOT NULL,
  rating integer NOT NULL DEFAULT 1000,
  games_played integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_type)
);

CREATE INDEX IF NOT EXISTS idx_user_game_ratings_game_rating
  ON public.user_game_ratings (game_type, rating DESC);

ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS winner_rating_delta integer,
  ADD COLUMN IF NOT EXISTS loser_rating_delta integer;

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
  v_gr1 int;
  v_gr2 int;
  v_e1 float;
  v_e2 float;
  v_k int := 32;
  v_s1 float;
  v_s2 float;
  v_new1 int;
  v_new2 int;
  v_d1 int;
  v_d2 int;
  v_game text;
BEGIN
  IF OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;
  IF NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;

  IF NEW.creator_team_id IS NOT NULL OR NEW.opponent_team_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO v_p1
  FROM public.challenge_players
  WHERE challenge_id = NEW.id AND role = 'creator'
  LIMIT 1;

  SELECT user_id INTO v_p2
  FROM public.challenge_players
  WHERE challenge_id = NEW.id AND role = 'opponent'
  LIMIT 1;

  IF v_p1 IS NULL OR v_p2 IS NULL THEN
    RETURN NEW;
  END IF;

  v_game := coalesce(nullif(trim(NEW.game_type), ''), 'unknown');

  SELECT coalesce(rating, 1000) INTO v_gr1 FROM public.profiles WHERE id = v_p1;
  SELECT coalesce(rating, 1000) INTO v_gr2 FROM public.profiles WHERE id = v_p2;

  INSERT INTO public.user_game_ratings (user_id, game_type, rating, games_played)
  VALUES (v_p1, v_game, 1000, 0)
  ON CONFLICT (user_id, game_type) DO NOTHING;

  INSERT INTO public.user_game_ratings (user_id, game_type, rating, games_played)
  VALUES (v_p2, v_game, 1000, 0)
  ON CONFLICT (user_id, game_type) DO NOTHING;

  SELECT coalesce(rating, 1000) INTO v_r1
  FROM public.user_game_ratings WHERE user_id = v_p1 AND game_type = v_game;

  SELECT coalesce(rating, 1000) INTO v_r2
  FROM public.user_game_ratings WHERE user_id = v_p2 AND game_type = v_game;

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

  v_d1 := round(v_k * (v_s1 - v_e1))::int;
  v_d2 := round(v_k * (v_s2 - v_e2))::int;

  v_new1 := greatest(100, least(3000, v_r1 + v_d1));
  v_new2 := greatest(100, least(3000, v_r2 + v_d2));

  UPDATE public.user_game_ratings
  SET rating = v_new1, games_played = games_played + 1, updated_at = now()
  WHERE user_id = v_p1 AND game_type = v_game;

  UPDATE public.user_game_ratings
  SET rating = v_new2, games_played = games_played + 1, updated_at = now()
  WHERE user_id = v_p2 AND game_type = v_game;

  -- Global rating uses overall profile ratings (separate pool from per-game)
  v_e1 := 1.0 / (1.0 + power(10.0, (v_gr2::float - v_gr1) / 400.0));
  v_e2 := 1.0 - v_e1;
  v_d1 := round(v_k * (v_s1 - v_e1))::int;
  v_d2 := round(v_k * (v_s2 - v_e2))::int;
  v_new1 := greatest(100, least(3000, v_gr1 + v_d1));
  v_new2 := greatest(100, least(3000, v_gr2 + v_d2));

  UPDATE public.profiles SET rating = v_new1 WHERE id = v_p1;
  UPDATE public.profiles SET rating = v_new2 WHERE id = v_p2;

  IF NEW.winner_user_id IS NULL THEN
    UPDATE public.challenges
    SET winner_rating_delta = NULL, loser_rating_delta = NULL
    WHERE id = NEW.id;
  ELSIF NEW.winner_user_id = v_p1 THEN
    UPDATE public.challenges
    SET winner_rating_delta = v_d1, loser_rating_delta = v_d2
    WHERE id = NEW.id;
  ELSE
    UPDATE public.challenges
    SET winner_rating_delta = v_d2, loser_rating_delta = v_d1
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;
