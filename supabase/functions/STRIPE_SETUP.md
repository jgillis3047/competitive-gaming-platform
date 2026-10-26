# Stripe wallet top-up setup

## 1. Stripe keys

- Create a Stripe account and get your **Secret key** (Dashboard → Developers → API keys).
- In Supabase: **Project settings → Edge Functions → Secrets**. Add:
  - `STRIPE_SECRET_KEY` = your Stripe secret key (e.g. `sk_test_...`).

## 2. Deploy Edge Functions

```bash
npx supabase functions deploy create-checkout-session
npx supabase functions deploy stripe-webhook
```

## 3. Webhook (credit wallet after payment)

- Stripe Dashboard → **Developers → Webhooks → Add endpoint**.
- Endpoint URL: `https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/stripe-webhook`
- Events: select **checkout.session.completed**.
- After creating, open the webhook and reveal **Signing secret** (starts with `whsec_...`).
- In Supabase secrets, add:
  - `STRIPE_WEBHOOK_SECRET` = that signing secret.

## 4. Success / cancel URLs (optional)

- In Supabase secrets you can set `APP_URL` (e.g. `https://yourapp.com` or your Expo / deep link base, e.g. `myapp://` so redirect opens the app).
- After payment Stripe redirects to `APP_URL/shop?wallet_topped_up=1` or `APP_URL/shop`. If not set, the Edge Function uses `https://example.com`.
- Redeploy `create-checkout-session` after changing the secret.

## 5. Top-up packs

Defined in:

- **Edge Function** `create-checkout-session/index.ts`: `MONEY_PACKS` (`amount_cents`).
- **App** `lib/backend/stripeCheckout.ts`: `MONEY_PACK_OPTIONS` for the Shop UI.

Current packs: $4.99, $9.99, $19.99, $39.99.
