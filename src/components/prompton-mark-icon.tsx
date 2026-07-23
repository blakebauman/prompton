import { cn } from "@/lib/utils";

type PromptonMarkIconProps = {
  className?: string;
};

/** Prompton mark: database cylinder only. */
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
        cx="12"
        cy="6.5"
        rx="6.5"
        ry="2.4"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M5.5 6.5v9.5c0 1.35 2.9 2.45 6.5 2.45s6.5-1.1 6.5-2.45V6.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 11c0 1.35 2.9 2.45 6.5 2.45s6.5-1.1 6.5-2.45"
        stroke="currentColor"
        strokeWidth="1.75"
      />
    </svg>
  );
}
