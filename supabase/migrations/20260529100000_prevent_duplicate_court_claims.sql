-- One physical place → one arena row. Block duplicate claims at overlapping GPS.

CREATE OR REPLACE FUNCTION public.haversine_meters(
  lat1 DOUBLE PRECISION,
  lng1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION,
  lng2 DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT 6371000.0 * 2 * asin(
    sqrt(
      LEAST(
        1.0::DOUBLE PRECISION,
        GREATEST(
          0.0::DOUBLE PRECISION,
          sin(radians(lat2 - lat1) / 2) * sin(radians(lat2 - lat1) / 2)
          + cos(radians(lat1)) * cos(radians(lat2))
            * sin(radians(lng2 - lng1) / 2) * sin(radians(lng2 - lng1) / 2)
        )
      )
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.find_court_at_claim_location(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_min_radius_m INT DEFAULT 150
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  distance_m DOUBLE PRECISION,
  verification_status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.name,
    c.slug,
    public.haversine_meters(p_lat, p_lng, c.lat, c.lng) AS distance_m,
    c.verification_status
  FROM courts c
  WHERE c.verification_status IS DISTINCT FROM 'rejected'
    AND public.haversine_meters(p_lat, p_lng, c.lat, c.lng)
      <= GREATEST(c.checkin_radius_m, p_min_radius_m)::DOUBLE PRECISION
  ORDER BY distance_m ASC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.find_court_at_claim_location(DOUBLE PRECISION, DOUBLE PRECISION, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_duplicate_court_claim()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  existing_id UUID;
  existing_name TEXT;
BEGIN
  SELECT c.id, c.name
  INTO existing_id, existing_name
  FROM courts c
  WHERE c.verification_status IS DISTINCT FROM 'rejected'
    AND c.id IS DISTINCT FROM NEW.id
    AND public.haversine_meters(NEW.lat, NEW.lng, c.lat, c.lng)
      <= GREATEST(c.checkin_radius_m, NEW.checkin_radius_m, 150)::DOUBLE PRECISION
  ORDER BY public.haversine_meters(NEW.lat, NEW.lng, c.lat, c.lng) ASC
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'court_already_exists:%:%', existing_id, existing_name
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS courts_prevent_duplicate_claim ON public.courts;
CREATE TRIGGER courts_prevent_duplicate_claim
  BEFORE INSERT ON public.courts
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_duplicate_court_claim();
