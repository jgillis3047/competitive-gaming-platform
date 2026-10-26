// lib/backend/expireOpenChallenges.ts
import { devError, devLog, devWarn } from "../utils/devLog";
import { supabase } from "./supabaseClient";

export type ExpireOpenChallengesResult = {
  ok: boolean;
  expiredCount?: number;
  refundedCount?: number;
  message?: string;
  [key: string]: any; // edge function can return extra fields
};

async function formatInvokeError(error: any) {
  // Supabase function invoke errors can be nested
  const msg =
    error?.message ??
    error?.error_description ??
    error?.context?.message ??
    "Unknown edge function error";
  let details: any = error?.details ?? error?.context ?? null;

  // FunctionsHttpError.context is often a Response object; parse body for useful diagnostics.
  const maybeResponse = error?.context;
  if (maybeResponse && typeof maybeResponse === "object" && typeof maybeResponse.text === "function") {
    try {
      const bodyText = await maybeResponse.clone().text();
      details = {
        status: maybeResponse.status,
        statusText: maybeResponse.statusText,
        body: bodyText,
      };
    } catch {
      // Keep existing details when response parsing fails.
    }
  }

  return { msg, details, raw: error };
}

function isLikelyNetworkError(error: any) {
  const msg = String(
    error?.message ??
      error?.error_description ??
      error?.context?.message ??
      ""
  ).toLowerCase();
  return (
    msg.includes("network request failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("fetch failed") ||
    msg.includes("enotfound")
  );
}

export async function expireOpenChallenges(): Promise<ExpireOpenChallengesResult> {
  devLog("[expireOpenChallenges] invoking edge function: expire-open-challenges");

  // ✅ Ensure we have a session (JWT) if your function/RLS relies on it
  const { data: sessionRes, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr) {
    devWarn("[expireOpenChallenges] getSession error:", sessionErr);
  }

  // If the user isn't logged in yet, don't call the edge function.
  // This prevents noisy 401s when the edge function is configured to verify JWT.
  const accessToken = sessionRes?.session?.access_token;
  if (!accessToken) {
    return {
      ok: false,
      message: "Skipped expire-open-challenges: no user session/JWT.",
    };
  }

  // You can optionally pass data (like an override time window), but not required.
  const { data, error } = await supabase.functions.invoke("expire-open-challenges", {
    body: {
      // helps you debug in function logs if you want
      requestedAt: new Date().toISOString(),
      hasSession: !!sessionRes?.session?.access_token,
    },
  });

  if (error) {
    const formatted = await formatInvokeError(error);
    if (isLikelyNetworkError(error) || isLikelyNetworkError(formatted)) {
      devWarn(
        "[expireOpenChallenges] skipped (network unavailable):",
        formatted.msg,
        formatted.details
      );
      return {
        ok: false,
        message: "Skipped expire-open-challenges: network unavailable.",
      };
    }
    devError("[expireOpenChallenges] edge error:", formatted.msg, formatted.details);
    throw new Error(formatted.msg);
  }

  // Normalize result so your callers can rely on it
  const result: ExpireOpenChallengesResult =
    typeof data === "object" && data !== null ? (data as any) : { ok: true, message: String(data) };

  devLog("[expireOpenChallenges] response:", result);
  return result;
}