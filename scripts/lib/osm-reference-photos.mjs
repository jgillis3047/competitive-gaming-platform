/**
 * Free reference photos for OSM / legacy courts:
 * 1) OSM tags (image, wikimedia_commons, …)
 * 2) Wikimedia Commons geosearch near lat/lng
 */

const WIKIMEDIA_API = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT = "gaming-app-54-reference-photos/1.0 (arena discovery; contact: support)";

/** @param {string} url */
function isHttpUrl(url) {
  const t = String(url ?? "").trim();
  return t.startsWith("http://") || t.startsWith("https://");
}

/**
 * @param {string} value OSM wikimedia_commons tag
 * @returns {string | null}
 */
export function wikimediaCommonsTagToUrl(value) {
  let name = String(value ?? "").trim();
  if (!name) return null;
  if (isHttpUrl(name)) return name;
  if (name.startsWith("Category:")) return null;
  if (!name.startsWith("File:")) name = `File:${name}`;
  const filePart = name.slice("File:".length).replace(/ /g, "_");
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filePart)}?width=960`;
}

/**
 * @param {Record<string, string>} tags
 * @returns {string[]}
 */
export function extractOsmPhotoUrls(tags) {
  if (!tags || typeof tags !== "object") return [];
  const urls = [];
  const seen = new Set();

  /** @param {string | undefined} raw */
  const add = (raw) => {
    const u = normalizeReferencePhotoUrl(raw);
    if (u && !seen.has(u)) {
      seen.add(u);
      urls.push(u);
    }
  };

  for (const [key, value] of Object.entries(tags)) {
    const v = String(value ?? "").trim();
    if (!v) continue;

    if (key === "image" || key.startsWith("image:") || key === "photo" || key.startsWith("photo:")) {
      add(v);
      continue;
    }
    if (key === "wikimedia_commons" || key.startsWith("wikimedia_commons:")) {
      const w = wikimediaCommonsTagToUrl(v);
      if (w) add(w);
    }
  }

  return urls.slice(0, 3);
}

/** @param {string | undefined} raw */
export function normalizeReferencePhotoUrl(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (isHttpUrl(s)) return s;
  if (s.startsWith("File:") || s.includes(".jpg") || s.includes(".png") || s.includes(".webp")) {
    return wikimediaCommonsTagToUrl(s);
  }
  return null;
}

/**
 * @param {string} sourceRef e.g. osm:node:12345
 * @returns {{ type: string, id: string } | null}
 */
export function parseOsmSourceRef(sourceRef) {
  const m = /^osm:(node|way|relation):(\d+)$/i.exec(String(sourceRef ?? "").trim());
  if (!m) return null;
  return { type: m[1].toLowerCase(), id: m[2] };
}

async function fetchOverpassJson(baseUrl, body, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": USER_AGENT,
      },
      body,
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} type
 * @param {string} id
 * @param {string[]} overpassEndpoints
 */
export async function fetchOsmElementTags(type, id, overpassEndpoints) {
  const query = `[out:json][timeout:25];${type}(${id});out tags;`;
  const body = new URLSearchParams({ data: query });

  for (const baseUrl of overpassEndpoints) {
    const json = await fetchOverpassJson(baseUrl, body);
    const el = (json?.elements ?? []).find((e) => String(e.id) === String(id));
    if (el?.tags) return el.tags;
  }
  return null;
}

/** @param {string} name */
function nameTokens(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

/**
 * @param {number} lat
 * @param {number} lng
 * @param {string} arenaName
 * @param {number} radiusM
 * @returns {Promise<string[]>}
 */
export async function fetchWikimediaPhotosNear(lat, lng, arenaName, radiusM = 750) {
  const url = new URL(WIKIMEDIA_API);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("generator", "geosearch");
  url.searchParams.set("ggscoord", `${lat}|${lng}`);
  url.searchParams.set("ggsradius", String(Math.min(Math.max(radiusM, 50), 5000)));
  url.searchParams.set("ggslimit", "15");
  url.searchParams.set("ggsnamespace", "6");
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url");
  url.searchParams.set("iiurlwidth", "960");

  const res = await fetch(url.toString(), {
    headers: { "user-agent": USER_AGENT },
  });
  if (!res.ok) return [];

  const json = await res.json();
  const pages = json?.query?.pages ?? {};
  const tokens = nameTokens(arenaName);
  const candidates = [];

  for (const page of Object.values(pages)) {
    const info = page.imageinfo?.[0];
    const thumb = info?.thumburl || info?.url;
    if (!thumb || !isHttpUrl(thumb)) continue;
    const title = String(page.title ?? "").toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (title.includes(t)) score += 3;
    }
    if (title.includes("basketball") || title.includes("court") || title.includes("park")) score += 1;
    const proximity = typeof page.index === "number" ? Math.max(0, 15 - page.index) : 0;
    score += proximity;
    candidates.push({ url: thumb, score, index: page.index ?? 999 });
  }

  candidates.sort((a, b) => b.score - a.score || a.index - b.index);

  const urls = [];
  const seen = new Set();
  const hasNameMatch = (c) => c.score >= 3;
  const ranked = candidates.filter((c) => hasNameMatch(c));
  const pool = ranked.length ? ranked : candidates.slice(0, 1);

  for (const c of pool) {
    if (!seen.has(c.url)) {
      seen.add(c.url);
      urls.push(c.url);
    }
    if (urls.length >= 2) break;
  }

  if (urls.length) return urls;

  return fetchWikimediaSearchPhotos(arenaName);
}

/** Text search on Commons when geosearch returns nothing nearby. */
async function fetchWikimediaSearchPhotos(arenaName) {
  const q = [arenaName, "basketball court", "park"].filter(Boolean).join(" ");
  const url = new URL(WIKIMEDIA_API);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", q);
  url.searchParams.set("srnamespace", "6");
  url.searchParams.set("srlimit", "8");
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url");
  url.searchParams.set("iiurlwidth", "960");

  const res = await fetch(url.toString(), { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) return [];
  const json = await res.json();
  const hits = json?.query?.search ?? [];
  const tokens = nameTokens(arenaName);
  const urls = [];

  for (const hit of hits) {
    const title = String(hit.title ?? "");
    const titleLower = title.toLowerCase();
    const nameMatch = tokens.some((t) => titleLower.includes(t));
    if (!nameMatch) continue;
    const fileUrl = wikimediaCommonsTagToUrl(title);
    if (fileUrl) urls.push(fileUrl);
    if (urls.length >= 1) break;
  }

  return urls;
}

/**
 * @param {{ lat: number, lng: number, name: string, source_ref?: string | null, tags?: Record<string, string> | null }} court
 * @param {{ overpassEndpoints: string[], wikimediaRadiusM?: number }} opts
 * @returns {Promise<{ urls: string[], source: 'osm_tags' | 'wikimedia' | null }>}
 */
export async function resolveFreeReferencePhotos(court, opts) {
  const { overpassEndpoints, wikimediaRadiusM = 750 } = opts;

  if (court.tags) {
    const fromTags = extractOsmPhotoUrls(court.tags);
    if (fromTags.length) return { urls: fromTags, source: "osm_tags" };
  }

  const parsed = parseOsmSourceRef(court.source_ref);

  const [fromOsmTags, fromWiki] = await Promise.all([
    parsed
      ? fetchOsmElementTags(parsed.type, parsed.id, overpassEndpoints).then((tags) =>
          extractOsmPhotoUrls(tags ?? {})
        )
      : Promise.resolve([]),
    fetchWikimediaPhotosNear(court.lat, court.lng, court.name, wikimediaRadiusM),
  ]);

  if (fromOsmTags.length) return { urls: fromOsmTags, source: "osm_tags" };
  if (fromWiki.length) return { urls: fromWiki, source: "wikimedia" };

  return { urls: [], source: null };
}

/** @param {string} url */
export function referencePhotoAttribution(url) {
  const u = String(url ?? "").toLowerCase();
  if (u.includes("wikimedia.org") || u.includes("wikipedia.org")) {
    return "Photo: Wikimedia Commons (CC / public domain — verify on Commons)";
  }
  if (u.includes("openstreetmap.org") || u.includes("mapillary.com")) {
    return "Photo: OpenStreetMap contributors";
  }
  return null;
}
