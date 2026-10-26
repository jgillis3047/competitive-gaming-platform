// app/referrals.tsx
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { getReferralStats, applyReferralCode, getReferralShareText, type ReferralStats } from "../lib/backend/referrals";
import { useAuthStore } from "../lib/data/authStore";
import { success, lightTap } from "../lib/utils/haptics";

export default function ReferralsScreen() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [inputCode, setInputCode] = useState("");
  const [applying, setApplying] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const s = await getReferralStats(userId);
    setStats(s);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleCopy = async () => {
    if (!stats) return;
    await Clipboard.setStringAsync(stats.referralCode);
    lightTap();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!stats) return;
    lightTap();
    await Share.share({ message: getReferralShareText(stats.referralCode) });
  };

  const handleApply = async () => {
    if (!userId || !inputCode.trim()) return;
    setApplying(true);
    const result = await applyReferralCode(userId, inputCode);
    setApplying(false);
    if (result.success) {
      success();
      Alert.alert("Success!", "500 VC has been added to your wallet!");
      setInputCode("");
      load();
    } else {
      Alert.alert("Error", result.error || "Could not apply code");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.title}>Invite Friends</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.card}>
          <Ionicons name="gift" size={48} color="#6366f1" />
          <Text style={styles.cardTitle}>Give 500 VC, Get 500 VC</Text>
          <Text style={styles.cardSub}>Share your code with friends. When they sign up, you both get 500 VC!</Text>
        </View>

        {stats && (
          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>Your referral code</Text>
            <Text style={styles.codeText}>{stats.referralCode}</Text>
            <View style={styles.codeActions}>
              <Pressable onPress={handleCopy} style={[styles.codeBtn, copied && styles.codeBtnCopied]}>
                <Ionicons name={copied ? "checkmark" : "copy"} size={18} color="#fff" />
                <Text style={styles.codeBtnText}>{copied ? "Copied!" : "Copy"}</Text>
              </Pressable>
              <Pressable onPress={handleShare} style={styles.shareBtn}>
                <Ionicons name="share-social" size={18} color="#fff" />
                <Text style={styles.shareBtnText}>Share</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{stats?.totalReferrals ?? 0}</Text>
            <Text style={styles.statLabel}>Friends invited</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{stats?.totalEarned ?? 0}</Text>
            <Text style={styles.statLabel}>VC earned</Text>
          </View>
        </View>

        <View style={styles.inputCard}>
          <Text style={styles.inputLabel}>Have a referral code?</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Enter code"
              placeholderTextColor="#666"
              value={inputCode}
              onChangeText={setInputCode}
              autoCapitalize="characters"
            />
            <Pressable 
              onPress={handleApply} 
              disabled={applying || !inputCode.trim()}
              style={[styles.applyBtn, (!inputCode.trim() || applying) && styles.applyBtnDisabled]}
            >
              <Text style={styles.applyBtnText}>{applying ? "..." : "Apply"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060a14" },
  topBar: { paddingTop: 50, paddingHorizontal: 16, paddingBottom: 12, flexDirection: "row", alignItems: "center" },
  backBtn: { marginRight: 12 },
  title: { fontSize: 26, fontWeight: "900", color: "#fff" },
  content: { padding: 16, gap: 16 },
  card: { backgroundColor: "#0c1022", borderRadius: 16, padding: 24, alignItems: "center", borderWidth: 1, borderColor: "#1f2747" },
  cardTitle: { color: "#fff", fontSize: 20, fontWeight: "900", marginTop: 12 },
  cardSub: { color: "#9aa1c6", fontSize: 14, textAlign: "center", marginTop: 8, lineHeight: 20 },
  codeCard: { backgroundColor: "#0c1022", borderRadius: 16, padding: 20, alignItems: "center", borderWidth: 1, borderColor: "#1f2747" },
  codeLabel: { color: "#9aa1c6", fontSize: 12, fontWeight: "700" },
  codeText: { color: "#fff", fontSize: 32, fontWeight: "900", letterSpacing: 4, marginVertical: 12 },
  codeActions: { flexDirection: "row", gap: 12 },
  codeBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: "#1f2747" },
  codeBtnCopied: { backgroundColor: "#10b981" },
  codeBtnText: { color: "#fff", fontWeight: "800" },
  shareBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: "#6366f1" },
  shareBtnText: { color: "#fff", fontWeight: "800" },
  statsRow: { flexDirection: "row", gap: 12 },
  statBox: { flex: 1, backgroundColor: "#0c1022", borderRadius: 16, padding: 16, alignItems: "center", borderWidth: 1, borderColor: "#1f2747" },
  statValue: { color: "#fff", fontSize: 28, fontWeight: "900" },
  statLabel: { color: "#9aa1c6", fontSize: 12, marginTop: 4 },
  inputCard: { backgroundColor: "#0c1022", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#1f2747" },
  inputLabel: { color: "#fff", fontSize: 14, fontWeight: "800", marginBottom: 12 },
  inputRow: { flexDirection: "row", gap: 10 },
  input: { flex: 1, backgroundColor: "#060a14", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, color: "#fff", fontSize: 16, fontWeight: "700" },
  applyBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, backgroundColor: "#6366f1", justifyContent: "center" },
  applyBtnDisabled: { opacity: 0.5 },
  applyBtnText: { color: "#fff", fontWeight: "800" },
});
