import { getMediaDisplayUrl } from "./imageUrls";

function isExternalPhotoUrl(pathOrUrl: string): boolean {
  const s = pathOrUrl.trim();
  return s.startsWith("http://") || s.startsWith("https://");
}

/** Wikimedia / OSM-sourced reference photo attribution when applicable. */
export function referencePhotoAttribution(url: string): string | null {
  const u = url.toLowerCase();
  if (u.includes("wikimedia.org") || u.includes("wikipedia.org")) {
    return "Wikimedia Commons";
  }
  if (u.includes("openstreetmap.org") || u.includes("mapillary.com")) {
    return "OpenStreetMap";
  }
  return null;
}

/** Resolve storage paths or external URLs for arena reference photos. */
export async function resolveArenaPhotoUrls(
  photoPaths: string[] | null | undefined
): Promise<string[]> {
  const paths = (photoPaths ?? []).filter((p) => String(p).trim().length > 0);
  if (!paths.length) return [];
  const urls = await Promise.all(
    paths.map((p) => (isExternalPhotoUrl(p) ? Promise.resolve(p.trim()) : getMediaDisplayUrl(p)))
  );
  return urls.filter((u) => u.length > 0);
}

/** First attribution label for a set of reference photos (free sources). */
export function primaryReferenceAttribution(photoPaths: string[] | null | undefined): string | null {
  for (const p of photoPaths ?? []) {
    if (isExternalPhotoUrl(p)) {
      const a = referencePhotoAttribution(p);
      if (a) return a;
    }
  }
  return null;
}
