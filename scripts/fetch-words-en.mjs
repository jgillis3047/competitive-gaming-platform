/**
 * Downloads a real English dictionary into assets/words/words-en.txt
 * Source: dwyl/english-words words_alpha (dictionary words only — no ngram junk)
 * Filtered to 3–7 letters for the 7-tile Anagrams rack.
 *
 * Usage: node scripts/fetch-words-en.mjs
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "assets", "words", "words-en.txt");
const URL = "https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt";
const MIN_LEN = 3;
const MAX_LEN = 7;

async function main() {
  await mkdir(dirname(OUT), { recursive: true });
  console.log("Downloading dictionary (words_alpha)…");
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);

  const text = await res.text();
  const kept = [];
  for (const line of text.split(/\r?\n/)) {
    const w = line.trim().toLowerCase();
    if (w.length < MIN_LEN || w.length > MAX_LEN) continue;
    if (!/^[a-z]+$/.test(w)) continue;
    kept.push(w);
  }

  await writeFile(OUT, kept.join("\n") + "\n", "utf8");
  console.log(`Saved ${kept.length.toLocaleString()} words (${MIN_LEN}–${MAX_LEN} letters) → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
