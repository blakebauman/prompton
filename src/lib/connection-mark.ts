import type { Dialect } from "@/lib/types";

/**
 * Stored identity color for a connection (grayscale dialect tint).
 * Live connection status uses `ConnectionStatus` (green when connected).
 */
export function connectionIdentityColor(c: {
  dialect: Dialect;
  isProduction?: boolean;
}): string {
  if (c.isProduction) return "var(--prod)";
  switch (c.dialect) {
    case "postgres":
      return "oklch(0.72 0 0)";
    case "mysql":
      return "oklch(0.64 0 0)";
    case "sqlite":
      return "oklch(0.55 0 0)";
    case "d1":
      return "oklch(0.58 0 0)";
  }
}

/** @deprecated Use connectionIdentityColor — kept for call-site migration. */
export const connectionMarkColor = connectionIdentityColor;
