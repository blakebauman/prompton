import { useEffect, useRef } from "react";

import { eventMatchesChord } from "@/lib/key-codes";
import {
  useShortcuts,
  type ShortcutId,
} from "@/stores/shortcuts";

/** Return `false` to leave the key event for other UI (e.g. Escape in dialogs). */
export type ShortcutHandlers = Partial<
  Record<ShortcutId, () => boolean | void>
>;

/** Listen for persisted app shortcuts and invoke handlers. */
export function useAppShortcuts(handlers: ShortcutHandlers) {
  const bindings = useShortcuts((s) => s.bindings);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("[data-chord-picker]")) return;

      const ids = Object.keys(bindings) as ShortcutId[];
      for (const id of ids) {
        const chord = bindings[id];
        if (!chord?.length) continue;
        if (!eventMatchesChord(event, chord)) continue;
        const handler = handlersRef.current[id];
        if (!handler) continue;
        const claimed = handler();
        if (claimed === false) continue;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [bindings]);
}

/** Dispatched when the Run SQL shortcut fires outside the editor. */
export const RUN_SQL_EVENT = "prompton:run-sql";
export const FORMAT_SQL_EVENT = "prompton:format-sql";
export const CANCEL_QUERY_EVENT = "prompton:cancel-query";

export function requestRunSql() {
  window.dispatchEvent(new Event(RUN_SQL_EVENT));
}

export function requestFormatSql() {
  window.dispatchEvent(new Event(FORMAT_SQL_EVENT));
}

export function requestCancelQuery() {
  window.dispatchEvent(new Event(CANCEL_QUERY_EVENT));
}
