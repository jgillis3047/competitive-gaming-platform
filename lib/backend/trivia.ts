// lib/backend/trivia.ts - Group trivia (Kahoot-style)
import { supabase } from "./supabaseClient";

export type TriviaCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
};

export type TriviaQuestion = {
  id: string;
  category_id: string;
  question_text: string;
  media_url: string | null;
  media_type: "image" | "audio" | "none";
  correct_answer: string;
  options: string[];
  points: number;
  order_index: number;
};

export type TriviaRoom = {
  id: string;
  code: string;
  host_user_id: string;
  category_id: string;
  status: "lobby" | "in_progress" | "finished";
  current_question_index: number;
  total_questions: number;
  created_at: string;
  category?: TriviaCategory;
};

export type TriviaParticipant = {
  id: string;
  room_id: string;
  user_id: string | null;
  display_name: string;
  score: number;
  joined_at: string;
};

function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/** List categories */
export async function listTriviaCategories(): Promise<TriviaCategory[]> {
  const { data, error } = await supabase
    .from("trivia_categories")
    .select("*")
    .order("name");
  if (error) throw error;
  return (data ?? []) as TriviaCategory[];
}

/** Get questions for a category. Pass roomId as seed so host and players get same order. */
export async function getTriviaQuestions(
  categoryId: string,
  limit: number,
  seed?: string
): Promise<TriviaQuestion[]> {
  const { data, error } = await supabase
    .from("trivia_questions")
    .select("*")
    .eq("category_id", categoryId)
    .order("order_index");
  if (error) throw error;
  const rows = (data ?? []) as any[];
  const mapped: TriviaQuestion[] = rows.map((r) => ({
    ...r,
    options: Array.isArray(r.options) ? r.options : [],
  }));
  // Deterministic shuffle when seed provided (e.g. roomId)
  const rng = seed ? seededRng(seed) : () => Math.random();
  for (let i = mapped.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [mapped[i], mapped[j]] = [mapped[j], mapped[i]];
  }
  return mapped.slice(0, limit);
}

function seededRng(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  return () => {
    h = (Math.imul(16807, h) + 1) | 0;
    return (Math.abs(h) % 1e7) / 1e7;
  };
}

/** Create a room */
export async function createTriviaRoom(params: {
  hostUserId: string;
  categoryId: string;
  totalQuestions?: number;
}): Promise<TriviaRoom> {
  const totalQuestions = Math.min(20, Math.max(3, params.totalQuestions ?? 5));
  let code = randomCode();
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data: existing } = await supabase
      .from("trivia_rooms")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (!existing) break;
    code = randomCode();
  }

  const { data, error } = await supabase
    .from("trivia_rooms")
    .insert({
      code,
      host_user_id: params.hostUserId,
      category_id: params.categoryId,
      total_questions: totalQuestions,
    })
    .select("*, category:trivia_categories(*)")
    .single();
  if (error) throw error;
  return data as TriviaRoom;
}

/** Get room by code */
export async function getTriviaRoomByCode(code: string): Promise<TriviaRoom | null> {
  const { data, error } = await supabase
    .from("trivia_rooms")
    .select("*, category:trivia_categories(*)")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (error) return null;
  return data as TriviaRoom | null;
}

/** Join room as participant */
export async function joinTriviaRoom(params: {
  roomId: string;
  userId: string | null;
  displayName: string;
}): Promise<TriviaParticipant> {
  const { data: room } = await supabase
    .from("trivia_rooms")
    .select("id, status")
    .eq("id", params.roomId)
    .single();
  if (!room || (room as any).status !== "lobby") {
    throw new Error("Room not found or game already started.");
  }

  const displayName = params.displayName.trim().slice(0, 32) || "Player";
  const insertRow: Record<string, unknown> = {
    room_id: params.roomId,
    display_name: displayName,
  };
  if (params.userId) insertRow.user_id = params.userId;

  const { data, error } = await supabase
    .from("trivia_participants")
    .insert(insertRow)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505" && params.userId) {
      const { data: existing } = await supabase
        .from("trivia_participants")
        .select("*")
        .eq("room_id", params.roomId)
        .eq("user_id", params.userId)
        .limit(1)
        .maybeSingle();
      if (existing) return existing as TriviaParticipant;
    }
    throw error;
  }
  return data as TriviaParticipant;
}

/** List participants in room */
export async function listTriviaParticipants(roomId: string): Promise<TriviaParticipant[]> {
  const { data, error } = await supabase
    .from("trivia_participants")
    .select("*")
    .eq("room_id", roomId)
    .order("joined_at");
  if (error) throw error;
  return (data ?? []) as TriviaParticipant[];
}

/** Start game (host only) */
export async function startTriviaGame(roomId: string, hostUserId: string): Promise<void> {
  const { data: room } = await supabase
    .from("trivia_rooms")
    .select("host_user_id, status")
    .eq("id", roomId)
    .single();
  if (!room || (room as any).host_user_id !== hostUserId) {
    throw new Error("Not authorized to start this game.");
  }
  if ((room as any).status !== "lobby") {
    throw new Error("Game already started or finished.");
  }
  const { error } = await supabase
    .from("trivia_rooms")
    .update({ status: "in_progress", current_question_index: 0 })
    .eq("id", roomId);
  if (error) throw error;
}

/** Advance to next question (host only) */
export async function advanceTriviaQuestion(
  roomId: string,
  hostUserId: string
): Promise<{ finished: boolean }> {
  const { data: room, error: fetchErr } = await supabase
    .from("trivia_rooms")
    .select("host_user_id, current_question_index, total_questions, status")
    .eq("id", roomId)
    .single();
  if (fetchErr || !room) throw new Error("Room not found.");
  if ((room as any).host_user_id !== hostUserId) throw new Error("Not authorized.");
  const idx = (room as any).current_question_index + 1;
  const total = (room as any).total_questions ?? 5;
  const finished = idx >= total;

  const { error } = await supabase
    .from("trivia_rooms")
    .update({
      current_question_index: idx,
      status: finished ? "finished" : "in_progress",
    })
    .eq("id", roomId);
  if (error) throw error;
  return { finished };
}

/** Submit answer */
export async function submitTriviaAnswer(params: {
  roomId: string;
  participantId: string;
  questionIndex: number;
  answer: string;
  correctAnswer: string;
  points: number;
}): Promise<void> {
  const correct = params.answer.trim().toLowerCase() === params.correctAnswer.trim().toLowerCase();
  const points = correct ? params.points : 0;

  const { error } = await supabase.from("trivia_answers").insert({
    room_id: params.roomId,
    participant_id: params.participantId,
    question_index: params.questionIndex,
    answer: params.answer,
    correct,
    points,
  });
  if (error) throw error;

  if (points > 0) {
    const { data: p } = await supabase
      .from("trivia_participants")
      .select("score")
      .eq("id", params.participantId)
      .single();
    const currentScore = (p as any)?.score ?? 0;
    await supabase
      .from("trivia_participants")
      .update({ score: currentScore + points })
      .eq("id", params.participantId);
  }
}
