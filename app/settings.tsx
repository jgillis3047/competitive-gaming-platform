// app/settings.tsx - Account & app settings
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "../lib/theme/colors";
import { pressSoftIcon, pressSubtle } from "../lib/ui/pressableStyles";

export default function SettingsScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressSoftIcon(pressed)]}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account & Security</Text>
          <Pressable
            style={({ pressed }) => [styles.row, pressSubtle(pressed)]}
            onPress={() => router.push("/profile")}
          >
            <Ionicons name="person-outline" size={22} color={colors.textSecondary} />
            <Text style={styles.rowText}>Edit profile</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.row, pressSubtle(pressed)]}
            onPress={() => router.push("/settings-change-username")}
          >
            <Ionicons name="at-outline" size={22} color="rgba(255,255,255,0.8)" />
            <Text style={styles.rowText}>Change username</Text>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.4)" />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.row, pressSubtle(pressed)]}
            onPress={() => router.push("/settings-change-password")}
          >
            <Ionicons name="lock-closed-outline" size={22} color="rgba(255,255,255,0.8)" />
            <Text style={styles.rowText}>Change password</Text>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.4)" />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.row, pressSubtle(pressed)]}
            onPress={() => router.push("/settings-change-email" as any)}
          >
            <Ionicons name="mail-outline" size={22} color="rgba(255,255,255,0.8)" />
            <Text style={styles.rowText}>Change email</Text>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.4)" />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.row, pressSubtle(pressed)]}
            onPress={() => router.push("/settings-change-phone" as any)}
          >
            <Ionicons name="call-outline" size={22} color="rgba(255,255,255,0.8)" />
            <Text style={styles.rowText}>Phone number</Text>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.4)" />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.row, pressSubtle(pressed)]}
            onPress={() => router.push("/settings-two-factor" as any)}
          >
            <Ionicons name="shield-checkmark-outline" size={22} color="rgba(255,255,255,0.8)" />
            <Text style={styles.rowText}>Two-factor authentication</Text>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.4)" />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.row, pressSubtle(pressed)]}
            onPress={() => router.push("/wallet")}
          >
            <Ionicons name="wallet-outline" size={22} color="rgba(255,255,255,0.8)" />
            <Text style={styles.rowText}>Wallet</Text>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.4)" />
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy & safety</Text>
          <Pressable
            style={({ pressed }) => [styles.row, pressSubtle(pressed)]}
            onPress={() => router.push("/settings-blocked" as any)}
          >
            <Ionicons name="ban-outline" size={22} color="rgba(255,255,255,0.8)" />
            <Text style={styles.rowText}>Blocked users</Text>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.4)" />
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <Pressable
            style={({ pressed }) => [styles.row, pressSubtle(pressed)]}
            onPress={() => router.push("/settings-notifications" as any)}
          >
            <Ionicons name="notifications-outline" size={22} color="rgba(255,255,255,0.8)" />
            <Text style={styles.rowText}>Push notifications</Text>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.4)" />
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support</Text>
          <Pressable
            style={({ pressed }) => [styles.row, pressSubtle(pressed)]}
            onPress={() => router.push("/help" as any)}
          >
            <Ionicons name="help-circle-outline" size={22} color="rgba(255,255,255,0.8)" />
            <Text style={styles.rowText}>Help & FAQ</Text>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.4)" />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.row, pressSubtle(pressed)]}
            onPress={() => router.push("/report" as any)}
          >
            <Ionicons name="alert-circle-outline" size={22} color="rgba(255,255,255,0.8)" />
            <Text style={styles.rowText}>Report a problem</Text>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.4)" />
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal</Text>
          <Pressable
            style={({ pressed }) => [styles.row, pressSubtle(pressed)]}
            onPress={() => router.push("/privacy" as any)}
          >
            <Ionicons name="document-text-outline" size={22} color="rgba(255,255,255,0.8)" />
            <Text style={styles.rowText}>Privacy policy</Text>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.4)" />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.row, pressSubtle(pressed)]}
            onPress={() => router.push("/terms" as any)}
          >
            <Ionicons name="reader-outline" size={22} color="rgba(255,255,255,0.8)" />
            <Text style={styles.rowText}>Terms of service</Text>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.4)" />
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Danger zone</Text>
          <Pressable
            style={({ pressed }) => [styles.row, pressSubtle(pressed)]}
            onPress={() => router.push("/settings-delete-account" as any)}
          >
            <Ionicons name="trash-outline" size={22} color={colors.danger} />
            <Text style={[styles.rowText, { color: colors.danger }]}>Delete account</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.danger} />
          </Pressable>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
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
    borderBottomColor: colors.border,
  },
  backBtn: { marginRight: 16 },
  title: { flex: 1, fontSize: 20, fontWeight: "800", color: colors.text },
  scroll: { flex: 1 },
  scrollContent: { paddingVertical: 16 },
  section: { marginBottom: 24 },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 8,
    marginHorizontal: 16,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginBottom: 2,
    borderRadius: 12,
    gap: 12,
  },
  rowText: { flex: 1, color: colors.text, fontSize: 16, fontWeight: "600" },
});
