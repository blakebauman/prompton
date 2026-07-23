/**
 * App semver shown in Settings / rail. Kept in sync by `pnpm run version`.
 * Prefer Tauri `getVersion()` at runtime when available; this is the fallback
 * and the value baked for Vite/browser shells.
 */
export const APP_VERSION = "0.1.3";
