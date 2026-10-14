import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMineSafe } from "../../App";
import { api } from "../api";

type Series = { gasRaw: number | null; temperatureC: number | null; accelMagnitudeG: number | null; receivedAt?: string }[];

export default function LiveMonitorScreen() {
  const { snapshot } = useMineSafe();
  const [selected, setSelected] = useState<string>("");
  const [series, setSeries] = useState<Series>([]);
  const [loading, setLoading] = useState(false);
  const helmet = snapshot?.helmets.find((h) => h.code === selected) ?? snapshot?.helmets[0] ?? null;

  const load = useCallback(async (code: string) => {
    setLoading(true);
    try {
      const data = await api.history(code, 60);
      setSeries(data.series as Series);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const code = helmet?.code ?? snapshot?.helmets[0]?.code;
    if (code) {
      setSelected(code);
      void load(code);
    }
  }, [helmet?.code, snapshot?.helmets, load]);

  const gasValues = series.map((s) => s.gasRaw ?? 0);
  const tempValues = series.map((s) => s.temperatureC ?? 0);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Live Monitoring</Text>
      <Text style={styles.muted}>Last packet {helmet?.lastReadingAt ?? "never"}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
        {(snapshot?.helmets ?? []).map((item) => (
          <Pressable
            key={item.code}
            onPress={() => {
              setSelected(item.code);
              void load(item.code);
            }}
            style={[styles.tab, item.code === selected && styles.tabActive]}
          >
            <Text style={[styles.tabText, item.code === selected && styles.tabTextActive]}>{item.code}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {helmet ? (
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.cardTitle}>{helmet.code}</Text>
            <Text style={[styles.badge, { color: helmet.connectionState === "online" ? "#22c55e" : "#f5a524" }]}>
              {helmet.connectionState}
            </Text>
          </View>
          <Text style={styles.muted}>
            {helmet.workerCode ?? "unassigned"} · battery {helmet.batteryPercent ?? "--"}% · source {helmet.dataSource}
          </Text>
          <View style={styles.readingRow}>
            <Metric label="Gas raw" value={helmet.latest?.gasRaw ?? null} />
            <Metric label="Temp °C" value={helmet.latest?.temperatureC ?? null} />
            <Metric label="|accel| g" value={helmet.latest?.accelMagnitudeG ?? null} />
          </View>
          {helmet.connectionState === "offline" ? (
            <Text style={styles.stale}>⛔ Showing last known readings — they are STALE, not safe.</Text>
          ) : null}
        </View>
      ) : (
        <Text style={styles.muted}>No helmets registered.</Text>
      )}

      <Text style={styles.h2}>Air quality trend (raw)</Text>
      <View style={styles.card}>
        {loading ? <ActivityIndicator color="#38bdf8" /> : <MiniChart values={gasValues} color="#38bdf8" />}
      </View>

      <Text style={styles.h2}>Temperature trend (°C)</Text>
      <View style={styles.card}>{<MiniChart values={tempValues} color="#f5a524" />}</View>

      <Text style={styles.h2}>Recent packets</Text>
      <FlatList
        data={series.slice(-8).reverse()}
        keyExtractor={(_, index) => String(index)}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <View style={styles.packetRow}>
            <Text style={styles.mono}>gas {item.gasRaw ?? "--"}</Text>
            <Text style={styles.mono}>temp {item.temperatureC ?? "--"}</Text>
            <Text style={styles.mono}>|a| {item.accelMagnitudeG ?? "--"}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.muted}>No packets yet.</Text>}
      />
    </ScrollView>
  );
}

/** Dependency-free sparkline using RN Views (keeps the app bundle small). */
function MiniChart({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <Text style={styles.muted}>Collecting samples…</Text>;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  return (
    <View style={styles.chart}>
      {values.map((value, index) => (
        <View
          key={index}
          style={{
            flex: 1,
            height: `${Math.max(4, ((value - min) / span) * 100)}%` as unknown as number,
            backgroundColor: color,
            opacity: 0.75,
            borderRadius: 2,
          }}
        />
      ))}
    </View>
  );
}

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <View style={styles.reading}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.readingValue}>{value ?? "--"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#060a11" },
  content: { padding: 16, paddingBottom: 40 },
  h1: { color: "#e8eef8", fontSize: 20, fontWeight: "800" },
  h2: { color: "#e8eef8", fontSize: 14, fontWeight: "700", marginTop: 18, marginBottom: 6 },
  muted: { color: "#93a4bd", fontSize: 11 },
  tabs: { marginTop: 12 },
  tab: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: "#1e2c40", marginRight: 8 },
  tabActive: { borderColor: "#38bdf8", backgroundColor: "rgba(56,189,248,0.14)" },
  tabText: { color: "#93a4bd", fontSize: 11, fontWeight: "700" },
  tabTextActive: { color: "#e8eef8" },
  card: { backgroundColor: "#0c131f", borderColor: "#1e2c40", borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 12 },
  cardTitle: { color: "#e8eef8", fontSize: 14, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  badge: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  readingRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  reading: { flex: 1, backgroundColor: "#0a1119", borderRadius: 10, padding: 8 },
  label: { color: "#93a4bd", fontSize: 9, fontWeight: "700", textTransform: "uppercase" },
  readingValue: { color: "#e8eef8", fontSize: 15, fontWeight: "700", marginTop: 2 },
  chart: { flexDirection: "row", alignItems: "flex-end", gap: 2, height: 70 },
  packetRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomColor: "#1e2c40", borderBottomWidth: 1 },
  mono: { color: "#e8eef8", fontSize: 11, fontVariant: ["tabular-nums"] },
  stale: { color: "#f5a524", fontSize: 11, marginTop: 10 },
});
