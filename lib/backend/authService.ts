// lib/backend/authService.ts
import type { AuthUser, Profile } from "../models/auth";
import { devError } from "../utils/devLog";
import { supabase } from "./supabaseClient";

/**
 * Small helpers & types
 */

// What the store expects from register/login
export type AuthResult = {
  user: AuthUser | null;
  profile: Profile | null;
};

// Normalize helpers
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function normalizePhone(phone: string): string {
  // keep digits only
  return phone.replace(/\D/g, "");
}

/**
 * Determine what the user typed in the "identifier" field.
 * - contains @  -> treat as email
 * - digits only -> treat as phone
 * - else        -> treat as username
 */
type IdentifierKind = "email" | "phone" | "username";

function detectIdentifierKind(value: string): IdentifierKind {
  const trimmed = value.trim();
  if (trimmed.includes("@")) return "email";

  const digitsOnly = trimmed.replace(/\D/g, "");
  if (digitsOnly.length >= 7 && digitsOnly === trimmed.replace(/[^\d]/g, "")) {
    return "phone";
  }

  return "username";
}

// Map supabase auth user → AuthUser
function mapAuthUser(supaUser: any): AuthUser {
  return {
    id: supaUser.id,
    email: supaUser.email ?? null,
  };
}

// Map a profiles row → Profile
function mapProfileRow(row: any | null | undefined): Profile | null {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email ?? null,
    username: row.username ?? null,
    phone: row.phone ?? null,
    display_name: row.display_name ?? null,
    rating: row.rating ?? 1000,
    created_at: row.created_at ?? null,
  };
}

/**
 * Register a new user.
 * - Creates Supabase auth user with email + password
 * - Inserts a row in public.profiles with email + username + phone
 * - Enforces uniqueness of email / username / phone
 */
export async function registerUser(params: {
  email: string;
  username: string;
  password: string;
  phone?: string;
}): Promise<AuthResult> {
  const rawEmail = params.email;
  const rawUsername = params.username;
  const rawPhone = params.phone;

  const email = normalizeEmail(rawEmail);
  const username = normalizeUsername(rawUsername);
  const phone = rawPhone ? normalizePhone(rawPhone) : null;

  // ----- 1. Check for conflicts in profiles -----
  // We already normalized email/username to lowercase in JS,
  // so we don't need SQL lower(...)
  const filters: string[] = [
    `email.eq.${email}`,
    `username.eq.${username}`,
  ];
  if (phone) {
    filters.push(`phone.eq.${phone}`);
  }

  const orFilter = filters.join(",");

  const { data: existingProfiles, error: existingError } = await supabase
    .from("profiles")
    .select("id, email, username, phone")
    .or(orFilter);

  if (existingError) {
    console.error("[registerUser] conflict check error:", existingError);
    throw new Error("Could not validate user uniqueness.");
  }

  if (existingProfiles && existingProfiles.length > 0) {
    // At least one of email/username/phone already exists
    throw new Error("Email, username, or phone is already in use.");
  }

  // ----- 2. Create auth user -----
  const { data: signUpData, error: signUpError } =
    await supabase.auth.signUp({
      email,
      password: params.password,
      options: {
        data: {
          username,
          phone,
        },
      },
    });

  if (signUpError) {
    devError("[registerUser] signUp error:", signUpError);
    throw new Error(signUpError.message);
  }

  const authUser = signUpData.user;
  if (!authUser) {
    // If email confirmation is required, Supabase might not return the user yet
    return { user: null, profile: null };
  }

  const userId = authUser.id;

  // ----- 3. Insert profile row -----
  const { data: profileRows, error: profileError } = await supabase
    .from("profiles")
    .insert([
      {
        id: userId,
        email: email ?? null,
        username,
        phone: phone ?? null,
        display_name: username,
        rating: 1000,
      },
    ])
    .select("*")
    .limit(1);

  if (profileError) {
    devError("[registerUser] insert profile error:", profileError);
    throw new Error("User created but profile could not be saved.");
  }

  const profile = mapProfileRow(profileRows?.[0]);

  return {
    user: mapAuthUser(authUser),
    profile,
  };
}

/**
 * Resolve login identifier (email | username | phone) into a real email.
 * - if identifier contains "@", treat as email directly
 * - if all digits, treat as phone and look up profiles.phone
 * - otherwise, treat as username and look up profiles.username
 */
async function resolveIdentifierToEmail(identifier: string): Promise<string> {
  const trimmed = identifier.trim();

  // Looks like an email
  if (trimmed.includes("@")) {
    return trimmed.toLowerCase();
  }

  // All digits -> phone
  const digitsOnly = /^\d+$/.test(trimmed);
  if (digitsOnly) {
    const { data, error } = await supabase
      .from("profiles")
      .select("email")
      .eq("phone", trimmed)
      .limit(1)
      .maybeSingle();

    if (error) {
      devError("[authService] resolveIdentifierToEmail(phone) error", error);
      throw new Error("Could not look up account by phone.");
    }

    if (!data?.email) {
      throw new Error("No account found for this phone number.");
    }

    return data.email.toLowerCase();
  }

  // Otherwise: username
  const { data, error } = await supabase
    .from("profiles")
    .select("email")
    .eq("username", trimmed)
    .limit(1)
    .maybeSingle();

  if (error) {
    devError("[authService] resolveIdentifierToEmail(username) error", error);
    throw new Error("Could not look up account by username.");
  }

  if (!data?.email) {
    throw new Error("No account found for this username.");
  }

  return data.email.toLowerCase();
}

/**
 * Login with identifier (email | username | phone) + password.
 */
export async function loginWithIdentifierAndPassword(
  identifier: string,
  password: string
): Promise<AuthResult> {
  // 1) Turn identifier into an email we can pass to Supabase
  const email = await resolveIdentifierToEmail(identifier);

  // 2) Sign in
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    devError("[authService] login error:", error);
    throw error;
  }

  const supaUser = data.user;
  if (!supaUser) {
    return { user: null, profile: null };
  }

  const authUser = mapAuthUser(supaUser);

  // 3) Load profile
  const { data: profileRow, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", authUser.id)
    .maybeSingle();

  if (profileError) {
    devError("[authService] login load profile error:", profileError);
    throw profileError;
  }

  const profile = mapProfileRow(profileRow);

  return { user: authUser, profile };
}

/**
 * Logout current user.
 */
export async function logoutCurrentUser(): Promise<void> {
  const { error } = await supabase.auth.signOut();

  if (error) {
    devError("[authService] logout error:", error);
    throw error;
  }
}

/**
 * Restore current auth + profile from Supabase.
 * Use this on app startup to hydrate authStore.
 */
export async function restoreSession(): Promise<{
  user: AuthUser | null;
  profile: Profile | null;
}> {
  // 1) Ask Supabase if a user is currently authenticated
  const { data, error } = await supabase.auth.getUser();

  // If there is simply no session yet, treat it as "logged out"
  if (error) {
    const msg = (error as any)?.message ?? "";
    const name = (error as any)?.name ?? "";

    if (
      name === "AuthSessionMissingError" ||
      msg.includes("Auth session missing")
    ) {
      // No active session – this is normal on cold start
      return { user: null, profile: null };
    }

    console.error("[authService] restoreSession getUser error:", error);
    throw error;
  }

  const supaUser = data.user;
  if (!supaUser) {
    return { user: null, profile: null };
  }

  const authUser = mapAuthUser(supaUser);

  // 2) Load profile row
  const { data: profileRows, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", authUser.id)
    .limit(1);

  if (profileError) {
    devError("[authService] restoreSession profile error:", profileError);
    throw profileError;
  }

  const profile = mapProfileRow(profileRows?.[0] ?? null);

  return { user: authUser, profile };
}
