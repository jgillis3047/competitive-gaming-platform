// app/(tabs)/leaderboards.tsx — Explore: discover arenas (map/list). Rankings live on each arena page.
import { Ionicons } from "@expo/vector-icons";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import MapView, { Marker } from "react-native-maps";

import AppHeader from "../components/AppHeader";
import ScreenCanvas from "../../lib/ui/ScreenCanvas";
import {
  fetchCourtsForBrowse,
  fetchNearbyCourts,
  type CourtRow,
  type NearbyCourtRow,
} from "../../lib/backend/courts";
import { colors } from "../../lib/theme/colors";
import { radius, space } from "../../lib/theme/spacing";
import { pressSoft } from "../../lib/ui/pressableStyles";
import CrownChip from "../../lib/ui/CrownChip";
import ArenaMapPin, { ArenaMapLegend, resolveArenaPinKind } from "../../lib/ui/ArenaMapPin";
import { getFriendIds } from "../../lib/backend/friends";
import { fetchSpotsActivityNear } from "../../lib/backend/spotsActivity";
import { useAuthStore } from "../../lib/data/authStore";
import { lightTap } from "../../lib/utils/haptics";
import {
  ARENA_CLAIM_CTA,
  EXPLORE_FILTER_SPORT,
  EXPLORE_FILTER_SPORT_HINT,
  EXPLORE_FILTERS_LABEL,
  EXPLORE_GLOBAL_RANKINGS_LINK,
} from "../../lib/theme/arenaCopy";
import {
  defaultRecordSlugForSpotSport,
  EXPLORE_SPOT_SPORTS,
  courtSupportsSport,
  spotSportLabel,
  type SpotSportKey,
} from "../../lib/data/leaderboardTaxonomy";
import {
  fetchCourtKingPreviews,
  type CourtKingPreview,
} from "../../lib/backend/courtKingPreview";
import { resolveForegroundLatLng } from "../../lib/utils/resolveForegroundLatLng";
import { humanizeFetchError } from "../../lib/utils/networkErrors";

/** Matches `fetchNearbyCourts(..., radiusKm)` in `loadNear`. */
const NEAR_RADIUS_KM = 50;

const PLACE_KIND_LABELS: Record<string, string> = {
  park: "Park",
  gym: "Gym",
  campus: "Campus",
  range: "Range",
  other: "Other",
};

function placeLabel(kind: string) {
  return PLACE_KIND_LABELS[kind] ?? kind;
}

export default function LeaderboardsTabScreen() {
  const router = useRouter();
  const myId = useAuthStore((s) => s.user?.id ?? null);
  const { width } = useWindowDimensions();
  const compact = width <= 360;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sportPickerExpanded, setSportPickerExpanded] = useState(false);

  // —— Spots
  const [spotsMode, setSpotsMode] = useState<"near" | "browse">("near");
  const [spotsResultsMode, setSpotsResultsMode] = useState<"list" | "map">("map");
  const [cityFilter, setCityFilter] = useState("");
  const [arenaNameFilter, setArenaNameFilter] = useState("");
  const [sportFilter, setSportFilter] = useState<SpotSportKey | "all">("all");
  const [nearLoading, setNearLoading] = useState(true);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [spotsRefreshing, setSpotsRefreshing] = useState(false);
  const [spotsErr, setSpotsErr] = useState<string | null>(null);
  const [nearCourts, setNearCourts] = useState<NearbyCourtRow[]>([]);
  const [browseCourts, setBrowseCourts] = useState<CourtRow[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  /** Human label from reverse geocode (e.g. "Las Vegas, NV"). */
  const [nearAreaLabel, setNearAreaLabel] = useState<string | null>(null);
  const [courtKings, setCourtKings] = useState<Map<string, CourtKingPreview>>(() => new Map());
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [spotsActivityLines, setSpotsActivityLines] = useState<string[]>([]);
  const mapRef = useRef<MapView | null>(null);
  const hasActiveRefineFilters = sportFilter !== "all";

  const hasActiveFilters = useMemo(
    () =>
      hasActiveRefineFilters ||
      spotsMode !== "near" ||
      spotsResultsMode !== "map" ||
      cityFilter.trim().length > 0 ||
      arenaNameFilter.trim().length > 0,
    [hasActiveRefineFilters, spotsMode, spotsResultsMode, cityFilter, arenaNameFilter]
  );

  const resetRefineFilters = () => {
    lightTap();
    setSportFilter("all");
  };

  const loadNear = useCallback(async () => {
    setSpotsErr(null);
    setNearLoading(true);
    setNearAreaLabel(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setSpotsErr("Turn on location to see spots near you, or use Browse.");
        setNearCourts([]);
        setCoords(null);
        setNearAreaLabel(null);
        return;
      }
      const { lat, lng } = await resolveForegroundLatLng();
      setCoords({ lat, lng });
      try {
        const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        const g = geo[0];
        const label = [g?.city || g?.subregion, g?.region].filter(Boolean).join(", ");
        setNearAreaLabel(label.trim() || g?.district || null);
      } catch {
        setNearAreaLabel(null);
      }
      const rows = await fetchNearbyCourts(lat, lng, NEAR_RADIUS_KM);
      setNearCourts(rows);
    } catch (e: unknown) {
      setSpotsErr(humanizeFetchError(e, "Could not load nearby spots."));
    } finally {
      setNearLoading(false);
    }
  }, []);

  const loadBrowse = useCallback(async () => {
    setBrowseLoading(true);
    setSpotsErr(null);
    try {
      const rows = await fetchCourtsForBrowse({
        cityContains: spotsMode === "browse" ? cityFilter.trim() || undefined : undefined,
        nameContains: spotsMode === "browse" ? arenaNameFilter.trim() || undefined : undefined,
        placeKind: "all",
        limit: 80,
      });
      setBrowseCourts(rows);
    } catch (e: unknown) {
      setSpotsErr(humanizeFetchError(e, "Browse failed."));
    } finally {
      setBrowseLoading(false);
    }
  }, [cityFilter, arenaNameFilter, spotsMode]);

  useEffect(() => {
    if (spotsMode === "near") void loadNear();
    else void loadBrowse();
  }, [spotsMode, loadNear, loadBrowse]);

  const onSpotsRefresh = async () => {
    setSpotsRefreshing(true);
    if (spotsMode === "near") await loadNear();
    else await loadBrowse();
    setSpotsRefreshing(false);
  };

  const filteredNear = useMemo(() => {
    if (sportFilter === "all") return nearCourts;
    return nearCourts.filter((c) => courtSupportsSport(c, sportFilter));
  }, [nearCourts, sportFilter]);

  const filteredBrowse = useMemo(() => {
    if (sportFilter === "all") return browseCourts;
    return browseCourts.filter((c) => courtSupportsSport(c, sportFilter));
  }, [browseCourts, sportFilter]);

  const spotResults = useMemo(() => {
    return spotsMode === "near" ? filteredNear : filteredBrowse;
  }, [spotsMode, filteredNear, filteredBrowse]);

  const mapInitialRegion = useMemo(() => {
    const first = spotResults[0];
    const lat = coords?.lat ?? first?.lat ?? 36.17;
    const lng = coords?.lng ?? first?.lng ?? -115.14;
    return {
      latitude: lat,
      longitude: lng,
      latitudeDelta: 0.14,
      longitudeDelta: 0.14,
    };
  }, [coords, spotResults]);

  useEffect(() => {
    if (spotsResultsMode !== "map" || Platform.OS === "web") return;
    if (!spotResults.length) return;

    const t = setTimeout(() => {
      mapRef.current?.fitToCoordinates(
        spotResults.map((c) => ({ latitude: c.lat, longitude: c.lng })),
        { edgePadding: { top: 72, right: 36, bottom: 100, left: 36 }, animated: true }
      );
    }, 450);

    return () => clearTimeout(t);
  }, [spotsResultsMode, spotResults]);

  const crownPreviewRecordSlug = useMemo(() => {
    if (sportFilter === "all") return "all";
    return defaultRecordSlugForSpotSport(sportFilter) ?? "all";
  }, [sportFilter]);

  const friendIdSet = useMemo(() => new Set(friendIds), [friendIds]);

  useEffect(() => {
    if (!myId) {
      setFriendIds([]);
      return;
    }
    let cancelled = false;
    void getFriendIds(myId).then((ids) => {
      if (!cancelled) setFriendIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [myId]);

  useEffect(() => {
    if (!coords) return;
    let cancelled = false;
    void fetchSpotsActivityNear(coords.lat, coords.lng, NEAR_RADIUS_KM)
      .then((lines) => {
        if (!cancelled) setSpotsActivityLines(lines);
      })
      .catch(() => {
        if (!cancelled) setSpotsActivityLines([]);
      });
    return () => {
      cancelled = true;
    };
  }, [coords]);

  const hotCourtIds = useMemo(() => {
    const hot = new Set<string>();
    const activityBlob = spotsActivityLines.join(" ").toLowerCase();
    for (const c of spotResults) {
      const king = courtKings.get(c.id);
      const nameLower = c.name.toLowerCase();
      if (activityBlob.includes(nameLower)) hot.add(c.id);
      else if (king?.heldDays === 0) hot.add(c.id);
      else if (king?.tieAtTop) hot.add(c.id);
    }
    return hot;
  }, [spotResults, courtKings, spotsActivityLines]);

  const liveCourtIds = useMemo(() => {
    const live = new Set<string>();
    const activityBlob = spotsActivityLines.join(" ").toLowerCase();
    for (const c of spotResults) {
      const nameLower = c.name.toLowerCase();
      if (
        activityBlob.includes(nameLower) &&
        (activityBlob.includes("live") ||
          activityBlob.includes("active") ||
          activityBlob.includes("match"))
      ) {
        live.add(c.id);
      }
    }
    return live;
  }, [spotResults, spotsActivityLines]);

  const openCrownCount = useMemo(() => {
    if (!courtKings.size) return null;
    let open = 0;
    for (const c of spotResults) {
      const k = courtKings.get(c.id);
      if (!k || k.vacant || (!k.holderDisplayName && !k.tieAtTop)) open += 1;
    }
    return open;
  }, [spotResults, courtKings]);

  useEffect(() => {
    const ids = spotResults.map((c) => c.id);
    if (!ids.length) {
      setCourtKings(new Map());
      return;
    }
    let cancelled = false;
    fetchCourtKingPreviews(ids, crownPreviewRecordSlug, "individual")
      .then((m) => {
        if (!cancelled) setCourtKings(m);
      })
      .catch(() => {
        if (!cancelled) setCourtKings(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [spotResults, crownPreviewRecordSlug]);

  const crownedCount = useMemo(() => {
    let n = 0;
    for (const p of courtKings.values()) {
      if (p.holderDisplayName && !p.tieAtTop) n += 1;
    }
    return n;
  }, [courtKings]);

  const topKingsNearby = useMemo(() => {
    return spotResults
      .map((c) => ({ court: c, king: courtKings.get(c.id) }))
      .filter((x) => x.king?.holderDisplayName && !x.king.tieAtTop)
      .slice(0, 6);
  }, [spotResults, courtKings]);

  const topKingName = topKingsNearby[0]?.king?.holderDisplayName ?? null;

  const courtHref = (id: string): Href => `/courts/${id}` as Href;

  const spotsSportLabel = useMemo(() => spotSportLabel(sportFilter), [sportFilter]);

  const renderCourtRow = ({ item }: { item: CourtRow | NearbyCourtRow }) => {
    const dist = "distance_km" in item ? item.distance_km : null;
    const st = "state" in item && item.state ? item.state : null;
    const loc = [item.city ?? "—", st].filter(Boolean).join(", ");
    const king = courtKings.get(item.id);
    const kingVariant = king?.tieAtTop
      ? "contested"
      : king?.holderDisplayName
        ? "king"
        : "open";
    const kingSublabel = king?.tieAtTop
      ? "Contested crown"
      : king?.holderDisplayName
        ? [
            king.heldDays != null && king.heldDays > 0
              ? `Reign ${king.heldDays}d`
              : king.heldDays === 0
                ? "Crowned today"
                : null,
            king.allTimeLeaderName ? `#1 all-time: ${king.allTimeLeaderName}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || undefined
        : king?.vacant
          ? "Crown open"
          : undefined;
    return (
      <Pressable
        onPress={() => {
          lightTap();
          router.push(courtHref(item.id));
        }}
        style={({ pressed }) => [styles.courtRow, pressSoft(pressed)]}
      >
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.courtName} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.courtMeta} numberOfLines={1}>
            {placeLabel(item.place_kind)}
            {dist != null ? ` · ${dist.toFixed(1)} km` : loc !== "—" ? ` · ${loc}` : ""}
          </Text>
          <CrownChip
            label={
              king?.tieAtTop
                ? "Contested"
                : king?.holderDisplayName
                  ? king.holderDisplayName
                  : "Crown open"
            }
            sublabel={
              kingSublabel ??
              (king?.vacant ? "Crown open" : king?.tieAtTop ? "Challenge to break tie" : undefined)
            }
            variant={kingVariant}
            compact
          />
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </Pressable>
    );
  };

  const renderDiscoveryHeader = () => (
    <View style={styles.spotsListHeaderWrap}>
      <View style={styles.discoveryCompact}>
        <View style={styles.discoveryStatRow}>
          <CrownChip label={`${spotResults.length}`} sublabel="nearby" variant="muted" compact />
          {crownedCount > 0 ? (
            <CrownChip label={`${crownedCount}`} sublabel="crowned" variant="king" compact glow />
          ) : null}
          {openCrownCount != null && openCrownCount > 0 ? (
            <CrownChip label={`${openCrownCount}`} sublabel="open crowns" variant="open" compact />
          ) : null}
          {hotCourtIds.size > 0 ? (
            <CrownChip label={`${hotCourtIds.size}`} sublabel="hot" variant="hot" compact glow />
          ) : null}
        </View>
        {spotsMode === "near" && nearAreaLabel ? (
          <Text style={styles.discoveryMetaCompact}>Near {nearAreaLabel}</Text>
        ) : null}
        {topKingsNearby.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
            <View style={styles.topKingsRow}>
              {topKingsNearby.map(({ court, king }) => (
                <Pressable
                  key={court.id}
                  onPress={() => {
                    lightTap();
                    router.push(courtHref(court.id));
                  }}
                  style={({ pressed }) => [styles.topKingCard, pressSoft(pressed)]}
                >
                  <Ionicons name="ribbon" size={16} color={colors.gold} />
                  <Text style={styles.topKingName} numberOfLines={1}>
                    {king!.holderDisplayName}
                  </Text>
                  <Text style={styles.topKingArena} numberOfLines={1}>
                    {court.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        ) : topKingName ? (
          <Text style={styles.discoveryMetaCompact}>👑 {topKingName} holds a crown nearby</Text>
        ) : spotResults.length > 0 ? (
          <Text style={styles.discoveryMetaCompact}>Open crowns waiting — tap a pin to claim</Text>
        ) : null}
        <View style={styles.discoveryActionsRow}>
          <Pressable
            onPress={() => router.push("/courts/create" as Href)}
            style={({ pressed }) => [styles.discoveryActionBtn, styles.discoveryActionGold, pressSoft(pressed)]}
          >
            <Ionicons name="add-circle" size={16} color={colors.gold} />
            <Text style={styles.discoveryActionText}>{ARENA_CLAIM_CTA}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/(tabs)/feed" as any)}
            style={({ pressed }) => [styles.discoveryActionBtn, pressSoft(pressed)]}
          >
            <Ionicons name="pulse" size={16} color={colors.accentMuted} />
            <Text style={styles.discoveryActionText}>Pulse</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/global-rankings" as Href)}
            style={({ pressed }) => [styles.discoveryActionBtn, pressSoft(pressed)]}
          >
            <Ionicons name="podium-outline" size={16} color={colors.textMuted} />
            <Text style={styles.discoveryActionText}>Rankings</Text>
          </Pressable>
        </View>
        {spotsResultsMode === "map" ? <ArenaMapLegend /> : null}
      </View>
    </View>
  );

  const closeFilters = () => {
    setSportPickerExpanded(false);
    setFiltersOpen(false);
    if (spotsMode === "browse") void loadBrowse();
  };

  const renderExploreFiltersSheet = () => (
    <Modal visible={filtersOpen} transparent animationType="slide" onRequestClose={closeFilters}>
      <View style={styles.pickerRoot}>
        <Pressable style={styles.pickerBackdropDismiss} onPress={closeFilters} />
        <View style={styles.filterSheet}>
          <View style={styles.filterSheetHeader}>
            <Text style={styles.filterSheetTitle}>{EXPLORE_FILTERS_LABEL}</Text>
            <Pressable onPress={closeFilters} hitSlop={12} accessibilityLabel="Close filters">
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <>
                <Text style={styles.filterSectionLabel}>Discovery</Text>
                <View style={styles.spotsModeToolbar}>
                  <Pressable
                    onPress={() => {
                      lightTap();
                      setSpotsMode("near");
                    }}
                    style={[styles.spotsModeSegment, spotsMode === "near" && styles.spotsModeSegmentOn]}
                  >
                    <Text style={[styles.spotsModeSegmentText, spotsMode === "near" && styles.spotsModeSegmentTextOn]}>
                      Near me
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      lightTap();
                      setSpotsMode("browse");
                    }}
                    style={[styles.spotsModeSegment, spotsMode === "browse" && styles.spotsModeSegmentOn]}
                  >
                    <Text style={[styles.spotsModeSegmentText, spotsMode === "browse" && styles.spotsModeSegmentTextOn]}>
                      Browse
                    </Text>
                  </Pressable>
                </View>

                {spotsMode === "browse" ? (
                  <>
                    <View style={[styles.browseBar, styles.browseBarInSheet]}>
                      <TextInput
                        value={arenaNameFilter}
                        onChangeText={setArenaNameFilter}
                        placeholder="Arena name (e.g. Sunset Park)…"
                        placeholderTextColor={colors.textMuted}
                        style={styles.cityInput}
                        onSubmitEditing={() => loadBrowse()}
                      />
                    </View>
                    <View style={[styles.browseBar, styles.browseBarInSheet]}>
                      <TextInput
                        value={cityFilter}
                        onChangeText={setCityFilter}
                        placeholder="City contains…"
                        placeholderTextColor={colors.textMuted}
                        style={styles.cityInput}
                        onSubmitEditing={() => loadBrowse()}
                      />
                      <Pressable onPress={() => loadBrowse()} style={({ pressed }) => [styles.goBtn, pressSoft(pressed)]}>
                        <Text style={styles.goBtnText}>Search</Text>
                      </Pressable>
                    </View>
                  </>
                ) : null}

                <Text style={styles.filterSectionLabel}>Display</Text>
                <View style={styles.spotsModeToolbar}>
                  <Pressable
                    onPress={() => {
                      lightTap();
                      setSpotsResultsMode("map");
                    }}
                    style={[styles.spotsModeSegment, spotsResultsMode === "map" && styles.spotsModeSegmentOn]}
                  >
                    <Ionicons
                      name="map"
                      size={16}
                      color={spotsResultsMode === "map" ? colors.accentMuted : colors.textMuted}
                    />
                    <Text
                      style={[styles.spotsModeSegmentText, spotsResultsMode === "map" && styles.spotsModeSegmentTextOn]}
                    >
                      Map
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      lightTap();
                      setSpotsResultsMode("list");
                    }}
                    style={[styles.spotsModeSegment, spotsResultsMode === "list" && styles.spotsModeSegmentOn]}
                  >
                    <Ionicons
                      name="list"
                      size={16}
                      color={spotsResultsMode === "list" ? colors.accentMuted : colors.textMuted}
                    />
                    <Text
                      style={[styles.spotsModeSegmentText, spotsResultsMode === "list" && styles.spotsModeSegmentTextOn]}
                    >
                      List
                    </Text>
                  </Pressable>
                </View>

                <Text style={styles.filterSectionLabel}>Refine · {EXPLORE_FILTER_SPORT}</Text>
                <Text style={styles.filterSectionHint}>{EXPLORE_FILTER_SPORT_HINT}</Text>
                <View style={styles.sportPickerBlock}>
                  <Pressable
                    onPress={() => {
                      lightTap();
                      setSportPickerExpanded((open) => !open);
                    }}
                    style={({ pressed }) => [styles.spotsDropdownBtn, styles.spotsDropdownBtnBlock, pressSoft(pressed)]}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: sportPickerExpanded }}
                  >
                    <Text style={styles.spotsDropdownHint}>{EXPLORE_FILTER_SPORT}</Text>
                    <View style={styles.spotsDropdownValueRow}>
                      <Text style={styles.spotsDropdownChevronText} numberOfLines={1}>
                        {spotsSportLabel}
                      </Text>
                      <Ionicons
                        name={sportPickerExpanded ? "chevron-up" : "chevron-down"}
                        size={16}
                        color={colors.textMuted}
                      />
                    </View>
                  </Pressable>
                  {sportPickerExpanded ? (
                    <ScrollView
                      style={styles.sportPickerList}
                      nestedScrollEnabled
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator
                    >
                      {EXPLORE_SPOT_SPORTS.map((s) => {
                        const selected = sportFilter === s.key;
                        return (
                          <Pressable
                            key={s.key}
                            onPress={() => {
                              lightTap();
                              setSportFilter(s.key);
                              setSportPickerExpanded(false);
                            }}
                            style={[styles.pickerRow, styles.sportPickerRow, selected && styles.pickerRowOn]}
                          >
                            <Text style={[styles.pickerRowText, selected && styles.pickerRowTextOn]}>{s.label}</Text>
                            {selected ? <Ionicons name="checkmark" size={20} color={colors.accent} /> : null}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  ) : null}
                </View>
            </>
          </ScrollView>

            <Text style={styles.filterSectionLabel}>App-wide</Text>
            <Pressable
              onPress={() => {
                lightTap();
                setFiltersOpen(false);
                router.push("/global-rankings" as Href);
              }}
              style={({ pressed }) => [styles.discoveryArenaLink, styles.filterGlobalLink, pressSoft(pressed)]}
            >
              <Ionicons name="podium-outline" size={16} color={colors.gold} />
              <Text style={styles.discoveryArenaLinkText}>{EXPLORE_GLOBAL_RANKINGS_LINK}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>

          <Pressable onPress={closeFilters} style={({ pressed }) => [styles.filterDoneBtn, pressSoft(pressed)]}>
            <Text style={styles.filterDoneBtnText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );

  return (
    <ScreenCanvas variant="gold">
      <AppHeader />

      <View style={styles.topBar}>
        <View style={styles.topBarTextWrap}>
          <View style={styles.exploreTitleRow}>
            <Ionicons name="map" size={22} color={colors.gold} style={{ marginRight: 6 }} />
            <Text style={[styles.appTitle, compact && { fontSize: 24 }]}>Explore</Text>
          </View>
          <Text style={[styles.appSubtitle, compact && { fontSize: 12 }]}>
            {sportFilter !== "all"
              ? `${spotSportLabel(sportFilter)} arenas on the map`
              : "Territory, crowns & kings near you"}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            lightTap();
            setFiltersOpen(true);
          }}
          style={({ pressed }) => [
            styles.filtersIconBtn,
            hasActiveFilters && styles.filtersIconBtnActive,
            pressSoft(pressed),
          ]}
          accessibilityLabel="Open filters"
        >
          <Ionicons name="options-outline" size={20} color={hasActiveFilters ? "#fff" : colors.textMuted} />
          {hasActiveFilters ? <View style={styles.filtersActiveDot} /> : null}
        </Pressable>
      </View>

        <View style={styles.spotsSection}>
          {spotsErr ? <Text style={styles.errText}>{spotsErr}</Text> : null}

          {spotsMode === "near" && nearLoading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.sub}>Finding spots…</Text>
            </View>
          ) : spotsMode === "browse" && browseLoading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.accent} />
            </View>
          ) : spotsResultsMode === "map" && Platform.OS !== "web" ? (
            <View style={{ flex: 1 }}>
              {renderDiscoveryHeader()}
              <View style={[styles.mapContainer, styles.mapContainerBreathing]}>
                {spotResults.length === 0 ? (
                  <View style={styles.emptyWrap}>
                    <Ionicons name="location-outline" size={44} color="rgba(255,255,255,0.25)" />
                    <Text style={styles.emptyTitle}>No spots match</Text>
                    <Text style={styles.emptySub}>
                      {hasActiveRefineFilters
                        ? `No ${spotsSportLabel.toLowerCase()} arenas here. Choose All sports in filters or try Browse.`
                        : spotsMode === "near"
                          ? "Try Browse, widen filters, or add a new arena."
                          : "Try another city — or be the first king nearby."}
                    </Text>
                    {hasActiveRefineFilters ? (
                      <Pressable
                        onPress={resetRefineFilters}
                        style={({ pressed }) => [styles.refineResetBtn, styles.refineResetBtnInline, pressSoft(pressed)]}
                      >
                        <Text style={styles.refineResetBtnText}>Show all sports</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : (
                  <MapView
                    ref={mapRef}
                    style={styles.map}
                    initialRegion={mapInitialRegion}
                    showsUserLocation
                    showsMyLocationButton={Platform.OS === "android"}
                  >
                    {spotResults.map((item) => {
                      const king = courtKings.get(item.id);
                      const hasKing = Boolean(king?.holderDisplayName && !king.tieAtTop);
                      const pinKind = resolveArenaPinKind({
                        hasKing,
                        tieAtTop: king?.tieAtTop,
                        vacant: king?.vacant,
                        isHot: hotCourtIds.has(item.id),
                        isLive: liveCourtIds.has(item.id),
                        isFriend: Boolean(king?.holderUserId && friendIdSet.has(king.holderUserId)),
                      });
                      const pinLabel = king?.holderDisplayName
                        ? `👑 ${king.holderDisplayName}`
                        : king?.tieAtTop
                          ? "Contested crown"
                          : "Crown open";
                      return (
                        <Marker
                          key={item.id}
                          coordinate={{ latitude: item.lat, longitude: item.lng }}
                          title={item.name}
                          description={[pinLabel, item.city, item.place_kind.replace("_", " ")]
                            .filter(Boolean)
                            .join(" · ")}
                          tracksViewChanges={false}
                          anchor={{ x: 0.5, y: 0.5 }}
                          onPress={() => {
                            lightTap();
                            router.push(courtHref(item.id));
                          }}
                        >
                          <ArenaMapPin kind={pinKind} />
                        </Marker>
                      );
                    })}
                  </MapView>
                )}
              </View>
            </View>
          ) : (
            <FlatList
              style={{ flex: 1 }}
              data={spotResults}
              keyExtractor={(item) => item.id}
              renderItem={renderCourtRow}
              ListHeaderComponent={renderDiscoveryHeader}
              refreshControl={
                <RefreshControl refreshing={spotsRefreshing} onRefresh={onSpotsRefresh} tintColor={colors.accent} />
              }
              contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 32 }}
              ListEmptyComponent={
                <View style={styles.emptyWrap}>
                  <Ionicons name="location-outline" size={44} color="rgba(255,255,255,0.25)" />
                  <Text style={styles.emptyTitle}>No spots match</Text>
                  <Text style={styles.emptySub}>
                    {hasActiveRefineFilters
                      ? `No ${spotsSportLabel.toLowerCase()} arenas here. Choose All sports in filters or try Browse.`
                      : spotsMode === "near"
                        ? "Try Browse, widen filters, or add a new arena."
                        : "Try another city — or be the first king nearby."}
                  </Text>
                  {hasActiveRefineFilters ? (
                    <Pressable
                      onPress={resetRefineFilters}
                      style={({ pressed }) => [styles.refineResetBtn, styles.refineResetBtnInline, pressSoft(pressed)]}
                    >
                      <Text style={styles.refineResetBtnText}>Clear sport & place filters</Text>
                    </Pressable>
                  ) : null}
                </View>
              }
            />
          )}
        </View>

      {renderExploreFiltersSheet()}
    </ScreenCanvas>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgFeed },
  /** Spots tab: lets list/map fill remaining height */
  spotsSection: { flex: 1, minHeight: 0 },
  /** Places / City / State — nested under Spots tab only (no outer “card in card”) */
  spotsGeoNestMinimal: {
    marginHorizontal: space.lg,
    marginBottom: space.sm,
  },
  spotsGeoNestLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.55,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  spotsGeoScopeRow: {
    flexDirection: "row",
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  spotsGeoScopeBtn: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 9 },
  spotsGeoScopeBtnOn: { backgroundColor: colors.accent },
  spotsGeoScopeText: { color: colors.textMuted, fontWeight: "800", fontSize: 13 },
  spotsGeoScopeTextOn: { color: "#fff" },
  /** Near / Browse + list / map in one toolbar */
  spotsModeToolbar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    padding: 3,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    gap: 2,
  },
  spotsModeSegment: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "transparent",
  },
  spotsModeSegmentOn: {
    backgroundColor: colors.accentChip,
    borderColor: colors.accentChipBorder,
  },
  spotsModeSegmentText: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
  spotsModeSegmentTextOn: { color: colors.accentMuted, fontWeight: "800" },
  spotsModeToolbarDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: colors.border,
    marginVertical: 6,
  },
  spotsToolbarIconBtn: {
    width: 40,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "transparent",
  },
  spotsToolbarIconBtnOn: {
    backgroundColor: colors.accentSurface,
    borderColor: colors.accentBorder,
  },
  spotsListHeaderWrap: { marginBottom: space.md, gap: 10 },
  spotsLiveCard: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: "rgba(239,68,68,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(239,68,68,0.22)",
  },
  spotsLiveCardTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  spotsLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ef4444",
  },
  spotsLiveTitle: { color: colors.text, fontWeight: "900", fontSize: 13, letterSpacing: 0.3 },
  spotsLiveLine: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  spotsLiveLineFollow: { marginTop: 4 },
  discoveryCompact: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  discoveryStatRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  discoveryMetaCompact: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 8,
    lineHeight: 17,
  },
  discoveryActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  discoveryActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  discoveryActionGold: {
    backgroundColor: colors.goldSurfaceFaint,
    borderColor: colors.goldBorderSoft,
  },
  discoveryActionText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  discoveryCard: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.goldSurfaceFaint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.goldBorder,
  },
  discoveryCardTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  discoveryTitle: { color: colors.text, fontWeight: "900", fontSize: 14 },
  discoveryLine: { color: colors.text, fontSize: 14, fontWeight: "700", lineHeight: 20 },
  discoveryMeta: { color: colors.textMuted, fontSize: 12, fontWeight: "600", marginTop: 4 },
  discoverySub: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 6 },
  claimArenaCard: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.goldBorderSoft,
  },
  claimArenaTitle: { color: colors.text, fontWeight: "800", fontSize: 14 },
  claimArenaSub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  topKingsSection: { marginTop: 12 },
  topKingsTitle: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  topKingsRow: { flexDirection: "row", gap: 10, paddingRight: 8 },
  topKingCard: {
    width: 140,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: colors.goldSurfaceMuted,
    borderWidth: 1,
    borderColor: colors.goldBorderSoft,
    gap: 4,
  },
  topKingName: { color: colors.text, fontWeight: "900", fontSize: 14 },
  topKingArena: { color: colors.textMuted, fontSize: 11, lineHeight: 14 },
  legendsGameGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: space.lg,
    marginBottom: space.md,
  },
  legendsGameCard: {
    width: "47%",
    flexGrow: 1,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  legendsGameLabel: { color: colors.text, fontWeight: "900", fontSize: 15 },
  legendsGameSub: { color: colors.textMuted, fontSize: 11, lineHeight: 15 },
  legendsBackLink: { paddingHorizontal: space.lg, paddingVertical: 8 },
  legendsBackLinkText: { color: colors.accentMuted, fontWeight: "800", fontSize: 13 },
  viewOnMapBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.goldSurfaceFaint,
    borderWidth: 1,
    borderColor: colors.goldBorderSoft,
  },
  viewOnMapBtnText: { flex: 1, color: colors.text, fontWeight: "800", fontSize: 14 },
  territoryLegendSummary: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  territoryLegendHeader: { marginBottom: space.md },
  territoryLegendHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  discoveryArenaLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  discoveryArenaLinkText: { flex: 1, color: colors.accentMuted, fontSize: 13, fontWeight: "800" },
  discoveryPathHint: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 6,
    marginBottom: 4,
  },
  filterGlobalLink: { marginTop: space.sm, marginBottom: space.md },
  spotsViewToolbar: {
    flexDirection: "row",
    gap: 8,
    marginBottom: space.sm,
  },
  spotsViewBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
  },
  spotsViewBtnOn: {
    backgroundColor: colors.accentSurface,
    borderColor: colors.accentBorder,
  },
  spotsViewBtnText: { color: colors.textMuted, fontWeight: "800", fontSize: 13 },
  spotsViewBtnTextOn: { color: colors.text },
  spotsOpportunityCard: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.goldSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.goldBorder,
  },
  spotsOpportunityTitle: { color: colors.text, fontWeight: "900", fontSize: 14 },
  spotsOpportunitySub: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 6 },
  kingSpotlightCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: space.lg,
    marginBottom: space.md,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.goldSurfaceStrong,
    borderWidth: 1,
    borderColor: colors.goldBorderStrong,
  },
  kingSpotlightIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.goldSurface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.goldBorder,
  },
  kingSpotlightTitle: { color: colors.text, fontWeight: "900", fontSize: 16, letterSpacing: 0.2 },
  kingSpotlightSub: { color: colors.textSecondary, fontSize: 13, marginTop: 4, fontWeight: "600", lineHeight: 18 },
  spotsOptionalFiltersRow: {
    flexDirection: "row",
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    gap: 10,
  },
  spotsFilterDropdownStack: {
    gap: 8,
    marginHorizontal: space.lg,
    marginBottom: space.sm,
  },
  spotsDropdownBtnBlock: {
    flex: 0,
    width: "100%",
  },
  spotsDropdownBtn: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  spotsDropdownBtnPrimary: {
    borderColor: colors.accentBorder,
    backgroundColor: "rgba(99,102,241,0.08)",
  },
  spotsDropdownHint: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  spotsDropdownValueRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  spotsDropdownChevronText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700", flex: 1 },
  spotsDropdownChevronTextPrimary: { color: colors.text, fontWeight: "900", fontSize: 14 },
  pickerRoot: { flex: 1, justifyContent: "flex-end" },
  pickerBackdropDismiss: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  pickerSheet: {
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: space.md,
    paddingBottom: 28,
    maxHeight: "62%",
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerTitle: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 16,
    paddingHorizontal: space.lg,
    marginBottom: space.sm,
  },
  pickerList: { maxHeight: 360 },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pickerRowOn: { backgroundColor: "rgba(99,102,241,0.08)" },
  pickerRowText: { color: colors.text, fontSize: 15, fontWeight: "600", flex: 1, paddingRight: 8 },
  pickerRowTextOn: { fontWeight: "800", color: colors.accentMuted },
  mapContainerBreathing: { marginTop: 14 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  advancedRow: {
    paddingHorizontal: space.lg,
    marginBottom: space.sm,
  },
  advancedBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  advancedBtnOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  advancedBtnText: { color: colors.textMuted, fontWeight: "800", fontSize: 12 },
  advancedBtnTextOn: { color: "#fff" },
  topBarTextWrap: {
    flex: 1,
    marginRight: 10,
  },
  exploreTitleRow: { flexDirection: "row", alignItems: "center" },
  appTitle: { fontSize: 28, fontWeight: "900", color: colors.text },
  appSubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  sectionRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 3,
  },
  sectionBtn: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 9,
  },
  sectionBtnActive: { backgroundColor: colors.accent },
  sectionText: { color: colors.textMuted, fontWeight: "800", fontSize: 12 },
  sectionTextActive: { color: "#fff" },
  explorePerspectiveRow: {
    marginBottom: space.sm,
  },
  exploreControlRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.lg,
    marginBottom: space.sm,
    gap: 10,
  },
  exploreControlToggleWrap: { flex: 1, minWidth: 0 },
  exploreSectionRow: { marginHorizontal: 0, marginBottom: 0 },
  exploreScopeRow: { marginHorizontal: 0, marginBottom: 0 },
  filterSheetScopeRow: { marginHorizontal: space.lg, marginBottom: space.sm },
  filtersIconBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filtersIconBtnActive: {
    backgroundColor: colors.accentCTA,
    borderColor: colors.accentCTA,
  },
  filtersActiveDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.gold,
    borderWidth: 1,
    borderColor: colors.bgFeed,
  },
  filterSheet: {
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: space.md,
    paddingBottom: space.lg,
    maxHeight: "78%",
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    marginBottom: space.sm,
  },
  filterSheetTitle: { color: colors.text, fontWeight: "900", fontSize: 17 },
  filterSectionLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.55,
    textTransform: "uppercase",
    marginHorizontal: space.lg,
    marginTop: space.sm,
    marginBottom: 6,
  },
  filterSectionHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginHorizontal: space.lg,
    marginBottom: 8,
  },
  sportChipScroll: { marginBottom: 4 },
  sportChipRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: 8,
    paddingHorizontal: space.lg,
    paddingBottom: 4,
  },
  filterSheetHint: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginHorizontal: space.lg,
    marginTop: space.sm,
    marginBottom: space.md,
  },
  filterSheetHintInline: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginHorizontal: space.lg,
    marginBottom: space.sm,
  },
  refineResetBtn: {
    marginTop: space.sm,
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  refineResetBtnInline: { marginTop: space.md, alignSelf: "center" },
  refineResetBtnText: { color: colors.accent, fontSize: 14, fontWeight: "700" },
  sportPickerBlock: {
    marginHorizontal: space.lg,
    marginBottom: space.sm,
  },
  sportPickerList: {
    maxHeight: 220,
    marginTop: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgFeed,
  },
  sportPickerRow: { marginHorizontal: 0, borderRadius: 0 },
  filterDoneBtn: {
    marginHorizontal: space.lg,
    marginTop: space.md,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  filterDoneBtnText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  browseBarInSheet: { marginHorizontal: space.lg, marginBottom: space.sm },
  scopeRow: {
    flexDirection: "row",
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scopeBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 10 },
  scopeBtnActive: { backgroundColor: colors.accent },
  scopeText: { color: colors.textMuted, fontWeight: "800", fontSize: 14 },
  scopeTextActive: { color: "#fff" },
  typeTabs: { maxHeight: 50, marginBottom: 8 },
  typeTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeTabActive: { backgroundColor: colors.accentSurface, borderColor: colors.accentBorder },
  typeTabText: { color: colors.textMuted, fontWeight: "800", fontSize: 13 },
  typeTabTextActive: { color: "#fff" },
  placeChips: { maxHeight: 44 },
  spotsChipsTight: { maxHeight: 38, marginBottom: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.accentSurface, borderColor: colors.accentBorder },
  chipActiveSolid: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textMuted, fontWeight: "700", fontSize: 12 },
  chipTextActive: { color: "#fff" },
  pickerEmptyHint: {
    color: colors.textMuted,
    fontSize: 13,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    textAlign: "center",
  },
  browseBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.lg,
    gap: 10,
    marginBottom: space.sm,
  },
  spotsToolRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    overflow: "hidden",
  },
  spotsToolGroup: { flex: 1, flexDirection: "row", padding: 4, gap: 6 },
  spotsToolDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  spotsToolBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "transparent",
  },
  spotsToolBtnOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  spotsToolText: { color: colors.textMuted, fontWeight: "800", fontSize: 12 },
  spotsToolTextOn: { color: "#fff" },
  resultsModeRow: {
    flexDirection: "row",
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  resultsModeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  resultsModeBtnOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  resultsModeText: { color: colors.textMuted, fontWeight: "800", fontSize: 14 },
  resultsModeTextOn: { color: "#fff" },
  mapContainer: {
    flex: 1,
    minHeight: 280,
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: space.lg,
    marginBottom: space.sm,
  },
  map: { flex: 1 },
  cityInput: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.text,
    fontWeight: "600",
  },
  goBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  goBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  hintBlock: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: space.md,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  cityInputFull: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontWeight: "600",
    marginBottom: space.md,
  },
  cityOpenBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: radius.md,
    marginTop: space.sm,
    marginBottom: space.md,
  },
  cityOpenBtnDisabled: { opacity: 0.45 },
  cityOpenBtnText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  metaLine: { color: colors.textMuted, fontSize: 12, paddingHorizontal: space.lg, marginBottom: space.sm },
  heroCard: {
    marginHorizontal: space.lg,
    marginBottom: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    flexDirection: "row",
  },
  heroAccent: {
    width: 4,
    backgroundColor: colors.gold,
    opacity: 0.85,
  },
  heroBody: { flex: 1, paddingVertical: 12, paddingHorizontal: 14, paddingRight: 16 },
  heroTitle: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 15,
    letterSpacing: 0.2,
  },
  heroCopy: {
    marginTop: 6,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  kingLinkCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: space.lg,
    marginBottom: space.md,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.goldBorderSoft,
  },
  kingLinkIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.goldSurfaceStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  kingLinkTitle: { color: colors.text, fontWeight: "900", fontSize: 15 },
  kingLinkSub: { color: colors.textMuted, fontSize: 12, marginTop: 3, fontWeight: "600" },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.goldSurface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  errText: { color: colors.danger, paddingHorizontal: space.lg, marginBottom: 8 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 40 },
  sub: { color: colors.textMuted, marginTop: 8 },
  courtRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 8,
  },
  courtName: { color: colors.text, fontWeight: "800", fontSize: 16 },
  courtMeta: { color: colors.textMuted, fontSize: 12, marginTop: 4, textTransform: "capitalize" },
  courtEngageHint: {
    color: colors.textTertiary,
    fontSize: 12,
    marginTop: 6,
    lineHeight: 16,
    fontWeight: "600",
  },
  emptyWrap: { alignItems: "center", paddingVertical: 48 },
  emptyTitle: { color: colors.text, fontWeight: "900", fontSize: 15, marginTop: 12 },
  emptySub: { color: colors.textMuted, fontSize: 13, marginTop: 6, textAlign: "center", paddingHorizontal: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 12,
  },
  rowMe: {
    backgroundColor: "rgba(99,102,241,0.1)",
    marginHorizontal: -space.lg,
    paddingHorizontal: space.lg,
    borderRadius: 12,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  rank1: { backgroundColor: colors.amberBright },
  rank2: { backgroundColor: colors.podiumSecondBadge },
  rank3: { backgroundColor: colors.podiumBronze },
  rankText: { color: "#fff", fontWeight: "900", fontSize: 14 },
  rowName: { color: colors.text, fontWeight: "800", fontSize: 15 },
  youTag: { color: colors.accent, fontWeight: "700" },
  rowValue: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: "rgba(99,102,241,0.15)" },
  rowValueText: { color: colors.accentMuted, fontWeight: "900", fontSize: 14 },
});
