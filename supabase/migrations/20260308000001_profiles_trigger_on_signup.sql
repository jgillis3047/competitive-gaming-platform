-- Auto-create profile row when a new auth user signs up (bypasses RLS)
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username text;
  v_phone text;
  v_display text;
BEGIN
  v_username := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'username', '')), '');
  v_phone   := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'phone', '')), '');
  v_display := COALESCE(v_username, SPLIT_PART(COALESCE(NEW.email, ''), '@', 1));

  INSERT INTO public.profiles (id, email, username, phone, display_name, rating)
  VALUES (
    NEW.id,
    NEW.email,
    v_username,
    v_phone,
    v_display,
    1000
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    username = COALESCE(EXCLUDED.username, profiles.username),
    phone = COALESCE(EXCLUDED.phone, profiles.phone),
    display_name = COALESCE(EXCLUDED.display_name, profiles.display_name);

  RETURN NEW;
END;
$$;

-- Trigger: run after auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile();
