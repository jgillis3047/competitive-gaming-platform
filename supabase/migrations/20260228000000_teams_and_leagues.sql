-- Teams and Leagues: full schema
-- Teams
CREATE TABLE IF NOT EXISTS "public"."teams" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "name" text NOT NULL,
  "slug" text,
  "description" text,
  "avatar_url" text,
  "created_by" uuid NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS teams_slug_uidx ON "public"."teams"("slug") WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS teams_created_by_idx ON "public"."teams"("created_by");

-- Team members (owner, admin, member)
CREATE TABLE IF NOT EXISTS "public"."team_members" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "team_id" uuid NOT NULL REFERENCES "public"."teams"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
  "role" text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  "joined_at" timestamptz DEFAULT now() NOT NULL,
  UNIQUE("team_id", "user_id")
);
CREATE INDEX IF NOT EXISTS team_members_team_id_idx ON "public"."team_members"("team_id");
CREATE INDEX IF NOT EXISTS team_members_user_id_idx ON "public"."team_members"("user_id");

-- Leagues (1v1, team, or both)
CREATE TABLE IF NOT EXISTS "public"."leagues" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "name" text NOT NULL,
  "slug" text,
  "description" text,
  "avatar_url" text,
  "created_by" uuid NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
  "kind" text NOT NULL DEFAULT '1v1' CHECK (kind IN ('1v1', 'team', 'both')),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS leagues_slug_uidx ON "public"."leagues"("slug") WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS leagues_created_by_idx ON "public"."leagues"("created_by");

-- League members (for 1v1 leagues - individuals join)
CREATE TABLE IF NOT EXISTS "public"."league_members" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "league_id" uuid NOT NULL REFERENCES "public"."leagues"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
  "joined_at" timestamptz DEFAULT now() NOT NULL,
  UNIQUE("league_id", "user_id")
);
CREATE INDEX IF NOT EXISTS league_members_league_id_idx ON "public"."league_members"("league_id");
CREATE INDEX IF NOT EXISTS league_members_user_id_idx ON "public"."league_members"("user_id");

-- League teams (for team leagues - teams join)
CREATE TABLE IF NOT EXISTS "public"."league_teams" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "league_id" uuid NOT NULL REFERENCES "public"."leagues"("id") ON DELETE CASCADE,
  "team_id" uuid NOT NULL REFERENCES "public"."teams"("id") ON DELETE CASCADE,
  "joined_at" timestamptz DEFAULT now() NOT NULL,
  UNIQUE("league_id", "team_id")
);
CREATE INDEX IF NOT EXISTS league_teams_league_id_idx ON "public"."league_teams"("league_id");
CREATE INDEX IF NOT EXISTS league_teams_team_id_idx ON "public"."league_teams"("team_id");

-- Extend challenges: team vs team and league
ALTER TABLE "public"."challenges" ADD COLUMN IF NOT EXISTS "creator_team_id" uuid REFERENCES "public"."teams"("id") ON DELETE SET NULL;
ALTER TABLE "public"."challenges" ADD COLUMN IF NOT EXISTS "opponent_team_id" uuid REFERENCES "public"."teams"("id") ON DELETE SET NULL;
ALTER TABLE "public"."challenges" ADD COLUMN IF NOT EXISTS "league_id" uuid REFERENCES "public"."leagues"("id") ON DELETE SET NULL;
ALTER TABLE "public"."challenges" ADD COLUMN IF NOT EXISTS "winner_team_id" uuid REFERENCES "public"."teams"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS challenges_creator_team_id_idx ON "public"."challenges"("creator_team_id");
CREATE INDEX IF NOT EXISTS challenges_opponent_team_id_idx ON "public"."challenges"("opponent_team_id");
CREATE INDEX IF NOT EXISTS challenges_league_id_idx ON "public"."challenges"("league_id");

-- Extend challenge_players: which team (for team matches)
ALTER TABLE "public"."challenge_players" ADD COLUMN IF NOT EXISTS "team_id" uuid REFERENCES "public"."teams"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS challenge_players_team_id_idx ON "public"."challenge_players"("team_id");

-- RLS: teams
ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "teams_select" ON "public"."teams";
CREATE POLICY "teams_select" ON "public"."teams" FOR SELECT TO "authenticated" USING (true);
DROP POLICY IF EXISTS "teams_insert_own" ON "public"."teams";
CREATE POLICY "teams_insert_own" ON "public"."teams" FOR INSERT TO "authenticated" WITH CHECK (created_by = auth.uid());
DROP POLICY IF EXISTS "teams_update_owner_or_admin" ON "public"."teams";
CREATE POLICY "teams_update_owner_or_admin" ON "public"."teams" FOR UPDATE TO "authenticated"
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM "public"."team_members" tm WHERE tm.team_id = teams.id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin'))
  )
  WITH CHECK (true);
DROP POLICY IF EXISTS "teams_delete_owner" ON "public"."teams";
CREATE POLICY "teams_delete_owner" ON "public"."teams" FOR DELETE TO "authenticated" USING (created_by = auth.uid());

-- RLS: team_members
ALTER TABLE "public"."team_members" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "team_members_select" ON "public"."team_members";
CREATE POLICY "team_members_select" ON "public"."team_members" FOR SELECT TO "authenticated" USING (true);
DROP POLICY IF EXISTS "team_members_insert_owner_admin" ON "public"."team_members";
CREATE POLICY "team_members_insert_owner_admin" ON "public"."team_members" FOR INSERT TO "authenticated"
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM "public"."team_members" tm WHERE tm.team_id = team_members.team_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin'))
  );
DROP POLICY IF EXISTS "team_members_delete_own_or_admin" ON "public"."team_members";
CREATE POLICY "team_members_delete_own_or_admin" ON "public"."team_members" FOR DELETE TO "authenticated"
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM "public"."team_members" tm WHERE tm.team_id = team_members.team_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin'))
  );

-- RLS: leagues
ALTER TABLE "public"."leagues" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leagues_select" ON "public"."leagues";
CREATE POLICY "leagues_select" ON "public"."leagues" FOR SELECT TO "authenticated" USING (true);
DROP POLICY IF EXISTS "leagues_insert_own" ON "public"."leagues";
CREATE POLICY "leagues_insert_own" ON "public"."leagues" FOR INSERT TO "authenticated" WITH CHECK (created_by = auth.uid());
DROP POLICY IF EXISTS "leagues_update_owner" ON "public"."leagues";
CREATE POLICY "leagues_update_owner" ON "public"."leagues" FOR UPDATE TO "authenticated" USING (created_by = auth.uid()) WITH CHECK (true);
DROP POLICY IF EXISTS "leagues_delete_owner" ON "public"."leagues";
CREATE POLICY "leagues_delete_owner" ON "public"."leagues" FOR DELETE TO "authenticated" USING (created_by = auth.uid());

-- RLS: league_members
ALTER TABLE "public"."league_members" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "league_members_select" ON "public"."league_members";
CREATE POLICY "league_members_select" ON "public"."league_members" FOR SELECT TO "authenticated" USING (true);
DROP POLICY IF EXISTS "league_members_insert" ON "public"."league_members";
CREATE POLICY "league_members_insert" ON "public"."league_members" FOR INSERT TO "authenticated" WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "league_members_delete_own" ON "public"."league_members";
CREATE POLICY "league_members_delete_own" ON "public"."league_members" FOR DELETE TO "authenticated" USING (user_id = auth.uid());

-- RLS: league_teams (team owner/admin can add team to league; league owner can remove)
ALTER TABLE "public"."league_teams" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "league_teams_select" ON "public"."league_teams";
CREATE POLICY "league_teams_select" ON "public"."league_teams" FOR SELECT TO "authenticated" USING (true);
DROP POLICY IF EXISTS "league_teams_insert" ON "public"."league_teams";
CREATE POLICY "league_teams_insert" ON "public"."league_teams" FOR INSERT TO "authenticated"
  WITH CHECK (
    EXISTS (SELECT 1 FROM "public"."leagues" l WHERE l.id = league_teams.league_id AND l.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM "public"."team_members" tm WHERE tm.team_id = league_teams.team_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin'))
  );
DROP POLICY IF EXISTS "league_teams_delete" ON "public"."league_teams";
CREATE POLICY "league_teams_delete" ON "public"."league_teams" FOR DELETE TO "authenticated"
  USING (
    EXISTS (SELECT 1 FROM "public"."leagues" l WHERE l.id = league_teams.league_id AND l.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM "public"."team_members" tm WHERE tm.team_id = league_teams.team_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin'))
  );

-- Grants
GRANT ALL ON "public"."teams" TO "authenticated";
GRANT ALL ON "public"."team_members" TO "authenticated";
GRANT ALL ON "public"."leagues" TO "authenticated";
GRANT ALL ON "public"."league_members" TO "authenticated";
GRANT ALL ON "public"."league_teams" TO "authenticated";
