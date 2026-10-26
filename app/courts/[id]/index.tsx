// app/courts/[id]/index.tsx — Court hub: records + leaderboards (ties 1a/1b, badge slot)
import { Ionicons } from "@expo/vector-icons";
import type { Href } from "expo-router";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import Avatar from "../../../lib/ui/Avatar";
import {
  confirmCourtLegitimacy,
  fetchCourtById,
  fetchCourtProofClips,
  fetchRecordTypes,
  getSpotRecordTypesForCourt,
  type CourtProofClipRow,
  type CourtRecordTypeRow,
  type CourtRow,
} from "../../../lib/backend/courts";
import {
  fetchCourtSpotLegend,
  type CourtSpotLegend,
} from "../../../lib/backend/courtSpotLegend";
import {
  fetchKingLeaderboardWithProfiles,
  formatKingScore,
  scopeKeyForCourt,
  scopeKeyForTeamCourt,
  type KingBadgeSlotRow,
  type KingLeaderboardRow,
} from "../../../lib/backend/kingLeaderboard";
import { useAuthStore } from "../../../lib/data/authStore";
import {
  EXPLORE_SPOT_SPORTS,
  filterRecordTypesByPerspective,
  filterRecordTypesBySpotSport,
  isCrewEligibleRecordType,
  resolveCourtSportKeys,
  spotSportForRecordSlug,
  spotSportLabel,
  type ChallengePerspective,
  type SpotSportKey,
} from "../../../lib/data/leaderboardTaxonomy";
import {
  ARENA_CHALLENGE_KING,
  ARENA_CLIPS_LINK,
  ARENA_CROWN_OPEN,
  ARENA_DISCOVERY_SUB,
  ARENA_HISTORY_SOON,
  ARENA_OPEN_MATCHES_LINK,
  ARENA_PEOPLE_ACTIVE_HERE,
  ARENA_PENDING_LABEL,
  ARENA_REFERENCE_PHOTOS_LABEL,
  ARENA_VIEW_LEADERBOARD,
  ARENA_FILTER_COMPETITION,
  ARENA_FILTER_FORMAT,
  ARENA_TAB_OVERVIEW_LEAD,
  ARENA_TIER_LABELS,
  CROWN_VS_ALLTIME_HINT,
  EXPLORE_FILTER_SPORT,
  PULSE_TAB_TITLE,
} from "../../../lib/theme/arenaCopy";
import ArenaReferencePhotos from "../../../lib/ui/ArenaReferencePhotos";
import CrownChip from "../../../lib/ui/CrownChip";
import { colors } from "../../../lib/theme/colors";
import { radius, space } from "../../../lib/theme/spacing";
import { pressSoft } from "../../../lib/ui/pressableStyles";
import { lightTap } from "../../../lib/utils/haptics";
import { getFriendIds } from "../../../lib/backend/friends";

type BoardPack = { rows: KingLeaderboardRow[]; slot: KingBadgeSlotRow | null };
type ArenaPageTab = "leaderboard" | "activity" | "clips";
type LbPicker = "sport" | "competition";

const ARENA_TABS: { key: ArenaPageTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "leaderboard", label: "Leaderboard", icon: "podium-outline" },
  { key: "activity", label: "Overview", icon: "stats-chart-outline" },
  { key: "clips", label: "Clips", icon: "videocam-outline" },
];

function leaderboardRowStyles(index: number) {
  if (index === 0) return [styles.lbRow, styles.lbRowGold];
  if (index === 1) return [styles.lbRow, styles.lbRowSilver];
  if (index === 2) return [styles.lbRow, styles.lbRowBronze];
  return [styles.lbRow];
}

export default function CourtDetailScreen() {
  const router = useRouter();
  const { id, record: recordParam } = useLocalSearchParams<{ id: string; record?: string }>();
  const courtId = String(id ?? "");
  const highlightRecord = recordParam ? String(recordParam) : null;
  const userId = useAuthStore((s) => s.user?.id);

  const [friendIds, setFriendIds] = useState<string[]>([]);
  const friendIdsSet = useMemo(() => new Set(friendIds), [friendIds]);

  const [court, setCourt] = useState<CourtRow | null>(null);
  const [types, setTypes] = useState<CourtRecordTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [boardsUser, setBoardsUser] = useState<Record<string, BoardPack>>({});
  const [boardsTeam, setBoardsTeam] = useState<Record<string, BoardPack>>({});
  const [spotBoardMode, setSpotBoardMode] = useState<ChallengePerspective>("individual");
  const [legend, setLegend] = useState<CourtSpotLegend | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [arenaTab, setArenaTab] = useState<ArenaPageTab>(
    highlightRecord ? "leaderboard" : "leaderboard"
  );
  const [sportFilter, setSportFilter] = useState<SpotSportKey | "all">("all");
  const [selectedRecordSlug, setSelectedRecordSlug] = useState<string | null>(
    highlightRecord ?? null
  );
  const [clips, setClips] = useState<CourtProofClipRow[]>([]);
  const [lbPicker, setLbPicker] = useState<LbPicker | null>(null);

  const isPending = court?.verification_status === "pending";
  const isApproved = !court?.verification_status || court.verification_status === "approved";
  const isCreator = userId && court?.created_by === userId;

  const loadBoard = useCallback(
    async (slug: string, higherIsBetter: boolean) => {
      const [packUser, packTeam] = await Promise.all([
        fetchKingLeaderboardWithProfiles(scopeKeyForCourt(courtId, slug), slug, higherIsBetter),
        fetchKingLeaderboardWithProfiles(scopeKeyForTeamCourt(courtId, slug), slug, higherIsBetter),
      ]);
      setBoardsUser((prev) => ({ ...prev, [slug]: packUser }));
      setBoardsTeam((prev) => ({ ...prev, [slug]: packTeam }));
    },
    [courtId]
  );

  const load = useCallback(async () => {
    if (!courtId) return;
    setLoading(true);
    setErr(null);
    try {
      const [c, t] = await Promise.all([fetchCourtById(courtId), fetchRecordTypes()]);
      if (!c) {
        setCourt(null);
        setTypes([]);
        return;
      }
      // Court taxonomy is source of truth (3v3, 5v5, etc.); overlay DB titles when present.
      const courtTypes = getSpotRecordTypesForCourt(c);
      const dbBySlug = new Map(t.map((row) => [row.slug, row]));
      const mergedTypes = courtTypes.map((ct) => {
        const db = dbBySlug.get(ct.slug);
        if (!db) return ct;
        return {
          ...db,
          team_allowed: ct.team_allowed,
          verification_type: ct.verification_type ?? db.verification_type,
          proof_rules: ct.proof_rules ?? db.proof_rules,
        };
      });
      setCourt(c);
      setTypes(mergedTypes);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load court.");
    } finally {
      setLoading(false);
    }
  }, [courtId]);

  const availableSports = useMemo(() => {
    const keys = new Set<SpotSportKey>();
    for (const t of types) {
      const sk = spotSportForRecordSlug(t.slug);
      if (sk) keys.add(sk);
    }
    return EXPLORE_SPOT_SPORTS.filter((s) => s.key === "all" || keys.has(s.key as SpotSportKey));
  }, [types]);

  const recordsForSport = useMemo(
    () => filterRecordTypesBySpotSport(types, sportFilter),
    [types, sportFilter]
  );

  const recordsForFilters = useMemo(
    () => filterRecordTypesByPerspective(recordsForSport, spotBoardMode),
    [recordsForSport, spotBoardMode]
  );

  const formatCounts = useMemo(() => {
    let individual = 0;
    let crew = 0;
    for (const rt of recordsForSport) {
      if (isCrewEligibleRecordType(rt)) crew += 1;
      else individual += 1;
    }
    return { individual, crew };
  }, [recordsForSport]);

  const activeRecord = useMemo(() => {
    const slug =
      selectedRecordSlug && recordsForFilters.some((r) => r.slug === selectedRecordSlug)
        ? selectedRecordSlug
        : recordsForFilters[0]?.slug ?? null;
    if (!slug) return null;
    return types.find((t) => t.slug === slug) ?? null;
  }, [selectedRecordSlug, recordsForFilters, types]);

  const selectableSports = useMemo(
    () => availableSports.filter((s) => s.key !== "all"),
    [availableSports]
  );

  const lbSportLabel =
    sportFilter !== "all" ? spotSportLabel(sportFilter) : selectableSports[0]?.label ?? "Sport";

  const lbCompetitionLabel = activeRecord?.title ?? recordsForFilters[0]?.title ?? "Choose competition";

  useEffect(() => {
    if (!selectedRecordSlug) return;
    if (recordsForFilters.some((r) => r.slug === selectedRecordSlug)) return;
    setSelectedRecordSlug(recordsForFilters[0]?.slug ?? null);
  }, [recordsForFilters, selectedRecordSlug]);

  useEffect(() => {
    if (!highlightRecord || !types.length) return;
    setArenaTab("leaderboard");
    const sport = spotSportForRecordSlug(highlightRecord);
    if (sport) setSportFilter(sport);
    if (types.some((t) => t.slug === highlightRecord)) {
      setSelectedRecordSlug(highlightRecord);
    }
  }, [highlightRecord, types]);

  useEffect(() => {
    if (sportFilter !== "all") return;
    if (selectedRecordSlug) return;
    if (!types.length) return;
    const firstSport = spotSportForRecordSlug(types[0].slug);
    if (firstSport) setSportFilter(firstSport);
  }, [types, sportFilter, selectedRecordSlug]);

  useEffect(() => {
    if (!activeRecord) return;
    void loadBoard(activeRecord.slug, activeRecord.higher_is_better);
  }, [activeRecord?.slug, activeRecord?.higher_is_better, loadBoard]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!userId) {
      setFriendIds([]);
      return;
    }
    let cancelled = false;
    void getFriendIds(userId)
      .then((ids) => {
        if (!cancelled) setFriendIds(ids);
      })
      .catch(() => {
        if (!cancelled) setFriendIds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const primaryType = activeRecord ?? recordsForFilters[0] ?? null;

  const courtSportsLabel = useMemo(() => {
    if (!court) return null;
    const keys = resolveCourtSportKeys(court);
    if (!keys.length) return null;
    return keys.map((k) => spotSportLabel(k)).join(" · ");
  }, [court]);

  useEffect(() => {
    if (!courtId || !primaryType) {
      setLegend(null);
      return;
    }
    let cancelled = false;
    fetchCourtSpotLegend(courtId, {
      recordSlug: primaryType.slug,
      recordTitle: primaryType.title,
      higherIsBetter: primaryType.higher_is_better,
    })
      .then((l) => {
        if (!cancelled) setLegend(l);
      })
      .catch(() => {
        if (!cancelled) setLegend(null);
      });
    return () => {
      cancelled = true;
    };
  }, [courtId, primaryType?.slug, primaryType?.title, primaryType?.higher_is_better]);

  useEffect(() => {
    if (!courtId) return;
    let cancelled = false;
    fetchCourtProofClips(courtId)
      .then((rows) => {
        if (!cancelled) setClips(rows);
      })
      .catch(() => {
        if (!cancelled) setClips([]);
      });
    return () => {
      cancelled = true;
    };
  }, [courtId]);

  const onConfirmArena = async () => {
    if (!userId || !courtId) return;
    setConfirming(true);
    try {
      const res = await confirmCourtLegitimacy(courtId);
      Alert.alert(
        res.verificationStatus === "approved" ? "Arena verified" : "Thanks",
        res.verificationStatus === "approved"
          ? "This arena is now live for competition."
          : `${res.confirmationCount}/3 confirmations — help us verify real spots.`
      );
      await load();
    } catch (e: any) {
      Alert.alert("Could not confirm", e?.message ?? "Try again later.");
    } finally {
      setConfirming(false);
    }
  };

  if (loading && !court) {
    return (
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressSoft(pressed)]}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>Arena</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </View>
    );
  }

  if (err || !court) {
    return (
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressSoft(pressed)]}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>Arena</Text>
          <View style={{ width: 40 }} />
        </View>
        <Text style={styles.err}>{err ?? "Arena not found."}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressSoft(pressed)]}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {court.name}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.spotHero}>
          <Text style={styles.referencePhotosLabel}>{ARENA_REFERENCE_PHOTOS_LABEL}</Text>
          <ArenaReferencePhotos photoPaths={court.photo_paths} arenaName={court.name} />
          <View style={styles.spotHeroBanner}>
            <View style={styles.spotHeroIconWrap}>
              <Ionicons name="location" size={28} color={colors.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.spotHeroKind}>
                {legend ? ARENA_TIER_LABELS[legend.arenaTier] : court.place_kind.replace(/_/g, " ")}
              </Text>
              <Text style={styles.spotHeroName}>{court.name}</Text>
              <Text style={styles.spotHeroMeta}>
                {[court.city, court.state].filter(Boolean).join(", ") || "Unknown area"} ·{" "}
                {court.checkin_radius_m}m check-in
                {courtSportsLabel ? ` · ${courtSportsLabel}` : ""}
                {isPending ? ` · ${ARENA_PENDING_LABEL}` : ""}
              </Text>
            </View>
          </View>

          {isPending ? (
            <View style={styles.pendingBanner}>
              <Ionicons name="hourglass-outline" size={20} color={colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={styles.pendingTitle}>{ARENA_PENDING_LABEL}</Text>
                <Text style={styles.pendingSub}>
                  {legend?.confirmationCount ?? 0}/3 community confirmations needed before this arena goes live.
                  {isCreator ? " Share with locals to confirm." : " Confirm if you've played here."}
                </Text>
              </View>
              {!isCreator && userId ? (
                <Pressable
                  onPress={onConfirmArena}
                  disabled={confirming}
                  style={({ pressed }) => [styles.confirmBtn, confirming && { opacity: 0.6 }, pressSoft(pressed)]}
                >
                  {confirming ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.confirmBtnText}>Confirm</Text>
                  )}
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={styles.arenaTabRow}>
          {ARENA_TABS.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => {
                lightTap();
                setArenaTab(t.key);
              }}
              style={[styles.arenaTabBtn, arenaTab === t.key && styles.arenaTabBtnOn]}
            >
              <Ionicons
                name={t.icon}
                size={14}
                color={arenaTab === t.key ? colors.text : colors.textMuted}
              />
              <Text style={[styles.arenaTabText, arenaTab === t.key && styles.arenaTabTextOn]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        {arenaTab === "activity" ? (
          <View style={styles.tabPanel}>
            {court.description ? <Text style={styles.desc}>{court.description}</Text> : null}
            <Text style={styles.tabPanelLead}>{ARENA_TAB_OVERVIEW_LEAD}</Text>

            {legend ? (
              <View style={styles.spotKingSpotlight}>
                {legend.king.tieAtTop ? (
                  <CrownChip label="Contested crown" sublabel="Tie at the top — break it to claim" variant="contested" />
                ) : legend.king.vacant || !legend.king.holderName ? (
                  <CrownChip label={ARENA_CROWN_OPEN} sublabel="Pull up and claim it" variant="open" />
                ) : (
                  <Pressable
                    onPress={() => {
                      const holderUserId = legend.king.holderUserId;
                      if (!holderUserId) return;
                      if (!friendIdsSet.has(holderUserId)) return;
                      router.push(`/user/${holderUserId}` as Href);
                    }}
                    style={({ pressed }) => [styles.kingSpotlightPress, pressSoft(pressed)]}
                  >
                    <Avatar
                      imageUrl={undefined}
                      name={
                        legend.king.holderUserId && friendIdsSet.has(legend.king.holderUserId)
                          ? legend.king.holderName ?? "?"
                          : "King"
                      }
                      size={52}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.kingSpotlightLabel}>Current king</Text>
                      <Text style={styles.kingSpotlightName}>
                        {legend.king.holderUserId && friendIdsSet.has(legend.king.holderUserId)
                          ? legend.king.holderName
                          : "King"}
                      </Text>
                      {legend.king.heldDays != null ? (
                        <Text style={styles.kingSpotlightRecord}>
                          Reign {legend.king.heldDays} day{legend.king.heldDays === 1 ? "" : "s"}
                          {legend.king.heldDays === 0 ? " · crowned today" : ""}
                        </Text>
                      ) : primaryType ? (
                        <Text style={styles.kingSpotlightRecord}>{primaryType.title}</Text>
                      ) : null}
                    </View>
                    <Ionicons name="ribbon" size={32} color={colors.gold} />
                  </Pressable>
                )}
              </View>
            ) : null}

            {legend && (legend.activeCompetitors.length > 0 || legend.uniqueCompetitors > 0) ? (
              <View style={styles.arenaDiscovery}>
                <View style={styles.arenaDiscoveryHead}>
                  <Ionicons name="people" size={18} color={colors.accentMuted} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.arenaDiscoveryTitle}>{ARENA_PEOPLE_ACTIVE_HERE}</Text>
                    <Text style={styles.arenaDiscoverySub}>
                      {legend.challengersNearTop > 0
                        ? `🔥 ${legend.challengersNearTop} active challenger${legend.challengersNearTop === 1 ? "" : "s"} on the board`
                        : legend.uniqueCompetitors > 0
                          ? `${legend.uniqueCompetitors} competitor${legend.uniqueCompetitors === 1 ? "" : "s"} logged here`
                          : ARENA_DISCOVERY_SUB}
                    </Text>
                  </View>
                </View>

                {legend.activeCompetitors.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.competitorRow}
                  >
                    {legend.activeCompetitors.map((c) => {
                      const isKing = c.userId === legend.king.holderUserId;
                      const canReveal = friendIdsSet.has(c.userId);
                      const displayName = canReveal ? c.name : "Player";
                      return (
                        <Pressable
                          key={c.userId}
                          onPress={() => {
                            if (!canReveal) return;
                            lightTap();
                            router.push(`/user/${c.userId}` as Href);
                          }}
                          style={({ pressed }) => [
                            styles.competitorChip,
                            pressSoft(pressed),
                            !canReveal && { opacity: 0.75 },
                          ]}
                        >
                          <Avatar name={displayName} size={44} />
                          <Text style={styles.competitorName} numberOfLines={1}>
                            {displayName}
                          </Text>
                          <Text style={styles.competitorMeta}>
                            {isKing ? "👑 King" : `#${c.rank}`}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : null}

                <View style={styles.discoveryActionsRow}>
                  <Pressable
                    onPress={() => {
                      lightTap();
                      setArenaTab("leaderboard");
                    }}
                    style={({ pressed }) => [styles.discoveryActionChip, pressSoft(pressed)]}
                  >
                    <Ionicons name="podium-outline" size={14} color={colors.gold} />
                    <Text style={styles.discoveryActionText}>{ARENA_VIEW_LEADERBOARD}</Text>
                  </Pressable>
                  {clips.length > 0 ? (
                    <Pressable
                      onPress={() => {
                        lightTap();
                        setArenaTab("clips");
                      }}
                      style={({ pressed }) => [styles.discoveryActionChip, pressSoft(pressed)]}
                    >
                      <Ionicons name="videocam-outline" size={14} color={colors.accentMuted} />
                      <Text style={styles.discoveryActionText}>
                        {ARENA_CLIPS_LINK} ({clips.length})
                      </Text>
                    </Pressable>
                  ) : null}
                  {isApproved ? (
                    <Pressable
                      onPress={() => {
                        lightTap();
                        router.push("/(tabs)/create" as Href);
                      }}
                      style={({ pressed }) => [styles.discoveryActionChip, pressSoft(pressed)]}
                    >
                      <Ionicons name="flash-outline" size={14} color={colors.accentMuted} />
                      <Text style={styles.discoveryActionText}>{ARENA_OPEN_MATCHES_LINK}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null}

            {legend?.crownDiffersFromAllTime && legend.allTimeLeader.name ? (
              <View style={styles.dramaBanner}>
                <Ionicons name="flash" size={18} color={colors.gold} />
                <Text style={styles.dramaText}>
                  👑 {legend.king.holderName} holds the crown — {legend.allTimeLeader.name} has the best all-time score.
                </Text>
              </View>
            ) : null}

            {legend?.discoveredByName ? (
              <Text style={styles.discoveredBy}>Discovered by {legend.discoveredByName}</Text>
            ) : null}

            <View style={styles.spotCtaRow}>
              {isApproved ? (
                <>
                  <Pressable
                    onPress={() => {
                      lightTap();
                      router.push(
                        primaryType
                          ? (`/courts/${courtId}/submit?record=${encodeURIComponent(primaryType.slug)}` as Href)
                          : (`/courts/${courtId}/submit` as Href)
                      );
                    }}
                    style={({ pressed }) => [styles.spotCtaPrimary, pressSoft(pressed)]}
                  >
                    <Ionicons name="clipboard" size={18} color="#fff" />
                    <Text style={styles.spotCtaPrimaryText}>Post result</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      lightTap();
                      router.push(`/(tabs)/create` as Href);
                    }}
                    style={({ pressed }) => [styles.spotCtaSecondary, pressSoft(pressed)]}
                  >
                    <Ionicons name="flash" size={18} color={colors.accent} />
                    <Text style={styles.spotCtaSecondaryText}>{ARENA_CHALLENGE_KING}</Text>
                  </Pressable>
                </>
              ) : (
                <View style={styles.pendingCta}>
                  <Text style={styles.pendingCtaText}>
                    Rankings unlock after verification. {isCreator ? "Get 3 nearby confirmations." : "Confirm this arena if it's legit."}
                  </Text>
                </View>
              )}
            </View>

            {legend ? (
              <View style={styles.legendGrid}>
                <View style={styles.legendStat}>
                  <Text style={styles.legendStatValue}>{legend.attemptsTotal}</Text>
                  <Text style={styles.legendStatLabel}>Total matches</Text>
                </View>
                <View style={styles.legendStat}>
                  <Text style={styles.legendStatValue}>{legend.uniqueCompetitors}</Text>
                  <Text style={styles.legendStatLabel}>Competitors</Text>
                </View>
                <View style={styles.legendStat}>
                  <Text style={styles.legendStatValue}>{legend.attempts24h}</Text>
                  <Text style={styles.legendStatLabel}>Today</Text>
                </View>
                <View style={styles.legendStat}>
                  <Text style={styles.legendStatValue}>{legend.lastActivityLabel ?? "—"}</Text>
                  <Text style={styles.legendStatLabel}>Last activity</Text>
                </View>
              </View>
            ) : null}
            <Text style={styles.tabPanelHint}>{ARENA_HISTORY_SOON}</Text>
            <Pressable
              onPress={() => router.push(`/(tabs)/feed` as Href)}
              style={({ pressed }) => [styles.pulseLinkCard, pressSoft(pressed)]}
            >
              <Ionicons name="pulse" size={20} color={colors.accent} />
              <Text style={styles.pulseLinkText}>See dethronings & challenges on {PULSE_TAB_TITLE}</Text>
            </Pressable>
          </View>
        ) : null}

        {arenaTab === "clips" ? (
          <View style={styles.tabPanel}>
            {clips.length === 0 ? (
              <Text style={styles.tabEmpty}>No proof clips yet — post a TikTok, Reel, or video with your result.</Text>
            ) : (
              clips.map((c) => (
                <View key={c.id} style={styles.clipRow}>
                  <Ionicons name="videocam" size={18} color={colors.gold} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.clipMeta}>
                      {c.verification_level === "verified" ? "Verified match" : "Match"} · {c.record_type_slug.replace(/_/g, " ")}
                    </Text>
                    {c.proof_social_url ? (
                      <Text style={styles.clipUrl} numberOfLines={2}>
                        {c.proof_social_url}
                      </Text>
                    ) : (
                      <Text style={styles.clipUrl}>Media proof attached</Text>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        ) : null}

        {arenaTab === "leaderboard" && types.length > 0 ? (
          <View style={styles.tabPanel}>
            <View style={styles.lbFilterCard}>
              <View style={styles.lbFilterRow}>
                <Text style={styles.lbFilterLabel}>{ARENA_FILTER_FORMAT}</Text>
                <View style={styles.lbFormatSegment}>
                  <Pressable
                    onPress={() => {
                      lightTap();
                      setSpotBoardMode("individual");
                      setSelectedRecordSlug(null);
                    }}
                    style={[styles.lbFormatBtn, spotBoardMode === "individual" && styles.lbFormatBtnOn]}
                  >
                    <Text
                      style={[styles.lbFormatBtnText, spotBoardMode === "individual" && styles.lbFormatBtnTextOn]}
                    >
                      Solo
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      lightTap();
                      setSpotBoardMode("crew");
                      setSelectedRecordSlug(null);
                    }}
                    style={[styles.lbFormatBtn, spotBoardMode === "crew" && styles.lbFormatBtnOn]}
                  >
                    <Text style={[styles.lbFormatBtnText, spotBoardMode === "crew" && styles.lbFormatBtnTextOn]}>
                      Crew
                    </Text>
                  </Pressable>
                </View>
              </View>

              {selectableSports.length > 1 ? (
                <Pressable
                  onPress={() => {
                    lightTap();
                    setLbPicker("sport");
                  }}
                  style={({ pressed }) => [styles.lbFilterRow, styles.lbFilterRowTappable, pressSoft(pressed)]}
                >
                  <Text style={styles.lbFilterLabel}>{EXPLORE_FILTER_SPORT}</Text>
                  <View style={styles.lbFilterValueRow}>
                    <Text style={styles.lbFilterValue} numberOfLines={1}>
                      {lbSportLabel}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </View>
                </Pressable>
              ) : null}

              <Pressable
                onPress={() => {
                  if (recordsForFilters.length === 0) return;
                  lightTap();
                  setLbPicker("competition");
                }}
                style={({ pressed }) => [
                  styles.lbFilterRow,
                  styles.lbFilterRowLast,
                  styles.lbFilterRowTappable,
                  recordsForFilters.length === 0 && styles.lbFilterRowDisabled,
                  pressSoft(pressed),
                ]}
              >
                <Text style={styles.lbFilterLabel}>{ARENA_FILTER_COMPETITION}</Text>
                <View style={styles.lbFilterValueRow}>
                  <Text
                    style={[styles.lbFilterValue, recordsForFilters.length === 0 && styles.lbFilterValueMuted]}
                    numberOfLines={1}
                  >
                    {lbCompetitionLabel}
                  </Text>
                  {recordsForFilters.length > 0 ? (
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  ) : null}
                </View>
              </Pressable>
            </View>

            {recordsForFilters.length === 0 ? (
              <View style={styles.filterEmptyBlock}>
                <Text style={styles.tabEmpty}>
                  {spotBoardMode === "crew"
                    ? formatCounts.crew === 0
                      ? "No crew challenges at this arena — this spot may not support squad formats (3v3, 5v5, etc.)."
                      : "No crew challenges for this sport — try another sport or switch to Individual."
                    : formatCounts.individual === 0
                      ? "No individual challenges at this arena."
                      : "No individual challenges for this sport — try another sport or switch to Crew."}
                </Text>
                {spotBoardMode === "crew" && formatCounts.individual > 0 ? (
                  <Pressable
                    onPress={() => {
                      lightTap();
                      setSpotBoardMode("individual");
                      setSelectedRecordSlug(null);
                    }}
                    style={({ pressed }) => [styles.filterEmptyBtn, pressSoft(pressed)]}
                  >
                    <Text style={styles.filterEmptyBtnText}>View solo rankings</Text>
                  </Pressable>
                ) : null}
                {spotBoardMode === "individual" && formatCounts.crew > 0 ? (
                  <Pressable
                    onPress={() => {
                      lightTap();
                      setSpotBoardMode("crew");
                      setSelectedRecordSlug(null);
                    }}
                    style={({ pressed }) => [styles.filterEmptyBtn, pressSoft(pressed)]}
                  >
                    <Text style={styles.filterEmptyBtnText}>View crew rankings</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {activeRecord ? (() => {
              const rt = activeRecord;
              const isCrew = spotBoardMode === "crew";
              const pack = isCrew ? boardsTeam[rt.slug] : boardsUser[rt.slug];
              const rows = pack?.rows ?? [];
              const slot = pack?.slot ?? null;
              const rowKey = (r: KingLeaderboardRow) => (r.teamId ? `t:${r.teamId}` : `u:${r.userId}`);
              const crownUserId = !isCrew ? slot?.badge_holder_user_id : null;
              const crownTeamId = isCrew ? slot?.badge_holder_team_id : null;

              return (
                <View style={styles.lbPanel}>
                  <View style={styles.lbPanelHead}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lbPanelTitle}>{rt.title}</Text>
                    </View>
                    <Pressable
                      onPress={() => {
                        lightTap();
                        router.push(`/courts/${courtId}/submit?record=${encodeURIComponent(rt.slug)}` as Href);
                      }}
                      style={({ pressed }) => [styles.attemptBtn, pressSoft(pressed)]}
                    >
                      <Text style={styles.attemptBtnText}>Submit</Text>
                    </Pressable>
                  </View>

                  {slot?.tie_at_top ? (
                    <View style={styles.tieBanner}>
                      <Ionicons name="git-branch-outline" size={18} color={colors.warning} />
                      <Text style={styles.tieText}>Tied at #1 — crown unsettled.</Text>
                    </View>
                  ) : null}

                  <View style={styles.lbTable}>
                    <View style={styles.lbTableHeader}>
                      <Text style={[styles.lbTableHeaderText, styles.lbColRank]}>#</Text>
                      <Text style={[styles.lbTableHeaderText, styles.lbColName]}>{isCrew ? "Crew" : "Player"}</Text>
                      <Text style={[styles.lbTableHeaderText, styles.lbColScore]}>Score</Text>
                    </View>

                    {rows.length === 0 ? (
                      <View style={styles.lbEmptyWrap}>
                        <View style={styles.lbEmptyIcon}>
                          <Ionicons name="trophy-outline" size={32} color={colors.gold} />
                        </View>
                        <Text style={styles.lbEmptyTitle}>No scores yet</Text>
                        <Text style={styles.lbEmptySub}>Be the first to post a result for this competition.</Text>
                      </View>
                    ) : (
                      rows.slice(0, 25).map((r, idx) => {
                        const isCrown =
                          (!isCrew && crownUserId && r.userId === crownUserId) ||
                          (isCrew && crownTeamId && r.teamId === crownTeamId);
                        return (
                          <Pressable
                            key={rowKey(r)}
                            onPress={() =>
                              isCrew && r.teamId
                                ? router.push(`/team/${r.teamId}` as Href)
                                : r.userId && router.push(`/user/${r.userId}` as Href)
                            }
                            style={({ pressed }) => [...leaderboardRowStyles(idx), pressSoft(pressed)]}
                          >
                            <Text style={styles.lbRank}>#{r.rankLabel}</Text>
                            <Avatar imageUrl={r.avatarUrl} name={r.displayName || r.username || "?"} size={40} />
                            <View style={styles.lbNameCol}>
                              <Text style={styles.lbName} numberOfLines={1}>
                                {r.displayName || r.username || (isCrew ? "Crew" : "Player")}
                              </Text>
                              {isCrown ? <Text style={styles.lbCrownTag}>Crown holder</Text> : null}
                            </View>
                            <Text style={styles.lbScore}>{formatKingScore(r.scoreValue, rt.slug)}</Text>
                          </Pressable>
                        );
                      })
                    )}
                  </View>
                </View>
              );
            })() : null}

            <Text style={styles.lbFootnote}>{CROWN_VS_ALLTIME_HINT}</Text>
          </View>
        ) : arenaTab === "leaderboard" ? (
          <Text style={styles.tabEmpty}>No competitions available for this place type yet.</Text>
        ) : null}
      </ScrollView>

      <Modal visible={lbPicker !== null} transparent animationType="slide" onRequestClose={() => setLbPicker(null)}>
        <View style={styles.lbPickerRoot}>
          <Pressable style={styles.lbPickerBackdrop} onPress={() => setLbPicker(null)} />
          <View style={styles.lbPickerSheet}>
            <View style={styles.lbPickerHeader}>
              <Text style={styles.lbPickerTitle}>
                {lbPicker === "sport" ? EXPLORE_FILTER_SPORT : ARENA_FILTER_COMPETITION}
              </Text>
              <Pressable onPress={() => setLbPicker(null)} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            <ScrollView style={styles.lbPickerList} keyboardShouldPersistTaps="handled">
              {lbPicker === "sport"
                ? selectableSports.map((s) => {
                    const selected = sportFilter === s.key;
                    return (
                      <Pressable
                        key={s.key}
                        onPress={() => {
                          lightTap();
                          setSportFilter(s.key);
                          setSelectedRecordSlug(null);
                          setLbPicker(null);
                        }}
                        style={[styles.lbPickerRow, selected && styles.lbPickerRowOn]}
                      >
                        <Text style={[styles.lbPickerRowText, selected && styles.lbPickerRowTextOn]}>{s.label}</Text>
                        {selected ? <Ionicons name="checkmark" size={20} color={colors.accent} /> : null}
                      </Pressable>
                    );
                  })
                : recordsForFilters.length === 0 ? (
                    <Text style={styles.lbPickerEmpty}>
                      {spotBoardMode === "crew"
                        ? "No crew competitions for this sport."
                        : "No solo competitions for this sport."}
                    </Text>
                  ) : (
                    recordsForFilters.map((rt) => {
                      const selected = activeRecord?.slug === rt.slug;
                      return (
                        <Pressable
                          key={rt.slug}
                          onPress={() => {
                            lightTap();
                            setSelectedRecordSlug(rt.slug);
                            setLbPicker(null);
                          }}
                          style={[styles.lbPickerRow, selected && styles.lbPickerRowOn]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.lbPickerRowText, selected && styles.lbPickerRowTextOn]}>
                              {rt.title}
                            </Text>
                            {rt.description ? (
                              <Text style={styles.lbPickerRowSub} numberOfLines={2}>
                                {rt.description}
                              </Text>
                            ) : null}
                          </View>
                          {selected ? <Ionicons name="checkmark" size={20} color={colors.accent} /> : null}
                        </Pressable>
                      );
                    })
                  )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.md,
  },
  backBtn: { padding: 8, marginLeft: -8 },
  title: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800", color: colors.text },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  err: { color: colors.danger, marginTop: 24 },
  disclaimer: {
    fontSize: 11,
    color: colors.textTertiary,
    marginBottom: 8,
    lineHeight: 16,
  },
  spotHero: {
    marginBottom: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    overflow: "hidden",
  },
  referencePhotosLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.55,
    textTransform: "uppercase",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  spotHeroBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    backgroundColor: colors.goldSurfaceFaint,
  },
  spotHeroIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.goldSurface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.goldBorder,
  },
  spotHeroKind: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  spotHeroName: { color: colors.text, fontSize: 20, fontWeight: "900", marginTop: 2 },
  spotHeroMeta: { color: colors.textMuted, fontSize: 12, marginTop: 4, textTransform: "capitalize" },
  pendingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 14,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.warningSurface,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  pendingTitle: { color: colors.text, fontWeight: "800", fontSize: 14 },
  pendingSub: { color: colors.textSecondary, fontSize: 12, marginTop: 4, lineHeight: 16 },
  confirmBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  confirmBtnText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  pendingCta: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pendingCtaText: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, textAlign: "center" },
  dramaBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginHorizontal: 14,
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.goldSurface,
    borderWidth: 1,
    borderColor: colors.goldBorder,
  },
  dramaText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  arenaTabRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 16,
    marginBottom: 12,
  },
  arenaTabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  arenaTabBtnOn: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSurface,
  },
  arenaTabText: { color: colors.textMuted, fontWeight: "700", fontSize: 11 },
  arenaTabTextOn: { color: colors.text },
  tabPanel: { marginBottom: 16 },
  tabPanelLead: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  tabPanelHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginBottom: 12 },
  tabEmpty: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  filterEmptyBlock: { marginBottom: 12, gap: 10 },
  filterEmptyBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.accentMuted,
  },
  filterEmptyBtnText: { color: colors.accent, fontSize: 14, fontWeight: "700" },
  lbFilterCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
    overflow: "hidden",
  },
  lbFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  lbFilterRowTappable: {},
  lbFilterRowLast: { borderBottomWidth: 0 },
  lbFilterRowDisabled: { opacity: 0.55 },
  lbFilterLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    minWidth: 72,
  },
  lbFilterValueRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  lbFilterValue: { color: colors.text, fontSize: 14, fontWeight: "800", flexShrink: 1, textAlign: "right" },
  lbFilterValueMuted: { color: colors.textMuted, fontWeight: "600" },
  lbFormatSegment: {
    flexDirection: "row",
    flex: 1,
    justifyContent: "flex-end",
    gap: 6,
  },
  lbFormatBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lbFormatBtnOn: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSurface,
  },
  lbFormatBtnText: { color: colors.textSecondary, fontWeight: "700", fontSize: 12 },
  lbFormatBtnTextOn: { color: colors.text },
  lbPickerRoot: { flex: 1, justifyContent: "flex-end" },
  lbPickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  lbPickerSheet: {
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 28,
    maxHeight: "58%",
    borderWidth: 1,
    borderColor: colors.border,
  },
  lbPickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  lbPickerTitle: { color: colors.text, fontWeight: "900", fontSize: 16 },
  lbPickerList: { maxHeight: 360 },
  lbPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 10,
  },
  lbPickerRowOn: { backgroundColor: colors.accentSurface },
  lbPickerRowText: { color: colors.text, fontSize: 15, fontWeight: "600" },
  lbPickerRowTextOn: { fontWeight: "800", color: colors.accentMuted },
  lbPickerRowSub: { color: colors.textMuted, fontSize: 12, marginTop: 3, lineHeight: 16 },
  lbPickerEmpty: {
    color: colors.textMuted,
    fontSize: 14,
    paddingHorizontal: space.lg,
    paddingVertical: 20,
    lineHeight: 20,
  },
  lbPanel: {
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  lbPanelHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  lbPanelTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
  lbTable: { paddingBottom: 4 },
  lbTableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.surfaceMuted,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  lbTableHeaderText: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  lbColRank: { width: 44 },
  lbColName: { flex: 1 },
  lbColScore: { minWidth: 72, textAlign: "right" },
  lbEmptyWrap: {
    alignItems: "center",
    paddingVertical: space.xl,
    paddingHorizontal: space.lg,
  },
  lbEmptyIcon: {
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
  lbEmptyTitle: { color: colors.text, fontWeight: "800", fontSize: 16, marginBottom: space.sm },
  lbEmptySub: { color: colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: "center" },
  lbNameCol: { flex: 1, marginLeft: 10 },
  lbCrownTag: { color: colors.gold, fontSize: 11, fontWeight: "700", marginTop: 2 },
  lbFootnote: {
    color: colors.textTertiary,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 12,
    textAlign: "center",
  },
  arenaDiscovery: {
    marginHorizontal: 14,
    marginTop: 12,
    marginBottom: 4,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  arenaDiscoveryHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 12,
  },
  arenaDiscoveryTitle: { color: colors.text, fontWeight: "900", fontSize: 15 },
  arenaDiscoverySub: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4, fontWeight: "600" },
  competitorRow: { gap: 10, paddingBottom: 12 },
  competitorChip: {
    width: 78,
    alignItems: "center",
    gap: 4,
  },
  competitorName: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
    maxWidth: 76,
  },
  competitorMeta: { color: colors.textMuted, fontSize: 10, fontWeight: "700" },
  discoveryActionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  discoveryActionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  discoveryActionText: { color: colors.textSecondary, fontSize: 11, fontWeight: "800" },
  pulseLinkCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    marginTop: 8,
  },
  pulseLinkText: { flex: 1, color: colors.text, fontWeight: "700", fontSize: 14 },
  clipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    marginBottom: 8,
    borderRadius: 10,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clipMeta: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  clipUrl: { color: colors.accentMuted, fontSize: 13, marginTop: 4 },
  spotKingSpotlight: { paddingHorizontal: 14, paddingTop: 12 },
  kingSpotlightPress: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.goldSurface,
    borderWidth: 1,
    borderColor: colors.goldBorder,
  },
  kingSpotlightLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  kingSpotlightName: { color: colors.text, fontSize: 18, fontWeight: "900", marginTop: 2 },
  kingSpotlightRecord: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  legendGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 14,
    paddingTop: 12,
    gap: 8,
  },
  legendStat: {
    width: "47%",
    flexGrow: 1,
    padding: 10,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  legendStatValue: { color: colors.text, fontSize: 16, fontWeight: "900" },
  legendStatLabel: { color: colors.textMuted, fontSize: 11, marginTop: 2, fontWeight: "600" },
  discoveredBy: {
    color: colors.textTertiary,
    fontSize: 12,
    paddingHorizontal: 14,
    paddingTop: 8,
    fontStyle: "italic",
  },
  spotCtaRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  spotCtaPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.accent,
  },
  spotCtaPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  spotCtaSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  spotCtaSecondaryText: { color: colors.text, fontWeight: "800", fontSize: 14 },
  arenaLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 4,
  },
  arenaLinkText: { color: colors.accentMuted, fontSize: 13, fontWeight: "700" },
  recordsSectionTitle: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  crownOpenBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "rgba(16,185,129,0.1)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.35)",
    marginBottom: 12,
  },
  crownOpenText: { color: colors.success, fontSize: 13, fontWeight: "800", flex: 1 },
  kingHeld: { color: colors.gold, fontSize: 11, fontWeight: "700", marginTop: 2 },
  desc: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 8 },
  competeLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 16,
  },
  competeLinkText: { flex: 1, color: colors.text, fontWeight: "800", fontSize: 14 },
  applyFooterLink: { paddingVertical: 16, alignItems: "center" },
  applyFooterLinkText: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
  subSectionTitle: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  teamHint: { color: colors.textMuted, fontSize: 11, marginBottom: 10, lineHeight: 16 },
  card: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 14,
  },
  cardHighlight: {
    borderColor: colors.accent,
    borderWidth: 2,
    shadowColor: colors.accent,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 12 },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  cardSub: { color: colors.textMuted, fontSize: 12, marginTop: 4, lineHeight: 16 },
  attemptBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  attemptBtnText: { color: colors.text, fontWeight: "800", fontSize: 13 },
  tieBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: colors.warningSurface,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  tieText: { color: colors.textSecondary, fontSize: 12, flex: 1, lineHeight: 17 },
  kingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: colors.goldSurface,
    borderWidth: 1,
    borderColor: colors.goldBorderSoft,
    marginBottom: 12,
  },
  kingLabel: { color: colors.textSecondary, fontSize: 12, flex: 1 },
  kingScore: { color: colors.gold, fontWeight: "900", fontSize: 16 },
  kingName: { color: colors.text, fontWeight: "700", maxWidth: 120 },
  emptyKing: { color: colors.textMuted, fontSize: 13, marginBottom: 12 },
  lbTitle: { color: colors.textTertiary, fontSize: 11, fontWeight: "700", marginBottom: 8, letterSpacing: 0.5 },
  lbEmpty: { color: colors.textMuted },
  lbRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 8,
  },
  lbRowGold: { borderLeftWidth: 3, borderLeftColor: colors.gold, backgroundColor: colors.goldSurfaceMuted },
  lbRowSilver: {
    borderLeftWidth: 3,
    borderLeftColor: colors.podiumSilver,
    backgroundColor: colors.podiumSilverSurface,
  },
  lbRowBronze: {
    borderLeftWidth: 3,
    borderLeftColor: colors.podiumBronze,
    backgroundColor: colors.podiumBronzeSurface,
  },
  lbRank: { minWidth: 40, color: colors.textMuted, fontWeight: "800" },
  lbName: { color: colors.text, fontWeight: "700" },
  lbScore: { color: colors.accentMuted, fontWeight: "900", fontSize: 15, minWidth: 72, textAlign: "right" },
});
