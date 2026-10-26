// app/auth/login.tsx
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
import { useAuthStore } from "../../lib/data/authStore";
import { APP_DISPLAY_NAME, APP_TAGLINE } from "../../lib/theme/brand";
import { colors } from "../../lib/theme/colors";
import { pressSoft, pressSoftIcon } from "../../lib/ui/pressableStyles";

type LoginMode = "email" | "phone";

export default function LoginScreen() {
  const router = useRouter();

  const {
    login,
    loginWithPhoneOtp,
    verifyPhoneOtp,
    completeMfaLogin,
    clearMfaLogin,
    loading,
    error,
    clearError,
    user,
    mfaLoginRequired,
  } = useAuthStore();

  const [mode, setMode] = useState<LoginMode>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otpToken, setOtpToken] = useState("");
  const [otpSentFor, setOtpSentFor] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  // If the store reports an error, show it once in an alert
  useEffect(() => {
    if (error) {
      Alert.alert("Login error", error, [
        { text: "OK", onPress: () => clearError() },
      ]);
    }
  }, [error, clearError]);

  // Redirect after full login (skip while 2FA step is pending)
  useEffect(() => {
    if (user && !mfaLoginRequired) {
      router.replace("/(tabs)/feed");
    }
  }, [user, mfaLoginRequired, router]);

  const handleLoginPress = async () => {
    const trimmedEmail = email.trim();
    const trimmedPw = password.trim();
    if (!trimmedEmail || !trimmedPw) {
      Alert.alert("Missing info", "Enter both email and password.");
      return;
    }
    await login(trimmedEmail.toLowerCase(), trimmedPw);
  };

  const handleMfaVerify = async () => {
    const token = mfaCode.trim();
    if (!token) {
      Alert.alert("Missing code", "Enter the 6-digit code from your authenticator app.");
      return;
    }
    const ok = await completeMfaLogin(token);
    if (ok) {
      router.replace("/(tabs)/feed");
    }
  };

  const handleGoToRegister = () => {
    router.push("/auth/register");
  };

  const handleSendOtp = async () => {
    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      Alert.alert("Missing phone", "Enter your phone number.");
      return;
    }
    setOtpToken("");
    setOtpSentFor(null);
    try {
      await loginWithPhoneOtp(trimmedPhone);
      setOtpSentFor(trimmedPhone);
      Alert.alert("Code sent", "Enter the 6-digit code to finish login.");
    } catch (e: any) {
      Alert.alert("Failed to send code", e?.message ?? "Try again.");
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpSentFor) return;
    const token = otpToken.trim();
    if (!token) {
      Alert.alert("Missing code", "Enter the 6-digit code.");
      return;
    }
    try {
      await verifyPhoneOtp(otpSentFor, token);
      // Redirect is handled by the `user` effect above.
    } catch (e: any) {
      Alert.alert("Verification failed", e?.message ?? "Try again.");
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerBlock}>
          <Text style={styles.brandMark}>{APP_DISPLAY_NAME}</Text>
          <Text style={styles.title}>Log in</Text>
          <Text style={styles.subtitle}>
            {APP_TAGLINE} Sign in to keep your record, wallet, and challenges in sync.
          </Text>
        </View>

        {!mfaLoginRequired ? (
        <View style={styles.modeRow}>
          <Pressable
            onPress={() => { clearError(); setMode("email"); setOtpSentFor(null); }}
            style={({ pressed }) => [
              styles.modeBtn,
              mode === "email" && styles.modeBtnActive,
              pressSoft(pressed),
            ]}
          >
            <Text style={[styles.modeBtnText, mode === "email" && styles.modeBtnTextActive]}>Email</Text>
          </Pressable>
          <Pressable
            onPress={() => { clearError(); setMode("phone"); setOtpSentFor(null); }}
            style={({ pressed }) => [
              styles.modeBtn,
              mode === "phone" && styles.modeBtnActive,
              pressSoft(pressed),
            ]}
          >
            <Text style={[styles.modeBtnText, mode === "phone" && styles.modeBtnTextActive]}>Phone</Text>
          </Pressable>
        </View>
        ) : null}

        <View style={styles.formBlock}>
          {mfaLoginRequired ? (
            <>
              <View style={styles.mfaBanner}>
                <Text style={styles.mfaBannerTitle}>Two-factor authentication</Text>
                <Text style={styles.mfaBannerSub}>
                  Enter the code from your authenticator app to finish signing in.
                </Text>
              </View>
              <Text style={styles.label}>Authenticator code</Text>
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                placeholder="123456"
                placeholderTextColor={colors.textMuted}
                value={mfaCode}
                onChangeText={setMfaCode}
                maxLength={8}
              />
              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.primaryButtonPressed,
                  loading && { opacity: 0.6 },
                ]}
                disabled={loading}
                onPress={handleMfaVerify}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Verify & continue</Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => {
                  clearMfaLogin();
                  setMfaCode("");
                }}
                style={styles.forgotLink}
              >
                <Text style={styles.forgotLinkText}>Back to login</Text>
              </Pressable>
            </>
          ) : mode === "email" ? (
            <>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={setEmail}
              />
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                secureTextEntry
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={setPassword}
              />

              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.primaryButtonPressed,
                  loading && { opacity: 0.6 },
                ]}
                disabled={loading}
                onPress={handleLoginPress}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Log in</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.label}>Phone</Text>
              <TextInput
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="phone-pad"
                placeholder="5551234567"
                placeholderTextColor={colors.textMuted}
                value={phone}
                onChangeText={setPhone}
              />

              {otpSentFor ? (
                <>
                  <Text style={styles.label}>Code</Text>
                  <TextInput
                    style={styles.input}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="number-pad"
                    placeholder="123456"
                    placeholderTextColor={colors.textMuted}
                    value={otpToken}
                    onChangeText={setOtpToken}
                  />

                  <Pressable
                    style={({ pressed }) => [
                      styles.primaryButton,
                      pressed && styles.primaryButtonPressed,
                      loading && { opacity: 0.6 },
                    ]}
                    disabled={loading}
                    onPress={handleVerifyOtp}
                  >
                    {loading ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={styles.primaryButtonText}>Verify</Text>
                    )}
                  </Pressable>
                </>
              ) : (
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.primaryButtonPressed,
                    loading && { opacity: 0.6 },
                  ]}
                  disabled={loading}
                  onPress={handleSendOtp}
                >
                  {loading ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Send code</Text>
                  )}
                </Pressable>
              )}
            </>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.forgotLink,
              pressSoftIcon(pressed),
            ]}
            onPress={() => router.push("/auth/forgot-password")}
          >
            <Text style={styles.forgotLinkText}>Forgot password?</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.secondaryButtonPressed,
            ]}
            onPress={handleGoToRegister}
          >
            <Text style={styles.secondaryButtonText}>
              Don&apos;t have an account?{" "}
              <Text style={styles.secondaryButtonTextHighlight}>
                Create one
              </Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 40,
    backgroundColor: colors.bg,
  },
  headerBlock: {
    marginBottom: 40,
  },
  brandMark: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 2,
    color: colors.accentMuted,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textTertiary,
  },
  formBlock: {
    gap: 16,
  },
  modeRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
  },
  modeBtn: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modeBtnActive: {
    backgroundColor: colors.actionBlue,
    borderColor: colors.actionBlue,
  },
  modeBtnText: {
    color: colors.textTertiary,
    fontWeight: "800",
  },
  modeBtnTextActive: {
    color: "#fff",
  },
  label: {
    color: colors.textTertiary,
    fontSize: 14,
    marginBottom: 4,
  },
  input: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.text,
    marginBottom: 12,
  },
  primaryButton: {
    marginTop: 8,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.actionBlue,
  },
  primaryButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  forgotLink: {
    marginTop: 12,
    alignItems: "center",
  },
  forgotLinkText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: "600",
  },
  secondaryButton: {
    marginTop: 16,
    alignItems: "center",
  },
  secondaryButtonPressed: {
    opacity: 0.7,
  },
  secondaryButtonText: {
    color: colors.textTertiary,
    fontSize: 14,
  },
  secondaryButtonTextHighlight: {
    color: colors.text,
    fontWeight: "700",
  },
  mfaBanner: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: "rgba(99,102,241,0.12)",
    borderWidth: 1,
    borderColor: colors.accentBorder,
    marginBottom: 8,
  },
  mfaBannerTitle: { color: colors.text, fontWeight: "900", fontSize: 15 },
  mfaBannerSub: { color: colors.textMuted, fontSize: 13, marginTop: 4, lineHeight: 18 },
});
