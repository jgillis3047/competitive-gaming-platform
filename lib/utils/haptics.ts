// lib/utils/haptics.ts
// Haptic feedback utility for key user interactions
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const isIOS = Platform.OS === "ios";

/** Light tap - for button presses, selections */
export function lightTap() {
  if (isIOS) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/** Medium tap - for confirmations, toggles */
export function mediumTap() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

/** Heavy tap - for significant actions */
export function heavyTap() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
}

/** Success feedback - for wins, completions, achievements */
export function success() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

/** Warning feedback - for alerts, confirmations needed */
export function warning() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
}

/** Error feedback - for failures, errors */
export function error() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
}

/** Selection changed - for pickers, sliders */
export function selection() {
  Haptics.selectionAsync();
}
