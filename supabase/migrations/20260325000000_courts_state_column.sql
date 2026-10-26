-- Optional region label for browsing (e.g. NV, California)
ALTER TABLE public.courts ADD COLUMN IF NOT EXISTS state TEXT;

CREATE INDEX IF NOT EXISTS idx_courts_state ON public.courts(state);

UPDATE public.courts SET state = 'NV' WHERE city IS NOT NULL AND lower(city) LIKE '%las vegas%';
