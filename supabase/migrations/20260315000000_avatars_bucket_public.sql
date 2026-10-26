-- Ensure avatars bucket exists and is PUBLIC (required for profile photos to load)
-- Run: npx supabase db push (or apply in Supabase Dashboard SQL editor)

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;
