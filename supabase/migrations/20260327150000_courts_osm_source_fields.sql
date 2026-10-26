-- Add source metadata so imported OSM places can be deduped and maintained.
ALTER TABLE public.courts
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS source_ref TEXT,
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'courts_source_check'
  ) THEN
    ALTER TABLE public.courts
      ADD CONSTRAINT courts_source_check
      CHECK (source IN ('user', 'admin', 'osm'));
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_courts_source_ref_unique
  ON public.courts (source_ref)
  WHERE source_ref IS NOT NULL;
