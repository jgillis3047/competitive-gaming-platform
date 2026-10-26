-- Per-shot arc validation + shooting session rule flags

ALTER TABLE public.tracked_shots
  ADD COLUMN IF NOT EXISTS behind_arc boolean,
  ADD COLUMN IF NOT EXISTS behind_arc_confidence numeric;

ALTER TABLE public.shooting_sessions
  ADD COLUMN IF NOT EXISTS video_duration_sec numeric,
  ADD COLUMN IF NOT EXISTS time_limit_sec integer,
  ADD COLUMN IF NOT EXISTS qualified_makes integer,
  ADD COLUMN IF NOT EXISTS rule_flags jsonb NOT NULL DEFAULT '[]'::jsonb;
