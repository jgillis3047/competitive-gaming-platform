-- Per-scope leaderboards (court + city), tie ranks, exclusive King badge per scope, profile badges.

-- Optional numeric for ordering when claim is approved (bench volume, time, etc.)
ALTER TABLE king_claim_applications
  ADD COLUMN IF NOT EXISTS claimed_score_value DOUBLE PRECISION;

-- One best row per user per scope (e.g. court|{uuid}|mile_run)
CREATE TABLE IF NOT EXISTS king_leaderboard_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_key TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score_value DOUBLE PRECISION NOT NULL,
  higher_is_better BOOLEAN NOT NULL DEFAULT TRUE,
  court_attempt_id UUID REFERENCES court_attempts(id) ON DELETE SET NULL,
  king_claim_application_id UUID REFERENCES king_claim_applications(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, scope_key)
);

CREATE INDEX IF NOT EXISTS idx_king_lb_scope ON king_leaderboard_entries(scope_key);

-- Badge slot: at most one King per scope; cleared when tie at the top
CREATE TABLE IF NOT EXISTS king_badge_slots (
  scope_key TEXT PRIMARY KEY,
  badge_holder_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tie_at_top BOOLEAN NOT NULL DEFAULT FALSE,
  badge_title_snapshot TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per scope globally — who currently may show the crown for that title
CREATE TABLE IF NOT EXISTS user_king_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  king_claim_application_id UUID REFERENCES king_claim_applications(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, scope_key)
);

CREATE INDEX IF NOT EXISTS idx_user_king_badges_user ON user_king_badges(user_id);

ALTER TABLE king_leaderboard_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE king_badge_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_king_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "king_lb_select_all" ON king_leaderboard_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "king_badge_slots_select_all" ON king_badge_slots FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_king_badges_select_all" ON user_king_badges FOR SELECT TO authenticated USING (true);

-- Inserts/updates come from triggers + SECURITY DEFINER RPC only
CREATE POLICY "king_lb_no_direct_insert" ON king_leaderboard_entries FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "king_lb_no_direct_update" ON king_leaderboard_entries FOR UPDATE TO authenticated USING (false);

-- ---- Core: recompute badge for a scope (ties => no badge until settled) ----
CREATE OR REPLACE FUNCTION refresh_king_badge_slot(p_scope_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug TEXT;
  v_higher BOOLEAN;
  v_top DOUBLE PRECISION;
  v_cnt INT;
  v_holder UUID;
  v_title TEXT;
  v_parts TEXT[];
BEGIN
  v_parts := string_to_array(p_scope_key, '|');
  IF array_length(v_parts, 1) >= 3 THEN
    v_slug := v_parts[3];
  ELSE
    v_slug := NULL;
  END IF;

  SELECT crt.higher_is_better INTO v_higher FROM court_record_types crt WHERE crt.slug = v_slug;
  IF v_higher IS NULL THEN v_higher := TRUE; END IF;

  IF NOT EXISTS (SELECT 1 FROM king_leaderboard_entries e WHERE e.scope_key = p_scope_key) THEN
    INSERT INTO king_badge_slots(scope_key, badge_holder_user_id, tie_at_top, badge_title_snapshot)
    VALUES (p_scope_key, NULL, FALSE, NULL)
    ON CONFLICT (scope_key) DO UPDATE SET
      badge_holder_user_id = NULL,
      tie_at_top = FALSE,
      badge_title_snapshot = NULL,
      updated_at = now();
    DELETE FROM user_king_badges WHERE scope_key = p_scope_key;
    RETURN jsonb_build_object(
      'tie_at_top', false,
      'badge_holder_id', NULL,
      'top_score', NULL,
      'winners_at_top', '[]'::jsonb
    );
  END IF;

  IF v_higher THEN
    SELECT MAX(e.score_value) INTO v_top FROM king_leaderboard_entries e WHERE e.scope_key = p_scope_key;
  ELSE
    SELECT MIN(e.score_value) INTO v_top FROM king_leaderboard_entries e WHERE e.scope_key = p_scope_key;
  END IF;

  SELECT COUNT(*) INTO v_cnt
  FROM king_leaderboard_entries e
  WHERE e.scope_key = p_scope_key AND e.score_value = v_top;

  IF v_cnt > 1 THEN
    INSERT INTO king_badge_slots(scope_key, badge_holder_user_id, tie_at_top, badge_title_snapshot)
    VALUES (p_scope_key, NULL, TRUE, 'Tied at #1 — King badge unsettled')
    ON CONFLICT (scope_key) DO UPDATE SET
      badge_holder_user_id = NULL,
      tie_at_top = TRUE,
      badge_title_snapshot = 'Tied at #1 — King badge unsettled',
      updated_at = now();
    DELETE FROM user_king_badges WHERE scope_key = p_scope_key;
    RETURN jsonb_build_object(
      'tie_at_top', true,
      'badge_holder_id', NULL,
      'top_score', v_top,
      'winners_at_top', (
        SELECT COALESCE(jsonb_agg(to_jsonb(u)), '[]'::jsonb)
        FROM (
          SELECT e.user_id
          FROM king_leaderboard_entries e
          WHERE e.scope_key = p_scope_key AND e.score_value = v_top
        ) u
      )
    );
  END IF;

  SELECT e.user_id INTO v_holder
  FROM king_leaderboard_entries e
  WHERE e.scope_key = p_scope_key AND e.score_value = v_top
  LIMIT 1;

  IF v_parts[1] = 'court' AND array_length(v_parts, 1) >= 3 THEN
    SELECT COALESCE(c.name, 'Court') || ' · ' || COALESCE(crt.title, v_slug)
    INTO v_title
    FROM courts c
    CROSS JOIN court_record_types crt
    WHERE c.id = v_parts[2]::uuid AND crt.slug = v_slug;
  ELSIF v_parts[1] = 'city' AND array_length(v_parts, 1) >= 4 THEN
    SELECT INITCAP(replace(v_parts[2], '_', ' ')) || ' · ' || COALESCE(crt.title, v_slug) || ' · ' || replace(v_parts[4], '_', ' ')
    INTO v_title
    FROM court_record_types crt
    WHERE crt.slug = v_slug;
  ELSE
    v_title := 'King';
  END IF;

  INSERT INTO king_badge_slots(scope_key, badge_holder_user_id, tie_at_top, badge_title_snapshot)
  VALUES (p_scope_key, v_holder, FALSE, v_title)
  ON CONFLICT (scope_key) DO UPDATE SET
    badge_holder_user_id = v_holder,
    tie_at_top = FALSE,
    badge_title_snapshot = EXCLUDED.badge_title_snapshot,
    updated_at = now();

  DELETE FROM user_king_badges WHERE scope_key = p_scope_key;
  INSERT INTO user_king_badges(user_id, scope_key, title, king_claim_application_id)
  VALUES (v_holder, p_scope_key, COALESCE(v_title, 'King'), NULL);

  RETURN jsonb_build_object(
    'tie_at_top', false,
    'badge_holder_id', to_jsonb(v_holder),
    'top_score', v_top,
    'winners_at_top', jsonb_build_array(to_jsonb(v_holder))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_king_badge_slot(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION trg_court_attempt_refresh_king()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sk TEXT;
  hib BOOLEAN;
BEGIN
  sk := 'court|' || NEW.court_id::text || '|' || NEW.record_type_slug;
  SELECT crt.higher_is_better INTO hib FROM court_record_types crt WHERE crt.slug = NEW.record_type_slug;
  hib := COALESCE(hib, TRUE);

  INSERT INTO king_leaderboard_entries (scope_key, user_id, score_value, higher_is_better, court_attempt_id)
  VALUES (sk, NEW.user_id, NEW.score_value, hib, NEW.id)
  ON CONFLICT (user_id, scope_key) DO UPDATE SET
    score_value = CASE
      WHEN hib THEN GREATEST(king_leaderboard_entries.score_value, EXCLUDED.score_value)
      ELSE LEAST(king_leaderboard_entries.score_value, EXCLUDED.score_value)
    END,
    court_attempt_id = EXCLUDED.court_attempt_id,
    updated_at = now();

  PERFORM refresh_king_badge_slot(sk);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_court_attempt_king ON court_attempts;
CREATE TRIGGER tr_court_attempt_king
  AFTER INSERT ON court_attempts
  FOR EACH ROW
  EXECUTE FUNCTION trg_court_attempt_refresh_king();

-- When a claim is approved with a score, add / update city (or court) scope row
CREATE OR REPLACE FUNCTION trg_king_claim_approved_leaderboard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sk TEXT;
  hib BOOLEAN;
  city_part TEXT;
BEGIN
  IF NEW.status <> 'approved' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' THEN
    RETURN NEW;
  END IF;
  IF NEW.claimed_score_value IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT crt.higher_is_better INTO hib FROM court_record_types crt WHERE crt.slug = NEW.record_type_slug;
  IF NEW.record_type_slug IS NOT NULL THEN
    hib := COALESCE(hib, TRUE);
  ELSE
    hib := TRUE;
  END IF;

  IF NEW.claim_scope = 'city' AND NEW.city_name IS NOT NULL THEN
    city_part := lower(regexp_replace(trim(NEW.city_name), '\s+', '_', 'g'));
    sk := 'city|' || city_part || '|' || COALESCE(NEW.record_type_slug, 'custom') || '|' || NEW.area_kind;
  ELSIF NEW.claim_scope = 'court' AND NEW.court_id IS NOT NULL AND NEW.record_type_slug IS NOT NULL THEN
    sk := 'court|' || NEW.court_id::text || '|' || NEW.record_type_slug;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO king_leaderboard_entries (scope_key, user_id, score_value, higher_is_better, king_claim_application_id)
  VALUES (sk, NEW.user_id, NEW.claimed_score_value, hib, NEW.id)
  ON CONFLICT (user_id, scope_key) DO UPDATE SET
    score_value = CASE
      WHEN hib THEN GREATEST(king_leaderboard_entries.score_value, EXCLUDED.score_value)
      ELSE LEAST(king_leaderboard_entries.score_value, EXCLUDED.score_value)
    END,
    king_claim_application_id = EXCLUDED.king_claim_application_id,
    updated_at = now();

  PERFORM refresh_king_badge_slot(sk);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_king_claim_approved_lb ON king_claim_applications;
CREATE TRIGGER tr_king_claim_approved_lb
  AFTER INSERT OR UPDATE ON king_claim_applications
  FOR EACH ROW
  EXECUTE FUNCTION trg_king_claim_approved_leaderboard();
