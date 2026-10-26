// lib/backend/imageUrls.ts - Storage URLs that work for public AND private buckets
import { supabase } from "./supabaseClient";

const AVATARS_BUCKET = "avatars";
const MEDIA_BUCKET = "media";
const SIGNED_EXPIRY = 60 * 60 * 24 * 7; // 7 days

function isFullUrl(s: string): boolean {
  const t = (s ?? "").trim();
  return t.startsWith("http://") || t.startsWith("https://");
}

/** Extract storage path from full Supabase storage URL */
function pathFromStorageUrl(fullUrl: string, bucket: string): string | null {
  const match = fullUrl.match(new RegExp(`/storage/v1/object/public/${bucket}/(.+)$`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Get a working URL for avatar display.
 * Uses signed URL when possible; falls back to public URL.
 */
export async function getAvatarDisplayUrl(pathOrUrl: string | null | undefined): Promise<string> {
  const s = (pathOrUrl ?? "").trim();
  if (!s) return "";

  let path: string;
  if (isFullUrl(s)) {
    const extracted = pathFromStorageUrl(s, AVATARS_BUCKET);
    if (!extracted) return s;
    path = extracted;
  } else {
    path = s;
  }

  try {
    const { data, error } = await supabase.storage
      .from(AVATARS_BUCKET)
      .createSignedUrl(path, SIGNED_EXPIRY);

    if (!error && data?.signedUrl) return data.signedUrl;
  } catch (e) {
    if (__DEV__) console.warn("[imageUrls] avatar signed URL failed:", e);
  }
  const { data: pub } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);
  return pub?.publicUrl ?? s;
}

/**
 * Get a working URL for media display.
 * Uses signed URL when possible; falls back to public URL.
 */
export async function getMediaDisplayUrl(pathOrUrl: string | null | undefined): Promise<string> {
  const s = (pathOrUrl ?? "").trim();
  if (!s) return "";

  let path: string;
  if (isFullUrl(s)) {
    const extracted = pathFromStorageUrl(s, MEDIA_BUCKET);
    if (!extracted) return s;
    path = extracted;
  } else {
    path = s;
  }

  try {
    const { data, error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .createSignedUrl(path, SIGNED_EXPIRY);

    if (!error && data?.signedUrl) return data.signedUrl;
  } catch (e) {
    if (__DEV__) console.warn("[imageUrls] media signed URL failed:", e);
  }
  const { data: pub } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return pub?.publicUrl ?? s;
}

/** Sync: get public URL for media (path or full URL). */
export function toMediaPublicUrl(pathOrUrl: string | null | undefined): string {
  const s = (pathOrUrl ?? "").trim();
  if (!s) return "";
  if (isFullUrl(s)) return s;
  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(s);
  const url = data?.publicUrl ?? s;
  if (__DEV__ && url && !url.startsWith("http")) {
    console.warn("[imageUrls] media URL invalid (no http):", url.slice(0, 80));
  }
  return url;
}

/** Sync: get public URL for avatar (path or full URL). */
export function toAvatarPublicUrl(pathOrUrl: string | null | undefined): string {
  const s = (pathOrUrl ?? "").trim();
  if (!s) return "";
  if (isFullUrl(s)) return s;
  const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(s);
  const url = data?.publicUrl ?? s;
  if (__DEV__ && url && !url.startsWith("http")) {
    console.warn("[imageUrls] avatar URL invalid (no http):", url.slice(0, 80));
  }
  return url;
}

/** Append cache-bust query param to avoid serving cached 403/404 (stable per app session). */
let _cacheBust = 0;
export function cacheBustUrl(url: string): string {
  if (!url || !url.trim()) return url;
  if (!_cacheBust) _cacheBust = Date.now();
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}_=${_cacheBust}`;
}
