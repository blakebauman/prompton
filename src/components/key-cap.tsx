import {
  displayLabelForKey,
  modifierSideHint,
  sortChordKeys,
} from "@/lib/key-codes";
import { cn } from "@/lib/utils";

/** Single keycap chip for shortcut chords. */
export function KeyCap({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const side = modifierSideHint(name);
  return (
    <span
      className={cn(
        "relative inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-border/70 bg-background px-1.5",
        "font-mono text-xs font-medium text-foreground shadow-sm",
        className,
      )}
    >
      {displayLabelForKey(name)}
      {side ? (
        <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-sm bg-muted px-0.5 text-[8px] font-bold leading-none text-muted-foreground">
          {side}
        </span>
      ) : null}
    </span>
  );
}

/** Sorted row of keycaps for a chord. */
export function KeyCapChord({
  keys,
  className,
}: {
  keys: string[];
  className?: string;
}) {
  const sorted = sortChordKeys(keys);
  if (sorted.length === 0) {
    return (
      <span className="text-xs text-muted-foreground italic">Not set</span>
    );
  }
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {sorted.map((k) => (
        <KeyCap key={k} name={k} />
      ))}
    </span>
  );
}
