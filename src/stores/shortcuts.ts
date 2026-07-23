import { create } from "zustand";
import { persist } from "zustand/middleware";

import { isMacPlatform } from "@/lib/key-codes";

export type ShortcutId =
  | "toggleArtifact"
  | "openSettings"
  | "focusChat"
  | "runSql"
  | "cancelQuery"
  | "formatSql";

export type ShortcutDef = {
  id: ShortcutId;
  title: string;
  description: string;
};

export const SHORTCUT_DEFS: ShortcutDef[] = [
  {
    id: "toggleArtifact",
    title: "Toggle artifact pane",
    description: "Show or hide Results / SQL / Schema.",
  },
  {
    id: "openSettings",
    title: "Open Settings",
    description: "Jump to the Settings activity.",
  },
  {
    id: "focusChat",
    title: "Focus chat",
    description: "Focus the chat composer.",
  },
  {
    id: "runSql",
    title: "Run SQL",
    description: "Execute the SQL editor contents.",
  },
  {
    id: "cancelQuery",
    title: "Cancel query",
    description: "Stop the in-flight SQL query.",
  },
  {
    id: "formatSql",
    title: "Format SQL",
    description: "Pretty-print the SQL editor contents.",
  },
];

function defaultBindings(): Record<ShortcutId, string[]> {
  const mod = isMacPlatform() ? "MetaLeft" : "ControlLeft";
  return {
    toggleArtifact: [mod, "ShiftLeft", "KeyJ"],
    openSettings: [mod, "Comma"],
    focusChat: [mod, "KeyK"],
    runSql: [mod, "Return"],
    cancelQuery: ["Escape"],
    formatSql: [mod, "ShiftLeft", "KeyF"],
  };
}

type ShortcutsStore = {
  bindings: Record<ShortcutId, string[]>;
  setBinding: (id: ShortcutId, keys: string[]) => void;
  resetDefaults: () => void;
};

/** Persisted keyboard shortcut bindings. */
export const useShortcuts = create<ShortcutsStore>()(
  persist(
    (set) => ({
      bindings: defaultBindings(),
      setBinding: (id, keys) =>
        set((state) => ({
          bindings: { ...state.bindings, [id]: keys },
        })),
      resetDefaults: () => set({ bindings: defaultBindings() }),
    }),
    {
      name: "prompton.shortcuts",
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ShortcutsStore>;
        return {
          ...current,
          ...p,
          bindings: {
            ...defaultBindings(),
            ...(p.bindings ?? {}),
          },
        };
      },
    },
  ),
);
