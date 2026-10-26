-- Seed sample trivia questions (run after 20260230200000_trivia.sql)
-- Uses category slugs to find category_id

INSERT INTO "public"."trivia_questions" (category_id, question_text, media_type, correct_answer, options, points, order_index)
SELECT c.id, 'Which tech company uses this logo?', 'none', 'Apple', '["Apple", "Microsoft", "Google", "Amazon"]'::jsonb, 100, 0
FROM "public"."trivia_categories" c WHERE c.slug = 'company_logos' LIMIT 1;
INSERT INTO "public"."trivia_questions" (category_id, question_text, media_type, correct_answer, options, points, order_index)
SELECT c.id, 'What brand is known for the swoosh?', 'none', 'Nike', '["Adidas", "Nike", "Puma", "Reebok"]'::jsonb, 100, 1
FROM "public"."trivia_categories" c WHERE c.slug = 'company_logos' LIMIT 1;
INSERT INTO "public"."trivia_questions" (category_id, question_text, media_type, correct_answer, options, points, order_index)
SELECT c.id, 'Which fast food chain has golden arches?', 'none', 'McDonald''s', '["Burger King", "McDonald''s", "Wendy''s", "KFC"]'::jsonb, 100, 2
FROM "public"."trivia_categories" c WHERE c.slug = 'company_logos' LIMIT 1;

INSERT INTO "public"."trivia_questions" (category_id, question_text, media_type, correct_answer, options, points, order_index)
SELECT c.id, 'Who sang "Bohemian Rhapsody"?', 'none', 'Queen', '["The Beatles", "Queen", "Led Zeppelin", "Pink Floyd"]'::jsonb, 100, 0
FROM "public"."trivia_categories" c WHERE c.slug = 'guess_song' LIMIT 1;
INSERT INTO "public"."trivia_questions" (category_id, question_text, media_type, correct_answer, options, points, order_index)
SELECT c.id, 'Which artist released "Thriller"?', 'none', 'Michael Jackson', '["Prince", "Michael Jackson", "Whitney Houston", "Janet Jackson"]'::jsonb, 100, 1
FROM "public"."trivia_categories" c WHERE c.slug = 'guess_song' LIMIT 1;

INSERT INTO "public"."trivia_questions" (category_id, question_text, media_type, correct_answer, options, points, order_index)
SELECT c.id, 'Who has won the most NBA championships as a player?', 'none', 'Bill Russell', '["Michael Jordan", "Bill Russell", "LeBron James", "Kobe Bryant"]'::jsonb, 100, 0
FROM "public"."trivia_categories" c WHERE c.slug = 'guess_player' LIMIT 1;
INSERT INTO "public"."trivia_questions" (category_id, question_text, media_type, correct_answer, options, points, order_index)
SELECT c.id, 'Which quarterback has the most Super Bowl MVP awards?', 'none', 'Tom Brady', '["Joe Montana", "Tom Brady", "Peyton Manning", "Terry Bradshaw"]'::jsonb, 100, 1
FROM "public"."trivia_categories" c WHERE c.slug = 'guess_player' LIMIT 1;
