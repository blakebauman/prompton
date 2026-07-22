import { useEffect, useRef } from "react";

import { statusTone } from "@/components/status-pill";
import { isDesktopRequiredError } from "@/lib/tauri";
import { useActivityLog } from "@/stores/activity-log";
import { useWorkspace } from "@/stores/workspace";

/** Mirror workspace status into the diagnostics activity log. */
export function useActivityLogBridge() {
  const status = useWorkspace((s) => s.status);
  const agentBusy = useWorkspace((s) => s.agentBusy);
  const running = useWorkspace((s) => s.running);
  const append = useActivityLog((s) => s.append);
  const last = useRef<string>("");
  const booted = useRef(false);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    append("Prompton session started", "info");
  }, [append]);

  useEffect(() => {
    if (!status || status === "Ready") return;
    if (isDesktopRequiredError(status)) return;
    if (
      /Cannot read properties of undefined \(reading ['"]invoke['"]\)/i.test(
        status,
      )
    ) {
      return;
    }
    if (status === last.current) return;
    last.current = status;

    const busy = agentBusy || running;
    const tone = statusTone(status, busy);
    const stream =
      tone === "error" ? "stderr" : tone === "success" ? "success" : "info";
    append(status, stream);
  }, [status, agentBusy, running, append]);
}
