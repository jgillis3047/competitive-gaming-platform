// app/trivia/index.tsx - Trivia entry: Create room / Join room
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import AppHeader from "../components/AppHeader";
import { useAuthStore } from "../../lib/data/authStore";
import { colors } from "../../lib/theme/colors";
import { pressSoft, pressSubtle } from "../../lib/ui/pressableStyles";

export default function TriviaIndexScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  return (
    <View style={styles.container}>
      <AppHeader />
      <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backRow, pressSubtle(pressed)]}>
        <Ionicons name="arrow-back" size={24} color={colors.text} />
        <Text style={styles.backText}>Back</Text>
      </Pressable>
      <View style={styles.content}>
        <View style={styles.hero}>
          <View style={styles.iconWrap}>
            <Ionicons name="bulb" size={48} color={colors.warning} />
          </View>
          <Text style={styles.title}>Group Trivia</Text>
          <Text style={styles.subtitle}>
            Kahoot-style trivia for family nights and bars. Host on a big screen, players answer on their phones.
          </Text>
        </View>

        <Pressable
          onPress={() => (user ? router.push("/trivia/create" as any) : router.replace("/auth/login" as any))}
          style={({ pressed }) => [styles.primaryBtn, pressSoft(pressed)]}
        >
          <Ionicons name="add-circle" size={24} color={colors.text} />
          <Text style={styles.primaryBtnText}>Create room</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push("/trivia/join" as any)}
          style={({ pressed }) => [styles.secondaryBtn, pressSoft(pressed)]}
        >
          <Ionicons name="enter" size={22} color={colors.accent} />
          <Text style={styles.secondaryBtnText}>Join with code</Text>
        </Pressable>

        {!user && (
          <Text style={styles.hint}>Sign in to create a room. Guests can join with a code.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  backText: { color: colors.text, fontSize: 16, fontWeight: "600" },
  content: { paddingHorizontal: 24, paddingTop: 8 },
  hero: {
    alignItems: "center",
    marginBottom: 32,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.amberSurfaceMedium,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: { fontSize: 26, fontWeight: "900", color: colors.text, marginBottom: 8 },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: colors.accent,
    marginBottom: 12,
  },
  primaryBtnPressed: { opacity: 0.9 },
  primaryBtnText: { color: colors.text, fontWeight: "800", fontSize: 17 },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: "rgba(99,102,241,0.2)",
    borderWidth: 2,
    borderColor: colors.accent,
  },
  secondaryBtnPressed: { opacity: 0.9 },
  secondaryBtnText: { color: colors.accent, fontWeight: "800", fontSize: 17 },
  hint: {
    marginTop: 24,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
  },
});
