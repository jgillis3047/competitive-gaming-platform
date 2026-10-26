# Production Stripe checklist

> **Full guide:** See [STRIPE_SETUP.md](./STRIPE_SETUP.md) for test mode setup first.

Before accepting real payments:

## 1. Stripe account

- Complete Stripe account verification (identity, bank).
- Switch from **Test mode** to **Live mode** in the Stripe Dashboard.

## 2. Live keys

- **Developers → API keys**: Copy the **live** Secret key (`sk_live_...`).
- In Supabase → **Project Settings → Edge Functions → Secrets**:
  - Set `STRIPE_SECRET_KEY` to your live secret key (replace the test one).

## 3. Live webhook

- **Developers → Webhooks → Add endpoint**.
- **Endpoint URL**: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`
- **Events**: `checkout.session.completed`.
- Create the endpoint, then **Reveal** the **Signing secret** (`whsec_...`).
- In Supabase secrets, set `STRIPE_WEBHOOK_SECRET` to this live signing secret.

## 4. APP_URL

- Set `APP_URL` in Supabase secrets to your production app URL:
  - **Web**: `https://yourdomain.com`
  - **Mobile deep link**: e.g. `gamingapp54://` (must match your app’s `scheme` in app.json).

## 5. Redeploy Edge Functions

```bash
npx supabase functions deploy create-checkout-session
npx supabase functions deploy stripe-webhook
```

## 6. Verify

- Make a small real payment and confirm:
  - Stripe Dashboard shows the payment.
  - Webhook delivery succeeds.
  - VC balance in the app updates after redirect/return.

## 7. Optional: idempotency

- For high volume, consider idempotency keys on Stripe API calls and duplicate webhook handling (e.g. by `payment_intent_id` or `session_id`) so the same event doesn’t credit VC twice.
