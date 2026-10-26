// app/settings-two-factor.tsx — TOTP authenticator app 2FA
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  enrollTotp,
  listTotpFactors,
  unenrollTotp,
  verifyTotpEnrollment,
  type TotpFactor,
} from "../lib/backend/mfa";
import { colors } from "../lib/theme/colors";
import { pressSoft, pressSoftIcon } from "../lib/ui/pressableStyles";

type SetupState = {
  factorId: string;
  qrCode: string;
  secret: string;
};

export default function SettingsTwoFactorScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [code, setCode] = useState("");

  const verifiedFactor = factors.find((f) => f.status === "verified");

  const loadFactors = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listTotpFactors();
      setFactors(list);
    } catch (e: any) {
      Alert.alert("Could not load 2FA", e?.message ?? "Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFactors();
  }, [loadFactors]);

  const startSetup = async () => {
    setBusy(true);
    setCode("");
    try {
      const result = await enrollTotp("Baker Authenticator");
      setSetup({
        factorId: result.factorId,
        qrCode: result.qrCode,
        secret: result.secret,
      });
    } catch (e: any) {
      Alert.alert("Setup failed", e?.message ?? "Could not start 2FA setup.");
    } finally {
      setBusy(false);
    }
  };

  const confirmSetup = async () => {
    if (!setup) return;
    const token = code.trim();
    if (token.length < 6) {
      Alert.alert("Enter code", "Type the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    try {
      await verifyTotpEnrollment(setup.factorId, token);
      setSetup(null);
      setCode("");
      await loadFactors();
      Alert.alert("2FA enabled", "Your account now requires a code when you sign in with email and password.");
    } catch (e: any) {
      Alert.alert("Verification failed", e?.message ?? "Check the code and try again.");
    } finally {
      setBusy(false);
    }
  };

  const disable2fa = () => {
    if (!verifiedFactor) return;
    Alert.alert(
      "Turn off 2FA?",
      "Your account will only need your password to sign in.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Turn off",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await unenrollTotp(verifiedFactor.id);
              await loadFactors();
              Alert.alert("2FA disabled", "Two-factor authentication has been turned off.");
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "Could not disable 2FA.");
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressSoftIcon(pressed)]}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Two-factor authentication</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
        ) : verifiedFactor && !setup ? (
          <>
            <View style={styles.statusCardOn}>
              <Ionicons name="shield-checkmark" size={28} color={colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={styles.statusTitle}>2FA is on</Text>
                <Text style={styles.statusSub}>
                  Sign-in with email + password requires your authenticator app.
                </Text>
              </View>
            </View>
            <Pressable
              onPress={disable2fa}
              disabled={busy}
              style={({ pressed }) => [styles.dangerBtn, pressSoft(pressed), busy && { opacity: 0.6 }]}
            >
              <Text style={styles.dangerBtnText}>Turn off 2FA</Text>
            </Pressable>
          </>
        ) : setup ? (
          <>
            <Text style={styles.hint}>
              Scan this QR code with Google Authenticator, Authy, or 1Password. Then enter the 6-digit code.
            </Text>
            {setup.qrCode ? (
              <View style={styles.qrWrap}>
                <Image source={{ uri: setup.qrCode }} style={styles.qrImage} contentFit="contain" />
              </View>
            ) : null}
            <Text style={styles.secretLabel}>Manual key</Text>
            <Text style={styles.secretValue} selectable>
              {setup.secret}
            </Text>
            <Text style={styles.label}>Authenticator code</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              placeholder="123456"
              placeholderTextColor={colors.textMuted}
              value={code}
              onChangeText={setCode}
              maxLength={8}
            />
            <Pressable
              onPress={confirmSetup}
              disabled={busy}
              style={({ pressed }) => [styles.primaryBtn, pressSoft(pressed), busy && { opacity: 0.6 }]}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Enable 2FA</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => { setSetup(null); setCode(""); }}
              style={styles.linkBtn}
            >
              <Text style={styles.linkBtnText}>Cancel setup</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.statusCardOff}>
              <Ionicons name="shield-outline" size={28} color={colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={styles.statusTitle}>2FA is off</Text>
                <Text style={styles.statusSub}>
                  Add an extra layer of security with an authenticator app.
                </Text>
              </View>
            </View>
            <Text style={styles.hint}>
              Works with Google Authenticator, Authy, Microsoft Authenticator, and similar apps.
              Phone SMS login is separate from this setting.
            </Text>
            <Pressable
              onPress={startSetup}
              disabled={busy}
              style={({ pressed }) => [styles.primaryBtn, pressSoft(pressed), busy && { opacity: 0.6 }]}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Set up authenticator app</Text>
              )}
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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
  scrollContent: { padding: 16 },
  statusCardOn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "rgba(16,185,129,0.12)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.35)",
    marginBottom: 20,
  },
  statusCardOff: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  statusTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
  statusSub: { color: colors.textMuted, fontSize: 13, marginTop: 4, lineHeight: 18 },
  hint: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 16 },
  qrWrap: {
    alignSelf: "center",
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fff",
    marginBottom: 16,
  },
  qrImage: { width: 200, height: 200 },
  secretLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 4 },
  secretValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 16,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { color: colors.textSecondary, fontSize: 14, fontWeight: "700", marginBottom: 8 },
  input: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 18,
    letterSpacing: 4,
    marginBottom: 16,
    textAlign: "center",
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: { color: colors.text, fontSize: 16, fontWeight: "800" },
  dangerBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.danger,
  },
  dangerBtnText: { color: colors.danger, fontSize: 16, fontWeight: "800" },
  linkBtn: { alignItems: "center", marginTop: 14, paddingVertical: 8 },
  linkBtnText: { color: colors.accentMuted, fontWeight: "800", fontSize: 14 },
});
