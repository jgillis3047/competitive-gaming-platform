# Fix: Profile & post images not loading

If profile photos and post media show placeholders, or you see **nothing in the media bucket** in Storage:

## 0. Create the Storage buckets (if missing)

If **Storage** in Supabase Dashboard has **no "media" or "avatars" bucket**, create them:

1. **Supabase Dashboard** → **Storage** → **New bucket**.
2. Create bucket **media**: name = `media`, turn **Public bucket** ON → Create.
3. Create bucket **avatars**: name = `avatars`, turn **Public bucket** ON → Create.

Add policies so the app can upload and read (or run `npx supabase db push` to apply migrations):

- **media**: allow **INSERT** for authenticated users (path like `posts/<user_id>/...`), **SELECT** for everyone (public).
- **avatars**: allow **INSERT** for authenticated (path like `<user_id>/...`), **SELECT** for everyone.

**Why placeholders?** The app only saves a `storage_path` in the DB **after** a successful upload. If the bucket didn’t exist, uploads failed and no file was stored. Old `post_media` rows can point to paths that were never uploaded. After creating the bucket and making it public, **create a new post with a photo** and check **Storage → media → posts/** — you should see the new file.

## 1. Make storage buckets public

In **Supabase Dashboard** → **Storage**:

- Open the **avatars** bucket → **Settings** (or ⋮) → turn **Public bucket** **ON**.
- Open the **media** bucket → same → turn **Public bucket** **ON**.

Or run the migration (if your project allows it):

```bash
npx supabase db push
```

(Migration `20260315000000_avatars_bucket_public.sql` sets avatars to public; media is already public in `20260314000000_storage_media_bucket.sql`.)

## 2. Confirm URLs in the browser

After uploading a profile photo or post media:

1. In **Supabase Dashboard** → **Storage** → **avatars** or **media**, open a file and copy its **Public URL**.
2. Paste that URL into a browser tab.
   - If the image loads → buckets are public; the app should show it too (reload the app or pull-to-refresh).
   - If you get 403 or “Access denied” → the bucket is still private; repeat step 1.

## 3. Environment

Ensure the app uses the same project:

- **EXPO_PUBLIC_SUPABASE_URL**: `https://YOUR_PROJECT_REF.supabase.co`
- **EXPO_PUBLIC_SUPABASE_ANON_KEY**: from **Project Settings** → **API** → **anon public**

Restart the dev server after changing env (e.g. `npx expo start --clear`).

## 4. Bucket name: use **media**, not post-media

The app reads and writes post images to the bucket named **media** (see `mediaService.ts` and `imageUrls.ts`). A bucket named **post-media** is not used. You can delete **post-media** if you created it by mistake. Ensure the **media** bucket exists, is public, and has the correct policies.

## 5. If it still fails

- When an image fails to load, the app logs **`[PostCard] GET result: status X content-type Y`**. Use this to debug:
  - **status 403** → bucket or Storage policy is blocking read; ensure the **media** bucket is Public and has a SELECT policy for `storage.objects` (e.g. for role `public` or `anon`).
  - **status 404** → file not found at that path; confirm the file exists in **Storage → media → posts/&lt;user_id&gt;/** and the path in the DB matches.
  - **status 200** with **content-type image/jpeg** (or similar) → server is fine; the issue may be iOS/React Native loading (try on web or Android).
- In the terminal, check for `[imageUrls] media signed URL failed:` or similar.
- In **Supabase Dashboard** → **Storage** → **Policies**, ensure there is a policy allowing **SELECT** on `storage.objects` for the **media** bucket (e.g. name like "Allow public read" or "media_select_public", with `bucket_id = 'media'` and role `public` or `anon`).
