// lib/backend/notifications.ts - In-app notifications + optional push
import type { NotificationType } from "./notificationTypes";
import { sendsPush } from "./notificationTypes";
import { supabase } from "./supabaseClient";
import { devError, devWarn } from "../utils/devLog";

async function parseFunctionErrorDetails(error: unknown): Promise<string | undefined> {
  const e = error as any;
  const response = e?.context;
  if (!response || typeof response.text !== "function") return undefined;
  try {
    const text = await response.text();
    return text || undefined;
  } catch {
    return undefined;
  }
}

function isFunctionNotFound(details?: string): boolean {
  if (!details) return false;
  try {
    const parsed = JSON.parse(details) as { code?: string; message?: string };
    return parsed.code === "NOT_FOUND" || /not found/i.test(String(parsed.message ?? ""));
  } catch {
    return /not found/i.test(details);
  }
}

export type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
};

/** List notifications for the current user (newest first). */
export async function listNotifications(userId: string, limit = 50): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as NotificationRow[];
}

/** Mark a notification as read. */
export async function markNotificationRead(notificationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", notificationId)
    .eq("user_id", userId);
  if (error) throw error;
}

/** Mark all notifications as read for user. */
export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", userId);
  if (error) throw error;
}

/** Create a notification (direct insert). Use for self or when RLS allows. For cross-user, use notifyUser which calls the edge function. */
export async function createNotification(params: {
  user_id: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
}): Promise<NotificationRow> {
  const { data, error } = await supabase
    .from("notifications")
    .insert({
      user_id: params.user_id,
      type: params.type,
      title: params.title,
      body: params.body ?? null,
      link: params.link ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as NotificationRow;
}

/**
 * Notify a user: create in-app notification and, if type is push-enabled, send push.
 * Use this for post likes, comments, challenge accepted so the bell list and push stay in sync.
 */
export async function notifyUser(params: {
  targetUserId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
}): Promise<void> {
  const { targetUserId, type, title, body, link } = params;
  try {
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.access_token) {
      devWarn("[notifyUser] No session, skipping in-app notification");
    } else {
      const { error } = await supabase.functions.invoke("create-notification", {
        body: {
          targetUserId,
          type,
          title,
          body: body ?? null,
          link: link ?? null,
        },
      });
      if (error) {
        const details = await parseFunctionErrorDetails(error);
        // Graceful fallback while edge function is not yet deployed.
        if (isFunctionNotFound(details)) {
          await createNotification({
            user_id: targetUserId,
            type,
            title,
            body: body ?? null,
            link: link ?? null,
          });
        } else {
          throw error;
        }
      }
    }
  } catch (e) {
    const details = await parseFunctionErrorDetails(e);
    devError("[notifyUser] createNotification failed", type, details ?? String(e));
  }
  if (sendsPush(type)) {
    const { sendPushToUser } = await import("./pushServiceSend");
    sendPushToUser({
      targetUserId,
      title,
      body: body ?? title,
      link: link ?? undefined,
    }).catch((err) => devWarn("[notifyUser] sendPush failed:", err));
  }
}
