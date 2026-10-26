-- Allow users to create notifications for others when type is whitelisted (e.g. challenge_accepted)
DROP POLICY IF EXISTS "notifications_insert_own_or_admin" ON "public"."notifications";
CREATE POLICY "notifications_insert" ON "public"."notifications" FOR INSERT TO "authenticated"
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM "public"."profiles" p WHERE p.id = auth.uid() AND p.is_admin = true)
    OR (type IN ('challenge_accepted', 'score_submitted', 'challenge_completed') AND user_id != auth.uid())
  );
