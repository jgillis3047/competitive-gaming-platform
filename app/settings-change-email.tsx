// app/settings-change-email.tsx - Change email (Supabase sends confirmation to new email)
import { Ionicons } from "@expo/vector-icons";
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

import { supabase } from "../lib/backend/supabaseClient";
import { useAuthStore } from "../lib/data/authStore";
import { pressSoftIcon } from "../lib/ui/pressableStyles";

export default function SettingsChangeEmailScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !password) {
      setError("Enter your new email and current password.");
      return;
    }
    if (!user?.email) {
      setError("You must be signed in.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ email, password });
      if (updateError) throw updateError;
      setSuccess(true);
      setNewEmail("");
      setPassword("");
      await refreshProfile();
    } catch (e: any) {
      setError(e?.message ?? "Could not update email.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressSoftIcon(pressed)]}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.title}>Change email</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.current}>Current: {user?.email ?? "—"}</Text>
        <Text style={styles.hint}>
          Enter your new email and current password. We&apos;ll send a confirmation link to the new address.
        </Text>
        <TextInput
          value={newEmail}
          onChangeText={(t) => { setNewEmail(t); setError(null); }}
          placeholder="New email"
          placeholderTextColor="rgba(255,255,255,0.4)"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        <TextInput
          value={password}
          onChangeText={(t) => { setPassword(t); setError(null); }}
          placeholder="Current password"
          placeholderTextColor="rgba(255,255,255,0.4)"
          secureTextEntry
          style={styles.input}
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {success ? (
          <Text style={styles.successText}>Check your new email to confirm the change.</Text>
        ) : null}
        <Pressable
          onPress={handleSubmit}
          disabled={busy || !newEmail.trim() || !password}
          style={({ pressed }) => [
            styles.submitBtn,
            (busy || !newEmail.trim() || !password) && styles.submitBtnDisabled,
            pressed && !busy && { opacity: 0.9 },
          ]}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>Update email</Text>
          )}
        </Pressable>
        <View style={{ height: 32 }} />
      </ScrollView>
    </KeyboardAvoidingView>
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
  backBtn: { marginRight: 16 },
  title: { flex: 1, fontSize: 20, fontWeight: "800", color: "#fff" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  current: { color: "rgba(255,255,255,0.6)", fontSize: 14, marginBottom: 8 },
  hint: { color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 16, lineHeight: 20 },
  input: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#fff",
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  errorText: { color: "#f87171", fontSize: 14, marginBottom: 12 },
  successText: { color: "#86efac", fontSize: 14, marginBottom: 12 },
  submitBtn: {
    backgroundColor: "#6366f1",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
