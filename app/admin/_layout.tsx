// app/admin/_layout.tsx - Gate: only is_admin can access
import { Stack, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useAuthStore } from "../../lib/data/authStore";

export default function AdminLayout() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const isAdmin = Boolean(profile?.is_admin);
    setAllowed(isAdmin);
    setChecking(false);
    if (!isAdmin) router.replace("/");
  }, [profile?.is_admin, router]);

  if (checking) {
    return (
      <View style={{ flex: 1, backgroundColor: "#050819", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#60a5fa" />
        <Text style={{ color: "#9ca3af", marginTop: 8 }}>Loading...</Text>
      </View>
    );
  }

  if (!allowed) return null;

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: "#050819" },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "800" },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Approve sellers" }} />
    </Stack>
  );
}
