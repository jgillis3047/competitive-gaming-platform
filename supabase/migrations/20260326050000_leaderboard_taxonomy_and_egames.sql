-- Curated leaderboard taxonomy + e-game scope support for Leaderboards V1.

CREATE TABLE IF NOT EXISTS leaderboard_categories (
  slug TEXT PRIMARY KEY,
  family TEXT NOT NULL CHECK (family IN ('spots', 'egames')),
  title TEXT NOT NULL,
  score_unit TEXT NOT NULL,
  higher_is_better BOOLEAN NOT NULL DEFAULT TRUE,
  team_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  verification_type TEXT NOT NULL DEFAULT 'gps_upload',
  proof_rules TEXT,
  place_kinds TEXT[] NULL,
  game_family TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_categories_family ON leaderboard_categories(family);
CREATE INDEX IF NOT EXISTS idx_leaderboard_categories_active ON leaderboard_categories(is_active);

ALTER TABLE leaderboard_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leaderboard_categories_select_all" ON leaderboard_categories;
CREATE POLICY "leaderboard_categories_select_all"
  ON leaderboard_categories
  FOR SELECT
  TO authenticated
  USING (true);

-- Optional moderation table for future user-proposed categories.
CREATE TABLE IF NOT EXISTS leaderboard_category_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  family TEXT NOT NULL CHECK (family IN ('spots', 'egames')),
  score_unit TEXT NOT NULL,
  higher_is_better BOOLEAN NOT NULL DEFAULT TRUE,
  team_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  verification_type TEXT NOT NULL DEFAULT 'upload_only',
  proof_rules TEXT,
  place_kinds TEXT[] NULL,
  game_family TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  moderation_note TEXT,
  reviewed_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lb_category_proposals_status ON leaderboard_category_proposals(status);
CREATE INDEX IF NOT EXISTS idx_lb_category_proposals_user ON leaderboard_category_proposals(proposed_by);

ALTER TABLE leaderboard_category_proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lb_category_proposals_select_own" ON leaderboard_category_proposals;
CREATE POLICY "lb_category_proposals_select_own"
  ON leaderboard_category_proposals
  FOR SELECT
  TO authenticated
  USING (proposed_by = auth.uid());

DROP POLICY IF EXISTS "lb_category_proposals_insert_own" ON leaderboard_category_proposals;
CREATE POLICY "lb_category_proposals_insert_own"
  ON leaderboard_category_proposals
  FOR INSERT
  TO authenticated
  WITH CHECK (proposed_by = auth.uid());

-- E-game submissions that can back scope rankings.
CREATE TABLE IF NOT EXISTS egame_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_slug TEXT NOT NULL REFERENCES leaderboard_categories(slug) ON DELETE RESTRICT,
  match_id UUID NULL REFERENCES challenges(id) ON DELETE SET NULL,
  submitted_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('user', 'team')),
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID NULL REFERENCES teams(id) ON DELETE CASCADE,
  score_value DOUBLE PRECISION NOT NULL,
  proof_media_path TEXT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT egame_results_subject_ck CHECK (
    (subject_type = 'user' AND user_id IS NOT NULL AND team_id IS NULL)
    OR (subject_type = 'team' AND team_id IS NOT NULL AND user_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_egame_results_category ON egame_results(category_slug);
CREATE INDEX IF NOT EXISTS idx_egame_results_created ON egame_results(created_at DESC);

ALTER TABLE egame_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "egame_results_select_all" ON egame_results;
CREATE POLICY "egame_results_select_all"
  ON egame_results
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "egame_results_insert_submitter" ON egame_results;
CREATE POLICY "egame_results_insert_submitter"
  ON egame_results
  FOR INSERT
  TO authenticated
  WITH CHECK (submitted_by = auth.uid());

-- Helpful covering index for e-game scope lookups in king_leaderboard_entries.
CREATE INDEX IF NOT EXISTS idx_king_lb_scope_entry_score
  ON king_leaderboard_entries(scope_key, entry_type, score_value);
