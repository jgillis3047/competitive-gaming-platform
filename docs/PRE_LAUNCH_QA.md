# Pre-Launch QA (All Features)

This is a practical testing checklist to validate the current app experience before you launch.
Use it for both **Expo Go** (fast iteration) and **dev client** / **EAS release builds** (validation-ready).

## How to use this file

1. For each row, run the test on:
   - Android emulator with **Expo Go**
   - Android emulator with **dev client**
   - iOS simulator (and ideally 1 physical device)
2. Mark completion with ✅ / ⚠️ / ❌ and add notes (error text, screenshots, steps).
3. After every meaningful change, re-run **Section 1, 2, 4, 6, 7, 8**.

## Recording template (copy/paste)

- Platform: (Android Expo Go / Android Dev Client / iOS)
- Build: (preview / production / dev client APK name)
- User: (new user / existing / seller / admin)
- Test date/time:
- Result:
- Notes:

---

## 0) Setup / Environment

- [ ] `assets/images/icon.png` present and matches dimensions (1024x1024)
- [ ] Metro server reachable from emulator (no “No apps connected” / reload works)
- [ ] `adb reverse` configured for the active Metro port
- [ ] Correct env in builds (APP_ENV = preview/production, Supabase URL present)
- [ ] Sentry DSN / environment not breaking app start

---

## 1) Launch & Navigation Smoke (run every time)

### Core
- [ ] Cold start from terminated state reaches correct first screen:
  - Logged out -> `/auth/login`
  - Logged in -> `/(tabs)/feed`
- [ ] Warm reload / app reload doesn’t get stuck on a spinner
- [ ] Back navigation works (no infinite back loops)
- [ ] No red screens / unhandled errors during first minute of usage

### Navigation routes (route-level)
- [ ] `app/(tabs)/_layout.tsx` tab switching works: feed/create/matches/leaderboards/shop
- [ ] `app/_layout.tsx` push/deeplink listeners don’t crash and route handling is safe

---

## 1.5) Leaderboards V1 (Spots + Games + Teams)

### Top-level IA
- [ ] `/(tabs)/leaderboards` has 4 sections: Arena, Spots, Games, Teams.
- [ ] Section switches preserve state and do not crash on rapid tab changes.

### Spots taxonomy + map/list
- [ ] Spot categories resolve from curated taxonomy (target ~50) and render with score direction.
- [ ] `app/courts/index.tsx` list/map mode toggle works and opens selected court.
- [ ] Court detail loads both Players and Teams boards per category.

### Spot submissions and challenge takeover
- [ ] `app/courts/[id]/submit.tsx` validates score by category and blocks malformed input.
- [ ] Proof upload path works for image and video.
- [ ] Higher score takeover updates top rank and badge holder.
- [ ] Top tie marks badge unsettled (no single holder).

### E-game categories
- [ ] Games/Teams sections can load e-game categories (target ~30).
- [ ] Team mode and player mode both render rank lists.
- [ ] E-game result submission updates the correct `egame|<category>` scope.

### Profile badge presentation
- [ ] Profile shows separate Spot king titles and Game title badges.
- [ ] Badge counts do not regress and chips render correctly on dark mode.

---

## 2) Authentication & Account

### Auth screens
- [ ] `/auth/login`: valid login succeeds
- [ ] `/auth/login`: wrong password shows safe error message
- [ ] `/auth/register`: valid registration creates account and profile
- [ ] `/auth/register`: duplicate email/username errors
- [ ] `/auth/forgot-password`: reset link request
- [ ] Session restore after force close:
  - kill app
  - relaunch
  - ensure session still works

### Profile
- [ ] `/profile` shows correct display name + avatar
- [ ] `/edit-profile` updates avatar / display fields (if enabled)
- [ ] `/settings` + username/password/email change flows save & reflect immediately
- [ ] `/settings-blocked` loads without errors
- [ ] `/settings-delete-account` handles confirmation + session cleanup

---

## 3) Feed, Posts, and Social

- [ ] `/ (tabs) /feed`: loads feed and renders items
- [ ] Pull-to-refresh (if present) reloads without duplicate content
- [ ] Post detail `/post/[id]` loads and renders:
  - text
  - images (public URLs and signed URLs)
- [ ] Like / comment / report / block flows don’t crash (if implemented)
- [ ] Search `/search` loads and doesn’t show empty broken UI
- [ ] Friends:
  - `/friends/[id]` profile loads
  - friend updates are reflected in UI (if present)

---

## 4) Challenges, Games, and Threads

### Create challenge
- [ ] `/(tabs)/create` – phone challenge:
  - create opens correctly
  - confirm creator charge / entry fee behavior (if tied to wallet)
  - join flow works for opponent
- [ ] `/(tabs)/create` – in-person challenge:
  - check-in disclaimer checkbox behavior
  - meetup spot + check-in window saved
  - create works and opponent sees it
- [ ] `/(tabs)/create` – e-game challenge:
  - custom game name validation
  - create & submit result flow works

### Challenge lifecycle
- [ ] Open challenge appears in relevant lists (where applicable)
- [ ] Accept challenge:
  - both players can proceed into game thread
  - invite-only behavior doesn’t leak content (if present)
- [ ] In-progress:
  - check-in prompt renders and both must submit check-in
  - submit result prompt flow works; ties/disputes resolve properly (if implemented)

### Threads & prompts
- [ ] `app/matches/thread/[id]`:
  - thread header renders
  - message list loads
  - prompt actions appear only where they should
- [ ] Prompts:
  - check-in yes/no
  - submit result yes/no
  - rematch offer appears when appropriate and respects “pending” state
- [ ] Realtime updates:
  - new message arrives without refresh
  - prompt state resolves and UI updates correctly

---

## 5) Phone Games (end-to-end smoke)

For each game listed below:
- [ ] Launch game from `app/phone-games/index.tsx`
- [ ] Start a challenge or play mode (whatever the current route expects)
- [ ] Complete a run to produce expected result/state
- [ ] Return to thread / next screen works without crashing

Games:
- [ ] `app/phone-games/anagrams.tsx`
- [ ] `app/phone-games/checkers.tsx`
- [ ] `app/phone-games/chess.tsx`
- [ ] `app/phone-games/math-24.tsx`
- [ ] `app/phone-games/math-race.tsx`
- [ ] `app/phone-games/match-cards.tsx`
- [ ] `app/phone-games/number-pattern.tsx`
- [ ] `app/phone-games/sudoku-race.tsx`
- [ ] `app/phone-games/twenty48.tsx`
- [ ] `app/phone-games/unscramble.tsx`
- [ ] `app/phone-games/word-hunt.tsx`

---

## 6) Wallet, Shop, and Payments (Stripe)

### Wallet
- [ ] `/wallet` loads current balance
- [ ] Balance refresh works
- [ ] Offline mode shows graceful error (if applicable)

### Shop
- [ ] `/(tabs)/shop` loads gift cards/products list
- [ ] Empty states show correctly and CTA works (apply-seller)

### Product details
- [ ] `/shop/product/[id]` shows correct price + product info
- [ ] Checkout:
  - Payment sheet opens
  - success updates wallet/order state
  - cancel keeps user on safe screen
- [ ] Webhook behavior:
  - if payment succeeds, wallet updates within expected timeframe

### Orders
- [ ] `/orders` list loads
- [ ] `/orders` detail (if present) loads and shows status

---

## 7) Notifications (In-app + Push)

### In-app notifications
- [ ] `/notifications` loads list
- [ ] Mark read works for individual + “mark all read”
- [ ] Tapping notification navigates safely (no broken routes / no crashes)

### Push notifications (validation builds)
- [ ] Notification permission flow (if implemented) does not break UI
- [ ] Receiving push triggers navigation only to safe routes
- [ ] Cold start from push opens correct screen

---

## 8) Deep Links & Links

- [ ] Custom scheme navigation works:
  - `gamingapp54://...` maps to correct screens
- [ ] Malformed/unknown paths don’t crash (guards work)
- [ ] Stripe return paths (shop/vc_purchased=1) route to `/ (tabs) /shop`
- [ ] Notification `link` payload:
  - invalid paths are ignored safely
  - valid paths open expected screens

---

## 9) Referrals

- [ ] `/referrals` loads referral page
- [ ] Referral CTA/share actions work (no crashes)
- [ ] Referral state updates correctly after referral completion (if implemented)

---

## 10) Courts, King, Leagues, Teams

### Courts
- [ ] `app/courts/index.tsx` loads courts list
- [ ] `app/courts/[id]/index.tsx` loads court details
- [ ] `app/courts/create.tsx` (if used) works
- [ ] `app/courts/apply.tsx` / `submit.tsx` submission works
- [ ] `app/courts/my-claims.tsx` loads claim list
- [ ] `app/courts/city-leaderboard.tsx` loads leaderboard

### King
- [ ] King header/CTAs appear and route to correct screens
- [ ] King application:
  - apply submission works
  - status/empty states render
- [ ] King claims “approvals” logic copy doesn’t mention wiring “later” in a misleading way

### Leagues + Teams
- [ ] `/teams` list loads
- [ ] `app/team/[id].tsx` loads team detail
- [ ] `app/team/create.tsx` creates team or shows errors
- [ ] `/league/[id].tsx` loads standings tabs without crashing
- [ ] `app/league/create.tsx` (if used) works

---

## 11) Seller & Admin

### Seller
- [ ] `/apply-seller` exists and submission works
- [ ] `/seller/index.tsx` shows seller profile or empty state
- [ ] `/seller/products` loads seller products
- [ ] `/seller/orders` loads seller orders
- [ ] Seller flow doesn’t let normal users access seller-only routes

### Admin (smoke only; RLS must protect)
- [ ] `/admin/index.tsx` inaccessible for non-admin users
- [ ] Admin can view expected data when logged in as admin

---

## 12) Settings & Legal

- [ ] `/help` opens correctly
- [ ] `/report` mailto uses correct support email (via env)
- [ ] `/privacy` and `/terms` open and render content (no 404/empty)

---

## 13) Media Upload & Signed URLs (if applicable)

- [ ] Avatar/profile upload doesn’t crash
- [ ] Uploaded images render after refresh
- [ ] Signed URL behavior:
  - images load properly after some time
  - missing media shows graceful placeholder

---

## 14) Resilience / Edge Cases

- [ ] Airplane mode during network calls shows helpful errors, not white screens
- [ ] Pull-to-refresh / reload after error recovers
- [ ] Background -> foreground doesn’t duplicate navigation listeners
- [ ] No infinite spinners for any screen you hit

---

## 15) Final “Release Build” Verification

Run the following on the same checklist on the **actual EAS build artifacts** (not only Metro):
- [ ] `preview` build installs and runs
- [ ] `production` build installs and runs
- [ ] Stripe flow works in the target environment (test vs live)
- [ ] Sentry is initialized and errors are captured (no crashes)

