// app/league/create.tsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
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

import { createLeague } from "../../lib/backend/leagues";
import type { LeagueKind } from "../../lib/models/teamTypes";
import { useAuthStore } from "../../lib/data/authStore";
import { pressSoft, pressSoftIcon } from "../../lib/ui/pressableStyles";

export default function CreateLeagueScreen() {
  const router = useRouter();
  const myId = useAuthStore((s) => s.user?.id ?? null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<LeagueKind>("1v1");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert("Name required", "Enter a league name.");
      return;
    }
    if (!myId) {
      Alert.alert("Sign in required", "Log in to create a league.");
      return;
    }
    try {
      setLoading(true);
      const league = await createLeague({ name: trimmed, description: description.trim() || null, kind, userId: myId });
      Alert.alert("League created", `"${league.name}" has been created.`, [
        { text: "View", onPress: () => router.replace(`/league/${league.id}` as any) },
        { text: "Done", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert("Create failed", e?.message ?? "Could not create league.");
    } finally {
      setLoading(false);
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
        <Text style={styles.title}>Create League</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <Text style={styles.label}>League name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Spring Championship"
            placeholderTextColor="rgba(255,255,255,0.4)"
            style={styles.input}
            autoCapitalize="words"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Description (optional)</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="What's this league about?"
            placeholderTextColor="rgba(255,255,255,0.4)"
            style={[styles.input, styles.textArea]}
            multiline
            numberOfLines={3}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>League type</Text>
          <View style={styles.kindRow}>
            {(["1v1", "team", "both"] as LeagueKind[]).map((k) => (
              <Pressable
                key={k}
                onPress={() => setKind(k)}
                style={[styles.kindBtn, kind === k && styles.kindActive]}
              >
                <Text style={[styles.kindText, kind === k && styles.kindTextActive]}>
                  {k === "team" ? "Crew" : k === "both" ? "Both" : "1v1"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable
          onPress={handleCreate}
          disabled={loading || !name.trim()}
          style={({ pressed }) => [
            styles.submitBtn,
            (loading || !name.trim()) && styles.submitDisabled,
            pressSoft(pressed),
          ]}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.submitText}>Create League</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060a14" },
  header: { flexDirection: "row", alignItems: "center", padding: 20, paddingTop: 60 },
  backBtn: { marginRight: 16 },
  title: { fontSize: 22, fontWeight: "900", color: "#fff" },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  field: { marginBottom: 20 },
  label: { color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: "700", marginBottom: 8 },
  input: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    padding: 16,
    color: "#fff",
    fontSize: 16,
  },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  kindRow: { flexDirection: "row", gap: 10 },
  kindBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
  },
  kindActive: { backgroundColor: "rgba(99,102,241,0.3)" },
  kindText: { color: "rgba(255,255,255,0.7)", fontWeight: "700" },
  kindTextActive: { color: "#fff" },
  submitBtn: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#6366f1",
    alignItems: "center",
  },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: "#fff", fontSize: 17, fontWeight: "900" },
});
