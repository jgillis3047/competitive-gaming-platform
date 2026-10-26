// lib/backend/threadActions.ts
import { supabase } from "./supabaseClient";

/**
 * Matches DB schema used in app/matches/thread/[id].tsx
 */
export type ThreadRow = {
  id: string;

  user_low: string;
  user_high: string;
  pair_key: string | null;

  last_preview: string | null;
  last_message_at: string | null;

  created_at: string | null;
};

// ✅ Core types you already use + prompt_* types
export type ThreadMessageType =
  | "text"
  | "system"
  // events (legacy)
  | "challenge_created"
  | "challenge_accepted"
  | "checked_in"
  | "check_in"
  | "both_checked_in"
  | "score_submitted"
  | "result_submitted"
  | "disputed"
  | "challenge_completed"
  | "payout_processed"
  | "cancelled"
  // prompts (actionable cards inside the thread)
  | "prompt_check_in"
  | "prompt_submit_result"
  | "prompt_play_turn"
  | "prompt_accept_rematch"
  | "prompt_confirm_result";

export type ThreadMessageRow = {
  id: string;
  thread_id: string;
  sender_id: string | null;
  type: ThreadMessageType | string;

  challenge_id: string | null;
  rematch_offer_id: string | null;

  payload: any | null;
  created_at: string | null;
};

function nowIso() {
  return new Date().toISOString();
}

function safePreview(text: string) {
  return String(text ?? "").trim().slice(0, 140);
}

/**
 * Best-effort: keep threads list fresh
 */
export async function upsertThreadPreview(threadId: string, preview: string): Promise<void> {
  const tid = String(threadId ?? "").trim();
  if (!tid) return;

  const p = safePreview(preview);

  // ✅ do not let preview updates crash the calling flow
  try {
    const { error } = await supabase
      .from("threads")
      .update({
        last_message_at: nowIso(),
        last_preview: p,
      })
      .eq("id", tid);

    if (error) {
      console.warn("[threadActions] upsertThreadPreview failed:", error.message);
    }
  } catch (e: any) {
    console.warn("[threadActions] upsertThreadPreview exception:", e?.message ?? e);
  }
}

/**
 * Source-of-truth resolver
 * Requires RPC: get_or_create_thread_by_users(a,b) -> thread id
 */
export async function getOrCreateThreadByUsers(u1: string, u2: string): Promise<string> {
  const a = String(u1 ?? "").trim();
  const b = String(u2 ?? "").trim();
  if (!a || !b) throw new Error("getOrCreateThreadByUsers missing user ids.");

  const { data, error } = await supabase.rpc("get_or_create_thread_by_users", { a, b });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("get_or_create_thread_by_users returned no thread id.");

  return String(data);
}

/**
 * List threads for a user (threads.user_low/user_high)
 */
export async function listThreadsForUser(userId: string, limit = 50): Promise<ThreadRow[]> {
  const uid = String(userId ?? "").trim();
  if (!uid) throw new Error("listThreadsForUser missing userId.");

  const { data, error } = await supabase
    .from("threads")
    .select("id,user_low,user_high,pair_key,last_preview,last_message_at,created_at")
    .or(`user_low.eq.${uid},user_high.eq.${uid}`)
    .order("last_message_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as any as ThreadRow[];
}

/**
 * Load messages for a thread (ascending for timeline)
 */
export async function listThreadMessages(params: {
  threadId: string;
  limit?: number;
  before?: string | null; // ISO cursor
}): Promise<ThreadMessageRow[]> {
  const { threadId, limit = 200, before } = params;

  const tid = String(threadId ?? "").trim();
  if (!tid) throw new Error("listThreadMessages missing threadId.");

  let q = supabase
    .from("thread_messages")
    .select("id,thread_id,sender_id,type,challenge_id,rematch_offer_id,payload,created_at")
    .eq("thread_id", tid)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (before) q = q.lt("created_at", String(before));

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as any as ThreadMessageRow[];
}

/**
 * Send a user text message
 */
export async function sendTextMessage(params: {
  threadId: string;
  senderId: string;
  text: string;
  challengeId?: string | null;
}): Promise<void> {
  const { threadId, senderId, text, challengeId } = params;

  const tid = String(threadId ?? "").trim();
  const sid = String(senderId ?? "").trim();
  const body = String(text ?? "").trim();

  if (!tid) throw new Error("sendTextMessage missing threadId.");
  if (!sid) throw new Error("sendTextMessage missing senderId.");
  if (!body) throw new Error("Message is empty.");

  const { error } = await supabase.from("thread_messages").insert({
    thread_id: tid,
    sender_id: sid,
    type: "text",
    challenge_id: challengeId ?? null,
    rematch_offer_id: null,
    payload: { text: body },
  });

  if (error) throw new Error(error.message);
  await upsertThreadPreview(tid, body);
}

/**
 * -------------------------------------------------------
 * ✅ GamePigeon thread behavior:
 * We DO NOT want "Open Challenge" buttons to appear from
 * random status events. So we normalize most active events
 * into type="system" while preserving the original event.
 * -------------------------------------------------------
 */
function normalizeEventType(typeRaw: ThreadMessageType | string): {
  type: string;
  originalType: string;
  isNormalized: boolean;
} {
  const t = String(typeRaw ?? "").toLowerCase();

  // Your current behavior: keep as-is (UI controls buttons)
  return { type: t || "system", originalType: t || "system", isNormalized: false };
}

/**
 * Append a system/event card into the thread timeline
 * Used by challengeActions.
 */
export async function appendThreadEvent(params: {
  threadId?: string;
  userAId?: string;
  userBId?: string;

  senderId?: string | null; // null = system
  type: ThreadMessageType | string;
  label: string;

  challengeId?: string | null;
  rematchOfferId?: string | null;
  payload?: any;

  /**
   * If true, bypass normalization and write the type exactly.
   * (Use sparingly; default is GamePigeon thread behavior.)
   */
  forceType?: boolean;
}): Promise<void> {
  const {
    threadId,
    userAId,
    userBId,
    senderId,
    type,
    label,
    challengeId,
    rematchOfferId,
    payload,
    forceType,
  } = params;

  let tid = threadId ? String(threadId).trim() : "";
  if (!tid) {
    if (!userAId || !userBId) {
      throw new Error("appendThreadEvent requires threadId OR (userAId + userBId).");
    }
    tid = await getOrCreateThreadByUsers(String(userAId), String(userBId));
  }

  const finalLabel = String(label ?? "").trim();
  const norm = forceType
    ? { type: String(type), originalType: String(type), isNormalized: false }
    : normalizeEventType(type);

  const mergedPayload = {
    label: finalLabel,
    ...(payload ?? {}),
    ...(norm.isNormalized ? { event_type: norm.originalType } : {}),
  };

  const { error } = await supabase.from("thread_messages").insert({
    thread_id: tid,
    sender_id: senderId ?? null,
    type: norm.type,
    challenge_id: challengeId ?? null,
    rematch_offer_id: rematchOfferId ?? null,
    payload: mergedPayload,
  });

  if (error) throw new Error(error.message);
  await upsertThreadPreview(tid, finalLabel);
}

/**
 * ✅ Prompt helpers (actionable cards in-thread)
 */
export function buildPromptId(params: {
  promptType: string;
  challengeId?: string | null;
  turnKey?: string | null; // also used for targetUserId keying
}) {
  const t = String(params.promptType ?? "").trim();
  const cid = params.challengeId ? String(params.challengeId).trim() : "";
  const tk = params.turnKey ? String(params.turnKey).trim() : "";
  return [t, cid, tk].filter(Boolean).join(":");
}

async function getOrCreateThreadId(params: {
  threadId?: string;
  userAId?: string;
  userBId?: string;
}): Promise<string> {
  const { threadId, userAId, userBId } = params;

  let tid = threadId ? String(threadId).trim() : "";
  if (!tid) {
    if (!userAId || !userBId) {
      throw new Error("Missing threadId and missing (userAId + userBId).");
    }
    tid = await getOrCreateThreadByUsers(String(userAId), String(userBId));
  }
  return tid;
}

export async function appendThreadPrompt(params: {
  threadId?: string;
  userAId?: string;
  userBId?: string;

  promptType: ThreadMessageType | string; // e.g. "prompt_check_in"
  promptId: string; // deterministic id for idempotency
  label: string;

  challengeId?: string | null;

  // who should see/respond (optional)
  targetUserId?: string | null;

  yesText?: string;
  noText?: string;

  rematchOfferId?: string | null; // ✅ should actually be written to rematch_offer_id
  payload?: any;
}): Promise<void> {
  const {
    threadId,
    userAId,
    userBId,
    promptType,
    promptId,
    label,
    challengeId,
    targetUserId,
    yesText,
    noText,
    rematchOfferId,
    payload,
  } = params;

  const tid = await getOrCreateThreadId({ threadId, userAId, userBId });

  const pid = String(promptId ?? "").trim();
  if (!pid) throw new Error("appendThreadPrompt missing promptId.");

  // ✅ Idempotent insert: check if this prompt already exists in this thread.
  // We also filter by type + challenge_id to avoid weird jsonb contains edge cases.
  const existQuery = supabase
    .from("thread_messages")
    .select("id")
    .eq("thread_id", tid)
    .eq("type", String(promptType))
    .contains("payload", { prompt_id: pid })
    .limit(1);

  // only add challenge filter if provided
  const { data: existing, error: existErr } =
    challengeId != null ? await existQuery.eq("challenge_id", challengeId) : await existQuery;

  if (existErr) throw new Error(existErr.message);
  if (existing?.length) return;

  const finalLabel = String(label ?? "").trim();

  const promptPayload = {
    label: finalLabel,
    kind: "prompt",
    prompt_id: pid,
    status: "open",
    target_user_id: targetUserId ?? null,
    yes_text: yesText ?? "Yes",
    no_text: noText ?? "No",
    ...(payload ?? {}),
  };

  const { error } = await supabase.from("thread_messages").insert({
    thread_id: tid,
    sender_id: null,
    type: String(promptType),
    challenge_id: challengeId ?? null,
    rematch_offer_id: rematchOfferId ?? null, // ✅ FIX (was hardcoded null)
    payload: promptPayload,
  });

  if (error) throw new Error(error.message);
  await upsertThreadPreview(tid, finalLabel);
}

export async function resolveThreadPrompt(params: {
  messageId: string;
  resolverUserId: string;
  resolution: "yes" | "no" | "dismiss";
  resolutionLabel?: string;
}): Promise<void> {
  const { messageId, resolverUserId, resolution, resolutionLabel } = params;

  const mid = String(messageId ?? "").trim();
  const rid = String(resolverUserId ?? "").trim();
  if (!mid || !rid) throw new Error("resolveThreadPrompt missing ids.");

  const { data: row, error: readErr } = await supabase
    .from("thread_messages")
    .select("id,payload")
    .eq("id", mid)
    .maybeSingle();

  if (readErr) throw new Error(readErr.message);
  const prev = (row as any)?.payload ?? {};

  const nextPayload = {
    ...(prev ?? {}),
    status: "resolved",
    resolved_by: rid,
    resolved_at: nowIso(),
    resolution,
    resolution_label: resolutionLabel ?? null,
  };

  const { error: upErr } = await supabase.from("thread_messages").update({ payload: nextPayload }).eq("id", mid);
  if (upErr) throw new Error(upErr.message);
}

/**
 * ✅ resolve a prompt by (thread + prompt_id) so backend flows can close prompts
 * without the UI needing to pass messageId.
 */
export async function resolveThreadPromptByPromptId(params: {
  threadId?: string;
  userAId?: string;
  userBId?: string;

  promptId: string;
  resolverUserId: string;
  resolution: "yes" | "no" | "dismiss";
  resolutionLabel?: string;
}): Promise<void> {
  const { promptId, resolverUserId, resolution, resolutionLabel, threadId, userAId, userBId } = params;

  const tid = await getOrCreateThreadId({ threadId, userAId, userBId });
  const pid = String(promptId ?? "").trim();
  const rid = String(resolverUserId ?? "").trim();
  if (!pid || !rid) return;

  const { data: rows, error } = await supabase
    .from("thread_messages")
    .select("id,payload")
    .eq("thread_id", tid)
    .contains("payload", { prompt_id: pid })
    .limit(1);

  if (error) throw new Error(error.message);
  if (!rows?.length) return;

  const row = rows[0] as any;
  const prev = row?.payload ?? {};

  if (String(prev?.status ?? "").toLowerCase() === "resolved") return;

  const nextPayload = {
    ...(prev ?? {}),
    status: "resolved",
    resolved_by: rid,
    resolved_at: nowIso(),
    resolution,
    resolution_label: resolutionLabel ?? null,
  };

  const { error: upErr } = await supabase.from("thread_messages").update({ payload: nextPayload }).eq("id", row.id);
  if (upErr) throw new Error(upErr.message);
}

export async function appendThreadSystemMessage(params: {
  threadId?: string;
  userAId?: string;
  userBId?: string;
  label: string;
  challengeId?: string | null;
  payload?: any;
}): Promise<void> {
  return appendThreadEvent({
    threadId: params.threadId,
    userAId: params.userAId,
    userBId: params.userBId,
    senderId: null,
    type: "system",
    label: params.label,
    challengeId: params.challengeId ?? null,
    payload: params.payload ?? {},
    forceType: true,
  });
}

/**
 * Convenience: opponent id from thread row
 */
export async function getOpponentIdInThread(params: {
  threadId: string;
  meId: string;
}): Promise<string | null> {
  const tid = String(params.threadId ?? "").trim();
  const mid = String(params.meId ?? "").trim();
  if (!tid || !mid) return null;

  const { data, error } = await supabase.from("threads").select("user_low,user_high").eq("id", tid).maybeSingle();
  if (error || !data) return null;

  const low = String((data as any).user_low ?? "");
  const high = String((data as any).user_high ?? "");
  if (!low || !high) return null;

  return low === mid ? high : low;
}
