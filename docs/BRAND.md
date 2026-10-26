# Brand & naming

## Product name

The user-visible app name is **Arena**, set in:

- `lib/theme/brand.ts` — `APP_DISPLAY_NAME`, `APP_TAGLINE`, `APP_SCHEME`
- `app.json` — `expo.name` (home screen / store listing display name)

The Expo project **slug** stays `gaming-app-54` so existing EAS project URLs keep working. You can change the display name anytime without renaming the slug.

## Rebranding

1. Edit `APP_DISPLAY_NAME` and optionally `APP_TAGLINE` in `lib/theme/brand.ts`.
2. Set `expo.name` in `app.json` to match.
3. Keep `APP_SCHEME` and `expo.scheme` in sync unless you are intentionally migrating deep links.

## Bundle IDs (stores)

- iOS: `expo.ios.bundleIdentifier` in `app.json`
- Android: `expo.android.package` in `app.json`

Changing these after release creates a **new** app listing; only do that before first store submission or with a deliberate migration plan.

## Arena terminology

User-facing copy uses **Arena** for physical competition locations. Internal code/table names may still say `courts`.

| Use | Avoid |
|-----|-------|
| Claim New Arena | Drop a court / Create location |
| Crown / King | Leaderboard #1 (generic) |
| Defend crown / Dethrone | Win / Lose |
| Arena history | Leaderboard (for spot pages) |
| Pending verification | Live / Created |

See `docs/ARENAS.md` for the full territory-competition product spec and `lib/theme/arenaCopy.ts` for shared UI strings.
