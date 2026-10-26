// app/edit-profile.tsx
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "../lib/backend/supabaseClient";
import { uploadAvatar } from "../lib/backend/avatarService";
import { useAuthStore } from "../lib/data/authStore";
import { GAME_CONFIG } from "../lib/data/gameConfig";
import Avatar from "../lib/ui/Avatar";
import { success, lightTap } from "../lib/utils/haptics";

export default function EditProfileScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  const [displayName, setDisplayName] = useState(profile?.display_name || "");
  const [username, setUsername] = useState(profile?.username || "");
  const [bio, setBio] = useState("");
  const [favoriteGame, setFavoriteGame] = useState("");
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);

  const loadExtendedProfile = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from("profiles")
      .select("bio, favorite_game")
      .eq("id", user.id)
      .maybeSingle();
    if (data) {
      setBio(data.bio || "");
      setFavoriteGame(data.favorite_game || "");
    }
  }, [user?.id]);

  useEffect(() => {
    void loadExtendedProfile();
  }, [loadExtendedProfile]);

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: displayName.trim() || null,
          username: username.trim() || null,
          bio: bio.trim() || null,
          favorite_game: favoriteGame || null,
        })
        .eq("id", user.id);
      if (error) throw error;
      success();
      await refreshProfile();
      Alert.alert("Saved", "Your profile has been updated.");
      router.back();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not save profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleChangeAvatar = async () => {
    if (!user?.id || avatarBusy) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Allow photo access to change avatar.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      setAvatarBusy(true);
      await uploadAvatar({ userId: user.id, localUri: result.assets[0].uri });
      await refreshProfile();
      success();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not update avatar.");
    } finally {
      setAvatarBusy(false);
    }
  };

  const games = Object.keys(GAME_CONFIG);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.title}>Edit Profile</Text>
        <Pressable onPress={handleSave} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.6 }]}>
          <Text style={styles.saveBtnText}>{saving ? "..." : "Save"}</Text>
        </Pressable>
      </View>

      <Pressable onPress={handleChangeAvatar} style={styles.avatarSection}>
        <Avatar imageUrl={profile?.avatar_url} name={displayName || "?"} size={80} />
        <Text style={styles.changePhotoText}>{avatarBusy ? "Uploading..." : "Change photo"}</Text>
      </Pressable>

      <View style={styles.field}>
        <Text style={styles.label}>Display Name</Text>
        <TextInput
          style={styles.input}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Your name"
          placeholderTextColor="#666"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Username</Text>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          placeholder="username"
          placeholderTextColor="#666"
          autoCapitalize="none"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Bio</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={bio}
          onChangeText={setBio}
          placeholder="Tell us about yourself..."
          placeholderTextColor="#666"
          multiline
          numberOfLines={3}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Favorite Game</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gamesRow}>
          {games.map((game) => (
            <Pressable
              key={game}
              onPress={() => { lightTap(); setFavoriteGame(game); }}
              style={[styles.gameChip, favoriteGame === game && styles.gameChipSelected]}
            >
              <Text style={[styles.gameChipText, favoriteGame === game && styles.gameChipTextSelected]}>{game}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060a14" },
  topBar: { flexDirection: "row", alignItems: "center", marginBottom: 24 },
  backBtn: { marginRight: 12 },
  title: { flex: 1, fontSize: 24, fontWeight: "900", color: "#fff" },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: "#6366f1" },
  saveBtnText: { color: "#fff", fontWeight: "800" },
  avatarSection: { alignItems: "center", marginBottom: 24 },
  changePhotoText: { color: "#6366f1", fontWeight: "700", marginTop: 8 },
  field: { marginBottom: 20 },
  label: { color: "#9aa1c6", fontSize: 13, fontWeight: "700", marginBottom: 8 },
  input: { backgroundColor: "#0c1022", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, color: "#fff", fontSize: 16, borderWidth: 1, borderColor: "#1f2747" },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  gamesRow: { marginTop: 4 },
  gameChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: "#0c1022", borderWidth: 1, borderColor: "#1f2747", marginRight: 8 },
  gameChipSelected: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  gameChipText: { color: "#9aa1c6", fontWeight: "700" },
  gameChipTextSelected: { color: "#fff" },
});
