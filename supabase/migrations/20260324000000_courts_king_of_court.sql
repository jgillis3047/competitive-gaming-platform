-- King of the Court: GPS-based locations + async record leaderboards (no 1v1 required)

CREATE TABLE IF NOT EXISTS court_record_types (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  higher_is_better BOOLEAN NOT NULL DEFAULT TRUE,
  unit_label TEXT NOT NULL DEFAULT ''
);

INSERT INTO court_record_types (slug, title, description, higher_is_better, unit_label) VALUES
  ('mile_run', 'Fastest mile', 'Best time for one mile. Lower is better. Manual entry for MVP; GPS validation later.', FALSE, 'time'),
  ('three_pointers_60s', 'Most 3-pointers (60s)', 'Shots made in 60 seconds. Video proof encouraged.', TRUE, 'makes'),
  ('carry_distance_yards', 'Longest carry', 'Driving range carry distance in yards.', TRUE, 'yds')
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS courts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  checkin_radius_m INT NOT NULL DEFAULT 150,
  city TEXT,
  place_kind TEXT NOT NULL DEFAULT 'other' CHECK (place_kind IN ('park', 'gym', 'campus', 'range', 'other')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_courts_city ON courts(city);
CREATE INDEX IF NOT EXISTS idx_courts_lat_lng ON courts(lat, lng);

CREATE TABLE IF NOT EXISTS court_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id UUID NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  record_type_slug TEXT NOT NULL REFERENCES court_record_types(slug),
  score_value DOUBLE PRECISION NOT NULL,
  proof_media_path TEXT,
  checkin_lat DOUBLE PRECISION NOT NULL,
  checkin_lng DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_court_attempts_court_record ON court_attempts(court_id, record_type_slug);
CREATE INDEX IF NOT EXISTS idx_court_attempts_user ON court_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_court_attempts_created ON court_attempts(created_at DESC);

-- Seed Las Vegas area courts (unofficial community spots — not affiliated with venues)
INSERT INTO courts (slug, name, description, lat, lng, checkin_radius_m, city, place_kind) VALUES
  ('sunset-park-lv', 'Sunset Park', 'Community park — running paths and outdoor courts.', 36.0708, -115.1364, 200, 'Las Vegas', 'park'),
  ('unlv-srwc', 'UNLV SRWC area', 'Campus recreation area — community records, not official UNLV.', 36.1078, -115.1417, 180, 'Las Vegas', 'campus'),
  ('desert-pines-golf', 'Desert Pines Golf Club', 'Range and course area — longest carry and similar.', 36.1670, -115.0810, 250, 'Las Vegas', 'range'),
  ('red-rock-range', 'Red Rock area range', 'Driving range vicinity — community leaderboard.', 36.1750, -115.3480, 200, 'Las Vegas', 'range'),
  ('floyd-lamb-park', 'Floyd Lamb Park', 'Park trails — mile and fitness records.', 36.3250, -115.2180, 220, 'Las Vegas', 'park')
ON CONFLICT (slug) DO NOTHING;

CREATE OR REPLACE FUNCTION nearby_courts(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_radius_km DOUBLE PRECISION DEFAULT 25
)
RETURNS TABLE (
  id UUID,
  slug TEXT,
  name TEXT,
  description TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  checkin_radius_m INT,
  city TEXT,
  place_kind TEXT,
  distance_km DOUBLE PRECISION
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.slug,
    c.name,
    c.description,
    c.lat,
    c.lng,
    c.checkin_radius_m,
    c.city,
    c.place_kind,
    (
      6371 * acos(
        LEAST(1.0::DOUBLE PRECISION, GREATEST(-1.0::DOUBLE PRECISION,
          cos(radians(p_lat)) * cos(radians(c.lat)) *
          cos(radians(c.lng) - radians(p_lng)) +
          sin(radians(p_lat)) * sin(radians(c.lat))
        ))
      )
    )::DOUBLE PRECISION AS distance_km
  FROM courts c
  WHERE (
    6371 * acos(
      LEAST(1.0::DOUBLE PRECISION, GREATEST(-1.0::DOUBLE PRECISION,
        cos(radians(p_lat)) * cos(radians(c.lat)) *
        cos(radians(c.lng) - radians(p_lng)) +
        sin(radians(p_lat)) * sin(radians(c.lat))
      ))
    )
  ) <= p_radius_km
  ORDER BY distance_km ASC;
$$;

CREATE OR REPLACE FUNCTION court_leaderboard(
  p_court_id UUID,
  p_record_slug TEXT,
  p_limit INT DEFAULT 25
)
RETURNS TABLE (
  rank BIGINT,
  user_id UUID,
  best_score DOUBLE PRECISION,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_higher BOOLEAN;
  lim INT;
BEGIN
  SELECT crt.higher_is_better INTO v_higher FROM court_record_types crt WHERE crt.slug = p_record_slug;
  IF v_higher IS NULL THEN RETURN; END IF;
  lim := GREATEST(1, LEAST(COALESCE(p_limit, 25), 100));

  RETURN QUERY
  WITH user_bests AS (
    SELECT
      ca.user_id,
      CASE WHEN v_higher THEN MAX(ca.score_value) ELSE MIN(ca.score_value) END AS best_score
    FROM court_attempts ca
    WHERE ca.court_id = p_court_id AND ca.record_type_slug = p_record_slug
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
  SELECT
    r.rn::BIGINT,
    r.user_id,
    r.best_score,
    p.username,
    p.display_name,
    p.avatar_url
  FROM ranked r
  LEFT JOIN profiles p ON p.id = r.user_id
  WHERE r.rn <= lim
  ORDER BY r.rn;
END;
$$;

GRANT EXECUTE ON FUNCTION nearby_courts(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;
GRANT EXECUTE ON FUNCTION court_leaderboard(UUID, TEXT, INT) TO authenticated;

ALTER TABLE court_record_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE courts ENABLE ROW LEVEL SECURITY;
ALTER TABLE court_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "court_record_types_select_auth" ON court_record_types FOR SELECT TO authenticated USING (true);

CREATE POLICY "courts_select_auth" ON courts FOR SELECT TO authenticated USING (true);
CREATE POLICY "courts_insert_own" ON courts FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "court_attempts_select_auth" ON court_attempts FOR SELECT TO authenticated USING (true);
CREATE POLICY "court_attempts_insert_own" ON court_attempts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Storage: allow court proof uploads (same bucket as posts; path court-proofs/{uid}/...)
DROP POLICY IF EXISTS "media_insert_court_proofs" ON storage.objects;
CREATE POLICY "media_insert_court_proofs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] = 'court-proofs'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

DROP POLICY IF EXISTS "media_delete_court_proofs_own" ON storage.objects;
CREATE POLICY "media_delete_court_proofs_own"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] = 'court-proofs'
  AND (storage.foldername(name))[2] = auth.uid()::text
);
