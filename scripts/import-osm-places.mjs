#!/usr/bin/env node

/**
 * Bulk import parks/gyms/golf places from OSM Overpass into Supabase `courts`.
 *
 * Required env:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 * - node scripts/import-osm-places.mjs --city las-vegas
 * - node scripts/import-osm-places.mjs --city los-angeles
 * - node scripts/import-osm-places.mjs --city phoenix
 * - node scripts/import-osm-places.mjs --all
 *
 * Env: SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL; SUPABASE_SERVICE_ROLE_KEY for upsert.
 * If unset, loads project root `.env` (same rules as `npm run import:osm`).
 */

import fs from "node:fs";
import path from "node:path";
import { extractOsmPhotoUrls } from "./lib/osm-reference-photos.mjs";

function loadDotEnvFromCwd() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnvFromCwd();

/** Public Overpass instances (rotate on 502/503/504). */
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const CITY_BBOX = {
  "las-vegas": { label: "Las Vegas", city: "Las Vegas", state: "NV", bbox: [35.95, -115.42, 36.40, -114.95] },
  "los-angeles": { label: "Los Angeles", city: "Los Angeles", state: "CA", bbox: [33.65, -118.95, 34.35, -117.95] },
  phoenix: { label: "Phoenix", city: "Phoenix", state: "AZ", bbox: [33.20, -112.40, 33.95, -111.80] },
};

function parseArgs(argv) {
  const out = { cities: [], all: false, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--all") out.all = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--city") {
      const v = argv[i + 1];
      if (!v) throw new Error("Missing value for --city");
      out.cities.push(v.toLowerCase());
      i += 1;
    }
  }
  if (out.all) out.cities = Object.keys(CITY_BBOX);
  if (out.cities.length === 0) throw new Error("Provide --city <slug> or --all");
  return out;
}

function mapSportKeys(tags) {
  const sport = String(tags.sport || "").toLowerCase();
  if (!sport) return null;
  const keys = new Set();
  const add = (k) => keys.add(k);
  if (sport.includes("basketball")) add("basketball");
  if (sport.includes("soccer") || sport.includes("football")) add("soccer");
  if (sport.includes("tennis")) add("tennis");
  if (sport.includes("golf")) add("golf");
  if (sport.includes("pickleball")) add("pickleball");
  if (sport.includes("volleyball")) add("volleyball");
  if (sport.includes("running") || sport.includes("athletics")) add("running");
  if (sport.includes("fitness") || sport.includes("weight")) add("fitness");
  return keys.size ? [...keys] : null;
}

function mapPlaceKind(tags) {
  const leisure = tags.leisure || "";
  const amenity = tags.amenity || "";
  const tourism = tags.tourism || "";
  const landuse = tags.landuse || "";
  const golf = tags.golf || "";
  const sport = tags.sport || "";

  if (leisure === "golf_course" || golf === "driving_range") return "range";
  if (amenity === "golf_course" || tourism === "golf_course") return "range";
  if (amenity === "gym" || leisure === "fitness_centre") return "gym";
  if (sport.includes("basketball") || sport.includes("soccer") || sport.includes("tennis")) return "gym";
  if (amenity === "university" || amenity === "college" || landuse === "education") return "campus";
  if (leisure === "park") return "park";
  return "other";
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function buildOverpassQuery([south, west, north, east]) {
  const area = `(${south},${west},${north},${east})`;
  return `
[out:json][timeout:300];
(
  node["leisure"="park"]${area};
  way["leisure"="park"]${area};
  relation["leisure"="park"]${area};

  node["amenity"="gym"]${area};
  way["amenity"="gym"]${area};
  relation["amenity"="gym"]${area};

  node["leisure"="fitness_centre"]${area};
  way["leisure"="fitness_centre"]${area};
  relation["leisure"="fitness_centre"]${area};

  node["amenity"="university"]${area};
  way["amenity"="university"]${area};
  relation["amenity"="university"]${area};

  node["amenity"="college"]${area};
  way["amenity"="college"]${area};
  relation["amenity"="college"]${area};

  node["leisure"="golf_course"]${area};
  way["leisure"="golf_course"]${area};
  relation["leisure"="golf_course"]${area};

  node["golf"="driving_range"]${area};
  way["golf"="driving_range"]${area};
  relation["golf"="driving_range"]${area};
);
out center tags;
`;
}

function pointForElement(el) {
  if (typeof el.lat === "number" && typeof el.lon === "number") return { lat: el.lat, lng: el.lon };
  if (el.center && typeof el.center.lat === "number" && typeof el.center.lon === "number") {
    return { lat: el.center.lat, lng: el.center.lon };
  }
  return null;
}

function toCourtRows(elements, cityMeta) {
  const rows = [];
  const usedSlugs = new Set();

  for (const el of elements) {
    const tags = el.tags || {};
    const name = String(tags.name || "").trim();
    if (!name) continue;

    const point = pointForElement(el);
    if (!point) continue;

    const kind = mapPlaceKind(tags);
    if (!["park", "gym", "campus", "range", "other"].includes(kind)) continue;

    const osmRef = `osm:${el.type}:${el.id}`;
    let baseSlug = slugify(`${name}-${cityMeta.city}-${kind}`);
    if (!baseSlug) baseSlug = slugify(`${cityMeta.city}-${el.type}-${el.id}`);
    let slug = baseSlug;
    let n = 1;
    while (usedSlugs.has(slug)) {
      n += 1;
      slug = `${baseSlug}-${n}`;
    }
    usedSlugs.add(slug);

    const descParts = [];
    if (tags.operator) descParts.push(`Operator: ${tags.operator}`);
    if (tags.sport) descParts.push(`Sport: ${tags.sport}`);
    const description = descParts.length ? descParts.join(" · ") : null;
    const photoUrls = extractOsmPhotoUrls(tags);

    rows.push({
      slug,
      name,
      description,
      lat: Number(point.lat.toFixed(6)),
      lng: Number(point.lng.toFixed(6)),
      checkin_radius_m: kind === "range" ? 220 : 180,
      city: tags["addr:city"] || cityMeta.city,
      state: tags["addr:state"] || cityMeta.state,
      place_kind: kind,
      sport_keys: mapSportKeys(tags),
      source: "osm",
      source_ref: osmRef,
      imported_at: new Date().toISOString(),
      ...(photoUrls.length ? { photo_paths: photoUrls } : {}),
    });
  }

  return rows;
}

async function fetchOverpassPlaces(cityMeta) {
  const query = buildOverpassQuery(cityMeta.bbox);
  const body = new URLSearchParams({ data: query });
  const retriable = (status) => status === 429 || status === 502 || status === 503 || status === 504;

  let lastErr = null;
  for (const baseUrl of OVERPASS_ENDPOINTS) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const res = await fetch(baseUrl, {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "user-agent": "gaming-app-54-osm-import/1.0",
          },
          body,
        });
        if (!res.ok) {
          const txt = await res.text();
          const msg = `Overpass failed (${res.status}) at ${baseUrl}: ${txt.slice(0, 200)}`;
          if (retriable(res.status) && attempt < 3) {
            console.warn(`[${cityMeta.label}] ${msg} — retry ${attempt}/3 in 12s…`);
            await sleep(12_000);
            continue;
          }
          if (retriable(res.status)) {
            lastErr = new Error(msg);
            break;
          }
          throw new Error(msg);
        }
        const json = await res.json();
        if (baseUrl !== OVERPASS_ENDPOINTS[0]) {
          console.log(`[${cityMeta.label}] OK via ${baseUrl}`);
        }
        return Array.isArray(json.elements) ? json.elements : [];
      } catch (e) {
        lastErr = e;
        if (attempt < 3) {
          console.warn(`[${cityMeta.label}] ${e?.message ?? e} — retry ${attempt}/3 in 12s…`);
          await sleep(12_000);
        }
      }
    }
  }
  throw lastErr ?? new Error("Overpass: all endpoints failed");
}

async function upsertCourts(supabaseUrl, serviceRoleKey, rows) {
  if (rows.length === 0) return { inserted: 0 };
  const res = await fetch(`${supabaseUrl}/rest/v1/courts?on_conflict=source_ref`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase upsert failed (${res.status}): ${txt.slice(0, 400)}`);
  }
  return { inserted: rows.length };
}

async function run() {
  const { cities, dryRun } = parseArgs(process.argv.slice(2));
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!dryRun) {
    if (!supabaseUrl) throw new Error("Set SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL");
    if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for upsert");
  }

  let totalFound = 0;
  let totalPrepared = 0;
  let totalUpserted = 0;

  for (const citySlug of cities) {
    const cityMeta = CITY_BBOX[citySlug];
    if (!cityMeta) throw new Error(`Unknown city "${citySlug}". Use: ${Object.keys(CITY_BBOX).join(", ")}`);

    console.log(`\n[${cityMeta.label}] querying OSM...`);
    const elements = await fetchOverpassPlaces(cityMeta);
    totalFound += elements.length;
    console.log(`[${cityMeta.label}] raw places: ${elements.length}`);

    const rows = toCourtRows(elements, cityMeta);
    totalPrepared += rows.length;
    console.log(`[${cityMeta.label}] normalized rows: ${rows.length}`);

    if (dryRun) {
      console.log(`[${cityMeta.label}] dry-run: skipping upsert`);
      continue;
    }

    const { inserted } = await upsertCourts(supabaseUrl, serviceRoleKey, rows);
    totalUpserted += inserted;
    console.log(`[${cityMeta.label}] upsert attempted: ${inserted}`);
  }

  console.log("\nDone.");
  console.log(`Raw fetched: ${totalFound}`);
  console.log(`Prepared: ${totalPrepared}`);
  if (!dryRun) console.log(`Upsert attempted: ${totalUpserted}`);
}

run().catch((err) => {
  console.error(`\nImport failed: ${err.message}`);
  process.exit(1);
});
