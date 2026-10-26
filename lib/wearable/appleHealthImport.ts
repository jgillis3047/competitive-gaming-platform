// lib/wearable/appleHealthImport.ts — iOS HealthKit workout import (dev client required)

import { Platform } from "react-native";

import type { WearableWorkoutSample } from "./types";
import { distanceToMeters } from "./distanceUnits";

const RUN_ACTIVITY_TYPES = new Set([
  37, // running
  44, // stairClimbing
  49, // trackAndField
  52, // walking
  63, // highIntensityIntervalTraining
  68, // stairs
  71, // wheelchairRunPace
]);

function workoutActivityLabel(type: number): string {
  const labels: Record<number, string> = {
    37: "Running",
    44: "Stair climbing",
    49: "Track & field",
    52: "Walking",
    63: "HIIT",
    68: "Stairs",
    71: "Wheelchair run",
  };
  return labels[type] ?? "Workout";
}

function quantityDurationSec(duration: { quantity: number; unit: string } | undefined): number | null {
  if (!duration) return null;
  const { quantity, unit } = duration;
  if (!Number.isFinite(quantity)) return null;
  const u = unit.toLowerCase();
  if (u === "s" || u === "sec" || u === "min") {
    return u === "min" ? Math.round(quantity * 60) : Math.round(quantity);
  }
  return Math.round(quantity);
}

function mapWorkout(w: {
  uuid: string;
  workoutActivityType: number;
  startDate: Date;
  endDate: Date;
  duration?: { quantity: number; unit: string };
  totalDistance?: { quantity: number; unit: string };
  totalFlightsClimbed?: { quantity: number; unit: string };
}): WearableWorkoutSample {
  const durationSec =
    quantityDurationSec(w.duration) ??
    Math.max(1, Math.round((w.endDate.getTime() - w.startDate.getTime()) / 1000));

  let distanceM: number | null = null;
  if (w.totalDistance) {
    distanceM = distanceToMeters(w.totalDistance.quantity, w.totalDistance.unit);
  }

  let flightsClimbed: number | null = null;
  if (w.totalFlightsClimbed?.quantity != null) {
    flightsClimbed = Math.round(w.totalFlightsClimbed.quantity);
  }

  return {
    source: "apple_health",
    provider: "apple_watch",
    durationSec,
    distanceM,
    startDateIso: w.startDate.toISOString(),
    endDateIso: w.endDate.toISOString(),
    activityLabel: workoutActivityLabel(w.workoutActivityType),
    externalId: w.uuid,
    flightsClimbed,
  };
}

export async function isAppleHealthImportAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  try {
    const HealthKit = await import("@kingstinct/react-native-healthkit");
    return await HealthKit.isHealthDataAvailableAsync();
  } catch {
    return false;
  }
}

export async function importAppleHealthRunWorkouts(limit = 12): Promise<WearableWorkoutSample[]> {
  if (Platform.OS !== "ios") {
    throw new Error("Apple Health import is only available on iOS.");
  }

  const HealthKit = await import("@kingstinct/react-native-healthkit");

  const available = await HealthKit.isHealthDataAvailableAsync();
  if (!available) {
    throw new Error("Health data is not available on this device.");
  }

  await HealthKit.requestAuthorization({ toRead: ["HKWorkoutTypeIdentifier"] });

  const workouts = await HealthKit.queryWorkoutSamples({ limit, ascending: false });
  return workouts
    .filter((w) => RUN_ACTIVITY_TYPES.has(w.workoutActivityType))
    .map(mapWorkout);
}
