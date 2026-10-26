-- RLS: team_members UPDATE (owner/admin can update role)
DROP POLICY IF EXISTS "team_members_update_owner_admin" ON "public"."team_members";
CREATE POLICY "team_members_update_owner_admin" ON "public"."team_members" FOR UPDATE TO "authenticated"
  USING (
    EXISTS (SELECT 1 FROM "public"."team_members" tm WHERE tm.team_id = team_members.team_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin'))
  )
  WITH CHECK (true);
