// app/auth/register.tsx
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
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

export default function RegisterScreen() {
  const router = useRouter();

  // ---- local form state (pure React, no store) ------------------------
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // ---- pull only what we need from auth store (selectors = safe) ------
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const register = useAuthStore((s) => s.register);
  const clearError = useAuthStore((s) => s.clearError);

  // Clear any leftover error when user starts typing again
  const handleChangeEmail = (value: string) => {
    if (error) clearError();
    setEmail(value);
  };

  const handleChangeUsername = (value: string) => {
    if (error) clearError();
    setUsername(value);
  };

  const handleChangePhone = (value: string) => {
    if (error) clearError();
    setPhone(value);
  };

  const handleChangePassword = (value: string) => {
    if (error) clearError();
    setPassword(value);
  };

  const handleChangeConfirmPassword = (value: string) => {
    if (error) clearError();
    setConfirmPassword(value);
  };

  // ---- submit handler: the ONLY place we call authStore.register ------
  const handleSubmit = useCallback(async () => {
    if (!email.trim() || !username.trim() || !password.trim()) {
      Alert.alert("Missing info", "Email, username, and password are required.");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Password mismatch", "Passwords do not match.");
      return;
    }

    const ok = await register(
      email.trim(),
      password,
      username.trim(),
      phone.trim() || undefined
    );

    if (ok) {
      router.replace("/(tabs)/feed");
    } else if (useAuthStore.getState().error) {
      Alert.alert("Sign up failed", useAuthStore.getState().error!);
    }
  }, [email, username, phone, password, confirmPassword, register, router]);

  // ---- UI -------------------------------------------------------------
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.select({ ios: "padding", android: undefined })}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.brandMark}>{APP_DISPLAY_NAME}</Text>
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>
          {APP_TAGLINE} Use your email, username, and password. Phone is optional.
        </Text>

        {/* Email */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor="#6b7280"
            value={email}
            onChangeText={handleChangeEmail}
          />
        </View>

        {/* Username */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            placeholder="gamer123"
            placeholderTextColor="#6b7280"
            value={username}
            onChangeText={handleChangeUsername}
          />
          <Text style={styles.helpText}>
            This is your handle other players will see (@username).
          </Text>
        </View>

        {/* Phone (optional) */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>
            Phone <Text style={styles.optional}>(optional)</Text>
          </Text>
          <TextInput
            style={styles.input}
            keyboardType="phone-pad"
            placeholder="5551234567"
            placeholderTextColor="#6b7280"
            value={phone}
            onChangeText={handleChangePhone}
          />
          <Text style={styles.helpText}>
            You&apos;ll be able to log in with email, username, or phone.
          </Text>
        </View>

        {/* Password */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor="#6b7280"
            value={password}
            onChangeText={handleChangePassword}
          />
        </View>

        {/* Confirm Password */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Confirm password</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor="#6b7280"
            value={confirmPassword}
            onChangeText={handleChangeConfirmPassword}
          />
        </View>

        {/* Store error message, if any */}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {/* Primary button */}
        <Pressable
          style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.primaryButtonText}>
            {loading ? "Creating account..." : "Create account"}
          </Text>
        </Pressable>

        {/* Link back to Login */}
        <Pressable
          style={styles.secondaryButton}
          onPress={() => {
            clearError();
            router.replace("/auth/login");
          }}
        >
          <Text style={styles.secondaryButtonText}>
            Already have an account? <Text style={styles.linkText}>Log in</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 72,
    paddingBottom: 40,
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
    fontSize: 28,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textTertiary,
    marginBottom: 24,
  },
  fieldGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: 6,
  },
  optional: {
    fontSize: 12,
    fontWeight: "400",
    color: colors.textMuted,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  helpText: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textMuted,
  },
  errorText: {
    marginTop: 8,
    marginBottom: 8,
    fontSize: 13,
    color: colors.danger,
  },
  primaryButton: {
    marginTop: 12,
    borderRadius: 999,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  secondaryButton: {
    marginTop: 16,
    alignItems: "center",
  },
  secondaryButtonText: {
    fontSize: 14,
    color: colors.textTertiary,
  },
  linkText: {
    color: colors.accent,
    fontWeight: "600",
  },
});
