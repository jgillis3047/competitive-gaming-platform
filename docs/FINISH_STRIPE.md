# Finish Stripe — step-by-step

> **Main doc:** See [STRIPE_SETUP.md](./STRIPE_SETUP.md) for the consolidated test + production guide.

Do these in order. Your project ref is in the Supabase dashboard URL:  
`https://supabase.com/dashboard/project/YOUR_PROJECT_REF` → use `YOUR_PROJECT_REF`.

---

## Step 1: Stripe account and key

1. Go to [dashboard.stripe.com](https://dashboard.stripe.com) and sign up or log in.
2. Use **Test mode** (toggle in the sidebar) while testing.
3. Go to **Developers → API keys**.
4. Copy the **Secret key** (starts with `sk_test_` in test mode).

---

## Step 2: Add secret in Supabase

1. Supabase Dashboard → your project → **Project Settings** (gear) → **Edge Functions**.
2. Under **Secrets**, add:
   - **Name:** `STRIPE_SECRET_KEY`
   - **Value:** your Stripe secret key (e.g. `sk_test_...`).
3. Save.

---

## Step 3: Deploy both Edge Functions

In your project root (where `supabase/functions` lives), run:

```bash
npx supabase functions deploy create-checkout-session
npx supabase functions deploy stripe-webhook
```

If it asks you to log in or link the project, do that first.  
Note the URL it prints for each function (e.g. `https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`).

---

## Step 4: Create the webhook in Stripe

1. Stripe Dashboard → **Developers → Webhooks** → **Add endpoint**.
2. **Endpoint URL:**  
   `https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`  
   (replace `YOUR_PROJECT_REF` with your actual ref).
3. Under **Select events**, click **Select events** and choose **checkout.session.completed**.
4. Click **Add endpoint**.
5. On the new webhook’s page, click **Reveal** under **Signing secret** and copy the value (starts with `whsec_`).

---

## Step 5: Add webhook secret in Supabase

1. Back in Supabase → **Project Settings → Edge Functions → Secrets**.
2. Add:
   - **Name:** `STRIPE_WEBHOOK_SECRET`
   - **Value:** the `whsec_...` signing secret from Stripe.
3. Save.

---

## Step 6: Test the flow

1. Open your app and go to the **Shop** tab.
2. Make sure you’re signed in.
3. Tap one of the VC packs (e.g. **500 VC – $4.99**).  
   - A browser should open with Stripe Checkout.
4. Use Stripe test card: **4242 4242 4242 4242**, any future expiry, any CVC, any postal code.
5. Complete the payment.
6. Return to the app and go back to the Shop tab (or pull to refresh).  
   - Your VC balance should increase by the amount you bought.

If the balance doesn’t update, check:

- **Supabase → Edge Functions → stripe-webhook → Logs** for errors.
- **Stripe Dashboard → Developers → Webhooks → your endpoint → Recent deliveries** to see if the event was sent and what response was returned.

---

## Optional: Redirect after payment

To send users somewhere specific after payment (e.g. your website or app deep link):

1. Supabase → **Project Settings → Edge Functions → Secrets**.
2. Add **APP_URL** = your base URL:
   - **Web:** `https://yourapp.com` (no trailing slash).
   - **Expo / deep link:** Use your app scheme so the browser opens the app after checkout, e.g. `gamingapp54://` (this app uses `scheme: "gamingapp54"` in app.json) or `exp://192.168.1.1:8081` for dev. Stripe will redirect to `APP_URL/shop?vc_purchased=1`.
3. Redeploy the create-checkout-session function so it picks up the new secret:
   ```bash
   npx supabase functions deploy create-checkout-session
   ```

Without **APP_URL**, Stripe redirects to `https://example.com/shop`; the VC still credits correctly.

---

You’re done when: **Tap pack → Pay with 4242... → Return to app → Balance increases.**

---

## For production (real payments)

When you’re ready to accept real cards:

1. Complete Stripe account verification and switch to **Live mode**.
2. Use **live** keys and a **new live webhook** (separate from test).
3. Follow **[PRODUCTION_STRIPE.md](./PRODUCTION_STRIPE.md)** for the full checklist.
