/**
 * Logs only in development. Avoids leaking auth errors, emails, or PII
 * through device logs in production builds.
 */
export function devLog(...args: unknown[]): void {
  if (__DEV__) console.log(...args);
}

export function devWarn(...args: unknown[]): void {
  if (__DEV__) console.warn(...args);
}

export function devError(...args: unknown[]): void {
  if (__DEV__) console.error(...args);
}
