import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** Surfaces shown in Prompton’s artifact pane (fold.run pattern). */
export type ArtifactKind =
  | "results"
  | "chart"
  | "sql"
  | "schema"
  | "explain"
  | "context";

export const DEFAULT_ARTIFACT_KIND: ArtifactKind = "results";

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

export function ArtifactProvider({
  defaultOpen = true,
  children,
}: {
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [state, setState] = useState<ArtifactState>(() =>
    defaultOpen
      ? { open: true, kind: DEFAULT_ARTIFACT_KIND, payload: null }
      : { open: false, kind: null, payload: null },
  );
  const lastKindRef = useRef<ArtifactKind>(DEFAULT_ARTIFACT_KIND);

  const value = useMemo<ArtifactContextValue>(
    () => ({
      state,
      open: (kind, payload) => {
        lastKindRef.current = kind;
        setState({ open: true, kind, payload: payload ?? null });
      },
      close: () => setState({ open: false, kind: null, payload: null }),
      toggle: (preferredKind) =>
        setState((s) => {
          if (s.open) return { open: false, kind: null, payload: null };
          const safe =
            typeof preferredKind === "string" ? preferredKind : undefined;
          const kind = safe ?? lastKindRef.current ?? DEFAULT_ARTIFACT_KIND;
          lastKindRef.current = kind;
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
