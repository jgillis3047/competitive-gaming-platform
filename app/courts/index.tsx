// app/courts/index.tsx — Near You: King of the Court
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import type { Href } from "expo-router";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Marker } from "react-native-maps";

import {
  fetchNearbyCourts,
  type NearbyCourtRow,
} from "../../lib/backend/courts";
import { getLeaderboardCategory, courtSupportsRecordSlug } from "../../lib/data/leaderboardTaxonomy";
import { resolveForegroundLatLng } from "../../lib/utils/resolveForegroundLatLng";
import { useAuthStore } from "../../lib/data/authStore";
import { colors } from "../../lib/theme/colors";
import { radius, space } from "../../lib/theme/spacing";
import { pressSoft } from "../../lib/ui/pressableStyles";
import { lightTap } from "../../lib/utils/haptics";
import {
  ARENA_CLAIM_CTA,
  ARENA_CLAIM_SUB,
  ARENA_PENDING_LABEL,
} from "../../lib/theme/arenaCopy";

export default function CourtsNearYouScreen() {
  const router = useRouter();
  const { record: recordParam } = useLocalSearchParams<{ record?: string }>();
  const practiceRecord = recordParam ? String(recordParam) : null;
  const practiceCategory = useMemo(
    () => (practiceRecord ? getLeaderboardCategory(practiceRecord) : null),
    [practiceRecord]
  );
  const userId = useAuthStore((s) => s.user?.id);
  const mapRef = useRef<MapView | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [courts, setCourts] = useState<NearbyCourtRow[]>([]);
  const [mode, setMode] = useState<"list" | "map">("list");

  const load = useCallback(async () => {
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("Location permission is needed to find courts near you.");
        setCourts([]);
        setCoords(null);
        return;
      }
      const { lat, lng } = await resolveForegroundLatLng();
      setCoords({ lat, lng });
      const rows = await fetchNearbyCourts(lat, lng, 50);
      setCourts(rows);
    } catch (e: any) {
      setError(e?.message ?? "Could not load nearby courts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const courtsForPractice = useMemo(() => {
    if (!practiceRecord) return courts;
    const supported = courts.filter((c) => courtSupportsRecordSlug(c, practiceRecord));
    return supported.length > 0 ? supported : courts;
  }, [courts, practiceRecord]);

  const courtHref = useCallback(
    (courtId: string) => {
      if (!practiceRecord) return `/courts/${courtId}` as Href;
      return `/courts/${courtId}?record=${encodeURIComponent(practiceRecord)}` as Href;
    },
    [practiceRecord]
  );

  const initialRegion = useMemo(() => {
    const lat = coords?.lat ?? courts[0]?.lat ?? 36.17;
    const lng = coords?.lng ?? courts[0]?.lng ?? -115.14;
    return {
      latitude: lat,
      longitude: lng,
      latitudeDelta: 0.14,
      longitudeDelta: 0.14,
    };
  }, [coords, courts]);

  useEffect(() => {
    if (mode !== "map" || Platform.OS === "web" || courts.length === 0) return;
    const t = setTimeout(() => {
      mapRef.current?.fitToCoordinates(
        courts.map((c) => ({ latitude: c.lat, longitude: c.lng })),
        { edgePadding: { top: 72, right: 36, bottom: 100, left: 36 }, animated: true }
      );
    }, 450);
    return () => clearTimeout(t);
  }, [mode, courts]);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressSoft(pressed)]}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Arenas</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.lead}>
        {practiceCategory
          ? `Practice: ${practiceCategory.title}. Pick a nearby arena, check in on-site, and log your score.`
          : "Real-world competitive hubs near you. See who holds the crown, challenge the king, and defend your streak."}
      </Text>

      {practiceCategory ? (
        <View style={styles.practiceBanner}>
          <Ionicons name="barbell-outline" size={18} color={colors.gold} />
          <Text style={styles.practiceBannerText}>
            Practice mode — no opponent required. Post as many attempts as you want.
          </Text>
        </View>
      ) : null}

      <Pressable
        onPress={() => router.push("/courts/my-claims" as Href)}
        style={({ pressed }) => [styles.myClaimsRow, pressSoft(pressed)]}
      >
        <Text style={styles.myClaimsText}>My crown applications</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>

      <Pressable
        onPress={() => router.push("/courts/create")}
        style={({ pressed }) => [styles.createCard, pressSoft(pressed)]}
      >
        <Ionicons name="add-circle-outline" size={24} color={colors.gold} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.createTitle}>{ARENA_CLAIM_CTA}</Text>
          <Text style={styles.createSub}>{ARENA_CLAIM_SUB}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </Pressable>

      {!userId ? (
        <Text style={styles.hint}>Log in to compete, defend your crown, and appear on rankings.</Text>
      ) : null}

      <View style={styles.modeRow}>
        <Pressable
          onPress={() => setMode("list")}
          style={[styles.modeBtn, mode === "list" && styles.modeBtnOn]}
        >
          <Ionicons name="list" size={16} color={mode === "list" ? "#fff" : colors.textMuted} />
          <Text style={[styles.modeBtnText, mode === "list" && styles.modeBtnTextOn]}>List</Text>
        </Pressable>
        <Pressable
          onPress={() => setMode("map")}
          style={[styles.modeBtn, mode === "map" && styles.modeBtnOn]}
        >
          <Ionicons name="map" size={16} color={mode === "map" ? "#fff" : colors.textMuted} />
          <Text style={[styles.modeBtnText, mode === "map" && styles.modeBtnTextOn]}>Map</Text>
        </Pressable>
      </View>

      {coords ? (
        <Text style={styles.meta}>
          Near {coords.lat.toFixed(3)}, {coords.lng.toFixed(3)} · verified arenas within ~50 km
        </Text>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.sub}>Finding courts…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.err}>{error}</Text>
          <Pressable onPress={load} style={({ pressed }) => [styles.retry, pressSoft(pressed)]}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : mode === "list" ? (
        <View style={styles.mainFlex}>
          <FlatList
            data={courtsForPractice}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
            }
            contentContainerStyle={{ paddingBottom: 32 }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <View style={styles.emptyIconCircle}>
                  <Ionicons name="location-outline" size={36} color={colors.gold} />
                </View>
                <Text style={styles.emptyTitle}>No arenas in range</Text>
                <Text style={styles.emptySub}>
                  Be the first — claim a new arena where people pull up and compete for the crown.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => router.push(courtHref(item.id))}
                style={({ pressed }) => [styles.row, pressSoft(pressed)]}
              >
                <View style={styles.rowIcon}>
                  <Ionicons name="location" size={22} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {item.city ?? "Unknown city"} · {item.place_kind.replace("_", " ")} ·{" "}
                    {(item.distance_km * 0.621371).toFixed(1)} mi
                    {(item as { verification_status?: string }).verification_status === "pending"
                      ? ` · ${ARENA_PENDING_LABEL}`
                      : ""}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </Pressable>
            )}
          />
        </View>
      ) : Platform.OS === "web" ? (
        <View style={styles.mainFlex}>
          <FlatList
            data={courtsForPractice}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 32 }}
            ListHeaderComponent={
              <View style={styles.mapIntro}>
                <Text style={styles.mapIntroTitle}>Map on web</Text>
                <Text style={styles.mapIntroSub}>
                  Interactive maps are limited on web in this build. Tap a spot below, or use the iOS/Android app for the full map.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => router.push(courtHref(item.id))}
                style={({ pressed }) => [styles.mapCard, pressSoft(pressed)]}
              >
                <View style={styles.mapHeader}>
                  <Ionicons name="location" size={18} color={colors.gold} />
                  <Text style={styles.mapTitle} numberOfLines={1}>
                    {item.name}
                  </Text>
                </View>
                <Text style={styles.mapCoords}>
                  {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
                </Text>
                <Text style={styles.mapMeta}>
                  {item.city ?? "Unknown city"} · {item.place_kind.replace("_", " ")} ·{" "}
                  {(item.distance_km * 0.621371).toFixed(1)} mi
                </Text>
              </Pressable>
            )}
          />
        </View>
      ) : (
        <View style={styles.mainFlex}>
          <View style={styles.mapWrap}>
            <MapView
              ref={mapRef}
              style={styles.map}
              initialRegion={initialRegion}
              showsUserLocation
              showsMyLocationButton={Platform.OS === "android"}
            >
              {courtsForPractice.map((item) => (
                <Marker
                  key={item.id}
                  coordinate={{ latitude: item.lat, longitude: item.lng }}
                  title={item.name}
                  description={[item.city, item.place_kind.replace("_", " ")].filter(Boolean).join(" · ")}
                  tracksViewChanges={false}
                  onPress={() => {
                    lightTap();
                    router.push(courtHref(item.id));
                  }}
                />
              ))}
            </MapView>
          </View>
          <Text style={styles.mapHint}>
            Tap a pin to open that arena — crown holder and rankings are on the next screen.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgFeed,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
  },
  mainFlex: {
    flex: 1,
    minHeight: 280,
  },
  mapWrap: {
    flex: 1,
    minHeight: 300,
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  mapHint: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 10,
    lineHeight: 17,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.md,
  },
  backBtn: { padding: 8, marginLeft: -8 },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  lead: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: space.md,
  },
  practiceBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    marginBottom: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.goldSurface,
    borderWidth: 1,
    borderColor: colors.goldBorderSoft,
  },
  practiceBannerText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  applyCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    marginBottom: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.goldSurface,
    borderWidth: 1,
    borderColor: colors.goldBorder,
  },
  myClaimsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginBottom: space.sm,
  },
  myClaimsText: { color: colors.accentMuted, fontWeight: "800", fontSize: 15 },
  createCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: space.md,
  },
  createTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  createSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  hint: { color: colors.warning, fontSize: 13, marginBottom: 8 },
  modeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  modeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  modeBtnOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  modeBtnText: { color: colors.textMuted, fontWeight: "700", fontSize: 12 },
  modeBtnTextOn: { color: "#fff" },
  meta: { color: colors.textTertiary, fontSize: 11, marginBottom: 12 },
  center: { paddingVertical: 40, alignItems: "center" },
  sub: { color: colors.textMuted, marginTop: 8 },
  err: { color: colors.danger, textAlign: "center", marginBottom: 12 },
  retry: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: colors.surface },
  retryText: { color: colors.accent, fontWeight: "700" },
  empty: { paddingVertical: 32, paddingHorizontal: 8, alignItems: "center" },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.goldSurfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.md,
    borderWidth: 1,
    borderColor: colors.goldBorderSoft,
  },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: "800", marginBottom: 8, textAlign: "center" },
  emptySub: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.accentSurface,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  rowMeta: { color: colors.textMuted, fontSize: 12, marginTop: 4, textTransform: "capitalize" },
  mapIntro: {
    paddingVertical: 10,
    marginBottom: 6,
  },
  mapIntroTitle: { color: colors.text, fontWeight: "900", fontSize: 14 },
  mapIntroSub: { color: colors.textMuted, fontSize: 12, marginTop: 4, lineHeight: 17 },
  mapCard: {
    borderWidth: 1,
    borderColor: colors.goldBorderSoft,
    backgroundColor: colors.goldSurfaceMuted,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 10,
  },
  mapHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  mapTitle: { flex: 1, color: colors.text, fontWeight: "800" },
  mapCoords: { color: colors.accentMuted, fontSize: 12, marginTop: 6 },
  mapMeta: { color: colors.textMuted, fontSize: 12, marginTop: 4, textTransform: "capitalize" },
});
