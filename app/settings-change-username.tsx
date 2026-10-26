// app/settings-change-username.tsx
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
import { pressSoft, pressSoftIcon } from "../lib/ui/pressableStyles";

export default function ChangeUsernameScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const { updateUsername, loading, error, clearError } = useAuthStore();

  const [username, setUsername] = useState(profile?.username ?? "");

  useEffect(() => {
    if (profile?.username) setUsername(profile.username);
  }, [profile?.username]);

  useEffect(() => {
    if (error) {
      Alert.alert("Error", error, [{ text: "OK", onPress: clearError }]);
    }
  }, [error, clearError]);

  const handleSave = async () => {
    const trimmed = username.trim();
    if (!trimmed || trimmed.length < 2) {
      Alert.alert("Invalid", "Username must be at least 2 characters.");
      return;
    }
    try {
      await updateUsername(trimmed);
      Alert.alert("Updated", "Your username has been updated.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not update username.");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressSoftIcon(pressed)]}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.title}>Change username</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.hint}>
          This is your @handle other players will see. Usernames must be at least 2 characters.
        </Text>
        <Text style={styles.label}>Username</Text>
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="gamer123"
          placeholderTextColor="#666a7a"
          value={username}
          onChangeText={setUsername}
        />

        <Pressable
          style={({ pressed }) => [
            styles.saveBtn,
            pressSoft(pressed),
            loading && { opacity: 0.6 },
          ]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Save</Text>
          )}
        </Pressable>
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
  hint: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    marginBottom: 16,
  },
  label: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#0c1020",
    borderWidth: 1,
    borderColor: "#262b40",
    color: "#fff",
    fontSize: 16,
    marginBottom: 24,
  },
  saveBtn: {
    backgroundColor: "#3b82f6",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
