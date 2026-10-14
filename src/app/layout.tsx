import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MineSafe AI · Smart Helmet Safety Monitoring",
  description:
    "Smart mining helmet safety monitoring: air quality, temperature, fall detection, alerts and supervisor response.",
  applicationName: "MineSafe AI",
};

export const viewport: Viewport = {
  themeColor: "#060a11",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-[var(--bg)] text-[var(--text)] antialiased">{children}</body>
    </html>
  );
}
