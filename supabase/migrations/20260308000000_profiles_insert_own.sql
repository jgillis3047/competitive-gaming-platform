-- Allow authenticated users to insert their own profile row (needed for registration flow)
DROP POLICY IF EXISTS "profiles_insert_own" ON "public"."profiles";
CREATE POLICY "profiles_insert_own" ON "public"."profiles"
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
