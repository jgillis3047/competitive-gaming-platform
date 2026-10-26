-- PostgREST upsert (?on_conflict=source_ref) needs a unique constraint that matches
-- ON CONFLICT (source_ref). A partial unique index does not qualify.

DROP INDEX IF EXISTS public.idx_courts_source_ref_unique;

-- Multiple NULL source_ref rows remain allowed (PostgreSQL UNIQUE treats NULLs as distinct).
CREATE UNIQUE INDEX IF NOT EXISTS courts_source_ref_unique
  ON public.courts (source_ref);
