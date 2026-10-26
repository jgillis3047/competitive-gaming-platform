-- Allow auth user deletion: challenges.opponent_user_id and winner_user_id
-- referenced auth.users without ON DELETE, defaulting to RESTRICT.
-- Change to ON DELETE SET NULL so account deletion can succeed.
ALTER TABLE "public"."challenges"
  DROP CONSTRAINT IF EXISTS "challenges_opponent_user_id_fkey",
  DROP CONSTRAINT IF EXISTS "challenges_winner_user_id_fkey";

ALTER TABLE "public"."challenges"
  ADD CONSTRAINT "challenges_opponent_user_id_fkey"
    FOREIGN KEY ("opponent_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE "public"."challenges"
  ADD CONSTRAINT "challenges_winner_user_id_fkey"
    FOREIGN KEY ("winner_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
