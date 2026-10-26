import { getOrCreateThreadByUsers } from "../backend/threadActions";
import { supabase } from "../backend/supabaseClient";
import type { ChallengeRow } from "../models/challengeTypes";
import {
  deriveChallengeActionState,
  isActionPromptType,
  isActionableState,
  isPlayableState,
  isTerminalChallenge,
  normalizeChallengeStatus,
  previewFromMessage,
  type ChallengeActionState,
  type PlayerState,
} from "./challengeState";
import { gameTitleForThread } from "./threadMessageDisplay";

export type MatchInboxThreadRow = {
  id: string;
  user_low: string;
  user_high: string;
  created_at: string | null;
  last_message_at: string | null;
  last_preview: string | null;
};

type ThreadMessageRow = {
  id: string;
  thread_id: string;
  sender_id: string | null;
  type: string | null;
  challenge_id: string | null;
  payload: any | null;
  created_at: string | null;
};

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url?: string | null;
};

export type MatchChallengeSummary = {
  challengeId: string;
  gameTitle: string;
  action: ChallengeActionState;
  updatedAt: string;
};

export type MatchInboxRow = {
  threadId: string;
  opponentId: string;
  opponentName: string;
  updatedAt: string;
  lastUpdate: string;
  activeCount: number;
  needsActionCount: number;
  waitingCount: number;
  completedCount: number;
  pills: Array<{ challengeId: string; gameTitle: string; action: ChallengeActionState }>;
  actionItems: MatchChallengeSummary[];
};

export type MatchActionFlatRow = {
  threadId: string;
  opponentId: string;
  opponentName: string;
  challengeId: string;
  gameTitle: string;
  action: ChallengeActionState;
};

// Must match thread/[id].tsx — no game_key column on challenges table
const CHALLENGE_SELECT =
  "id,title,game_type,kind,status,entry_fee_cents,win_reward_cents,winner_user_id,settlement_status,created_at,updated_at,created_by,opponent_user_id,invited_user_id,invite_only";

function challengeIdFromMessage(m: ThreadMessageRow): string | null {
  if (m.challenge_id) return String(m.challenge_id);
  const fromPayload = m.payload?.challenge_id ?? m.payload?.challengeId;
  return fromPayload ? String(fromPayload) : null;
}

function threadOpponentId(t: MatchInboxThreadRow, meId: string): string {
  const me = String(meId);
  const low = String(t.user_low);
  const high = String(t.user_high);
  return low === me ? high : low;
}

function displayNameFor(userId: string, profilesById: Record<string, ProfileRow>) {
  const p = profilesById[userId];
  return p?.display_name || p?.username || `User ${userId.slice(0, 6)}`;
}

function isLiveChallenge(ch: ChallengeRow): boolean {
  if (isTerminalChallenge(ch)) return false;
  const status = normalizeChallengeStatus(ch.status);
  return status !== "completed" && status !== "cancelled";
}

function resolveOpponentUserId(
  meId: string,
  challenge: ChallengeRow,
  playerUserIds: string[]
): string | null {
  const me = String(meId);
  const others = playerUserIds.map(String).filter((id) => id !== me);
  if (others.length >= 1) return others[0];

  const lockedOpp = challenge.opponent_user_id ? String(challenge.opponent_user_id) : null;
  if (lockedOpp && lockedOpp !== me) return lockedOpp;

  const creator = challenge.created_by ? String(challenge.created_by) : null;
  if (creator && creator !== me) return creator;

  const invited = challenge.invited_user_id ? String(challenge.invited_user_id) : null;
  if (invited && invited !== me) return invited;

  return null;
}

function addChallengeForOpponent(
  map: Record<string, Set<string>>,
  opponentId: string,
  challengeId: string
) {
  const oid = String(opponentId);
  const cid = String(challengeId);
  if (!map[oid]) map[oid] = new Set();
  map[oid].add(cid);
}

function buildSummary(
  cid: string,
  ch: ChallengeRow,
  meId: string,
  playerStateByChallenge: Record<string, PlayerState>,
  turnByChallenge: Record<string, string | null>,
  openPromptByChallenge: Record<string, boolean>
): MatchChallengeSummary {
  const action = deriveChallengeActionState({
    challenge: ch,
    meId,
    playerState: playerStateByChallenge[cid],
    currentTurnUserId: turnByChallenge[cid] ?? null,
    hasOpenPromptForMe: openPromptByChallenge[cid] ?? false,
  });
  return {
    challengeId: cid,
    gameTitle: gameTitleForThread(ch.game_type ?? ch.game_key),
    action,
    updatedAt: ch.updated_at ?? ch.created_at ?? new Date().toISOString(),
  };
}

export async function loadMatchInboxData(meId: string): Promise<{
  rows: MatchInboxRow[];
  actionFlatRows: MatchActionFlatRow[];
  profilesById: Record<string, ProfileRow>;
}> {
  const me = String(meId);

  const { data: threadRows, error: tErr } = await supabase
    .from("threads")
    .select("id,user_low,user_high,created_at,last_message_at,last_preview")
    .or(`user_low.eq.${me},user_high.eq.${me}`)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (tErr) throw tErr;

  let inboxThreads: MatchInboxThreadRow[] = [...((threadRows ?? []) as MatchInboxThreadRow[])];
  const threadByOpponent: Record<string, MatchInboxThreadRow> = {};
  const opponentByThreadId: Record<string, string> = {};

  for (const t of inboxThreads) {
    const opp = threadOpponentId(t, me);
    threadByOpponent[opp] = t;
    opponentByThreadId[String(t.id)] = opp;
  }

  const threadIds = inboxThreads.map((t) => String(t.id));
  const { data: msgRows } = threadIds.length
    ? await supabase
        .from("thread_messages")
        .select("id,thread_id,sender_id,type,challenge_id,payload,created_at")
        .in("thread_id", threadIds)
        .order("created_at", { ascending: false })
        .limit(2000)
    : { data: [] };

  const msgs = (msgRows ?? []) as ThreadMessageRow[];
  const latestByThread: Record<string, ThreadMessageRow> = {};
  const openPromptByChallenge: Record<string, boolean> = {};
  const challengeIdsFromThreads = new Set<string>();

  for (const m of msgs) {
    const tid = String(m.thread_id);
    if (!latestByThread[tid]) latestByThread[tid] = m;

    const cid = challengeIdFromMessage(m);
    if (!cid) continue;
    challengeIdsFromThreads.add(cid);

    if (isActionPromptType(m.type, m.payload)) {
      const payload = m.payload ?? {};
      const status = String(payload?.status ?? "open").toLowerCase();
      if (status !== "resolved") {
        const target = payload?.target_user_id ? String(payload.target_user_id) : null;
        const isForMe = !target || target === me;
        if (isForMe) openPromptByChallenge[cid] = true;
      }
    }
  }

  const { data: myPlRows } = await supabase
    .from("challenge_players")
    .select("challenge_id")
    .eq("user_id", me);

  const idsFromPlayers = Array.from(
    new Set((myPlRows ?? []).map((r: any) => String(r.challenge_id)).filter(Boolean))
  );

  const allChallengeIds = Array.from(new Set([...idsFromPlayers, ...challengeIdsFromThreads]));

  const challengesById: Record<string, ChallengeRow> = {};
  const playerStateByChallenge: Record<string, PlayerState> = {};
  const turnByChallenge: Record<string, string | null> = {};
  const challengeIdsByOpponent: Record<string, Set<string>> = {};
  const playersByChallenge: Record<string, string[]> = {};

  if (allChallengeIds.length) {
    const { data: chRows, error: chErr } = await supabase
      .from("challenges")
      .select(CHALLENGE_SELECT)
      .in("id", allChallengeIds);

    if (chErr) throw chErr;

    for (const c of (chRows ?? []) as ChallengeRow[]) {
      challengesById[String(c.id)] = c;
    }

    const { data: pr } = await supabase
      .from("challenge_players")
      .select("challenge_id,user_id,submitted,checked_in_at")
      .in("challenge_id", allChallengeIds);

    for (const cid of allChallengeIds) {
      const playerRows = (pr ?? []).filter((r: any) => String(r.challenge_id) === cid);
      const playerUserIds = playerRows.map((r: any) => String(r.user_id));
      playersByChallenge[cid] = playerUserIds;

      const meRow = playerRows.find((r: any) => String(r.user_id) === me);
      const oppRow = playerRows.find((r: any) => String(r.user_id) !== me);
      playerStateByChallenge[cid] = {
        meCheckedIn: Boolean(meRow?.checked_in_at),
        oppCheckedIn: Boolean(oppRow?.checked_in_at),
        bothCheckedIn: Boolean(meRow?.checked_in_at && oppRow?.checked_in_at),
        meSubmitted: Boolean(meRow?.submitted),
        oppSubmitted: Boolean(oppRow?.submitted),
      };
    }

    const { data: turnRows } = await supabase
      .from("challenge_turns")
      .select("challenge_id,current_turn_user_id")
      .in("challenge_id", allChallengeIds);

    for (const r of turnRows ?? []) {
      turnByChallenge[String((r as any).challenge_id)] = (r as any).current_turn_user_id ?? null;
    }
  }

  // Primary: same source as opponent thread screen — challenge_id on each thread's messages
  for (const t of inboxThreads) {
    const tid = String(t.id);
    const threadOpp = threadOpponentId(t, me);
    const threadMsgs = msgs.filter((m) => String(m.thread_id) === tid);
    const chIds = Array.from(
      new Set(
        threadMsgs
          .map((m) => (m.challenge_id ? String(m.challenge_id) : challengeIdFromMessage(m)))
          .filter((x): x is string => Boolean(x))
      )
    );
    for (const cid of chIds) {
      const ch = challengesById[cid];
      if (!ch || !isLiveChallenge(ch)) continue;
      addChallengeForOpponent(challengeIdsByOpponent, threadOpp, cid);
    }
  }

  // Fallback: challenge_players + challenge opponent fields
  for (const cid of allChallengeIds) {
    const ch = challengesById[cid];
    if (!ch || !isLiveChallenge(ch)) continue;

    const oppId = resolveOpponentUserId(me, ch, playersByChallenge[cid] ?? []);
    if (oppId) addChallengeForOpponent(challengeIdsByOpponent, oppId, cid);
  }

  for (const oppId of Object.keys(challengeIdsByOpponent)) {
    if (threadByOpponent[oppId]) continue;

    const { data: existingThread } = await supabase
      .from("threads")
      .select("id,user_low,user_high,created_at,last_message_at,last_preview")
      .or(`and(user_low.eq.${me},user_high.eq.${oppId}),and(user_low.eq.${oppId},user_high.eq.${me})`)
      .maybeSingle();

    if (existingThread) {
      const t = existingThread as MatchInboxThreadRow;
      inboxThreads.push(t);
      threadByOpponent[oppId] = t;
      opponentByThreadId[String(t.id)] = oppId;
      continue;
    }

    try {
      const tid = await getOrCreateThreadByUsers(me, oppId);
      const { data: createdThread } = await supabase
        .from("threads")
        .select("id,user_low,user_high,created_at,last_message_at,last_preview")
        .eq("id", tid)
        .maybeSingle();
      if (createdThread) {
        const t = createdThread as MatchInboxThreadRow;
        inboxThreads.push(t);
        threadByOpponent[oppId] = t;
        opponentByThreadId[String(t.id)] = oppId;
      }
    } catch {
      // ok
    }
  }

  const opponentIds = Array.from(
    new Set([...inboxThreads.map((t) => threadOpponentId(t, me)), ...Object.keys(challengeIdsByOpponent)])
  );

  let profilesById: Record<string, ProfileRow> = {};
  if (opponentIds.length) {
    const { data: profRows } = await supabase
      .from("profiles")
      .select("id,username,display_name,avatar_url")
      .in("id", opponentIds);
    profilesById = Object.fromEntries((profRows ?? []).map((p: any) => [String(p.id), p as ProfileRow]));
  }

  const summariesByOpponent: Record<string, MatchChallengeSummary[]> = {};

  for (const [oppId, idSet] of Object.entries(challengeIdsByOpponent)) {
    const summaries: MatchChallengeSummary[] = [];
    for (const cid of idSet) {
      const ch = challengesById[cid];
      if (!ch) continue;
      summaries.push(
        buildSummary(cid, ch, me, playerStateByChallenge, turnByChallenge, openPromptByChallenge)
      );
    }
    summaries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    summariesByOpponent[oppId] = summaries;
  }

  const rows: MatchInboxRow[] = inboxThreads.map((t) => {
    const tid = String(t.id);
    const opponentId = threadOpponentId(t, me);
    const opponentName = displayNameFor(opponentId, profilesById);
    const lastMsg = latestByThread[tid] ?? null;
    const updatedAt = lastMsg?.created_at || t.last_message_at || t.created_at || new Date().toISOString();
    const lastUpdate = previewFromMessage(lastMsg, t.last_preview);
    const summaries = summariesByOpponent[opponentId] ?? [];

    const activeSummaries = summaries.filter((s) => s.action.isActive || isPlayableState(s.action));
    const actionItems = summaries.filter((s) => isActionableState(s.action));
    const waitingItems = summaries.filter(
      (s) => s.action.bucket === "waiting" && !isActionableState(s.action)
    );
    const completedItems = summaries.filter((s) => s.action.bucket === "completed");

    return {
      threadId: tid,
      opponentId,
      opponentName,
      updatedAt,
      lastUpdate,
      activeCount: activeSummaries.length,
      needsActionCount: actionItems.length,
      waitingCount: waitingItems.length,
      completedCount: completedItems.length,
      pills: activeSummaries.map((s) => ({
        challengeId: s.challengeId,
        gameTitle: s.gameTitle,
        action: s.action,
      })),
      actionItems,
    };
  });

  rows.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const actionFlatRows: MatchActionFlatRow[] = [];
  for (const [oppId, summaries] of Object.entries(summariesByOpponent)) {
    const thread = threadByOpponent[oppId];
    const opponentName = displayNameFor(oppId, profilesById);
    for (const item of summaries.filter((s) => isActionableState(s.action))) {
      actionFlatRows.push({
        threadId: thread ? String(thread.id) : "",
        opponentId: oppId,
        opponentName,
        challengeId: item.challengeId,
        gameTitle: item.gameTitle,
        action: item.action,
      });
    }
  }

  actionFlatRows.sort((a, b) => {
    const pri = (x: ChallengeActionState) => (x.bucket === "needs_action" ? 0 : 1);
    return pri(a.action) - pri(b.action);
  });

  return { rows, actionFlatRows, profilesById };
}
