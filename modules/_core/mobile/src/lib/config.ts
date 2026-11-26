import Constants from "expo-constants";

/**
 * A physical device (Expo Go) can't reach the server at "localhost" — that's the
 * phone itself. In dev we derive the dev machine's LAN IP from Metro's host URI
 * (e.g. "192.168.1.78:8081") and point at its :8000.
 *
 * Set EXPO_PUBLIC_API_URL to override (required for production / device builds
 * and simulators on a different network).
 */
function devServerUrl(): string | undefined {
  const c = Constants as unknown as {
    expoConfig?: { hostUri?: string } | null;
    expoGoConfig?: { debuggerHost?: string } | null;
  };
  const hostUri = c.expoConfig?.hostUri ?? c.expoGoConfig?.debuggerHost;
  const host = hostUri?.split(":")[0];
  return host ? `http://${host}:8000` : undefined;
}

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? devServerUrl() ?? "http://localhost:8000";
