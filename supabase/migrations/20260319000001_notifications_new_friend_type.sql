-- Rename friend notification type from legacy `new_follower` to `new_friend`.
-- Keep policy compatible with both while older clients upgrade.

UPDATE "public"."notifications"
SET "type" = 'new_friend'
WHERE "type" = 'new_follower';

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
      'new_friend',
      'new_follower',
      'badge_unlocked',
      'daily_reward',
      'score_submitted',
      'challenge_completed'
    )
    AND user_id != auth.uid()
  )
);

