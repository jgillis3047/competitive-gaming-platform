# Test on a second phone

## Why the Camera says "not a usable code"

The QR in the terminal when you run `npm start` is **not** an App Store install link. It tells an **already installed** Arena **development build** where your PC’s Metro server is.

If you scan it with **iOS Camera**, **Google Lens**, or a generic QR app, you often get **"not a usable code"** — that is expected.

## Set up the new device (one time)

1. Install the **same development build** you use on your first phone:
   - **Android:** `eas build --profile development --platform android`, then open the install link from [expo.dev](https://expo.dev) on the new phone, or USB-install the APK.
   - **iOS:** register the device (`eas device:create`), then `eas build --profile development --platform ios` and install via the EAS link / TestFlight internal.
2. Or run on a USB-connected phone: `npx expo run:android` / `npx expo run:ios`.

### iOS: “integrity could not be verified”

Apple shows this when the IPA was **not built for this iPhone** or the developer cert is **not trusted** yet.

1. **Register the phone before building** (required for each new iPhone):
   ```bash
   eas device:create
   ```
   Complete the profile install on the phone when prompted.
2. **Create a new iOS dev build after registration** (old builds will not work on the new phone):
   ```bash
   npm run build:dev:ios
   ```
   Use profile `development`, not `development-simulator`.
3. **Install from Safari** on the phone: open the EAS **Install** link from [expo.dev](https://expo.dev) → Builds (not the Metro QR from `npm start`).
4. **Trust the developer:** Settings → **General** → **VPN & Device Management** (or **Device Management**) → tap the **Expo / Apple Development** entry → **Trust**.
5. Retry install. If it still fails, delete a partial Arena icon, reboot the phone, and install again from a fresh build link.

### Black screen after scanning the Metro QR

The app shell opened but the **JavaScript bundle from your PC did not load**.

1. **iPhone:** Settings → **Arena** → **Local Network** → **ON** (required to reach `192.168.x.x:8081`).
2. On the phone browser: `http://YOUR_PC_IP:8081/status` must show `packager-status:running`.
3. In the **Arena dev app** (not Camera), connect manually: `exp://YOUR_PC_IP:8081`.
4. On PC: `npm run start:clear` (clears Metro cache), then reconnect.
5. Shake the phone → dev menu → **Reload**. Check for a red error screen.
6. If Local Network toggle is missing, rebuild iOS after `expo-dev-client` was added to `app.json`: `npm run build:dev:ios`.

Expo Go is **not** supported for this project (native Stripe, dev client, etc.).

## Connect the new device to Metro (every dev session)

1. PC and phone on the **same Wi‑Fi**.
2. On the PC: `npm start`
3. On the **new phone**, open the **Arena** dev app (not Camera).
4. Use the in-app scanner / “Connect” flow, or **Enter URL manually**:
   ```
   exp://YOUR_PC_IP:8081
   ```
   Example: `exp://192.168.1.160:8081`
5. Sanity check in the phone browser: `http://YOUR_PC_IP:8081/status` → `packager-status:running`

## Two phones at once

Both devices can load the same Metro server. Each opens the Arena dev app and connects with the same `exp://` URL (or each scans the terminal QR from **inside** the app).

### Old phone black screen, new phone works

The old phone is still trying a **cached Metro URL**. The new phone got a fresh connection.

**Right now (no rebuild):**

1. On the **old phone**, **delete Arena** (long-press → Remove App).
2. On PC: `npm start` or `npm run start:tunnel` — leave it running.
3. Reinstall Arena from the **same latest** [expo.dev build link](https://expo.dev) you used on the new phone.
4. **Do not scan the Metro QR first.** Tap the **Arena icon**.
5. You should see the **development launcher** → pick your PC server or **Enter URL manually** (`exp://…` or tunnel URL from the terminal).
6. iPhone: **Settings → Arena → Local Network → ON**.

**If you only get a black screen when opening via QR:** open from the **app icon** instead; QR deep-links are what cause the hang on a stale URL.

**Permanent fix (one rebuild):** The project now sets `launchMode: "launcher"` so Arena always opens the server picker instead of auto-connecting to a dead URL. Run `npm run build:dev:ios` (both devices selected), install on both phones.
