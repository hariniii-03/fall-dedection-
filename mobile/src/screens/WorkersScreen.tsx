import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { api } from "../api";

type Worker = {
  code: string;
  fullName: string;
  department: string | null;
  zone: string | null;
  helmetCode: string | null;
  connectionState: string;
  safetyStatus: string;
  batteryPercent: number | null;
  lastReadingAt: string | null;
  recentAlerts: { id: number; title: string; status: string }[];
};

const COLOR: Record<string, string> = { normal: "#22c55e", warning: "#f5a524", critical: "#ef4444", offline: "#64748b" };

export default function WorkersScreen() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = (await api.workers()) as unknown as { workers: Worker[] };
      setWorkers(data.workers);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const timer = setInterval(() => void reload(), 8000);
    return () => clearInterval(timer);
  }, [reload]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.h1}>Workers</Text>
        <Text style={styles.muted}>{workers.length} worker(s) · helmet assignment &amp; safety status</Text>
      </View>
      {loading && !workers.length ? <ActivityIndicator color="#38bdf8" style={{ marginTop: 20 }} /> : null}
      <FlatList
        data={workers}
        keyExtractor={(item) => item.code}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor="#38bdf8" />}
        ListEmptyComponent={<Text style={styles.muted}>No workers registered.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.title}>{item.fullName}</Text>
              <Text style={[styles.badge, { color: COLOR[item.safetyStatus] ?? "#38bdf8" }]}>{item.safetyStatus}</Text>
            </View>
            <Text style={styles.muted}>
              {item.code} · {item.department} · {item.zone}
            </Text>
            <View style={styles.metaRow}>
              <Text style={styles.meta}>Helmet {item.helmetCode ?? "—"}</Text>
              <Text style={styles.meta}>Link {item.connectionState}</Text>
              <Text style={styles.meta}>Battery {item.batteryPercent !== null ? `${Math.round(item.batteryPercent)}%` : "—"}</Text>
            </View>
            <Text style={styles.meta}>
              {item.recentAlerts.length ? `Recent: ${item.recentAlerts.map((a) => a.title).join(", ")}` : "No recent incidents"}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#060a11" },
  header: { paddingHorizontal: 16, paddingTop: 16 },
  h1: { color: "#e8eef8", fontSize: 20, fontWeight: "800" },
  muted: { color: "#93a4bd", fontSize: 11, marginTop: 2 },
  card: { backgroundColor: "#0c131f", borderColor: "#1e2c40", borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: "#e8eef8", fontSize: 13, fontWeight: "800" },
  badge: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  metaRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  meta: { color: "#93a4bd", fontSize: 10, marginTop: 4 },
});
