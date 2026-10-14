import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../api";

type Summary = {
  totals?: Record<string, number>;
  averages?: Record<string, number | null>;
  ackSeconds?: Record<string, number | null>;
  resolveSeconds?: Record<string, number | null>;
  readingsIngested?: number;
  deviceReadings?: number;
  simulatedReadings?: number;
};

export default function ReportsScreen() {
  const [range, setRange] = useState<"daily" | "weekly" | "monthly">("daily");
  const [summary, setSummary] = useState<Summary>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (next: "daily" | "weekly" | "monthly") => {
    setLoading(true);
    try {
      setSummary((await api.report(next)) as Summary);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(range);
  }, [range, load]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Reports</Text>
      <View style={styles.rangeRow}>
        {(["daily", "weekly", "monthly"] as const).map((key) => (
          <Pressable key={key} onPress={() => setRange(key)} style={[styles.range, range === key && styles.rangeActive]}>
            <Text style={[styles.rangeText, range === key && styles.rangeTextActive]}>{key}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? <ActivityIndicator color="#38bdf8" style={{ marginTop: 20 }} /> : null}

      <Text style={styles.h2}>Alert counts</Text>
      <View style={styles.grid}>
        {Object.entries(summary.totals ?? {}).map(([key, value]) => (
          <View key={key} style={styles.tile}>
            <Text style={styles.label}>{key.replace(/([A-Z])/g, " $1")}</Text>
            <Text style={styles.tileValue}>{value}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.h2}>Average readings</Text>
      <View style={styles.grid}>
        {Object.entries(summary.averages ?? {}).map(([key, value]) => (
          <View key={key} style={styles.tile}>
            <Text style={styles.label}>{key}</Text>
            <Text style={styles.tileValue}>{value ?? "—"}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.h2}>Response times</Text>
      <Text style={styles.muted}>
        Ack avg {summary.ackSeconds?.average ?? "—"}s · Resolve avg {summary.resolveSeconds?.average ?? "—"}s
      </Text>
      <Text style={styles.muted}>
        Packets: {summary.readingsIngested ?? 0} ({summary.deviceReadings ?? 0} device / {summary.simulatedReadings ?? 0}{" "}
        simulated)
      </Text>

      <Text style={styles.note}>
        CSV export and date filtering are available in the web client (/reports) via GET /api/reports/export.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#060a11" },
  content: { padding: 16, paddingBottom: 40 },
  h1: { color: "#e8eef8", fontSize: 20, fontWeight: "800" },
  h2: { color: "#e8eef8", fontSize: 14, fontWeight: "700", marginTop: 18, marginBottom: 6 },
  muted: { color: "#93a4bd", fontSize: 11, marginTop: 2 },
  note: { color: "#93a4bd", fontSize: 10, marginTop: 16, lineHeight: 15 },
  rangeRow: { flexDirection: "row", gap: 6, marginTop: 12 },
  range: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: "#1e2c40" },
  rangeActive: { borderColor: "#38bdf8", backgroundColor: "rgba(56,189,248,0.14)" },
  rangeText: { color: "#93a4bd", fontSize: 11, fontWeight: "700" },
  rangeTextActive: { color: "#e8eef8" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: { backgroundColor: "#0c131f", borderColor: "#1e2c40", borderWidth: 1, borderRadius: 12, padding: 10, width: "47%", flexGrow: 1 },
  label: { color: "#93a4bd", fontSize: 9, fontWeight: "700", textTransform: "uppercase" },
  tileValue: { color: "#e8eef8", fontSize: 16, fontWeight: "800", marginTop: 2 },
});
