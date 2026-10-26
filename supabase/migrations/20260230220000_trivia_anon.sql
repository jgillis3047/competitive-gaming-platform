-- Allow anonymous (guest) players to join trivia and play
CREATE POLICY "trivia_categories_select_anon" ON "public"."trivia_categories"
  FOR SELECT TO "anon" USING (true);

CREATE POLICY "trivia_questions_select_anon" ON "public"."trivia_questions"
  FOR SELECT TO "anon" USING (true);

CREATE POLICY "trivia_rooms_select_anon" ON "public"."trivia_rooms"
  FOR SELECT TO "anon" USING (true);

CREATE POLICY "trivia_participants_select_anon" ON "public"."trivia_participants"
  FOR SELECT TO "anon" USING (true);
CREATE POLICY "trivia_participants_insert_anon" ON "public"."trivia_participants"
  FOR INSERT TO "anon" WITH CHECK (true);
CREATE POLICY "trivia_participants_update_anon" ON "public"."trivia_participants"
  FOR UPDATE TO "anon" USING (true) WITH CHECK (true);

CREATE POLICY "trivia_answers_select_anon" ON "public"."trivia_answers"
  FOR SELECT TO "anon" USING (true);
CREATE POLICY "trivia_answers_insert_anon" ON "public"."trivia_answers"
  FOR INSERT TO "anon" WITH CHECK (true);

GRANT SELECT ON "public"."trivia_categories" TO "anon";
GRANT SELECT ON "public"."trivia_questions" TO "anon";
GRANT SELECT ON "public"."trivia_rooms" TO "anon";
GRANT SELECT, INSERT, UPDATE ON "public"."trivia_participants" TO "anon";
GRANT SELECT, INSERT ON "public"."trivia_answers" TO "anon";
