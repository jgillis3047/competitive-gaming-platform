// Near-you activity lines for Leaderboards → Spots (backed by spots_activity_near RPC).
import { supabase } from "./supabaseClient";

export async function fetchSpotsActivityNear(
  lat: number,
  lng: number,
  radiusKm: number = 50
): Promise<string[]> {
  const { data, error } = await supabase.rpc("spots_activity_near", {
    p_lat: lat,
    p_lng: lng,
    p_radius_km: radiusKm,
  });
  if (error) throw error;
  const rows = (data ?? []) as { line?: string; sort_order?: number }[];
  return rows
    .filter((r) => typeof r.line === "string" && r.line.trim().length > 0)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((r) => r.line!.trim());
}
