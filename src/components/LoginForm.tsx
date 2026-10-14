"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorMessage, Spinner } from "@/components/ui";

const DEMO = [
  { role: "supervisor" as const, username: "supervisor", password: "Super@123", label: "Supervisor", icon: "🛰️", desc: "Acknowledge alerts, manage workers" },
  { role: "admin" as const, username: "admin", password: "Admin@123", label: "Administrator", icon: "🛠️", desc: "Thresholds, helmets, full control" },
  { role: "worker" as const, username: "worker", password: "Worker@123", label: "Worker", icon: "👷", desc: "Own helmet status + SOS" },
];

export function LoginForm() {
  const router = useRouter();
  const [role, setRole] = useState<"worker" | "supervisor" | "admin">("supervisor");
  const [username, setUsername] = useState("supervisor");
  const [password, setPassword] = useState("Super@123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function selectRole(next: "worker" | "supervisor" | "admin") {
    setRole(next);
    const preset = DEMO.find((d) => d.role === next)!;
    setUsername(preset.username);
    setPassword(preset.password);
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password, role }),
      });
      const data = (await res.json()) as { error?: string; details?: unknown };
      if (!res.ok) {
        setError(data.error ?? "Login failed");
        setLoading(false);
        return;
      }

      // Verify the session cookie really persisted. If the browser rejected it
      // (e.g. cross-site/HTTP restrictions) tell the user instead of bouncing
      // silently back to this screen.
      const me = await fetch("/api/auth/me", { cache: "no-store" });
      if (!me.ok) {
        setError(
          "Signed in, but the session cookie was rejected by this browser. Open the app on localhost or over HTTPS, then try again.",
        );
        setLoading(false);
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(`Cannot reach the MineSafe server: ${String(err)}`);
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-[420px] px-5">
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="ms-grid-bg grid h-16 w-16 place-items-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-3xl">
          ⛑️
        </div>
        <h1 className="mt-3 text-xl font-extrabold tracking-tight">MineSafe AI</h1>
        <p className="ms-muted mt-1 text-xs">
          Smart Mining Helmet Safety Monitoring · Air quality, temperature &amp; fall detection
        </p>
      </div>

      <div className="ms-card p-4" role="tabpanel" aria-label="Sign in">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#0a1119] p-1" role="tablist" aria-label="Login role">
          {DEMO.map((d) => (
            <button
              key={d.role}
              role="tab"
              aria-selected={role === d.role}
              onClick={() => selectRole(d.role)}
              className={`rounded-lg py-2 text-[11px] font-semibold transition ${
                role === d.role ? "bg-[var(--surface-3)] text-[var(--text)]" : "text-[var(--muted)]"
              }`}
            >
              {d.icon} {d.label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
          <div>
            <label className="ms-label mb-1 block" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              className="ms-input"
              value={username}
              autoComplete="username"
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="ms-label mb-1 block" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="ms-input"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error ? <ErrorMessage message={error} /> : null}

          <button className="ms-btn ms-btn-primary w-full" disabled={loading} type="submit">
            {loading ? "Signing in…" : `Sign in as ${role}`}
          </button>
          {loading ? (
            <div className="flex justify-center">
              <Spinner label="Authenticating" />
            </div>
          ) : null}
        </form>

        <div className="mt-4 border-t border-[var(--border)] pt-3">
          <p className="ms-label mb-2">One-tap demo accounts</p>
          <div className="flex flex-col gap-2">
            {DEMO.map((d) => (
              <button
                key={`quick-${d.role}`}
                onClick={() => selectRole(d.role)}
                className="ms-card-flat flex items-center justify-between px-3 py-2 text-left"
              >
                <span>
                  <span className="block text-xs font-semibold">
                    {d.icon} {d.label}
                  </span>
                  <span className="ms-muted block text-[10px]">{d.desc}</span>
                </span>
                <span className="ms-mono ms-muted text-[10px]">
                  {d.username} / {d.password}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="ms-muted mt-4 text-center text-[10px] leading-relaxed">
        Prototype build · data shown may be SIMULATED for testing. Thresholds are configurable and the
        MQ-135 raw reading is not a calibrated gas concentration.
      </p>
    </div>
  );
}
