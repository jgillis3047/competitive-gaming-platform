-- RLS for per-game ratings (readable by all authenticated users).

ALTER TABLE public.user_game_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_game_ratings_select ON public.user_game_ratings;
CREATE POLICY user_game_ratings_select ON public.user_game_ratings
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS user_game_ratings_select_anon ON public.user_game_ratings;
CREATE POLICY user_game_ratings_select_anon ON public.user_game_ratings
  FOR SELECT TO anon
  USING (true);
