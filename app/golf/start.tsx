// app/golf/start.tsx
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import VisionScreenHeader from "../components/VisionScreenHeader";
import { createGolfSession, golfFormatLabel } from "../../lib/backend/golfSession";
import type { GolfFormat } from "../../lib/models/visionTypes";
import { useAuthStore } from "../../lib/data/authStore";
import ScreenCanvas from "../../lib/ui/ScreenCanvas";
import { colors } from "../../lib/theme/colors";

const FORMATS: GolfFormat[] = [
  "stroke_play",
  "match_play",
  "longest_drive",
  "closest_to_pin",
  "putting",
  "range",
];

const HOLE_OPTIONS = [9, 18];

export default function GolfStartScreen() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);

  const [courseName, setCourseName] = useState("");
  const [format, setFormat] = useState<GolfFormat>("stroke_play");
  const [holes, setHoles] = useState(18);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    if (!userId) return;
    const name = courseName.trim();
    if (name.length < 2) {
      Alert.alert("Course name", "Enter the course name.");
      return;
    }

    setBusy(true);
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const pos = await Location.getCurrentPositionAsync({});
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      }

      const session = await createGolfSession({
        createdBy: userId,
        courseName: name,
        courseLat: lat,
        courseLng: lng,
        holes,
        format,
      });

      router.replace(`/golf/${session.id}/checkin` as Href);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not start round.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenCanvas>
      <VisionScreenHeader title="New Round" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Course name</Text>
        <TextInput
          style={styles.input}
          placeholder="TPC Las Vegas"
          placeholderTextColor={colors.textMuted}
          value={courseName}
          onChangeText={setCourseName}
        />

        <Text style={styles.label}>Format</Text>
        <View style={styles.chipRow}>
          {FORMATS.map((f) => (
            <Pressable
              key={f}
              onPress={() => setFormat(f)}
              style={[styles.chip, format === f && styles.chipOn]}
            >
              <Text style={[styles.chipText, format === f && styles.chipTextOn]}>
                {golfFormatLabel(f)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Holes</Text>
        <View style={styles.chipRow}>
          {HOLE_OPTIONS.map((h) => (
            <Pressable
              key={h}
              onPress={() => setHoles(h)}
              style={[styles.chip, holes === h && styles.chipOn]}
            >
              <Text style={[styles.chipText, holes === h && styles.chipTextOn]}>{h}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable onPress={start} disabled={busy} style={[styles.btn, busy && { opacity: 0.6 }]}>
          {busy ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="golf-outline" size={20} color="#fff" />
              <Text style={styles.btnText}>Start Round</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </ScreenCanvas>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  label: { color: colors.text, fontWeight: "800", marginBottom: 8, marginTop: 12 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.accentTab, backgroundColor: colors.accentChip },
  chipText: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
  chipTextOn: { color: colors.text },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.accentCTA,
    borderRadius: 14,
    padding: 16,
    marginTop: 28,
  },
  btnText: { color: "#fff", fontWeight: "900", fontSize: 16 },
});
