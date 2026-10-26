// components/thread/ChallengeCenterSheet.tsx
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { supabase } from "../../lib/backend/supabaseClient";

type FilterKey = "all" | "pending" | "active" | "completed";

type ChallengeRow = {
  id: string;
  title: string | null;
  game_type: string | null;
  kind: string | null;
  status: string | null;
  entry_fee_cents?: number | null;
  win_reward_cents?: number | null;
  created_at: string | null;
  updated_at: string | null;
  winner_user_id: string | null;
};

function formatUSDFromCents(cents: number) {
  return `$${(Number(cents ?? 0) / 100).toFixed(2)}`;
}

function normalizeStatus(s?: string | null) {
  const st = String(s ?? "").toLowerCase();
  if (st === "checked_in") return "checked-in";
  return st;
}

export default function ChallengeCenterSheet(props: {
  visible: boolean;
  onClose: () => void;

  threadId?: string | null;
  meId?: string | null;
  opponentId?: string | null;

  onOpenChallenge: (challengeId: string) => void;
}) {
  const { visible, onClose, threadId, meId, opponentId, onOpenChallenge } = props;

  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [rows, setRows] = useState<ChallengeRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const tid = String(threadId ?? "").trim();
        if (!tid) {
          if (!cancelled) setRows([]);
          return;
        }

        // 1) ✅ Primary: anything that has ever appeared in the thread timeline
        const { data: msgs, error: msgErr } = await supabase
          .from("thread_messages")
          .select("challenge_id")
          .eq("thread_id", tid)
          .not("challenge_id", "is", null)
          .limit(1500);

        if (msgErr) throw msgErr;

        const idsFromThread = Array.from(
          new Set((msgs ?? []).map((m: any) => String(m.challenge_id)).filter(Boolean))
        );

        // 2) ✅ Fallback: if we know me+opponent, also include *any* challenges where both are players
        // This protects your “everything between us is in one chat” promise even if a thread message wasn’t written.
        let idsFromPlayers: string[] = [];
        const a = String(meId ?? "").trim();
        const b = String(opponentId ?? "").trim();

        if (a && b) {
          const { data: aPl, error: aErr } = await supabase
            .from("challenge_players")
            .select("challenge_id")
            .eq("user_id", a)
            .limit(2000);

          if (!aErr && aPl?.length) {
            const aSet = new Set(aPl.map((r: any) => String(r.challenge_id)));
            const { data: bPl, error: bErr } = await supabase
              .from("challenge_players")
              .select("challenge_id")
              .eq("user_id", b)
              .limit(2000);

            if (!bErr && bPl?.length) {
              idsFromPlayers = bPl
                .map((r: any) => String(r.challenge_id))
                .filter((cid: string) => aSet.has(cid));
            }
          }
        }

        const allIds = Array.from(new Set([...idsFromThread, ...idsFromPlayers]));

        if (!allIds.length) {
          if (!cancelled) setRows([]);
          return;
        }

        const { data: chs, error: chErr } = await supabase
          .from("challenges")
          .select("id,title,game_type,kind,status,entry_fee_cents,win_reward_cents,created_at,updated_at,winner_user_id")
          .in("id", allIds)
          .order("updated_at", { ascending: false });

        if (chErr) throw chErr;

        if (!cancelled) setRows((chs ?? []) as any);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load challenges.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [visible, threadId, meId, opponentId]);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;

    return rows.filter((c) => {
      const st = normalizeStatus(c.status);
      if (filter === "pending") return st === "open";
      if (filter === "active") return st === "accepted" || st === "in-progress" || st === "checked-in";
      if (filter === "completed") return st === "completed";
      return true;
    });
  }, [rows, filter]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Thread Challenges</Text>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.85 }]}>
            <Ionicons name="close" size={18} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.filters}>
          <Pill label="All" active={filter === "all"} onPress={() => setFilter("all")} />
          <Pill label="Pending" active={filter === "pending"} onPress={() => setFilter("pending")} />
          <Pill label="Active" active={filter === "active"} onPress={() => setFilter("active")} />
          <Pill label="Completed" active={filter === "completed"} onPress={() => setFilter("completed")} />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text style={styles.sub}>Loading…</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(x) => x.id}
            contentContainerStyle={{ paddingBottom: 18 }}
            ListEmptyComponent={<Text style={styles.sub}>No challenges in this thread yet.</Text>}
            renderItem={({ item }) => {
              const st = normalizeStatus(item.status).toUpperCase();
              return (
                <Pressable
                  onPress={() => onOpenChallenge(item.id)}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.92 }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {item.title ?? item.game_type ?? "Challenge"}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {item.game_type ?? "Game"} • Fee {formatUSDFromCents(item.entry_fee_cents ?? 0)} • Prize{" "}
                      {formatUSDFromCents(item.win_reward_cents ?? 0)}
                    </Text>
                  </View>

                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{st || "UNKNOWN"}</Text>
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

function Pill(props: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      style={({ pressed }) => [styles.pill, props.active && styles.pillActive, pressed && { opacity: 0.9 }]}
    >
      <Text style={[styles.pillText, props.active && styles.pillTextActive]}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.35)",
  },

  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: "#050819",
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    maxHeight: "78%",
  },

  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sheetTitle: { color: "#fff", fontWeight: "900", fontSize: 18 },

  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },

  pill: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  pillActive: {
    backgroundColor: "rgba(99,102,241,0.20)",
    borderColor: "rgba(99,102,241,0.40)",
  },
  pillText: { color: "rgba(255,255,255,0.75)", fontWeight: "900" },
  pillTextActive: { color: "#fff" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 10,
  },
  rowTitle: { color: "#fff", fontWeight: "900" },
  rowMeta: { color: "rgba(255,255,255,0.65)", fontWeight: "800", marginTop: 6 },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  badgeText: { color: "#fff", fontWeight: "900", fontSize: 12 },

  center: { alignItems: "center", justifyContent: "center", paddingVertical: 24 },
  sub: { color: "rgba(255,255,255,0.6)", fontWeight: "800", paddingVertical: 12 },
  error: { color: "#FCA5A5", fontWeight: "900", paddingBottom: 8 },
});
