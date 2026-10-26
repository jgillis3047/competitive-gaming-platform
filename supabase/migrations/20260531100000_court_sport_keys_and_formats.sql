-- Per-arena sport tagging + expanded basketball / team formats

ALTER TABLE courts
  ADD COLUMN IF NOT EXISTS sport_keys TEXT[] DEFAULT NULL;

COMMENT ON COLUMN courts.sport_keys IS
  'Sports actually available at this arena (e.g. basketball, fitness). NULL = infer from place_kind / OSM.';

-- New record types for expanded formats (client taxonomy also lists these)
INSERT INTO court_record_types (slug, title, description, higher_is_better, unit_label) VALUES
  ('three_v_three_to_21', '3v3 to 21', 'First team to 21 wins. Video proof encouraged.', TRUE, 'points'),
  ('five_v_five_full_court', '5v5 full court', 'Pickup game — winning team takes the crown.', TRUE, 'points'),
  ('twenty_one_1v1', '1v1 to 21', 'First to 21 wins. Make-it-take-it or win-by-2 — agree before tip.', TRUE, 'points'),
  ('knockout_survivor_rounds', 'Knockout rounds survived', 'Most consecutive knockout rounds without missing.', TRUE, 'rounds'),
  ('around_the_world_spots', 'Around the World spots', 'Most spots cleared in one run.', TRUE, 'spots')
ON CONFLICT (slug) DO NOTHING;

-- Backfill sport_keys from OSM description ("Sport: basketball" etc.)
UPDATE courts SET sport_keys = ARRAY['basketball']::TEXT[]
WHERE sport_keys IS NULL AND description ~* 'sport:\s*basketball';

UPDATE courts SET sport_keys = ARRAY['soccer']::TEXT[]
WHERE sport_keys IS NULL AND description ~* 'sport:\s*(soccer|football)';

UPDATE courts SET sport_keys = ARRAY['tennis']::TEXT[]
WHERE sport_keys IS NULL AND description ~* 'sport:\s*tennis';

UPDATE courts SET sport_keys = ARRAY['golf']::TEXT[]
WHERE sport_keys IS NULL AND description ~* 'sport:\s*golf';

UPDATE courts SET sport_keys = ARRAY['pickleball']::TEXT[]
WHERE sport_keys IS NULL AND description ~* 'sport:\s*pickleball';

UPDATE courts SET sport_keys = ARRAY['volleyball']::TEXT[]
WHERE sport_keys IS NULL AND description ~* 'sport:\s*volleyball';

UPDATE courts SET sport_keys = ARRAY['running']::TEXT[]
WHERE sport_keys IS NULL AND description ~* 'sport:\s*(running|athletics)';

UPDATE courts SET sport_keys = ARRAY['fitness']::TEXT[]
WHERE sport_keys IS NULL AND description ~* 'sport:\s*(fitness|weight)';

-- Gyms without explicit sport tags → fitness-only (no misleading basketball)
UPDATE courts
SET sport_keys = ARRAY['fitness']::TEXT[]
WHERE sport_keys IS NULL
  AND place_kind = 'gym';

-- Driving ranges
UPDATE courts
SET sport_keys = ARRAY['golf']::TEXT[]
WHERE sport_keys IS NULL
  AND place_kind = 'range';
