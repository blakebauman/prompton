import type { ElementType, ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { isTauri } from "@/lib/tauri";

const isWindows =
  typeof navigator !== "undefined" && navigator.userAgent.includes("Windows");

/** Double-click titlebar → zoom (macOS / custom chrome). */
export function onTitlebarDoubleClick() {
  if (!isTauri()) return;
  void getCurrentWindow()
    .toggleMaximize()
    .catch(() => {});
}

type DragRegionProps = {
  as?: "div" | "header";
  className?: string;
  children?: ReactNode;
  "aria-hidden"?: boolean;
};

/**
 * Marks a surface as a window drag handle (requires
 * `core:window:allow-start-dragging`). Interactive controls inside should use
 * `.tauri-no-drag` / buttons (see index.css).
 */
export function DragRegion({
  as = "div",
  className,
  children,
  "aria-hidden": ariaHidden,
}: DragRegionProps) {
  const Tag = as as ElementType;
  const drag = !isWindows && isTauri();

  return (
    <Tag
      {...(drag ? { "data-tauri-drag-region": true } : {})}
      className={className}
      aria-hidden={ariaHidden}
      onDoubleClick={drag ? onTitlebarDoubleClick : undefined}
    >
      {children}
    </Tag>
  );
}

/** Fixed strip under traffic lights when using Overlay titlebar. */
export function TitleBarDragRegion() {
  if (isWindows || !isTauri()) return null;

  return (
    <DragRegion className="fixed inset-x-0 top-0 z-[100] h-11" aria-hidden />
  );
}
