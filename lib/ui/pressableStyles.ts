import type { ViewStyle } from "react-native";

type PressStyle = ViewStyle | undefined;

function pressStyle(pressed: boolean, opacity: number, scale: number): PressStyle {
  if (!pressed) return undefined;
  return { opacity, transform: [{ scale }] };
}

export function pressSoft(pressed: boolean): PressStyle {
  return pressStyle(pressed, 0.9, 0.98);
}

export function pressSoftIcon(pressed: boolean): PressStyle {
  return pressStyle(pressed, 0.7, 0.96);
}

export function pressSubtle(pressed: boolean): PressStyle {
  return pressStyle(pressed, 0.85, 0.98);
}
