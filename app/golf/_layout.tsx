import { Stack } from "expo-router";

export default function GolfLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="start" />
      <Stack.Screen name="[sessionId]/checkin" />
      <Stack.Screen name="[sessionId]/score" />
      <Stack.Screen name="[sessionId]/submit" />
    </Stack>
  );
}
