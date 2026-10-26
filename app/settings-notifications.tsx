// app/settings-notifications.tsx - Push notifications settings
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { isRunningInExpoGo } from "expo";
import React, { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../lib/theme/colors";
import { pressSoftIcon, pressSubtle } from "../lib/ui/pressableStyles";

type PermStatus = "granted" | "denied" | "undetermined";

const isExpoGo = isRunningInExpoGo();

export default function SettingsNotificationsScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<PermStatus>("undetermined");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (isExpoGo) return;
    const Notifications = await import("expo-notifications");
    const { status: s } = await Notifications.getPermissionsAsync();
    setStatus(s as PermStatus);
  };

  useEffect(() => {
    load();
  }, []);

  const handleEnable = async () => {
    if (isExpoGo) return;
    setLoading(true);
    try {
      const Notifications = await import("expo-notifications");
      const { status: s } = await Notifications.requestPermissionsAsync();
      setStatus(s as PermStatus);
    } finally {
      setLoading(false);
    }
  };

  const openSystemSettings = async () => {
    try {
      // Best-effort: this opens app settings on most platforms
      await Linking.openSettings();
    } catch {
      // ignore
    }
  };

  const statusLabel = isExpoGo
    ? "N/A (use a development build for push)"
    : status === "granted"
      ? "On"
      : status === "denied"
        ? "Off (blocked in system settings)"
        : "Not decided yet";

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressSoftIcon(pressed)]}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Push notifications</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.label}>Status</Text>
        <Text style={styles.status}>{statusLabel}</Text>

        <Text style={styles.body}>
          In-app: tap the bell icon to see your notification history (likes, comments, challenge updates, seller
          updates). Push: when enabled, you get device alerts for the same events when the app is in the background.
        </Text>
        <Text style={styles.body}>
          You may need a development build (not Expo Go) for push to work on device. You can change permission
          anytime in system settings.
        </Text>

        <Pressable
          onPress={handleEnable}
          disabled={loading || isExpoGo}
          style={({ pressed }) => [styles.primaryBtn, pressed && !loading && { opacity: 0.9 }]}
        >
          <Text style={styles.primaryBtnText}>
            {status === "granted" ? "Re-check permissions" : loading ? "Checking…" : "Enable notifications"}
          </Text>
        </Pressable>

        <Pressable
          onPress={openSystemSettings}
          style={({ pressed }) => [styles.secondaryBtn, pressSubtle(pressed)]}
        >
          <Text style={styles.secondaryBtnText}>Open system settings</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  backBtn: { marginRight: 16 },
  title: { flex: 1, fontSize: 20, fontWeight: "800", color: colors.text },
  content: { flex: 1, padding: 20 },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  status: { color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 4, marginBottom: 16 },
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 24 },
  primaryBtn: {
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  primaryBtnText: { color: colors.text, fontSize: 16, fontWeight: "700" },
  secondaryBtn: { marginTop: 16, alignItems: "center" },
  secondaryBtnText: { color: colors.actionBlue, fontSize: 14, fontWeight: "600" },
});

