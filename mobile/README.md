# MineSafe AI — Expo (React Native) Android app

Native mobile client for the MineSafe AI backend. It mirrors the web app shipped in
`src/app/(app)/**` and talks to the same REST API.

## 1. Prerequisites

* Node 20+
* Android Studio (or a physical Android device with USB debugging)
* An Expo account only if you want **remote** push notifications (see `docs/PUSH_NOTIFICATIONS.md`)

## 2. Configure the backend URL

Edit `mobile/app.json`:

```json
"extra": { "apiBaseUrl": "http://<YOUR-LAN-IP>:3000" }
```

* Android emulator: `http://10.0.2.2:3000` (the app falls back to this automatically).
* Physical device: use the PC's LAN IP (same WiFi network), e.g. `http://192.168.1.50:3000`.
* Production FastAPI backend: `http://<host>:8000` (identical routes).

## 3. Install and run

```bash
cd mobile
npm install
npx expo start          # press `a` to launch on Android
```

Login with the seeded demo accounts:

| Role | Username | Password |
| --- | --- | --- |
| Supervisor | `supervisor` | `Super@123` |
| Administrator | `admin` | `Admin@123` |
| Worker | `worker` | `Worker@123` |

## 4. Build a standalone APK (optional)

```bash
npm install -g eas-cli
eas login
eas build:configure          # writes extra.eas.projectId (needed for push)
eas build -p android --profile preview
```

## 5. Screens

| Screen | What it does |
| --- | --- |
| Login | Role selector (worker / supervisor / administrator), demo accounts, validation errors |
| Dashboard | Totals, hazard banner, live gauges (gas raw, temperature, battery), latest incidents |
| Live | Helmet selector, live readings, stale-data warning, air-quality + temperature trends, packet log |
| Alerts | Tabs (active / critical / acknowledged / resolved / all), search, acknowledge + resolve with notes |
| Workers | Worker list, helmet assignment status, safety status, recent incidents |
| Reports | Daily / weekly / monthly alert counts, averages, response times |
| Settings | Threshold editing (validated server-side), notification mode, sign out |

## 6. Tests

```bash
cd mobile
npm test          # jest-expo (navigation/render smoke tests)
npm run lint
```

Navigation smoke test example (`mobile/src/__tests__/navigation.test.tsx`):

```ts
import { render } from "@testing-library/react-native";
import App from "../../App";

it("renders the login screen when unauthenticated", () => {
  const { getByText } = render(<App />);
  expect(getByText("MineSafe AI")).toBeTruthy();
});
```

## 7. Notes

* The app stores **no secrets**: it keeps only the session token from `/api/auth/login` in
  `AsyncStorage`.
* Simulated telemetry is always labelled in the API response (`source: "simulated"`), and the UI
  shows "SIMULATED feed ON/OFF" so test data is never confused with real helmet data.
* The MQ-135 value displayed is the **raw** sensor reading, not a calibrated AQI/ppm value.
