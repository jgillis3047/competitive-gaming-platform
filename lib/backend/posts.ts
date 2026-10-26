// lib/backend/posts.ts
import { supabase } from "./supabaseClient";
import { uploadPostMedia, type UploadedMedia } from "./mediaService";

export type Visibility = "public" | "private" | "friends" | string;

export type PostKind =
  | "post_game"
  | "highlight"
  | "admin_announcement"
  | "comment";

/** Media to upload before creating post (local URIs from picker) */
export type PendingMedia = {
  uri: string;
  mediaType: "image" | "video";
  width?: number;
  height?: number;
  durationMs?: number;
};

/**
 * DB rows
 */
export type PostRow = {
  id: string;
  user_id: string;
  challenge_id: string | null;
  parent_post_id?: string | null;
  body: string;
  created_at: string;
  visibility: string | null;
  payload: any; // jsonb NOT NULL in DB
  caption: string | null;
  kind: PostKind;
};

export type PostMediaRow = {
  id: string;
  post_id: string;
  user_id: string;
  media_type: string | null; // "image" | "video" etc
  storage_path: string | null;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  created_at: string;
  sort_order: number;
};

export type ProfileMini = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url?: string | null;
};

export type PostWithExtras = PostRow & {
  author?: ProfileMini | null;
  media?: PostMediaRow[];
  likeCount?: number;
  likedByMe?: boolean;
};

/**
 * Helpers
 */
function requireBodyOrMedia(body: string, media?: PendingMedia[] | null) {
  const trimmed = (body ?? "").trim();
  const hasMedia = Array.isArray(media) && media.length > 0;
  if (!trimmed && !hasMedia) throw new Error("Post body or at least one image/video is required.");
  return trimmed || " "; // DB may require non-null; use single space for media-only posts
}

/** Ensures NOT NULL jsonb (your DB enforces payload NOT NULL) */
function safePayload(payload: any) {
  if (payload === null || payload === undefined) return {};
  return payload;
}

/** Sort media consistently (post_media.sort_order ASC) */
function normalizePostsWithExtras(rows: any[]): PostWithExtras[] {
  return (rows ?? []).map((p) => ({
    ...p,
    media: Array.isArray(p.media)
      ? [...p.media].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      : [],
  })) as PostWithExtras[];
}

/**
 * CREATE
 */
export async function createChallengePost(params: {
  user_id: string;
  challenge_id: string;
  body: string;
  caption?: string | null;
  visibility?: Visibility | null;
  payload?: any;
  kind?: PostKind;
  media?: PendingMedia[] | null;
}) {
  const {
    user_id,
    challenge_id,
    body,
    caption = null,
    visibility = "private",
    payload,
    kind = "comment",
    media,
  } = params;

  const trimmed = requireBodyOrMedia(body, media);
  const uploaded: UploadedMedia[] = [];

  if (Array.isArray(media) && media.length > 0) {
    for (const m of media) {
      const u = await uploadPostMedia({
        userId: user_id,
        localUri: m.uri,
        mediaType: m.mediaType,
        width: m.width ?? null,
        height: m.height ?? null,
        durationMs: m.durationMs ?? null,
      });
      uploaded.push(u);
    }
  }

  const { data, error } = await supabase
    .from("posts")
    .insert({
      user_id,
      challenge_id,
      body: trimmed,
      caption,
      visibility,
      payload: safePayload(payload),
      kind,
    })
    .select("*")
    .single();

  if (error) throw error;
  const post = data as PostRow;

  for (let i = 0; i < uploaded.length; i++) {
    const u = uploaded[i];
    await supabase.from("post_media").insert({
      post_id: post.id,
      user_id,
      media_type: u.mediaType,
      storage_path: u.storagePath,
      width: u.width,
      height: u.height,
      duration_ms: u.durationMs,
      sort_order: i,
    });
  }

  return post;
}

export async function createGlobalPost(params: {
  user_id: string;
  body: string;
  caption?: string | null;
  visibility?: Visibility | null;
  payload?: any;
  kind?: PostKind;
  media?: PendingMedia[] | null;
}) {
  const {
    user_id,
    body,
    caption = null,
    visibility = "public",
    payload,
    kind = "comment",
    media,
  } = params;

  const trimmed = requireBodyOrMedia(body, media);
  const uploaded: UploadedMedia[] = [];

  if (Array.isArray(media) && media.length > 0) {
    for (const m of media) {
      const u = await uploadPostMedia({
        userId: user_id,
        localUri: m.uri,
        mediaType: m.mediaType,
        width: m.width ?? null,
        height: m.height ?? null,
        durationMs: m.durationMs ?? null,
      });
      uploaded.push(u);
    }
  }

  const { data, error } = await supabase
    .from("posts")
    .insert({
      user_id,
      challenge_id: null,
      body: trimmed,
      caption,
      visibility,
      payload: safePayload(payload),
      kind,
    })
    .select("*")
    .single();

  if (error) throw error;
  const post = data as PostRow;

  for (let i = 0; i < uploaded.length; i++) {
    const u = uploaded[i];
    await supabase.from("post_media").insert({
      post_id: post.id,
      user_id,
      media_type: u.mediaType,
      storage_path: u.storagePath,
      width: u.width,
      height: u.height,
      duration_ms: u.durationMs,
      sort_order: i,
    });
  }

  return post;
}

/**
 * READ: Challenge-specific posts (for /challenge/[id] feed)
 */
export async function fetchChallengePosts(challenge_id: string) {
  const { data, error } = await supabase
    .from("posts")
    .select(
      `
      *,
      author:profiles!posts_user_id_fkey(id, username, display_name, avatar_url),
      media:post_media(*)
    `
    )
    .eq("challenge_id", challenge_id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return normalizePostsWithExtras((data ?? []) as any[]);
}

/**
 * READ: Global-only feed (challenge_id IS NULL)
 * Keep this because your app already uses it in places.
 */
export async function fetchGlobalFeed(params?: { limit?: number }) {
  const limit = params?.limit ?? 50;

  const { data, error } = await supabase
    .from("posts")
    .select(
      `
      *,
      author:profiles!posts_user_id_fkey(id, username, display_name, avatar_url),
      media:post_media(*)
    `
    )
    .is("challenge_id", null)
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return normalizePostsWithExtras((data ?? []) as any[]);
}

/**
 * READ: Public feed (global + challenge highlights)
 * This is what your "Mixed" tab should use so post-game highlights show.
 */
export async function fetchPublicFeed(params?: {
  limit?: number;
  includeChallengePosts?: boolean; // default true
}) {
  const limit = params?.limit ?? 50;
  const includeChallengePosts = params?.includeChallengePosts ?? true;

  let q = supabase
    .from("posts")
    .select(
      `
      *,
      author:profiles!posts_user_id_fkey(id, username, display_name, avatar_url),
      media:post_media(*)
    `
    )
    .eq("visibility", "public")
    .is("parent_post_id", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  // optional "global-only"
  if (!includeChallengePosts) {
    q = q.is("challenge_id", null);
  }

  const { data, error } = await q;
  if (error) throw error;

  return normalizePostsWithExtras((data ?? []) as any[]);
}

/**
 * LIKES
 */
export async function togglePostLike(params: { postId: string; userId: string }) {
  const { postId, userId } = params;
  const { data: existing } = await supabase
    .from("post_likes")
    .select("id")
    .eq("post_id", postId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing?.id) {
    await supabase.from("post_likes").delete().eq("id", existing.id);
    return { liked: false };
  }
  await supabase.from("post_likes").insert({ post_id: postId, user_id: userId });
  return { liked: true };
}

/**
 * Search public posts by body or caption text
 */
export async function searchPosts(
  query: string,
  limit: number = 20
): Promise<PostWithExtras[]> {
  const q = (query ?? "").trim();
  if (q.length < 2) return [];

  const escaped = q.replace(/[%_\\]/g, "\\$&");
  const pattern = `%${escaped}%`;
  const { data, error } = await supabase
    .from("posts")
    .select(
      `
      *,
      author:profiles!posts_user_id_fkey(id, username, display_name, avatar_url),
      media:post_media(*)
    `
    )
    .eq("visibility", "public")
    .is("parent_post_id", null)
    .or(`body.ilike.%${escaped}%,caption.ilike.%${escaped}%`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return normalizePostsWithExtras((data ?? []) as any[]);
}

export async function getLikesForPosts(postIds: string[], userId?: string | null) {
  if (postIds.length === 0) return { counts: {} as Record<string, number>, liked: new Set<string>() };

  const { data: rows } = await supabase
    .from("post_likes")
    .select("post_id, user_id")
    .in("post_id", postIds);

  const counts: Record<string, number> = {};
  const liked = new Set<string>();
  for (const r of rows ?? []) {
    const pid = String(r.post_id ?? "");
    counts[pid] = (counts[pid] ?? 0) + 1;
    if (userId && String(r.user_id ?? "") === userId) liked.add(pid);
  }
  return { counts, liked };
}

/**
 * CREATE COMMENT (reply to a post)
 */
export async function createCommentPost(params: {
  user_id: string;
  parent_post_id: string;
  body: string;
  media?: PendingMedia[] | null;
}) {
  const { user_id, parent_post_id, body, media } = params;
  const trimmed = requireBodyOrMedia(body ?? "", media);
  const uploaded: UploadedMedia[] = [];

  if (Array.isArray(media) && media.length > 0) {
    for (const m of media) {
      const u = await uploadPostMedia({
        userId: user_id,
        localUri: m.uri,
        mediaType: m.mediaType,
        width: m.width ?? null,
        height: m.height ?? null,
        durationMs: m.durationMs ?? null,
      });
      uploaded.push(u);
    }
  }

  const { data, error } = await supabase
    .from("posts")
    .insert({
      user_id,
      challenge_id: null,
      parent_post_id,
      body: trimmed,
      visibility: "public",
      payload: {},
      kind: "comment",
    })
    .select("*")
    .single();

  if (error) throw error;
  const post = data as PostRow;

  for (let i = 0; i < uploaded.length; i++) {
    const u = uploaded[i];
    await supabase.from("post_media").insert({
      post_id: post.id,
      user_id,
      media_type: u.mediaType,
      storage_path: u.storagePath,
      width: u.width,
      height: u.height,
      duration_ms: u.durationMs,
      sort_order: i,
    });
  }

  return post;
}

/**
 * READ: Comments for a post
 */
export async function fetchCommentsForPost(parentPostId: string) {
  const { data, error } = await supabase
    .from("posts")
    .select(
      `
      *,
      author:profiles!posts_user_id_fkey(id, username, display_name, avatar_url),
      media:post_media(*)
    `
    )
    .eq("parent_post_id", parentPostId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return normalizePostsWithExtras((data ?? []) as any[]);
}

/**
 * READ: Convenience (one post)
 */
export async function fetchPostById(post_id: string) {
  const { data, error } = await supabase
    .from("posts")
    .select(
      `
      *,
      author:profiles!posts_user_id_fkey(id, username, display_name, avatar_url),
      media:post_media(*)
    `
    )
    .eq("id", post_id)
    .single();

  if (error) throw error;

  const normalized = normalizePostsWithExtras([data as any]);
  return normalized[0] ?? null;
}
