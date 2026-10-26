-- push_tokens: store Expo push tokens for users
CREATE TABLE IF NOT EXISTS "public"."push_tokens" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
  "token" text NOT NULL,
  "platform" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  UNIQUE("user_id", "token")
);
CREATE INDEX IF NOT EXISTS push_tokens_user_id_idx ON "public"."push_tokens"("user_id");

ALTER TABLE "public"."push_tokens" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_tokens_select_own" ON "public"."push_tokens";
CREATE POLICY "push_tokens_select_own" ON "public"."push_tokens" FOR SELECT TO "authenticated" USING ("user_id" = auth.uid());

DROP POLICY IF EXISTS "push_tokens_insert_own" ON "public"."push_tokens";
CREATE POLICY "push_tokens_insert_own" ON "public"."push_tokens" FOR INSERT TO "authenticated" WITH CHECK ("user_id" = auth.uid());

DROP POLICY IF EXISTS "push_tokens_delete_own" ON "public"."push_tokens";
CREATE POLICY "push_tokens_delete_own" ON "public"."push_tokens" FOR DELETE TO "authenticated" USING ("user_id" = auth.uid());
