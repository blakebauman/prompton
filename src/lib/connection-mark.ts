import type { ConnectionInfo, Dialect } from "@/lib/types";

/** Monochrome connection marks — chromatic accent only for production. */
export function connectionMarkColor(c: {
  dialect: Dialect;
  isProduction?: boolean;
}): string {
  if (c.isProduction) return "var(--prod)";
  return c.dialect === "postgres" ? "oklch(0.72 0 0)" : "oklch(0.55 0 0)";
}

export function connectionMarkTitle(c: Pick<ConnectionInfo, "connected">): string {
  return c.connected ? "Connected" : "Disconnected";
}
