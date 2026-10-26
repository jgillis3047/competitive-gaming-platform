// app/phone-games/word-hunt.tsx - Find words in grid, most points wins
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { submitChallengeResult } from "../../lib/backend/challengeActions";
import { supabase } from "../../lib/backend/supabaseClient";
import { useAuthStore } from "../../lib/data/authStore";
import { colors } from "../../lib/theme/colors";
import { pressSoftIcon } from "../../lib/ui/pressableStyles";

// Pre-built 4x4 grids with words. Format: [grid letters row-major, valid words]
const GRIDS: [string, string[]][] = [
  ["CATSRDOGBEARTOP", ["CAT", "DOG", "BEAR", "TOP", "RAT", "BAT", "SAD", "CAR", "TAR", "ORE", "DOE", "SEA"]],
  ["LAMPIONSETREAK", ["LAMP", "LION", "SET", "TREK", "LAME", "PAN", "NET", "IRE", "SON", "TEA", "ORE", "PEA"]],
  ["WORDHUNTGAMEPLY", ["WORD", "HUNT", "GAME", "PLAY", "WORN", "RUN", "HUG", "TAN", "MAN", "GEL", "YET"]],
  ["STARNESTFIREBOW", ["STAR", "NEST", "FIRE", "BOW", "TAN", "SIT", "NET", "ORE", "SEW", "RIB", "BET"]],
  ["MILKCOALFEDBUG", ["MILK", "COAL", "FED", "BUG", "ILK", "OAK", "LEA", "ALB", "COB", "DEB"]],
];
const TIME_LIMIT = 60;
const MIN_LEN = 3;

type SeedEvent = { id: string; type: string; payload: any; created_at: string };

export default function WordHuntScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ challengeId?: string }>();
  const challengeId = params?.challengeId ? String(params.challengeId) : null;
  const user = useAuthStore((s) => s.user);

  const [loading, setLoading] = useState(!!challengeId);
  const [grid, setGrid] = useState("");
  const [validWords, setValidWords] = useState<string[]>([]);
  const [found, setFound] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [selection, setSelection] = useState<number[]>([]);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const [finished, setFinished] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inChallenge = !!challengeId;

  const points = found.reduce((s, w) => s + (w.length >= 5 ? 3 : w.length === 4 ? 2 : 1), 0);
  const pointsRef = useRef(0);
  pointsRef.current = points;
  const validSet = new Set(validWords.map((w) => w.toUpperCase()));

  useEffect(() => {
    if (!challengeId) {
      const [g, w] = GRIDS[Math.floor(Math.random() * GRIDS.length)];
      setGrid(g);
      setValidWords(w);
      setTimeLeft(TIME_LIMIT);
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
        let g: string, w: string[];
        if (existing?.payload?.game === "Word Hunt" && existing.payload.grid) {
          g = existing.payload.grid;
          w = Array.isArray(existing.payload.words) ? existing.payload.words : [];
        } else {
          const idx = Math.floor(Math.random() * GRIDS.length);
          [g, w] = GRIDS[idx];
          await supabase.from("challenge_events").insert({
            challenge_id: challengeId,
            type: "game_seed",
            actor_user_id: user?.id ?? null,
            body: "Game seed created.",
            payload: { game: "Word Hunt", grid: g, words: w, seedVersion: 1 },
          });
        }
        if (mounted) {
          setGrid(g);
          setValidWords(w.length ? w : GRIDS[0][1]);
          setTimeLeft(TIME_LIMIT);
        }
      } catch {
        if (mounted) {
          const [g, w] = GRIDS[0];
          setGrid(g);
          setValidWords(w);
          setTimeLeft(TIME_LIMIT);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [challengeId, user?.id]);

  useEffect(() => {
    if (loading) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          if (inChallenge && user?.id && !finished && !submitting) {
            setFinished(true);
            setSubmitting(true);
            const finalPoints = pointsRef.current;
            submitChallengeResult({ challengeId: challengeId!, userId: user.id, score: finalPoints, scoreSort: "desc" })
              .then(() => Alert.alert("Time's up!", `Points: ${finalPoints}`, [{ text: "OK", onPress: () => router.replace(`/challenge/${challengeId}` as any) }]))
              .catch((e) => Alert.alert("Submit failed", e?.message ?? ""))
              .finally(() => setSubmitting(false));
          } else if (!inChallenge) {
            setFinished(true);
            Alert.alert("Time's up!", `Points: ${pointsRef.current}`);
          }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
    /* Timer uses finished/submitting/router in closure — full deps restart interval every render. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, inChallenge, challengeId, user?.id]);

  const getNeighbors = (i: number) => {
    const r = Math.floor(i / 4), c = i % 4;
    const n: number[] = [];
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < 4 && nc >= 0 && nc < 4) n.push(nr * 4 + nc);
      }
    return n;
  };

  const handleCell = (i: number) => {
    if (finished) return;
    if (selection.length === 0) {
      setSelection([i]);
      setInput(grid[i].toUpperCase());
      return;
    }
    const last = selection[selection.length - 1];
    const neighbors = getNeighbors(last);
    if (neighbors.includes(i)) {
      if (selection.includes(i)) {
        const idx = selection.indexOf(i);
        setSelection(selection.slice(0, idx + 1));
        setInput(selection.slice(0, idx + 1).map((j) => grid[j]).join("").toUpperCase());
      } else {
        const nextSel = [...selection, i];
        const word = nextSel.map((j) => grid[j]).join("").toUpperCase();
        setSelection(nextSel);
        setInput(word);
        if (word.length >= MIN_LEN && validSet.has(word) && !found.includes(word)) {
          setFound([...found, word]);
          setSelection([]);
          setInput("");
        }
      }
    } else if (i === last) {
      const word = selection.map((j) => grid[j]).join("").toUpperCase();
      if (word.length >= MIN_LEN && validSet.has(word) && !found.includes(word)) {
        setFound([...found, word]);
      }
      setSelection([]);
      setInput("");
    }
  };

  const handleSubmit = () => {
    const w = input.trim().toUpperCase();
    if (w.length >= MIN_LEN && validSet.has(w) && !found.includes(w)) {
      setFound([...found, w]);
    }
    setSelection([]);
    setInput("");
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  const gridArr = grid.split("").slice(0, 16);
  while (gridArr.length < 16) gridArr.push("?");

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Word Hunt", headerShown: false }} />
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.topBtn, pressSoftIcon(pressed)]}>
          <Text style={styles.topBtnText}>Back</Text>
        </Pressable>
        <Text style={styles.topTitle}>Word Hunt</Text>
        <View style={styles.stats}>
          <Text style={styles.points}>pts: {points}</Text>
          <Text style={styles.timer}>{timeLeft}s</Text>
        </View>
      </View>
      <View style={styles.card}>
        <Text style={styles.wordInput}>{input || "Tap letters to spell a word"}</Text>
        <Pressable onPress={handleSubmit} style={styles.submitBtn}>
          <Text style={styles.submitText}>Submit</Text>
        </Pressable>
        <View style={styles.grid}>
          {gridArr.map((ch, i) => (
            <Pressable
              key={i}
              onPress={() => handleCell(i)}
              style={[styles.cell, selection.includes(i) && styles.cellSelected]}
            >
              <Text style={styles.cellText}>{ch}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.foundLabel}>Found: {found.join(", ") || "—"}</Text>
      </View>
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
  stats: { flexDirection: "row", gap: 16 },
  points: { color: colors.success, fontSize: 16, fontWeight: "800" },
  timer: { color: colors.warning, fontSize: 16, fontWeight: "800" },
  card: { margin: 16, padding: 20, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.line },
  wordInput: { color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: 8, minHeight: 24 },
  submitBtn: { alignSelf: "flex-start", paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.accent, borderRadius: 8, marginBottom: 16 },
  submitText: { color: colors.text, fontWeight: "800", fontSize: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  cell: {
    width: "23%",
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  cellSelected: { backgroundColor: colors.accent },
  cellText: { color: colors.text, fontSize: 20, fontWeight: "800" },
  foundLabel: { marginTop: 16, color: colors.textTertiary, fontSize: 13 },
});
