import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import {
  discoverCrownHolders,
  discoverNearbyCompetitors,
  discoverNewPlayers,
  discoverSimilarRating,
  type DiscoveryPlayer,
} from "../../lib/backend/discovery";
import { useAuthStore } from "../../lib/data/authStore";
import { colors } from "../../lib/theme/colors";
import { space } from "../../lib/theme/spacing";
import EmptyState from "../../lib/ui/EmptyState";
import { resolveForegroundLatLng } from "../../lib/utils/resolveForegroundLatLng";
import PulseFilterChips from "./PulseFilterChips";
import { PulsePlayerRow } from "./PulseDiscoveryRow";

type PeopleFilter = "nearby" | "contacts" | "search";

const FILTER_CHIPS = [
  { key: "nearby" as const, label: "Nearby" },
  { key: "contacts" as const, label: "Contacts" },
  { key: "search" as const, label: "Search" },
];

function playerName(p: DiscoveryPlayer) {
  return p.display_name || p.username || "Player";
}

export default function PulsePeopleTab() {
  const router = useRouter();
  const myId = useAuthStore((s) => s.user?.id ?? null);
  const myRating = useAuthStore((s) => s.profile?.rating ?? 1000);

  const [filter, setFilter] = useState<PeopleFilter>("nearby");
  const [loading, setLoading] = useState(true);
  const [nearby, setNearby] = useState<DiscoveryPlayer[]>([]);
  const [newPlayers, setNewPlayers] = useState<DiscoveryPlayer[]>([]);
  const [similar, setSimilar] = useState<DiscoveryPlayer[]>([]);
  const [crowns, setCrowns] = useState<DiscoveryPlayer[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { lat, lng } = await resolveForegroundLatLng().catch(() => ({ lat: 0, lng: 0 }));
      const hasLoc = lat !== 0 || lng !== 0;

      const [nearbyRes, newRes, similarRes, crownRes] = await Promise.all([
        hasLoc ? discoverNearbyCompetitors(lat, lng, myId, 20) : Promise.resolve([]),
        discoverNewPlayers(myId, 12),
        discoverSimilarRating(myRating, myId, 12),
        discoverCrownHolders(myId, 12),
      ]);
      setNearby(nearbyRes);
      setNewPlayers(newRes);
      setSimilar(similarRes);
      setCrowns(crownRes);
    } finally {
      setLoading(false);
    }
  }, [myId, myRating]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleFilterChange = (key: string) => {
    if (key === "contacts") {
      router.push("/referrals" as any);
      return;
    }
    if (key === "search") {
      router.push("/search" as any);
      return;
    }
    setFilter(key as PeopleFilter);
  };

  const players = useMemo(() => {
    if (filter !== "nearby") return [];
    if (nearby.length) return nearby;
    const merged = [...newPlayers, ...similar, ...crowns];
    const seen = new Set<string>();
    return merged.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, [filter, nearby, newPlayers, similar, crowns]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.tabTitle}>People</Text>
      <PulseFilterChips chips={FILTER_CHIPS} active={filter} onChange={handleFilterChange} />

      {players.length > 0 ? (
        players.map((p) => (
          <PulsePlayerRow
            key={p.id}
            imageUrl={p.avatar_url}
            name={playerName(p)}
            subtitle={p.subtitle}
            rating={p.rating}
            onPress={() => router.push(`/user/${p.id}` as any)}
          />
        ))
      ) : (
        <EmptyState
          icon={<Ionicons name="people-outline" size={32} color={colors.textMuted} />}
          title="No one nearby yet"
          subtitle="Search by handle or invite friends — competitors show up when they play at arenas near you."
          actionLabel="Search players"
          onAction={() => router.push("/search" as any)}
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
});
