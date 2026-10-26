import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import {
  discoverNearbyCrews,
  discoverNewCrews,
  discoverTrendingCrews,
  type DiscoveryCrew,
} from "../../lib/backend/discovery";
import { CREATE_CREW } from "../../lib/theme/crewCopy";
import { colors } from "../../lib/theme/colors";
import { space } from "../../lib/theme/spacing";
import EmptyState from "../../lib/ui/EmptyState";
import { pressSoft } from "../../lib/ui/pressableStyles";
import { resolveForegroundLatLng } from "../../lib/utils/resolveForegroundLatLng";
import PulseFilterChips from "./PulseFilterChips";
import { PulseCrewRow } from "./PulseDiscoveryRow";

type CrewsFilter = "trending" | "nearby" | "new";

const FILTER_CHIPS = [
  { key: "trending" as const, label: "🔥 Trending" },
  { key: "nearby" as const, label: "📍 Nearby" },
  { key: "new" as const, label: "⭐ New" },
];

const EMPTY_TITLE: Record<CrewsFilter, string> = {
  trending: "No trending crews yet",
  nearby: "No nearby crews yet",
  new: "No new crews yet",
};

export default function PulseCrewsTab() {
  const router = useRouter();
  const [filter, setFilter] = useState<CrewsFilter>("trending");
  const [loading, setLoading] = useState(true);
  const [trending, setTrending] = useState<DiscoveryCrew[]>([]);
  const [nearby, setNearby] = useState<DiscoveryCrew[]>([]);
  const [fresh, setFresh] = useState<DiscoveryCrew[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { lat, lng } = await resolveForegroundLatLng().catch(() => ({ lat: 0, lng: 0 }));
      const hasLoc = lat !== 0 || lng !== 0;
      const [t, n, f] = await Promise.all([
        discoverTrendingCrews(20),
        hasLoc ? discoverNearbyCrews(lat, lng, 20) : Promise.resolve([]),
        discoverNewCrews(20),
      ]);
      setTrending(t);
      setNearby(n);
      setFresh(f);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const crews =
    filter === "trending" ? trending : filter === "nearby" ? nearby : fresh;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.tabTitle}>Crews</Text>
      <PulseFilterChips chips={FILTER_CHIPS} active={filter} onChange={(k) => setFilter(k as CrewsFilter)} />

      {crews.length > 0 ? (
        <>
          {crews.map((c) => (
            <PulseCrewRow
              key={c.id}
              imageUrl={c.avatar_url}
              name={c.name}
              subtitle={`${c.subtitle} · ${c.member_count} member${c.member_count === 1 ? "" : "s"}`}
              onPress={() => router.push(`/team/${c.id}` as any)}
            />
          ))}
          <Pressable
            onPress={() => router.push("/team/create" as any)}
            style={({ pressed }) => [styles.createLink, pressSoft(pressed)]}
          >
            <Text style={styles.createLinkText}>{CREATE_CREW}</Text>
          </Pressable>
        </>
      ) : (
        <EmptyState
          icon={<Ionicons name="people-outline" size={32} color={colors.textMuted} />}
          title={EMPTY_TITLE[filter]}
          subtitle="Create a crew and build your squad — or check another filter above."
          actionLabel={CREATE_CREW}
          onAction={() => router.push("/team/create" as any)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.lg, paddingBottom: space.xl },
  center: { padding: 40, alignItems: "center" },
  tabTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 10,
  },
  createLink: {
    alignItems: "center",
    paddingVertical: 16,
    marginTop: 8,
  },
  createLinkText: {
    color: colors.accentMuted,
    fontSize: 14,
    fontWeight: "800",
  },
});
