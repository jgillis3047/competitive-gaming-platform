// app/(tabs)/create.tsx
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  createChallengeAndChargeCreator,
  createInPersonChallengeAndChargeCreator,
  createEgameChallengeAndChargeCreator,
} from "../../lib/backend/challengeActions";
import { EGAME_CONFIRM_HOURS } from "../../lib/backend/egameVerification";
import { listLeaguesForTeam, listLeaguesForUser } from "../../lib/backend/leagues";
import { listTeamsForUser, listRecentTeams } from "../../lib/backend/teams";
import { getSellerByUserId } from "../../lib/backend/sellers";
import type { ChallengeKind, InPersonRules } from "../../lib/models/challengeTypes";
import type { LeagueWithExtras } from "../../lib/backend/leagues";
import type { TeamWithExtras } from "../../lib/backend/teams";
import { useAuthStore } from "../../lib/data/authStore";
import { GAME_CONFIG } from "../../lib/data/gameConfig";
import { useWalletStore } from "../../lib/data/walletStore";

import AppHeader from "../components/AppHeader";
import PracticeModePicker from "../components/PracticeModePicker";
import ScreenCanvas from "../../lib/ui/ScreenCanvas";
import { colors } from "../../lib/theme/colors";
import { pressSoft, pressSubtle } from "../../lib/ui/pressableStyles";

const QUICK_ENTRY = [0, 25, 50, 100];
const QUICK_CHECKIN = [10, 20, 30, 45, 60];
const QUICK_BEST_OF = [1, 3, 5];
const MATH24_SET_OPTIONS = [1, 3, 5, 10] as const;

// In-person activity presets (curated list; expand over time)
const IN_PERSON_GAMES = [
  { key: "Basketball 1v1", title: "Basketball 1v1", subtitle: "First to 11 or 21 — you decide." },
  { key: "Basketball 3v3", title: "Basketball 3v3", subtitle: "First team to 21 wins." },
  { key: "Basketball 5v5", title: "Basketball 5v5", subtitle: "Full-court pickup — winning team takes it." },
  { key: "HORSE", title: "HORSE", subtitle: "Trick shots — miss a letter, you're out." },
  { key: "Knockout", title: "Knockout", subtitle: "Last shooter standing wins." },
  { key: "Around the World", title: "Around the World", subtitle: "Clear every spot before your opponent." },
  { key: "Golf Closest to Pin", title: "Closest to Pin", subtitle: "Closest shot wins." },
  { key: "Free Throw Streak", title: "Free Throw Streak", subtitle: "Most makes in a row wins." },
  { key: "3PT Streak", title: "3PT Streak", subtitle: "Most 3s in a row wins." },
  { key: "Pickleball 2v2", title: "Pickleball 2v2", subtitle: "First team to 11 wins." },
  { key: "Soccer Penalties", title: "Soccer Penalties", subtitle: "Best-of penalty shootout." },
];

function clampNonNegativeInt(input: string) {
  const digits = (input ?? "").replace(/[^\d]/g, "");
  if (!digits) return 0;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function clampToRange(n: number, min: number, max: number) {
  const x = Number.isFinite(n) ? n : min;
  return Math.max(min, Math.min(max, x));
}

function formatUSDFromCents(n: number) {
  return `$${(Number(n ?? 0) / 100).toFixed(2)}`;
}

function emojiForGameKey(key: string) {
  switch (key) {
    case "Math Race":
      return "🧠";
    case "Math 24":
      return "⚡";
    case "Sudoku":
    case "Sudoku Race":
      return "🔢";
    case "Checkers":
      return "♟️";
    case "Anagrams":
      return "🔤";
    case "Unscramble Word":
      return "🔀";
    case "Match Cards":
      return "🃏";
    case "Word Hunt":
      return "🔍";
    case "Number Pattern":
      return "📐";
    case "2048":
      return "🧩";
    case "Chess":
      return "♔";
    case "Basketball 1v1":
      return "🏀";
    case "Basketball 3v3":
    case "Basketball 5v5":
      return "🏀";
    case "HORSE":
    case "Knockout":
    case "Around the World":
      return "🎯";
    case "Pickleball 2v2":
      return "🏓";
    case "Soccer Penalties":
      return "⚽";
    case "Closest to Pin":
    case "Golf Closest to Pin":
      return "⛳";
    case "Free Throw Streak":
      return "🎯";
    case "3PT Streak":
      return "🏹";
    default:
      return "🎮";
  }
}

export default function CreateScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const user = useAuthStore((s) => s.user);
  const refreshWallet = useWalletStore((s) => s.refresh ?? s.loadFromBackend);

  // Progressive disclosure: null = pick action, then show form
  const [selectedType, setSelectedType] = useState<null | "phone" | "in_person" | "egame" | "practice">(null);
  const [showMatchFormats, setShowMatchFormats] = useState(false);

  // Challenge type - synced with selectedType when "phone", "in_person", or "egame"
  const [kind, setKind] = useState<ChallengeKind>("phone");
  useEffect(() => {
    if (selectedType === "phone") {
      setKind("phone");
      setChallengeMode("1v1");
      setCreatorTeamId(null);
      setOpponentTeamId(null);
      setLeagueId(null);
    }
    if (selectedType === "in_person") setKind("in_person");
    if (selectedType === "egame") setKind("egame");
  }, [selectedType]);

  // Team/league challenge mode: 1v1 or team
  const [challengeMode, setChallengeMode] = useState<"1v1" | "team">("1v1");
  const [creatorTeamId, setCreatorTeamId] = useState<string | null>(null);
  const [opponentTeamId, setOpponentTeamId] = useState<string | null>(null);
  const [leagueId, setLeagueId] = useState<string | null>(null);
  const [myTeams, setMyTeams] = useState<TeamWithExtras[]>([]);
  const [availableLeagues, setAvailableLeagues] = useState<LeagueWithExtras[]>([]);
  const [opponentTeams, setOpponentTeams] = useState<TeamWithExtras[]>([]);

  // Deep link: ?kind=in_person opens In-Person mode
  useEffect(() => {
    const q = params.kind as string | undefined;
    if (q === "in_person") setKind("in_person");
  }, [params.kind]);

  // Deep link: ?creator_team_id=... or ?league_id=... from team/league profile
  useEffect(() => {
    const teamId = params.creator_team_id as string | undefined;
    const lId = params.league_id as string | undefined;
    if (teamId) {
      setChallengeMode("team");
      setCreatorTeamId(teamId);
    }
    if (lId) setLeagueId(lId);
  }, [params.creator_team_id, params.league_id]);

  useEffect(() => {
    if (!user?.id) return;
    listTeamsForUser(user.id).then(setMyTeams).catch(() => setMyTeams([]));
  }, [user?.id]);

  // Load leagues for selected creator team (or user's leagues for 1v1)
  useEffect(() => {
    if (!user?.id || (selectedType !== "phone" && selectedType !== "in_person" && selectedType !== "egame")) return;
    if (challengeMode === "team" && creatorTeamId) {
      listLeaguesForTeam(creatorTeamId).then(setAvailableLeagues).catch(() => setAvailableLeagues([]));
    } else {
      listLeaguesForUser(user.id).then(setAvailableLeagues).catch(() => setAvailableLeagues([]));
    }
  }, [user?.id, selectedType, challengeMode, creatorTeamId]);

  // Load opponent teams (recent teams, or teams in selected league)
  useEffect(() => {
    if ((selectedType !== "phone" && selectedType !== "in_person" && selectedType !== "egame") || challengeMode !== "team") return;
    listRecentTeams(20).then((t) => setOpponentTeams(t.filter((x) => x.id !== creatorTeamId))).catch(() => setOpponentTeams([]));
  }, [selectedType, challengeMode, creatorTeamId]);

  // ✅ Disclaimer agreement (only required for in-person)
  const [irlAgree, setIrlAgree] = useState(false);
  const [egameAgree, setEgameAgree] = useState(false);

  // Sponsor challenge (only if user is approved seller)
  const [mySeller, setMySeller] = useState<{ id: string; business_name: string } | null>(null);
  const [sponsorWithStore, setSponsorWithStore] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setMySeller(null);
      return;
    }
    let cancelled = false;
    getSellerByUserId(user.id)
      .then((row) => {
        if (cancelled) return;
        if (row?.id && row.business_name)
          setMySeller({ id: row.id, business_name: row.business_name });
        else setMySeller(null);
      })
      .catch(() => {
        if (!cancelled) setMySeller(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Phone-game options from GAME_CONFIG
  const phoneGameOptions = useMemo(() => {
    return Object.values(GAME_CONFIG)
      .filter((g: any) => g?.phoneRoute)
      .sort((a: any, b: any) => String(a?.title ?? "").localeCompare(String(b?.title ?? "")))
      .map((g: any) => ({
        key: String(g.key ?? g.title),
        title: String(g.title ?? g.key),
        subtitle: String(g.subtitle ?? ""),
        emoji: emojiForGameKey(String(g.key ?? g.title)),
      }));
  }, []);

  // In-person options (static for now)
  const inPersonOptions = useMemo(() => {
    return IN_PERSON_GAMES.map((g) => ({
      key: g.key,
      title: g.title,
      subtitle: g.subtitle,
      emoji: emojiForGameKey(g.key),
    }));
  }, []);

  // E-game options (manual mode, exclude IRL)
  const egameOptions = useMemo(() => {
    return Object.values(GAME_CONFIG)
      .filter((g: any) => g?.mode === "manual" && !String(g?.key ?? "").startsWith("IRL:"))
      .sort((a: any, b: any) => String(a?.title ?? "").localeCompare(String(b?.title ?? "")))
      .map((g: any) => ({
        key: String(g.key ?? g.title),
        title: String(g.title ?? g.key),
        subtitle: String(g.subtitle ?? ""),
        emoji: emojiForGameKey(String(g.key ?? g.title)),
      }));
  }, []);

  const gameOptions = useMemo(() => {
    if (kind === "in_person") return inPersonOptions;
    if (kind === "egame") return egameOptions;
    return phoneGameOptions;
  }, [kind, inPersonOptions, egameOptions, phoneGameOptions]);

  const defaultGameKey = useMemo(() => gameOptions[0]?.key ?? "Math Race", [gameOptions]);
  useEffect(() => {
  if (!selectedGame) {
    setSelectedGame(defaultGameKey);
    return;
  }
  const exists = gameOptions.some((g) => g.key === selectedGame);
  if (!exists) setSelectedGame(defaultGameKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [defaultGameKey, gameOptions]);

  const [selectedGame, setSelectedGame] = useState<string>(defaultGameKey);
  const [gamePickerOpen, setGamePickerOpen] = useState(false);
  const [gameQuery, setGameQuery] = useState("");
  const [customEgameName, setCustomEgameName] = useState<string>("");
  const [opponentUserId, setOpponentUserId] = useState<string | null>(null);
  // Prefill when navigated from Rematch button
  useEffect(() => {
    const opp = typeof params.opponent_user_id === "string" ? params.opponent_user_id : null;
    if (opp && opp.trim().length > 0) setOpponentUserId(opp);
  }, [params.opponent_user_id]);

  useEffect(() => {
    const game = typeof params.game === "string" ? params.game.trim() : "";
    if (!game) return;
    setShowMatchFormats(false);
    setSelectedType("phone");
    setSelectedGame(game);
  }, [params.game]);

  const [entryText, setEntryText] = useState<string>("0");
  const [message, setMessage] = useState<string>("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [showCompetitorNamesPublic, setShowCompetitorNamesPublic] = useState(true);
  const [loading, setLoading] = useState(false);

  // In-person rules
  const [locationText, setLocationText] = useState<string>("");
  const [checkinWindowText, setCheckinWindowText] = useState<string>("30");
  const [bestOfText, setBestOfText] = useState<string>("1");
  const [math24SetCount, setMath24SetCount] = useState<number>(1);

  // If user flips kind, ensure selectedGame is valid + reset agreement
  React.useEffect(() => {
    const exists = gameOptions.some((g) => g.key === selectedGame);
    if (!exists) setSelectedGame(defaultGameKey);
    if (kind !== "in_person") setIrlAgree(false);
    if (kind !== "egame") setEgameAgree(false);
    setGamePickerOpen(false);
    setGameQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, gameOptions, defaultGameKey]);

  const selectedGameOption = useMemo(
    () => gameOptions.find((g) => g.key === selectedGame) ?? gameOptions[0] ?? null,
    [gameOptions, selectedGame]
  );

  const filteredGameOptions = useMemo(() => {
    const q = gameQuery.trim().toLowerCase();
    if (!q) return gameOptions;
    return gameOptions.filter((g) => {
      const hay = `${g.title} ${g.subtitle} ${g.key}`.toLowerCase();
      return hay.includes(q);
    });
  }, [gameOptions, gameQuery]);

  const entryFeeCents = useMemo(() => clampNonNegativeInt(entryText), [entryText]);
  const winRewardCents = useMemo(() => (entryFeeCents > 0 ? entryFeeCents * 2 : 0), [entryFeeCents]);

  const title = useMemo(() => {
    if (kind === "in_person") return `${selectedGame} • In-Person`;
    if (kind === "egame") return `${selectedGame === "Custom E-game" ? (customEgameName.trim() || "Custom E-game") : selectedGame} • E-game`;
    return `${selectedGame} • 1v1`;
  }, [selectedGame, kind, customEgameName]);

  const messageClean = useMemo(() => {
    const m = (message ?? "").trim();
    return m.length ? m.slice(0, 140) : null;
  }, [message]);

  const checkinWindowMinutes = useMemo(() => {
    const n = clampNonNegativeInt(checkinWindowText);
    return clampToRange(n, 5, 180);
  }, [checkinWindowText]);

  const bestOf = useMemo(() => {
    const n = clampNonNegativeInt(bestOfText);
    const v = clampToRange(n, 1, 9);
    return v % 2 === 1 ? v : v + 1;
  }, [bestOfText]);

  const inPersonRules: InPersonRules = useMemo(() => {
    const loc = (locationText ?? "").trim();
    return {
      location_text: loc.length ? loc.slice(0, 80) : null,
      checkin_window_minutes: checkinWindowMinutes,
      best_of: bestOf,
    };
  }, [locationText, checkinWindowMinutes, bestOf]);

  const egameProofRequired = useMemo(
    () => kind === "egame" && (entryFeeCents > 0 || Boolean(leagueId)),
    [kind, entryFeeCents, leagueId]
  );

  const canCreate = useMemo(() => {
    if (loading) return false;
    if (kind === "in_person" && !irlAgree) return false;
    if (kind === "egame" && !egameAgree) return false;
    if (challengeMode === "team" && !creatorTeamId) return false;
    return true;
  }, [loading, kind, irlAgree, egameAgree, challengeMode, creatorTeamId]);

  const handleCreate = async () => {
    if (!user?.id) {
      Alert.alert("Sign in required", "Create an account or log in to create challenges.", [
        { text: "Cancel", style: "cancel" },
        { text: "Log in", onPress: () => router.push("/auth/login") },
      ]);
      return;
    }

    if (kind === "in_person" && !irlAgree) {
      Alert.alert("Confirm rules", "Please acknowledge the in-person disclaimer before creating.");
      return;
    }

    if (kind === "egame" && !egameAgree) {
      Alert.alert("Confirm rules", "Please acknowledge how e-game results work before creating.");
      return;
    }

try {
  setLoading(true);

  const invitedUserId = opponentUserId;          // string | null
  const inviteOnly = Boolean(invitedUserId);     // ✅ v1 behavior: invite-only only when you have a target

  const teamParams =
    kind !== "phone" && challengeMode === "team" ? { creatorTeamId, opponentTeamId, leagueId } : {};
  const sponsorParam = sponsorWithStore && mySeller ? { sponsoredBySellerId: mySeller.id } : {};

  const challengeId =
    kind === "in_person"
      ? await createInPersonChallengeAndChargeCreator({
          title,
          gameType: selectedGame,
          entryFeeCents: entryFeeCents,
          winRewardCents: winRewardCents,
          creatorUserId: user.id,
          message: messageClean,
          inPersonRules,
          inviteOnly,
          invitedUserId,
          opponentUserId: opponentUserId,
          ...teamParams,
          ...sponsorParam,
          showCompetitorNamesPublic,
        })
      : kind === "egame"
        ? await createEgameChallengeAndChargeCreator({
            title,
            gameType: selectedGame === "Custom E-game" ? (customEgameName.trim() || "Custom E-game") : selectedGame,
            entryFeeCents: entryFeeCents,
            winRewardCents: winRewardCents,
            creatorUserId: user.id,
            message: messageClean,
            inviteOnly,
            invitedUserId,
            opponentUserId: opponentUserId,
            ...teamParams,
            ...sponsorParam,
            showCompetitorNamesPublic,
          })
        : await createChallengeAndChargeCreator({
          title,
          gameType: selectedGame,
          entryFeeCents: entryFeeCents,
          winRewardCents: winRewardCents,
          creatorUserId: user.id,
          message: messageClean,
          inviteOnly,
          invitedUserId,
          opponentUserId: opponentUserId,
          ...teamParams,
          ...sponsorParam,
          showCompetitorNamesPublic,
          phoneRules:
            selectedGame === "Math 24" ? { set_count: math24SetCount } : undefined,
        });

  await refreshWallet();
  Alert.alert(
    "Challenge created",
    "You can tie this to leaderboards from the challenge thread or a spot’s Submit score flow.",
    [
      {
        text: "Open challenge",
        onPress: () => router.push({ pathname: "/challenge/[id]", params: { id: String(challengeId) } }),
      },
      { text: "Open leaderboards", onPress: () => router.push("/(tabs)/leaderboards" as any) },
    ]
  );
} catch (e: any) {
  console.error("[Create] create error:", e);
  Alert.alert("Error", e?.message ?? "Could not create challenge.");
} finally {
  setLoading(false);
}


  };

  return (
    <ScreenCanvas variant="gold">
      <AppHeader />
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 28 }}>
      <View style={styles.headerRow}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.header}>Create</Text>
          <Text style={styles.subheader}>
            {selectedType === null
              ? "Claim territory. Challenge kings. Post scores."
              : selectedType === "practice"
                ? "Practice mode — solo runs, unlimited reps."
                : selectedType === "phone"
                  ? "Phone game — 1v1 only."
                  : selectedType === "egame"
                    ? "E-game — report winner, optional proof. Opponent confirms within 12h."
                    : "In-person challenge."}
          </Text>
        </View>
      </View>

      {selectedType === null ? (
        <>
          <Text style={styles.sectionTitle}>What do you want to do?</Text>

          <Pressable
            onPress={() => setShowMatchFormats((v) => !v)}
            style={({ pressed }) => [styles.heroActionCard, styles.heroActionAccent, pressed && styles.typeCardPressed]}
          >
            <View style={styles.heroIconWrap}>
              <Ionicons name="flash" size={28} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroActionTitle}>Start match</Text>
              <Text style={styles.heroActionSub}>Phone, in-person, or e-game — challenge anyone</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Pressable>

          <Pressable
            onPress={() => setSelectedType("practice")}
            style={({ pressed }) => [styles.heroActionCard, styles.heroActionPractice, pressed && styles.typeCardPressed]}
          >
            <View style={[styles.heroIconWrap, styles.heroIconWrapPractice]}>
              <Ionicons name="barbell" size={26} color={colors.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroActionTitle}>Practice mode</Text>
              <Text style={styles.heroActionSub}>Phone games, running, fitness, soccer, pickleball, and more</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Pressable>

          <Pressable
            onPress={() => router.push("/(tabs)/feed" as any)}
            style={({ pressed }) => [styles.heroActionCard, styles.heroActionJoin, pressed && styles.typeCardPressed]}
          >
            <View style={[styles.heroIconWrap, styles.heroIconWrapJoin]}>
              <Ionicons name="search" size={26} color={colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroActionTitle}>Join open match</Text>
              <Text style={styles.heroActionSub}>Browse live challengers on Pulse — jump in now</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Pressable>

          <View style={styles.primaryActionsGrid}>
            <Pressable
              onPress={() => router.push("/courts/apply" as any)}
              style={({ pressed }) => [styles.primaryActionCard, styles.primaryActionCardGold, pressed && styles.typeCardPressed]}
            >
              <View style={styles.actionIconCircle}>
                <Ionicons name="ribbon" size={22} color={colors.gold} />
              </View>
              <Text style={styles.primaryActionTitle}>Claim spot</Text>
              <Text style={styles.primaryActionSub}>Become king at a real place</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/courts/challenge-kings" as any)}
              style={({ pressed }) => [styles.primaryActionCard, pressed && styles.typeCardPressed]}
            >
              <View style={[styles.actionIconCircle, styles.actionIconCircleWarn]}>
                <Ionicons name="skull" size={22} color={colors.warning} />
              </View>
              <Text style={styles.primaryActionTitle}>Challenge king</Text>
              <Text style={styles.primaryActionSub}>Kings by competition — near you or by area</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/courts" as any)}
              style={({ pressed }) => [styles.primaryActionCard, pressed && styles.typeCardPressed]}
            >
              <View style={[styles.actionIconCircle, styles.actionIconCircleMuted]}>
                <Ionicons name="clipboard" size={22} color={colors.success} />
              </View>
              <Text style={styles.primaryActionTitle}>Post score</Text>
              <Text style={styles.primaryActionSub}>Records & proof at a spot</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/team/create" as any)}
              style={({ pressed }) => [styles.primaryActionCard, pressed && styles.typeCardPressed]}
            >
              <View style={[styles.actionIconCircle, styles.actionIconCircleMuted]}>
                <Ionicons name="people" size={22} color={colors.accent} />
              </View>
              <Text style={styles.primaryActionTitle}>Create crew</Text>
              <Text style={styles.primaryActionSub}>Squad crowns & team matches</Text>
            </Pressable>
          </View>

          {showMatchFormats ? (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Match format</Text>
              <View style={styles.typeCards}>
                <Pressable
                  onPress={() => {
                    setShowMatchFormats(false);
                    setSelectedType("phone");
                  }}
                  style={({ pressed }) => [styles.typeCard, pressed && styles.typeCardPressed]}
                >
                  <Text style={styles.typeCardEmoji}>🎮</Text>
                  <Text style={styles.typeCardTitle}>Phone game</Text>
                  <Text style={styles.typeCardSub}>Math Race, Checkers, Sudoku…</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setShowMatchFormats(false);
                    setSelectedType("in_person");
                  }}
                  style={({ pressed }) => [styles.typeCard, pressed && styles.typeCardPressed]}
                >
                  <Text style={styles.typeCardEmoji}>🏀</Text>
                  <Text style={styles.typeCardTitle}>In-person</Text>
                  <Text style={styles.typeCardSub}>Basketball, golf, free throws…</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setShowMatchFormats(false);
                    setSelectedType("egame");
                  }}
                  style={({ pressed }) => [styles.typeCard, pressed && styles.typeCardPressed]}
                >
                  <Text style={styles.typeCardEmoji}>🖥️</Text>
                  <Text style={styles.typeCardTitle}>E-game</Text>
                  <Text style={styles.typeCardSub}>Play elsewhere — mutual confirm, proof when needed</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </>
      ) : selectedType === "practice" ? (
        <>
          <Pressable
            onPress={() => setSelectedType(null)}
            style={({ pressed }) => [styles.backLink, pressSubtle(pressed)]}
          >
            <Text style={styles.backLinkText}>← Back</Text>
          </Pressable>
          <PracticeModePicker />
        </>
      ) : (
        <>
          <Pressable
            onPress={() => {
              setSelectedType(null);
              setShowMatchFormats(false);
            }}
            style={({ pressed }) => [styles.backLink, pressSubtle(pressed)]}
          >
            <Text style={styles.backLinkText}>← Back</Text>
          </Pressable>

      <>
      {kind !== "phone" ? (
        <>
          <Text style={styles.sectionTitle}>Compete as</Text>
          <View style={styles.segmentedBar}>
            <Pressable
              onPress={() => {
                setChallengeMode("1v1");
                setCreatorTeamId(null);
                setOpponentTeamId(null);
                setLeagueId(null);
              }}
              style={[styles.segment, challengeMode === "1v1" && styles.segmentActive]}
            >
              <Text style={[styles.segmentLabel, challengeMode === "1v1" && styles.segmentLabelActive]}>Me</Text>
            </Pressable>
            <Pressable
              onPress={() => setChallengeMode("team")}
              style={[styles.segment, challengeMode === "team" && styles.segmentActive]}
            >
              <Text style={[styles.segmentLabel, challengeMode === "team" && styles.segmentLabelActive]}>Crew</Text>
            </Pressable>
          </View>

          {challengeMode === "team" ? (
            <View style={styles.ruleCard}>
              <Text style={styles.entryLabel}>Your crew</Text>
              <View style={styles.teamPickers}>
                {myTeams.length === 0 ? (
                  <View style={styles.noTeamsWrap}>
                    <Text style={styles.pickerHint}>No crews yet. Create one and invite players to challenge as a crew.</Text>
                    <Pressable
                      onPress={() => router.push("/team/create" as any)}
                      style={({ pressed }) => [styles.createTeamLink, pressSoft(pressed)]}
                    >
                      <Text style={styles.createTeamLinkText}>Create a crew</Text>
                    </Pressable>
                  </View>
                ) : (
                  myTeams.map((t) => (
                    <Pressable
                      key={t.id}
                      onPress={() => setCreatorTeamId(creatorTeamId === t.id ? null : t.id)}
                      style={({ pressed }) => [
                        styles.pickerChip,
                        creatorTeamId === t.id && styles.pickerChipSelected,
                        pressSoft(pressed),
                      ]}
                    >
                      <Text style={[styles.pickerChipText, creatorTeamId === t.id && styles.pickerChipTextSelected]}>{t.name}</Text>
                    </Pressable>
                  ))
                )}
              </View>
              <Text style={[styles.entryLabel, { marginTop: 12 }]}>Opponent crew (optional)</Text>
              <View style={styles.teamPickers}>
                {opponentTeams.slice(0, 10).map((t) => (
                  <Pressable
                    key={t.id}
                    onPress={() => setOpponentTeamId(opponentTeamId === t.id ? null : t.id)}
                    style={({ pressed }) => [
                      styles.pickerChip,
                      opponentTeamId === t.id && styles.pickerChipSelected,
                      pressSoft(pressed),
                    ]}
                  >
                    <Text style={[styles.pickerChipText, opponentTeamId === t.id && styles.pickerChipTextSelected]}>{t.name}</Text>
                  </Pressable>
                ))}
              </View>
              {availableLeagues.length > 0 ? (
                <>
                  <Text style={[styles.entryLabel, { marginTop: 12 }]}>League (optional)</Text>
                  <View style={styles.teamPickers}>
                    {availableLeagues.map((l) => (
                      <Pressable
                        key={l.id}
                        onPress={() => setLeagueId(leagueId === l.id ? null : l.id)}
                        style={({ pressed }) => [
                          styles.pickerChip,
                          leagueId === l.id && styles.pickerChipSelected,
                          pressSoft(pressed),
                        ]}
                      >
                        <Text style={[styles.pickerChipText, leagueId === l.id && styles.pickerChipTextSelected]}>{l.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}

      {/* ✅ Disclaimer (creator sees it too) - kind set by card choice */}
      {kind === "in_person" ? (
        <View style={styles.disclaimerInlineCard}>
          <Text style={styles.disclaimerInlineText}>
            ⚠️ Upload proof once at the end — AI reviews, opponent confirms. Use Arena Vision for shot tracking.
          </Text>

          <Pressable
            onPress={() => router.push("/vision" as any)}
            style={({ pressed }) => [styles.visionLink, pressSubtle(pressed)]}
          >
            <Text style={styles.visionLinkText}>Open Arena Vision (Basketball + Golf)</Text>
          </Pressable>

          <Pressable
            onPress={() => setIrlAgree((v) => !v)}
            style={({ pressed }) => [
              styles.disclaimerCheckRowCompact,
              pressSubtle(pressed),
            ]}
          >
            <View style={[styles.checkbox, irlAgree && styles.checkboxOn]}>
              {irlAgree ? <Text style={styles.checkboxTick}>✓</Text> : null}
            </View>
            <Text style={styles.disclaimerCheckText}>I understand and agree</Text>
          </Pressable>
        </View>
      ) : null}

      {kind === "egame" ? (
        <View style={styles.egameVerifyCard}>
          <View style={styles.egameVerifyHeader}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.accent} />
            <Text style={styles.egameVerifyTitle}>How results work</Text>
          </View>
          <Text style={styles.egameVerifyLine}>Play on console or PC — report the winner here when done.</Text>
          <Text style={styles.egameVerifyLine}>
            Winner reports result. Opponent has {EGAME_CONFIRM_HOURS} hours to confirm or dispute.
          </Text>
          <Text style={styles.egameVerifyLine}>No dispute = result is final. No screenshot every match.</Text>
          {egameProofRequired ? (
            <View style={styles.egameProofBanner}>
              <Ionicons name="camera-outline" size={14} color={colors.warning} />
              <Text style={styles.egameProofBannerText}>
                Proof required — {entryFeeCents > 0 ? "money on the line" : "crown/league match"}
              </Text>
            </View>
          ) : (
            <Text style={styles.egameVerifyMuted}>Free match — proof optional (recommended if disputed often).</Text>
          )}
          <Pressable
            onPress={() => setEgameAgree((v) => !v)}
            style={({ pressed }) => [styles.disclaimerCheckRowCompact, pressSubtle(pressed)]}
          >
            <View style={[styles.checkbox, egameAgree && styles.checkboxOn]}>
              {egameAgree ? <Text style={styles.checkboxTick}>✓</Text> : null}
            </View>
            <Text style={styles.disclaimerCheckText}>I understand mutual confirmation</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Game</Text>
      {kind === "in_person" ? (
        <Text style={styles.irGameHint}>Starter activities — we add more over time.</Text>
      ) : null}

      <Pressable
        onPress={() => setGamePickerOpen(true)}
        style={({ pressed }) => [styles.gameSelectorCard, pressSubtle(pressed)]}
      >
        <View style={styles.gameSelectorTop}>
          <Text style={styles.gameSelectorLabel}>Selected game</Text>
          <Text style={styles.gameSelectorAction}>Change</Text>
        </View>
        <View style={styles.gameSelectorMain}>
          <Text style={styles.gameSelectorEmoji}>{selectedGameOption?.emoji ?? "🎮"}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.gameSelectorTitle}>{selectedGameOption?.title ?? selectedGame}</Text>
            {selectedGameOption?.subtitle ? (
              <Text style={styles.gameSelectorSub} numberOfLines={2}>
                {selectedGameOption.subtitle}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </View>
      </Pressable>

      {kind === "egame" && selectedGame === "Custom E-game" ? (
        <View style={styles.ruleCard}>
          <Text style={styles.entryLabel}>Custom game name</Text>
          <TextInput
            value={customEgameName}
            onChangeText={setCustomEgameName}
            placeholder="e.g. Mario Kart, Smash Bros"
            placeholderTextColor={colors.textMuted}
            style={styles.ruleInput}
            maxLength={40}
          />
        </View>
      ) : null}

      {kind === "in_person" ? (
        <>
          <Text style={styles.sectionTitle}>Where</Text>

          <View style={styles.ruleCard}>
            <Text style={styles.entryLabel}>Meetup spot (optional)</Text>
            <TextInput
              value={locationText}
              onChangeText={setLocationText}
              placeholder="Ex: Sunset Park • Court 3"
              placeholderTextColor={colors.textMuted}
              style={styles.ruleInput}
              maxLength={80}
            />
          </View>
        </>
      ) : null}

      {kind === "phone" && selectedGame === "Math 24" ? (
        <>
          <Text style={styles.sectionTitle}>Sets to solve</Text>
          <Text style={styles.irGameHint}>
            Each player solves this many puzzles. Fastest total time wins.
          </Text>
          <View style={styles.quickChips}>
            {MATH24_SET_OPTIONS.map((v) => {
              const selected = math24SetCount === v;
              return (
                <Pressable
                  key={String(v)}
                  onPress={() => setMath24SetCount(v)}
                  style={({ pressed }) => [
                    styles.chip,
                    selected && styles.chipSelected,
                    pressSubtle(pressed),
                  ]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {v === 1 ? "1 set" : `${v} sets`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      <Text style={styles.sectionTitle}>How much</Text>

      <View style={styles.quickChips}>
        {QUICK_ENTRY.map((v) => {
          const selected = entryFeeCents === v;
          return (
            <Pressable
              key={String(v)}
              onPress={() => setEntryText(String(v))}
              style={({ pressed }) => [
                styles.chip,
                selected && styles.chipSelected,
                pressSubtle(pressed),
              ]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {v === 0 ? "Free" : formatUSDFromCents(v)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.feeHint}>Winner takes pot: {formatUSDFromCents(winRewardCents)}</Text>
      {kind === "egame" && entryFeeCents > 0 ? (
        <Text style={styles.egamePaidHint}>Paid e-game — winner uploads proof when reporting the result.</Text>
      ) : null}

      <Pressable
        onPress={() => setAdvancedOpen((v) => !v)}
        style={({ pressed }) => [styles.advancedToggle, pressSubtle(pressed)]}
      >
        <Text style={styles.advancedToggleText}>{advancedOpen ? "Advanced settings ▲" : "Advanced settings ▼"}</Text>
      </Pressable>

      {advancedOpen ? (
        <View style={styles.advancedCard}>
          {kind === "in_person" ? (
            <>
              <Text style={styles.entryLabel}>Check-in window (minutes)</Text>
              <TextInput
                value={checkinWindowText}
                onChangeText={setCheckinWindowText}
                placeholder="30"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                style={styles.ruleInput}
                maxLength={3}
              />
              <View style={styles.quickChips}>
                {QUICK_CHECKIN.map((v) => {
                  const selected = checkinWindowMinutes === v;
                  return (
                    <Pressable
                      key={String(v)}
                      onPress={() => setCheckinWindowText(String(v))}
                      style={({ pressed }) => [
                        styles.chip,
                        selected && styles.chipSelected,
                        pressSubtle(pressed),
                      ]}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{v}m</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={{ height: 10 }} />
              <Text style={styles.entryLabel}>Best of</Text>
              <TextInput
                value={bestOfText}
                onChangeText={setBestOfText}
                placeholder="1"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                style={styles.ruleInput}
                maxLength={1}
              />
              <View style={styles.quickChips}>
                {QUICK_BEST_OF.map((v) => {
                  const selected = bestOf === v;
                  return (
                    <Pressable
                      key={String(v)}
                      onPress={() => setBestOfText(String(v))}
                      style={({ pressed }) => [
                        styles.chip,
                        selected && styles.chipSelected,
                        pressSubtle(pressed),
                      ]}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                        {v === 1 ? "Single" : `Bo${v}`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          <View style={{ height: 10 }} />
          <Text style={styles.entryLabel}>Optional message</Text>
          <View style={styles.messageWrap}>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder='Talk your talk… (ex: “First to 21. No excuses 😤”)'
              placeholderTextColor={colors.textMuted}
              style={styles.messageInput}
              multiline
              maxLength={140}
            />
            <Text style={styles.messageHint}>{(message?.length ?? 0)}/140</Text>
          </View>

          <Text style={[styles.entryLabel, { marginTop: 10 }]}>Name visibility on Pulse</Text>
          <Pressable
            onPress={() => setShowCompetitorNamesPublic((v) => !v)}
            style={({ pressed }) => [styles.disclaimerCheckRowCompact, pressSubtle(pressed)]}
          >
            <View style={[styles.checkbox, showCompetitorNamesPublic && styles.checkboxOn]}>
              {showCompetitorNamesPublic ? <Text style={styles.checkboxTick}>✓</Text> : null}
            </View>
            <Text style={styles.disclaimerCheckText}>Show competitor names in Pulse open/live match cards</Text>
          </Pressable>
        </View>
      ) : null}

      {mySeller ? (
        <Pressable
          onPress={() => setSponsorWithStore((v) => !v)}
          style={({ pressed }) => [
            styles.disclaimerCheckRow,
            { marginTop: 16 },
            pressSubtle(pressed),
          ]}
        >
          <View style={[styles.checkbox, sponsorWithStore && styles.checkboxOn]}>
            {sponsorWithStore ? <Text style={styles.checkboxTick}>✓</Text> : null}
          </View>
          <Text style={styles.disclaimerCheckText}>Sponsor with {mySeller.business_name}</Text>
        </Pressable>
      ) : user?.id ? (
        <Pressable
          onPress={() => router.push("/apply-seller")}
          style={({ pressed }) => [styles.sellerHintRow, pressSubtle(pressed)]}
        >
          <Text style={styles.sellerHintText}>Want to sponsor challenges with your store? Apply as a seller →</Text>
        </Pressable>
      ) : null}

      <Pressable
        style={({ pressed }) => [
          styles.primaryButton,
          !canCreate && styles.primaryButtonDisabled,
          pressed && canCreate && { opacity: 0.92 },
        ]}
        onPress={handleCreate}
        disabled={!canCreate}
      >
        {loading ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Text style={styles.primaryButtonText}>
            {kind === "in_person" ? "Create In-Person Challenge" : kind === "egame" ? "Create E-game Challenge" : "Create"}
          </Text>
        )}
      </Pressable>

      <Modal
        visible={gamePickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setGamePickerOpen(false)}
      >
        <View style={styles.gamePickerWrap}>
          <View style={styles.gamePickerHeader}>
            <Pressable onPress={() => setGamePickerOpen(false)} style={({ pressed }) => [styles.backLink, pressSubtle(pressed)]}>
              <Text style={styles.backLinkText}>Close</Text>
            </Pressable>
            <Text style={styles.gamePickerTitle}>Pick a game</Text>
            <View style={{ width: 54 }} />
          </View>

          <View style={styles.gamePickerSearchWrap}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} />
            <TextInput
              value={gameQuery}
              onChangeText={setGameQuery}
              placeholder="Search games"
              placeholderTextColor={colors.textMuted}
              style={styles.gamePickerSearchInput}
            />
          </View>

          <ScrollView contentContainerStyle={styles.gamePickerList}>
            {filteredGameOptions.map((g) => {
              const selected = selectedGame === g.key;
              return (
                <Pressable
                  key={g.key}
                  onPress={() => {
                    setSelectedGame(g.key);
                    setGamePickerOpen(false);
                    setGameQuery("");
                  }}
                  style={({ pressed }) => [
                    styles.gamePickerRow,
                    selected && styles.gamePickerRowSelected,
                    pressSubtle(pressed),
                  ]}
                >
                  <Text style={styles.gamePickerEmoji}>{g.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.gamePickerRowTitle}>{g.title}</Text>
                    {g.subtitle ? <Text style={styles.gamePickerRowSub}>{g.subtitle}</Text> : null}
                  </View>
                  {selected ? <Ionicons name="checkmark-circle" size={18} color={colors.accent} /> : null}
                </Pressable>
              );
            })}
            {!filteredGameOptions.length ? (
              <Text style={styles.gamePickerEmpty}>No games match that search.</Text>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
      </>
      </>
      )}
    </ScrollView>
    </ScreenCanvas>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: colors.bgFeed },
  container: { flex: 1, backgroundColor: colors.bgFeed, paddingHorizontal: 16, paddingTop: 18 },

  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  headerTextWrap: { flex: 1 },

  header: { fontSize: 32, fontWeight: "900", color: colors.text },
  subheader: { marginTop: 4, fontSize: 13, color: colors.textTertiary, marginBottom: 10 },

  heroActionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
  },
  heroActionAccent: {
    backgroundColor: colors.accentSurface,
    borderColor: colors.accentBorder,
  },
  heroActionJoin: {
    backgroundColor: "rgba(16,185,129,0.08)",
    borderColor: "rgba(16,185,129,0.35)",
  },
  heroActionPractice: {
    backgroundColor: colors.goldSurface,
    borderColor: colors.goldBorderSoft,
  },
  heroIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(99,102,241,0.15)",
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  heroIconWrapJoin: {
    backgroundColor: "rgba(16,185,129,0.12)",
    borderColor: "rgba(16,185,129,0.35)",
  },
  heroIconWrapPractice: {
    backgroundColor: colors.goldSurface,
    borderColor: colors.goldBorderSoft,
  },
  heroActionTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
  heroActionSub: { color: colors.textTertiary, fontSize: 12, lineHeight: 16, marginTop: 3, fontWeight: "600" },
  actionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.goldSurface,
    borderWidth: 1,
    borderColor: colors.goldBorderSoft,
    marginBottom: 4,
  },
  actionIconCircleWarn: {
    backgroundColor: "rgba(245,158,11,0.12)",
    borderColor: "rgba(245,158,11,0.35)",
  },
  actionIconCircleMuted: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.line,
  },

  sectionTitle: { marginTop: 12, marginBottom: 8, color: colors.textSecondary, fontSize: 13, fontWeight: "800" },
  irGameHint: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: -4,
    marginBottom: 10,
    lineHeight: 17,
  },
  sellerHintRow: { marginTop: 16, paddingVertical: 4 },
  sellerHintText: { fontSize: 13, color: colors.accentMuted, fontWeight: "600" },

  primaryActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 4,
  },
  primaryActionCard: {
    width: "48%",
    flexGrow: 1,
    minWidth: "46%",
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  primaryActionCardAccent: {
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSurface,
  },
  primaryActionCardGold: {
    borderColor: colors.goldBorder,
    backgroundColor: colors.goldSurface,
  },
  primaryActionTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
  primaryActionSub: { color: colors.textTertiary, fontSize: 12, lineHeight: 16, fontWeight: "600" },
  moreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  moreRowTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  moreRowSub: { color: colors.textTertiary, fontSize: 12, marginTop: 2 },
  quickActionsRow: { flexDirection: "row", gap: 10, marginBottom: 4 },
  trendingRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  trendingCard: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 12,
    minHeight: 88,
  },
  trendingEmoji: { fontSize: 18, marginBottom: 6 },
  trendingTitle: { color: colors.text, fontSize: 13, fontWeight: "800" },
  trendingSub: { color: colors.textTertiary, fontSize: 11, marginTop: 4, lineHeight: 15, fontWeight: "600" },
  quickActionCard: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  quickActionTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  quickActionSub: { color: colors.textTertiary, fontSize: 12, lineHeight: 16, fontWeight: "600" },
  createTeamHubLink: { marginTop: 8, paddingVertical: 6 },
  createTeamHubLinkText: { color: colors.accentMuted, fontSize: 13, fontWeight: "800" },

  typeCards: { gap: 12, marginBottom: 8 },
  typeCard: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 18,
  },
  typeCardPressed: { opacity: 0.92 },
  typeCardEmoji: { fontSize: 28, marginBottom: 8 },
  typeCardTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
  typeCardSub: { color: colors.textTertiary, fontSize: 13, marginTop: 4, lineHeight: 18 },
  backLink: { marginBottom: 12 },
  backLinkText: { color: colors.accent, fontSize: 15, fontWeight: "800" },

  segmentedBar: {
    flexDirection: "row",
    height: 36,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    padding: 3,
    marginBottom: 4,
  },
  segment: {
    flex: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentActive: { backgroundColor: colors.accentCTA },
  segmentLabel: { color: colors.textTertiary, fontSize: 13, fontWeight: "800" },
  segmentLabelActive: { color: colors.text },

  segmentWrap: { flexDirection: "row", gap: 10 },
  segmentBtn: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 12,
  },
  segmentBtnActive: { borderColor: colors.accentBorder, backgroundColor: colors.accentSurface },
  segmentText: { color: colors.textSecondary, fontSize: 14, fontWeight: "900" },
  segmentTextActive: { color: colors.text },
  segmentSub: { marginTop: 4, color: colors.textTertiary, fontSize: 12, fontWeight: "700" },
  segmentSubActive: { color: colors.textSecondary },

  // ✅ disclaimer card
  disclaimerInlineCard: {
    marginTop: 8,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  disclaimerInlineText: { color: colors.textTertiary, fontSize: 11, lineHeight: 15, fontWeight: "700" },
  visionLink: {
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: colors.accentChip,
    borderWidth: 1,
    borderColor: colors.accentChipBorder,
  },
  visionLinkText: { color: colors.accentMuted, fontSize: 12, fontWeight: "900", textAlign: "center" },
  egameVerifyCard: {
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  egameVerifyHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  egameVerifyTitle: { color: colors.text, fontWeight: "900", fontSize: 14 },
  egameVerifyLine: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, fontWeight: "600", marginBottom: 4 },
  egameVerifyMuted: { color: colors.textTertiary, fontSize: 11, lineHeight: 16, fontWeight: "600", marginTop: 2 },
  egameProofBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    marginBottom: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: colors.warningSurface,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  egameProofBannerText: { flex: 1, color: colors.warning, fontSize: 12, fontWeight: "800" },
  egamePaidHint: { color: colors.warning, fontSize: 11, fontWeight: "700", marginTop: 4, marginBottom: 2 },
  disclaimerCheckRowCompact: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  disclaimerCard: {
    marginTop: 10,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 10,
  },
  disclaimerTitle: { color: colors.text, fontWeight: "900", fontSize: 12, marginBottom: 6 },
  disclaimerText: { color: colors.textTertiary, fontSize: 11, lineHeight: 15, marginTop: 4 },
  disclaimerCheckRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bgDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  checkboxTick: { color: colors.text, fontWeight: "900", fontSize: 12, lineHeight: 12 },
  disclaimerCheckText: { color: colors.textSecondary, fontWeight: "800", fontSize: 11 },

  gameSelectorCard: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 12,
  },
  gameSelectorTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  gameSelectorLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  gameSelectorAction: { color: colors.accentMuted, fontSize: 11, fontWeight: "800" },
  gameSelectorMain: { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 10 },
  gameSelectorEmoji: { fontSize: 18 },
  gameSelectorTitle: { color: colors.text, fontSize: 14, fontWeight: "900" },
  gameSelectorSub: { color: colors.textTertiary, fontSize: 12, lineHeight: 16, marginTop: 2 },

  gamePickerWrap: { flex: 1, backgroundColor: colors.bgFeed, paddingHorizontal: 16, paddingTop: 14 },
  gamePickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  gamePickerTitle: { color: colors.text, fontWeight: "900", fontSize: 16 },
  gamePickerSearchWrap: {
    marginTop: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  gamePickerSearchInput: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 0 },
  gamePickerList: { gap: 8, paddingBottom: 24 },
  gamePickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceMuted,
  },
  gamePickerRowSelected: { borderColor: colors.accentBorder, backgroundColor: colors.accentSurface },
  gamePickerEmoji: { fontSize: 17 },
  gamePickerRowTitle: { color: colors.text, fontSize: 13, fontWeight: "900" },
  gamePickerRowSub: { color: colors.textTertiary, fontSize: 12, marginTop: 2, lineHeight: 16 },
  gamePickerEmpty: { color: colors.textMuted, fontSize: 12, textAlign: "center", marginTop: 12 },

  entryRow: { flexDirection: "row", gap: 10 },
  entryBox: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 10,
  },
  entryLabel: { color: colors.textTertiary, fontSize: 11, fontWeight: "700" },
  entryInput: { marginTop: 6, color: colors.text, fontSize: 20, fontWeight: "900", paddingVertical: 4 },
  entryComputed: { marginTop: 8, color: colors.text, fontSize: 16, fontWeight: "900" },

  quickChips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceMuted,
  },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textSecondary, fontWeight: "800", fontSize: 11 },
  chipTextSelected: { color: colors.text },
  feeHint: { marginTop: 8, color: colors.textMuted, fontSize: 12, fontWeight: "700" },

  advancedToggle: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
  },
  advancedToggleText: { color: colors.textSecondary, fontSize: 12, fontWeight: "900" },
  advancedCard: {
    marginTop: 8,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 10,
  },

  messageWrap: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 10,
  },
  messageInput: { minHeight: 72, color: colors.text, fontSize: 13, lineHeight: 18 },
  messageHint: { marginTop: 6, color: colors.textMuted, fontSize: 11, textAlign: "right" },

  ruleCard: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 10,
  },
  teamPickers: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  pickerChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceMuted,
  },
  pickerChipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  pickerChipText: { color: colors.textSecondary, fontWeight: "800", fontSize: 11 },
  pickerChipTextSelected: { color: colors.text },
  pickerHint: { color: colors.textMuted, fontSize: 12 },
  noTeamsWrap: { gap: 8, width: "100%" },
  createTeamLink: { alignSelf: "flex-start", paddingVertical: 4 },
  createTeamLinkText: { color: colors.accent, fontWeight: "800", fontSize: 13 },
  ruleInput: { marginTop: 6, color: colors.text, fontSize: 14, fontWeight: "800", paddingVertical: 6 },
  ruleHint: { marginTop: 8, color: colors.textMuted, fontSize: 11, lineHeight: 14 },

  primaryButton: {
    marginTop: 14,
    backgroundColor: colors.accentCTA,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonDisabled: { opacity: 0.55 },
  primaryButtonText: { color: colors.text, fontWeight: "900", fontSize: 14, letterSpacing: 0.2 },
  secondaryButton: {
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
  },
  secondaryButtonText: { color: colors.textSecondary, fontWeight: "800", fontSize: 13 },
});
