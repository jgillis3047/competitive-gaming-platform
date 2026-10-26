import { supabase } from "./supabaseClient";

export type TotpFactor = {
  id: string;
  friendlyName: string;
  status: string;
};

export type TotpEnrollResult = {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
};

export async function getAuthenticatorAssuranceLevel(): Promise<{
  currentLevel: string | null;
  nextLevel: string | null;
}> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  return {
    currentLevel: data?.currentLevel ?? null,
    nextLevel: data?.nextLevel ?? null,
  };
}

export async function listTotpFactors(): Promise<TotpFactor[]> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return (data?.totp ?? []).map((f) => ({
    id: f.id,
    friendlyName: f.friendly_name ?? "Authenticator",
    status: f.status,
  }));
}

export async function enrollTotp(friendlyName = "Authenticator app"): Promise<TotpEnrollResult> {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName,
  });
  if (error) throw error;
  if (!data?.id || !data.totp) throw new Error("Could not start 2FA setup.");
  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
    uri: data.totp.uri,
  };
}

export async function verifyTotpEnrollment(factorId: string, code: string): Promise<void> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: code.trim(),
  });
  if (error) throw error;
}

export async function unenrollTotp(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
}

export async function challengeTotp(factorId: string): Promise<string> {
  const { data, error } = await supabase.auth.mfa.challenge({ factorId });
  if (error) throw error;
  if (!data?.id) throw new Error("Could not start 2FA challenge.");
  return data.id;
}

export async function verifyTotpChallenge(
  factorId: string,
  challengeId: string,
  code: string
): Promise<void> {
  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId,
    code: code.trim(),
  });
  if (error) throw error;
}
