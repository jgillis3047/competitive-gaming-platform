/**
 * Typography scale — pair with `colors` from `./colors`.
 */
export const type = {
  /** Screen titles, hero */
  hero: { fontSize: 28, fontWeight: "900" as const, letterSpacing: 0.2 },
  /** Section headers */
  title: { fontSize: 20, fontWeight: "800" as const },
  /** Card titles, list primary */
  subtitle: { fontSize: 16, fontWeight: "700" as const },
  /** Body */
  body: { fontSize: 15, fontWeight: "400" as const, lineHeight: 22 },
  /** Meta, captions */
  caption: { fontSize: 13, fontWeight: "600" as const },
  /** Tab labels, chips */
  label: { fontSize: 12, fontWeight: "700" as const },
} as const;
