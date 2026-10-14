import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { useMineSafe } from "../../App";
import { api, type AlertView } from "../api";

const COLOR: Record<string, string> = { critical: "#ef4444", warning: "#f5a524", info: "#38bdf8" };

export default function AlertsScreen() {
  const { user } = useMineSafe();
  const [alerts, setAlerts] = useState<AlertView[]>([]);
  const [filter, setFilter] = useState<"active" | "critical" | "acknowledged" | "resolved" | "all">("active");
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canAct = user?.role === "supervisor" || user?.role === "admin";

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.alerts("all");
      setAlerts(data.alerts);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const timer = setInterval(() => void reload(), 5000);
    return () => clearInterval(timer);
  }, [reload]);

  const filtered = alerts.filter((alert) => {
    if (filter === "critical" && !(alert.severity === "critical" && alert.status !== "resolved")) return false;
    if (filter !== "all" && filter !== "critical" && alert.status !== filter) return false;
    if (!query) return true;
    return [alert.title, alert.message, alert.workerCode, alert.helmetCode, alert.ruleId]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query.toLowerCase()));
  });

  async function acknowledge(id: number) {
    await api.acknowledge(id, notes[id] ?? undefined);
    await reload();
  }

  async function resolve(id: number) {
    const note = notes[id] ?? "";
    if (note.trim().length < 3) {
      setError("Resolution notes are required (min 3 characters).");
      return;
    }
    await api.resolve(id, note.trim());
    await reload();
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.h1}>Alerts</Text>
        <Text style={styles.muted}>History is preserved permanently (no auto-delete)</Text>
      </View>

      <TextInput style={styles.input} placeholder="Search worker, helmet, rule…" placeholderTextColor="#64748b" value={query} onChangeText={setQuery} />

      <View style={styles.filterRow}>
        {(["active", "critical", "acknowledged", "resolved", "all"] as const).map((key) => (
          <Pressable key={key} onPress={() => setFilter(key)} style={[styles.filter, filter === key && styles.filterActive]}>
            <Text style={[styles.filterText, filter === key && styles.filterTextActive]}>{key}</Text>
          </Pressable>
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && !alerts.length ? <ActivityIndicator color="#38bdf8" style={{ marginTop: 20 }} /> : null}

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor="#38bdf8" />}
        ListEmptyComponent={<Text style={styles.muted}>No alerts match this filter.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={[styles.badge, { color: COLOR[item.severity] }]}>{item.severity}</Text>
              <Text style={[styles.badge, { color: item.status === "resolved" ? "#22c55e" : "#f5a524" }]}>{item.status}</Text>
              <Text style={styles.muted}>{item.type}</Text>
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.muted}>{item.message}</Text>
            <Text style={styles.meta}>
              {item.workerCode ?? "no worker"} · {item.helmetCode ?? "no helmet"} · {item.measuredValue ?? "--"}{" "}
              {item.unit ?? ""} (limit {item.threshold ?? "--"}) · rule {item.ruleId ?? "n/a"}
            </Text>
            {item.explanation ? <Text style={styles.meta}>Why: {item.explanation}</Text> : null}

            {canAct && item.status !== "resolved" ? (
              <View style={styles.actions}>
                <TextInput
                  style={[styles.input, styles.noteInput]}
                  placeholder={item.status === "acknowledged" ? "Resolution notes (required)" : "Note (optional)"}
                  placeholderTextColor="#64748b"
                  value={notes[item.id] ?? ""}
                  onChangeText={(text) => setNotes({ ...notes, [item.id]: text })}
                />
                <View style={styles.buttonRow}>
                  <Pressable style={[styles.button, item.status === "acknowledged" && styles.buttonDisabled]} onPress={() => acknowledge(item.id)} disabled={item.status === "acknowledged"}>
                    <Text style={styles.buttonText}>{item.status === "acknowledged" ? "Acknowledged ✓" : "Acknowledge"}</Text>
                  </Pressable>
                  <Pressable style={[styles.button, styles.danger]} onPress={() => resolve(item.id)}>
                    <Text style={styles.buttonText}>Resolve</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
            {item.status === "resolved" && item.resolutionNotes ? <Text style={styles.meta}>Resolution: {item.resolutionNotes}</Text> : null}
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
  input: { backgroundColor: "#0a1119", borderColor: "#1e2c40", borderWidth: 1, borderRadius: 12, color: "#e8eef8", padding: 10, marginTop: 12, marginHorizontal: 16 },
  noteInput: { marginHorizontal: 0, marginTop: 10 },
  filterRow: { flexDirection: "row", paddingHorizontal: 16, marginTop: 10, gap: 6 },
  filter: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: "#1e2c40" },
  filterActive: { borderColor: "#38bdf8", backgroundColor: "rgba(56,189,248,0.14)" },
  filterText: { color: "#93a4bd", fontSize: 11, fontWeight: "700" },
  filterTextActive: { color: "#e8eef8" },
  error: { color: "#ef4444", paddingHorizontal: 16, marginTop: 10, fontSize: 11 },
  card: { backgroundColor: "#0c131f", borderColor: "#1e2c40", borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10 },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  badge: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  title: { color: "#e8eef8", fontSize: 13, fontWeight: "800", marginTop: 4 },
  meta: { color: "#93a4bd", fontSize: 10, marginTop: 4 },
  actions: { marginTop: 8 },
  buttonRow: { flexDirection: "row", gap: 8 },
  button: { flex: 1, backgroundColor: "#0284c7", borderRadius: 10, padding: 10, alignItems: "center", marginTop: 6 },
  buttonDisabled: { opacity: 0.5 },
  danger: { backgroundColor: "#b91c1c" },
  buttonText: { color: "#f0f9ff", fontWeight: "700", fontSize: 12 },
});
