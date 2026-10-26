ALTER TABLE public.challenges
ADD COLUMN IF NOT EXISTS show_competitor_names_public boolean NOT NULL DEFAULT true;
