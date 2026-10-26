// app/report.tsx - Report a problem
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { SUPPORT_EMAIL } from "../lib/theme/brand";
import { colors } from "../lib/theme/colors";
import { pressSoft } from "../lib/ui/pressableStyles";

export default function ReportScreen() {
  const router = useRouter();

  const handleEmail = () => {
    const subject = encodeURIComponent("Problem with the app");
    const body = encodeURIComponent("Describe what happened, and include your device + screenshots if possible.");
    const url = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
    Linking.openURL(url).catch(() => {
      // ignore
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons
          name="arrow-back"
          size={24}
          color={colors.text}
          onPress={() => router.back()}
          style={styles.backIcon}
        />
        <Text style={styles.title}>Report a problem</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.body}>
          Found a bug or something that feels off? Send us a quick email with details and we&apos;ll take a look.
        </Text>

        <Pressable
          onPress={handleEmail}
          style={({ pressed }) => [styles.emailBtn, pressSoft(pressed)]}
        >
          <Text style={styles.emailBtnText}>Email support</Text>
        </Pressable>
        <Text style={styles.emailNote}>{SUPPORT_EMAIL}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgFeed },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  backIcon: { marginRight: 16 },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  content: { flex: 1, padding: 20 },
  body: { color: colors.textTertiary, fontSize: 14, lineHeight: 20, marginBottom: 24 },
  emailBtn: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  emailBtnText: { color: colors.text, fontSize: 16, fontWeight: "700" },
  emailNote: {
    marginTop: 12,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
  },
});

