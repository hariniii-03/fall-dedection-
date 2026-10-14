import React from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMineSafe } from "../../App";

const STATUS_COLOR: Record<string, string> = {
  normal: "#22c55e",
  online: "#22c55e",
  warning: "#f5a524",
  stale: "#f5a524",
  critical: "#ef4444",
  offline: "#64748b",
};

export default function DashboardScreen() {
  const { snapshot, refresh } = useMineSafe();
  const primary = snapshot?.helmets.find((h) => h.connectionState !== "offline") ?? snapshot?.helmets[0] ?? null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={!snapshot} onRefresh={refresh} tintColor="#38bdf8" />}
    >
      <Text style={styles.h1}>Safety Dashboard</Text>
      <Text style={styles.muted}>
        {snapshot?.totals.monitored ?? 0}/{snapshot?.helmets.length ?? 0} helmets reporting ·{" "}
        {snapshot?.simulatorEnabled ? "SIMULATED feed ON" : "device feed"}
      </Text>

      {snapshot ? (
        <View style={[styles.banner, { borderColor: STATUS_COLOR[snapshot.hazard.level] }]}>
          <Text style={[styles.bannerText, { color: STATUS_COLOR[snapshot.hazard.level] }]}>{snapshot.hazard.label}</Text>
          {snapshot.hazard.reasons.slice(0, 2).map((reason) => (
            <Text key={reason} style={styles.muted}>
              · {reason}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.grid}>
        <Tile label="Workers" value={snapshot?.totals.workers ?? 0} tone="info" />
        <Tile label="Monitored" value={snapshot?.totals.monitored ?? 0} tone="info" />
        <Tile label="Safe" value={snapshot?.totals.safe ?? 0} tone="normal" />
        <Tile label="Active alerts" value={snapshot?.totals.activeAlerts ?? 0} tone={snapshot?.totals.criticalAlerts ? "critical" : "warning"} />
        <Tile label="Offline helmets" value={snapshot?.totals.offlineHelmets ?? 0} tone="offline" />
        <Tile label="Hazard" value={(snapshot?.hazard.level ?? "n/a").toUpperCase()} tone={snapshot?.hazard.level ?? "offline"} />
      </View>

      {primary?.latest ? (
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.cardTitle}>{primary.code}</Text>
            <Text style={[styles.badge, { color: STATUS_COLOR[primary.safetyStatus] }]}>{primary.safetyStatus}</Text>
          </View>
          <Text style={styles.muted}>
            {primary.workerCode ?? "unassigned"} · {primary.zone ?? "-"} · {primary.workerName ?? ""}
          </Text>
          <View style={styles.readingRow}>
            <Reading label="Air quality (raw)" value={`${primary.latest.gasRaw ?? "--"}`} unit="raw" />
            <Reading label="Temperature" value={`${primary.latest.temperatureC ?? "--"}`} unit="°C" />
            <Reading label="Battery" value={`${primary.latest.batteryPercent ?? "--"}`} unit="%" />
          </View>
          <View style={styles.readingRow}>
            <Reading label="Humidity" value={`${primary.latest.humidityPercent ?? "--"}`} unit="%" />
            <Reading label="|accel|" value={`${primary.latest.accelMagnitudeG ?? "--"}`} unit="g" />
            <Reading label="AI anomaly" value={primary.latest.anomalyLabel ?? "n/a"} unit="" />
          </View>
          <Text style={styles.disclaimer}>
            ⚠️ Air quality is the MQ-135 RAW value (air-quality indicator, not calibrated AQI/ppm). Data source:{" "}
            {primary.latest.source}.
          </Text>
        </View>
      ) : null}

      <Text style={styles.h2}>Latest incidents</Text>
      {(snapshot?.latestAlerts ?? []).slice(0, 5).map((alert) => (
        <View key={alert.id} style={styles.alertCard}>
          <View style={styles.row}>
            <Text style={[styles.badge, { color: STATUS_COLOR[alert.severity] }]}>{alert.severity}</Text>
            <Text style={styles.muted}>{alert.type}</Text>
          </View>
          <Text style={styles.alertTitle}>{alert.title}</Text>
          <Text style={styles.muted}>{alert.message}</Text>
        </View>
      ))}
      {!snapshot?.latestAlerts.length ? <Text style={styles.muted}>No incidents recorded.</Text> : null}

      <Pressable style={styles.sosButton} onPress={() => void api.sos({ note: "SOS from mobile app" })}>
        <Text style={styles.sosText}>SOS</Text>
      </Pressable>
    </ScrollView>
  );
}

import { api } from "../api";

function Tile({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  const color = STATUS_COLOR[tone] ?? "#38bdf8";
  return (
    <View style={[styles.tile, { borderLeftColor: color }]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.tileValue, { color }]}>{value}</Text>
    </View>
  );
}

function Reading({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.reading}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.readingValue}>
        {value} <Text style={styles.muted}>{unit}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#060a11" },
  content: { padding: 16, paddingBottom: 40 },
  h1: { color: "#e8eef8", fontSize: 20, fontWeight: "800" },
  h2: { color: "#e8eef8", fontSize: 14, fontWeight: "700", marginTop: 20, marginBottom: 8 },
  muted: { color: "#93a4bd", fontSize: 11, marginTop: 2 },
  banner: { borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 12, backgroundColor: "#0c131f" },
  bannerText: { fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  tile: { backgroundColor: "#0c131f", borderColor: "#1e2c40", borderWidth: 1, borderLeftWidth: 3, borderRadius: 12, padding: 10, width: "31%", flexGrow: 1 },
  tileValue: { fontSize: 18, fontWeight: "800", marginTop: 2 },
  label: { color: "#93a4bd", fontSize: 9, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
  card: { backgroundColor: "#0c131f", borderColor: "#1e2c40", borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 16 },
  cardTitle: { color: "#e8eef8", fontSize: 14, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  badge: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  readingRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  reading: { flex: 1, backgroundColor: "#0a1119", borderRadius: 10, padding: 8 },
  readingValue: { color: "#e8eef8", fontSize: 14, fontWeight: "700", marginTop: 2 },
  alertCard: { backgroundColor: "#0c131f", borderColor: "#1e2c40", borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 8 },
  alertTitle: { color: "#e8eef8", fontSize: 12, fontWeight: "700", marginTop: 4 },
  disclaimer: { color: "#93a4bd", fontSize: 10, marginTop: 12, lineHeight: 15 },
  sosButton: { position: "absolute", bottom: 20, alignSelf: "center", backgroundColor: "#b91c1c", borderRadius: 40, paddingHorizontal: 34, paddingVertical: 14 },
  sosText: { color: "#fff", fontWeight: "900", letterSpacing: 3 },
});
