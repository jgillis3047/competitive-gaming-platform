-- Allow authenticated users to insert in-app notifications for other users
-- for the notification types created by the client (likes/comments/friends/etc).
--
-- Without this, inserts fail due to RLS, so the bell list stays empty.

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
      'challenge_completed'
    )
    AND user_id != auth.uid()
  )
);

