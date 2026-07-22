/**
 * Stable key-name vocabulary for shortcut chords.
 *
 * Converts between browser KeyboardEvent codes, persisted chord names,
 * and human display labels (⌘ / Ctrl / etc.).
 */

const PLATFORM_IS_MAC =
  typeof navigator !== "undefined" && /mac/i.test(navigator.platform);

/** Map a KeyboardEvent to a persisted key name, or null if unsupported. */
export function canonicalKeyFromEvent(event: KeyboardEvent): string | null {
  const code = event.code;
  if (!code) return null;
  switch (code) {
    case "AltLeft":
      return "Alt";
    case "AltRight":
      return "AltGr";
    case "BracketLeft":
      return "LeftBracket";
    case "BracketRight":
      return "RightBracket";
    case "Semicolon":
      return "SemiColon";
    case "Backslash":
      return "BackSlash";
    case "Backquote":
      return "BackQuote";
    case "Period":
      return "Dot";
    case "Enter":
      return "Return";
    case "ArrowUp":
      return "UpArrow";
    case "ArrowDown":
      return "DownArrow";
    case "ArrowLeft":
      return "LeftArrow";
    case "ArrowRight":
      return "RightArrow";
    default:
      if (
        /^(Meta|Control|Shift)(Left|Right)$/.test(code) ||
        /^Key[A-Z]$/.test(code) ||
        /^Digit[0-9]$/.test(code) ||
        /^F([1-9]|1[0-2])$/.test(code) ||
        [
          "Space",
          "Tab",
          "Backspace",
          "Delete",
          "Escape",
          "Insert",
          "Home",
          "End",
          "PageUp",
          "PageDown",
          "CapsLock",
          "Function",
          "Minus",
          "Equal",
          "Quote",
          "Comma",
          "Slash",
        ].includes(code)
      ) {
        return code;
      }
      return null;
  }
}

/** Pretty label for a persisted key name. */
export function displayLabelForKey(name: string): string {
  switch (name) {
    case "MetaLeft":
    case "MetaRight":
      return PLATFORM_IS_MAC ? "⌘" : "Win";
    case "Alt":
      return PLATFORM_IS_MAC ? "⌥" : "Alt";
    case "AltGr":
      return PLATFORM_IS_MAC ? "⌥" : "AltGr";
    case "ControlLeft":
    case "ControlRight":
      return PLATFORM_IS_MAC ? "⌃" : "Ctrl";
    case "ShiftLeft":
    case "ShiftRight":
      return PLATFORM_IS_MAC ? "⇧" : "Shift";
    case "CapsLock":
      return "⇪";
    case "Function":
      return "fn";
    case "Space":
      return "Space";
    case "Tab":
      return "⇥";
    case "Return":
      return "↵";
    case "Backspace":
      return "⌫";
    case "Delete":
      return "⌦";
    case "Escape":
      return "Esc";
    case "UpArrow":
      return "↑";
    case "DownArrow":
      return "↓";
    case "LeftArrow":
      return "←";
    case "RightArrow":
      return "→";
    case "Comma":
      return ",";
    case "Dot":
      return ".";
    case "Slash":
      return "/";
  }
  if (/^Key([A-Z])$/.test(name)) return name.slice(3);
  if (/^Digit([0-9])$/.test(name)) return name.slice(5);
  if (/^F([1-9]|1[0-2])$/.test(name)) return name;
  return name;
}

/** Side badge for left/right modifiers. */
export function modifierSideHint(name: string): "L" | "R" | null {
  if (
    name === "MetaRight" ||
    name === "AltGr" ||
    name === "ControlRight" ||
    name === "ShiftRight"
  ) {
    return "R";
  }
  if (
    name === "MetaLeft" ||
    name === "Alt" ||
    name === "ControlLeft" ||
    name === "ShiftLeft"
  ) {
    return "L";
  }
  return null;
}

const SORT_ORDER: Record<string, number> = {
  ControlLeft: 0,
  ControlRight: 0,
  Alt: 1,
  AltGr: 1,
  ShiftLeft: 2,
  ShiftRight: 2,
  MetaLeft: 3,
  MetaRight: 3,
  Function: 4,
  CapsLock: 5,
};

export function sortChordKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const sa = SORT_ORDER[a] ?? 99;
    const sb = SORT_ORDER[b] ?? 99;
    if (sa !== sb) return sa - sb;
    return a.localeCompare(b);
  });
}

export function isModifierKey(name: string): boolean {
  return (
    name.startsWith("Meta") ||
    name.startsWith("Control") ||
    name.startsWith("Shift") ||
    name === "Alt" ||
    name === "AltGr" ||
    name === "CapsLock" ||
    name === "Function"
  );
}

/** True when the event matches a persisted chord (modifiers + main key). */
export function eventMatchesChord(
  event: KeyboardEvent,
  chord: string[],
): boolean {
  if (chord.length === 0) return false;
  const needMeta = chord.some((k) => k.startsWith("Meta"));
  const needCtrl = chord.some((k) => k.startsWith("Control"));
  const needAlt = chord.some((k) => k === "Alt" || k === "AltGr");
  const needShift = chord.some((k) => k.startsWith("Shift"));
  const main = chord.find((k) => !isModifierKey(k));
  if (!main) return false;

  if (!!event.metaKey !== needMeta) return false;
  if (!!event.ctrlKey !== needCtrl) return false;
  if (!!event.altKey !== needAlt) return false;
  if (!!event.shiftKey !== needShift) return false;

  const pressed = canonicalKeyFromEvent(event);
  return pressed === main;
}

export function isMacPlatform(): boolean {
  return PLATFORM_IS_MAC;
}
