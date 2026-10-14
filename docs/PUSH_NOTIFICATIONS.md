# Push notifications (Android)

## What works right now

| Capability | Status |
| --- | --- |
| Notification rows per recipient, delivery status stored (`sent` / `failed` / `skipped` / `pending`) | ✅ |
| In-app notification centre (read/unread, priority, delivery detail) | ✅ |
| Local notification fallback (browser `Notification` API + Expo local schedule) | ✅ |
| Permission request + notification channels (`minesafe-critical`, `minesafe-default`) | ✅ (mobile app) |
| Push token registration & user association (`POST /api/notifications/register`) | ✅ |
| Remote push through Expo Push Service | ⚠️ needs credentials |
| Store receipts / delivery receipts from the push provider | ❌ not implemented |

**Design rule:** emergency alerts never rely on the app being open. The backend fans out on alert
creation (`src/lib/notifications.ts`) — the client only renders what the server recorded.

## Architecture

```
ESP32-S3 → ingest API → safety engine → alert row
                                     └→ dispatchAlertNotifications()
                                          ├─ notifications row per recipient (in-app, always)
                                          └─ POST https://exp.host/--/api/v2/push/send
                                                 (only when EXPO_ACCESS_TOKEN is set)
```

Recipients: every **active supervisor + administrator**, plus the affected worker's own account
(matched by `users.worker_code`). Priority mapping: `fall` / `sos` / `critical` → high +
`minesafe-critical` channel; `warning` → default channel.

## Remaining setup steps

1. **Expo project id**
   ```bash
   cd mobile && npm install -g eas-cli && eas login && eas build:configure
   ```
   This fills `extra.eas.projectId` in `mobile/app.json` (required by
   `getExpoPushTokenAsync` in production builds).

2. **Server credential** — add to `.env` of the backend:
   ```
   EXPO_ACCESS_TOKEN=        # Expo push token from `eas project:info` / Expo dashboard
   EXPO_PUSH_ENABLED=true    # set to false to disable remote pushes
   EXPO_PUSH_CRITICAL_ONLY=false
   ```
   Access token path: Expo dashboard → your project → *Credentials* → *Push notification service
   credentials* / *Access Tokens*.

3. **Android build** with `eas build -p android --profile preview` (an Expo Go session cannot receive
   remote push reliably on newer Android versions).

4. **Register the device** — the app does this automatically after login
   (`mobile/src/notifications.ts` → `registerForPushNotifications()`).

5. **Verify**: `GET /api/notifications/register` (admin) lists registered tokens (only previews are
   returned, never full tokens).

## Without credentials

`dispatchAlertNotifications()` records `deliveryStatus = "skipped"` with
`"skipped: EXPO_ACCESS_TOKEN not configured - local notification fallback used"`, and the client
shows a **local** notification for newly-arriving alerts while it is in the foreground. This keeps the
prototype fully demonstrable but is *not* a substitute for remote push when the app is closed — that
is exactly why the backend integration interface is already in place.

## Alternative providers

If you prefer FCM directly or a hosted provider, implement the same contract in
`src/lib/notifications.ts` (single function `sendExpoPush`) and record
`{ status, detail }` per message. Nothing else in the pipeline changes.
