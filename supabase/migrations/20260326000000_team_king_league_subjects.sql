-- Team-scoped King leaderboards (separate scope keys: court_team|…, city_team|…) + team_king_badges.
-- User court/city scopes unchanged (court|…, city|…).

-- ---- king_claim_applications: optional team claim ----
ALTER TABLE king_claim_applications
  ADD COLUMN IF NOT EXISTS claim_subject TEXT NOT NULL DEFAULT 'user'
    CHECK (claim_subject IN ('user', 'team'));
ALTER TABLE king_claim_applications
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE king_claim_applications DROP CONSTRAINT IF EXISTS king_claim_scope_valid;
ALTER TABLE king_claim_applications ADD CONSTRAINT king_claim_scope_valid CHECK (
  (claim_scope = 'court' AND court_id IS NOT NULL)
  OR (claim_scope = 'city' AND city_name IS NOT NULL AND LENGTH(TRIM(city_name)) > 0)
);

ALTER TABLE king_claim_applications DROP CONSTRAINT IF EXISTS king_claim_subject_team_valid;
ALTER TABLE king_claim_applications ADD CONSTRAINT king_claim_subject_team_valid CHECK (
  (claim_subject = 'user' AND team_id IS NULL)
  OR (claim_subject = 'team' AND team_id IS NOT NULL)
);

-- ---- king_leaderboard_entries: user OR team row ----
ALTER TABLE king_leaderboard_entries
  ADD COLUMN IF NOT EXISTS entry_type TEXT NOT NULL DEFAULT 'user'
    CHECK (entry_type IN ('user', 'team'));
ALTER TABLE king_leaderboard_entries
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE;

UPDATE king_leaderboard_entries SET entry_type = 'user' WHERE user_id IS NOT NULL;

ALTER TABLE king_leaderboard_entries ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE king_leaderboard_entries DROP CONSTRAINT IF EXISTS king_lb_one_subject;
ALTER TABLE king_leaderboard_entries ADD CONSTRAINT king_lb_one_subject CHECK (
  (entry_type = 'user' AND user_id IS NOT NULL AND team_id IS NULL)
  OR (entry_type = 'team' AND team_id IS NOT NULL AND user_id IS NULL)
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'king_leaderboard_entries_user_id_scope_key_key'
  ) THEN
    ALTER TABLE king_leaderboard_entries DROP CONSTRAINT king_leaderboard_entries_user_id_scope_key_key;
  END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS king_lb_scope_user
  ON king_leaderboard_entries (scope_key, user_id)
  WHERE entry_type = 'user' AND user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS king_lb_scope_team
  ON king_leaderboard_entries (scope_key, team_id)
  WHERE entry_type = 'team' AND team_id IS NOT NULL;

-- ---- Badge slot: optional team holder ----
ALTER TABLE king_badge_slots
  ADD COLUMN IF NOT EXISTS badge_holder_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS team_king_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  scope_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  king_claim_application_id UUID REFERENCES king_claim_applications(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_king_badges_team ON team_king_badges(team_id);

ALTER TABLE team_king_badges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "team_king_badges_select_all" ON team_king_badges;
CREATE POLICY "team_king_badges_select_all" ON team_king_badges FOR SELECT TO authenticated USING (true);

-- ---- refresh_king_badge_slot: supports user + team top holders ----
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
  v_entry_type TEXT;
  v_user UUID;
  v_team UUID;
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
    INSERT INTO king_badge_slots(scope_key, badge_holder_user_id, badge_holder_team_id, tie_at_top, badge_title_snapshot)
    VALUES (p_scope_key, NULL, NULL, FALSE, NULL)
    ON CONFLICT (scope_key) DO UPDATE SET
      badge_holder_user_id = NULL,
      badge_holder_team_id = NULL,
      tie_at_top = FALSE,
      badge_title_snapshot = NULL,
      updated_at = now();
    DELETE FROM user_king_badges WHERE scope_key = p_scope_key;
    DELETE FROM team_king_badges WHERE scope_key = p_scope_key;
    RETURN jsonb_build_object('tie_at_top', false, 'badge_holder_user_id', NULL, 'badge_holder_team_id', NULL);
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
    INSERT INTO king_badge_slots(scope_key, badge_holder_user_id, badge_holder_team_id, tie_at_top, badge_title_snapshot)
    VALUES (p_scope_key, NULL, NULL, TRUE, 'Tied at #1 — King badge unsettled')
    ON CONFLICT (scope_key) DO UPDATE SET
      badge_holder_user_id = NULL,
      badge_holder_team_id = NULL,
      tie_at_top = TRUE,
      badge_title_snapshot = 'Tied at #1 — King badge unsettled',
      updated_at = now();
    DELETE FROM user_king_badges WHERE scope_key = p_scope_key;
    DELETE FROM team_king_badges WHERE scope_key = p_scope_key;
    RETURN jsonb_build_object('tie_at_top', true);
  END IF;

  SELECT e.entry_type, e.user_id, e.team_id
  INTO v_entry_type, v_user, v_team
  FROM king_leaderboard_entries e
  WHERE e.scope_key = p_scope_key AND e.score_value = v_top
  LIMIT 1;

  IF v_parts[1] = 'court' AND array_length(v_parts, 1) >= 3 THEN
    SELECT COALESCE(c.name, 'Court') || ' · ' || COALESCE(crt.title, v_slug)
    INTO v_title
    FROM courts c
    CROSS JOIN court_record_types crt
    WHERE c.id = v_parts[2]::uuid AND crt.slug = v_slug;
  ELSIF v_parts[1] = 'court_team' AND array_length(v_parts, 1) >= 3 THEN
    SELECT COALESCE(c.name, 'Court') || ' (team) · ' || COALESCE(crt.title, v_slug)
    INTO v_title
    FROM courts c
    CROSS JOIN court_record_types crt
    WHERE c.id = v_parts[2]::uuid AND crt.slug = v_slug;
  ELSIF v_parts[1] = 'city' AND array_length(v_parts, 1) >= 4 THEN
    SELECT INITCAP(replace(v_parts[2], '_', ' ')) || ' · ' || COALESCE(crt.title, v_slug) || ' · ' || replace(v_parts[4], '_', ' ')
    INTO v_title
    FROM court_record_types crt
    WHERE crt.slug = v_slug;
  ELSIF v_parts[1] = 'city_team' AND array_length(v_parts, 1) >= 4 THEN
    SELECT INITCAP(replace(v_parts[2], '_', ' ')) || ' (team) · ' || COALESCE(crt.title, v_slug) || ' · ' || replace(v_parts[4], '_', ' ')
    INTO v_title
    FROM court_record_types crt
    WHERE crt.slug = v_slug;
  ELSE
    v_title := 'King';
  END IF;

  IF v_entry_type = 'team' AND v_team IS NOT NULL THEN
    INSERT INTO king_badge_slots(scope_key, badge_holder_user_id, badge_holder_team_id, tie_at_top, badge_title_snapshot)
    VALUES (p_scope_key, NULL, v_team, FALSE, v_title)
    ON CONFLICT (scope_key) DO UPDATE SET
      badge_holder_user_id = NULL,
      badge_holder_team_id = v_team,
      tie_at_top = FALSE,
      badge_title_snapshot = EXCLUDED.badge_title_snapshot,
      updated_at = now();
    DELETE FROM user_king_badges WHERE scope_key = p_scope_key;
    DELETE FROM team_king_badges WHERE scope_key = p_scope_key;
    INSERT INTO team_king_badges(team_id, scope_key, title, king_claim_application_id)
    VALUES (v_team, p_scope_key, COALESCE(v_title, 'King'), NULL);
  ELSE
    INSERT INTO king_badge_slots(scope_key, badge_holder_user_id, badge_holder_team_id, tie_at_top, badge_title_snapshot)
    VALUES (p_scope_key, v_user, NULL, FALSE, v_title)
    ON CONFLICT (scope_key) DO UPDATE SET
      badge_holder_user_id = v_user,
      badge_holder_team_id = NULL,
      tie_at_top = FALSE,
      badge_title_snapshot = EXCLUDED.badge_title_snapshot,
      updated_at = now();
    DELETE FROM user_king_badges WHERE scope_key = p_scope_key;
    DELETE FROM team_king_badges WHERE scope_key = p_scope_key;
    INSERT INTO user_king_badges(user_id, scope_key, title, king_claim_application_id)
    VALUES (v_user, p_scope_key, COALESCE(v_title, 'King'), NULL);
  END IF;

  RETURN jsonb_build_object(
    'tie_at_top', false,
    'entry_type', to_jsonb(v_entry_type),
    'badge_holder_user_id', to_jsonb(v_user),
    'badge_holder_team_id', to_jsonb(v_team)
  );
END;
$$;

-- ---- Court attempts: user rows only ----
CREATE OR REPLACE FUNCTION trg_court_attempt_refresh_king()
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
  SELECT crt.higher_is_better INTO hib FROM court_record_types crt WHERE crt.slug = NEW.record_type_slug;
  hib := COALESCE(hib, TRUE);

  SELECT id INTO ex_id FROM king_leaderboard_entries
  WHERE scope_key = sk AND entry_type = 'user' AND user_id = NEW.user_id;

  IF ex_id IS NOT NULL THEN
    UPDATE king_leaderboard_entries SET
      score_value = CASE
        WHEN hib THEN GREATEST(king_leaderboard_entries.score_value, NEW.score_value)
        ELSE LEAST(king_leaderboard_entries.score_value, NEW.score_value)
      END,
      court_attempt_id = NEW.id,
      updated_at = now()
    WHERE id = ex_id;
  ELSE
    INSERT INTO king_leaderboard_entries (scope_key, entry_type, user_id, team_id, score_value, higher_is_better, court_attempt_id)
    VALUES (sk, 'user', NEW.user_id, NULL, NEW.score_value, hib, NEW.id);
  END IF;

  PERFORM refresh_king_badge_slot(sk);
  RETURN NEW;
END;
$$;

-- ---- Approved claims: user (existing) or team (court_team / city_team scopes) ----
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
  ex_id UUID;
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

  IF NEW.claim_subject = 'team' AND NEW.team_id IS NOT NULL THEN
    IF NEW.claim_scope = 'city' AND NEW.city_name IS NOT NULL THEN
      city_part := lower(regexp_replace(trim(NEW.city_name), '\s+', '_', 'g'));
      sk := 'city_team|' || city_part || '|' || COALESCE(NEW.record_type_slug, 'custom') || '|' || NEW.area_kind;
    ELSIF NEW.claim_scope = 'court' AND NEW.court_id IS NOT NULL AND NEW.record_type_slug IS NOT NULL THEN
      sk := 'court_team|' || NEW.court_id::text || '|' || NEW.record_type_slug;
    ELSE
      RETURN NEW;
    END IF;

    SELECT id INTO ex_id FROM king_leaderboard_entries
    WHERE scope_key = sk AND entry_type = 'team' AND team_id = NEW.team_id;

    IF ex_id IS NOT NULL THEN
      UPDATE king_leaderboard_entries SET
        score_value = CASE
          WHEN hib THEN GREATEST(king_leaderboard_entries.score_value, NEW.claimed_score_value)
          ELSE LEAST(king_leaderboard_entries.score_value, NEW.claimed_score_value)
        END,
        king_claim_application_id = NEW.id,
        updated_at = now()
      WHERE id = ex_id;
    ELSE
      INSERT INTO king_leaderboard_entries (scope_key, entry_type, user_id, team_id, score_value, higher_is_better, king_claim_application_id)
      VALUES (sk, 'team', NULL, NEW.team_id, NEW.claimed_score_value, hib, NEW.id);
    END IF;

    PERFORM refresh_king_badge_slot(sk);
    RETURN NEW;
  END IF;

  -- User claim (original)
  IF NEW.claim_scope = 'city' AND NEW.city_name IS NOT NULL THEN
    city_part := lower(regexp_replace(trim(NEW.city_name), '\s+', '_', 'g'));
    sk := 'city|' || city_part || '|' || COALESCE(NEW.record_type_slug, 'custom') || '|' || NEW.area_kind;
  ELSIF NEW.claim_scope = 'court' AND NEW.court_id IS NOT NULL AND NEW.record_type_slug IS NOT NULL THEN
    sk := 'court|' || NEW.court_id::text || '|' || NEW.record_type_slug;
  ELSE
    RETURN NEW;
  END IF;

  SELECT id INTO ex_id FROM king_leaderboard_entries
  WHERE scope_key = sk AND entry_type = 'user' AND user_id = NEW.user_id;

  IF ex_id IS NOT NULL THEN
    UPDATE king_leaderboard_entries SET
      score_value = CASE
        WHEN hib THEN GREATEST(king_leaderboard_entries.score_value, NEW.claimed_score_value)
        ELSE LEAST(king_leaderboard_entries.score_value, NEW.claimed_score_value)
      END,
      king_claim_application_id = NEW.id,
      updated_at = now()
    WHERE id = ex_id;
  ELSE
    INSERT INTO king_leaderboard_entries (scope_key, entry_type, user_id, team_id, score_value, higher_is_better, king_claim_application_id)
    VALUES (sk, 'user', NEW.user_id, NULL, NEW.claimed_score_value, hib, NEW.id);
  END IF;

  PERFORM refresh_king_badge_slot(sk);
  RETURN NEW;
END;
$$;
