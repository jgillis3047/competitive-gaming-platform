# Stripe Setup — Test & Production

Use **test mode** first to verify the flow, then switch to **production** when ready for real payments.

---

## Part A: Test mode (do this first)

### 1. Stripe account and keys

1. Go to [dashboard.stripe.com](https://dashboard.stripe.com) and sign up or log in.
2. Ensure **Test mode** is ON (toggle in the sidebar).
3. Go to **Developers → API keys**.
4. Copy the **Secret key** (starts with `sk_test_`).

### 2. Supabase secrets

1. Supabase Dashboard → your project → **Project Settings** → **Edge Functions**.
2. Under **Secrets**, add:
   - `STRIPE_SECRET_KEY` = your test secret key (`sk_test_...`)
   - `STRIPE_WEBHOOK_SECRET` = (add in step 5 after creating the webhook)
3. Save.

### 3. Deploy Edge Functions

From project root:

```bash
npm run deploy:stripe
```

Or manually:

```bash
npx supabase functions deploy create-checkout-session
npx supabase functions deploy stripe-webhook
```

Get your **project ref** from the Supabase dashboard URL:  
`https://supabase.com/dashboard/project/YOUR_PROJECT_REF`.

### 4. Create webhook in Stripe (test mode)

1. Stripe Dashboard → **Developers → Webhooks** → **Add endpoint**.
2. **Endpoint URL:**  
   `https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`
3. **Select events:** `checkout.session.completed`.
4. Click **Add endpoint**.
5. Click **Reveal** under Signing secret, copy the `whsec_...` value.
6. Supabase → **Project Settings → Edge Functions → Secrets** → set `STRIPE_WEBHOOK_SECRET` to that value.
7. Redeploy the webhook function so it picks up the secret:
   ```bash
   npx supabase functions deploy stripe-webhook
   ```

### 5. Optional: redirect after payment (APP_URL)

1. Supabase → Edge Functions → Secrets.
2. Add `APP_URL`:
   - **Expo / deep link:** `gamingapp54://` (matches app scheme in app.json)
   - **Web:** `https://yourapp.com` (no trailing slash)
3. Redeploy create-checkout-session:
   ```bash
   npx supabase functions deploy create-checkout-session
   ```

### 6. Test the flow

1. Open the app → **Shop** tab.
2. Sign in, tap a VC pack (e.g. 500 VC – $4.99).
3. Pay with test card: **4242 4242 4242 4242**.
4. Return to app and refresh Shop — balance should increase.

If it fails:

- Supabase → Edge Functions → **stripe-webhook** → Logs
- Stripe → Webhooks → your endpoint → **Recent deliveries**

---

## Part B: Production (live mode)

Switch to production only after test mode works end-to-end.

### 1. Stripe account verification

- Complete identity and bank verification in the Stripe Dashboard.
- Toggle to **Live mode** (top of Stripe Dashboard).

### 2. Live keys

1. **Developers → API keys**.
2. Copy the **live** Secret key (`sk_live_...`).
3. Supabase → Edge Functions → Secrets → update `STRIPE_SECRET_KEY` to the live key.

### 3. Live webhook

1. Stripe (live mode) → **Developers → Webhooks** → **Add endpoint**.
2. **Endpoint URL:**  
   `https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`
3. **Events:** `checkout.session.completed`.
4. Create → reveal **Signing secret** (`whsec_...`).
5. Supabase secrets → set `STRIPE_WEBHOOK_SECRET` to the **live** signing secret (replace the test one).

### 4. APP_URL (production)

- Set `APP_URL` to your production URL or deep link (e.g. `gamingapp54://` or `https://yourapp.com`).

### 5. Redeploy

```bash
npm run deploy:stripe
```

### 6. Verify

- Make one small real payment.
- Check Stripe Dashboard, webhook delivery, and that VC balance updates.

---

## Secrets checklist

| Secret                | Test value      | Production value  |
|-----------------------|-----------------|-------------------|
| STRIPE_SECRET_KEY     | `sk_test_...`   | `sk_live_...`     |
| STRIPE_WEBHOOK_SECRET | `whsec_...`     | `whsec_...` (live)|
| APP_URL (optional)    | `gamingapp54://`| Your production URL |

---

## Idempotency

The webhook checks for an existing transaction with `source=purchase` and `source_ref=session.id` before crediting. If Stripe retries, we return 200 and skip the credit to avoid double VC.
