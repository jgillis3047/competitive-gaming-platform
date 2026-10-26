# App store disclosures and checklist

Use these for Apple App Store / Google Play and in-app compliance.

## Sign-in disclosure (Apple)

If your app supports Sign in with Apple or any third-party sign-in, ensure:

- You do not require sign-in only for browsing; require it only when the user needs an account (e.g. to create a challenge, add wallet funds, or access profile).
- In App Store Connect, under **App Information → Sign-in**, indicate whether sign-in is required and what data is used.

Suggested short text for the product page:

- *"Sign-in is required to create challenges, use the shop and wallet, and access your profile. We use your email and username to run your account and do not sell your data to third parties for advertising."*

## In-app purchases disclosure

- The App uses **real-money payments** via **Stripe** for wallet top-ups and product purchases.
- Clearly state in the app or on the store listing that:
  - Purchases are non-refundable except as required by law.
  - Wallet balances are held in-app and can only be used within the App.

## Data collection (store listing)

- **Data collected:** Account info (email, username, profile photo), in-app activity (challenges, orders, wallet), and optionally device/push tokens for notifications.
- **Data use:** To provide the service, process payments, and send optional notifications.
- **Third parties:** Supabase (backend), Stripe (payments). No sale of data for ads.

## Privacy policy URL

- Host your privacy policy (see `docs/PRIVACY_POLICY.md`) at a public URL and add that URL to:
  - App Store Connect → App → App Privacy.
  - Google Play Console → Policy status → Privacy policy.

## Optional: age rating

- If the App allows real-money purchases or social features, complete the store questionnaire for age rating (e.g. 12+ or 17+ depending on region and content).
