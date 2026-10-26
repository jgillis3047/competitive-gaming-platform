// app/trivia/create.tsx - Choose category, create room, show join code
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { createTriviaRoom, listTriviaCategories } from "../../lib/backend/trivia";
import type { TriviaCategory } from "../../lib/backend/trivia";
import { useAuthStore } from "../../lib/data/authStore";
import { colors } from "../../lib/theme/colors";
import { pressSoft } from "../../lib/ui/pressableStyles";

export default function TriviaCreateScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [categories, setCategories] = useState<TriviaCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [questionCount, setQuestionCount] = useState(5);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listTriviaCategories();
        if (!cancelled) setCategories(list);
      } catch {
        if (!cancelled) Alert.alert("Error", "Could not load categories.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!user) {
      router.replace("/auth/login" as any);
      return;
    }
  }, [user, router]);

  const handleCreate = async () => {
    if (!user || !selectedCategoryId) {
      Alert.alert("Select a category", "Choose a trivia category first.");
      return;
    }
    setCreating(true);
    try {
      const room = await createTriviaRoom({
        hostUserId: user.id,
        categoryId: selectedCategoryId,
        totalQuestions: questionCount,
      });
      setCreatedCode(room.code);
      setCreatedRoomId(room.id);
    } catch (e: any) {
      Alert.alert("Create failed", e?.message ?? "Could not create room.");
    } finally {
      setCreating(false);
    }
  };

  const handleGoToLobby = () => {
    if (createdCode) router.replace(`/trivia/room/${createdCode}` as any);
  };

  if (!user) return null;

  if (createdCode && createdRoomId) {
    return (
      <View style={styles.container}>
        <Pressable onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <View style={styles.createdCard}>
          <Ionicons name="checkmark-circle" size={64} color="#22c55e" />
          <Text style={styles.createdTitle}>Room created</Text>
          <Text style={styles.codeLabel}>Share this code with players</Text>
          <Text style={styles.code}>{createdCode}</Text>
          <Pressable
            onPress={handleGoToLobby}
            style={({ pressed }) => [styles.lobbyBtn, pressSoft(pressed)]}
          >
            <Text style={styles.lobbyBtnText}>Open lobby</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable onPress={() => router.back()} style={styles.backRow}>
        <Ionicons name="arrow-back" size={24} color="#fff" />
        <Text style={styles.backText}>Back</Text>
      </Pressable>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Category</Text>
        {loading ? (
          <ActivityIndicator color="#6366f1" style={{ marginVertical: 20 }} />
        ) : (
          <View style={styles.categoryList}>
            {categories.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => setSelectedCategoryId(c.id)}
                style={[
                  styles.categoryCard,
                  selectedCategoryId === c.id && styles.categoryCardSelected,
                ]}
              >
                <Text style={styles.categoryName}>{c.name}</Text>
                {c.description ? (
                  <Text style={styles.categoryDesc} numberOfLines={2}>
                    {c.description}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        )}

        <Text style={styles.sectionTitle}>Number of questions</Text>
        <View style={styles.stepperRow}>
          <Pressable
            onPress={() => setQuestionCount((n) => Math.max(3, n - 1))}
            style={styles.stepperBtn}
          >
            <Ionicons name="remove" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.stepperValue}>{questionCount}</Text>
          <Pressable
            onPress={() => setQuestionCount((n) => Math.min(20, n + 1))}
            style={styles.stepperBtn}
          >
            <Ionicons name="add" size={22} color="#fff" />
          </Pressable>
        </View>

        <Pressable
          onPress={handleCreate}
          disabled={creating || !selectedCategoryId}
          style={[
            styles.createBtn,
            (creating || !selectedCategoryId) && styles.createBtnDisabled,
          ]}
        >
          {creating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="add-circle" size={22} color="#fff" />
              <Text style={styles.createBtnText}>Create room</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060a14" },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
  },
  backText: { color: "#fff", fontWeight: "700", marginLeft: 8 },
  scroll: { paddingHorizontal: 24, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "rgba(255,255,255,0.7)",
    marginBottom: 12,
  },
  categoryList: { gap: 10, marginBottom: 28 },
  categoryCard: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 2,
    borderColor: "transparent",
  },
  categoryCardSelected: {
    borderColor: "#6366f1",
    backgroundColor: "rgba(99,102,241,0.15)",
  },
  categoryName: { color: "#fff", fontSize: 17, fontWeight: "800" },
  categoryDesc: { color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 4 },
  stepperRow: { flexDirection: "row", alignItems: "center", marginBottom: 28, gap: 16 },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(99,102,241,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepperValue: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    minWidth: 40,
    textAlign: "center",
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: "#6366f1",
  },
  createBtnDisabled: { opacity: 0.5 },
  createBtnText: { color: "#fff", fontWeight: "800", fontSize: 17 },
  createdCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  createdTitle: { color: "#fff", fontSize: 22, fontWeight: "900", marginTop: 16 },
  codeLabel: { color: "rgba(255,255,255,0.6)", fontSize: 14, marginTop: 24 },
  code: {
    fontSize: 42,
    fontWeight: "900",
    color: colors.amberBright,
    letterSpacing: 8,
    marginTop: 8,
  },
  lobbyBtn: {
    marginTop: 32,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    backgroundColor: "#6366f1",
  },
  lobbyBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
