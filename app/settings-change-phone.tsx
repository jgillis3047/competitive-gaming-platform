// app/settings-change-phone.tsx — Add or update phone with SMS verification
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
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

import { useAuthStore } from "../lib/data/authStore";
import { colors } from "../lib/theme/colors";
import { pressSoft, pressSoftIcon } from "../lib/ui/pressableStyles";
import { formatPhoneDisplay, isValidPhoneInput } from "../lib/utils/phoneFormat";

export default function SettingsChangePhoneScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const requestPhoneChange = useAuthStore((s) => s.requestPhoneChange);
  const verifyPhoneChange = useAuthStore((s) => s.verifyPhoneChange);
  const removePhoneFromProfile = useAuthStore((s) => s.removePhoneFromProfile);

  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSentFor, setOtpSentFor] = useState<string | null>(null);

  useEffect(() => {
    if (error) {
      Alert.alert("Error", error, [{ text: "OK", onPress: clearError }]);
    }
  }, [error, clearError]);

  const currentPhone = profile?.phone ?? null;

  const handleSendCode = async () => {
    const trimmed = phone.trim();
    if (!isValidPhoneInput(trimmed)) {
      Alert.alert("Invalid phone", "Enter a valid phone number (10+ digits).");
      return;
    }
    setOtp("");
    await requestPhoneChange(trimmed);
    if (!useAuthStore.getState().error) {
      setOtpSentFor(trimmed);
      Alert.alert("Code sent", "Enter the 6-digit SMS code to confirm your number.");
    }
  };

  const handleVerify = async () => {
    if (!otpSentFor) return;
    const token = otp.trim();
    if (token.length < 4) {
      Alert.alert("Missing code", "Enter the verification code from your SMS.");
      return;
    }
    const ok = await verifyPhoneChange(otpSentFor, token);
    if (ok) {
      Alert.alert("Phone updated", "Your phone number has been saved.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    }
  };

  const handleRemove = () => {
    if (!currentPhone) return;
    Alert.alert(
      "Remove phone?",
      "This removes the number from your profile. You can add a new one anytime.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await removePhoneFromProfile();
            if (!useAuthStore.getState().error) {
              setPhone("");
              setOtpSentFor(null);
              Alert.alert("Removed", "Phone number removed from your profile.");
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
        <Text style={styles.title}>Phone number</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.currentCard}>
          <Ionicons name="call-outline" size={22} color={colors.accentMuted} />
          <View style={{ flex: 1 }}>
            <Text style={styles.currentLabel}>Current number</Text>
            <Text style={styles.currentValue}>{formatPhoneDisplay(currentPhone)}</Text>
          </View>
        </View>

        <Text style={styles.hint}>
          Add or change your phone for SMS login and account recovery. We&apos;ll text you a code to confirm.
        </Text>

        <Text style={styles.label}>New phone number</Text>
        <TextInput
          style={styles.input}
          keyboardType="phone-pad"
          placeholder="5551234567"
          placeholderTextColor={colors.textMuted}
          value={phone}
          onChangeText={setPhone}
          autoComplete="tel"
        />

        {otpSentFor ? (
          <>
            <Text style={styles.label}>Verification code</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              placeholder="123456"
              placeholderTextColor={colors.textMuted}
              value={otp}
              onChangeText={setOtp}
              maxLength={8}
            />
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressSoft(pressed), loading && { opacity: 0.6 }]}
              onPress={handleVerify}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Verify & save</Text>
              )}
            </Pressable>
            <Pressable onPress={handleSendCode} disabled={loading} style={styles.linkBtn}>
              <Text style={styles.linkBtnText}>Resend code</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressSoft(pressed), loading && { opacity: 0.6 }]}
            onPress={handleSendCode}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Send verification code</Text>
            )}
          </Pressable>
        )}

        {currentPhone ? (
          <Pressable onPress={handleRemove} style={({ pressed }) => [styles.removeBtn, pressSoft(pressed)]}>
            <Text style={styles.removeBtnText}>Remove phone from profile</Text>
          </Pressable>
        ) : null}
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
  currentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  currentLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  currentValue: { color: colors.text, fontSize: 16, fontWeight: "800", marginTop: 2 },
  hint: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 16 },
  label: { color: colors.textSecondary, fontSize: 14, fontWeight: "700", marginBottom: 8 },
  input: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 16,
    marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  primaryBtnText: { color: colors.text, fontSize: 16, fontWeight: "800" },
  linkBtn: { alignItems: "center", marginTop: 14, paddingVertical: 8 },
  linkBtnText: { color: colors.accentMuted, fontWeight: "800", fontSize: 14 },
  removeBtn: {
    marginTop: 28,
    alignItems: "center",
    paddingVertical: 12,
  },
  removeBtnText: { color: colors.danger, fontWeight: "800", fontSize: 14 },
});
