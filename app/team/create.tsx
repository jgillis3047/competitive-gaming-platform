// app/team/create.tsx — invite-only crew creation
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
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

import { uploadTeamAvatar } from "../../lib/backend/avatarService";
import { searchProfilesByUsername } from "../../lib/backend/profile";
import { createCrewWithInvites } from "../../lib/backend/teams";
import { useAuthStore } from "../../lib/data/authStore";
import { colors } from "../../lib/theme/colors";
import {
  CREATE_CREW,
  CREW_CREATE_LEAD,
  CREW_INVITE_EMPTY,
  CREW_INVITE_HINT,
} from "../../lib/theme/crewCopy";
import { radius, space } from "../../lib/theme/spacing";
import Avatar from "../../lib/ui/Avatar";
import { pressSoft, pressSoftIcon } from "../../lib/ui/pressableStyles";

type InvitePick = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

function displayName(p: InvitePick) {
  return p.display_name || p.username || "Player";
}

export default function CreateCrewScreen() {
  const router = useRouter();
  const myId = useAuthStore((s) => s.user?.id ?? null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<InvitePick[]>([]);
  const [searching, setSearching] = useState(false);
  const [invitees, setInvitees] = useState<InvitePick[]>([]);
  const [loading, setLoading] = useState(false);

  const runSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const results = await searchProfilesByUsername(q, 15);
      const picked = new Set(invitees.map((i) => i.id));
      setSearchResults(
        results
          .filter((p) => p.id !== myId && !picked.has(p.id))
          .map((p) => ({
            id: p.id,
            display_name: p.display_name ?? null,
            username: p.username ?? null,
            avatar_url: p.avatar_url ?? null,
          }))
      );
    } finally {
      setSearching(false);
    }
  }, [searchQuery, myId, invitees]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(() => {
      void runSearch();
    }, 350);
    return () => clearTimeout(t);
  }, [searchQuery, runSearch]);

  const addInvitee = (p: InvitePick) => {
    if (invitees.some((i) => i.id === p.id)) return;
    setInvitees((prev) => [...prev, p]);
    setSearchResults((prev) => prev.filter((r) => r.id !== p.id));
  };

  const removeInvitee = (id: string) => {
    setInvitees((prev) => prev.filter((i) => i.id !== id));
  };

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow access to your photos to add a crew photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setPhotoUri(result.assets[0].uri);
  };

  const canSubmit = name.trim().length > 0 && !loading;

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert("Name required", "Enter a crew name.");
      return;
    }
    if (!myId) {
      Alert.alert("Sign in required", "Log in to create a crew.");
      return;
    }
    try {
      setLoading(true);
      const crew = await createCrewWithInvites({
        name: trimmed,
        description: description.trim() || null,
        userId: myId,
        inviteUserIds: invitees.map((i) => i.id),
      });

      if (photoUri) {
        try {
          await uploadTeamAvatar({ teamId: crew.id, localUri: photoUri });
        } catch {
          // Crew is live — photo can be added later from the profile.
        }
      }

      const inviteMsg =
        invitees.length > 0
          ? `${invitees.length} invite${invitees.length === 1 ? "" : "s"} sent.`
          : "Invite friends anytime from your crew profile.";

      Alert.alert("Crew created", `"${crew.name}" is live — ${inviteMsg}`, [
        { text: "View crew", onPress: () => router.replace(`/team/${crew.id}` as any) },
        { text: "Done", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert("Create failed", e?.message ?? "Could not create crew.");
    } finally {
      setLoading(false);
    }
  };

  const previewName = name.trim() || "Crew";

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressSoftIcon(pressed)]}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{CREATE_CREW}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.lead}>{CREW_CREATE_LEAD}</Text>

        <View style={styles.photoSection}>
          <Pressable onPress={() => void handlePickPhoto()} style={({ pressed }) => [styles.photoBtn, pressSoft(pressed)]}>
            {photoUri ? (
              <Avatar imageUrl={photoUri} name={previewName} size={72} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Ionicons name="add" size={28} color={colors.textMuted} />
              </View>
            )}
          </Pressable>
          <Text style={styles.photoLabel}>Crew photo (optional)</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Crew name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Court Kings"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Description (optional)</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="What's your crew about?"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, styles.textArea]}
            multiline
            numberOfLines={3}
          />
        </View>

        <Text style={styles.sectionTitle}>Invite players</Text>
        <Text style={styles.hint}>{CREW_INVITE_HINT}</Text>

        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search username…"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={() => void runSearch()}
        />

        {searching ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: 12 }} />
        ) : searchResults.length > 0 ? (
          <View style={styles.searchResults}>
            {searchResults.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => addInvitee(p)}
                style={({ pressed }) => [styles.searchRow, pressSoft(pressed)]}
              >
                <Avatar imageUrl={p.avatar_url} name={displayName(p)} size={36} />
                <View style={styles.searchRowBody}>
                  <Text style={styles.searchRowName} numberOfLines={1}>
                    {displayName(p)}
                  </Text>
                  {p.username ? <Text style={styles.searchRowUser}>@{p.username}</Text> : null}
                </View>
                <Ionicons name="add-circle" size={22} color={colors.accent} />
              </Pressable>
            ))}
          </View>
        ) : searchQuery.trim().length >= 2 ? (
          <Text style={styles.emptySearch}>No players found.</Text>
        ) : null}

        {invitees.length > 0 ? (
          <View style={styles.inviteeSection}>
            <Text style={styles.inviteeLabel}>
              Invited ({invitees.length}) — invites send when you create the crew
            </Text>
            {invitees.map((p) => (
              <View key={p.id} style={styles.inviteeChip}>
                <Avatar imageUrl={p.avatar_url} name={displayName(p)} size={28} />
                <Text style={styles.inviteeName} numberOfLines={1}>
                  {displayName(p)}
                </Text>
                <Pressable onPress={() => removeInvitee(p.id)} hitSlop={8}>
                  <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.inviteEmpty}>
            <Ionicons name="person-add-outline" size={28} color={colors.textMuted} />
            <Text style={styles.inviteEmptyText}>{CREW_INVITE_EMPTY}</Text>
          </View>
        )}

        <Pressable
          onPress={handleCreate}
          disabled={!canSubmit}
          style={({ pressed }) => [
            styles.submitBtn,
            !canSubmit && styles.submitDisabled,
            pressSoft(pressed),
          ]}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <Text style={styles.submitText}>{CREATE_CREW}</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgFeed },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.lg,
    paddingTop: 56,
    paddingBottom: space.md,
  },
  backBtn: { marginRight: space.md },
  title: { fontSize: 22, fontWeight: "900", color: colors.text },
  scroll: { flex: 1 },
  scrollContent: { padding: space.lg, paddingBottom: 40 },
  lead: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: space.lg,
    fontWeight: "600",
  },
  photoSection: {
    alignItems: "center",
    marginBottom: space.lg,
    gap: 8,
  },
  photoBtn: {
    borderRadius: 40,
  },
  photoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  photoLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  field: { marginBottom: space.lg },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: "800", marginBottom: 8 },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: "900", marginBottom: 4 },
  hint: { color: colors.textMuted, fontSize: 12, marginBottom: 10, lineHeight: 17 },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    color: colors.text,
    fontSize: 16,
  },
  textArea: { minHeight: 88, textAlignVertical: "top" },
  searchResults: {
    marginTop: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginBottom: space.md,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 10,
  },
  searchRowBody: { flex: 1 },
  searchRowName: { color: colors.text, fontSize: 15, fontWeight: "700" },
  searchRowUser: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  emptySearch: { color: colors.textMuted, fontSize: 13, marginVertical: 8 },
  inviteeSection: { marginTop: 8, marginBottom: space.lg, gap: 8 },
  inviteeLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "700", marginBottom: 4 },
  inviteeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  inviteeName: { flex: 1, color: colors.text, fontWeight: "700", fontSize: 14 },
  inviteEmpty: {
    alignItems: "center",
    paddingVertical: 24,
    marginBottom: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    gap: 8,
  },
  inviteEmptyText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    paddingHorizontal: 16,
    lineHeight: 18,
  },
  submitBtn: {
    marginTop: 8,
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: "center",
  },
  submitDisabled: { opacity: 0.45 },
  submitText: { color: colors.text, fontSize: 16, fontWeight: "900" },
});
