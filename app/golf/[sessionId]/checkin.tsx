// app/golf/[sessionId]/checkin.tsx
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import type { Href } from "expo-router";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import VisionScreenHeader from "../../components/VisionScreenHeader";
import { fetchGolfSession, insertGolfProof } from "../../../lib/backend/golfSession";
import { uploadGolfProofMedia } from "../../../lib/backend/mediaService";
import { useAuthStore } from "../../../lib/data/authStore";
import ScreenCanvas from "../../../lib/ui/ScreenCanvas";
import { colors } from "../../../lib/theme/colors";

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function GolfCheckinScreen() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const sid = String(sessionId ?? "");
  const userId = useAuthStore((s) => s.user?.id);

  const [courseName, setCourseName] = useState("");
  const [gpsOk, setGpsOk] = useState<boolean | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!sid) return;
    fetchGolfSession(sid).then((s) => {
      if (s) setCourseName(s.course_name);
    });
  }, [sid]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await fetchGolfSession(sid);
      if (!session?.course_lat || !session?.course_lng) {
        if (!cancelled) setGpsOk(true);
        return;
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        if (!cancelled) setGpsOk(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const dist = haversineM(
        pos.coords.latitude,
        pos.coords.longitude,
        Number(session.course_lat),
        Number(session.course_lng)
      );
      if (!cancelled) setGpsOk(dist < 2000);
    })();
    return () => { cancelled = true; };
  }, [sid]);

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission", "Camera needed.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (!res.canceled && res.assets?.[0]?.uri) setPhotoUri(res.assets[0].uri);
  };

  const continueRound = async () => {
    if (!userId) return;
    setBusy(true);
    try {
      if (photoUri) {
        const up = await uploadGolfProofMedia({ userId, localUri: photoUri, mediaType: "image" });
        await insertGolfProof({
          sessionId: sid,
          uploadedBy: userId,
          proofType: "group_photo",
          storagePath: up.storagePath,
        });
      }
      await insertGolfProof({
        sessionId: sid,
        uploadedBy: userId,
        proofType: "gps_checkin",
        storagePath: null,
      });
      router.replace(`/golf/${sid}/score` as Href);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Check-in failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenCanvas>
      <VisionScreenHeader title="Before You Play" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.course}>{courseName}</Text>

        <View style={styles.card}>
          <Ionicons
            name={gpsOk === true ? "location" : gpsOk === false ? "location-outline" : "hourglass-outline"}
            size={24}
            color={gpsOk === true ? colors.success : gpsOk === false ? colors.heat : colors.textMuted}
          />
          <Text style={styles.cardText}>
            {gpsOk === null
              ? "Checking GPS…"
              : gpsOk
                ? "Location verified at course"
                : "Could not verify course location — you can still continue"}
          </Text>
        </View>

        <Text style={styles.label}>Group photo (optional)</Text>
        <Pressable onPress={takePhoto} style={styles.photoBtn}>
          <Ionicons name="camera-outline" size={22} color={colors.text} />
          <Text style={styles.photoBtnText}>{photoUri ? "Photo attached" : "Take selfie / group photo"}</Text>
        </Pressable>

        <Pressable onPress={continueRound} disabled={busy} style={[styles.btn, busy && { opacity: 0.6 }]}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Continue to Scoring</Text>}
        </Pressable>
      </ScrollView>
    </ScreenCanvas>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  course: { color: colors.text, fontSize: 22, fontWeight: "900", marginBottom: 16 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardText: { flex: 1, color: colors.textSecondary, fontSize: 14 },
  label: { color: colors.text, fontWeight: "800", marginBottom: 8 },
  photoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
  },
  photoBtnText: { color: colors.text, fontWeight: "700" },
  btn: {
    backgroundColor: colors.accentCTA,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "900", fontSize: 16 },
});
