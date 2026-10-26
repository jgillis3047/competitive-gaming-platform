// app/courts/apply.tsx — Claim a Crown (two-step flow); proof required except online games
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import type { Href } from "expo-router";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  fetchCourtById,
  fetchNearbyCourts,
  fetchRecordTypes,
  getSpotRecordTypesForCourt,
  type CourtRecordTypeRow,
  type NearbyCourtRow,
} from "../../lib/backend/courts";
import {
  fetchRecentChallengeWins,
  submitKingClaimApplication,
  type AreaKind,
  type ChallengeWinRow,
  type ClaimScope,
} from "../../lib/backend/kingClaims";
import {
  fetchKingLeaderboardWithProfiles,
  formatKingScore,
  scopeKeyForCity,
  scopeKeyForCourt,
  scopeKeyForTeamCity,
  scopeKeyForTeamCourt,
  type KingLeaderboardRow,
} from "../../lib/backend/kingLeaderboard";
import { listTeamsForUser, type TeamWithExtras } from "../../lib/backend/teams";
import { uploadKingClaimMedia } from "../../lib/backend/mediaService";
import { useAuthStore } from "../../lib/data/authStore";
import { colors } from "../../lib/theme/colors";
import { space } from "../../lib/theme/spacing";
import { pressSoft } from "../../lib/ui/pressableStyles";
import { resolveForegroundLatLng } from "../../lib/utils/resolveForegroundLatLng";

const AREA_OPTIONS: { key: AreaKind; label: string }[] = [
  { key: "gym", label: "Gym" },
  { key: "park", label: "Park" },
  { key: "trail", label: "Trail" },
  { key: "track", label: "Track" },
  { key: "range", label: "Range" },
  { key: "driving_range", label: "Driving range" },
  { key: "other", label: "Other" },
];

function inferMediaType(uri: string): "image" | "video" {
  const lower = (uri ?? "").toLowerCase();
  if (lower.includes(".mp4") || lower.includes(".mov") || lower.includes(".webm") || lower.includes("video/"))
    return "video";
  return "image";
}

function isAreaKindParam(s: string): s is AreaKind {
  return (
    s === "gym" ||
    s === "park" ||
    s === "trail" ||
    s === "track" ||
    s === "range" ||
    s === "driving_range" ||
    s === "other"
  );
}

type CurrentHolderInfo = {
  name: string;
  scoreFormatted: string;
  beatText: string;
  vacant: boolean;
  tieAtTop: boolean;
};

function formatBeatTarget(score: number, slug: string, higherIsBetter: boolean): string {
  if (higherIsBetter) {
    const next =
      slug === "carry_distance_yards"
        ? Math.floor(score) + 1
        : slug === "three_pointers_60s"
          ? Math.floor(score) + 1
          : score + 1;
    return `${formatKingScore(next, slug)}+`;
  }
  if (slug === "mile_run") {
    const next = Math.max(0, score - 1);
    return `${formatKingScore(next, slug)} or faster`;
  }
  const next = Math.max(0, score - 1);
  return `${formatKingScore(next, slug)} or better`;
}

function resolveScopeKey(params: {
  claimSubject: "user" | "team";
  scope: ClaimScope;
  courtId: string | null;
  cityName: string;
  areaKind: AreaKind;
  recordSlug: string;
}): string | null {
  const { claimSubject, scope, courtId, cityName, areaKind, recordSlug } = params;
  if (scope === "court") {
    if (!courtId) return null;
    return claimSubject === "team"
      ? scopeKeyForTeamCourt(courtId, recordSlug)
      : scopeKeyForCourt(courtId, recordSlug);
  }
  if (!cityName.trim()) return null;
  return claimSubject === "team"
    ? scopeKeyForTeamCity(cityName, recordSlug, areaKind)
    : scopeKeyForCity(cityName, recordSlug, areaKind);
}

function holderFromLeaderboard(
  rows: KingLeaderboardRow[],
  slot: { badge_holder_user_id: string | null; badge_holder_team_id?: string | null; tie_at_top: boolean } | null,
  claimSubject: "user" | "team",
  recordSlug: string,
  higherIsBetter: boolean
): CurrentHolderInfo | null {
  if (slot?.tie_at_top) {
    return { name: "Tied at the top", scoreFormatted: "—", beatText: "Break the tie", vacant: false, tieAtTop: true };
  }

  const holderUserId = slot?.badge_holder_user_id ? String(slot.badge_holder_user_id) : null;
  const holderTeamId = slot?.badge_holder_team_id ? String(slot.badge_holder_team_id) : null;
  const holderRow =
    claimSubject === "team" && holderTeamId
      ? rows.find((r) => r.teamId === holderTeamId)
      : holderUserId
        ? rows.find((r) => r.userId === holderUserId)
        : null;
  const topRow = rows[0] ?? null;
  const row = holderRow ?? topRow;

  if (!row) {
    return { name: "Vacant", scoreFormatted: "—", beatText: "Claim the crown", vacant: true, tieAtTop: false };
  }

  const name = row.isTeam ? (row.displayName ?? "Crew") : row.displayName || row.username || "Player";
  const scoreFormatted = formatKingScore(row.scoreValue, recordSlug);
  return {
    name,
    scoreFormatted,
    beatText: formatBeatTarget(row.scoreValue, recordSlug, higherIsBetter),
    vacant: false,
    tieAtTop: false,
  };
}

export default function ApplyKingScreen() {
  const router = useRouter();
  const {
    courtId: courtIdParam,
    claimScope: claimScopeParam,
    cityName: cityNameParam,
    areaKind: areaKindParam,
    recordSlug: recordSlugParam,
  } = useLocalSearchParams<{
    courtId?: string;
    claimScope?: string;
    cityName?: string;
    areaKind?: string;
    recordSlug?: string;
  }>();
  const userId = useAuthStore((s) => s.user?.id);

  const [loading, setLoading] = useState(true);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [nearbyCourts, setNearbyCourts] = useState<NearbyCourtRow[]>([]);
  const [recordTypes, setRecordTypes] = useState<CourtRecordTypeRow[]>([]);
  const [wins, setWins] = useState<ChallengeWinRow[]>([]);

  const [scope, setScope] = useState<ClaimScope>("city");
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(null);
  const [cityName, setCityName] = useState("Las Vegas");
  const [areaKind, setAreaKind] = useState<AreaKind>("driving_range");
  const [usePresetRecord, setUsePresetRecord] = useState(true);
  const [recordSlug, setRecordSlug] = useState<string | null>(null);
  const [claimTitle, setClaimTitle] = useState("");
  const [claimDetails, setClaimDetails] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [isOnlineGame, setIsOnlineGame] = useState(false);
  const [proofUris, setProofUris] = useState<string[]>([]);
  const [claimedScoreText, setClaimedScoreText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [claimSubject, setClaimSubject] = useState<"user" | "team">("user");
  const [myTeams, setMyTeams] = useState<TeamWithExtras[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [locationSearch, setLocationSearch] = useState("");
  const [currentHolder, setCurrentHolder] = useState<CurrentHolderInfo | null>(null);
  const [loadingHolder, setLoadingHolder] = useState(false);

  const selectedCourt = useMemo(
    () => nearbyCourts.find((c) => c.id === selectedCourtId) ?? null,
    [nearbyCourts, selectedCourtId]
  );

  const applicableRecordTypes = useMemo(() => {
    if (scope === "court" && selectedCourt) {
      return getSpotRecordTypesForCourt(selectedCourt);
    }
    return recordTypes;
  }, [scope, selectedCourt, recordTypes]);

  const filteredNearbyCourts = useMemo(() => {
    const q = locationSearch.trim().toLowerCase();
    if (!q) return nearbyCourts;
    return nearbyCourts.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.city?.toLowerCase().includes(q) ?? false)
    );
  }, [nearbyCourts, locationSearch]);

  const canContinueStep1 = useMemo(() => {
    if (claimSubject === "team") {
      if (myTeams.length === 0) return false;
      if (!selectedTeamId) return false;
    }
    if (scope === "court") return !!selectedCourtId;
    return !!cityName.trim();
  }, [claimSubject, myTeams.length, selectedTeamId, scope, selectedCourtId, cityName]);

  const step1Summary = useMemo(() => {
    const who = claimSubject === "team" ? myTeams.find((t) => t.id === selectedTeamId)?.name ?? "Crew" : "You";
    const where =
      scope === "court"
        ? selectedCourt?.name ?? "Spot"
        : `${cityName.trim() || "City"} (city-wide)`;
    const area = AREA_OPTIONS.find((a) => a.key === areaKind)?.label ?? areaKind;
    return `${who} · ${where} · ${area}`;
  }, [claimSubject, selectedTeamId, myTeams, scope, selectedCourt, cityName, areaKind]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setCoords(null);
        setNearbyCourts([]);
      } else {
        try {
          const { lat, lng } = await resolveForegroundLatLng();
          setCoords({ lat, lng });
          const courts = await fetchNearbyCourts(lat, lng, 80);
          setNearbyCourts(courts);
        } catch {
          setCoords(null);
          setNearbyCourts([]);
        }
      }
      const types = await fetchRecordTypes();
      setRecordTypes(types);
      const fromRoute = recordSlugParam ? String(recordSlugParam) : null;
      if (fromRoute && types.some((t) => t.slug === fromRoute)) {
        setRecordSlug(fromRoute);
      } else if (types[0]) {
        setRecordSlug(types[0].slug);
      }
      if (userId) {
        const [w, teams] = await Promise.all([fetchRecentChallengeWins(userId), listTeamsForUser(userId)]);
        setWins(w);
        setMyTeams(teams);
      }
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, [userId, recordSlugParam]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!loading && recordSlugParam) setStep(2);
  }, [loading, recordSlugParam]);

  useEffect(() => {
    if (claimScopeParam === "city" || claimScopeParam === "court") {
      setScope(claimScopeParam);
    }
  }, [claimScopeParam]);

  useEffect(() => {
    if (cityNameParam) setCityName(String(cityNameParam));
  }, [cityNameParam]);

  useEffect(() => {
    const a = areaKindParam ? String(areaKindParam) : "";
    if (a && isAreaKindParam(a)) setAreaKind(a);
  }, [areaKindParam]);

  useEffect(() => {
    if (!courtIdParam) return;
    const id = String(courtIdParam);
    setScope("court");
    setSelectedCourtId(id);
    (async () => {
      const c = await fetchCourtById(id);
      if (!c) return;
      setNearbyCourts((prev) => {
        if (prev.some((x) => x.id === id)) return prev;
        return [{ ...c, distance_km: 0 } as NearbyCourtRow, ...prev];
      });
    })();
  }, [courtIdParam]);

  useEffect(() => {
    if (claimSubject === "team" && myTeams.length && !myTeams.some((t) => t.id === selectedTeamId)) {
      setSelectedTeamId(myTeams[0]?.id ?? null);
    }
  }, [claimSubject, myTeams, selectedTeamId]);

  useEffect(() => {
    if (!usePresetRecord || !recordSlug) return;
    const rt = applicableRecordTypes.find((r) => r.slug === recordSlug);
    if (!rt) return;
    const place = scope === "court" && selectedCourt ? selectedCourt.name : cityName.trim() || "your city";
    const teamName =
      claimSubject === "team" && selectedTeamId ? myTeams.find((t) => t.id === selectedTeamId)?.name : null;
    const who = claimSubject === "team" && teamName ? `${teamName} (crew)` : "me";
    setClaimTitle(`${rt.title} — ${place} — ${who}`);
  }, [usePresetRecord, recordSlug, applicableRecordTypes, scope, selectedCourt, cityName, claimSubject, selectedTeamId, myTeams]);

  useEffect(() => {
    if (!recordSlug) return;
    if (applicableRecordTypes.some((r) => r.slug === recordSlug)) return;
    setRecordSlug(applicableRecordTypes[0]?.slug ?? null);
  }, [applicableRecordTypes, recordSlug]);

  useEffect(() => {
    if (step !== 2 || !usePresetRecord || !recordSlug) {
      setCurrentHolder(null);
      return;
    }
    const rt = applicableRecordTypes.find((r) => r.slug === recordSlug);
    if (!rt) {
      setCurrentHolder(null);
      return;
    }
    const scopeKey = resolveScopeKey({
      claimSubject,
      scope,
      courtId: selectedCourtId,
      cityName,
      areaKind,
      recordSlug,
    });
    if (!scopeKey) {
      setCurrentHolder(null);
      return;
    }

    let cancelled = false;
    setLoadingHolder(true);
    (async () => {
      try {
        const pack = await fetchKingLeaderboardWithProfiles(scopeKey, recordSlug, rt.higher_is_better);
        if (cancelled) return;
        setCurrentHolder(
          holderFromLeaderboard(pack.rows, pack.slot, claimSubject, recordSlug, rt.higher_is_better)
        );
      } catch {
        if (!cancelled) setCurrentHolder(null);
      } finally {
        if (!cancelled) setLoadingHolder(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    step,
    usePresetRecord,
    recordSlug,
    claimSubject,
    scope,
    selectedCourtId,
    cityName,
    areaKind,
    applicableRecordTypes,
  ]);

  const onBack = () => {
    if (step === 2) {
      setStep(1);
      return;
    }
    router.back();
  };

  const onContinue = () => {
    if (!canContinueStep1) {
      if (claimSubject === "team" && myTeams.length === 0) {
        Alert.alert("Crew", "Create a crew first (Profile → Crews), then return here.");
        return;
      }
      if (scope === "court") {
        Alert.alert("Court", "Pick a court for this claim.");
        return;
      }
      Alert.alert("City", "Enter the city you want to claim for.");
      return;
    }
    setStep(2);
  };

  const addProof = async () => {
    if (proofUris.length >= 5) {
      Alert.alert("Limit", "Add up to 5 photos or videos.");
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission", "Media access is needed for proof.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 0.85,
      videoMaxDuration: 120,
    });
    if (res.canceled || !res.assets?.length) return;
    const next = [...proofUris];
    for (const a of res.assets) {
      if (next.length >= 5) break;
      if (a.uri) next.push(a.uri);
    }
    setProofUris(next);
  };

  const removeProof = (uri: string) => {
    setProofUris((prev) => prev.filter((u) => u !== uri));
  };

  const onSubmit = async () => {
    if (!userId) {
      Alert.alert("Sign in", "Log in to submit an application.");
      return;
    }
    if (!coords) {
      Alert.alert("Location", "Enable location so we can anchor this claim on the map.");
      return;
    }
    if (scope === "court" && !selectedCourtId) {
      Alert.alert("Court", "Pick a court for this claim.");
      return;
    }
    if (scope === "city" && !cityName.trim()) {
      Alert.alert("City", "Enter the city you want to claim for.");
      return;
    }
    if (claimSubject === "team" && (!selectedTeamId || !myTeams.some((t) => t.id === selectedTeamId))) {
      Alert.alert("Crew", "Pick one of your crews, or create a crew first.");
      return;
    }
    if (!claimTitle.trim()) {
      Alert.alert("Title", "Describe what you are claiming (e.g. longest carry at this range).");
      return;
    }
    if (!isOnlineGame && proofUris.length === 0) {
      Alert.alert("Proof", "Add photo or video of your result, or turn on “Online / in-app game”.");
      return;
    }

    let claimedScore: number | null = null;
    const rawScore = claimedScoreText.trim();
    if (rawScore.length > 0) {
      const n = Number(rawScore.replace(/,/g, ""));
      if (!Number.isFinite(n)) {
        Alert.alert("Score", "Enter a valid number for leaderboard ranking when approved (or leave blank).");
        return;
      }
      claimedScore = n;
    }

    setSubmitting(true);
    try {
      const paths: string[] = [];
      for (const uri of proofUris) {
        const mt = inferMediaType(uri);
        const up = await uploadKingClaimMedia({ userId, localUri: uri, mediaType: mt });
        paths.push(up.storagePath);
      }
      await submitKingClaimApplication({
        userId,
        claimSubject,
        teamId: claimSubject === "team" ? selectedTeamId : null,
        claimScope: scope,
        courtId: scope === "court" ? selectedCourtId : null,
        cityName: scope === "city" ? cityName : null,
        areaKind,
        recordTypeSlug: usePresetRecord ? recordSlug : null,
        claimTitle: claimTitle.trim(),
        claimDetails: claimDetails.trim() || null,
        sourceChallengeId: challengeId,
        isOnlineGame: isOnlineGame,
        proofMediaPaths: paths,
        anchorLat: coords.lat,
        anchorLng: coords.lng,
        claimedScoreValue: claimedScore,
      });
      Alert.alert("Submitted", "Your application is pending review.", [
        { text: "OK", onPress: () => router.replace("/courts/my-claims" as Href) },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not submit.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !recordTypes.length) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
      <View style={styles.topBar}>
        <Pressable onPress={onBack} style={({ pressed }) => [styles.backBtn, pressSoft(pressed)]}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{step === 1 ? "Claim a Crown" : "Select title"}</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.stepLabel}>Step {step} of 2</Text>

      {step === 1 ? (
        <Text style={styles.lead}>
          Choose who is claiming, where, and what kind of spot. Title selection and proof come next.
        </Text>
      ) : (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Claiming for</Text>
          <Text style={styles.summaryText}>{step1Summary}</Text>
        </View>
      )}

      {step === 1 ? (
        <>
      <Text style={styles.section}>Claim as</Text>
      <View style={styles.scopeRow}>
        <Pressable
          onPress={() => setClaimSubject("user")}
          style={[styles.scopeChip, claimSubject === "user" && styles.scopeChipOn]}
        >
          <Text style={[styles.scopeText, claimSubject === "user" && styles.scopeTextOn]}>You (individual)</Text>
        </Pressable>
        <Pressable
          onPress={() => setClaimSubject("team")}
          style={[styles.scopeChip, claimSubject === "team" && styles.scopeChipOn]}
        >
          <Text style={[styles.scopeText, claimSubject === "team" && styles.scopeTextOn]}>Crew</Text>
        </Pressable>
      </View>
      {claimSubject === "team" ? (
        myTeams.length === 0 ? (
          <Text style={styles.warn}>Create a crew and invite players first (Profile → Crews), then return here.</Text>
        ) : (
          <View style={{ marginBottom: 14 }}>
            <Text style={styles.hint}>Crew King uses a separate leaderboard from individual players at the same spot.</Text>
            {myTeams.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => setSelectedTeamId(t.id)}
                style={[styles.courtPick, selectedTeamId === t.id && styles.courtPickOn]}
              >
                <Ionicons
                  name={selectedTeamId === t.id ? "radio-button-on" : "radio-button-off"}
                  size={18}
                  color={selectedTeamId === t.id ? colors.accent : colors.textMuted}
                />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.courtPickTitle}>{t.name}</Text>
                  <Text style={styles.courtPickSub}>{t.member_count ?? 0} members</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )
      ) : null}

      <Text style={styles.section}>Where</Text>
      <View style={styles.scopeRow}>
        <Pressable
          onPress={() => setScope("court")}
          style={[styles.scopeChip, scope === "court" && styles.scopeChipOn]}
        >
          <Text style={[styles.scopeText, scope === "court" && styles.scopeTextOn]}>Specific court / spot</Text>
        </Pressable>
        <Pressable onPress={() => setScope("city")} style={[styles.scopeChip, scope === "city" && styles.scopeChipOn]}>
          <Text style={[styles.scopeText, scope === "city" && styles.scopeTextOn]}>City-wide</Text>
        </Pressable>
      </View>

      {scope === "court" ? (
        <View style={{ marginBottom: 14 }}>
          <Text style={styles.hint}>Choose a pinned location (nearby list from GPS).</Text>
          {nearbyCourts.length === 0 ? (
            <Text style={styles.warn}>No courts in range — open Courts, add a court, or use city-wide.</Text>
          ) : (
            <>
              <View style={styles.searchRow}>
                <Ionicons name="search" size={18} color={colors.textMuted} />
                <TextInput
                  value={locationSearch}
                  onChangeText={setLocationSearch}
                  placeholder="Search locations…"
                  placeholderTextColor={colors.textMuted}
                  style={styles.searchInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {locationSearch.length > 0 ? (
                  <Pressable onPress={() => setLocationSearch("")} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
              {filteredNearbyCourts.length === 0 ? (
                <Text style={styles.warn}>No locations match your search.</Text>
              ) : (
                filteredNearbyCourts.slice(0, 24).map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => setSelectedCourtId(c.id)}
                    style={[styles.courtPick, selectedCourtId === c.id && styles.courtPickOn]}
                  >
                    <Ionicons
                      name={selectedCourtId === c.id ? "radio-button-on" : "radio-button-off"}
                      size={18}
                      color={selectedCourtId === c.id ? colors.accent : colors.textMuted}
                    />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.courtPickTitle}>{c.name}</Text>
                      <Text style={styles.courtPickSub}>
                        {c.city} · {(c.distance_km * 0.621371).toFixed(1)} mi
                      </Text>
                    </View>
                  </Pressable>
                ))
              )}
            </>
          )}
        </View>
      ) : (
        <View style={{ marginBottom: 14 }}>
          <Text style={styles.label}>City</Text>
          <TextInput
            value={cityName}
            onChangeText={setCityName}
            placeholder="e.g. Las Vegas"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <Text style={styles.hint}>Claim the city crown if vacant. Subject to review.</Text>
        </View>
      )}

      <Text style={styles.section}>Area type</Text>
      <View style={styles.areaWrap}>
        {AREA_OPTIONS.map((a) => (
          <Pressable
            key={a.key}
            onPress={() => setAreaKind(a.key)}
            style={[styles.areaChip, areaKind === a.key && styles.areaChipOn]}
          >
            <Text style={[styles.areaText, areaKind === a.key && styles.areaTextOn]}>{a.label}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={onContinue}
        disabled={!canContinueStep1}
        style={({ pressed }) => [
          styles.submitBtn,
          !canContinueStep1 && { opacity: 0.5 },
          pressSoft(pressed),
        ]}
      >
        <Text style={styles.submitText}>Continue</Text>
      </Pressable>
        </>
      ) : (
        <>
      <Text style={styles.section}>What you are claiming</Text>
      <View style={styles.scopeRow}>
        <Pressable
          onPress={() => setUsePresetRecord(true)}
          style={[styles.scopeChip, usePresetRecord && styles.scopeChipOn]}
        >
          <Text style={[styles.scopeText, usePresetRecord && styles.scopeTextOn]}>Preset category</Text>
        </Pressable>
        <Pressable
          onPress={() => setUsePresetRecord(false)}
          style={[styles.scopeChip, !usePresetRecord && styles.scopeChipOn]}
        >
          <Text style={[styles.scopeText, !usePresetRecord && styles.scopeTextOn]}>Custom title</Text>
        </Pressable>
      </View>

      {usePresetRecord ? (
        <View style={{ marginBottom: 12 }}>
          {applicableRecordTypes.map((rt) => (
            <Pressable
              key={rt.slug}
              onPress={() => setRecordSlug(rt.slug)}
              style={[styles.courtPick, recordSlug === rt.slug && styles.courtPickOn]}
            >
              <Text style={styles.courtPickTitle}>{rt.title}</Text>
              <Text style={styles.courtPickSub}>{rt.description}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {usePresetRecord && recordSlug ? (
        <View style={styles.holderCard}>
          {loadingHolder ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : currentHolder ? (
            <>
              <Text style={styles.holderTitle}>
                {applicableRecordTypes.find((r) => r.slug === recordSlug)?.title ?? "Title"}
              </Text>
              {currentHolder.vacant ? (
                <Text style={styles.holderVacant}>Crown open — claim it</Text>
              ) : currentHolder.tieAtTop ? (
                <Text style={styles.holderVacant}>Contested — tie at the top</Text>
              ) : (
                <>
                  <Text style={styles.holderLabel}>Current King</Text>
                  <Text style={styles.holderName}>{currentHolder.name}</Text>
                  <Text style={styles.holderScore}>{currentHolder.scoreFormatted}</Text>
                  <Text style={styles.holderBeat}>Beat: {currentHolder.beatText}</Text>
                </>
              )}
            </>
          ) : (
            <Text style={styles.hint}>No leaderboard data yet — be the first.</Text>
          )}
        </View>
      ) : null}

      {!usePresetRecord ? (
        <Text style={styles.hint}>
          Custom titles are memorable and shareable — e.g. King of Sunset Park, Fastest Dad in Vegas.
        </Text>
      ) : null}

      <Text style={styles.label}>Score (optional, for leaderboard if approved)</Text>
      <TextInput
        value={claimedScoreText}
        onChangeText={setClaimedScoreText}
        placeholder="e.g. bench 185×12 → use one number you track (total volume, yards, seconds)"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        style={styles.input}
      />

      <Text style={styles.label}>Claim title</Text>
      <TextInput
        value={claimTitle}
        onChangeText={setClaimTitle}
        placeholder={
          usePresetRecord
            ? "Auto-filled from preset — edit if needed"
            : "e.g. King of Sunset Park, Best Trick Shot Shooter"
        }
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />

      <Text style={styles.label}>Details (optional)</Text>
      <TextInput
        value={claimDetails}
        onChangeText={setClaimDetails}
        placeholder="Rules you followed, date, witnesses…"
        placeholderTextColor={colors.textMuted}
        multiline
        style={[styles.input, { minHeight: 88, textAlignVertical: "top" }]}
      />

      <Text style={styles.section}>Link a challenge win (optional)</Text>
      {wins.length === 0 ? (
        <Text style={styles.hint}>No completed wins found yet — you can still apply with other proof.</Text>
      ) : (
        wins.map((w) => (
          <Pressable
            key={w.id}
            onPress={() => setChallengeId((prev) => (prev === w.id ? null : w.id))}
            style={[styles.courtPick, challengeId === w.id && styles.courtPickOn]}
          >
            <Text style={styles.courtPickTitle} numberOfLines={2}>
              {w.title ?? "Challenge"}
            </Text>
            <Text style={styles.courtPickSub}>
              {(w.game_type ?? "game").replace(/_/g, " ")} · {w.completed_at ? new Date(w.completed_at).toLocaleDateString() : ""}
            </Text>
          </Pressable>
        ))
      )}

      <View style={styles.onlineRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.onlineTitle}>Online / in-app game</Text>
          <Text style={styles.onlineSub}>Proof optional — use for phone or online matches only.</Text>
        </View>
        <Switch
          value={isOnlineGame}
          onValueChange={setIsOnlineGame}
          trackColor={{ false: colors.line, true: colors.accent }}
        />
      </View>

      <Text style={styles.section}>Proof {!isOnlineGame ? "(required)" : "(optional)"}</Text>
      <Text style={styles.hint}>Photo or video of scoreboard, range readout, GPS split, etc.</Text>
      {proofUris.map((uri) => (
        <View key={uri} style={styles.proofRow}>
          <Text style={styles.proofUri} numberOfLines={1}>
            {uri.split("/").pop()}
          </Text>
          <Pressable onPress={() => removeProof(uri)}>
            <Ionicons name="close-circle" size={22} color={colors.danger} />
          </Pressable>
        </View>
      ))}
      <Pressable onPress={addProof} style={({ pressed }) => [styles.addProof, pressSoft(pressed)]}>
        <Ionicons name="images-outline" size={22} color={colors.accent} />
        <Text style={styles.addProofText}>Add photos or videos (max 5)</Text>
      </Pressable>

      <Pressable
        onPress={onSubmit}
        disabled={submitting}
        style={({ pressed }) => [styles.submitBtn, submitting && { opacity: 0.7 }, pressSoft(pressed)]}
      >
        {submitting ? (
          <ActivityIndicator color={colors.textOnGold} />
        ) : (
          <Text style={styles.submitText}>Submit application</Text>
        )}
      </Pressable>
        </>
      )}

      <Pressable onPress={() => router.push("/courts/my-claims" as Href)} style={{ marginTop: 16, alignItems: "center" }}>
        <Text style={styles.link}>My applications</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgFeed,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bgFeed },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.md,
  },
  backBtn: { padding: 8, marginLeft: -8 },
  title: { fontSize: 18, fontWeight: "800", color: colors.text },
  stepLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 8, textAlign: "center" },
  lead: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 16 },
  summaryCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  summaryLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", marginBottom: 4 },
  summaryText: { color: colors.text, fontSize: 14, fontWeight: "700", lineHeight: 20 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, padding: 0 },
  holderCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  holderTitle: { color: colors.text, fontWeight: "800", fontSize: 15, marginBottom: 8 },
  holderLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", marginBottom: 4 },
  holderName: { color: colors.text, fontWeight: "800", fontSize: 16 },
  holderScore: { color: colors.gold, fontWeight: "800", fontSize: 18, marginTop: 4 },
  holderBeat: { color: colors.accent, fontWeight: "700", fontSize: 13, marginTop: 8 },
  holderVacant: { color: colors.textSecondary, fontSize: 14, fontWeight: "700" },
  section: { color: colors.text, fontWeight: "800", fontSize: 15, marginBottom: 10, marginTop: 8 },
  scopeRow: { flexDirection: "row", gap: 10, marginBottom: 12, flexWrap: "wrap" },
  scopeChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scopeChipOn: { backgroundColor: colors.accentSurface, borderColor: colors.accentBorder },
  scopeText: { color: colors.textSecondary, fontWeight: "700", fontSize: 13 },
  scopeTextOn: { color: colors.text },
  hint: { color: colors.textMuted, fontSize: 12, marginBottom: 8, lineHeight: 17 },
  warn: { color: colors.warning, fontSize: 12, marginBottom: 8 },
  label: { color: colors.textTertiary, fontSize: 12, fontWeight: "700", marginBottom: 8 },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
    marginBottom: 12,
  },
  courtPick: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  courtPickOn: { borderColor: colors.accent, backgroundColor: colors.accentSurface },
  courtPickTitle: { color: colors.text, fontWeight: "700", fontSize: 14 },
  courtPickSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  areaWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  areaChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  areaChipOn: { backgroundColor: colors.accentSurface, borderColor: colors.accentBorder },
  areaText: { color: colors.textSecondary, fontWeight: "700", fontSize: 12 },
  areaTextOn: { color: colors.text },
  onlineRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
    gap: 12,
  },
  onlineTitle: { color: colors.text, fontWeight: "800", fontSize: 14 },
  onlineSub: { color: colors.textMuted, fontSize: 12, marginTop: 4, lineHeight: 17 },
  proofRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  proofUri: { flex: 1, color: colors.textMuted, fontSize: 12, marginRight: 8 },
  addProof: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    marginBottom: 20,
  },
  addProofText: { color: colors.accent, fontWeight: "800" },
  submitBtn: {
    backgroundColor: colors.gold,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  submitText: { color: colors.textOnGold, fontWeight: "900", fontSize: 16 },
  link: { color: colors.accent, fontWeight: "700" },
});
