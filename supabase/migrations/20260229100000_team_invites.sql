-- Team invites: owner/admin can invite users; invitee can accept/decline
CREATE TABLE IF NOT EXISTS "public"."team_invites" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "team_id" uuid NOT NULL REFERENCES "public"."teams"("id") ON DELETE CASCADE,
  "invited_user_id" uuid NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
  "invited_by" uuid NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS team_invites_team_user_pending_uidx
  ON "public"."team_invites"("team_id", "invited_user_id")
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS team_invites_team_id_idx ON "public"."team_invites"("team_id");
CREATE INDEX IF NOT EXISTS team_invites_invited_user_id_idx ON "public"."team_invites"("invited_user_id");

-- RLS
ALTER TABLE "public"."team_invites" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_invites_select" ON "public"."team_invites";
CREATE POLICY "team_invites_select" ON "public"."team_invites" FOR SELECT TO "authenticated"
  USING (
    invited_user_id = auth.uid()
    OR invited_by = auth.uid()
    OR EXISTS (SELECT 1 FROM "public"."team_members" tm WHERE tm.team_id = team_invites.team_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin'))
  );

DROP POLICY IF EXISTS "team_invites_insert" ON "public"."team_invites";
CREATE POLICY "team_invites_insert" ON "public"."team_invites" FOR INSERT TO "authenticated"
  WITH CHECK (
    invited_by = auth.uid()
    AND EXISTS (SELECT 1 FROM "public"."team_members" tm WHERE tm.team_id = team_invites.team_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin'))
  );

DROP POLICY IF EXISTS "team_invites_update" ON "public"."team_invites";
CREATE POLICY "team_invites_update" ON "public"."team_invites" FOR UPDATE TO "authenticated"
  USING (invited_user_id = auth.uid() OR invited_by = auth.uid())
  WITH CHECK (true);

GRANT ALL ON "public"."team_invites" TO "authenticated";
