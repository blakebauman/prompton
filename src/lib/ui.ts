/**
 * Layout constants — Voicebox IA, shadcn monochrome look.
 * Do not introduce brand accent colors here.
 */

import { isTauri } from "@/lib/tauri";

const isWindows =
  typeof navigator !== "undefined" && navigator.userAgent.includes("Windows");

/**
 * Top inset for traffic lights / overlay titlebar (macOS Tauri).
 * Skip the large pad in plain browser so Vite preview isn't empty at the top.
 */
export const TOP_SAFE_AREA_PADDING =
  isWindows || !isTauri() ? "pt-2" : "pt-11";

export const ACTIVITY_RAIL_WIDTH = "w-16";
export const CONNECTIONS_PANE_DEFAULT = 18;
