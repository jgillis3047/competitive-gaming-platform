-- Friend list helper: fetch profile cards by id array.
-- SECURITY DEFINER so it can read profile fields even when table RLS is strict.
CREATE OR REPLACE FUNCTION public.profiles_by_ids(p_ids uuid[])
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.username, p.display_name, p.avatar_url, p.created_at
  FROM public.profiles p
  WHERE p.id = ANY(p_ids);
$$;

GRANT EXECUTE ON FUNCTION public.profiles_by_ids(uuid[]) TO authenticated;

