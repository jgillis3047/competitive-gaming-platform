-- Aggregated social proof for feed challenge cards (per game_type, normalized lower(trim)).
CREATE OR REPLACE FUNCTION public.get_feed_game_stats()
RETURNS TABLE (
  game_type_key text,
  plays_today bigint,
  last_winner_username text,
  last_winner_prize_cents int,
  avg_duration_sec double precision
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH completed AS (
    SELECT
      lower(trim(c.game_type)) AS gk,
      c.created_at,
      c.completed_at,
      c.winner_user_id,
      c.win_reward_cents
    FROM public.challenges c
    WHERE c.status = 'completed'
      AND c.completed_at IS NOT NULL
      AND c.game_type IS NOT NULL
      AND length(trim(c.game_type)) > 0
  ),
  utc_day_start AS (
    SELECT (date_trunc('day', clock_timestamp() AT TIME ZONE 'utc') AT TIME ZONE 'utc') AS t
  ),
  plays_today AS (
    SELECT c.gk, count(*)::bigint AS n
    FROM completed c
    CROSS JOIN utc_day_start u
    WHERE c.completed_at >= u.t
    GROUP BY c.gk
  ),
  last_winner AS (
    SELECT DISTINCT ON (c.gk)
      c.gk,
      c.winner_user_id,
      c.win_reward_cents
    FROM completed c
    WHERE c.winner_user_id IS NOT NULL
    ORDER BY c.gk, c.completed_at DESC
  ),
  last_winner_profile AS (
    SELECT
      lw.gk,
      coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.username), '')) AS winner_display,
      lw.win_reward_cents
    FROM last_winner lw
    LEFT JOIN public.profiles p ON p.id = lw.winner_user_id
  ),
  avg_dur AS (
    SELECT
      c.gk,
      avg(extract(epoch FROM (c.completed_at - c.created_at)))::double precision AS avg_sec
    FROM completed c
    WHERE c.created_at IS NOT NULL
      AND c.completed_at IS NOT NULL
      AND c.completed_at >= (clock_timestamp() AT TIME ZONE 'utc') - interval '30 days'
      AND (c.completed_at - c.created_at) <= interval '7 days'
      AND (c.completed_at - c.created_at) > interval '0 seconds'
    GROUP BY c.gk
  )
  SELECT
    c.gk::text AS game_type_key,
    coalesce(pt.n, 0::bigint) AS plays_today,
    lwp.winner_display AS last_winner_username,
    lwp.win_reward_cents::int AS last_winner_prize_cents,
    ad.avg_sec AS avg_duration_sec
  FROM (SELECT DISTINCT gk FROM completed) c
  LEFT JOIN plays_today pt ON pt.gk = c.gk
  LEFT JOIN last_winner_profile lwp ON lwp.gk = c.gk
  LEFT JOIN avg_dur ad ON ad.gk = c.gk;
$$;

GRANT EXECUTE ON FUNCTION public.get_feed_game_stats() TO anon, authenticated;
