/** macOS overlay titlebar drag strip. No-op on Windows. */
export function TitleBarDragRegion() {
  const isWindows =
    typeof navigator !== "undefined" && navigator.userAgent.includes("Windows");
  if (isWindows) return null;

  return (
    <div
      data-tauri-drag-region
      className="fixed inset-x-0 top-0 z-[100] h-11"
      aria-hidden
    />
  );
}
