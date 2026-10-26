// Kings per competition — list view (not the Explore map)
import { Ionicons } from "@expo/vector-icons";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import AppHeader from "../components/AppHeader";
import ScreenCanvas from "../../lib/ui/ScreenCanvas";
import {
  fetchCourtsForBrowse,
  fetchNearbyCourts,
  type CourtRow,
  type NearbyCourtRow,
} from "../../lib/backend/courts";
import {
  fetchCourtKingPreviews,
  type CourtKingPreview,
} from "../../lib/backend/courtKingPreview";
import {
  courtSupportsRecordSlug,
  courtSupportsSport,
  EXPLORE_SPOT_SPORTS,
  filterRecordTypesBySpotSport,
  SPOTS_CATEGORIES,
  spotSportLabel,
  type SpotSportKey,
} from "../../lib/data/leaderboardTaxonomy";
import {
  CHALLENGE_KINGS_EMPTY,
  CHALLENGE_KINGS_SUBTITLE,
  CHALLENGE_KINGS_TITLE,
} from "../../lib/theme/arenaCopy";
import { colors } from "../../lib/theme/colors";
import { radius, space } from "../../lib/theme/spacing";
import CrownChip from "../../lib/ui/CrownChip";
import { pressSoft, pressSubtle } from "../../lib/ui/pressableStyles";
import { lightTap } from "../../lib/utils/haptics";
import { resolveForegroundLatLng } from "../../lib/utils/resolveForegroundLatLng";
import { humanizeFetchError } from "../../lib/utils/networkErrors";

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

type KingRow = {
  court: CourtRow | NearbyCourtRow;
  king: CourtKingPreview | undefined;
};

type KingSection = {
  slug: string;
  title: string;
  data: KingRow[];
};

export default function ChallengeKingsScreen() {
  const router = useRouter();

  const [spotsMode, setSpotsMode] = useState<"near" | "browse">("near");
  const [sportFilter, setSportFilter] = useState<SpotSportKey | "all">("all");
  const [challengeFilter, setChallengeFilter] = useState<string | "all">("all");
  const [cityFilter, setCityFilter] = useState("");
  const [arenaNameFilter, setArenaNameFilter] = useState("");

  const [nearLoading, setNearLoading] = useState(true);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [nearCourts, setNearCourts] = useState<NearbyCourtRow[]>([]);
  const [browseCourts, setBrowseCourts] = useState<CourtRow[]>([]);
  const [nearAreaLabel, setNearAreaLabel] = useState<string | null>(null);
  const [kingsByChallenge, setKingsByChallenge] = useState<Map<string, Map<string, CourtKingPreview>>>(
    () => new Map()
  );
  const [kingsLoading, setKingsLoading] = useState(false);

  const challengeOptions = useMemo(() => {
    const cats = filterRecordTypesBySpotSport(
      SPOTS_CATEGORIES.map((c) => ({ slug: c.slug, title: c.title })),
      sportFilter
    );
    return cats;
  }, [sportFilter]);

  const loadNear = useCallback(async () => {
    setErr(null);
    setNearLoading(true);
    setNearAreaLabel(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setErr("Turn on location to see kings near you, or switch to Browse.");
        setNearCourts([]);
        setNearAreaLabel(null);
        return;
      }
      const { lat, lng } = await resolveForegroundLatLng();
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
      setErr(humanizeFetchError(e, "Could not load nearby spots."));
      setNearCourts([]);
    } finally {
      setNearLoading(false);
    }
  }, []);

  const loadBrowse = useCallback(async () => {
    setBrowseLoading(true);
    setErr(null);
    try {
      const rows = await fetchCourtsForBrowse({
        cityContains: cityFilter.trim() || undefined,
        nameContains: arenaNameFilter.trim() || undefined,
        placeKind: "all",
        limit: 80,
      });
      setBrowseCourts(rows);
    } catch (e: unknown) {
      setErr(humanizeFetchError(e, "Browse failed."));
      setBrowseCourts([]);
    } finally {
      setBrowseLoading(false);
    }
  }, [cityFilter, arenaNameFilter]);

  useEffect(() => {
    if (spotsMode === "near") void loadNear();
    else void loadBrowse();
  }, [spotsMode, loadNear, loadBrowse]);

  useEffect(() => {
    setChallengeFilter("all");
  }, [sportFilter]);

  const spotResults = useMemo(() => {
    const base = spotsMode === "near" ? nearCourts : browseCourts;
    if (sportFilter === "all") return base;
    return base.filter((c) => courtSupportsSport(c, sportFilter));
  }, [spotsMode, nearCourts, browseCourts, sportFilter]);

  const sections = useMemo((): KingSection[] => {
    const slugs =
      challengeFilter === "all"
        ? challengeOptions.map((c) => c.slug)
        : challengeOptions.some((c) => c.slug === challengeFilter)
          ? [challengeFilter]
          : [];

    const out: KingSection[] = [];
    for (const opt of challengeOptions) {
      if (!slugs.includes(opt.slug)) continue;
      const courts = spotResults.filter((c) => courtSupportsRecordSlug(c, opt.slug));
      if (!courts.length) continue;
      const kingMap = kingsByChallenge.get(opt.slug) ?? new Map();
      const rows: KingRow[] = courts.map((court) => ({
        court,
        king: kingMap.get(court.id),
      }));
      rows.sort((a, b) => {
        const aDist = "distance_km" in a.court ? a.court.distance_km : null;
        const bDist = "distance_km" in b.court ? b.court.distance_km : null;
        if (aDist != null && bDist != null) return aDist - bDist;
        return a.court.name.localeCompare(b.court.name);
      });
      out.push({ slug: opt.slug, title: opt.title, data: rows });
    }
    return out;
  }, [challengeFilter, challengeOptions, spotResults, kingsByChallenge]);

  const crownedTotal = useMemo(() => {
    let n = 0;
    for (const section of sections) {
      for (const row of section.data) {
        if (row.king?.holderDisplayName && !row.king.tieAtTop) n += 1;
      }
    }
    return n;
  }, [sections]);

  useEffect(() => {
    const slugs =
      challengeFilter === "all"
        ? challengeOptions.map((c) => c.slug)
        : challengeOptions.some((c) => c.slug === challengeFilter)
          ? [challengeFilter]
          : [];
    if (!spotResults.length || !slugs.length) {
      setKingsByChallenge(new Map());
      return;
    }

    let cancelled = false;
    setKingsLoading(true);

    const jobs = slugs
      .map((slug) => {
        const courtIds = spotResults
          .filter((c) => courtSupportsRecordSlug(c, slug))
          .map((c) => c.id);
        if (!courtIds.length) return null;
        return { slug, courtIds };
      })
      .filter(Boolean) as { slug: string; courtIds: string[] }[];

    void Promise.all(
      jobs.map(async ({ slug, courtIds }) => {
        const m = await fetchCourtKingPreviews(courtIds, slug, "individual");
        return { slug, m };
      })
    )
      .then((results) => {
        if (cancelled) return;
        const next = new Map<string, Map<string, CourtKingPreview>>();
        for (const { slug, m } of results) next.set(slug, m);
        setKingsByChallenge(next);
      })
      .catch(() => {
        if (!cancelled) setKingsByChallenge(new Map());
      })
      .finally(() => {
        if (!cancelled) setKingsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [spotResults, challengeFilter, challengeOptions]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (spotsMode === "near") await loadNear();
    else await loadBrowse();
    setRefreshing(false);
  };

  const courtHref = (id: string, recordSlug: string): Href =>
    `/courts/${id}?record=${encodeURIComponent(recordSlug)}` as Href;

  const loading = spotsMode === "near" ? nearLoading : browseLoading;

  const renderKingRow = (section: KingSection, row: KingRow) => {
    const { court, king } = row;
    const dist = "distance_km" in court ? court.distance_km : null;
    const st = "state" in court && court.state ? court.state : null;
    const loc = [court.city ?? "—", st].filter(Boolean).join(", ");
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
          ]
            .filter(Boolean)
            .join(" · ") || undefined
        : "Crown open — challenge them";

    return (
      <Pressable
        key={`${section.slug}-${court.id}`}
        onPress={() => {
          lightTap();
          router.push(courtHref(court.id, section.slug));
        }}
        style={({ pressed }) => [styles.courtRow, pressSoft(pressed)]}
      >
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.courtName} numberOfLines={2}>
            {court.name}
          </Text>
          <Text style={styles.courtMeta} numberOfLines={1}>
            {placeLabel(court.place_kind)}
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
            sublabel={kingSublabel}
            variant={kingVariant}
            compact
          />
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </Pressable>
    );
  };

  return (
    <ScreenCanvas variant="gold">
      <AppHeader />

      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressSubtle(pressed)]}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.topBarTextWrap}>
          <View style={styles.titleRow}>
            <Ionicons name="skull" size={20} color={colors.warning} style={{ marginRight: 6 }} />
            <Text style={styles.appTitle}>{CHALLENGE_KINGS_TITLE}</Text>
          </View>
          <Text style={styles.appSubtitle}>{CHALLENGE_KINGS_SUBTITLE}</Text>
        </View>
      </View>

      <View style={styles.modeToolbar}>
        <Pressable
          onPress={() => {
            lightTap();
            setSpotsMode("near");
          }}
          style={[styles.modeSegment, spotsMode === "near" && styles.modeSegmentOn]}
        >
          <Text style={[styles.modeSegmentText, spotsMode === "near" && styles.modeSegmentTextOn]}>Near me</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            lightTap();
            setSpotsMode("browse");
          }}
          style={[styles.modeSegment, spotsMode === "browse" && styles.modeSegmentOn]}
        >
          <Text style={[styles.modeSegmentText, spotsMode === "browse" && styles.modeSegmentTextOn]}>By area</Text>
        </Pressable>
      </View>

      {spotsMode === "near" && nearAreaLabel ? (
        <Text style={styles.areaLabel}>Near {nearAreaLabel}</Text>
      ) : null}

      {spotsMode === "browse" ? (
        <View style={styles.browseBar}>
          <TextInput
            value={arenaNameFilter}
            onChangeText={setArenaNameFilter}
            placeholder="Arena name…"
            placeholderTextColor={colors.textMuted}
            style={styles.browseInput}
            onSubmitEditing={() => loadBrowse()}
          />
          <TextInput
            value={cityFilter}
            onChangeText={setCityFilter}
            placeholder="City…"
            placeholderTextColor={colors.textMuted}
            style={styles.browseInput}
            onSubmitEditing={() => loadBrowse()}
          />
          <Pressable onPress={() => loadBrowse()} style={({ pressed }) => [styles.goBtn, pressSoft(pressed)]}>
            <Text style={styles.goBtnText}>Search</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.filterBlock}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipScroll}
        >
          {EXPLORE_SPOT_SPORTS.map((s) => {
            const selected = sportFilter === s.key;
            return (
              <Pressable
                key={s.key}
                onPress={() => {
                  lightTap();
                  setSportFilter(s.key);
                }}
                style={[styles.chip, selected && styles.chipOn]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextOn]}>{s.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipScroll}
        >
          <Pressable
            onPress={() => {
              lightTap();
              setChallengeFilter("all");
            }}
            style={[styles.chip, challengeFilter === "all" && styles.chipOn]}
          >
            <Text style={[styles.chipText, challengeFilter === "all" && styles.chipTextOn]}>All challenges</Text>
          </Pressable>
          {challengeOptions.map((c) => {
            const selected = challengeFilter === c.slug;
            return (
              <Pressable
                key={c.slug}
                onPress={() => {
                  lightTap();
                  setChallengeFilter(c.slug);
                }}
                style={[styles.chip, selected && styles.chipOn]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextOn]} numberOfLines={1}>
                  {c.title}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {err ? <Text style={styles.errText}>{err}</Text> : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.sub}>Loading spots…</Text>
        </View>
      ) : kingsLoading && !sections.length ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.sub}>Loading crowns…</Text>
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="ribbon-outline" size={44} color="rgba(255,255,255,0.25)" />
          <Text style={styles.emptyTitle}>No kings here</Text>
          <Text style={styles.emptySub}>
            {sportFilter !== "all"
              ? `No ${spotSportLabel(sportFilter).toLowerCase()} challenges with crowns in this area.`
              : CHALLENGE_KINGS_EMPTY}
          </Text>
          <Pressable
            onPress={() => router.push("/courts/apply" as Href)}
            style={({ pressed }) => [styles.ctaBtn, pressSoft(pressed)]}
          >
            <Text style={styles.ctaBtnText}>Claim a spot</Text>
          </Pressable>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, index) => `${item.court.id}-${index}`}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionMeta}>
                {section.data.filter((r) => r.king?.holderDisplayName && !r.king.tieAtTop).length} crowned ·{" "}
                {section.data.length} arena{section.data.length === 1 ? "" : "s"}
              </Text>
            </View>
          )}
          renderItem={({ item, section }) => renderKingRow(section, item)}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 32 }}
          ListHeaderComponent={
            <View style={styles.statsRow}>
              <CrownChip
                label={`${crownedTotal}`}
                sublabel={crownedTotal === 1 ? "king nearby" : "kings nearby"}
                variant="king"
                compact
                glow={crownedTotal > 0}
              />
              <CrownChip label={`${sections.length}`} sublabel="challenges" variant="muted" compact />
              {kingsLoading ? <ActivityIndicator size="small" color={colors.accent} /> : null}
            </View>
          }
        />
      )}
    </ScreenCanvas>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    gap: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  topBarTextWrap: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center" },
  appTitle: { fontSize: 24, fontWeight: "900", color: colors.text },
  appSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 4, lineHeight: 17 },
  modeToolbar: {
    flexDirection: "row",
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeSegment: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 9 },
  modeSegmentOn: { backgroundColor: colors.accent },
  modeSegmentText: { color: colors.textMuted, fontWeight: "800", fontSize: 13 },
  modeSegmentTextOn: { color: "#fff" },
  areaLabel: {
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    color: colors.textTertiary,
    fontSize: 12,
    fontWeight: "700",
  },
  browseBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    alignItems: "center",
  },
  browseInput: {
    flex: 1,
    minWidth: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    color: colors.text,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: "600",
  },
  goBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.accentCTA,
  },
  goBtnText: { color: colors.text, fontWeight: "900", fontSize: 12 },
  filterBlock: {
    gap: 10,
    marginBottom: space.md,
  },
  chipScroll: {
    paddingHorizontal: space.lg,
    gap: 8,
    alignItems: "center",
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    flexShrink: 0,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textSecondary, fontWeight: "800", fontSize: 13 },
  chipTextOn: { color: "#fff" },
  errText: {
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    color: colors.warning,
    fontSize: 12,
    fontWeight: "700",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  sub: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  sectionHeader: {
    marginTop: 12,
    marginBottom: 8,
    gap: 2,
  },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  sectionMeta: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  courtRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    marginBottom: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  courtName: { color: colors.text, fontSize: 14, fontWeight: "900" },
  courtMeta: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: "900" },
  emptySub: { color: colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 19 },
  ctaBtn: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.goldSurface,
    borderWidth: 1,
    borderColor: colors.goldBorder,
  },
  ctaBtnText: { color: colors.gold, fontWeight: "900", fontSize: 13 },
});
