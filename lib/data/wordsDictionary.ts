// Offline English dictionary — assets/words/words-en.txt (npm run fetch:words)
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";

const MIN_LEN = 3;
const MAX_LEN = 7;

type DictionaryCache = {
  byLength: Map<number, string[]>;
  all: Set<string>;
};

let cache: DictionaryCache | null = null;

export async function loadWordsDictionary(): Promise<DictionaryCache> {
  if (cache) return cache;

  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Expo asset bundle
  const asset = Asset.fromModule(require("../../assets/words/words-en.txt"));
  await asset.downloadAsync();

  const uri = asset.localUri ?? asset.uri;
  if (!uri) throw new Error("Dictionary asset missing URI (words-en.txt).");

  const txt = await FileSystem.readAsStringAsync(uri);
  const byLength = new Map<number, string[]>();
  const all = new Set<string>();

  for (const line of txt.split(/\r?\n/)) {
    const w = line.trim().toLowerCase();
    if (w.length < MIN_LEN || w.length > MAX_LEN || !/^[a-z]+$/.test(w)) continue;
    all.add(w);
    const bucket = byLength.get(w.length);
    if (bucket) bucket.push(w);
    else byLength.set(w.length, [w]);
  }

  if (!all.size) throw new Error("Dictionary file is empty or invalid.");

  cache = { byLength, all };
  return cache;
}

export async function hasDictionaryWord(word: string): Promise<boolean> {
  const { all } = await loadWordsDictionary();
  return all.has(word.trim().toLowerCase());
}

export async function getDictionaryWordsOfLength(length: number): Promise<string[]> {
  const { byLength } = await loadWordsDictionary();
  return byLength.get(length) ?? [];
}
