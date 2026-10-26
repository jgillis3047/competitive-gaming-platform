// lib/backend/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import "react-native-url-polyfill/auto";

let AsyncStorage: any = null;
try {
  // Only try to require on native; web can use localStorage
  if (Platform.OS !== "web") {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    AsyncStorage = require("@react-native-async-storage/async-storage").default;
  }
} catch (e) {
  console.warn("[supabaseClient] AsyncStorage not available:", e);
}

// Prefer process.env (Metro inlines EXPO_PUBLIC_*); fallback to app.json extra so URL is never undefined at runtime
function getSupabaseConfig() {
  const fromEnv = {
    url: process.env.EXPO_PUBLIC_SUPABASE_URL as string | undefined,
    key: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string | undefined,
  };
  if (fromEnv.url && fromEnv.key) return fromEnv;
  try {
    const extra = (require("expo-constants").default?.expoConfig?.extra) ?? {};
    return {
      url: fromEnv.url ?? extra.EXPO_PUBLIC_SUPABASE_URL,
      key: fromEnv.key ?? extra.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    };
  } catch {
    return fromEnv;
  }
}

const { url: supabaseUrl, key: supabaseAnonKey } = getSupabaseConfig();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase URL or anon key missing from Expo config");
}

// Storage adapter: works in Expo, Web, and Node (Metro bundling)
// localStorage is undefined when Metro/Node evaluates this file
function getStorage() {
  if (Platform.OS === "web" && typeof localStorage !== "undefined") {
    return {
      getItem: (k: string) => Promise.resolve(localStorage.getItem(k)),
      setItem: (k: string, v: string) => { localStorage.setItem(k, v); return Promise.resolve(); },
      removeItem: (k: string) => { localStorage.removeItem(k); return Promise.resolve(); },
    };
  }
  if (AsyncStorage) {
    return {
      getItem: (k: string) => AsyncStorage.getItem(k),
      setItem: (k: string, v: string) => AsyncStorage.setItem(k, v),
      removeItem: (k: string) => AsyncStorage.removeItem(k),
    };
  }
  // Fallback for Node/Metro (in-memory, no persistence)
  const mem: Record<string, string> = {};
  return {
    getItem: (k: string) => Promise.resolve(mem[k] ?? null),
    setItem: (k: string, v: string) => { mem[k] = v; return Promise.resolve(); },
    removeItem: (k: string) => { delete mem[k]; return Promise.resolve(); },
  };
}

const storage = getStorage();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
