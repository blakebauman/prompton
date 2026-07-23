import { cn } from "@/lib/utils";

type PromptonMarkIconProps = {
  className?: string;
};

/**
 * Prompton mark: database cylinder + terminal prompt (`>` + cursor).
 * Uses currentColor so it follows the surrounding chrome.
 */
export function PromptonMarkIcon({ className }: PromptonMarkIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-3.5", className)}
      aria-hidden
    >
      {/* Cylinder — left half */}
      <ellipse
        cx="8"
        cy="6.25"
        rx="4.25"
        ry="1.9"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M3.75 6.25v9c0 1.05 1.9 1.9 4.25 1.9s4.25-.85 4.25-1.9v-9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M3.75 10.75c0 1.05 1.9 1.9 4.25 1.9s4.25-.85 4.25-1.9"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      {/* Prompt: chevron, then cursor block (clear gap from cylinder) */}
      <path
        d="M14.25 9.25 17.5 12 14.25 14.75"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="19"
        y="10.35"
        width="1.65"
        height="3.3"
        rx="0.35"
        fill="currentColor"
      />
    </svg>
  );
}
