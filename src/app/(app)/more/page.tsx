import Link from "next/link";
import { Card, Pill, SectionTitle } from "@/components/ui";
import { LogoutButton } from "@/components/LogoutButton";
import { getSession } from "@/lib/auth";
import { getDashboardSnapshot } from "@/lib/queries";

export const dynamic = "force-dynamic";

const LINKS = [
  { href: "/reports", label: "Reports & history", icon: "📊", desc: "Daily/weekly summaries, averages, CSV export" },
  { href: "/settings", label: "Settings", icon: "⚙️", desc: "Thresholds, notifications, emergency contacts" },
  { href: "/helmets", label: "Helmet management", icon: "⛑️", desc: "ESP32-S3 nodes, sensors, firmware, battery" },
  { href: "/notifications", label: "Notification center", icon: "🔔", desc: "Read/unread alerts and delivery status" },
  { href: "/workers", label: "Worker management", icon: "👷", desc: "Assign helmets, deactivate accounts" },
  { href: "/monitor", label: "Live monitoring", icon: "📶", desc: "Real-time charts and stale-data handling" },
];

export default async function MorePage() {
  const [session, snapshot] = await Promise.all([getSession(), getDashboardSnapshot()]);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="text-lg font-extrabold tracking-tight">More</h1>
        <p className="ms-muted text-[11px]">
          {session?.fullName} · {session?.role}
        </p>
      </div>

      <SectionTitle title="Modules" />
      <ul className="flex flex-col gap-2">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="ms-card flex items-center gap-3 p-3">
              <span className="text-lg" aria-hidden>
                {link.icon}
              </span>
              <span className="flex-1">
                <span className="block text-xs font-bold">{link.label}</span>
                <span className="ms-muted block text-[10px]">{link.desc}</span>
              </span>
              <span className="ms-muted">›</span>
            </Link>
          </li>
        ))}
      </ul>

      <SectionTitle title="Integration status" hint="What works now vs. what needs hardware or credentials" />
      <Card>
        <ul className="flex flex-col gap-2 text-[11px]">
          <li className="flex items-center justify-between gap-2">
            <span>Simulated data feed</span>
            <Pill tone={snapshot.simulatorEnabled ? "info" : "normal"}>{snapshot.simulatorEnabled ? "ON" : "OFF"}</Pill>
          </li>
          <li className="flex items-center justify-between gap-2">
            <span>Expo push</span>
            <Pill tone={process.env.EXPO_ACCESS_TOKEN ? "normal" : "offline"}>
              {process.env.EXPO_ACCESS_TOKEN ? "configured" : "needs credentials"}
            </Pill>
          </li>
          <li className="flex items-center justify-between gap-2">
            <span>MQTT bridge</span>
            <Pill tone={process.env.MQTT_URL ? "normal" : "offline"}>
              {process.env.MQTT_URL ? "configured" : "HTTP ingestion active"}
            </Pill>
          </li>
          <li className="flex items-center justify-between gap-2">
            <span>ESP32-S3 hardware</span>
            <Pill tone="offline">connect firmware to activate</Pill>
          </li>
        </ul>
      </Card>

      <Card>
        <p className="ms-label mb-1">About this prototype</p>
        <p className="ms-muted text-[11px] leading-relaxed">
          MineSafe AI is an ECE mini-project prototype for a smart mining helmet (MQ-135 air quality, DHT temperature /
          humidity, MPU-6050 accelerometer, ESP32-S3). Detection is rule-based plus a transparent statistical anomaly
          detector. No machine-learning accuracy is claimed; the anomaly interface is ready for a trained model once
          real helmet data is collected.
        </p>
      </Card>

      <LogoutButton />
      <p className="ms-muted pb-2 text-center text-[10px]">MineSafe AI · prototype v1.0</p>
    </div>
  );
}
