// lib/utils/sounds.ts
// Sound effects utility for app feedback
import { Audio } from "expo-av";

let soundsEnabled = true;

export function setSoundsEnabled(enabled: boolean) {
  soundsEnabled = enabled;
}

export function getSoundsEnabled() {
  return soundsEnabled;
}

const soundCache: Record<string, Audio.Sound> = {};

async function playSound(name: string) {
  if (!soundsEnabled) return;
  
  try {
    // Use system sounds or bundled assets
    // For now, we'll use simple audio feedback patterns
    // You can add custom sound files to assets/sounds/ later
    
    if (!soundCache[name]) {
      const { sound } = await Audio.Sound.createAsync(
        getSoundSource(name),
        { shouldPlay: true, volume: 0.5 }
      );
      soundCache[name] = sound;
    } else {
      await soundCache[name].replayAsync();
    }
  } catch (e) {
    // Silently fail - sounds are non-critical
    console.warn("[sounds] Could not play sound:", name, e);
  }
}

function getSoundSource(name: string) {
  // Map sound names to asset files
  // Add your sound files to assets/sounds/ and require them here
  const sounds: Record<string, any> = {
    // Example: win: require("../../assets/sounds/win.mp3"),
    // For now, return a placeholder that will fail gracefully
  };
  return sounds[name] ?? { uri: "" };
}

/** Play win sound */
export async function playWinSound() {
  await playSound("win");
}

/** Play notification sound */
export async function playNotificationSound() {
  await playSound("notification");
}

/** Play button tap sound */
export async function playTapSound() {
  await playSound("tap");
}

/** Play error sound */
export async function playErrorSound() {
  await playSound("error");
}

/** Play achievement/badge unlock sound */
export async function playAchievementSound() {
  await playSound("achievement");
}

/** Clean up all cached sounds */
export async function unloadAllSounds() {
  for (const sound of Object.values(soundCache)) {
    try {
      await sound.unloadAsync();
    } catch {}
  }
}
