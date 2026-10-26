// app/seller/_layout.tsx
import { Stack, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { getSellerByUserId } from "../../lib/backend/sellers";
import { useAuthStore } from "../../lib/data/authStore";

export default function SellerLayout() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    (async () => {
      if (!userId) {
        setAllowed(false);
        setChecking(false);
        return;
      }
      const seller = await getSellerByUserId(userId);
      setAllowed(!!seller);
      setChecking(false);
      if (!seller) router.replace("/");
    })();
  }, [userId, router]);

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
      <Stack.Screen name="index" options={{ title: "Seller dashboard" }} />
      <Stack.Screen name="products" options={{ title: "Products" }} />
      <Stack.Screen name="orders" options={{ title: "Orders" }} />
    </Stack>
  );
}
