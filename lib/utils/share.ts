// lib/utils/share.ts
// Social sharing utilities
import { Share, Platform } from "react-native";

import { APP_DISPLAY_NAME } from "../theme/brand";

export type ShareContent = {
  title?: string;
  message: string;
  url?: string;
};

export async function shareToSocial(content: ShareContent): Promise<boolean> {
  try {
    const result = await Share.share({
      title: content.title,
      message: content.url 
        ? `${content.message}\n\n${content.url}` 
        : content.message,
      url: Platform.OS === "ios" ? content.url : undefined,
    });
    return result.action === Share.sharedAction;
  } catch (e) {
    console.warn("[share] error:", e);
    return false;
  }
}

export function getWinShareContent(opponentName: string, gameName: string): ShareContent {
  return {
    title: "I won!",
    message: `Just beat ${opponentName} in ${gameName} on ${APP_DISPLAY_NAME}! Who's next?`,
  };
}

export function getBadgeShareContent(badgeLabel: string, badgeDescription: string): ShareContent {
  return {
    title: "New Badge!",
    message: `I just unlocked the "${badgeLabel}" badge! ${badgeDescription}`,
  };
}

export function getStreakShareContent(streak: number): ShareContent {
  return {
    title: `${streak} Win Streak!`,
    message: `I'm on a ${streak} game winning streak on ${APP_DISPLAY_NAME}! Can anyone stop me?`,
  };
}

export function getChallengeShareContent(challengeTitle: string): ShareContent {
  return {
    title: "Challenge Created",
    message: `I just created a challenge: "${challengeTitle}" - Join me on ${APP_DISPLAY_NAME}!`,
  };
}

export function getProfileShareContent(displayName: string, username: string): ShareContent {
  return {
    title: "Check out my profile",
    message: `Check out ${displayName} (@${username}) on ${APP_DISPLAY_NAME}!`,
  };
}
