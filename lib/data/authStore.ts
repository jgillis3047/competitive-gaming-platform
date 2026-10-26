// app/data/authStore.ts
import { create } from "zustand";
import { challengeTotp, listTotpFactors, verifyTotpChallenge } from "../backend/mfa";
import { supabase } from "../backend/supabaseClient";
import { ensureWalletAccountForUser } from "../backend/walletService";
import { APP_SCHEME } from "../theme/brand";
import { isTimeoutError, withTimeout } from "../utils/asyncTimeout";
import { devLog } from "../utils/devLog";
import { normalizePhoneToE164 } from "../utils/phoneFormat";

const AUTH_RESTORE_TIMEOUT_MS = 12_000;

// Minimal shapes – can be tightened later if needed
type AuthUser = {
  id: string;
  email: string | null;
};

export type Profile = {
  id: string;
  email: string | null;
  username: string | null;
  display_name: string | null;
  rating: number | null;
  phone: string | null;
  avatar_url: string | null;
  created_at: string | null;
  is_admin: boolean;
};

type AuthState = {
  user: AuthUser | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;
  /** After email/password login when TOTP 2FA is enabled */
  mfaLoginRequired: boolean;
  mfaLoginFactorId: string | null;

  clearError: () => void;

  restoreSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  loginWithPhoneOtp: (phone: string) => Promise<void>;
  verifyPhoneOtp: (phone: string, token: string) => Promise<boolean>;
  register: (
    email: string,
    password: string,
    username: string,
    phone?: string
  ) => Promise<boolean>;
  logout: () => Promise<void>;
  resetPasswordForEmail: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateUsername: (username: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  requestPhoneChange: (phone: string) => Promise<void>;
  verifyPhoneChange: (phone: string, token: string) => Promise<boolean>;
  removePhoneFromProfile: () => Promise<void>;
  completeMfaLogin: (code: string) => Promise<boolean>;
  clearMfaLogin: () => void;
};

// ---- internal helper to load profile for a user id ----
async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    devLog("[authStore] fetchProfile error", error);
    return null;
  }

  if (!data) return null;

  return {
    id: data.id,
    email: data.email ?? null,
    username: data.username ?? null,
    display_name: data.display_name ?? null,
    rating: data.rating ?? null,
    phone: data.phone ?? null,
    avatar_url: data.avatar_url ?? null,
    created_at: data.created_at ?? null,
    is_admin: Boolean(data.is_admin),
  };
}

/** Ensures concurrent `restoreSession()` calls share one async run (avoids stuck splash if one call bails early). */
let restoreSessionInFlight: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  loading: false,
  error: null,
  initialized: false,
  mfaLoginRequired: false,
  mfaLoginFactorId: null,

  clearError: () => set({ error: null }),
  clearMfaLogin: () => set({ mfaLoginRequired: false, mfaLoginFactorId: null }),

  // ---------------------------------------------------
  // Restore session on app startup
  // ---------------------------------------------------
  restoreSession: async () => {
    if (restoreSessionInFlight) {
      return restoreSessionInFlight;
    }

    restoreSessionInFlight = (async () => {
      set({ loading: true, error: null });

      try {
        // Prefer getUser() (validates with server). On slow networks, fall back to cached getSession()
        // so the app still opens instead of hanging on the splash spinner.
        let user: { id: string; email?: string | null } | null = null;

        try {
          const { data, error } = await withTimeout(
            supabase.auth.getUser(),
            AUTH_RESTORE_TIMEOUT_MS,
            "Session check timed out"
          );
          if (error) devLog("[authStore] restoreSession getUser error", error);
          user = data.user;
        } catch (e) {
          devLog("[authStore] restoreSession getUser failed", e);
          // Only trust a cached session when the server check timed out (slow network).
          // Other failures (invalid/expired JWT) must not resurrect a stale "ghost" user.
          if (isTimeoutError(e)) {
            const { data: sessData, error: sessErr } = await supabase.auth.getSession();
            if (sessErr) devLog("[authStore] restoreSession getSession error", sessErr);
            user = sessData.session?.user ?? null;
            if (user) devLog("[authStore] using cached session after timeout");
          } else {
            await supabase.auth.signOut({ scope: "local" }).catch(() => {});
          }
        }
        if (!user) {
          set({
            user: null,
            profile: null,
            loading: false,
            error: null,
            initialized: true,
          });
          return;
        }

        const authUser: AuthUser = {
          id: user.id,
          email: user.email ?? null,
        };

        // If the auth user exists but the profiles row is missing or unreadable,
        // make sure we still end up with a real profile (avoids showing "@player / 1000 Rating"
        // after reloads).
        let profile = await fetchProfile(authUser.id);
        if (!profile) {
          // If we don't have email (common for phone OTP), don't overwrite an existing
          // display_name on conflict; pass "" so the RPC preserves current values.
          const fallbackDisplayName = authUser.email ? String(authUser.email).split("@")[0] : "";
          try {
            await supabase.rpc("create_profile_for_self", {
              p_username: null,
              p_display_name: fallbackDisplayName,
              p_phone: null,
            });
          } catch (e) {
            // Keep going; we'll re-attempt a fetch and fall back to null if it still fails.
            devLog("[authStore] restoreSession create_profile_for_self failed:", e);
          }
          profile = await fetchProfile(authUser.id);
        }

        // Wallet bootstrap must not block app open on slow networks.
        void ensureWalletAccountForUser(authUser.id).catch((e) =>
          devLog("[authStore] ensureWalletAccountForUser failed:", e)
        );

        set({
          user: authUser,
          profile,
          loading: false,
          error: null,
          initialized: true,
        });
      } catch (e: any) {
        devLog("[authStore] restoreSession unexpected error", e);
        set({
          user: null,
          profile: null,
          loading: false,
          error: e?.message ?? "Failed to restore session",
          initialized: true,
        });
      }
    })();

    try {
      await restoreSessionInFlight;
    } finally {
      restoreSessionInFlight = null;
    }
  },

  // ---------------------------------------------------
  // Login (email + password ONLY for now)
  // ---------------------------------------------------
  login: async (email: string, password: string) => {
    set({ loading: true, error: null });

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        devLog("[authStore] login error", error);
        await supabase.auth.signOut({ scope: "local" }).catch(() => {});
        set({
          user: null,
          profile: null,
          loading: false,
          error: error.message,
        });
        return false;
      }

      if (!data.session) {
        await supabase.auth.signOut({ scope: "local" }).catch(() => {});
        set({
          user: null,
          profile: null,
          loading: false,
          error: "No session returned from login.",
        });
        return false;
      }

      const authUser: AuthUser = {
        id: data.session.user.id,
        email: data.session.user.email ?? null,
      };

      const profile = await fetchProfile(authUser.id);

      const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!aalError && aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
        const factors = await listTotpFactors();
        const verified = factors.find((f) => f.status === "verified");
        if (verified) {
          set({
            user: authUser,
            profile,
            loading: false,
            error: null,
            initialized: true,
            mfaLoginRequired: true,
            mfaLoginFactorId: verified.id,
          });
          return true;
        }
      }

      await ensureWalletAccountForUser(authUser.id);

      set({
        user: authUser,
        profile,
        loading: false,
        error: null,
        initialized: true,
        mfaLoginRequired: false,
        mfaLoginFactorId: null,
      });
      return true;
    } catch (e: any) {
      devLog("[authStore] login unexpected error", e);
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      set({
        user: null,
        profile: null,
        loading: false,
        error: e?.message ?? "Login failed.",
      });
      return false;
    }
  },

  // ---------------------------------------------------
  // Register
  // ---------------------------------------------------
  register: async (
    email: string,
    password: string,
    username: string,
    phone?: string
  ) => {
    set({ loading: true, error: null });

    try {
      // 1) Create auth user
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username.trim(),
            phone: phone?.trim() || null,
          },
        },
      });

      if (error) {
        devLog("[authStore] register auth error", error);
        set({ loading: false, error: error.message });
        return false;
      }

      const user = data.user;
      if (!user) {
        set({
          loading: false,
          error: "No user returned from sign up.",
        });
        return false;
      }

      // Set session immediately so the next request (RPC) is authenticated
      if (data.session) {
        await supabase.auth.setSession(data.session);
      }

      // 2) Ensure profile row exists (RPC bypasses RLS)
      const displayName = username.trim() || email?.split("@")[0] || "Player";
      const { error: profileError } = await supabase.rpc("create_profile_for_self", {
        p_username: username.trim() || null,
        p_display_name: displayName,
        p_phone: phone?.trim() || null,
      });
      if (profileError) {
        devLog("[authStore] register profile error", profileError);
        set({ loading: false, error: profileError.message });
        return false;
      }

      // 3) Ensure wallet exists (trigger may create it; if not, ensureWalletAccountForUser will create)
      await ensureWalletAccountForUser(user.id);

      // 4) Load profile into store
      const profile = await fetchProfile(user.id);

      set({
        user: { id: user.id, email: user.email ?? null },
        profile,
        loading: false,
        error: null,
        initialized: true,
      });
      return true;
    } catch (e: any) {
      devLog("[authStore] register unexpected error", e);
      set({
        loading: false,
        error: e?.message ?? "Registration failed.",
        initialized: true,
      });
      return false;
    }
  },

  // ---------------------------------------------------
  // Logout
  // ---------------------------------------------------
  logout: async () => {
    set({ loading: true, error: null });
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        devLog("[authStore] logout error", error);
        set({
          loading: false,
          error: error.message,
        });
        return;
      }

      set({
        user: null,
        profile: null,
        loading: false,
        error: null,
        initialized: true,
        mfaLoginRequired: false,
        mfaLoginFactorId: null,
      });
    } catch (e: any) {
      devLog("[authStore] logout unexpected error", e);
      set({
        user: null,
        profile: null,
        loading: false,
        error: e?.message ?? "Logout failed.",
        initialized: true,
        mfaLoginRequired: false,
        mfaLoginFactorId: null,
      });
    }
  },

  // ---------------------------------------------------
  // Password reset (forgot password)
  // ---------------------------------------------------
  resetPasswordForEmail: async (email: string) => {
    set({ loading: true, error: null });
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${APP_SCHEME}://auth/reset-password`,
      });
      if (error) throw new Error(error.message);
      set({ loading: false, error: null });
    } catch (e: any) {
      set({ loading: false, error: e?.message ?? "Failed to send reset email." });
    }
  },

  refreshProfile: async () => {
    const user = get().user;
    if (!user?.id) return;
    const profile = await fetchProfile(user.id);
    set({ profile });
  },

  // ---------------------------------------------------
  // Login with phone OTP (request code)
  // ---------------------------------------------------
  loginWithPhoneOtp: async (phone: string) => {
    set({ loading: true, error: null });

    try {
      const e164 = normalizePhoneToE164(phone);
      if (!e164) {
        set({ loading: false, error: "Enter a valid phone number." });
        return;
      }

      const { error } = await supabase.auth.signInWithOtp({ phone: e164 });

      if (error) {
        set({ loading: false, error: error.message });
        return;
      }

      set({ loading: false, error: null });
    } catch (e: any) {
      set({ loading: false, error: e?.message ?? "Failed to send code." });
    }
  },

  // ---------------------------------------------------
  // Verify phone OTP and complete login
  // ---------------------------------------------------
  verifyPhoneOtp: async (phone: string, token: string) => {
    set({ loading: true, error: null });

    try {
      const e164 = normalizePhoneToE164(phone);
      if (!e164) {
        set({ loading: false, error: "Invalid phone number." });
        return false;
      }

      const { data, error } = await supabase.auth.verifyOtp({
        phone: e164,
        token: token.trim(),
        type: "sms",
      });

      if (error) {
        set({ loading: false, error: error.message });
        return false;
      }

      if (!data.session) {
        set({ loading: false, error: "Verification failed. Please try again." });
        return false;
      }

      const authUser: AuthUser = {
        id: data.session.user.id,
        email: data.session.user.email ?? null,
      };

      const profile = await fetchProfile(authUser.id);
      await ensureWalletAccountForUser(authUser.id);

      set({
        user: authUser,
        profile,
        loading: false,
        error: null,
        initialized: true,
      });
      return true;
    } catch (e: any) {
      set({
        loading: false,
        error: e?.message ?? "Verification failed.",
      });
      return false;
    }
  },

  // ---------------------------------------------------
  // Update username (profiles table)
  // ---------------------------------------------------
  updateUsername: async (username: string) => {
    const user = get().user;
    if (!user?.id) {
      set({ error: "Not signed in." });
      return;
    }

    const trimmed = username.trim().toLowerCase();
    if (!trimmed || trimmed.length < 2) {
      set({ error: "Username must be at least 2 characters." });
      return;
    }

    set({ loading: true, error: null });

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ username: trimmed, display_name: trimmed })
        .eq("id", user.id);

      if (error) {
        set({ loading: false, error: error.message });
        return;
      }

      const profile = await fetchProfile(user.id);
      set({ profile, loading: false, error: null });
    } catch (e: any) {
      set({ loading: false, error: e?.message ?? "Could not update username." });
    }
  },

  // ---------------------------------------------------
  // Update password (Supabase Auth)
  // ---------------------------------------------------
  updatePassword: async (newPassword: string) => {
    const trimmed = newPassword.trim();
    if (!trimmed || trimmed.length < 6) {
      set({ error: "Password must be at least 6 characters." });
      return;
    }

    set({ loading: true, error: null });

    try {
      const { error } = await supabase.auth.updateUser({ password: trimmed });

      if (error) {
        set({ loading: false, error: error.message });
        return;
      }

      set({ loading: false, error: null });
    } catch (e: any) {
      set({ loading: false, error: e?.message ?? "Could not update password." });
    }
  },

  requestPhoneChange: async (phone: string) => {
    const user = get().user;
    if (!user?.id) {
      set({ error: "Not signed in." });
      return;
    }

    const e164 = normalizePhoneToE164(phone);
    if (!e164) {
      set({ error: "Enter a valid phone number." });
      return;
    }

    set({ loading: true, error: null });
    try {
      const { error } = await supabase.auth.updateUser({ phone: e164 });
      if (error) throw error;
      set({ loading: false, error: null });
    } catch (e: any) {
      set({ loading: false, error: e?.message ?? "Could not send verification code." });
    }
  },

  verifyPhoneChange: async (phone: string, token: string) => {
    const user = get().user;
    if (!user?.id) {
      set({ error: "Not signed in." });
      return false;
    }

    const e164 = normalizePhoneToE164(phone);
    if (!e164) {
      set({ error: "Invalid phone number." });
      return false;
    }

    set({ loading: true, error: null });
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        phone: e164,
        token: token.trim(),
        type: "phone_change",
      });
      if (verifyError) throw verifyError;

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ phone: e164 })
        .eq("id", user.id);
      if (profileError) throw profileError;

      const profile = await fetchProfile(user.id);
      set({ profile, loading: false, error: null });
      return true;
    } catch (e: any) {
      set({ loading: false, error: e?.message ?? "Could not verify phone." });
      return false;
    }
  },

  removePhoneFromProfile: async () => {
    const user = get().user;
    if (!user?.id) {
      set({ error: "Not signed in." });
      return;
    }

    set({ loading: true, error: null });
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ phone: null })
        .eq("id", user.id);
      if (error) throw error;
      const profile = await fetchProfile(user.id);
      set({ profile, loading: false, error: null });
    } catch (e: any) {
      set({ loading: false, error: e?.message ?? "Could not remove phone." });
    }
  },

  completeMfaLogin: async (code: string) => {
    const factorId = get().mfaLoginFactorId;
    if (!factorId) {
      set({ error: "2FA session expired. Log in again." });
      return false;
    }

    set({ loading: true, error: null });
    try {
      const challengeId = await challengeTotp(factorId);
      await verifyTotpChallenge(factorId, challengeId, code);

      const user = get().user;
      if (user?.id) {
        await ensureWalletAccountForUser(user.id);
      }

      set({
        loading: false,
        error: null,
        mfaLoginRequired: false,
        mfaLoginFactorId: null,
      });
      return true;
    } catch (e: any) {
      set({ loading: false, error: e?.message ?? "Invalid code. Try again." });
      return false;
    }
  },
}));
