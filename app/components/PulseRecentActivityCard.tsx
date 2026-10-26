// Pulse "Recent activity" — inline results, no click required for spectators
import { Ionicons } from "@expo/vector-icons";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { PostWithExtras } from "../../lib/backend/posts";
import { getGameConfig } from "../../lib/data/gameConfig";
import { colors } from "../../lib/theme/colors";
import { radius } from "../../lib/theme/spacing";
import Avatar from "../../lib/ui/Avatar";
import { computeMatchRatingDeltas, formatRatingDelta } from "../../lib/utils/eloRating";
import { lightTap } from "../../lib/utils/haptics";

type FeedPlayer = {
  userId: string;
  role: string;
  score: number | null;
  displayName: string;
};

type Props = {
  challenge?: any;
  post?: PostWithExtras;
  viewerId?: string | null;
  friendIds?: string[] | null;
};

function timeAgo(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatUsd(cents: number) {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

function handleLabel(name: string | null | undefined) {
  const raw = String(name ?? "").trim();
  if (!raw || raw === "Player") return "Player";
  return raw.startsWith("@") ? raw : `@${raw}`;
}

function gameIconName(gameType: string | null | undefined): keyof typeof Ionicons.glyphMap {
  const gt = String(gameType ?? "").toLowerCase();
  if (gt.includes("chess")) return "grid-outline";
  if (gt.includes("checkers")) return "apps-outline";
  if (gt.includes("math")) return "calculator-outline";
  if (gt.includes("sudoku")) return "keypad-outline";
  if (gt.includes("anagram") || gt.includes("word")) return "text-outline";
  if (gt.includes("basketball") || gt.includes("irl")) return "basketball-outline";
  if (gt.includes("trivia")) return "help-circle-outline";
  return "game-controller-outline";
}

function podiumEmoji(rank: number | null) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return "🏅";
}

function isParticipant(challenge: any, viewerId: string | null | undefined): boolean {
  if (!viewerId) return false;
  if (challenge.created_by === viewerId) return true;
  if (challenge.opponent_user_id === viewerId) return true;
  const players: FeedPlayer[] = challenge._feedPlayers ?? [];
  return players.some((p) => p.userId === viewerId);
}

function TappableName({
  userId,
  name,
  onPress,
  style,
}: {
  userId: string | null | undefined;
  name: string;
  onPress: (userId: string) => void;
  style?: object;
}) {
  if (!userId) {
    return <Text style={style}>{handleLabel(name)}</Text>;
  }
  return (
    <Pressable onPress={() => onPress(userId)} hitSlop={6}>
      <Text style={[style, styles.tappableName]}>{handleLabel(name)}</Text>
    </Pressable>
  );
}

function resolveWinnerRatingDelta(challenge: any): string | null {
  const stored = challenge.winner_rating_delta;
  if (typeof stored === "number" && stored !== 0) {
    return formatRatingDelta(stored);
  }
  const winnerRating = Number(challenge.winner_rating ?? 1000);
  const loserRating = Number(challenge.loser_rating ?? 1000);
  const { winnerDelta } = computeMatchRatingDeltas(winnerRating, loserRating, !challenge.winner_user_id);
  return formatRatingDelta(winnerDelta);
}

type TopLeftAction = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  color?: string;
};

function TopLeftActions({
  profiles = [],
  actions = [],
  onProfilesPress,
}: {
  profiles?: Array<{
    key: string;
    userId: string | null | undefined;
    name: string;
    avatarUrl?: string | null;
    disabled?: boolean;
    onPress?: () => void;
  }>;
  actions?: TopLeftAction[];
  /** When set, tapping the avatar stack opens match details (e.g. tie games). */
  onProfilesPress?: () => void;
}) {
  const hasProfiles = profiles.length > 0;
  const hasActions = actions.length > 0;
  if (!hasProfiles && !hasActions) return null;

  const profileStack = hasProfiles ? (
    <Pressable
      onPress={onProfilesPress}
      disabled={!onProfilesPress}
      style={({ pressed }) => [
        profiles.length > 1 ? styles.avatarStack : undefined,
        onProfilesPress && pressed && { opacity: 0.88 },
      ]}
    >
      {profiles.map((profile) => (
        <Pressable
          key={profile.key}
          onPress={onProfilesPress ? undefined : profile.onPress}
          disabled={onProfilesPress ? false : profile.disabled || !profile.userId}
          style={({ pressed }) => [
            styles.avatarActionBtn,
            profiles.length > 1 && styles.avatarActionBtnCompact,
            !onProfilesPress && (profile.disabled || !profile.userId) && styles.avatarActionBtnDisabled,
            !onProfilesPress && pressed && !profile.disabled && profile.userId && styles.avatarActionBtnPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            onProfilesPress ? "View match details" : `View ${profile.name}'s profile`
          }
        >
          <Avatar
            name={profile.name}
            imageUrl={profile.avatarUrl}
            size={profiles.length > 1 ? 34 : 44}
          />
        </Pressable>
      ))}
    </Pressable>
  ) : null;

  return (
    <View style={styles.actionCluster}>
      {profileStack}
      {hasActions ? (
        <View style={styles.actionIconRow}>
          {actions.map((action) => (
            <Pressable
              key={action.key}
              onPress={action.onPress}
              style={({ pressed }) => [styles.actionIconBtn, pressed && styles.actionIconBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel={action.label}
            >
              <Ionicons name={action.icon} size={18} color={action.color ?? colors.accentMuted} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ChallengeResultCard({
  challenge,
  viewerId,
  friendIds,
}: {
  challenge: any;
  viewerId?: string | null;
  friendIds?: string[] | null;
}) {
  const router = useRouter();
  const status = String(challenge.status ?? "").toLowerCase();
  const gameType = challenge.gameType ?? challenge.game_type ?? "Game";
  const gameCfg = getGameConfig(gameType);
  const title = challenge.title || gameCfg?.title || gameType;
  const prizeCents = Number(challenge.win_reward_cents ?? challenge.winRewardCents ?? 0);
  const entryCents = Number(challenge.entry_fee_cents ?? challenge.entryFeeCents ?? 0);
  const winnerId = challenge.winner_user_id ?? null;
  const winnerName =
    challenge.winner_display_name ??
    challenge.created_by_username ??
    challenge.createdBy ??
    "Winner";
  const loserName =
    challenge.loser_display_name ??
    challenge.opponent_display_name ??
    "Opponent";
  const creatorName = challenge.creator_display_name ?? challenge.createdBy ?? "Player 1";
  const opponentName = challenge.opponent_display_name ?? "Player 2";
  const loserId = challenge.loser_user_id ?? challenge.loserUserId ?? null;
  const creatorId = challenge.created_by ?? challenge.createdByUserId ?? null;
  const opponentId = challenge.opponent_user_id ?? challenge.opponentUserId ?? null;
  const when = timeAgo(challenge.completed_at ?? challenge.created_at);
  const icon = gameIconName(gameType);
  const ratingDeltaLine = resolveWinnerRatingDelta(challenge);

  const scoreLine = useMemo(() => {
    const wScore = challenge.winner_score;
    const cScore = challenge.creator_score;
    const oScore = challenge.opponent_score;
    if (wScore != null && challenge.loser_user_id) {
      const loserScore =
        challenge.loser_user_id === challenge.created_by ? cScore : oScore;
      if (loserScore != null) return `${wScore} – ${loserScore}`;
    }
    if (cScore != null && oScore != null) return `${cScore} – ${oScore}`;
    return null;
  }, [challenge]);

  const openProfile = (userId: string | null | undefined) => {
    if (!userId) return;
    lightTap();
    router.push(`/user/${userId}` as Href);
  };

  const openMatch = () => {
    lightTap();
    router.push(`/challenge/${challenge.id}` as Href);
  };

  if (status === "disputed") {
    return (
      <View style={[styles.card, styles.cardDisputed]}>
        <View style={styles.cardTop}>
          <TopLeftActions
            actions={[
              {
                key: "match",
                icon: "trophy-outline",
                label: "View match",
                onPress: openMatch,
              },
            ]}
          />
          <View style={styles.cardTopBody}>
            <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
            <Text style={styles.cardMeta}>Disputed · {when}</Text>
          </View>
          <View style={styles.typeBadgeMuted}>
            <Ionicons name="alert-circle" size={18} color={colors.warning} />
          </View>
        </View>
        <Text style={styles.disputedText}>Results didn&apos;t match — under review.</Text>
      </View>
    );
  }

  if (status === "cancelled" || status === "canceled" || status === "expired") {
    return (
      <View style={[styles.card, styles.cardMuted]}>
        <View style={styles.cardTop}>
          <View style={styles.cardTopBody}>
            <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
            <Text style={styles.cardMeta}>Cancelled · {when}</Text>
          </View>
          <View style={styles.typeBadgeMuted}>
            <Ionicons name={icon} size={18} color={colors.textMuted} />
          </View>
        </View>
      </View>
    );
  }

  if (status !== "completed") {
    return null;
  }

  const isTie = !winnerId;
  const matchAction: TopLeftAction = {
    key: "match",
    icon: "trophy-outline",
    label: "View match",
    onPress: openMatch,
  };

  return (
    <View style={[styles.card, isTie ? styles.cardTie : styles.cardWin, styles.cardCompact]}>
      <View style={styles.cardTopCompact}>
        <TopLeftActions
          profiles={
            isTie
              ? [
                  { key: "creator", userId: creatorId, name: creatorName, onPress: () => openProfile(creatorId) },
                  { key: "opponent", userId: opponentId, name: opponentName, onPress: () => openProfile(opponentId) },
                ]
              : [{ key: "winner", userId: winnerId, name: winnerName, onPress: () => openProfile(winnerId) }]
          }
          onProfilesPress={isTie ? openMatch : undefined}
          actions={[matchAction]}
        />
        <View style={styles.cardTopBody}>
          <Text style={styles.cardTitleCompact} numberOfLines={1}>{title}</Text>
          <Text style={styles.cardMeta}>{when}{scoreLine ? ` · ${scoreLine}` : ""}</Text>
        </View>
        {prizeCents > 0 ? (
          <Text style={styles.prizeCompact}>+{formatUsd(prizeCents)}</Text>
        ) : null}
      </View>

      {isTie ? (
        <View style={styles.resultCompact}>
          <Text style={styles.resultEmojiSmall}>🤝</Text>
          <Text style={styles.tieLine} numberOfLines={1}>
            Draw ·{" "}
            <TappableName userId={creatorId} name={creatorName} onPress={openProfile} style={styles.inlineName} />
            {" vs "}
            <TappableName userId={opponentId} name={opponentName} onPress={openProfile} style={styles.inlineName} />
          </Text>
        </View>
      ) : (
        <View style={styles.resultCompact}>
          <Text style={styles.resultEmojiSmall}>🏆</Text>
          <View style={styles.winnerBlock}>
            <Text style={styles.winnerLabelBig}>WINNER</Text>
            <TappableName userId={winnerId} name={winnerName} onPress={openProfile} style={styles.winnerNameBig} />
            <View style={styles.winnerSubRow}>
              {ratingDeltaLine ? (
                <Text style={styles.ratingDelta}>{ratingDeltaLine}</Text>
              ) : null}
              {prizeCents > 0 ? (
                <Text style={styles.payoutLineCompact}>+{formatUsd(prizeCents)}</Text>
              ) : !ratingDeltaLine ? (
                <Text style={styles.payoutLineCompact}>Took the W</Text>
              ) : null}
            </View>
          </View>
        </View>
      )}

      {!isTie ? (
        <View style={styles.vsRowCompact}>
          <Text style={styles.vsEmoji}>💥</Text>
          <Text style={styles.vsText}>beat </Text>
          <TappableName userId={loserId} name={loserName} onPress={openProfile} style={styles.loserName} />
        </View>
      ) : null}
    </View>
  );
}

function PostActivityCard({
  post,
}: {
  post: PostWithExtras;
  viewerId?: string | null;
  friendIds?: string[] | null;
}) {
  const router = useRouter();
  const payload = (post.payload ?? {}) as Record<string, unknown>;
  const automation = typeof payload.automation === "string" ? payload.automation : null;
  const courtId = typeof payload.court_id === "string" ? payload.court_id : null;
  const recordSlug = typeof payload.record_slug === "string" ? payload.record_slug : null;
  const podiumRank = typeof payload.rank === "number" ? payload.rank : null;
  const authorId = post.user_id ?? (post.author as { id?: string } | null)?.id ?? null;
  const name =
    post.author?.display_name || post.author?.username || "Someone";
  const avatarUrl = (post.author as { avatar_url?: string | null } | null)?.avatar_url ?? null;
  const body = String(post.body ?? post.caption ?? "").trim();
  const when = timeAgo(post.created_at);

  const openProfile = (userId?: string | null) => {
    const id = userId ?? authorId;
    if (!id) return;
    lightTap();
    router.push(`/user/${id}` as Href);
  };

  const { emoji, headline, accent } = useMemo(() => {
    if (automation === "court_podium") {
      return {
        emoji: podiumEmoji(podiumRank),
        headline: podiumRank != null ? `#${podiumRank} at the spot` : "Arena podium finish",
        accent: "gold" as const,
      };
    }
    if (automation === "badge_unlock") {
      return { emoji: "🏅", headline: "Badge unlocked", accent: "accent" as const };
    }
    const lower = body.toLowerCase();
    if (lower.includes("dethron") || lower.includes("👑")) {
      return { emoji: "👑", headline: "Crown change", accent: "gold" as const };
    }
    if (lower.includes("king") || lower.includes("crown")) {
      return { emoji: "👑", headline: "King update", accent: "gold" as const };
    }
    if (post.challenge_id) {
      return { emoji: "🎯", headline: "Match highlight", accent: "accent" as const };
    }
    return { emoji: "⚡", headline: "Competition moment", accent: "accent" as const };
  }, [automation, body, podiumRank, post.challenge_id]);

  const openCourt = () => {
    if (!courtId) return;
    lightTap();
    const q = recordSlug ? `?record=${encodeURIComponent(recordSlug)}` : "";
    router.push(`/courts/${courtId}${q}` as Href);
  };

  const openMatch = () => {
    if (!post.challenge_id) return;
    lightTap();
    router.push(`/challenge/${post.challenge_id}` as Href);
  };

  const secondaryActions: TopLeftAction[] = [];
  if (post.challenge_id) {
    secondaryActions.push({
      key: "match",
      icon: "trophy-outline",
      label: "View match",
      onPress: openMatch,
    });
  }
  if (automation === "court_podium" && courtId) {
    secondaryActions.push({
      key: "court",
      icon: "location-outline",
      label: "Open arena",
      onPress: openCourt,
      color: colors.gold,
    });
  }

  return (
    <View style={[styles.card, accent === "gold" ? styles.cardWin : styles.cardPost]}>
      <View style={styles.cardTop}>
        <TopLeftActions
          profiles={[
            {
              key: "author",
              userId: authorId,
              name,
              avatarUrl,
              onPress: openProfile,
            },
          ]}
          actions={secondaryActions}
        />
        <View style={styles.cardTopBody}>
          <Text style={styles.cardTitle} numberOfLines={1}>{headline}</Text>
          <TappableName userId={authorId} name={name} onPress={openProfile} style={styles.cardMeta} />
          <Text style={styles.cardMetaMuted}>{when}</Text>
        </View>
        <View style={[styles.typeBadge, accent === "gold" && styles.typeBadgeGold]}>
          <Text style={styles.emojiIcon}>{emoji}</Text>
        </View>
      </View>

      {body.length ? (
        <Text style={styles.postBody} numberOfLines={4}>{body}</Text>
      ) : null}
    </View>
  );
}

export default function PulseRecentActivityCard({ challenge, post, viewerId, friendIds }: Props) {
  if (challenge)
    return (
      <ChallengeResultCard
        challenge={challenge}
        viewerId={viewerId}
        friendIds={friendIds ?? undefined}
      />
    );
  if (post) return <PostActivityCard post={post} viewerId={viewerId} friendIds={friendIds ?? undefined} />;
  return null;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    padding: 14,
    overflow: "hidden",
  },
  cardCompact: {
    padding: 10,
  },
  cardWin: {
    borderColor: colors.goldBorderSoft,
    backgroundColor: colors.goldSurfaceMuted,
  },
  cardTie: {
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  cardPost: {
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSurface,
  },
  cardDisputed: {
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningSurface,
  },
  cardMuted: {
    opacity: 0.85,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
  },
  cardTopBody: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
  },
  cardTopTrailing: {
    alignItems: "flex-end",
    gap: 8,
  },
  actionCluster: {
    alignItems: "center",
    gap: 8,
    minWidth: 44,
  },
  avatarStack: {
    gap: 6,
  },
  avatarActionBtn: {
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.accentBorder,
    backgroundColor: colors.surfaceMuted,
  },
  avatarActionBtnCompact: {
    borderWidth: 1.5,
  },
  avatarActionBtnDisabled: {
    opacity: 0.55,
    borderColor: colors.border,
  },
  avatarActionBtnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.97 }],
  },
  actionIconRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
    maxWidth: 88,
  },
  actionIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  actionIconBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  typeBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  typeBadgeGold: {
    backgroundColor: colors.goldSurface,
    borderColor: colors.goldBorderSoft,
  },
  typeBadgeTie: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
  },
  typeBadgeMuted: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emojiIcon: { fontSize: 20 },
  cardTitle: { color: colors.text, fontWeight: "900", fontSize: 16 },
  cardMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2, fontWeight: "700" },
  cardMetaMuted: { color: colors.textMuted, fontSize: 11, marginTop: 1, fontWeight: "600" },
  cardTopCompact: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 6,
  },
  cardTitleCompact: { color: colors.text, fontWeight: "900", fontSize: 14 },
  prizeCompact: { color: colors.success, fontWeight: "900", fontSize: 12, paddingTop: 2 },
  resultCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 2,
  },
  resultEmojiSmall: { fontSize: 22 },
  winnerBlock: { flex: 1 },
  winnerLabelBig: {
    color: colors.gold,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  winnerNameBig: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 24,
    marginTop: 1,
  },
  winnerSubRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: 3,
  },
  ratingDelta: {
    color: colors.success,
    fontWeight: "900",
    fontSize: 14,
  },
  payoutLineCompact: {
    color: colors.textSecondary,
    fontWeight: "700",
    fontSize: 12,
    marginTop: 2,
  },
  vsRowCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    paddingLeft: 30,
  },
  loserName: {
    color: colors.accentMuted,
    fontWeight: "800",
    fontSize: 13,
  },
  inlineName: {
    color: colors.accentMuted,
    fontWeight: "800",
    fontSize: 13,
  },
  tieLine: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  tappableName: {
    color: colors.accentMuted,
    textDecorationLine: "underline",
  },
  prizePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: "rgba(16,185,129,0.15)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.35)",
  },
  prizePillEmoji: { fontSize: 12 },
  prizePillText: { color: colors.success, fontWeight: "900", fontSize: 13 },
  freePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  freePillText: { color: colors.textMuted, fontWeight: "800", fontSize: 12 },
  resultHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  resultEmoji: { fontSize: 28 },
  winnerTextCol: { flex: 1 },
  winnerLabel: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  winnerName: { color: colors.text, fontWeight: "900", fontSize: 18, marginTop: 1 },
  payoutLine: { color: colors.success, fontWeight: "800", fontSize: 13, marginTop: 4 },
  resultHeadline: { color: colors.text, fontWeight: "900", fontSize: 17 },
  resultSub: { color: colors.textSecondary, fontSize: 14, marginTop: 2, fontWeight: "700" },
  vsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 4,
  },
  vsEmoji: { fontSize: 14 },
  vsText: { flex: 1, color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  scoreBadge: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 13,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  disputedText: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  postBody: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
});
