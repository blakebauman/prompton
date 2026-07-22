import { create } from "zustand";

const MAX_LOG_ENTRIES = 500;

export type LogStream = "info" | "stderr" | "success";

export type LogEntry = {
  id: number;
  timestamp: number;
  stream: LogStream;
  line: string;
};

type ActivityLogStore = {
  entries: LogEntry[];
  append: (line: string, stream?: LogStream) => void;
  clear: () => void;
};

let nextId = 0;

/** In-memory activity log for Settings → Diagnostics. */
export const useActivityLog = create<ActivityLogStore>((set) => ({
  entries: [],
  append: (line, stream = "info") =>
    set((state) => {
      const trimmed = line.trim();
      if (!trimmed) return state;
      const entry: LogEntry = {
        id: nextId++,
        timestamp: Date.now(),
        stream,
        line: trimmed,
      };
      const entries = [...state.entries, entry];
      if (entries.length > MAX_LOG_ENTRIES) {
        return { entries: entries.slice(entries.length - MAX_LOG_ENTRIES) };
      }
      return { entries };
    }),
  clear: () => set({ entries: [] }),
}));
