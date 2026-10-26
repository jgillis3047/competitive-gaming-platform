# Troubleshoot: Post images not loading

**If files in Storage show 0 bytes:** The upload was creating empty files (e.g. `fetch(localUri)` on React Native returns an empty body). The app now reads the file with `expo-file-system` before upload. Create a **new** post with a photo and confirm the new file in Storage has a non-zero size.

Do these steps in order. Stop when something fails and fix that.

---

## 1. Confirm the app’s Supabase project

- Open your app’s env (e.g. `.env`) or `app.config.js` / `app.json` and note **EXPO_PUBLIC_SUPABASE_URL** (e.g. `https://xxxxx.supabase.co`).
- In the browser, go to [Supabase Dashboard](https://supabase.com/dashboard) and open the project whose URL matches that exactly.

---

## 2. Check that files exist in Storage

- In that project: **Storage** → open the **media** bucket.
- Open the **posts** folder.
- You should see a folder named with a user UUID (e.g. `30afa565-eef5-4e56-a388-18fa04357853`). Open it.
- You should see image files (e.g. `1773544972750.jpg`).

**If you don’t see `posts` or the user folder or the file:**  
Uploads aren’t landing there (wrong project, wrong bucket, or upload failing). Fix uploads / project config first, then retry.

---

## 3. Test one file’s URL in the browser

- In **Storage** → **media** → **posts** → [user folder], click one image file.
- Copy its **Public URL** (or “Get public URL”).
- Paste that URL into a new browser tab (Safari/Chrome).

- **Image loads** → Storage is fine; the issue is in the app (we can focus on client next).
- **403 / Access denied** → Go to step 4.
- **404 / Not found** → File path or project is wrong; re-check step 1 and 2.

---

## 4. Make the media bucket readable (fix 403)

- In the same project: **Storage** → **Policies** (or **media** bucket → **Policies**).
- Ensure there is a policy that allows **SELECT** (read) on the **media** bucket for everyone (e.g. role `public` or `anon`).
- If the bucket is “Public” but there’s no such policy, add one (e.g. “Allow public read” for bucket `media`).
- Save, then repeat step 3 with the same URL.

---

## 5. Confirm bucket name and env

- The app uses the bucket named **media** (not `post-media`). In Storage you must have a bucket **media** with the files under `posts/...`.
- After any env change (**EXPO_PUBLIC_SUPABASE_URL** or **EXPO_PUBLIC_SUPABASE_ANON_KEY**), restart the dev server: `npx expo start --clear`.

---

**Quick recap**

| Step | What to do |
|------|------------|
| 1 | Match app’s Supabase URL to the dashboard project. |
| 2 | In that project, Storage → media → posts → [user-id]: file exists? |
| 3 | Copy file’s Public URL → open in browser. Loads / 403 / 404? |
| 4 | If 403: add SELECT policy for media bucket, retry step 3. |
| 5 | Bucket name = **media**; restart app after env changes. |
