import { useEffect, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

import { SettingRow, SettingSection } from "@/components/setting-row";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { isTauri } from "@/lib/tauri";
import { useActivityLog } from "@/stores/activity-log";
import { useWorkspace } from "@/stores/workspace";

type UpdateUiStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "upToDate" }
  | { kind: "unavailable"; message: string }
  | { kind: "error"; message: string };

/** About → Updates shell (check / progress rows; updater plugin optional). */
export function UpdatesSettings() {
  const setStatus = useWorkspace((s) => s.setStatus);
  const append = useActivityLog((s) => s.append);
  const [version, setVersion] = useState("0.1.0");
  const [ui, setUi] = useState<UpdateUiStatus>({ kind: "idle" });
  const [progress] = useState(0);

  useEffect(() => {
    void (async () => {
      if (!isTauri()) return;
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        setVersion(await getVersion());
      } catch {
        /* keep package default */
      }
    })();
  }, []);

  async function checkForUpdates() {
    setUi({ kind: "checking" });
    append("Checking for updates…", "info");
    try {
      if (!isTauri()) {
        const message = "Updates require the desktop app.";
        setUi({ kind: "unavailable", message });
        setStatus(message);
        toast({ title: "Updates unavailable", description: message });
        return;
      }
      // Updater plugin is not wired yet — surface an honest idle state.
      await new Promise((r) => window.setTimeout(r, 400));
      const message = "Automatic updates aren’t enabled in this build yet.";
      setUi({ kind: "unavailable", message });
      append("Updater not configured in this build", "info");
      setStatus(message);
      toast({ title: "No updater configured", description: message });
    } catch (e) {
      const message = String(e);
      setUi({ kind: "error", message });
      append(message, "stderr");
      setStatus(message);
      toast({ title: "Update check failed", description: message, tone: "error" });
    }
  }

  const description =
    ui.kind === "checking"
      ? "Checking…"
      : ui.kind === "upToDate"
        ? "You’re up to date."
        : ui.kind === "unavailable"
          ? ui.message
          : ui.kind === "error"
            ? "Check failed."
            : "Check GitHub releases or rebuild from source.";

  return (
    <SettingSection title="Updates" description={`Prompton v${version}`}>
      <SettingRow
        title="Check for updates"
        description={description}
        action={
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={ui.kind === "checking"}
            onClick={() => void checkForUpdates()}
          >
            <RefreshCw
              className={`size-3.5 ${ui.kind === "checking" ? "animate-spin" : ""}`}
            />
            Check
          </Button>
        }
      />
      {ui.kind === "error" && (
        <SettingRow title="Error">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span className="text-pretty">{ui.message}</span>
          </div>
        </SettingRow>
      )}
      {ui.kind === "checking" && (
        <SettingRow title="Progress">
          <Progress value={progress} className="h-1.5" />
        </SettingRow>
      )}
    </SettingSection>
  );
}
