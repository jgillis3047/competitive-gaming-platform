// lib/backend/mediaService.ts - Upload images and videos for posts
// Use legacy API: readAsStringAsync is deprecated in the main export in SDK 54.
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "./supabaseClient";

const MEDIA_BUCKET = "media";
const MAX_IMAGE_SIZE_MB = 10;
const MAX_VIDEO_SIZE_MB = 100;

export type MediaItem = {
  uri: string;
  mediaType: "image" | "video";
  width?: number;
  height?: number;
  durationMs?: number;
};

export type UploadedMedia = {
  storagePath: string;
  mediaType: "image" | "video";
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
};

function inferMediaType(uri: string): "image" | "video" {
  const lower = (uri ?? "").toLowerCase();
  if (
    lower.includes(".mp4") ||
    lower.includes(".mov") ||
    lower.includes(".webm") ||
    lower.includes("video/")
  )
    return "video";
  return "image";
}

function contentTypeFromUri(uri: string, mediaType: "image" | "video"): string {
  const lower = (uri ?? "").toLowerCase();
  if (mediaType === "video") {
    if (lower.includes(".mov")) return "video/quicktime";
    if (lower.includes(".webm")) return "video/webm";
    return "video/mp4";
  }
  if (lower.includes(".png")) return "image/png";
  if (lower.includes(".gif")) return "image/gif";
  if (lower.includes(".webp")) return "image/webp";
  return "image/jpeg";
}

function extFromUri(uri: string): string {
  const parts = (uri ?? "").split(".");
  const ext = parts.pop()?.toLowerCase();
  if (ext && ["jpg", "jpeg", "png", "gif", "webp", "mp4", "mov", "webm"].includes(ext))
    return ext;
  return "jpg";
}

/**
 * Upload a single image or video to Supabase storage.
 * Returns the storage path (e.g. "posts/userId/timestamp.ext").
 */
export async function uploadPostMedia(params: {
  userId: string;
  localUri: string;
  mediaType: "image" | "video";
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
}): Promise<UploadedMedia> {
  const { userId, localUri, mediaType, width, height, durationMs } = params;
  if (!userId || !localUri) throw new Error("Missing userId or localUri.");

  const ext = extFromUri(localUri);
  const path = `posts/${userId}/${Date.now()}.${ext}`;
  const contentType = contentTypeFromUri(localUri, mediaType);

  // On React Native, fetch(localUri) often returns an empty body for file:// URIs,
  // which produces 0-byte uploads. Read the file with expo-file-system instead.
  const encoding = FileSystem.EncodingType?.Base64 ?? "base64";
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding,
  });
  if (!base64 || base64.length === 0) {
    throw new Error("Could not read file. Try choosing the image again.");
  }
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const sizeMb = bytes.length / (1024 * 1024);
  const maxMb = mediaType === "video" ? MAX_VIDEO_SIZE_MB : MAX_IMAGE_SIZE_MB;
  if (sizeMb > maxMb) {
    throw new Error(`File too large. Max ${maxMb}MB for ${mediaType}s.`);
  }

  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, bytes, { upsert: true, contentType });

  if (error) {
    if (__DEV__) console.warn("[mediaService] upload failed:", error.message, "path:", path);
    throw new Error(error.message || "Upload failed. Is the Storage bucket \"media\" created and public?");
  }

  return {
    storagePath: path,
    mediaType,
    width: width ?? null,
    height: height ?? null,
    durationMs: durationMs ?? null,
  };
}

/** Proof video/image for King of the Court attempts (same bucket, separate prefix). */
export async function uploadCourtProofMedia(params: {
  userId: string;
  localUri: string;
  mediaType: "image" | "video";
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
}): Promise<UploadedMedia> {
  const { userId, localUri, mediaType, width, height, durationMs } = params;
  if (!userId || !localUri) throw new Error("Missing userId or localUri.");

  const ext = extFromUri(localUri);
  const path = `court-proofs/${userId}/${Date.now()}.${ext}`;
  const contentType = contentTypeFromUri(localUri, mediaType);

  const encoding = FileSystem.EncodingType?.Base64 ?? "base64";
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding,
  });
  if (!base64 || base64.length === 0) {
    throw new Error("Could not read file. Try choosing the image again.");
  }
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const sizeMb = bytes.length / (1024 * 1024);
  const maxMb = mediaType === "video" ? MAX_VIDEO_SIZE_MB : MAX_IMAGE_SIZE_MB;
  if (sizeMb > maxMb) {
    throw new Error(`File too large. Max ${maxMb}MB for ${mediaType}s.`);
  }

  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, bytes, { upsert: true, contentType });

  if (error) {
    if (__DEV__) console.warn("[mediaService] court proof upload failed:", error.message, "path:", path);
    throw new Error(error.message || "Upload failed.");
  }

  return {
    storagePath: path,
    mediaType,
    width: width ?? null,
    height: height ?? null,
    durationMs: durationMs ?? null,
  };
}

/** Live photos taken when claiming a new arena. */
export async function uploadArenaPhotoMedia(params: {
  userId: string;
  localUri: string;
}): Promise<UploadedMedia> {
  const { userId, localUri } = params;
  if (!userId || !localUri) throw new Error("Missing userId or localUri.");

  const ext = extFromUri(localUri);
  const path = `arena-photos/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const contentType = contentTypeFromUri(localUri, "image");

  const encoding = FileSystem.EncodingType?.Base64 ?? "base64";
  const base64 = await FileSystem.readAsStringAsync(localUri, { encoding });
  if (!base64 || base64.length === 0) throw new Error("Could not read photo.");
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  const sizeMb = bytes.length / (1024 * 1024);
  if (sizeMb > MAX_IMAGE_SIZE_MB) throw new Error(`File too large. Max ${MAX_IMAGE_SIZE_MB}MB.`);

  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, bytes, { upsert: true, contentType });
  if (error) throw new Error(error.message || "Upload failed.");

  return { storagePath: path, mediaType: "image", width: null, height: null, durationMs: null };
}

/** Screenshot / clip proof for e-game match results. */
export async function uploadEgameProofMedia(params: {
  userId: string;
  localUri: string;
  mediaType: "image" | "video";
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
}): Promise<UploadedMedia> {
  const { userId, localUri, mediaType, width, height, durationMs } = params;
  if (!userId || !localUri) throw new Error("Missing userId or localUri.");

  const ext = extFromUri(localUri);
  const path = `egame-proofs/${userId}/${Date.now()}.${ext}`;
  const contentType = contentTypeFromUri(localUri, mediaType);

  const encoding = FileSystem.EncodingType?.Base64 ?? "base64";
  const base64 = await FileSystem.readAsStringAsync(localUri, { encoding });
  if (!base64 || base64.length === 0) throw new Error("Could not read file.");
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  const sizeMb = bytes.length / (1024 * 1024);
  const maxMb = mediaType === "video" ? MAX_VIDEO_SIZE_MB : MAX_IMAGE_SIZE_MB;
  if (sizeMb > maxMb) throw new Error(`File too large. Max ${maxMb}MB for ${mediaType}s.`);

  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, bytes, { upsert: true, contentType });
  if (error) throw new Error(error.message || "Upload failed.");

  return { storagePath: path, mediaType, width: width ?? null, height: height ?? null, durationMs: durationMs ?? null };
}

/** Proof bundle for King claim applications (same bucket). */
export async function uploadKingClaimMedia(params: {
  userId: string;
  localUri: string;
  mediaType: "image" | "video";
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
}): Promise<UploadedMedia> {
  const { userId, localUri, mediaType, width, height, durationMs } = params;
  if (!userId || !localUri) throw new Error("Missing userId or localUri.");

  const ext = extFromUri(localUri);
  const path = `king-claims/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const contentType = contentTypeFromUri(localUri, mediaType);

  const encoding = FileSystem.EncodingType?.Base64 ?? "base64";
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding,
  });
  if (!base64 || base64.length === 0) {
    throw new Error("Could not read file. Try choosing the image again.");
  }
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const sizeMb = bytes.length / (1024 * 1024);
  const maxMb = mediaType === "video" ? MAX_VIDEO_SIZE_MB : MAX_IMAGE_SIZE_MB;
  if (sizeMb > maxMb) {
    throw new Error(`File too large. Max ${maxMb}MB for ${mediaType}s.`);
  }

  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, bytes, { upsert: true, contentType });

  if (error) {
    if (__DEV__) console.warn("[mediaService] king claim upload failed:", error.message, "path:", path);
    throw new Error(error.message || "Upload failed.");
  }

  return {
    storagePath: path,
    mediaType,
    width: width ?? null,
    height: height ?? null,
    durationMs: durationMs ?? null,
  };
}

async function uploadMediaBytes(params: {
  localUri: string;
  mediaType: "image" | "video";
  maxMb: number;
}): Promise<Uint8Array> {
  const encoding = FileSystem.EncodingType?.Base64 ?? "base64";
  const base64 = await FileSystem.readAsStringAsync(params.localUri, { encoding });
  if (!base64 || base64.length === 0) throw new Error("Could not read file.");
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  const sizeMb = bytes.length / (1024 * 1024);
  if (sizeMb > params.maxMb) {
    throw new Error(`File too large. Max ${params.maxMb}MB for ${params.mediaType}s.`);
  }
  return bytes;
}

/** Multi-file match proof bundle (basketball, golf, in-person). */
export async function uploadMatchProofMedia(params: {
  userId: string;
  localUri: string;
  mediaType: "image" | "video";
}): Promise<UploadedMedia> {
  const { userId, localUri, mediaType } = params;
  if (!userId || !localUri) throw new Error("Missing userId or localUri.");

  const ext = extFromUri(localUri);
  const path = `match-proofs/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
  const contentType = contentTypeFromUri(localUri, mediaType);
  const maxMb = mediaType === "video" ? MAX_VIDEO_SIZE_MB : MAX_IMAGE_SIZE_MB;
  const bytes = await uploadMediaBytes({ localUri, mediaType, maxMb });

  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, bytes, { upsert: true, contentType });
  if (error) throw new Error(error.message || "Upload failed.");

  return { storagePath: path, mediaType, width: null, height: null, durationMs: null };
}

/** Basketball shooting session video for AI shot tracking. */
export async function uploadShootingSessionVideo(params: {
  userId: string;
  localUri: string;
}): Promise<UploadedMedia> {
  const { userId, localUri } = params;
  if (!userId || !localUri) throw new Error("Missing userId or localUri.");

  const ext = extFromUri(localUri);
  const path = `shooting-sessions/${userId}/${Date.now()}.${ext}`;
  const contentType = contentTypeFromUri(localUri, "video");
  const bytes = await uploadMediaBytes({ localUri, mediaType: "video", maxMb: MAX_VIDEO_SIZE_MB });

  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, bytes, { upsert: true, contentType });
  if (error) throw new Error(error.message || "Upload failed.");

  return { storagePath: path, mediaType: "video", width: null, height: null, durationMs: null };
}

/** Golf round proof (scorecard, tee video, putt video). */
export async function uploadGolfProofMedia(params: {
  userId: string;
  localUri: string;
  mediaType: "image" | "video";
}): Promise<UploadedMedia> {
  const { userId, localUri, mediaType } = params;
  if (!userId || !localUri) throw new Error("Missing userId or localUri.");

  const ext = extFromUri(localUri);
  const path = `golf-proofs/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
  const contentType = contentTypeFromUri(localUri, mediaType);
  const maxMb = mediaType === "video" ? MAX_VIDEO_SIZE_MB : MAX_IMAGE_SIZE_MB;
  const bytes = await uploadMediaBytes({ localUri, mediaType, maxMb });

  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, bytes, { upsert: true, contentType });
  if (error) throw new Error(error.message || "Upload failed.");

  return { storagePath: path, mediaType, width: null, height: null, durationMs: null };
}
