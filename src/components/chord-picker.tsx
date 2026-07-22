import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard } from "lucide-react";

import { KeyCap } from "@/components/key-cap";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  canonicalKeyFromEvent,
  sortChordKeys,
} from "@/lib/key-codes";

/** Modal that captures a keyboard chord (peak set while keys are held). */
export function ChordPicker({
  open,
  title,
  description,
  initialKeys,
  onSave,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  initialKeys: string[];
  onSave: (keys: string[]) => void;
  onCancel: () => void;
}) {
  const [pressed, setPressed] = useState<Set<string>>(new Set());
  const [captured, setCaptured] = useState<string[]>(initialKeys);
  const [unsupportedAttempt, setUnsupportedAttempt] = useState<string | null>(
    null,
  );
  const captureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setPressed(new Set());
    setCaptured(initialKeys);
    setUnsupportedAttempt(null);
    const timeoutId = window.setTimeout(() => captureRef.current?.focus(), 50);
    return () => window.clearTimeout(timeoutId);
  }, [open, initialKeys]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === "Escape" || event.key === "Tab") return;

    const canonical = canonicalKeyFromEvent(event);
    if (!canonical) {
      setUnsupportedAttempt(event.code || event.key || "unknown");
      event.preventDefault();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setUnsupportedAttempt(null);

    setPressed((prev) => {
      if (prev.has(canonical)) return prev;
      const next = new Set(prev);
      next.add(canonical);
      setCaptured((prevCaptured) => {
        const candidate = sortChordKeys(Array.from(next));
        if (prev.size === 0) return candidate;
        return candidate.length >= prevCaptured.length
          ? candidate
          : prevCaptured;
      });
      return next;
    });
  }, []);

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    if (event.key === "Escape" || event.key === "Tab") return;
    const canonical = canonicalKeyFromEvent(event);
    if (!canonical) return;
    event.preventDefault();
    setPressed((prev) => {
      if (!prev.has(canonical)) return prev;
      const next = new Set(prev);
      next.delete(canonical);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
    };
  }, [open, handleKeyDown, handleKeyUp]);

  const displayKeys =
    pressed.size > 0 ? sortChordKeys(Array.from(pressed)) : captured;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        <div
          ref={captureRef}
          data-chord-picker
          tabIndex={-1}
          className="rounded-lg border border-border/60 bg-muted/30 p-6 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Keyboard className="size-3.5" />
              {pressed.size > 0
                ? "Capturing…"
                : "Press the shortcut you want"}
            </div>
            <div className="flex min-h-10 flex-wrap items-center justify-center gap-1.5">
              {displayKeys.length === 0 ? (
                <span className="text-sm text-muted-foreground italic">
                  No keys yet
                </span>
              ) : (
                displayKeys.map((k) => <KeyCap key={k} name={k} />)
              )}
            </div>
            {unsupportedAttempt ? (
              <p className="text-xs text-destructive">
                Unsupported key: {unsupportedAttempt}
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => onSave(captured)}
            disabled={captured.length === 0}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
