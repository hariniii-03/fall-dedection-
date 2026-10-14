/**
 * Android push notifications for MineSafe AI.
 *
 * Flow
 * ----
 * 1. Request permission (Android 13+ requires POST_NOTIFICATIONS).
 * 2. Get the Expo push token (ExpoPushToken[...]) - needs a project id in
 *    app.json (`extra.eas.projectId`) for a production build.
 * 3. POST the token to the backend, which associates it with the logged-in user
 *    and sends remote pushes when alerts are raised (see src/lib/notifications.ts
 *    on the server).
 * 4. If no Expo push credential is configured server-side the backend records
 *    the delivery as `skipped` and the app shows a LOCAL notification fallback.
 *
 * Setup that still needs credentials: see docs/PUSH_NOTIFICATIONS.md.
 */
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { api } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async (notification) => ({
    shouldShowAlert: true,
    shouldPlaySound: notification.request.content.title?.includes("CRITICAL") ?? true,
    shouldSetBadge: true,
  }),
});

export type PushRegistration =
  | { mode: "remote-push"; token: string }
  | { mode: "local-fallback"; reason: string };

export async function registerForPushNotifications(userIdHint?: string): Promise<PushRegistration> {
  if (!Device.isDevice) {
    const reason = "Push tokens require a physical Android device (emulator: local notifications only).";
    console.warn("[minesafe] " + reason);
    return { mode: "local-fallback", reason };
  }

  const existing = await Notifications.getPermissionsAsync();
  let permission = existing;
  if (existing.status !== "granted") {
    permission = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
  }
  if (permission.status !== "granted") {
    return { mode: "local-fallback", reason: "Notification permission denied" };
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("minesafe-critical", {
      name: "Critical safety alerts",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#ef4444",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
    });
    await Notifications.setNotificationChannelAsync("minesafe-default", {
      name: "Safety warnings",
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: "#f5a524",
    });
  }

  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    Constants.expoConfig?.extra?.projectId;

  try {
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    await api.registerPushToken(token.data, Platform.OS === "android" ? "android" : "ios");
    void userIdHint;
    return { mode: "remote-push", token: token.data };
  } catch (err) {
    return {
      mode: "local-fallback",
      reason: `Expo push token unavailable (${String(err)}). Configure a project id / credentials.`,
    };
  }
}

/** Local notification fallback (development / no push credentials). */
export async function showLocalAlert(title: string, body: string, critical = false) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: critical },
    trigger: null,
  });
}

export function addNotificationListener(
  handler: (notification: Notifications.Notification) => void,
) {
  return Notifications.addNotificationReceivedListener(handler);
}

export function addResponseListener(handler: (response: Notifications.NotificationResponse) => void) {
  return Notifications.addNotificationResponseReceivedListener(handler);
}
