// app/terms.tsx - Terms of service (summary)
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function TermsScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons
          name="arrow-back"
          size={24}
          color="#fff"
          onPress={() => router.back()}
          style={styles.backIcon}
        />
        <Text style={styles.title}>Terms of service</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.heading}>Using the app</Text>
        <Text style={styles.body}>
          The app is for friendly competition and skill-based games. You agree not to cheat, harass others, or misuse
          VC, challenges, crews, or the shop.
        </Text>

        <Text style={styles.heading}>Virtual currency</Text>
        <Text style={styles.body}>
          VC has no cash value outside the app. Refunds are only issued when challenges are cancelled or as required by
          law. Stripe handles real money payments securely.
        </Text>

        <Text style={styles.heading}>Account & content</Text>
        <Text style={styles.body}>
          We may suspend or remove accounts that break these terms. You are responsible for your activity and content
          in challenges, chat, and crew names.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060a14" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  backIcon: { marginRight: 16 },
  title: { fontSize: 20, fontWeight: "800", color: "#fff" },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 32 },
  heading: { color: "#fff", fontSize: 16, fontWeight: "800", marginTop: 12, marginBottom: 4 },
  body: { color: "rgba(255,255,255,0.75)", fontSize: 14, lineHeight: 20 },
});

