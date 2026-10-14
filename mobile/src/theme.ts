/** Industrial safety theme: high-contrast status colors, dark dashboard. */
import type { SafetyStatus } from "./types";

export const colors = {
  bg: "#0e1116",
  card: "#1a1f27",
  cardAlt: "#232a34",
  text: "#e8edf4",
  textDim: "#93a1b3",
  accent: "#3aa4ff",
  border: "#2c3440",
  danger: "#ff4d4f",
  inputBg: "#141920",
};

export const statusColors: Record<SafetyStatus, string> = {
  normal: "#2ecc71",
  warning: "#f1c40f",
  critical: "#e74c3c",
  offline: "#7f8c8d",
};

export const statusLabels: Record<SafetyStatus, string> = {
  normal: "Normal",
  warning: "Warning",
  critical: "Critical",
  offline: "Offline",
};

export const spacing = { xs: 4, s: 8, m: 12, l: 16, xl: 24 };
export const fontSizes = { xs: 11, s: 13, m: 15, l: 18, xl: 24, xxl: 32 };

export const appBarColor = "#0a0d11";
