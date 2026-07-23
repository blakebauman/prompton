import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Copy,
  Download,
  ExternalLink,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import type { Update } from "@tauri-apps/plugin-updater";

import { SettingRow, SettingSection } from "@/components/setting-row";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { APP_VERSION } from "@/lib/app-version";
import { isTauri } from "@/lib/tauri";
import { useActivityLog } from "@/stores/activity-log";
import { useWorkspace } from "@/stores/workspace";

const RELEASES_URL = "https://github.com/blakebauman/prompton/releases";

type UpdateUiStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "upToDate" }
  | { kind: "available"; version: string; notes?: string | null }
  | { kind: "downloading"; version: string; percent: number }
  | { kind: "ready"; version: string }
  | { kind: "unavailable"; message: string }
  | { kind: "error"; message: string };

/** About → Updates: check / download / relaunch via Tauri updater plugin. */
export function UpdatesSettings() {
  const setStatus = useWorkspace((s) => s.setStatus);
  const append = useActivityLog((s) => s.append);
  const [version, setVersion] = useState(APP_VERSION);
  const [ui, setUi] = useState<UpdateUiStatus>({ kind: "idle" });
  const updateRef = useRef<Update | null>(null);

  useEffect(() => {
    void (async () => {
      if (!isTauri()) {
        setVersion(APP_VERSION);
        return;
      }
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        setVersion(await getVersion());
      } catch {
        setVersion(APP_VERSION);
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
    updateRef.current = null;
    append("Checking for updates…", "info");
    try {
      if (!isTauri()) {
        const message = "Updates require the desktop app.";
        setUi({ kind: "unavailable", message });
        setStatus(message);
        toast({ title: "Updates unavailable", description: message });
        return;
      }

      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (!update) {
        setUi({ kind: "upToDate" });
        setStatus("You’re up to date");
        append(`Up to date · v${version}`, "info");
        toast({ title: "You’re up to date", description: `v${version}` });
        return;
      }

      updateRef.current = update;
      setUi({
        kind: "available",
        version: update.version,
        notes: update.body,
      });
      setStatus(`Update available · v${update.version}`);
      append(`Update available · v${update.version}`, "info");
      toast({
        title: "Update available",
        description: `v${update.version}`,
        tone: "success",
      });
    } catch (e) {
      const message = String(e);
      // Missing latest.json / network often surfaces here until a release is published.
      const friendly =
        /404|not found|failed to fetch|error sending request/i.test(message)
          ? "No update manifest yet — publish latest.json with a signed release, or download from GitHub."
          : message;
      setUi({ kind: "unavailable", message: friendly });
      append(message, "stderr");
      setStatus(friendly);
      toast({
        title: "No update feed yet",
        description: "Open Releases for manual installs.",
      });
    }
  }

  async function installUpdate() {
    const update = updateRef.current;
    if (!update) return;
    setUi({ kind: "downloading", version: update.version, percent: 0 });
    append(`Downloading v${update.version}…`, "info");
    try {
      let downloaded = 0;
      let total = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          const percent =
            total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;
          setUi({
            kind: "downloading",
            version: update.version,
            percent,
          });
        }
      });
      setUi({ kind: "ready", version: update.version });
      setStatus(`Update installed · restart to use v${update.version}`);
      append(`Installed v${update.version} — relaunch to finish`, "info");
      toast({
        title: "Update installed",
        description: "Relaunch to finish.",
        tone: "success",
      });
    } catch (e) {
      const message = String(e);
      setUi({ kind: "error", message });
      append(message, "stderr");
      setStatus(message);
      toast({
        title: "Update failed",
        description: message,
        tone: "error",
      });
    }
  }

  async function relaunchApp() {
    try {
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      toast({
        title: "Couldn’t relaunch",
        description: String(e),
        tone: "error",
      });
    }
  }

  const description =
    ui.kind === "checking"
      ? "Checking…"
      : ui.kind === "upToDate"
        ? "You’re up to date."
        : ui.kind === "available"
          ? `v${ui.version} is available.`
          : ui.kind === "downloading"
            ? `Downloading v${ui.version}… ${ui.percent}%`
            : ui.kind === "ready"
              ? `v${ui.version} installed — relaunch to finish.`
              : ui.kind === "unavailable"
                ? ui.message
                : ui.kind === "error"
                  ? "Update failed."
                  : "Checks GitHub releases for a signed update manifest.";

  const progressValue =
    ui.kind === "checking"
      ? undefined
      : ui.kind === "downloading"
        ? ui.percent
        : undefined;

  return (
    <SettingSection title="Updates" description={`Prompton v${version}`}>
      <SettingRow
        title="Version"
        description={`Running build · v${version}`}
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
        description="Manual download if auto-update isn’t available."
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
          <div className="flex items-center gap-1">
            {ui.kind === "available" && (
              <Button
                type="button"
                size="xs"
                onClick={() => void installUpdate()}
              >
                <Download className="size-3.5" />
                Install
              </Button>
            )}
            {ui.kind === "ready" && (
              <Button
                type="button"
                size="xs"
                onClick={() => void relaunchApp()}
              >
                <RotateCcw className="size-3.5" />
                Relaunch
              </Button>
            )}
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={
                ui.kind === "checking" || ui.kind === "downloading"
              }
              onClick={() => void checkForUpdates()}
            >
              <RefreshCw
                className={`size-3.5 ${ui.kind === "checking" ? "animate-spin" : ""}`}
              />
              Check
            </Button>
          </div>
        }
      />
      {ui.kind === "available" && ui.notes && (
        <SettingRow title="Release notes">
          <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground text-pretty">
            {ui.notes}
          </p>
        </SettingRow>
      )}
      {ui.kind === "error" && (
        <SettingRow title="Error">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span className="text-pretty">{ui.message}</span>
          </div>
        </SettingRow>
      )}
      {(ui.kind === "checking" || ui.kind === "downloading") && (
        <SettingRow title="Progress">
          <Progress
            value={progressValue}
            className="h-1.5"
          />
        </SettingRow>
      )}
    </SettingSection>
  );
}
