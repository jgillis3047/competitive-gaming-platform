-- Arena verification, creation photos, community confirmations, match social proof

ALTER TABLE courts
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'approved'
    CHECK (verification_status IN ('pending', 'approved', 'rejected'));

ALTER TABLE courts
  ADD COLUMN IF NOT EXISTS photo_paths TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE courts
  ADD COLUMN IF NOT EXISTS game_category_slug TEXT;

-- New user-created arenas start pending (app sets explicitly; seeded rows stay approved)
COMMENT ON COLUMN courts.verification_status IS 'pending until GPS+photos+community or admin approval';

ALTER TABLE court_attempts
  ADD COLUMN IF NOT EXISTS proof_social_url TEXT;

ALTER TABLE court_attempts
  ADD COLUMN IF NOT EXISTS verification_level TEXT NOT NULL DEFAULT 'basic'
    CHECK (verification_level IN ('basic', 'verified', 'featured', 'legendary'));

CREATE TABLE IF NOT EXISTS court_verification_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id UUID NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (court_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_court_verification_confirmations_court
  ON court_verification_confirmations(court_id);

ALTER TABLE court_verification_confirmations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "court_verifications_select_auth" ON court_verification_confirmations;
CREATE POLICY "court_verifications_select_auth"
  ON court_verification_confirmations FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "court_verifications_insert_own" ON court_verification_confirmations;
CREATE POLICY "court_verifications_insert_own"
  ON court_verification_confirmations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND auth.uid() != (
    SELECT c.created_by FROM courts c WHERE c.id = court_id
  ));

-- Community confirm → auto-approve at 3 confirmations
CREATE OR REPLACE FUNCTION confirm_court_legitimacy(p_court_id UUID)
RETURNS TABLE (confirmation_count INT, verification_status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_creator UUID;
  v_count INT;
  v_status TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT c.created_by, c.verification_status
  INTO v_creator, v_status
  FROM courts c
  WHERE c.id = p_court_id;

  IF v_creator IS NULL THEN
    RAISE EXCEPTION 'Court not found';
  END IF;

  IF v_creator = v_uid THEN
    RAISE EXCEPTION 'Cannot confirm your own arena';
  END IF;

  IF v_status = 'approved' THEN
    SELECT COUNT(*)::INT INTO v_count
    FROM court_verification_confirmations
    WHERE court_id = p_court_id;
    RETURN QUERY SELECT v_count, v_status;
    RETURN;
  END IF;

  INSERT INTO court_verification_confirmations (court_id, user_id)
  VALUES (p_court_id, v_uid)
  ON CONFLICT (court_id, user_id) DO NOTHING;

  SELECT COUNT(*)::INT INTO v_count
  FROM court_verification_confirmations
  WHERE court_id = p_court_id;

  IF v_count >= 3 AND v_status = 'pending' THEN
    UPDATE courts SET verification_status = 'approved' WHERE id = p_court_id;
    v_status := 'approved';
  END IF;

  RETURN QUERY SELECT v_count, v_status;
END;
$$;

GRANT EXECUTE ON FUNCTION confirm_court_legitimacy(UUID) TO authenticated;

-- Nearby courts: approved only, plus caller's own pending/rejected arenas
-- Must DROP first: Postgres cannot change RETURNS TABLE shape via CREATE OR REPLACE.
DROP FUNCTION IF EXISTS nearby_courts(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION);

CREATE FUNCTION nearby_courts(
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
  verification_status TEXT,
  game_category_slug TEXT,
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
    c.verification_status,
    c.game_category_slug,
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
    c.verification_status = 'approved'
    OR c.created_by = auth.uid()
  )
  AND (
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

GRANT EXECUTE ON FUNCTION nearby_courts(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;

-- Arena creation photos (same media bucket)
DROP POLICY IF EXISTS "media_insert_arena_photos" ON storage.objects;
CREATE POLICY "media_insert_arena_photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] = 'arena-photos'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

DROP POLICY IF EXISTS "media_delete_arena_photos_own" ON storage.objects;
CREATE POLICY "media_delete_arena_photos_own"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] = 'arena-photos'
  AND (storage.foldername(name))[2] = auth.uid()::text
);
