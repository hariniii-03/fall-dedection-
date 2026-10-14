import Constants from "expo-constants";

/**
 * Central configuration for the MineSafe AI mobile app.
 * No secrets live here: the API base URL is non-secret and can be
 * overridden in app.json `extra` or via `Constants`.
 */
export const API_BASE_URL: string =
  (Constants.expoConfig?.extra as Record<string, string | undefined>)?.apiBaseUrl ??
  "http://10.0.2.2:8000"; // Android emulator maps 10.0.2.2 to host localhost

export const SIMULATION_MODE_DEFAULT = true; // dev builds default to simulated data, clearly labelled in UI

export type Role = "worker" | "supervisor" | "admin";

export interface Session {
  token: string;
  userId: string;
  role: Role;
  name: string;
}
