"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, Pill, SectionTitle, Spinner } from "@/components/ui";
import type { SafetySettings } from "@/lib/settings";

type Props = {
  initial: SafetySettings;
  role: "worker" | "supervisor" | "admin";
  simulatorEnabled: boolean;
  helmetCodes: string[];
  eventLog: { id: number; level: string; source: string; message: string; createdAt: string | null }[];
  integrations: { expoPush: string; mqtt: string; deviceApiKey: string };
};

const NUMERIC_FIELDS: { key: keyof SafetySettings; label: string; unit: string; hint: string }[] = [
  { key: "gasWarning", label: "Gas warning", unit: "raw", hint: "MQ-135 raw ADC above which a warning is raised" },
  { key: "gasCritical", label: "Gas critical", unit: "raw", hint: "Raw value above which a critical alert + buzzer is raised" },
  { key: "temperatureWarning", label: "Temperature warning", unit: "°C", hint: "Heat-stress early warning" },
  { key: "temperatureCritical", label: "Temperature critical", unit: "°C", hint: "Immediate supervisor notification" },
  { key: "humidityWarning", label: "Humidity warning", unit: "%", hint: "Heat-stress risk support reading" },
  { key: "batteryLow", label: "Low battery", unit: "%", hint: "Helmet battery below this value raises an alert" },
  { key: "offlineTimeoutSeconds", label: "Helmet offline timeout", unit: "s", hint: "No data for this long ⇒ offline alert" },
  { key: "fallImpactG", label: "Fall impact threshold", unit: "g", hint: "|accel| spike magnitude" },
  { key: "fallFreeFallG", label: "Free-fall threshold", unit: "g", hint: "Low-g phase preceding the impact" },
  { key: "fallWindowMs", label: "Fall window", unit: "ms", hint: "Max gap between free-fall and impact" },
  { key: "alertCooldownSeconds", label: "Alert cooldown", unit: "s", hint: "Duplicate suppression window per rule" },
  { key: "anomalySensitivity", label: "AI sensitivity (σ)", unit: "sigma", hint: "Higher = fewer anomaly flags" },
  { key: "anomalyWindow", label: "AI baseline window", unit: "samples", hint: "Recent packets used as the baseline" },
];

export function SettingsClient({ initial, role, simulatorEnabled, helmetCodes, eventLog, integrations }: Props) {
  const router = useRouter();
  const canConfigure = role === "admin" || role === "supervisor";
  const [settings, setSettings] = useState(initial);
  const [issues, setIssues] = useState<{ path: string; message: string }[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sim, setSim] = useState(simulatorEnabled);
  const [scenarioResult, setScenarioResult] = useState<string | null>(null);
  const [scenarioHelmet, setScenarioHelmet] = useState(helmetCodes[0] ?? "");

  function update(key: keyof SafetySettings, value: string | boolean) {
    setSettings((prev) => ({ ...prev, [key]: typeof value === "boolean" ? value : Number(value) }));
  }

  async function save() {
    setBusy(true);
    setIssues([]);
    setStatus(null);
    try {
      const res = await fetch("/api/settings/thresholds", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          gasWarning: settings.gasWarning,
          gasCritical: settings.gasCritical,
          temperatureWarning: settings.temperatureWarning,
          temperatureCritical: settings.temperatureCritical,
          humidityWarning: settings.humidityWarning,
          batteryLow: settings.batteryLow,
          offlineTimeoutSeconds: settings.offlineTimeoutSeconds,
          fallImpactG: settings.fallImpactG,
          fallFreeFallG: settings.fallFreeFallG,
          fallWindowMs: settings.fallWindowMs,
          alertCooldownSeconds: settings.alertCooldownSeconds,
          anomalySensitivity: settings.anomalySensitivity,
          anomalyWindow: settings.anomalyWindow,
          soundEnabled: settings.soundEnabled,
          vibrationEnabled: settings.vibrationEnabled,
          emergencyContacts: settings.emergencyContacts,
          notificationPrefs: settings.notificationPrefs,
        }),
      });
      const json = (await res.json()) as { error?: string; details?: { path: string; message: string }[]; thresholds?: SafetySettings; esp32Sync?: { status: string; detail: string } };
      if (!res.ok) {
        setIssues(json.details ?? []);
        setStatus(json.error ?? "Save failed");
        return;
      }
      if (json.thresholds) setSettings(json.thresholds);
      setStatus(`Saved. ESP32 sync: ${json.esp32Sync?.status ?? "unknown"} — ${json.esp32Sync?.detail ?? ""}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function toggleSimulator(next: boolean) {
    setBusy(true);
    try {
      await fetch("/api/simulator", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: next ? "enable" : "disable" }),
      });
      setSim(next);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function inject(scenario: "gas" | "fall" | "temperature" | "battery" | "sos") {
    setBusy(true);
    setScenarioResult(null);
    try {
      const res = await fetch("/api/simulator", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "inject", scenario, helmetCode: scenarioHelmet || undefined }),
      });
      const json = (await res.json()) as { helmetCode?: string; alertsRaised?: number; error?: string };
      setScenarioResult(
        res.ok
          ? `Injected SIMULATED ${scenario} on ${json.helmetCode} → ${json.alertsRaised ?? 0} new alert(s).`
          : (json.error ?? "Injection failed"),
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="text-lg font-extrabold tracking-tight">Settings</h1>
        <p className="ms-muted text-[11px]">
          Role: {role} · {canConfigure ? "threshold editing allowed" : "read-only view"}
        </p>
      </div>

      <SectionTitle title="Safety thresholds" hint="Validated server-side; synced to ESP32-S3 on heartbeat when MQTT is configured" />
      <Card>
        <div className="grid grid-cols-2 gap-2.5">
          {NUMERIC_FIELDS.map((field) => {
            const value = settings[field.key] as number;
            const issue = issues.find((i) => i.path === field.key);
            return (
              <label key={String(field.key)} className="flex flex-col gap-1">
                <span className="ms-label">{field.label}</span>
                <input
                  className={`ms-input ${issue ? "!border-[color:var(--crit)]" : ""}`}
                  type="number"
                  step="any"
                  disabled={!canConfigure}
                  value={Number.isFinite(value) ? value : ""}
                  onChange={(e) => update(field.key, e.target.value)}
                  aria-label={`${field.label} in ${field.unit}`}
                />
                <span className="ms-muted text-[10px] leading-tight">
                  {field.unit} · {field.hint}
                </span>
                {issue ? <span className="text-[10px] text-[color:var(--crit)]">{issue.message}</span> : null}
              </label>
            );
          })}
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <Toggle
            label="AI anomaly detection"
            hint="Rolling z-score detector (statistical, not a trained model)"
            checked={settings.anomalyEnabled}
            disabled={!canConfigure}
            onChange={(v) => update("anomalyEnabled", v)}
          />
          <Toggle
            label="Sound on alerts"
            hint="Helmet buzzer + mobile alert tone"
            checked={settings.soundEnabled}
            disabled={!canConfigure}
            onChange={(v) => update("soundEnabled", v)}
          />
          <Toggle
            label="Vibration on alerts"
            hint="Mobile vibration for critical alerts"
            checked={settings.vibrationEnabled}
            disabled={!canConfigure}
            onChange={(v) => update("vibrationEnabled", v)}
          />
          <Toggle
            label="Remote push notifications"
            hint={integrations.expoPush}
            checked={settings.notificationPrefs.push}
            disabled={!canConfigure}
            onChange={(v) => setSettings({ ...settings, notificationPrefs: { ...settings.notificationPrefs, push: v } })}
          />
          <Toggle
            label="Critical alerts only (push)"
            hint="Suppress push for warnings"
            checked={settings.notificationPrefs.criticalOnly}
            disabled={!canConfigure}
            onChange={(v) =>
              setSettings({ ...settings, notificationPrefs: { ...settings.notificationPrefs, criticalOnly: v } })
            }
          />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2">
          <p className="ms-label">Emergency contacts</p>
          {(["mineControlRoom", "safetyOfficer", "rescueTeam"] as const).map((key) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="ms-muted text-[10px] capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
              <input
                className="ms-input"
                disabled={!canConfigure}
                value={settings.emergencyContacts[key]}
                onChange={(e) =>
                  setSettings({ ...settings, emergencyContacts: { ...settings.emergencyContacts, [key]: e.target.value } })
                }
              />
            </label>
          ))}
        </div>

        {canConfigure ? (
          <button className="ms-btn ms-btn-primary mt-3 w-full" disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save & validate thresholds"}
          </button>
        ) : (
          <p className="ms-muted mt-3 text-[11px]">Only supervisors and administrators can change safety thresholds.</p>
        )}
        {status ? <p className="ms-muted mt-2 text-[11px]">{status}</p> : null}
      </Card>

      <SectionTitle title="Data source" hint="Distinguish real helmet telemetry from simulated test data" />
      <Card>
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold">Simulated sensor feed</p>
            <p className="ms-muted text-[10px]">
              {sim ? "ON — readings are labelled SIMULATED" : "OFF — only real ESP32-S3 data is ingested"}
            </p>
          </div>
          {canConfigure ? (
            <button className={`ms-btn !py-1.5 !text-[11px] ${sim ? "" : "ms-btn-primary"}`} disabled={busy} onClick={() => toggleSimulator(!sim)}>
              {sim ? "Turn OFF" : "Turn ON"}
            </button>
          ) : (
            <Pill tone={sim ? "info" : "normal"}>{sim ? "simulated" : "device"}</Pill>
          )}
        </div>

        {canConfigure ? (
          <div className="mt-3 flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="ms-label">Test helmet</span>
              <select className="ms-input" value={scenarioHelmet} onChange={(e) => setScenarioHelmet(e.target.value)}>
                {helmetCodes.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button className="ms-btn !py-1.5 !text-[11px]" disabled={busy} onClick={() => inject("gas")}>
                Test gas alert
              </button>
              <button className="ms-btn !py-1.5 !text-[11px]" disabled={busy} onClick={() => inject("fall")}>
                Test fall alert
              </button>
              <button className="ms-btn !py-1.5 !text-[11px]" disabled={busy} onClick={() => inject("temperature")}>
                Test temperature
              </button>
              <button className="ms-btn !py-1.5 !text-[11px]" disabled={busy} onClick={() => inject("battery")}>
                Test low battery
              </button>
              <button className="ms-btn ms-btn-danger !py-1.5 !text-[11px]" disabled={busy} onClick={() => inject("sos")}>
                Test SOS
              </button>
              <button className="ms-btn ms-btn-ghost !py-1.5 !text-[11px]" disabled={busy} onClick={() => setScenarioResult("Use POST /api/maintenance/checks to run the offline watchdog.")}>
                Offline check
              </button>
            </div>
            {scenarioResult ? <p className="ms-muted text-[11px]">{scenarioResult}</p> : null}
          </div>
        ) : null}
      </Card>

      <SectionTitle title="Integration status" />
      <Card>
        <ul className="flex flex-col gap-2 text-[11px]">
          <li className="flex items-center justify-between gap-2">
            <span>Expo push notifications</span>
            <Pill tone={integrations.expoPush.startsWith("configured") ? "normal" : "offline"}>{integrations.expoPush}</Pill>
          </li>
          <li className="flex items-center justify-between gap-2">
            <span>MQTT broker</span>
            <Pill tone={integrations.mqtt.startsWith("configured") ? "normal" : "offline"}>{integrations.mqtt}</Pill>
          </li>
          <li className="flex items-center justify-between gap-2">
            <span>Device API key</span>
            <Pill tone={integrations.deviceApiKey.startsWith("configured") ? "normal" : "warning"}>{integrations.deviceApiKey}</Pill>
          </li>
        </ul>
      </Card>

      <SectionTitle title="System event log" hint="Recent engine, ingest and notification events" />
      <Card>
        {eventLog.length === 0 ? (
          <p className="ms-muted text-[11px]">No events recorded yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-[10px]">
            {eventLog.slice(0, 12).map((entry) => (
              <li key={entry.id} className="flex items-start gap-2">
                <span
                  className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                    entry.level === "error" ? "bg-[var(--crit)]" : entry.level === "warn" ? "bg-[var(--warn)]" : "bg-[var(--safe)]"
                  }`}
                />
                <span className="ms-mono flex-1 break-words">
                  [{entry.source}] {entry.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {busy ? <Spinner label="Working" /> : null}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span>
        <span className="block text-xs font-semibold">{label}</span>
        <span className="ms-muted block text-[10px]">{hint}</span>
      </span>
      <input
        type="checkbox"
        className="h-5 w-5 accent-[var(--accent)]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
    </label>
  );
}
