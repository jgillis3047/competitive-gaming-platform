// app/phone-games/match-cards.tsx - Memory match, fewest moves wins
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { finalizeScoreBasedChallengeIfReady, submitChallengeResult } from "../../lib/backend/challengeActions";
import { fetchRecentChallenges } from "../../lib/backend/challenges";
import { useChallengeStore } from "../../lib/data/challengeStore";
import { supabase } from "../../lib/backend/supabaseClient";
import { useAuthStore } from "../../lib/data/authStore";
import { getGameProgress, type GameProgress } from "../../lib/data/gameProgress";
import { mediumTap, success as hapticSuccess } from "../../lib/utils/haptics";
import { colors } from "../../lib/theme/colors";
import { pressSoftIcon } from "../../lib/ui/pressableStyles";
import { useGameResultFlow } from "./useGameResultFlow";

const GAME_KEY = "Match Cards";

const SIZE = 4; // 4x4 = 8 pairs
const EMOJIS = ["🍎", "🍊", "🍋", "🍇", "🍓", "🍑", "🥝", "🍒"];

type SeedEvent = { id: string; type: string; payload: any; created_at: string };

function shuffle<T>(arr: T[], seed: number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    seed = (seed * 9301 + 49297) % 233280;
    const j = Math.floor((seed / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function MatchCardsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ challengeId?: string }>();
  const challengeId = params?.challengeId ? String(params.challengeId) : null;
  const user = useAuthStore((s) => s.user);

  const [loading, setLoading] = useState(!!challengeId);
  const [cards, setCards] = useState<string[]>([]);
  const [revealed, setRevealed] = useState<boolean[]>([]);
  const [matched, setMatched] = useState<boolean[]>([]);
  const [moves, setMoves] = useState(0);
  const [firstPick, setFirstPick] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<GameProgress | null>(null);
  const inChallenge = !!challengeId;

  const { showPracticeResult, showChallengeSubmitted, ResultModal } = useGameResultFlow(
    GAME_KEY,
    "Match Cards",
    challengeId
  );

  useEffect(() => {
    getGameProgress(GAME_KEY).then(setProgress).catch(() => setProgress(null));
  }, []);

  const resetPractice = () => {
    const seed = Date.now() % 233280;
    const order = shuffle(deck, seed);
    setCards(order);
    setRevealed(deck.map(() => false));
    setMatched(deck.map(() => false));
    setMoves(0);
    setFirstPick(null);
    setFinished(false);
  };

  const pairs = EMOJIS.slice(0, (SIZE * SIZE) / 2);
  const deck = [...pairs, ...pairs];

  useEffect(() => {
    if (!challengeId) {
      const seed = Date.now() % 233280;
      setCards(shuffle(deck, seed));
      setRevealed(deck.map(() => false));
      setMatched(deck.map(() => false));
      setLoading(false);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const { data: seedEvents } = await supabase
          .from("challenge_events")
          .select("id, type, payload, created_at")
          .eq("challenge_id", challengeId)
          .eq("type", "game_seed")
          .order("created_at", { ascending: true })
          .limit(1);
        const existing = (seedEvents?.[0] as SeedEvent | undefined) ?? null;
        let order: string[];
        if (existing?.payload?.game === "Match Cards" && Array.isArray(existing.payload.order)) {
          order = existing.payload.order;
        } else {
          const seed = Math.floor(Math.random() * 233280);
          order = shuffle(deck, seed);
          await supabase.from("challenge_events").insert({
            challenge_id: challengeId,
            type: "game_seed",
            actor_user_id: user?.id ?? null,
            body: "Game seed created.",
            payload: { game: "Match Cards", order, seedVersion: 1 },
          });
        }
        if (mounted) {
          setCards(order.length ? order : shuffle(deck, Date.now() % 233280));
          setRevealed(deck.map(() => false));
          setMatched(deck.map(() => false));
        }
      } catch {
        if (mounted) {
          setCards(shuffle(deck, Date.now() % 233280));
          setRevealed(deck.map(() => false));
          setMatched(deck.map(() => false));
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
    // deck is derived from constants; including it would rerun every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeId, user?.id]);

  useEffect(() => {
    if (!challengeId || !user?.id) return;
    void finalizeScoreBasedChallengeIfReady({
      challengeId,
      actorUserId: user.id,
      scoreSort: "asc",
    })
      .then((finalized) => {
        if (!finalized) return;
        fetchRecentChallenges()
          .then((remote) => useChallengeStore.setState({ challenges: remote }))
          .catch(() => {});
      })
      .catch(() => {});
  }, [challengeId, user?.id, finished]);

  const handlePick = (i: number) => {
    if (revealed[i] || matched[i] || finished) return;
    mediumTap();
    if (firstPick === null) {
      setFirstPick(i);
      setRevealed((r) => {
        const next = [...r];
        next[i] = true;
        return next;
      });
      setMoves((m) => m + 1);
      return;
    }
    setMoves((m) => m + 1);
    setRevealed((r) => {
      const next = [...r];
      next[i] = true;
      return next;
    });
    if (cards[firstPick] === cards[i]) {
      hapticSuccess();
      setMatched((m) => {
        const next = [...m];
        next[firstPick] = true;
        next[i] = true;
        const all = next.every(Boolean);
        const finalMoves = moves + 1;
        if (all && inChallenge && user?.id && !submitting) {
          setFinished(true);
          setSubmitting(true);
          submitChallengeResult({
            challengeId: challengeId!,
            userId: user.id,
            score: finalMoves,
            scoreSort: "asc",
          })
            .then(async () => {
              await finalizeScoreBasedChallengeIfReady({
                challengeId: challengeId!,
                actorUserId: user.id,
                scoreSort: "asc",
              }).catch(() => false);
              fetchRecentChallenges()
                .then((remote) => useChallengeStore.setState({ challenges: remote }))
                .catch(() => {});
              const s = await showChallengeSubmitted({
                score: 1000 - finalMoves,
                timeSec: finalMoves,
                scoreLabel: `Moves: ${finalMoves}`,
              });
              setProgress(s.progress);
            })
            .catch((e) => Alert.alert("Submit failed", e?.message ?? "Could not submit."))
            .finally(() => setSubmitting(false));
        } else if (all && !inChallenge) {
          setFinished(true);
          void showPracticeResult(
            {
              score: 1000 - finalMoves,
              timeSec: finalMoves,
              scoreLabel: `Moves: ${finalMoves}`,
            },
            resetPractice
          ).then((s) => setProgress(s.progress));
        }
        return next;
      });
    } else {
      setTimeout(() => {
        setRevealed((r) => {
          const next = [...r];
          next[firstPick!] = false;
          next[i] = false;
          return next;
        });
      }, 600);
    }
    setFirstPick(null);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Match Cards", headerShown: false }} />
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.topBtn, pressSoftIcon(pressed)]}>
          <Text style={styles.topBtnText}>Back</Text>
        </Pressable>
        <Text style={styles.topTitle}>Match Cards</Text>
        <Text style={styles.moves}>Moves: {moves}</Text>
      </View>
      <View style={{ paddingHorizontal: 16 }}>
      </View>
      <View style={styles.grid}>
        {cards.map((emoji, i) => (
          <Pressable
            key={i}
            onPress={() => handlePick(i)}
            style={[styles.card, revealed[i] || matched[i] ? styles.cardRevealed : styles.cardHidden]}
          >
            <Text style={styles.emoji}>{revealed[i] || matched[i] ? emoji : "?"}</Text>
          </Pressable>
        ))}
      </View>
      <ResultModal />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 12, color: colors.textTertiary, fontSize: 14 },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16 },
  topBtn: { marginRight: 12 },
  topBtnText: { color: colors.text, fontWeight: "700" },
  topTitle: { flex: 1, color: colors.text, fontSize: 18, fontWeight: "800", textAlign: "center" },
  moves: { color: colors.warning, fontSize: 16, fontWeight: "800" },
  grid: { flexDirection: "row", flexWrap: "wrap", padding: 16, gap: 10, justifyContent: "center" },
  card: {
    width: "22%",
    aspectRatio: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  cardHidden: { backgroundColor: colors.surfaceElevated, borderColor: colors.line },
  cardRevealed: { backgroundColor: colors.accentSurface, borderColor: colors.accentBorder },
  emoji: { fontSize: 28 },
});
