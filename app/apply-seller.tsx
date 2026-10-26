// app/apply-seller.tsx - Become a seller application form
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
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

import { createSellerApplication, getSellerApplicationByUserId } from "../lib/backend/sellers";
import { useAuthStore } from "../lib/data/authStore";
import { pressSoft, pressSoftIcon } from "../lib/ui/pressableStyles";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export default function ApplySellerScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [status, setStatus] = useState<"idle" | "loading" | "pending" | "approved" | "form">("loading");
  const [businessName, setBusinessName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!user?.id) {
        setStatus("idle");
        return;
      }
      const app = await getSellerApplicationByUserId(user.id);
      if (app?.status === "approved") {
        setStatus("approved");
        return;
      }
      if (app?.status === "pending") {
        setStatus("pending");
        return;
      }
      setStatus("form");
    })();
  }, [user?.id]);

  useEffect(() => {
    if (businessName && !slug) setSlug(slugify(businessName));
  }, [businessName, slug]);

  const handleSubmit = async () => {
    if (!user?.id) return;
    const name = businessName.trim();
    if (!name) {
      setError("Business name is required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const result = await createSellerApplication({
      userId: user.id,
      businessName: name,
      slug: slug.trim() || slugify(name),
      description: description.trim() || null,
    });
    setSubmitting(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setStatus("pending");
  };

  useEffect(() => {
    if (status === "approved") router.replace("/seller");
  }, [status, router]);

  if (!user) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressSoftIcon(pressed)]}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.title}>Become a seller</Text>
        </View>
        <View style={styles.center}>
          <Text style={styles.message}>Sign in to apply.</Text>
        </View>
      </View>
    );
  }

  if (status === "loading") {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#60a5fa" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (status === "pending") {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressSoftIcon(pressed)]}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.title}>Become a seller</Text>
        </View>
        <View style={styles.center}>
          <Ionicons name="time-outline" size={48} color="#f59e0b" />
          <Text style={styles.pendingTitle}>Application pending</Text>
          <Text style={styles.pendingText}>
            We&apos;re reviewing your application. You&apos;ll be able to add products and manage orders once approved.
          </Text>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.primaryBtn, pressSoft(pressed)]}>
            <Text style={styles.primaryBtnText}>Back to profile</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (status === "form") {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressSoftIcon(pressed)]}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.title}>Become a seller</Text>
        </View>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.keyboard}
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.hint}>
              List products in the marketplace. Buyers pay with VC. You&apos;ll get a seller dashboard after approval.
            </Text>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <Text style={styles.label}>Business / store name</Text>
            <TextInput
              style={styles.input}
              value={businessName}
              onChangeText={setBusinessName}
              placeholder="e.g. Game Gear Pro"
              placeholderTextColor="#6b7280"
              autoCapitalize="words"
              editable={!submitting}
            />
            <Text style={styles.label}>Store URL (slug)</Text>
            <TextInput
              style={styles.input}
              value={slug}
              onChangeText={setSlug}
              placeholder="game-gear-pro"
              placeholderTextColor="#6b7280"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!submitting}
            />
            <Text style={styles.labelOptional}>Optional: short description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="What you sell..."
              placeholderTextColor="#6b7280"
              multiline
              numberOfLines={3}
              editable={!submitting}
            />
            <Pressable
              onPress={handleSubmit}
              disabled={submitting}
              style={({ pressed }) => [styles.primaryBtn, (pressed || submitting) && { opacity: 0.9 }]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Submit application</Text>
              )}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050819" },
  keyboard: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  backBtn: { marginRight: 16 },
  title: { flex: 1, fontSize: 20, fontWeight: "800", color: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  loadingText: { color: "#9ca3af", marginTop: 8 },
  message: { color: "#9ca3af", fontSize: 16 },
  pendingTitle: { color: "#fff", fontSize: 18, fontWeight: "700", marginTop: 12, textAlign: "center" },
  pendingText: { color: "#9ca3af", fontSize: 14, marginTop: 8, textAlign: "center", maxWidth: 320 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  hint: { color: "#9ca3af", fontSize: 14, marginBottom: 20 },
  label: { color: "rgba(255,255,255,0.9)", fontSize: 14, fontWeight: "600", marginBottom: 6 },
  labelOptional: { color: "rgba(255,255,255,0.5)", fontSize: 14, marginBottom: 6 },
  input: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#fff",
    marginBottom: 16,
  },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  errorText: { color: "#f87171", fontSize: 14, marginBottom: 12 },
  primaryBtn: {
    backgroundColor: "#4f46e5",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
