import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useMineSafe } from "../../App";
import { api, API_BASE_URL } from "../api";

export default function SettingsScreen() {
  const { user, signOut, pushMode } = useMineSafe();
  const [thresholds, setThresholds] = useState<Record<string, number | boolean>>({});
  const [status, setStatus] = useState<string | null>(null);
  const canConfigure = user?.role === "admin" || user?.role === "supervisor";

  const load = useCallback(async () => {
    const data = await api.thresholds();
    setThresholds(data.thresholds as Record<string, number | boolean>);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    try {
      await api.updateThresholds(thresholds);
      setStatus("Saved and validated. Helmets receive the new thresholds on their next heartbeat.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Settings</Text>
      <Text style={styles.muted}>
        {user?.fullName} · {user?.role} · push: {pushMode}
      </Text>
      <Text style={styles.muted}>Backend: {API_BASE_URL}</Text>

      {canConfigure ? (
        <>
          <Text style={styles.h2}>Safety thresholds</Text>
          {Object.entries(thresholds)
            .filter(([, value]) => typeof value === "number")
            .map(([key, value]) => (
              <View key={key} style={styles.field}>
                <Text style={styles.label}>{key}</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={String(value)}
                  onChangeText={(text) => setThresholds({ ...thresholds, [key]: Number(text) })}
                />
              </View>
            ))}
          <Pressable style={styles.button} onPress={save}>
            <Text style={styles.buttonText}>Save thresholds</Text>
          </Pressable>
          {status ? <Text style={styles.muted}>{status}</Text> : null}
        </>
      ) : (
        <Text style={styles.muted}>Only supervisors/administrators can edit safety thresholds.</Text>
      )}

      <Text style={styles.h2}>Notifications</Text>
      <Text style={styles.muted}>
        Mode: {pushMode}. Remote push requires EXPO_ACCESS_TOKEN + an Expo project id on the server
        (docs/PUSH_NOTIFICATIONS.md). Local notifications are used as a fallback.
      </Text>

      <Text style={styles.h2}>Danger zone</Text>
      <Pressable style={[styles.button, styles.danger]} onPress={() => void signOut()}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>

      <Text style={styles.note}>
        Prototype build. Detection is rule-based plus a statistical anomaly detector; no ML accuracy is claimed.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#060a11" },
  content: { padding: 16, paddingBottom: 40 },
  h1: { color: "#e8eef8", fontSize: 20, fontWeight: "800" },
  h2: { color: "#e8eef8", fontSize: 14, fontWeight: "700", marginTop: 18, marginBottom: 6 },
  muted: { color: "#93a4bd", fontSize: 11, marginTop: 2, lineHeight: 16 },
  note: { color: "#93a4bd", fontSize: 10, marginTop: 16, lineHeight: 15 },
  field: { marginTop: 10 },
  label: { color: "#93a4bd", fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  input: { backgroundColor: "#0a1119", borderColor: "#1e2c40", borderWidth: 1, borderRadius: 12, color: "#e8eef8", padding: 10, marginTop: 4 },
  button: { backgroundColor: "#0284c7", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 16 },
  danger: { backgroundColor: "#b91c1c" },
  buttonText: { color: "#f0f9ff", fontWeight: "700" },
});
