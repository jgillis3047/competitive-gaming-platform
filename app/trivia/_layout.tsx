import { Stack } from "expo-router";
import React from "react";

export default function TriviaLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="create" />
      <Stack.Screen name="join" />
      <Stack.Screen name="room/[code]" />
      <Stack.Screen name="game/[code]" />
    </Stack>
  );
}
