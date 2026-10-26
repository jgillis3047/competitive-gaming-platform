# Launch checklist

Quick reference for launching to App Store and Google Play.

## Pre-launch (run once)

- [ ] **Icon:** Ensure `assets/images/icon.png` exists (1024×1024). Run `.\scripts\copy-assets.ps1` if needed.
- [ ] **EAS:** Run `npx eas init` to link the project for builds and push notifications.
- [ ] **Deploy functions:** Run `npm run deploy:functions` to deploy all Supabase Edge Functions.
  Verify after deploy:
  ```bash
  npx supabase functions list
  # Confirm these appear:
  # create-checkout-session, stripe-webhook, delete-account,
  # create-notification, send-push, create-payment-intent, expire-open-challenges
  ```
- [ ] **Stripe:** Complete [docs/FINISH_STRIPE.md](./FINISH_STRIPE.md). Set `APP_URL=gamingapp54://` in Supabase secrets.
- [ ] **Admin user:** Set `profiles.is_admin = true` for at least one user (Supabase Table Editor) for seller approvals.
- [ ] **Storage:** Ensure `media` and `avatars` buckets exist and are public (see [docs/STORAGE_IMAGES.md](./STORAGE_IMAGES.md)).

## Before submission

- [ ] Set `EXPO_PUBLIC_SUPPORT_EMAIL` (in `.env` and EAS secrets) and replace `support@yourapp.com` in `docs/PRIVACY_POLICY.md` with your real support email.
- [ ] Host privacy policy and terms at public URLs; add them to App Store Connect and Google Play Console.
- [ ] Production Stripe: Switch to live keys and webhook per [docs/PRODUCTION_STRIPE.md](./PRODUCTION_STRIPE.md).

## Leaderboards V1 release gate

- [ ] Run all items in [docs/PRE_LAUNCH_QA.md](./PRE_LAUNCH_QA.md), including section `1.5) Leaderboards V1 (Spots + Games + Teams)`.
- [ ] Verify curated taxonomy availability:
  - Spots categories target set loaded (45-60 expected, launch target 50).
  - E-game categories target set loaded (launch target ~30).
- [ ] Verify `leaderboard_categories`, `leaderboard_category_proposals`, and `egame_results` tables exist in production.
- [ ] Verify `king_leaderboard_entries` contains both user and team scopes for:
  - `court|...` and `court_team|...`
  - `city|...` and `city_team|...`
  - `egame|<category>`
- [ ] Verify tie behavior:
  - tied #1 => leaderboard ranks show tie labels
  - tied #1 => no unique crown holder badge
- [ ] Verify profile presentation:
  - Spot king titles and game title badges render separately on `/profile`.
- [ ] Verify notification types exist and are handled safely:
  - `leaderboard_title_gained`, `leaderboard_title_lost`, `leaderboard_challenged`.
- [ ] Smoke test challenge bridge:
  - create challenge -> completion path -> user can navigate to Leaderboards and submit/challenge in correct scope.

## Store listing

- [ ] Screenshots (6.5", 5.5" iPhone; Android phone).
- [ ] App description and keywords.
- [ ] Age rating questionnaire.
- [ ] Sign-in and IAP disclosures per [docs/APP_STORE_DISCLOSURES.md](./APP_STORE_DISCLOSURES.md).

## Build

```bash
# Preview (internal testing)
npx eas build --profile preview --platform all

# Production (store submission)
npx eas build --profile production --platform ios
npx eas build --profile production --platform android
```

## Submit

```bash
npx eas submit --platform ios
npx eas submit --platform android
```

Configure Apple ID and Google service account in `eas.json` before submitting.
