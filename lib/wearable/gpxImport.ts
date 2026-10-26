// lib/wearable/gpxImport.ts — Parse Garmin / GPS export GPX for run proof

import * as FileSystem from "expo-file-system";

import type { WearableWorkoutSample } from "./types";
import { distanceToMeters } from "./distanceUnits";

function parseIsoOrNull(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function durationFromTrackpoints(xml: string): number | null {
  const times = [...xml.matchAll(/<time>([^<]+)<\/time>/gi)].map((m) => m[1]);
  if (times.length < 2) return null;
  const start = new Date(times[0]).getTime();
  const end = new Date(times[times.length - 1]).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return Math.round((end - start) / 1000);
}

function distanceFromTrackpoints(xml: string): number | null {
  const lats = [...xml.matchAll(/lat="([^"]+)"/gi)].map((m) => parseFloat(m[1]));
  const lons = [...xml.matchAll(/lon="([^"]+)"/gi)].map((m) => parseFloat(m[1]));
  if (lats.length < 2 || lons.length < 2) return null;

  let total = 0;
  const n = Math.min(lats.length, lons.length);
  for (let i = 1; i < n; i++) {
    total += haversineM(lats[i - 1], lons[i - 1], lats[i], lons[i]);
  }
  return total > 0 ? total : null;
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function parseGpxUri(uri: string): Promise<WearableWorkoutSample | null> {
  const xml = await FileSystem.readAsStringAsync(uri);
  if (!xml.includes("<gpx")) return null;

  const nameMatch = xml.match(/<name>([^<]+)<\/name>/i);
  const activityLabel = nameMatch?.[1]?.trim() || "GPX activity";

  const startIso =
    parseIsoOrNull(xml.match(/<time>([^<]+)<\/time>/i)?.[1]) ?? new Date().toISOString();

  let durationSec =
    parseFloat(xml.match(/<duration>([^<]+)<\/duration>/i)?.[1] ?? "") || null;
  if (durationSec == null || !Number.isFinite(durationSec)) {
    durationSec = durationFromTrackpoints(xml);
  }
  if (durationSec == null || durationSec <= 0) return null;

  let distanceM: number | null = null;
  const distMatch = xml.match(/<distance>([^<]+)<\/distance>/i);
  if (distMatch) {
    const val = parseFloat(distMatch[1]);
    const unit = xml.match(/<distance[^>]*unit="([^"]+)"/i)?.[1] ?? "m";
    if (Number.isFinite(val)) distanceM = distanceToMeters(val, unit);
  }
  if (distanceM == null) {
    distanceM = distanceFromTrackpoints(xml);
  }

  const endDate = new Date(new Date(startIso).getTime() + durationSec * 1000);

  return {
    source: "garmin_gpx",
    provider: "garmin",
    durationSec: Math.round(durationSec),
    distanceM,
    startDateIso: startIso,
    endDateIso: endDate.toISOString(),
    activityLabel,
  };
}
