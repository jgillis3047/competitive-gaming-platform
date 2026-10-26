-- Group trivia: Kahoot-style for family nights / bars
-- Categories: company logos, guess the song, guess the player, etc.

-- Categories
CREATE TABLE IF NOT EXISTS "public"."trivia_categories" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "name" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "description" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
INSERT INTO "public"."trivia_categories" (name, slug, description) VALUES
  ('Company Logos', 'company_logos', 'Guess the brand from its logo'),
  ('Guess the Song', 'guess_song', 'Name that tune!'),
  ('Guess the Player', 'guess_player', 'Identify athletes from photos or stats')
ON CONFLICT (slug) DO NOTHING;

-- Questions (media_url = image or audio URL)
CREATE TABLE IF NOT EXISTS "public"."trivia_questions" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "category_id" uuid NOT NULL REFERENCES "public"."trivia_categories"("id") ON DELETE CASCADE,
  "question_text" text NOT NULL,
  "media_url" text,
  "media_type" text NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'audio', 'none')),
  "correct_answer" text NOT NULL,
  "options" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "points" integer NOT NULL DEFAULT 100,
  "order_index" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS trivia_questions_category_idx ON "public"."trivia_questions"("category_id");

-- Rooms (host creates, players join via code)
CREATE TABLE IF NOT EXISTS "public"."trivia_rooms" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "code" text NOT NULL UNIQUE,
  "host_user_id" uuid NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
  "category_id" uuid NOT NULL REFERENCES "public"."trivia_categories"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'in_progress', 'finished')),
  "current_question_index" integer NOT NULL DEFAULT 0,
  "total_questions" integer NOT NULL DEFAULT 5,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS trivia_rooms_code_idx ON "public"."trivia_rooms"("code");
CREATE INDEX IF NOT EXISTS trivia_rooms_host_idx ON "public"."trivia_rooms"("host_user_id");

-- Participants (players in a room)
CREATE TABLE IF NOT EXISTS "public"."trivia_participants" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "room_id" uuid NOT NULL REFERENCES "public"."trivia_rooms"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "public"."profiles"("id") ON DELETE SET NULL,
  "display_name" text NOT NULL,
  "score" integer NOT NULL DEFAULT 0,
  "joined_at" timestamptz DEFAULT now() NOT NULL,
  UNIQUE("room_id", "user_id")
);
CREATE INDEX IF NOT EXISTS trivia_participants_room_idx ON "public"."trivia_participants"("room_id");

-- Answers (one per participant per question)
CREATE TABLE IF NOT EXISTS "public"."trivia_answers" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "room_id" uuid NOT NULL REFERENCES "public"."trivia_rooms"("id") ON DELETE CASCADE,
  "participant_id" uuid NOT NULL REFERENCES "public"."trivia_participants"("id") ON DELETE CASCADE,
  "question_index" integer NOT NULL,
  "answer" text NOT NULL,
  "correct" boolean NOT NULL,
  "points" integer NOT NULL DEFAULT 0,
  "answered_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS trivia_answers_room_idx ON "public"."trivia_answers"("room_id");

-- RLS
ALTER TABLE "public"."trivia_categories" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trivia_categories_select" ON "public"."trivia_categories" FOR SELECT TO "authenticated" USING (true);

ALTER TABLE "public"."trivia_questions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trivia_questions_select" ON "public"."trivia_questions" FOR SELECT TO "authenticated" USING (true);

ALTER TABLE "public"."trivia_rooms" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trivia_rooms_select" ON "public"."trivia_rooms" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "trivia_rooms_insert" ON "public"."trivia_rooms" FOR INSERT TO "authenticated"
  WITH CHECK (host_user_id = auth.uid());
CREATE POLICY "trivia_rooms_update" ON "public"."trivia_rooms" FOR UPDATE TO "authenticated"
  USING (host_user_id = auth.uid());

ALTER TABLE "public"."trivia_participants" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trivia_participants_all" ON "public"."trivia_participants" FOR ALL TO "authenticated"
  USING (true)
  WITH CHECK (true);

ALTER TABLE "public"."trivia_answers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trivia_answers_all" ON "public"."trivia_answers" FOR ALL TO "authenticated"
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON "public"."trivia_categories" TO "authenticated";
GRANT SELECT ON "public"."trivia_questions" TO "authenticated";
GRANT ALL ON "public"."trivia_rooms" TO "authenticated";
GRANT ALL ON "public"."trivia_participants" TO "authenticated";
GRANT ALL ON "public"."trivia_answers" TO "authenticated";
