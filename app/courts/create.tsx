// app/courts/create.tsx — Claim New Arena (GPS + photos + pending verification)
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  CourtAlreadyExistsError,
  createCourt,
  findCourtAtClaimLocation,
  isWithinCourtCheckIn,
  slugifyCourtName,
  type ClaimLocationMatch,
} from "../../lib/backend/courts";
import { uploadArenaPhotoMedia } from "../../lib/backend/mediaService";
import { useAuthStore } from "../../lib/data/authStore";
import { SPOTS_CATEGORIES, SPOT_SPORT_OPTIONS, type SpotSportKey } from "../../lib/data/leaderboardTaxonomy";
import {
  ARENA_ALREADY_ON_MAP_BODY,
  ARENA_ALREADY_ON_MAP_TITLE,
  ARENA_CLAIM_CTA,
  ARENA_OPEN_EXISTING,
  ARENA_PENDING_LABEL,
} from "../../lib/theme/arenaCopy";
import { colors } from "../../lib/theme/colors";
import { space } from "../../lib/theme/spacing";
import { pressSoft } from "../../lib/ui/pressableStyles";
import { resolveForegroundLatLng } from "../../lib/utils/resolveForegroundLatLng";

const DWELL_SECONDS = 45;
const CHECKIN_RADIUS_M = 150;

const KINDS: { key: "park" | "gym" | "campus" | "range" | "other"; label: string }[] = [
  { key: "park", label: "Park / outdoor court" },
  { key: "gym", label: "Gym / indoor" },
  { key: "campus", label: "Campus" },
  { key: "range", label: "Range / simulator" },
  { key: "other", label: "Other" },
];

/** Primary competition options — filtered by selected sports at claim time. */
function gameCategoriesForSports(sports: SpotSportKey[]) {
  const keys = new Set(sports);
  return SPOTS_CATEGORIES.filter(
    (c) =>
      (c.placeKinds?.includes("park") || c.placeKinds?.includes("gym")) &&
      (!c.sportKey || keys.has(c.sportKey))
  );
}

export default function CreateCourtScreen() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);

  const [name, setName] = useState("");
  const [city, setCity] = useState("Las Vegas");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<typeof KINDS[number]["key"]>("park");
  const [sportKeys, setSportKeys] = useState<SpotSportKey[]>(["basketball"]);
  const [gameCategorySlug, setGameCategorySlug] = useState("three_pointers_60s");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [locLoading, setLocLoading] = useState(true);
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [dwellRemaining, setDwellRemaining] = useState(0);
  const [dwellComplete, setDwellComplete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existingMatch, setExistingMatch] = useState<ClaimLocationMatch | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const dwellTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const gameCategories = useMemo(() => gameCategoriesForSports(sportKeys), [sportKeys]);

  useEffect(() => {
    if (gameCategories.some((c) => c.slug === gameCategorySlug)) return;
    setGameCategorySlug(gameCategories[0]?.slug ?? "three_pointers_60s");
  }, [gameCategories, gameCategorySlug]);

  const toggleSport = (key: SpotSportKey) => {
    setSportKeys((prev) => {
      if (prev.includes(key)) {
        const next = prev.filter((k) => k !== key);
        return next.length ? next : prev;
      }
      return [...prev, key];
    });
  };

  const refreshLocation = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;
    return resolveForegroundLatLng();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pos = await refreshLocation();
        if (!cancelled && pos) {
          setLat(pos.lat);
          setLng(pos.lng);
        }
      } catch {
        /* keep lat/lng null */
      } finally {
        if (!cancelled) setLocLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshLocation]);

  useEffect(() => {
    if (lat == null || lng == null) {
      setExistingMatch(null);
      return;
    }
    let cancelled = false;
    setMatchLoading(true);
    findCourtAtClaimLocation(lat, lng, CHECKIN_RADIUS_M)
      .then((match) => {
        if (!cancelled) setExistingMatch(match);
      })
      .catch(() => {
        if (!cancelled) setExistingMatch(null);
      })
      .finally(() => {
        if (!cancelled) setMatchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  const openExistingArena = (courtId: string) => {
    router.replace(`/courts/${courtId}` as Href);
  };

  const startDwellTimer = async () => {
    if (lat == null || lng == null) {
      Alert.alert("Location", "Enable GPS to claim an arena at your current position.");
      return;
    }
    if (dwellTimerRef.current) return;
    setDwellComplete(false);
    setDwellRemaining(DWELL_SECONDS);
    dwellTimerRef.current = setInterval(() => {
      setDwellRemaining((prev) => {
        if (prev <= 1) {
          if (dwellTimerRef.current) {
            clearInterval(dwellTimerRef.current);
            dwellTimerRef.current = null;
          }
          setDwellComplete(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (dwellTimerRef.current) clearInterval(dwellTimerRef.current);
    };
  }, []);

  const takePhoto = async () => {
    if (photoUris.length >= 3) {
      Alert.alert("Limit", "Add 1–3 live photos of the arena.");
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Camera", "Camera access is required to verify this arena with live photos.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      quality: 0.85,
      allowsEditing: false,
    });
    if (res.canceled || !res.assets?.[0]?.uri) return;
    setPhotoUris((prev) => [...prev, res.assets![0].uri]);
  };

  const removePhoto = (uri: string) => {
    setPhotoUris((prev) => prev.filter((u) => u !== uri));
  };

  const onSave = async () => {
    if (!userId) {
      Alert.alert("Sign in", "Log in to claim a new arena.");
      return;
    }
    const n = name.trim();
    if (n.length < 2) {
      Alert.alert("Name", "Enter a name for this arena.");
      return;
    }
    if (!description.trim()) {
      Alert.alert("Description", "Add a short description — what can people compete on here?");
      return;
    }
    if (photoUris.length < 1) {
      Alert.alert("Photos", "Take at least 1 live photo showing the arena setup or landmark.");
      return;
    }
    if (!dwellComplete) {
      Alert.alert("GPS check", `Stay on-site for ${DWELL_SECONDS} seconds to verify you're physically here.`);
      return;
    }
    if (lat == null || lng == null) {
      Alert.alert("Location", "Could not read GPS. Enable location and try again.");
      return;
    }

    setSaving(true);
    try {
      const pos = await refreshLocation();
      if (!pos) throw new Error("Could not verify your location.");

      const match = await findCourtAtClaimLocation(pos.lat, pos.lng, CHECKIN_RADIUS_M);
      if (match) {
        Alert.alert(ARENA_ALREADY_ON_MAP_TITLE, `${ARENA_ALREADY_ON_MAP_BODY}\n\n${match.name}`, [
          { text: "Cancel", style: "cancel" },
          { text: ARENA_OPEN_EXISTING, onPress: () => openExistingArena(match.id) },
        ]);
        return;
      }

      const anchor = { lat: pos.lat, lng: pos.lng, checkin_radius_m: CHECKIN_RADIUS_M };
      if (!isWithinCourtCheckIn(pos.lat, pos.lng, anchor)) {
        throw new Error("You moved too far from the pin. Stay at the arena and try again.");
      }

      const paths: string[] = [];
      for (const uri of photoUris) {
        const up = await uploadArenaPhotoMedia({ userId, localUri: uri });
        paths.push(up.storagePath);
      }

      const base = slugifyCourtName(n);
      const slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
      const row = await createCourt({
        userId,
        name: n,
        slug,
        lat: pos.lat,
        lng: pos.lng,
        city: city.trim() || null,
        placeKind: kind,
        description: description.trim(),
        checkinRadiusM: CHECKIN_RADIUS_M,
        photoPaths: paths,
        gameCategorySlug,
        sportKeys,
      });
      Alert.alert(
        ARENA_PENDING_LABEL,
        "Your arena is submitted for verification. Nearby players can confirm it — after 3 confirmations it goes live for everyone to compete.",
        [{ text: "OK", onPress: () => router.replace(`/courts/${row.id}` as Href) }]
      );
    } catch (e: any) {
      if (e instanceof CourtAlreadyExistsError) {
        Alert.alert(ARENA_ALREADY_ON_MAP_TITLE, `${ARENA_ALREADY_ON_MAP_BODY}\n\n${e.courtName}`, [
          { text: "Cancel", style: "cancel" },
          { text: ARENA_OPEN_EXISTING, onPress: () => openExistingArena(e.courtId) },
        ]);
        return;
      }
      Alert.alert("Error", e?.message ?? "Could not claim arena.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressSoft(pressed)]}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{ARENA_CLAIM_CTA}</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.lead}>
        Only for spots not already on the map. If you see this place on Explore, open that pin and compete there — one
        arena, one crown. New claims need on-site GPS, live photos, and community verification.
      </Text>

      {matchLoading ? (
        <View style={styles.locRow}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={styles.locText}>Checking for existing arenas here…</Text>
        </View>
      ) : existingMatch ? (
        <View style={styles.existingCard}>
          <Ionicons name="location" size={22} color={colors.gold} />
          <View style={{ flex: 1 }}>
            <Text style={styles.existingTitle}>{ARENA_ALREADY_ON_MAP_TITLE}</Text>
            <Text style={styles.existingSub}>
              {existingMatch.name} is already on the map ({Math.round(existingMatch.distance_m)}m away). Compete there
              instead of creating a duplicate.
            </Text>
          </View>
        </View>
      ) : null}

      {existingMatch ? (
        <Pressable
          onPress={() => openExistingArena(existingMatch.id)}
          style={({ pressed }) => [styles.openExistingBtn, pressSoft(pressed)]}
        >
          <Text style={styles.openExistingBtnText}>{ARENA_OPEN_EXISTING}</Text>
          <Ionicons name="chevron-forward" size={18} color="#fff" />
        </Pressable>
      ) : null}

      {locLoading ? (
        <View style={styles.locRow}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.locText}>Getting location…</Text>
        </View>
      ) : lat != null && lng != null ? (
        <Text style={styles.coords}>
          Pin: {lat.toFixed(5)}, {lng.toFixed(5)}
        </Text>
      ) : (
        <Text style={styles.warn}>Location unavailable — enable permissions in system settings.</Text>
      )}

      <View style={styles.dwellCard}>
        <Ionicons name="navigate" size={20} color={colors.gold} />
        <View style={{ flex: 1 }}>
          <Text style={styles.dwellTitle}>On-site verification</Text>
          <Text style={styles.dwellSub}>
            {dwellComplete
              ? "GPS verified — you're at the pin."
              : dwellRemaining > 0
                ? `Stay here… ${dwellRemaining}s remaining`
                : `Confirm you're physically here (${DWELL_SECONDS}s)`}
          </Text>
        </View>
        {!dwellComplete ? (
          <Pressable
            onPress={startDwellTimer}
            disabled={dwellRemaining > 0 || lat == null}
            style={({ pressed }) => [
              styles.dwellBtn,
              (dwellRemaining > 0 || lat == null) && { opacity: 0.5 },
              pressSoft(pressed),
            ]}
          >
            <Text style={styles.dwellBtnText}>{dwellRemaining > 0 ? `${dwellRemaining}s` : "Start"}</Text>
          </Pressable>
        ) : (
          <Ionicons name="checkmark-circle" size={28} color={colors.success} />
        )}
      </View>

      <Text style={styles.label}>Arena name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="e.g. Sunset Park Court 3"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />

      <Text style={styles.label}>Sports available here</Text>
      <Text style={styles.photoHint}>
        Only select what people can actually play at this spot — e.g. a gym without hoops should be fitness only.
      </Text>
      <View style={[styles.kindRow, { flexWrap: "wrap", marginBottom: 12 }]}>
        {SPOT_SPORT_OPTIONS.map((s) => (
          <Pressable
            key={s.key}
            onPress={() => toggleSport(s.key)}
            style={({ pressed }) => [
              styles.kindChip,
              sportKeys.includes(s.key) && styles.kindChipOn,
              pressSoft(pressed),
            ]}
          >
            <Text style={[styles.kindText, sportKeys.includes(s.key) && styles.kindTextOn]}>{s.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Primary competition</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
        <View style={styles.kindRow}>
          {gameCategories.map((c) => (
            <Pressable
              key={c.slug}
              onPress={() => setGameCategorySlug(c.slug)}
              style={({ pressed }) => [
                styles.kindChip,
                gameCategorySlug === c.slug && styles.kindChipOn,
                pressSoft(pressed),
              ]}
            >
              <Text style={[styles.kindText, gameCategorySlug === c.slug && styles.kindTextOn]} numberOfLines={2}>
                {c.title}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Text style={styles.label}>Place type</Text>
      <View style={styles.kindRow}>
        {KINDS.map((k) => (
          <Pressable
            key={k.key}
            onPress={() => setKind(k.key)}
            style={({ pressed }) => [
              styles.kindChip,
              kind === k.key && styles.kindChipOn,
              pressSoft(pressed),
            ]}
          >
            <Text style={[styles.kindText, kind === k.key && styles.kindTextOn]}>{k.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>City</Text>
      <TextInput
        value={city}
        onChangeText={setCity}
        placeholder="Las Vegas"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />

      <Text style={styles.label}>Description</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="What can people compete on here? Hoops, chess table, ping pong…"
        placeholderTextColor={colors.textMuted}
        multiline
        style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
      />

      <Text style={styles.label}>Photos (1–3, live camera)</Text>
      <Text style={styles.photoHint}>Wide angle showing the setup or a recognizable landmark — no gallery uploads.</Text>
      <View style={styles.photoRow}>
        {photoUris.map((uri) => (
          <Pressable key={uri} onPress={() => removePhoto(uri)} style={styles.photoThumbWrap}>
            <Image source={{ uri }} style={styles.photoThumb} />
            <View style={styles.photoRemove}>
              <Ionicons name="close" size={14} color="#fff" />
            </View>
          </Pressable>
        ))}
        {photoUris.length < 3 ? (
          <Pressable onPress={takePhoto} style={({ pressed }) => [styles.photoAdd, pressSoft(pressed)]}>
            <Ionicons name="camera" size={28} color={colors.gold} />
            <Text style={styles.photoAddText}>Take photo</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable
        onPress={onSave}
        disabled={saving || !!existingMatch}
        style={({ pressed }) => [
          styles.saveBtn,
          (saving || existingMatch) && { opacity: 0.7 },
          pressSoft(pressed),
        ]}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : existingMatch ? (
          <Text style={styles.saveText}>Use existing arena above</Text>
        ) : (
          <Text style={styles.saveText}>{ARENA_CLAIM_CTA}</Text>
        )}
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
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.md,
  },
  backBtn: { padding: 8, marginLeft: -8 },
  title: { fontSize: 18, fontWeight: "800", color: colors.text, flex: 1, textAlign: "center" },
  lead: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 16 },
  existingCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.goldSurfaceMuted,
    borderWidth: 1,
    borderColor: colors.goldBorderSoft,
    marginBottom: 12,
  },
  existingTitle: { color: colors.text, fontWeight: "900", fontSize: 14 },
  existingSub: { color: colors.textSecondary, fontSize: 12, marginTop: 4, lineHeight: 17 },
  openExistingBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.gold,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 16,
  },
  openExistingBtnText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  locRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  locText: { color: colors.textMuted },
  coords: { color: colors.textTertiary, fontSize: 12, marginBottom: 12 },
  warn: { color: colors.warning, marginBottom: 12 },
  dwellCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.goldSurfaceMuted,
    borderWidth: 1,
    borderColor: colors.goldBorderSoft,
    marginBottom: 16,
  },
  dwellTitle: { color: colors.text, fontWeight: "800", fontSize: 14 },
  dwellSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  dwellBtn: {
    backgroundColor: colors.gold,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  dwellBtnText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  label: { color: colors.textTertiary, fontSize: 12, fontWeight: "700", marginBottom: 8 },
  photoHint: { color: colors.textMuted, fontSize: 12, marginBottom: 10, lineHeight: 16 },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
    marginBottom: 16,
  },
  kindRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  kindChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 160,
  },
  kindChipOn: { backgroundColor: colors.accentSurface, borderColor: colors.accentBorder },
  kindText: { color: colors.textSecondary, fontWeight: "700", fontSize: 13 },
  kindTextOn: { color: colors.text },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  photoThumbWrap: { position: "relative" },
  photoThumb: { width: 88, height: 88, borderRadius: 10, backgroundColor: colors.surface },
  photoRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 10,
    padding: 2,
  },
  photoAdd: {
    width: 88,
    height: 88,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.goldSurfaceFaint,
  },
  photoAddText: { color: colors.textMuted, fontSize: 10, marginTop: 4, fontWeight: "700" },
  saveBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
  },
  saveText: { color: "#fff", fontWeight: "900", fontSize: 16 },
});
