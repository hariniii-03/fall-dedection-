import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert as NativeAlert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import { API_BASE_URL, Session } from "./src/config";
import { api } from "./src/api";
import { Reading, Alert, Worker, Helmet, Thresholds } from "./src/types";
import { DEFAULT_THRESHOLDS, makeSimulatedAlert, makeSimulatedReading, SIMULATED_HELMETS, SIMULATED_WORKERS } from "./src/simulated";
import { colors, statusColors } from "./src/theme";

const TABS = ["Dashboard", "Live", "Alerts", "Workers", "Reports", "Settings"] as const;
type Tab = (typeof TABS)[number];
const key = "minesafe.session";
const stamp = (s: string | null) => s ? new Date(s).toLocaleString() : "No data";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("Dashboard");
  const [sim, setSim] = useState(false);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [helmets, setHelmets] = useState<Helmet[]>([]);
  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => { SecureStore.getItemAsync(key).then(raw => {
    if (raw) { try { setSession(JSON.parse(raw) as Session); } catch { SecureStore.deleteItemAsync(key); } }
  }).finally(() => setLoading(false)); }, []);

  useEffect(() => {
    if (!session || sim) return;
    let active = true;
    const refresh = async () => {
      try {
        const [r, a, w, h] = await Promise.all([api.latestReadings(session), api.alerts(session), api.workers(session), api.helmets(session)]);
        if (active) { setReadings(r); setAlerts(a); setWorkers(w); setHelmets(h); setLastRefresh(new Date().toISOString()); setError(""); }
      } catch (e) { if (active) setError(`Server unavailable: ${String(e)}. Last known data is stale.`); }
    };
    refresh(); const id = setInterval(refresh, 10000);
    return () => { active = false; clearInterval(id); };
  }, [session, sim]);

  useEffect(() => {
    if (!sim || !session) return;
    setWorkers(SIMULATED_WORKERS); setHelmets(SIMULATED_HELMETS); setAlerts([]);
    const tick = () => { setReadings(SIMULATED_WORKERS.filter(w => w.status !== "offline").map(w => makeSimulatedReading(w.helmetId!, w.id))); setLastRefresh(new Date().toISOString()); };
    tick(); const id = setInterval(tick, 3000);
    return () => clearInterval(id);
  }, [session, sim]);

  const login = async () => {
    setBusy(true); setError("");
    try {
      const s = await api.login(username.trim(), password);
      if (!s.token || !["worker", "supervisor", "admin"].includes(s.role)) throw new Error("Invalid server response");
      await SecureStore.setItemAsync(key, JSON.stringify(s)); setSession(s);
    } catch (e) { setError(`Login failed: ${String(e)}`); }
    finally { setBusy(false); }
  };
  const logout = async () => { await SecureStore.deleteItemAsync(key); setSession(null); setSim(false); setReadings([]); setAlerts([]); setWorkers([]); setHelmets([]); };
  const action = async (id: string, resolve: boolean) => {
    if (!session) return;
    if (resolve && !notes.trim()) { setError("Resolution notes are required."); return; }
    try {
      const updated = sim ? { ...alerts.find(a => a.id === id)!, state: resolve ? "resolved" as const : "acknowledged" as const, acknowledgedAt: new Date().toISOString(), resolvedAt: resolve ? new Date().toISOString() : null, resolutionNotes: resolve ? notes.trim() : null } : resolve ? await api.resolveAlert(session, id, notes.trim()) : await api.acknowledgeAlert(session, id);
      setAlerts(prev => prev.map(a => a.id === id ? updated : a)); setNotes(""); setError("");
    } catch (e) { setError(`Action failed: ${String(e)}`); }
  };
  const sos = () => NativeAlert.alert("Send SOS?", "Emergency supervisors will be notified.", [ { text: "Cancel" }, { text: "Send SOS", onPress: async () => {
    try { if (!session) return; const a = sim ? makeSimulatedAlert("sos", "critical", session.userId, "APP-SOS") : await api.raiseSos(session, session.userId, null); setAlerts(prev => [a, ...prev]); setTab("Alerts"); } catch (e) { setError(String(e)); }
  } } ]);
  const btn = (label: string, onPress: () => void, critical = false) => <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} style={[styles.btn, critical && { backgroundColor: colors.danger }]} onPress={onPress}><Text style={styles.btnText}>{label}</Text></TouchableOpacity>;
  const card = (title: string, value: string, color = colors.text) => <View style={styles.card}><Text style={styles.dim}>{title}</Text><Text style={[styles.value, { color }]}>{value}</Text></View>;
  const readingCard = (r: Reading) => <View key={r.helmetId} style={styles.card}><Text style={styles.heading}>{r.workerId ?? "Unassigned"} · {r.helmetId}</Text><Text style={styles.dim}>{r.simulated ? "SIMULATED TEST READING" : "LIVE DEVICE READING"} · {stamp(r.ts)}</Text><Text style={styles.text}>Gas raw ADC: {r.gasRaw ?? "Not installed"} (not AQI)</Text><Text style={styles.text}>Temperature: {r.temperatureC ?? "N/A"} °C · Humidity: {r.humidityPercent ?? "N/A"} %</Text><Text style={styles.text}>Acceleration (m/s²): {r.accelX ?? "?"}, {r.accelY ?? "?"}, {r.accelZ ?? "?"}</Text><Text style={styles.text}>Battery: {r.batteryPercent ?? "N/A"} % · Pressure: {r.pressureHpa ?? "Not installed"} hPa</Text></View>;

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.accent}/></View>;
  if (!session) return <View style={styles.login}><StatusBar style="light"/><Text style={styles.logo}>⛑ MineSafe AI</Text><Text style={styles.dim}>Smart Mining Helmet Safety Monitoring</Text><TextInput accessibilityLabel="Username" placeholder="Username" placeholderTextColor={colors.textDim} style={styles.input} value={username} onChangeText={setUsername} autoCapitalize="none"/><TextInput accessibilityLabel="Password" placeholder="Password" placeholderTextColor={colors.textDim} secureTextEntry style={styles.input} value={password} onChangeText={setPassword}/>{busy ? <ActivityIndicator color={colors.accent}/> : btn("Sign in", login)}{error ? <Text style={styles.error}>{error}</Text> : null}<Text style={styles.dim}>Requires a backend account. No default passwords in this app.</Text></View>;

  const active = alerts.filter(a => a.state !== "resolved");
  return <View style={styles.root}><StatusBar style="light"/><View style={styles.header}><Text style={styles.heading}>⛑ MineSafe AI</Text><Text style={styles.dim}>{session.name} · {session.role}</Text></View>{sim ? <Text style={styles.banner}>⚠ SIMULATED TEST DATA — NOT A LIVE SAFETY SYSTEM</Text> : error ? <Text style={styles.banner}>⚠ DATA MAY BE STALE — SERVER UNAVAILABLE</Text> : <Text style={styles.live}>● LIVE BACKEND · Last refresh {stamp(lastRefresh)}</Text>}{error ? <Text style={styles.error}>{error}</Text> : null}<ScrollView contentContainerStyle={styles.scroll}>
    {tab === "Dashboard" && <>{card("Registered workers", String(workers.length))}{card("Currently monitored", String(readings.length))}{card("Safe workers", String(workers.filter(w => w.status === "normal").length), statusColors.normal)}{card("Active alerts", String(active.length), active.length ? statusColors.critical : statusColors.normal)}{card("Offline helmets", String(helmets.filter(h => !h.online).length), statusColors.offline)}{btn("EMERGENCY SOS", sos, true)}<Text style={styles.heading}>Latest readings</Text>{readings.length ? readings.map(readingCard) : <Text style={styles.dim}>No readings yet — never assume missing data is safe.</Text>}</>}
    {tab === "Live" && <><Text style={styles.heading}>Live monitoring</Text><Text style={styles.dim}>Refreshes every 10 seconds from backend (simulation: 3 seconds). Stale after missed updates.</Text>{readings.length ? readings.map(readingCard) : <Text style={styles.dim}>No helmet data. Check device connections.</Text>}</>}
    {tab === "Alerts" && <><Text style={styles.heading}>Notification center</Text><TextInput style={styles.input} placeholder="Search worker, helmet, or message" placeholderTextColor={colors.textDim} value={query} onChangeText={setQuery}/><View style={styles.row}>{["all", "active", "acknowledged", "resolved"].map(f => btn(f, () => setFilter(f)))}</View>{alerts.filter(a => (filter === "all" || a.state === filter) && `${a.message} ${a.workerId} ${a.helmetId}`.toLowerCase().includes(query.toLowerCase())).map(a => <View key={a.id} style={styles.card}><Text style={[styles.heading, { color: a.severity === "critical" ? statusColors.critical : statusColors.warning }]}>{a.severity.toUpperCase()} · {a.type.toUpperCase()}</Text><Text style={styles.text}>{a.message}</Text><Text style={styles.dim}>{a.workerId ?? "Unknown worker"} · {a.helmetId} · {stamp(a.createdAt)} · {a.state}</Text>{a.state === "active" && session.role !== "worker" && btn("Acknowledge", () => action(a.id, false))}{a.state !== "resolved" && session.role !== "worker" && <><TextInput style={styles.input} placeholder="Resolution notes (required)" placeholderTextColor={colors.textDim} value={notes} onChangeText={setNotes}/>{btn("Resolve", () => action(a.id, true))}</>}</View>)}{!alerts.length && <Text style={styles.dim}>No alerts recorded. Offline status should be checked separately.</Text>}</>}
    {tab === "Workers" && <><Text style={styles.heading}>Workers & helmets</Text>{workers.map(w => <View key={w.id} style={styles.card}><Text style={styles.heading}>{w.name} · {w.id}</Text><Text style={[styles.text, { color: statusColors[w.status] }]}>{w.status.toUpperCase()}</Text><Text style={styles.dim}>Zone {w.zone} · {w.helmetId ?? "No helmet"} · Last seen {stamp(w.lastSeen)}</Text></View>)}{helmets.map(h => <View key={h.id} style={styles.card}><Text style={styles.heading}>{h.id}</Text><Text style={styles.dim}>{h.online ? "Online" : "Offline"} · Battery {h.batteryPercent ?? "N/A"}% · Firmware {h.firmware ?? "Unknown"}</Text></View>)}</>}
    {tab === "Reports" && <><Text style={styles.heading}>Safety summary</Text>{card("Total alerts", String(alerts.length))}{card("Gas alerts", String(alerts.filter(a => a.type === "gas").length))}{card("Suspected falls", String(alerts.filter(a => a.type === "fall").length))}{card("Offline incidents", String(alerts.filter(a => a.type === "offline").length))}<Text style={styles.dim}>Full dated reports and CSV export require the reporting API (not yet implemented).</Text></>}
    {tab === "Settings" && <><Text style={styles.heading}>Settings</Text><Text style={styles.dim}>API: {API_BASE_URL}</Text>{btn(sim ? "Disable simulation" : "Enable SIMULATED test data", () => { setSim(!sim); setError(""); })}<Text style={styles.dim}>Gas thresholds refer to raw ADC only, not AQI. Configure on the backend when available.</Text>{Object.entries(thresholds).map(([k, v]) => card(k, String(v)))}{btn("Log out", logout)}</>}
  </ScrollView><View style={styles.nav}>{TABS.map(t => <TouchableOpacity key={t} accessibilityRole="tab" accessibilityLabel={t} accessibilityState={{ selected: tab === t }} style={styles.navItem} onPress={() => setTab(t)}><Text style={[styles.navText, tab === t && { color: colors.accent }]}>{t}</Text></TouchableOpacity>)}</View></View>;
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.bg, paddingTop: 48 }, center: { flex: 1, backgroundColor: colors.bg, justifyContent: "center" }, login: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", padding: 24, gap: 18 }, logo: { fontSize: 32, fontWeight: "800", color: colors.text }, header: { paddingHorizontal: 16, paddingBottom: 12 }, heading: { color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: 8 }, text: { color: colors.text, fontSize: 14, marginTop: 8 }, dim: { color: colors.textDim, fontSize: 12 }, value: { fontSize: 30, fontWeight: "800", marginTop: 4 }, card: { backgroundColor: colors.card, padding: 16, borderRadius: 12, marginBottom: 12 }, scroll: { padding: 16, paddingBottom: 40 }, btn: { backgroundColor: colors.accent, padding: 12, borderRadius: 8, marginTop: 8, alignItems: "center" }, btnText: { color: "#07121e", fontWeight: "700", fontSize: 13 }, banner: { backgroundColor: "#632021", color: "#fff", padding: 10, fontWeight: "800" }, live: { color: statusColors.normal, padding: 8 }, error: { color: colors.danger, padding: 8 }, input: { backgroundColor: colors.card, color: colors.text, padding: 12, borderRadius: 8, marginVertical: 8 }, nav: { flexDirection: "row", borderTopWidth: 1, borderColor: colors.border, paddingBottom: 16, backgroundColor: colors.card }, navItem: { flex: 1, alignItems: "center", paddingVertical: 14 }, navText: { color: colors.textDim, fontSize: 10 }, row: { flexDirection: "row", flexWrap: "wrap", gap: 4 } });
