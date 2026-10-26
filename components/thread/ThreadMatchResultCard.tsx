import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../../lib/theme/colors";
import Avatar from "../../lib/ui/Avatar";
import type { ThreadAction } from "./ThreadActionCard";

type PlayerSide = {
  userId: string;
  name: string;
  avatarUrl?: string | null;
};

export type ThreadMatchResultCardProps = {
  gameTitle: string;
  winnerUserId: string | null;
  myId: string | null;
  mySide: PlayerSide;
  opponentSide: PlayerSide;
  prizeCents?: number | null;
  timeLabel?: string;
  actions?: ThreadAction[];
};

function formatPrize(cents: number) {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

function PlayerColumn({
  side,
  role,
  highlight,
}: {
  side: PlayerSide;
  role: "winner" | "loser" | "tie";
  highlight: boolean;
}) {
  const iconName =
    role === "winner" ? "trophy" : role === "loser" ? "skull-outline" : "hand-left-outline";
  const iconColor =
    role === "winner" ? colors.accentTab : role === "loser" ? colors.textMuted : colors.friendGreen;
  const emoji = role === "winner" ? "🏆" : role === "loser" ? "😤" : "🤝";
  const badge =
    role === "winner" ? "WINNER" : role === "loser" ? "" : "TIE";

  return (
    <View style={[styles.playerCol, highlight ? styles.playerColWin : styles.playerColLoss]}>
      <View style={styles.iconRow}>
        <Text style={styles.emoji}>{emoji}</Text>
        <Ionicons name={iconName as any} size={18} color={iconColor} />
      </View>
      <Avatar imageUrl={side.avatarUrl} name={side.name} size={52} />
      <Text style={styles.playerName} numberOfLines={1}>
        {side.name}
      </Text>
      {badge ? (
        <View style={[styles.roleBadge, role === "winner" && styles.roleBadgeWin]}>
          <Text style={[styles.roleBadgeText, role === "winner" && styles.roleBadgeTextWin]}>{badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

function isPromise(x: unknown): x is Promise<unknown> {
  return Boolean(x && typeof (x as Promise<unknown>).then === "function");
}

export default function ThreadMatchResultCard({
  gameTitle,
  winnerUserId,
  myId,
  mySide,
  opponentSide,
  prizeCents,
  timeLabel,
  actions,
}: ThreadMatchResultCardProps) {
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const isTie = !winnerUserId;
  const iWon = Boolean(winnerUserId && myId && String(winnerUserId) === String(myId));
  const opponentWon = Boolean(winnerUserId && myId && String(winnerUserId) !== String(myId));

  const myRole: "winner" | "loser" | "tie" = isTie ? "tie" : iWon ? "winner" : "loser";
  const oppRole: "winner" | "loser" | "tie" = isTie ? "tie" : opponentWon ? "winner" : "loser";

  const headline = isTie ? "Match tied" : iWon ? "You won!" : opponentWon ? "Match complete" : "Winner decided";
  const subtitle = isTie
    ? `${gameTitle} ended in a draw.`
    : `${gameTitle} — ${iWon ? "Nice work." : `${opponentSide.name} took the W.`}`;

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Ionicons name="game-controller" size={16} color={colors.accentMuted} />
          <Text style={styles.gameTitle}>{gameTitle}</Text>
        </View>

        <View style={styles.banner}>
          <Text style={styles.headline}>{headline}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        <View style={styles.versusRow}>
          <PlayerColumn side={mySide} role={myRole} highlight={myRole === "winner"} />
          <View style={styles.vsPill}>
            <Text style={styles.vsText}>VS</Text>
          </View>
          <PlayerColumn side={opponentSide} role={oppRole} highlight={oppRole === "winner"} />
        </View>

        {prizeCents != null && prizeCents > 0 ? (
          <Text style={styles.prizeLine}>
            {isTie ? "Stakes returned" : iWon ? `Prize ${formatPrize(prizeCents)}` : `Prize ${formatPrize(prizeCents)}`}
          </Text>
        ) : null}

        {timeLabel ? <Text style={styles.time}>{timeLabel}</Text> : null}

        {actions?.length ? (
          <View style={styles.actionsRow}>
            {actions.map((a, idx) => {
              const actionId = `${a.kind ?? "secondary"}:${a.label}:${idx}`;
              const isBusy = busyActionId === actionId;
              const isDisabled = Boolean(a.disabled || isBusy);
              const isPrimary = (a.kind ?? "secondary") === "primary";

              return (
                <Pressable
                  key={actionId}
                  disabled={isDisabled}
                  onPress={async () => {
                    if (busyActionId) return;
                    try {
                      const res = a.onPress();
                      if (isPromise(res)) {
                        setBusyActionId(actionId);
                        await res;
                      }
                    } finally {
                      setBusyActionId(null);
                    }
                  }}
                  style={({ pressed }) => [
                    isPrimary ? styles.primaryBtn : styles.secondaryBtn,
                    isDisabled && { opacity: 0.5 },
                    pressed && !isDisabled && { opacity: 0.9 },
                  ]}
                >
                  {isBusy ? (
                    <ActivityIndicator />
                  ) : (
                    <Text style={isPrimary ? styles.primaryText : styles.secondaryText} numberOfLines={1}>
                      {a.label}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: 10 },
  card: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: "#0d1324",
    borderWidth: 1,
    borderColor: "rgba(250,204,21,0.18)",
    shadowColor: colors.accentTab,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  gameTitle: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 15,
    flex: 1,
  },
  banner: {
    backgroundColor: "rgba(79,109,245,0.12)",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(99,120,255,0.25)",
    marginBottom: 14,
  },
  headline: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 16,
  },
  subtitle: {
    color: colors.textSecondary,
    fontWeight: "800",
    marginTop: 4,
    fontSize: 13,
  },
  versusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  playerCol: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
  },
  playerColWin: {
    backgroundColor: "rgba(250,204,21,0.10)",
    borderColor: "rgba(250,204,21,0.35)",
  },
  playerColLoss: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(255,255,255,0.08)",
    opacity: 0.88,
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  emoji: { fontSize: 18 },
  playerName: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 13,
    maxWidth: "100%",
    textAlign: "center",
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  roleBadgeWin: {
    backgroundColor: "rgba(250,204,21,0.18)",
    borderWidth: 1,
    borderColor: "rgba(250,204,21,0.45)",
  },
  roleBadgeText: {
    color: colors.textMuted,
    fontWeight: "900",
    fontSize: 10,
    letterSpacing: 0.6,
  },
  roleBadgeTextWin: {
    color: colors.accentTab,
  },
  vsPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  vsText: {
    color: colors.textMuted,
    fontWeight: "900",
    fontSize: 11,
  },
  prizeLine: {
    marginTop: 12,
    textAlign: "center",
    color: colors.accentTab,
    fontWeight: "900",
    fontSize: 14,
  },
  time: {
    marginTop: 8,
    textAlign: "center",
    color: "rgba(255,255,255,0.45)",
    fontWeight: "800",
    fontSize: 11,
  },
  actionsRow: { flexDirection: "row", gap: 10, marginTop: 14, flexWrap: "wrap", justifyContent: "center" },
  primaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(99,102,241,0.35)",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.55)",
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: "#fff", fontWeight: "900" },
  secondaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { color: "#fff", fontWeight: "900" },
});
