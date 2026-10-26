-- post_likes: who liked which post
CREATE TABLE IF NOT EXISTS "public"."post_likes" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "post_id" uuid NOT NULL REFERENCES "public"."posts"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  UNIQUE("post_id", "user_id")
);
CREATE INDEX IF NOT EXISTS post_likes_post_id_idx ON "public"."post_likes"("post_id");
CREATE INDEX IF NOT EXISTS post_likes_user_id_idx ON "public"."post_likes"("user_id");

-- parent_post_id for comments (replies to a post)
ALTER TABLE "public"."posts" ADD COLUMN IF NOT EXISTS "parent_post_id" uuid REFERENCES "public"."posts"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS posts_parent_post_id_idx ON "public"."posts"("parent_post_id");

-- RLS for post_likes
ALTER TABLE "public"."post_likes" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "post_likes_select" ON "public"."post_likes";
CREATE POLICY "post_likes_select" ON "public"."post_likes" FOR SELECT TO "authenticated" USING (true);

DROP POLICY IF EXISTS "post_likes_insert_own" ON "public"."post_likes";
CREATE POLICY "post_likes_insert_own" ON "public"."post_likes" FOR INSERT TO "authenticated" WITH CHECK ("user_id" = auth.uid());

DROP POLICY IF EXISTS "post_likes_delete_own" ON "public"."post_likes";
CREATE POLICY "post_likes_delete_own" ON "public"."post_likes" FOR DELETE TO "authenticated" USING ("user_id" = auth.uid());
