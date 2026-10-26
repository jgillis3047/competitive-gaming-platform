-- Applications to be recognized as "King" for an area/category; pending review.
-- Proof required unless is_online_game (in-app / online match).

CREATE TABLE IF NOT EXISTS king_claim_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claim_scope TEXT NOT NULL CHECK (claim_scope IN ('court', 'city')),
  court_id UUID REFERENCES courts(id) ON DELETE SET NULL,
  city_name TEXT,
  area_kind TEXT NOT NULL CHECK (area_kind IN ('gym', 'park', 'trail', 'track', 'range', 'driving_range', 'other')),
  record_type_slug TEXT REFERENCES court_record_types(slug),
  claim_title TEXT NOT NULL,
  claim_details TEXT,
  source_challenge_id UUID REFERENCES challenges(id) ON DELETE SET NULL,
  is_online_game BOOLEAN NOT NULL DEFAULT FALSE,
  proof_media_paths TEXT[] NOT NULL DEFAULT '{}',
  anchor_lat DOUBLE PRECISION NOT NULL,
  anchor_lng DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT king_claim_scope_valid CHECK (
    (claim_scope = 'court' AND court_id IS NOT NULL)
    OR (claim_scope = 'city' AND city_name IS NOT NULL AND LENGTH(TRIM(city_name)) > 0)
  ),
  CONSTRAINT king_claim_proof_valid CHECK (
    is_online_game
    OR (COALESCE(array_length(proof_media_paths, 1), 0) >= 1)
  )
);

CREATE INDEX IF NOT EXISTS idx_king_claims_user ON king_claim_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_king_claims_status ON king_claim_applications(status);
CREATE INDEX IF NOT EXISTS idx_king_claims_court ON king_claim_applications(court_id);

ALTER TABLE king_claim_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "king_claims_select_own" ON king_claim_applications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "king_claims_insert_own" ON king_claim_applications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Storage: king-claims/{uid}/...
DROP POLICY IF EXISTS "media_insert_king_claims" ON storage.objects;
CREATE POLICY "media_insert_king_claims"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] = 'king-claims'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

DROP POLICY IF EXISTS "media_delete_king_claims_own" ON storage.objects;
CREATE POLICY "media_delete_king_claims_own"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] = 'king-claims'
  AND (storage.foldername(name))[2] = auth.uid()::text
);
