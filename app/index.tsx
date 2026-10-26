// app/index.tsx
import { Redirect } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { useAuthStore } from "../lib/data/authStore";
import { colors } from "../lib/theme/colors";

const BOOT_HINT_MS = 8_000;

export default function Index() {
  const initialized = useAuthStore((s) => s.initialized);
  const user = useAuthStore((s) => s.user);
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const [showBootHint, setShowBootHint] = useState(false);

  useEffect(() => {
    if (initialized) {
      setShowBootHint(false);
      return;
    }
    const t = setTimeout(() => setShowBootHint(true), BOOT_HINT_MS);
    return () => clearTimeout(t);
  }, [initialized]);

  // Wait for auth to restore from persisted session before deciding where to go
  if (!initialized) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Starting Arena…</Text>
        {showBootHint ? (
          <>
            <Text style={styles.hint}>
              Taking a while? Your phone may not be loading the JS bundle from your PC.
              {"\n"}• Same Wi‑Fi, not mobile data
              {"\n"}• iPhone: Settings → Arena → Local Network → ON
              {"\n"}• Browser test: http://YOUR_PC_IP:8081/status
              {"\n"}• In Arena dev app, connect manually: exp://YOUR_PC_IP:8081
            </Text>
            <Pressable style={styles.retryBtn} onPress={() => void restoreSession()}>
              <Text style={styles.retryText}>Retry connection</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    );
  }

  // Not logged in → go to login
  if (!user?.id) {
    return <Redirect href="/auth/login" />;
  }

  // Logged in → Explore (spots & territory) is the product home
  return <Redirect href="/(tabs)/leaderboards" />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  loadingText: { color: colors.textMuted, marginTop: 14, fontWeight: "700" },
  hint: {
    color: colors.textTertiary,
    marginTop: 20,
    textAlign: "center",
    lineHeight: 20,
    fontSize: 13,
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
  retryText: { color: colors.text, fontWeight: "800" },
});
