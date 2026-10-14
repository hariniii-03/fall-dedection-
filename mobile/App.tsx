/**
 * MineSafe AI - React Native (Expo) mobile application.
 *
 * Screens: Login · Dashboard · Live Monitoring · Alerts · Workers · Reports · Settings
 * Data: REST polling (2s dashboard / 5s alerts) - the backend also exposes an
 * SSE stream for the web client and a WebSocket at /ws/live on the FastAPI side.
 *
 * Run:  cd mobile && npm install && npx expo start   (press `a` for Android)
 * Point app.json `extra.apiBaseUrl` at your backend host first.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, DarkTheme, NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { api, type DashboardSnapshot, type Role, type SessionUser } from "./src/api";
import { addNotificationListener, addResponseListener, registerForPushNotifications } from "./src/notifications";
import LoginScreen from "./src/screens/LoginScreen";
import DashboardScreen from "./src/screens/DashboardScreen";
import LiveMonitorScreen from "./src/screens/LiveMonitorScreen";
import AlertsScreen from "./src/screens/AlertsScreen";
import WorkersScreen from "./src/screens/WorkersScreen";
import ReportsScreen from "./src/screens/ReportsScreen";
import SettingsScreen from "./src/screens/SettingsScreen";

type AppState = {
  user: SessionUser | null;
  snapshot: DashboardSnapshot | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  pushMode: string;
};

const AppContext = createContext<AppState>({
  user: null,
  snapshot: null,
  refresh: async () => {},
  signOut: async () => {},
  pushMode: "unknown",
});

export function useMineSafe() {
  return useContext(AppContext);
}

const Tab = createBottomTabNavigator();

const ICONS: Record<string, string> = {
  Dashboard: "🏠",
  Live: "📶",
  Alerts: "🚨",
  Workers: "👷",
  Reports: "📊",
  Settings: "⚙️",
};

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [booting, setBooting] = useState(true);
  const [pushMode, setPushMode] = useState("initialising");

  const refresh = useCallback(async () => {
    try {
      const data = await api.dashboard();
      setSnapshot(data);
    } catch (err) {
      console.warn("[minesafe] dashboard fetch failed", err);
    }
  }, []);

  const signOut = useCallback(async () => {
    await api.logout();
    setUser(null);
    setSnapshot(null);
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setBooting(false);
    })();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const registration = await registerForPushNotifications(user.id.toString());
      setPushRegistration(registration.mode === "remote-push" ? "remote-push" : registration.reason);
    })();
  }, [user]);

  const setPushRegistration = (value: string) => setPushMode(value);

  useEffect(() => {
    const received = addNotificationListener((notification) => {
      const content = notification.request.content;
      console.log("[minesafe] notification", content.title, content.body);
      void refresh();
    });
    const response = addResponseListener(() => void refresh());
    return () => {
      received.remove();
      response.remove();
    };
  }, [refresh]);

  // Poll while the app is foregrounded (2s keeps the dashboard feeling live).
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [user, refresh]);

  const value = useMemo<AppState>(
    () => ({ user: user, snapshot, refresh, signOut, pushMode }),
    [user, snapshot, refresh, signOut, pushMode],
  );

  if (booting) {
    return <ActivityIndicator color="#38bdf8" style={{ flex: 1, backgroundColor: "#060a11" }} />;
  }

  if (!user) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <LoginScreen onAuthenticated={setUser} />
      </SafeAreaProvider>
    );
  }

  const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: "#060a11", card: "#0c131f", primary: "#38bdf8", text: "#e8eef8", border: "#1e2c40" } };

  return (
    <AppContext.Provider value={value}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <NavigationContainer theme={theme}>
          <Tab.Navigator
            initialRouteName="Dashboard"
            screenOptions={({ route }) => ({
              headerShown: false,
              tabBarActiveTintColor: "#38bdf8",
              tabBarInactiveTintColor: "#93a4bd",
              tabBarStyle: { backgroundColor: "#0c131f", borderTopColor: "#1e2c40", height: 62, paddingBottom: 6 },
              tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
              tabBarIcon: ({ color }) => (
                <tabBarIcon glyph={ICONS[route.name] ?? "•"} color={color} badge={route.name === "Alerts" ? snapshot?.totals.criticalAlerts ?? 0 : 0} />
              ),
            })}
          >
            <Tab.Screen name="Dashboard" component={DashboardScreen} />
            <Tab.Screen name="Live" component={LiveMonitorScreen} />
            <Tab.Screen name="Alerts" component={AlertsScreen} />
            <Tab.Screen name="Workers" component={WorkersScreen} />
            <Tab.Screen name="Reports" component={ReportsScreen} />
            <Tab.Screen name="Settings" component={SettingsScreen} />
          </Tab.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </AppContext.Provider>
  );
}

import { Text, View } from "react-native";
import type { Role as RoleType } from "./src/api";

function tabBarIcon({ glyph, color, badge }: { glyph: string; color: string; badge: number }) {
  return (
    <View>
      <Text style={{ fontSize: 18, opacity: color === "#38bdf8" ? 1 : 0.65 }}>{glyph}</Text>
      {badge > 0 ? (
        <View
          style={{
            position: "absolute",
            top: -2,
            right: -8,
            minWidth: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: "#ef4444",
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 3,
          }}
        >
          <Text style={{ color: "#fff", fontSize: 9, fontWeight: "700" }}>{badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

export type { RoleType as Role };
