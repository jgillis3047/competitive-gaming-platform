// Deep link / legacy path → tab screen
import { Redirect } from "expo-router";

export default function LeaderboardsRedirect() {
  return <Redirect href="/(tabs)/leaderboards" />;
}
