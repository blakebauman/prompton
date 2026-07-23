import { cn } from "@/lib/utils";

type PromptonMarkIconProps = {
  className?: string;
};

/**
 * Prompton mark: database + terminal prompt `>_`
 * (chevron and underscore cursor, spaced so it won't read as a flame).
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
      <ellipse
        cx="7.5"
        cy="6.5"
        rx="4"
        ry="1.85"
        stroke="currentColor"
        strokeWidth="1.55"
      />
      <path
        d="M3.5 6.5v8.75c0 1 1.8 1.85 4 1.85s4-.85 4-1.85V6.5"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 10.85c0 1 1.8 1.85 4 1.85s4-.85 4-1.85"
        stroke="currentColor"
        strokeWidth="1.55"
      />
      {/* `>` */}
      <path
        d="M14 8.75 17.75 12 14 15.25"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* `_` cursor — reads as terminal, not a flame tip */}
      <path
        d="M19.1 15.1h3.2"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}
