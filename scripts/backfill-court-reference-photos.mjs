#!/usr/bin/env node

/**
 * Backfill free reference photos for courts with empty photo_paths.
 * Sources: OSM image tags → Wikimedia Commons geosearch.
 *
 * Env: SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node scripts/backfill-court-reference-photos.mjs
 *   node scripts/backfill-court-reference-photos.mjs --dry-run --limit 20
 *   node scripts/backfill-court-reference-photos.mjs --city "Las Vegas"
 *   node scripts/backfill-court-reference-photos.mjs --court-id <uuid>
 */

import fs from "node:fs";
import path from "node:path";
import { resolveFreeReferencePhotos } from "./lib/osm-reference-photos.mjs";

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

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs(argv) {
  const out = { dryRun: false, limit: 80, city: null, courtId: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--limit") {
      out.limit = Number(argv[++i] ?? 80);
    } else if (a === "--city") {
      out.city = argv[++i] ?? null;
    } else if (a === "--court-id") {
      out.courtId = argv[++i] ?? null;
    }
  }
  return out;
}

async function fetchCourtsNeedingPhotos(supabaseUrl, serviceRoleKey, opts) {
  const params = new URLSearchParams();
  params.set(
    "select",
    "id,name,lat,lng,city,source,source_ref,photo_paths"
  );
  params.set("photo_paths", "eq.{}");
  params.set("order", "name.asc");
  params.set("limit", String(opts.limit));
  if (opts.courtId) {
    params.delete("photo_paths");
    params.set("id", `eq.${opts.courtId}`);
  } else if (opts.city) {
    params.set("city", `ilike.*${opts.city}*`);
  }

  const res = await fetch(`${supabaseUrl}/rest/v1/courts?${params}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Fetch courts failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

async function patchCourtPhotos(supabaseUrl, serviceRoleKey, courtId, photoPaths) {
  const res = await fetch(`${supabaseUrl}/rest/v1/courts?id=eq.${courtId}`, {
    method: "PATCH",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ photo_paths: photoPaths }),
  });
  if (!res.ok) {
    throw new Error(`Patch failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
}

async function run() {
  const opts = parseArgs(process.argv.slice(2));
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) throw new Error("Set SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");

  const courts = await fetchCourtsNeedingPhotos(supabaseUrl, serviceRoleKey, opts);
  console.log(`Courts to process: ${courts.length}${opts.dryRun ? " (dry-run)" : ""}`);

  let updated = 0;
  let skipped = 0;

  for (const court of courts) {
    const existing = court.photo_paths ?? [];
    if (existing.length > 0 && !opts.courtId) {
      skipped += 1;
      continue;
    }

    process.stdout.write(`• ${court.name} … `);

    try {
      const { urls, source } = await resolveFreeReferencePhotos(
        {
          lat: court.lat,
          lng: court.lng,
          name: court.name,
          source_ref: court.source_ref,
        },
        { overpassEndpoints: OVERPASS_ENDPOINTS }
      );

      if (!urls.length) {
        console.log("no photo found");
        skipped += 1;
        await sleep(1200);
        continue;
      }

      console.log(`${source} → ${urls.length} photo(s)`);
      if (!opts.dryRun) {
        await patchCourtPhotos(supabaseUrl, serviceRoleKey, court.id, urls);
        updated += 1;
      } else {
        console.log(`  ${urls[0]}`);
        updated += 1;
      }
    } catch (e) {
      console.log(`error: ${e?.message ?? e}`);
      skipped += 1;
    }

    await sleep(800);
  }

  console.log("\nDone.");
  console.log(`Updated: ${updated}`);
  console.log(`Skipped / not found: ${skipped}`);
}

run().catch((err) => {
  console.error(`\nBackfill failed: ${err.message}`);
  process.exit(1);
});
