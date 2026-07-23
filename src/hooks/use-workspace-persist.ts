import { useEffect } from "react";

import {
  flushPersistActiveDraft,
  schedulePersistActiveDraft,
} from "@/lib/workspace-persist";
import { useWorkspace } from "@/stores/workspace";

/** Debounce-persist SQL/chat drafts while the app is open; flush on unload. */
export function useWorkspacePersist() {
  useEffect(() => {
    let prevSql = useWorkspace.getState().sql;
    let prevMessages = useWorkspace.getState().messages;
    let prevSession = useWorkspace.getState().sessionId;
    let prevConn = useWorkspace.getState().activeConnId;

    const unsub = useWorkspace.subscribe((s) => {
      if (
        s.sql === prevSql &&
        s.messages === prevMessages &&
        s.sessionId === prevSession &&
        s.activeConnId === prevConn
      ) {
        return;
      }
      prevSql = s.sql;
      prevMessages = s.messages;
      prevSession = s.sessionId;
      prevConn = s.activeConnId;
      schedulePersistActiveDraft();
    });

    const onHide = () => flushPersistActiveDraft();
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);

    return () => {
      unsub();
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
      flushPersistActiveDraft();
    };
  }, []);
}
