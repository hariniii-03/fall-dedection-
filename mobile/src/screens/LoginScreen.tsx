import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { api, type Role, type SessionUser } from "../api";

const DEMO: { role: Role; username: string; password: string; label: string; icon: string }[] = [
  { role: "supervisor", username: "supervisor", password: "Super@123", label: "Supervisor", icon: "🛰️" },
  { role: "admin", username: "admin", password: "Admin@123", label: "Administrator", icon: "🛠️" },
  { role: "worker", username: "worker", password: "Worker@123", label: "Worker", icon: "👷" },
];

export default function LoginScreen({ onAuthenticated }: { onAuthenticated: (user: SessionUser) => void }) {
  const [role, setRole] = useState<Role>("supervisor");
  const [username, setUsername] = useState("supervisor");
  const [password, setPassword] = useState("Super@123");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const user = await api.login(username.trim(), password, role);
      onAuthenticated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.logo}>⛑️</Text>
      <Text style={styles.title}>MineSafe AI</Text>
      <Text style={styles.subtitle}>Smart helmet safety monitoring · air quality · fall detection</Text>

      <View style={styles.card}>
        <View style={styles.roleRow}>
          {DEMO.map((demo) => (
            <Pressable
              key={demo.role}
              onPress={() => {
                setRole(demo.role);
                setUsername(demo.username);
                setPassword(demo.password);
              }}
              style={[styles.roleButton, role === demo.role && styles.roleActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: role === demo.role }}
            >
              <Text style={[styles.roleText, role === demo.role && styles.roleTextActive]}>
                {demo.icon} {demo.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Username</Text>
        <TextInput style={styles.input} value={username} autoCapitalize="none" onChangeText={setUsername} />

        <Text style={styles.label}>Password</Text>
        <TextInput style={styles.input} value={password} secureTextEntry onChangeText={setPassword} />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={signIn} disabled={busy}>
          {busy ? <ActivityIndicator color="#f0f9ff" /> : <Text style={styles.buttonText}>Sign in as {role}</Text>}
        </Pressable>

        <Text style={styles.hint}>
          Demo accounts are seeded automatically. The app never stores your password - only a session cookie.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: "#060a11", alignItems: "center", justifyContent: "center", padding: 20 },
  logo: { fontSize: 48 },
  title: { color: "#e8eef8", fontSize: 24, fontWeight: "800", marginTop: 8 },
  subtitle: { color: "#93a4bd", fontSize: 12, textAlign: "center", marginTop: 4 },
  card: { width: "100%", backgroundColor: "#0c131f", borderColor: "#1e2c40", borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 20 },
  roleRow: { flexDirection: "row", backgroundColor: "#0a1119", borderRadius: 12, padding: 4 },
  roleButton: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 9 },
  roleActive: { backgroundColor: "#182536" },
  roleText: { color: "#93a4bd", fontSize: 11, fontWeight: "700" },
  roleTextActive: { color: "#e8eef8" },
  label: { color: "#93a4bd", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginTop: 14 },
  input: { backgroundColor: "#0a1119", borderColor: "#1e2c40", borderWidth: 1, borderRadius: 12, color: "#e8eef8", padding: 12, marginTop: 6 },
  error: { color: "#ef4444", marginTop: 12, fontSize: 12 },
  button: { backgroundColor: "#0284c7", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 16 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#f0f9ff", fontWeight: "700" },
  hint: { color: "#93a4bd", fontSize: 10, marginTop: 14, lineHeight: 15 },
});
