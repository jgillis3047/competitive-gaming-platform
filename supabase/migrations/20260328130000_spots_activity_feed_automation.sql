-- Live copy for Spots tab + automated feed posts for court podium finishes.
-- Also: user_badges table for persisting earned keys (badge feed sync uses it).

-- ---- user_badges (persist earned achievement keys) ----
CREATE TABLE IF NOT EXISTS public.user_badges (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_key TEXT NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_key)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user ON public.user_badges(user_id);

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_badges_select_all" ON public.user_badges;
CREATE POLICY "user_badges_select_all" ON public.user_badges FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "user_badges_insert_own" ON public.user_badges;
CREATE POLICY "user_badges_insert_own" ON public.user_badges FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ---- Internal: insert feed post as the subject user (bypasses RLS) ----
CREATE OR REPLACE FUNCTION public.insert_automated_feed_post(
  p_user_id UUID,
  p_body TEXT,
  p_payload JSONB,
  p_kind TEXT DEFAULT 'highlight'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.posts (user_id, body, payload, kind, visibility, challenge_id, parent_post_id)
  VALUES (
    p_user_id,
    COALESCE(NULLIF(trim(p_body), ''), ' '),
    COALESCE(p_payload, '{}'::jsonb),
    COALESCE(NULLIF(trim(p_kind), ''), 'highlight'),
    'public',
    NULL,
    NULL
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_automated_feed_post(UUID, TEXT, JSONB, TEXT) FROM PUBLIC;

-- ---- Podium feed post after court attempt (rank 1–3) ----
CREATE OR REPLACE FUNCTION public.notify_court_podium_from_attempt(p_row public.court_attempts)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_higher BOOLEAN;
  v_rank BIGINT;
  v_court_name TEXT;
  v_record_title TEXT;
  v_body TEXT;
  v_payload JSONB;
  medal TEXT;
BEGIN
  SELECT crt.higher_is_better INTO v_higher FROM public.court_record_types crt WHERE crt.slug = p_row.record_type_slug;
  IF v_higher IS NULL THEN
    RETURN;
  END IF;

  WITH user_bests AS (
    SELECT
      ca.user_id,
      CASE WHEN v_higher THEN MAX(ca.score_value) ELSE MIN(ca.score_value) END AS best_score
    FROM public.court_attempts ca
    WHERE ca.court_id = p_row.court_id AND ca.record_type_slug = p_row.record_type_slug
    GROUP BY ca.user_id
  ),
  ranked AS (
    SELECT
      ub.user_id,
      ub.best_score,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE WHEN v_higher THEN ub.best_score END DESC NULLS LAST,
          CASE WHEN NOT v_higher THEN ub.best_score END ASC NULLS LAST
      ) AS rn
    FROM user_bests ub
  )
  SELECT r.rn INTO v_rank FROM ranked r WHERE r.user_id = p_row.user_id;

  IF v_rank IS NULL OR v_rank > 3 THEN
    RETURN;
  END IF;

  -- At most one podium automation post per user / court / record per 24h
  IF EXISTS (
    SELECT 1 FROM public.posts
    WHERE user_id = p_row.user_id
      AND (payload->>'automation') = 'court_podium'
      AND (payload->>'court_id')::uuid = p_row.court_id
      AND payload->>'record_slug' = p_row.record_type_slug
      AND created_at > now() - interval '24 hours'
  ) THEN
    RETURN;
  END IF;

  SELECT c.name INTO v_court_name FROM public.courts c WHERE c.id = p_row.court_id;
  SELECT crt.title INTO v_record_title FROM public.court_record_types crt WHERE crt.slug = p_row.record_type_slug;

  medal := CASE v_rank WHEN 1 THEN '🥇' WHEN 2 THEN '🥈' ELSE '🥉' END;
  v_body := medal || ' ' || COALESCE(v_record_title, 'Record') || ' at ' || COALESCE(v_court_name, 'a spot')
    || ' — #' || v_rank || ' on the leaderboard!';

  v_payload := jsonb_build_object(
    'automation', 'court_podium',
    'court_id', p_row.court_id,
    'record_slug', p_row.record_type_slug,
    'rank', v_rank,
    'record_title', COALESCE(v_record_title, p_row.record_type_slug),
    'court_name', COALESCE(v_court_name, 'Court')
  );

  PERFORM public.insert_automated_feed_post(p_row.user_id, v_body, v_payload, 'highlight');
END;
$$;

REVOKE ALL ON FUNCTION public.notify_court_podium_from_attempt(public.court_attempts) FROM PUBLIC;

-- ---- Extend court attempt trigger ----
CREATE OR REPLACE FUNCTION public.trg_court_attempt_refresh_king()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sk TEXT;
  hib BOOLEAN;
  ex_id UUID;
BEGIN
  sk := 'court|' || NEW.court_id::text || '|' || NEW.record_type_slug;
  SELECT crt.higher_is_better INTO hib FROM public.court_record_types crt WHERE crt.slug = NEW.record_type_slug;
  hib := COALESCE(hib, TRUE);

  SELECT id INTO ex_id FROM public.king_leaderboard_entries
  WHERE scope_key = sk AND entry_type = 'user' AND user_id = NEW.user_id;

  IF ex_id IS NOT NULL THEN
    UPDATE public.king_leaderboard_entries SET
      score_value = CASE
        WHEN hib THEN GREATEST(public.king_leaderboard_entries.score_value, NEW.score_value)
        ELSE LEAST(public.king_leaderboard_entries.score_value, NEW.score_value)
      END,
      court_attempt_id = NEW.id,
      updated_at = now()
    WHERE id = ex_id;
  ELSE
    INSERT INTO public.king_leaderboard_entries (scope_key, entry_type, user_id, team_id, score_value, higher_is_better, court_attempt_id)
    VALUES (sk, 'user', NEW.user_id, NULL, NEW.score_value, hib, NEW.id);
  END IF;

  PERFORM public.refresh_king_badge_slot(sk);
  PERFORM public.notify_court_podium_from_attempt(NEW);
  RETURN NEW;
END;
$$;

-- ---- RPC: lines for Leaderboards → Spots “Live & nearby” ----
CREATE OR REPLACE FUNCTION public.spots_activity_near(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_radius_km DOUBLE PRECISION DEFAULT 50
)
RETURNS TABLE (line TEXT, sort_order INT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n_recent INT := 0;
  recent_name TEXT;
  recent_mins INT;
  n_spots INT := 0;
BEGIN
  SELECT COUNT(*)::INT INTO n_recent
  FROM public.court_attempts ca
  INNER JOIN public.courts c ON c.id = ca.court_id
  WHERE ca.created_at > now() - interval '24 hours'
    AND (
      6371 * acos(
        LEAST(1.0::DOUBLE PRECISION, GREATEST(-1.0::DOUBLE PRECISION,
          cos(radians(p_lat)) * cos(radians(c.lat)) *
          cos(radians(c.lng) - radians(p_lng)) +
          sin(radians(p_lat)) * sin(radians(c.lat))
        ))
      )
    ) <= p_radius_km;

  SELECT c.name, (EXTRACT(EPOCH FROM (now() - ca.created_at))::INT / 60)
  INTO recent_name, recent_mins
  FROM public.court_attempts ca
  INNER JOIN public.courts c ON c.id = ca.court_id
  WHERE (
    6371 * acos(
      LEAST(1.0::DOUBLE PRECISION, GREATEST(-1.0::DOUBLE PRECISION,
        cos(radians(p_lat)) * cos(radians(c.lat)) *
        cos(radians(c.lng) - radians(p_lng)) +
        sin(radians(p_lat)) * sin(radians(c.lat))
      ))
    )
  ) <= p_radius_km
  ORDER BY ca.created_at DESC
  LIMIT 1;

  SELECT COUNT(*)::INT INTO n_spots
  FROM public.courts c
  WHERE (
    6371 * acos(
      LEAST(1.0::DOUBLE PRECISION, GREATEST(-1.0::DOUBLE PRECISION,
        cos(radians(p_lat)) * cos(radians(c.lat)) *
        cos(radians(c.lng) - radians(p_lng)) +
        sin(radians(p_lat)) * sin(radians(c.lat))
      ))
    )
  ) <= p_radius_km;

  IF n_recent > 0 THEN
    line := n_recent || ' score submission' || CASE WHEN n_recent = 1 THEN '' ELSE 's' END || ' in your area (24h).';
    sort_order := 1;
    RETURN NEXT;
  END IF;

  IF recent_name IS NOT NULL THEN
    line := 'Latest activity: ' || recent_name || ' · ' ||
      CASE
        WHEN recent_mins IS NULL OR recent_mins < 1 THEN 'just now'
        WHEN recent_mins < 60 THEN recent_mins || ' min ago'
        ELSE GREATEST(1, recent_mins / 60) || ' hr ago'
      END || '.';
    sort_order := 2;
    RETURN NEXT;
  END IF;

  IF n_spots > 0 THEN
    line := n_spots || ' spot' || CASE WHEN n_spots = 1 THEN '' ELSE 's' END || ' within ' || round(p_radius_km)::INT || ' km — tap to compete.';
    sort_order := 3;
    RETURN NEXT;
  END IF;

  line := 'Be the first to post a score near you.';
  sort_order := 4;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.spots_activity_near(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;
