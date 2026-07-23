import { cn } from "@/lib/utils";

type PromptonMarkIconProps = {
  className?: string;
};

/**
 * Prompton mark: database cylinder + prompt caret.
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
      {/* Cylinder */}
      <ellipse
        cx="9"
        cy="6.5"
        rx="5"
        ry="2.2"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M4 6.5v8.5c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2V6.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M4 11c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      {/* Prompt caret */}
      <path
        d="M15.5 9.5 19 12.5 15.5 15.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 12.5h2.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
