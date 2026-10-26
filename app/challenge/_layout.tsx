// app/challenge/_layout.tsx
import { Stack } from "expo-router";
import React from "react";

export default function ChallengeLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: "#050819" },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "800" },
      }}
    >
      <Stack.Screen name="[id]/index" options={{ title: "Challenge" }} />
      <Stack.Screen name="[id]/submit" options={{ title: "Submit Score" }} />
    </Stack>
  );
}
