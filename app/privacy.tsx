// app/privacy.tsx - Privacy policy (summary)
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function PrivacyScreen() {
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
        <Text style={styles.title}>Privacy policy</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.heading}>How we handle your data</Text>
        <Text style={styles.body}>
          We store your account info (email, username, display name), challenge history, wallet balances, and orders in
          Supabase so the app can work. Payments are processed by Stripe; we never see your full card details.
        </Text>

        <Text style={styles.heading}>What we use it for</Text>
        <Text style={styles.body}>
          Data is used to run the app (challenges, feed, wallet, shop), send important notifications, and keep the
          platform safe. We don&apos;t sell your data to third parties for ads.
        </Text>

        <Text style={styles.heading}>Your choices</Text>
        <Text style={styles.body}>
          You can update your profile in Settings, control push notifications, and delete your account from the Danger
          zone to remove your data from the app.
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

