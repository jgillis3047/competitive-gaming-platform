// app/components/ChallengeCard.tsx - Cleaner feed challenge card
import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import Avatar from "../../lib/ui/Avatar";
import type { Challenge } from "../../lib/data/challengeStore";
import type { GameFeedStats } from "../../lib/backend/challengeFeedStats";
import {
  PULSE_CTA_CONTINUE,
  PULSE_CTA_FIND_MATCH,
  PULSE_CTA_JOIN,
  PULSE_CTA_OPEN_MATCH_FEED,
  PULSE_CTA_VIEW_MATCH,
  PULSE_CTA_VIEW_RESULTS,
  PULSE_STATUS_ACTIVE,
  PULSE_STATUS_CHECKED_IN,
  PULSE_STATUS_READY,
} from "../../lib/theme/arenaCopy";
import { colors } from "../../lib/theme/colors";
import { statusColors } from "../../lib/theme/statusColors";
import { challengePills } from "../../lib/theme/challengePills";
import { pressSoftIcon } from "../../lib/ui/pressableStyles";

type Tone = "open" | "progress" | "done" | "muted";

type Props = {
  challenge: Challenge | any;
  onPress: () => void;
  showShare?: boolean;
  onShare?: () => void;
  /** Feed-style primary CTA + social proof (off on profile / user screens). */
  showCta?: boolean;
  viewerId?: string | null;
  /** Per-game stats from `get_feed_game_stats` (feed only). */
  gameStats?: GameFeedStats | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function looksLikeUuid(s: string) {
  return UUID_RE.test(String(s).trim());
}

/** Human-readable creator for subtitle + avatar (no raw UUIDs). */
function creatorDisplayParts(challenge: any): { line: string; avatarLabel: string } {
  const namesPublic = challenge?.show_competitor_names_public !== false;
  if (!namesPublic) {
    return { line: "Created by private player", avatarLabel: "Player" };
  }
  const fromUsername =
    typeof challenge?.created_by_username === "string" && challenge.created_by_username.trim().length
      ? challenge.created_by_username.trim()
      : null;
  const createdBy = (challenge?.createdBy ?? "").trim();
  const raw = fromUsername || createdBy;

  if (raw && !looksLikeUuid(raw)) {
    const withAt = raw.startsWith("@") ? raw : `@${raw}`;
    return { line: `Created by ${withAt}`, avatarLabel: raw.replace(/^@/, "") };
  }

  const cid = String(challenge?.created_by ?? "").trim();
  if (cid && !looksLikeUuid(cid)) {
    return { line: `Created by ${cid}`, avatarLabel: cid };
  }

  return { line: "Created by a player", avatarLabel: "Player" };
}

function statusLabel(status: any): { text: string; tone: Tone } {
  const s = String(status ?? "").trim().toLowerCase();

  if (s === "open") return { text: "OPEN", tone: "open" };
  if (s === "accepted") return { text: PULSE_STATUS_READY, tone: "progress" };
  if (s === "in-progress" || s === "in_progress") return { text: PULSE_STATUS_ACTIVE, tone: "progress" };
  if (s === "completed") return { text: "COMPLETED", tone: "done" };
  if (s === "cancelled" || s === "canceled") return { text: "CANCELLED", tone: "muted" };
  if (s === "expired") return { text: "EXPIRED", tone: "muted" };
  if (s === "checked-in" || s === "checked_in") return { text: PULSE_STATUS_CHECKED_IN, tone: "progress" };
  if (s === "disputed") return { text: "DISPUTED", tone: "muted" };

  return { text: s ? s.toUpperCase() : "UNKNOWN", tone: "muted" };
}

function pickNumber(...vals: any[]) {
  for (const v of vals) {
    const n = Number(v);
    if (!Number.isNaN(n) && Number.isFinite(n)) return n;
  }
  return 0;
}

function formatUSDFromCents(cents: number) {
  return `$${(Number(cents ?? 0) / 100).toFixed(2)}`;
}

function parsePlayerSlot(players?: string | null): { current: number; max: number } | null {
  if (!players) return null;
  const m = String(players).match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return null;
  return { current: Number(m[1]), max: Number(m[2]) };
}

function buildHypeLine(challenge: any, statusKey: string): string {
  const entry = pickNumber(
    challenge.entry_fee_cents,
    challenge.entryFeeCents,
    challenge.entryFee,
    challenge.entry_fee,
    0
  );
  const winReward = pickNumber(
    challenge.win_reward_cents,
    challenge.winRewardCents,
    entry ? entry * 2 : 0
  );
  const winnerLine = `Winner takes ${formatUSDFromCents(winReward)}`;
  const slots = parsePlayerSlot(challenge.players);
  const s = String(statusKey).toLowerCase();

  if (s === "open") {
    if (slots && slots.current === 1 && slots.max >= 2) {
      return `Be the first to join · ${winnerLine}`;
    }
    if (slots && slots.current >= 2) {
      return `${slots.current} players ready · ${winnerLine}`;
    }
    return winnerLine;
  }

  if (s === "accepted" || s === "in-progress" || s === "checked-in" || s === "in_progress") {
    if (slots && slots.current >= 2) {
      return `${slots.current} players in this match · ${winnerLine}`;
    }
    return `${winnerLine}`;
  }

  if (s === "completed") {
    return `Finished · ${winnerLine}`;
  }

  return winnerLine;
}

function ctaLabelFor(challenge: any, viewerId: string | null): string {
  const s = String(challenge?.status ?? "").toLowerCase().replace("_", "-");
  const cid = challenge?.created_by ?? null;
  const isCreator = Boolean(viewerId && cid && viewerId === cid);
  const isOpponent = Boolean(viewerId && challenge?.opponent_user_id && viewerId === challenge.opponent_user_id);
  const participant = isCreator || isOpponent;
  const inviteOnly = Boolean(challenge?.invite_only);
  const invitedId = challenge?.invited_user_id ?? null;
  const canInviteJoin = !inviteOnly || (invitedId && invitedId === viewerId);

  if (s === "completed") return PULSE_CTA_VIEW_RESULTS.toUpperCase();
  if (s === "cancelled" || s === "canceled" || s === "expired" || s === "disputed") {
    return PULSE_CTA_VIEW_MATCH.toUpperCase();
  }

  if (s === "open") {
    if (isCreator) return PULSE_CTA_FIND_MATCH.toUpperCase();
    if (inviteOnly && !canInviteJoin) return PULSE_CTA_VIEW_MATCH.toUpperCase();
    return PULSE_CTA_JOIN.toUpperCase();
  }

  if (s === "accepted" || s === "in-progress" || s === "checked-in") {
    if (participant) return PULSE_CTA_CONTINUE.toUpperCase();
    return PULSE_CTA_OPEN_MATCH_FEED.toUpperCase();
  }

  return PULSE_CTA_VIEW_MATCH.toUpperCase();
}

function formatAvgDurationSec(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "";
  if (sec < 90) return `~${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `~${m}m ${s}s`;
}

function opponentDisplayParts(challenge: any): { line: string; avatarLabel: string } | null {
  const namesPublic = challenge?.show_competitor_names_public !== false;
  if (!namesPublic) return { line: "Opponent", avatarLabel: "Player" };
  const raw =
    (typeof challenge?.opponent_display_name === "string" && challenge.opponent_display_name.trim()) ||
    (typeof challenge?.opponent_username === "string" && challenge.opponent_username.trim()) ||
    null;
  if (raw) {
    const withAt = raw.startsWith("@") ? raw : `@${raw}`;
    return { line: withAt, avatarLabel: raw.replace(/^@/, "") };
  }
  return null;
}

function stakesLabelFromCents(cents: number): string | null {
  if (!cents || cents <= 0) return null;
  if (cents <= 50) return "Micro stakes";
  if (cents <= 200) return "Low stakes";
  if (cents <= 500) return "Mid stakes";
  return "High stakes";
}

function formatLiveTimer(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (sec < 60) return `${sec}s live`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m live`;
  const h = Math.floor(m / 60);
  return `${h}h live`;
}

function isLiveStatusKey(status: string): boolean {
  return status === "accepted" || status === "in-progress" || status === "checked-in";
}

export default function ChallengeCard({
  challenge,
  onPress,
  showShare,
  onShare,
  showCta = false,
  viewerId = null,
  gameStats = null,
}: Props) {
  const status = useMemo(() => statusLabel((challenge as any).status), [challenge]);

  const entry = pickNumber(
    (challenge as any).entry_fee_cents,
    (challenge as any).entryFeeCents,
    (challenge as any).entryFee,
    (challenge as any).entry_fee,
    0
  );

  const winReward = pickNumber(
    (challenge as any).win_reward_cents,
    (challenge as any).winRewardCents,
    entry ? entry * 2 : 0
  );

  const creatorParts = useMemo(() => creatorDisplayParts(challenge as any), [challenge]);
  const opponentParts = useMemo(() => opponentDisplayParts(challenge as any), [challenge]);

  const title =
    (challenge as any).title ||
    `${String((challenge as any).gameType ?? (challenge as any).game_type ?? "Game")} • 1v1`;

  const msg = String((challenge as any).message ?? "").trim();
  const inviteOnly = Boolean((challenge as any).invite_only);
  const opponentUserId =
    (challenge as any).opponent_user_id ?? (challenge as any).opponentUserId ?? null;
  const isLockedMatch = Boolean(opponentUserId);
  const sponsoredByName = (challenge as any).sponsored_seller_name ?? null;

  const rawStatus = String((challenge as any).status ?? "").toLowerCase().replace("_", "-");
  const isLive = isLiveStatusKey(rawStatus);
  const isOpen = rawStatus === "open";

  const statusPillStyle =
    status.tone === "open"
      ? challengePills.open
      : status.tone === "progress" && isLive
        ? challengePills.live
        : status.tone === "progress"
          ? challengePills.progress
          : status.tone === "done"
            ? challengePills.done
            : challengePills.muted;

  const liveSince =
    (challenge as any).accepted_at ??
    (challenge as any).updated_at ??
    (challenge as any).created_at ??
    null;
  const liveTimer = showCta && isLive ? formatLiveTimer(liveSince) : null;
  const locationHint = String(
    (challenge as any).in_person_rules?.location_text ??
      (challenge as any).location_text ??
      ""
  ).trim();
  const hypeLine = showCta ? buildHypeLine(challenge, rawStatus) : "";
  const ctaText = showCta ? ctaLabelFor(challenge, viewerId) : "";
  const entryCents = pickNumber(
    (challenge as any).entry_fee_cents,
    (challenge as any).entryFeeCents,
    (challenge as any).entryFee,
    (challenge as any).entry_fee,
    0
  );
  const showHot = showCta && entryCents >= 200;
  const stakesLabel = stakesLabelFromCents(entryCents);
  const tierSummary = String((challenge as any)._feedTierSummary ?? "").trim();

  const socialProofLines = useMemo(() => {
    if (!showCta || !gameStats) return [];
    const out: string[] = [];
    if (gameStats.playsToday > 0) {
      const n = gameStats.playsToday;
      out.push(`🔥 ${n} ${n === 1 ? "person" : "people"} finished this game today`);
    }
    if (gameStats.lastWinnerName && gameStats.lastWinnerPrizeCents != null) {
      const raw = String(gameStats.lastWinnerName).trim();
      const handle = raw.startsWith("@") ? raw : `@${raw}`;
      out.push(`🏆 Last winner: ${handle} won ${formatUSDFromCents(gameStats.lastWinnerPrizeCents)}`);
    }
    if (gameStats.avgDurationSec != null && gameStats.avgDurationSec > 0) {
      const fd = formatAvgDurationSec(gameStats.avgDurationSec);
      if (fd.length) out.push(`⏱ Avg match: ${fd}`);
    }
    return out;
  }, [showCta, gameStats]);

  const cardVariantStyle =
    showCta && isLive
      ? styles.cardLive
      : showCta && isOpen
        ? styles.cardOpen
        : showCta && rawStatus === "completed"
          ? styles.cardDone
          : null;

  return (
    <View style={[styles.card, cardVariantStyle]}>
      {showCta && isLive ? (
        <View style={styles.liveBanner}>
          <View style={styles.liveDot} />
          <Text style={styles.liveBannerText}>LIVE NOW</Text>
          {liveTimer ? <Text style={styles.liveTimerText}>{liveTimer}</Text> : null}
        </View>
      ) : null}
      <Pressable onPress={onPress} style={({ pressed }) => [styles.cardMain, pressed && styles.cardPressed]}>
        <View style={styles.topRow}>
          <View style={styles.avatarStack}>
            <Avatar size={40} name={creatorParts.avatarLabel} />
            {isLive || isLockedMatch ? (
              <View style={styles.avatarStackSecond}>
                <Avatar size={36} name={opponentParts?.avatarLabel ?? "?"} />
              </View>
            ) : null}
          </View>
          <View style={styles.titleBlock}>
            <Text numberOfLines={1} style={styles.title}>
              {title}
            </Text>
            <Text numberOfLines={2} style={styles.sub}>
              {creatorParts.line}
              {opponentParts ? ` vs ${opponentParts.line}` : ""} · Entry {formatUSDFromCents(entry)}
            </Text>
          </View>
        </View>

        {msg.length ? (
          <View style={[styles.msgWrap, isOpen && styles.msgWrapTrashTalk]}>
            {isOpen ? (
              <Text style={styles.trashTalkLabel}>💬 Trash talk</Text>
            ) : null}
            <Text numberOfLines={3} style={styles.msgText}>
              {msg}
            </Text>
          </View>
        ) : null}

        {showCta && locationHint.length ? (
          <View style={styles.nearYouRow}>
            <Ionicons name="location" size={14} color={colors.gold} />
            <Text style={styles.nearYouText} numberOfLines={1}>
              Near you · {locationHint}
            </Text>
          </View>
        ) : null}

        {showCta && isLockedMatch && isLive ? (
          <View style={styles.defendingRow}>
            <Ionicons name="ribbon" size={14} color={colors.gold} />
            <Text style={styles.defendingText}>King defending crown</Text>
          </View>
        ) : null}

        <View style={styles.metaRow}>
          <View style={styles.pillsLeft}>
            <View style={[styles.pill, statusPillStyle]}>
              <Text style={styles.pillText}>{status.text}</Text>
            </View>
            {stakesLabel ? (
              <View style={[styles.pill, challengePills.muted]}>
                <Text style={styles.pillText}>{stakesLabel}</Text>
              </View>
            ) : null}
            {inviteOnly ? (
              <View style={[styles.pill, challengePills.muted]}>
                <Text style={styles.pillText}>INVITE</Text>
              </View>
            ) : null}
            {isLockedMatch ? (
              <View style={[styles.pill, challengePills.muted]}>
                <Text style={styles.pillText}>LOCKED</Text>
              </View>
            ) : null}
            {sponsoredByName ? (
              <View style={[styles.pill, challengePills.sponsored]}>
                <Text style={styles.pillText}>Sponsored by {sponsoredByName}</Text>
              </View>
            ) : null}
          </View>
          <View style={[styles.moneyPill, challengePills.money]}>
            <Ionicons name="trophy" size={12} color={colors.text} />
            <Text style={styles.moneyText}>{formatUSDFromCents(winReward)}</Text>
          </View>
        </View>

        {showCta && tierSummary.length ? (
          <View style={styles.tierSummaryWrap}>
            <Text style={styles.tierSummaryText} numberOfLines={3}>
              {tierSummary}
            </Text>
          </View>
        ) : null}

        {showCta && socialProofLines.length ? (
          <View style={styles.socialProofWrap}>
            {socialProofLines.map((line, i) => (
              <Text key={i} style={styles.socialProofLine} numberOfLines={2}>
                {line}
              </Text>
            ))}
          </View>
        ) : null}

        {showCta && isLive && gameStats && gameStats.playsToday > 0 ? (
          <View style={styles.spectatorRow}>
            <Ionicons name="eye-outline" size={14} color={colors.textMuted} />
            <Text style={styles.spectatorText}>
              {gameStats.playsToday} watching this game type today
            </Text>
          </View>
        ) : null}

        {showCta && hypeLine.length ? (
          <View style={styles.hypeRow}>
            {showHot ? (
              <View style={styles.hotPill}>
                <Text style={styles.hotPillText}>Hot challenge</Text>
              </View>
            ) : null}
            <Text style={styles.hypeText} numberOfLines={2}>
              {hypeLine}
            </Text>
          </View>
        ) : null}
      </Pressable>

      {showCta && ctaText.length ? (
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [styles.ctaBtn, pressed && styles.ctaBtnPressed]}
        >
          <Text style={styles.ctaBtnText}>{ctaText}</Text>
          <Ionicons name="chevron-forward" size={18} color="#fff" />
        </Pressable>
      ) : null}

      {showShare && typeof onShare === "function" ? (
        <View style={styles.actionRow}>
          <Pressable
            onPress={onShare}
            style={({ pressed }) => [styles.actionBtn, pressSoftIcon(pressed)]}
          >
            <Ionicons name="share-social-outline" size={18} color={colors.text} />
            <Text style={styles.actionText}>Share</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  cardLive: {
    borderColor: statusColors.live.border,
    backgroundColor: statusColors.live.bg,
  },
  cardOpen: {
    borderColor: colors.accentChipBorder,
    backgroundColor: colors.accentChip,
  },
  cardDone: {
    borderColor: statusColors.crowned.border,
    backgroundColor: statusColors.crowned.bg,
  },
  liveBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: statusColors.live.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: statusColors.live.border,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: statusColors.live.text,
  },
  liveBannerText: {
    color: statusColors.live.text,
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 0.6,
  },
  liveTimerText: {
    marginLeft: "auto",
    color: colors.textMuted,
    fontWeight: "800",
    fontSize: 11,
  },
  cardMain: { padding: 14 },
  cardPressed: { opacity: 0.96 },

  topRow: { flexDirection: "row", gap: 14, alignItems: "center" },
  avatarStack: { width: 52, height: 44, position: "relative" },
  avatarStackSecond: { position: "absolute", right: -4, bottom: -4 },
  titleBlock: { flex: 1 },
  title: { color: colors.text, fontSize: 16, fontWeight: "700", flex: 1 },
  sub: { color: colors.textMuted, marginTop: 4, fontSize: 12 },

  msgWrap: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: colors.border,
  },
  msgWrapTrashTalk: {
    backgroundColor: "rgba(245,158,11,0.08)",
    borderColor: colors.goldBorderSoft,
  },
  trashTalkLabel: {
    color: colors.gold,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  msgText: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
  nearYouRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  nearYouText: { flex: 1, color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  defendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: colors.goldSurface,
    borderWidth: 1,
    borderColor: colors.goldBorderSoft,
  },
  defendingText: { color: colors.gold, fontWeight: "800", fontSize: 11 },
  spectatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  spectatorText: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    justifyContent: "space-between",
  },
  pillsLeft: { flexDirection: "row", gap: 8 },
  /** Layout only — colors from `challengePills` */
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  pillText: { color: colors.text, fontWeight: "800", fontSize: 11 },
  moneyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  moneyText: { color: colors.text, fontWeight: "800", fontSize: 12 },

  tierSummaryWrap: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(79,109,245,0.08)",
    borderWidth: 1,
    borderColor: "rgba(79,109,245,0.22)",
  },
  tierSummaryText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, fontWeight: "600" },

  socialProofWrap: {
    marginTop: 12,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(16,185,129,0.08)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.22)",
  },
  socialProofLine: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, fontWeight: "600" },

  hypeRow: { marginTop: 12, gap: 8 },
  hotPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: statusColors.hot.bg,
    borderWidth: 1,
    borderColor: statusColors.hot.border,
  },
  hotPillText: { color: statusColors.hot.text, fontWeight: "800", fontSize: 11 },
  hypeText: { color: colors.textMuted, fontSize: 12, lineHeight: 18, fontWeight: "600" },

  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 14,
    marginBottom: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.accentCTA,
  },
  ctaBtnPressed: { opacity: 0.92 },
  ctaBtnText: { color: "#fff", fontWeight: "900", fontSize: 15, letterSpacing: 0.3 },

  actionRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: "row",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  actionText: { color: colors.text, fontWeight: "800", fontSize: 14 },
});
