import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  loadWorkspaceSnapshot,
  persistArtifactPrefs,
} from "@/lib/workspace-persist";

/** Surfaces shown in Prompton’s artifact pane (fold.run pattern). */
export type ArtifactKind =
  | "results"
  | "chart"
  | "sql"
  | "schema"
  | "explain"
  | "context";

export const DEFAULT_ARTIFACT_KIND: ArtifactKind = "results";

const ARTIFACT_KINDS: ArtifactKind[] = [
  "results",
  "chart",
  "sql",
  "schema",
  "explain",
  "context",
];

function isArtifactKind(v: string): v is ArtifactKind {
  return (ARTIFACT_KINDS as string[]).includes(v);
}

export type ArtifactState =
  | { open: false; kind: null; payload: null }
  | { open: true; kind: ArtifactKind; payload: unknown };

type ArtifactContextValue = {
  state: ArtifactState;
  open: (kind: ArtifactKind, payload?: unknown) => void;
  close: () => void;
  toggle: (preferredKind?: ArtifactKind) => void;
};

const ArtifactCtx = createContext<ArtifactContextValue | null>(null);

function initialArtifactState(defaultOpen: boolean): {
  state: ArtifactState;
  lastKind: ArtifactKind;
} {
  const snap = loadWorkspaceSnapshot();
  const kind = isArtifactKind(snap.artifactKind)
    ? snap.artifactKind
    : DEFAULT_ARTIFACT_KIND;
  const open = defaultOpen && snap.artifactOpen;
  return {
    lastKind: kind,
    state: open
      ? { open: true, kind, payload: null }
      : { open: false, kind: null, payload: null },
  };
}

export function ArtifactProvider({
  defaultOpen = true,
  children,
}: {
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const initial = useRef(initialArtifactState(defaultOpen)).current;
  const [state, setState] = useState<ArtifactState>(initial.state);
  const lastKindRef = useRef<ArtifactKind>(initial.lastKind);

  const value = useMemo<ArtifactContextValue>(
    () => ({
      state,
      open: (kind, payload) => {
        lastKindRef.current = kind;
        persistArtifactPrefs(kind, true);
        setState({ open: true, kind, payload: payload ?? null });
      },
      close: () => {
        persistArtifactPrefs(lastKindRef.current, false);
        setState({ open: false, kind: null, payload: null });
      },
      toggle: (preferredKind) =>
        setState((s) => {
          if (s.open) {
            persistArtifactPrefs(lastKindRef.current, false);
            return { open: false, kind: null, payload: null };
          }
          const safe =
            typeof preferredKind === "string" ? preferredKind : undefined;
          const kind = safe ?? lastKindRef.current ?? DEFAULT_ARTIFACT_KIND;
          lastKindRef.current = kind;
          persistArtifactPrefs(kind, true);
          return { open: true, kind, payload: null };
        }),
    }),
    [state],
  );

  return <ArtifactCtx.Provider value={value}>{children}</ArtifactCtx.Provider>;
}

export function useArtifact() {
  const ctx = useContext(ArtifactCtx);
  if (!ctx) throw new Error("useArtifact must be used inside ArtifactProvider");
  return ctx;
}
