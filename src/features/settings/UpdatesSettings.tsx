import { useEffect, useState } from "react";
import { AlertCircle, Copy, ExternalLink, RefreshCw } from "lucide-react";

import { SettingRow, SettingSection } from "@/components/setting-row";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { isTauri } from "@/lib/tauri";
import { useActivityLog } from "@/stores/activity-log";
import { useWorkspace } from "@/stores/workspace";

const RELEASES_URL = "https://github.com/blakebauman/prompton/releases";

type UpdateUiStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "upToDate" }
  | { kind: "unavailable"; message: string }
  | { kind: "error"; message: string };

/** About → Updates (manual releases now; auto-updater when signed builds ship). */
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

  async function openReleases() {
    try {
      if (isTauri()) {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(RELEASES_URL);
      } else {
        window.open(RELEASES_URL, "_blank", "noopener,noreferrer");
      }
      append("Opened GitHub releases", "info");
    } catch (e) {
      toast({
        title: "Couldn’t open releases",
        description: String(e),
        tone: "error",
      });
    }
  }

  async function copyVersion() {
    try {
      await navigator.clipboard.writeText(`prompton ${version}`);
      toast({ title: "Version copied", description: version, tone: "success" });
    } catch {
      toast({ title: "Couldn’t copy version", tone: "error" });
    }
  }

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
      // Signed auto-updater (pubkey + endpoints) is not configured yet.
      await new Promise((r) => window.setTimeout(r, 350));
      const message =
        "Automatic updates aren’t enabled yet — use GitHub releases for now.";
      setUi({ kind: "unavailable", message });
      append("Updater not configured; opened releases guidance", "info");
      setStatus(message);
      toast({
        title: "No auto-updater yet",
        description: "Open Releases for the latest build.",
      });
    } catch (e) {
      const message = String(e);
      setUi({ kind: "error", message });
      append(message, "stderr");
      setStatus(message);
      toast({
        title: "Update check failed",
        description: message,
        tone: "error",
      });
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
            : "Manual installs via GitHub releases until auto-update is signed.";

  return (
    <SettingSection title="Updates" description={`Prompton v${version}`}>
      <SettingRow
        title="Version"
        description="Copy the running build string."
        action={
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => void copyVersion()}
          >
            <Copy className="size-3.5" />
            Copy
          </Button>
        }
      />
      <SettingRow
        title="GitHub releases"
        description="Download the latest desktop build."
        action={
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => void openReleases()}
          >
            <ExternalLink className="size-3.5" />
            Open
          </Button>
        }
      />
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
