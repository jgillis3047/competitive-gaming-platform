import * as Location from "expo-location";
import { Platform } from "react-native";

function devMockCoords(): { lat: number; lng: number } | null {
  if (!__DEV__) return null;
  const lat = Number(process.env.EXPO_PUBLIC_DEV_MOCK_LAT);
  const lng = Number(process.env.EXPO_PUBLIC_DEV_MOCK_LNG);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/**
 * Resolves lat/lng for foreground use. Android emulators often fail a single
 * `getCurrentPositionAsync(Balanced)`; this chains last-known + multiple accuracies.
 * In `__DEV__`, set `EXPO_PUBLIC_DEV_MOCK_LAT` / `EXPO_PUBLIC_DEV_MOCK_LNG` in `.env` if needed.
 */
export async function resolveForegroundLatLng(): Promise<{ lat: number; lng: number }> {
  const mock = devMockCoords();
  if (mock) return mock;

  if (Platform.OS === "android") {
    try {
      await Location.enableNetworkProviderAsync();
    } catch {
      /* user dismissed or mode already OK */
    }
  }

  const last = await Location.getLastKnownPositionAsync({
    maxAge: 1000 * 60 * 60 * 24,
  });
  if (last?.coords != null) {
    const { latitude: lat, longitude: lng } = last.coords;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }

  const order = [
    Location.Accuracy.Lowest,
    Location.Accuracy.Low,
    Location.Accuracy.Balanced,
    Location.Accuracy.High,
    Location.Accuracy.Highest,
  ];

  let lastErr: unknown;
  for (const accuracy of order) {
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy,
        mayShowUserSettingsDialog: true,
      });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch (e) {
      lastErr = e;
    }
  }

  const msg =
    typeof (lastErr as { message?: string })?.message === "string"
      ? (lastErr as { message: string }).message
      : "Could not get current location.";
  throw new Error(msg);
}
