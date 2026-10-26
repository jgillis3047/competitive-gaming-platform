-- RPC for profile search to avoid PostgREST URL encoding issues with % in ilike patterns
CREATE OR REPLACE FUNCTION public.search_profiles(p_query text, p_limit int DEFAULT 20)
RETURNS SETOF public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pattern text;
BEGIN
  p_query := NULLIF(TRIM(p_query), '');
  IF p_query IS NULL OR LENGTH(p_query) < 2 THEN
    RETURN;
  END IF;
  v_pattern := '%' || REPLACE(p_query, ',', '') || '%';
  RETURN QUERY
  SELECT p.*
  FROM public.profiles p
  WHERE p.username ILIKE v_pattern
     OR p.display_name ILIKE v_pattern
     OR p.email ILIKE v_pattern
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_profiles(text, int) TO authenticated;
