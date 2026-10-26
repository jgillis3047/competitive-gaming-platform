-- Admin flag on profiles; in-app notifications table; admin can update seller status

-- 1) profiles.is_admin (set manually in Table Editor or via service_role for first admin)
ALTER TABLE "public"."profiles" ADD COLUMN IF NOT EXISTS "is_admin" boolean NOT NULL DEFAULT false;

-- 2) Notifications table
CREATE TABLE IF NOT EXISTS "public"."notifications" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "body" text,
  "link" text,
  "read" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON "public"."notifications"("user_id");
CREATE INDEX IF NOT EXISTS notifications_read_idx ON "public"."notifications"("read");
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON "public"."notifications"("created_at" DESC);

ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications_select_own" ON "public"."notifications";
CREATE POLICY "notifications_select_own" ON "public"."notifications" FOR SELECT TO "authenticated"
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS "notifications_update_own" ON "public"."notifications";
CREATE POLICY "notifications_update_own" ON "public"."notifications" FOR UPDATE TO "authenticated"
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
-- Insert: user can create for self (e.g. "Challenge accepted"); admin can create for any user
DROP POLICY IF EXISTS "notifications_insert_service" ON "public"."notifications";
CREATE POLICY "notifications_insert_own_or_admin" ON "public"."notifications" FOR INSERT TO "authenticated"
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM "public"."profiles" p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

GRANT INSERT ON "public"."notifications" TO "authenticated";
GRANT SELECT, UPDATE ON "public"."notifications" TO "authenticated";

-- 3) Allow admins to update seller status (approve/suspend)
DROP POLICY IF EXISTS "sellers_update" ON "public"."sellers";
CREATE POLICY "sellers_update" ON "public"."sellers" FOR UPDATE TO "authenticated"
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM "public"."profiles" p WHERE p.id = auth.uid() AND p.is_admin = true)
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM "public"."profiles" p WHERE p.id = auth.uid() AND p.is_admin = true)
  );
