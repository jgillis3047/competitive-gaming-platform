-- AI Vision: match proof bundles, AI reviews, basketball shooting sessions, golf round tracking

-- ─── Match proof bundles ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.match_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  proof_type text NOT NULL CHECK (proof_type IN ('video', 'photo', 'scorecard')),
  storage_path text NOT NULL,
  sport_key text CHECK (sport_key IN ('basketball', 'golf', 'other')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_proofs_challenge ON public.match_proofs(challenge_id);

CREATE TABLE IF NOT EXISTS public.ai_match_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  sport_key text,
  verdict text CHECK (verdict IN ('approved', 'needs_review', 'rejected')),
  confidence numeric,
  detected_score text,
  reported_score text,
  summary text,
  flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_match_reviews_challenge ON public.ai_match_reviews(challenge_id);

-- ─── Basketball shooting sessions ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shooting_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id uuid REFERENCES public.challenges(id) ON DELETE SET NULL,
  video_path text,
  session_type text NOT NULL DEFAULT 'free_throw'
    CHECK (session_type IN ('free_throw', 'three_point', 'midrange', 'mixed')),
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('uploading', 'processing', 'complete', 'failed')),
  total_shots int,
  makes int,
  misses int,
  fg_percent numeric,
  best_streak int,
  confidence numeric,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_shooting_sessions_user ON public.shooting_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_shooting_sessions_challenge ON public.shooting_sessions(challenge_id);

CREATE TABLE IF NOT EXISTS public.tracked_shots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.shooting_sessions(id) ON DELETE CASCADE,
  shot_number int NOT NULL,
  result text NOT NULL CHECK (result IN ('make', 'miss')),
  confidence numeric,
  timestamp_start numeric,
  timestamp_end numeric,
  clip_storage_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tracked_shots_session ON public.tracked_shots(session_id);

-- ─── Golf round tracking ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.golf_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid REFERENCES public.challenges(id) ON DELETE SET NULL,
  course_name text NOT NULL,
  course_lat numeric,
  course_lng numeric,
  holes int NOT NULL DEFAULT 18,
  format text NOT NULL DEFAULT 'stroke_play'
    CHECK (format IN ('stroke_play', 'match_play', 'longest_drive', 'closest_to_pin', 'putting', 'range')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'submitted', 'reviewed', 'completed')),
  started_at timestamptz,
  ended_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opponent_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_golf_sessions_creator ON public.golf_sessions(created_by);
CREATE INDEX IF NOT EXISTS idx_golf_sessions_challenge ON public.golf_sessions(challenge_id);

CREATE TABLE IF NOT EXISTS public.golf_hole_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.golf_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hole_number int NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  strokes int NOT NULL CHECK (strokes >= 1),
  putts int,
  fairway_result text CHECK (fairway_result IN ('fairway', 'left', 'right', 'ob', 'short', 'na')),
  gir boolean,
  penalties int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id, hole_number)
);

CREATE INDEX IF NOT EXISTS idx_golf_hole_scores_session ON public.golf_hole_scores(session_id);

CREATE TABLE IF NOT EXISTS public.golf_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.golf_sessions(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  proof_type text NOT NULL
    CHECK (proof_type IN ('scorecard', 'tee_video', 'putt_video', 'gps_checkin', 'group_photo')),
  storage_path text,
  ai_status text NOT NULL DEFAULT 'pending'
    CHECK (ai_status IN ('pending', 'processing', 'complete', 'failed')),
  ai_summary text,
  ai_confidence numeric,
  flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_golf_proofs_session ON public.golf_proofs(session_id);

CREATE TABLE IF NOT EXISTS public.golf_ai_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.golf_sessions(id) ON DELETE CASCADE,
  verdict text CHECK (verdict IN ('approved', 'needs_review', 'rejected')),
  detected_winner uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  detected_scores jsonb,
  summary text,
  confidence numeric,
  flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_golf_ai_reviews_session ON public.golf_ai_reviews(session_id);

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.match_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_match_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shooting_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracked_shots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golf_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golf_hole_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golf_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golf_ai_reviews ENABLE ROW LEVEL SECURITY;

-- match_proofs: participants can read/insert
DROP POLICY IF EXISTS "match_proofs_select_participants" ON public.match_proofs;
CREATE POLICY "match_proofs_select_participants" ON public.match_proofs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.challenge_players cp
      WHERE cp.challenge_id = match_proofs.challenge_id AND cp.user_id = auth.uid()
    )
    OR uploaded_by = auth.uid()
  );

DROP POLICY IF EXISTS "match_proofs_insert_own" ON public.match_proofs;
CREATE POLICY "match_proofs_insert_own" ON public.match_proofs
  FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid());

-- ai_match_reviews: participants read
DROP POLICY IF EXISTS "ai_match_reviews_select_participants" ON public.ai_match_reviews;
CREATE POLICY "ai_match_reviews_select_participants" ON public.ai_match_reviews
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.challenge_players cp
      WHERE cp.challenge_id = ai_match_reviews.challenge_id AND cp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "ai_match_reviews_insert_participants" ON public.ai_match_reviews;
CREATE POLICY "ai_match_reviews_insert_participants" ON public.ai_match_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.challenge_players cp
      WHERE cp.challenge_id = ai_match_reviews.challenge_id AND cp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "match_proofs_update_own" ON public.match_proofs;
CREATE POLICY "match_proofs_update_own" ON public.match_proofs
  FOR UPDATE TO authenticated
  USING (uploaded_by = auth.uid());

-- shooting_sessions: owner CRUD, challenge participants read
DROP POLICY IF EXISTS "shooting_sessions_select" ON public.shooting_sessions;
CREATE POLICY "shooting_sessions_select" ON public.shooting_sessions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      challenge_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.challenge_players cp
        WHERE cp.challenge_id = shooting_sessions.challenge_id AND cp.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "shooting_sessions_insert_own" ON public.shooting_sessions;
CREATE POLICY "shooting_sessions_insert_own" ON public.shooting_sessions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "shooting_sessions_update_own" ON public.shooting_sessions;
CREATE POLICY "shooting_sessions_update_own" ON public.shooting_sessions
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- tracked_shots: via session access
DROP POLICY IF EXISTS "tracked_shots_select" ON public.tracked_shots;
CREATE POLICY "tracked_shots_select" ON public.tracked_shots
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.shooting_sessions ss
      WHERE ss.id = tracked_shots.session_id
        AND (
          ss.user_id = auth.uid()
          OR (
            ss.challenge_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.challenge_players cp
              WHERE cp.challenge_id = ss.challenge_id AND cp.user_id = auth.uid()
            )
          )
        )
    )
  );

-- golf_sessions
DROP POLICY IF EXISTS "golf_sessions_select" ON public.golf_sessions;
CREATE POLICY "golf_sessions_select" ON public.golf_sessions
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR opponent_user_id = auth.uid()
    OR (
      challenge_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.challenge_players cp
        WHERE cp.challenge_id = golf_sessions.challenge_id AND cp.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "golf_sessions_insert_own" ON public.golf_sessions;
CREATE POLICY "golf_sessions_insert_own" ON public.golf_sessions
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "golf_sessions_update_participants" ON public.golf_sessions;
CREATE POLICY "golf_sessions_update_participants" ON public.golf_sessions
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR opponent_user_id = auth.uid());

-- golf_hole_scores
DROP POLICY IF EXISTS "golf_hole_scores_select" ON public.golf_hole_scores;
CREATE POLICY "golf_hole_scores_select" ON public.golf_hole_scores
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_sessions gs
      WHERE gs.id = golf_hole_scores.session_id
        AND (gs.created_by = auth.uid() OR gs.opponent_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "golf_hole_scores_insert_participant" ON public.golf_hole_scores;
CREATE POLICY "golf_hole_scores_insert_participant" ON public.golf_hole_scores
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.golf_sessions gs
      WHERE gs.id = golf_hole_scores.session_id
        AND (gs.created_by = auth.uid() OR gs.opponent_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "golf_hole_scores_update_own" ON public.golf_hole_scores;
CREATE POLICY "golf_hole_scores_update_own" ON public.golf_hole_scores
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- golf_proofs
DROP POLICY IF EXISTS "golf_proofs_select" ON public.golf_proofs;
CREATE POLICY "golf_proofs_select" ON public.golf_proofs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_sessions gs
      WHERE gs.id = golf_proofs.session_id
        AND (gs.created_by = auth.uid() OR gs.opponent_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "golf_proofs_insert_participant" ON public.golf_proofs;
CREATE POLICY "golf_proofs_insert_participant" ON public.golf_proofs
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.golf_sessions gs
      WHERE gs.id = golf_proofs.session_id
        AND (gs.created_by = auth.uid() OR gs.opponent_user_id = auth.uid())
    )
  );

-- golf_ai_reviews
DROP POLICY IF EXISTS "golf_ai_reviews_select" ON public.golf_ai_reviews;
CREATE POLICY "golf_ai_reviews_select" ON public.golf_ai_reviews
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_sessions gs
      WHERE gs.id = golf_ai_reviews.session_id
        AND (gs.created_by = auth.uid() OR gs.opponent_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "golf_ai_reviews_insert" ON public.golf_ai_reviews;
CREATE POLICY "golf_ai_reviews_insert" ON public.golf_ai_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.golf_sessions gs
      WHERE gs.id = golf_ai_reviews.session_id
        AND (gs.created_by = auth.uid() OR gs.opponent_user_id = auth.uid())
    )
  );

-- ─── Storage policies ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS "media_insert_match_proofs" ON storage.objects;
CREATE POLICY "media_insert_match_proofs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] = 'match-proofs'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

DROP POLICY IF EXISTS "media_insert_egame_proofs" ON storage.objects;
CREATE POLICY "media_insert_egame_proofs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] = 'egame-proofs'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

DROP POLICY IF EXISTS "media_insert_shooting_sessions" ON storage.objects;
CREATE POLICY "media_insert_shooting_sessions"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] = 'shooting-sessions'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

DROP POLICY IF EXISTS "media_insert_golf_proofs" ON storage.objects;
CREATE POLICY "media_insert_golf_proofs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] = 'golf-proofs'
  AND (storage.foldername(name))[2] = auth.uid()::text
);
