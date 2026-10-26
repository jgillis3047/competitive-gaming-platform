-- Allow challenge kind 'egame' (e-sports / online games)
ALTER TABLE public.challenges
  DROP CONSTRAINT IF EXISTS challenges_kind_check;

ALTER TABLE public.challenges
  ADD CONSTRAINT challenges_kind_check
  CHECK (kind = ANY (ARRAY['phone'::text, 'in_person'::text, 'admin_event'::text, 'egame'::text]));
