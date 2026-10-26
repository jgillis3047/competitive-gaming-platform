import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Version this key when you change the copy.
 * Example: ack_in_person_disclaimer_v2
 */
export const IN_PERSON_DISCLAIMER_KEY = "ack_in_person_disclaimer_v1";

export const IN_PERSON_DISCLAIMER_TITLE = "In-Person Challenge Rules";

export const IN_PERSON_DISCLAIMER_BODY = [
  "• Both players must check in and submit a match result",
  "• If both players submit the same winner, the match is automatically confirmed",
  "• If submissions don’t match, the match is marked disputed and entry fees are refunded",
  "• Repeated disputes may limit access to higher-stakes in-person challenges",
  "",
  "🎥 Recording is optional but recommended to prevent dishonesty and mismatched submissions.",
].join("\n");

export async function hasAcknowledgedInPersonDisclaimer(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(IN_PERSON_DISCLAIMER_KEY);
    return v === "true";
  } catch {
    return false;
  }
}

export async function acknowledgeInPersonDisclaimer(): Promise<void> {
  try {
    await AsyncStorage.setItem(IN_PERSON_DISCLAIMER_KEY, "true");
  } catch {
    // ignore
  }
}
