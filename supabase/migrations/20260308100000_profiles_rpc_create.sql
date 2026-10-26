-- RPC to create/update own profile (bypasses RLS via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.create_profile_for_self(
  p_username text,
  p_display_name text,
  p_phone text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := auth.uid();
  v_email text;
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_id LIMIT 1;

  INSERT INTO public.profiles (id, email, username, phone, display_name, rating)
  VALUES (
    v_id,
    v_email,
    NULLIF(TRIM(COALESCE(p_username, '')), ''),
    NULLIF(TRIM(COALESCE(p_phone, '')), ''),
    NULLIF(TRIM(COALESCE(p_display_name, '')), ''),
    1000
  )
  ON CONFLICT (id) DO UPDATE SET
    username = COALESCE(NULLIF(TRIM(EXCLUDED.username), ''), profiles.username),
    phone = COALESCE(NULLIF(TRIM(EXCLUDED.phone), ''), profiles.phone),
    display_name = COALESCE(NULLIF(TRIM(EXCLUDED.display_name), ''), profiles.display_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_profile_for_self(text, text, text) TO authenticated;
