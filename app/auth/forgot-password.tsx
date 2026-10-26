// app/auth/forgot-password.tsx - Request password reset email
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
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

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { resetPasswordForEmail, loading, error } = useAuthStore();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    try {
      await resetPasswordForEmail(trimmed);
      setSent(true);
    } catch {
      // error is in store
    }
  };

  if (sent) {
    return (
      <View style={styles.container}>
        <View style={styles.headerBlock}>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>
            If an account exists for {email.trim().toLowerCase()}, you’ll receive a link to reset your password.
          </Text>
        </View>
        <Pressable
          onPress={() => router.replace("/auth/login")}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
        >
          <Text style={styles.primaryButtonText}>Back to login</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#020314" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerBlock}>
          <Text style={styles.title}>Forgot password</Text>
          <Text style={styles.subtitle}>
            Enter your email and we’ll send you a link to reset your password.
          </Text>
        </View>

        <View style={styles.formBlock}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor="#666a7a"
            value={email}
            onChangeText={setEmail}
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
              loading && { opacity: 0.6 },
            ]}
            disabled={loading}
            onPress={handleSubmit}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>Send reset link</Text>
            )}
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
            onPress={() => router.back()}
          >
            <Text style={styles.secondaryButtonText}>Back to login</Text>
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
    backgroundColor: "#020314",
  },
  headerBlock: { marginBottom: 40 },
  title: { fontSize: 32, fontWeight: "800", color: "#ffffff", marginBottom: 8 },
  subtitle: { fontSize: 16, color: "#9ba4c0" },
  formBlock: { gap: 16 },
  label: { color: "#9ba4c0", fontSize: 14, marginBottom: 4 },
  input: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#0c1020",
    borderWidth: 1,
    borderColor: "#262b40",
    color: "#ffffff",
    marginBottom: 4,
  },
  errorText: { color: "#FCA5A5", fontSize: 14, marginBottom: 8 },
  primaryButton: {
    marginTop: 8,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3b82f6",
  },
  primaryButtonPressed: { transform: [{ scale: 0.98 }] },
  primaryButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  secondaryButton: { marginTop: 16, alignItems: "center" },
  secondaryButtonPressed: { opacity: 0.7 },
  secondaryButtonText: { color: "#9ba4c0", fontSize: 14 },
});
