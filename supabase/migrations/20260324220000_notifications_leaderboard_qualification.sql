-- Allow leaderboard_qualification notifications (cross-user insert via edge function + RLS)
DROP POLICY IF EXISTS "notifications_insert" ON "public"."notifications";

CREATE POLICY "notifications_insert" ON "public"."notifications"
FOR INSERT TO "authenticated"
WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM "public"."profiles" p
    WHERE p.id = auth.uid()
      AND p.is_admin = true
  )
  OR (
    type IN (
      'post_like',
      'post_comment',
      'challenge_accepted',
      'challenge_invite',
      'challenge_win',
      'new_follower',
      'badge_unlocked',
      'daily_reward',
      'score_submitted',
      'challenge_completed',
      'king_leaderboard_status',
      'leaderboard_qualification'
    )
    AND user_id != auth.uid()
  )
);
