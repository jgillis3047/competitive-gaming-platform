/** Normalize user input to E.164 (US default when 10 digits). */
export function normalizePhoneToE164(phone: string): string {
  const trimmed = phone.trim();
  const normalized = trimmed.replace(/\D/g, "");
  if (!normalized.length) return "";
  if (trimmed.startsWith("+")) return `+${normalized}`;
  if (normalized.startsWith("1") && normalized.length === 11) return `+${normalized}`;
  if (normalized.length === 10) return `+1${normalized}`;
  return `+${normalized}`;
}

export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return "Not set";
  const e164 = normalizePhoneToE164(phone);
  const digits = e164.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    const area = digits.slice(1, 4);
    const mid = digits.slice(4, 7);
    const last = digits.slice(7);
    return `+1 (${area}) ${mid}-${last}`;
  }
  return e164 || phone;
}

export function isValidPhoneInput(phone: string): boolean {
  const e164 = normalizePhoneToE164(phone);
  const digits = e164.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}
