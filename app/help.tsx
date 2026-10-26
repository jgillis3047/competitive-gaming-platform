// app/help.tsx - Help & FAQ
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function HelpScreen() {
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
        <Text style={styles.title}>Help & FAQ</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.question}>How do I create a challenge?</Text>
        <Text style={styles.answer}>
          Go to the Create tab, pick a game type, set entry fee and rules, then send the link or invite opponents from
          Crews & Leagues.
        </Text>

        <Text style={styles.question}>How do wallet funds work?</Text>
        <Text style={styles.answer}>
          Wallet balances are shown in real USD and can be topped up with Stripe. Shop purchases are processed directly
          with real money.
        </Text>

        <Text style={styles.question}>What happens if a challenge expires?</Text>
        <Text style={styles.answer}>
          Open challenges that never start will be automatically expired and entry fees refunded when possible.
        </Text>

        <Text style={styles.question}>How do I contact support?</Text>
        <Text style={styles.answer}>
          Use the Report a problem option in Settings to email us with details and screenshots.
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
  question: { color: "#fff", fontSize: 16, fontWeight: "800", marginTop: 12, marginBottom: 4 },
  answer: { color: "rgba(255,255,255,0.75)", fontSize: 14, lineHeight: 20 },
});

