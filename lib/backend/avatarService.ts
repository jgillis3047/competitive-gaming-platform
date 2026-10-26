// lib/backend/avatarService.ts
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "./supabaseClient";

const AVATARS_BUCKET = "avatars";

/**
 * Upload avatar image and update profiles.avatar_url.
 * Uses "avatars" bucket. Create it in Supabase Dashboard (Storage > New bucket) if needed.
 * Reads file with expo-file-system (fetch(localUri) returns empty body on RN).
 */
export async function uploadAvatar(params: {
  userId: string;
  localUri: string;
}): Promise<string> {
  const { userId, localUri } = params;
  if (!userId || !localUri) throw new Error("Missing userId or localUri.");

  const ext = localUri.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${userId}/${Date.now()}.${ext}`;
  const contentType = ext === "png" ? "image/png" : "image/jpeg";

  const encoding = FileSystem.EncodingType?.Base64 ?? "base64";
  const base64 = await FileSystem.readAsStringAsync(localUri, { encoding });
  if (!base64 || base64.length === 0) throw new Error("Could not read photo. Try choosing it again.");

  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

  const { error: uploadErr } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(path, bytes, { upsert: true, contentType });

  if (uploadErr) throw uploadErr;

  const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);
  const publicUrl = data?.publicUrl ?? "";

  const { error: updateErr } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl })
    .eq("id", userId);

  if (updateErr) throw updateErr;
  return publicUrl;
}

/**
 * Upload crew logo and update teams.avatar_url.
 */
export async function uploadTeamAvatar(params: {
  teamId: string;
  localUri: string;
}): Promise<string> {
  const { teamId, localUri } = params;
  if (!teamId || !localUri) throw new Error("Missing teamId or localUri.");

  const ext = localUri.split(".").pop()?.toLowerCase() || "jpg";
  const path = `teams/${teamId}/${Date.now()}.${ext}`;
  const contentType = ext === "png" ? "image/png" : "image/jpeg";

  const encoding = FileSystem.EncodingType?.Base64 ?? "base64";
  const base64 = await FileSystem.readAsStringAsync(localUri, { encoding });
  if (!base64 || base64.length === 0) throw new Error("Could not read photo. Try choosing it again.");

  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

  const { error: uploadErr } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(path, bytes, { upsert: true, contentType });

  if (uploadErr) throw uploadErr;

  const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);
  const publicUrl = data?.publicUrl ?? "";

  const { error: updateErr } = await supabase
    .from("teams")
    .update({ avatar_url: publicUrl })
    .eq("id", teamId);

  if (updateErr) throw updateErr;
  return publicUrl;
}

/**
 * Remove avatar (set profiles.avatar_url to null).
 */
export async function removeAvatar(userId: string): Promise<void> {
  if (!userId) throw new Error("Missing userId.");

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", userId);

  if (error) throw error;
}
