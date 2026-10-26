import { Stack } from "expo-router";

export default function VisionLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="shooting-session" />
      <Stack.Screen name="shooting-session/[id]" />
      <Stack.Screen name="activity-practice" />
      <Stack.Screen name="run-wearable" />
      <Stack.Screen name="live-record" options={{ presentation: "fullScreenModal" }} />
    </Stack>
  );
}
