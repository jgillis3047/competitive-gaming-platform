# Notifications: In-app and push

## Overview

- **In-app notifications**: Stored in the `notifications` table and shown when the user taps the bell icon. Every notification type creates an in-app row so the user has a history.
- **Push notifications**: When the user has granted permission and the app has registered a push token, the same events can be sent as device alerts (when the app is in the background). Push is sent via the Expo Push API from the `send-push` Edge Function.

## Notification types

| Type | In-app | Push | Trigger |
|------|--------|------|--------|
| **Post like** | ✓ | ✓ | Someone likes your post |
| **Post comment** | ✓ | ✓ | Someone comments on your post |
| **Challenge accepted** | ✓ | ✓ | Someone accepts your challenge (from challenge screen or game thread) |
| **Seller approved** | ✓ | — | Admin approves your seller application |
| **Seller rejected** | ✓ | — | Admin does not approve your seller application |

Types are defined in `lib/backend/notificationTypes.ts`. To add a new type:

1. Add it to `NOTIFICATION_TYPES` and `NOTIFICATION_TYPE_LABELS`.
2. If it should trigger push, add it to `TYPES_THAT_SEND_PUSH`.
3. Use `notifyUser()` from `lib/backend/notifications` (it creates in-app + sends push when the type is push-enabled). For in-app only, use `createNotification()`.

## Flow

- **Creating a notification**: Use `notifyUser({ targetUserId, type, title, body, link })` for likes, comments, and challenge accepted. Use `createNotification(...)` for seller approved/rejected (in-app only).
- **Push**: The app registers the Expo push token in `push_tokens` when the user is logged in (`usePushRegistration` in the tabs layout). The `send-push` Edge Function reads tokens for the target user and sends to Expo’s push API. Tap payload includes `data.link` for deep link (e.g. `/post/123`).
- **Tap handling**: `_layout.tsx` uses `Notifications.addNotificationResponseReceivedListener` and navigates to `data.link` when the user taps a push.

## Push in development

- **Expo Go**: Remote push was removed from Expo Go in SDK 53. You will see a warning; push will not be delivered in Expo Go.
- **Development build**: For real push on a device, create a development build (e.g. `eas build --profile development`). Then install that build and run the app; push tokens will be valid and the `send-push` function will deliver to the device.
- **Testing**: You can still test in-app notifications in Expo Go (bell list). For end-to-end push, use a dev build or a production build.

## Settings

- **Settings → Push notifications**: Shows permission status and lets the user enable or open system settings. Copy explains in-app vs push and mentions that a development build may be required for push.

## Edge Function

- **send-push**: Invoked by the app with `targetUserId`, `title`, `body`, optional `link`. Uses Supabase auth to verify the caller, loads `push_tokens` for the target user, and sends messages to `https://exp.host/--/api/v2/push/send`.
