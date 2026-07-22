import { useEffect, useState } from "react";
import { BookOpen, Code2 } from "lucide-react";

import { useArtifact } from "@/components/artifact/artifact-context";
import { LinkTile } from "@/components/link-tile";
import { SettingRow, SettingSection } from "@/components/setting-row";
import { UnderlineTab, UnderlineTabs } from "@/components/underline-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, isDesktopRequiredError } from "@/lib/tauri";
import type { ProviderKind, SkillMeta, PromptEntry } from "@/lib/types";
import { useTheme, type ThemeMode } from "@/stores/theme";
import { useWorkspace } from "@/stores/workspace";

type SettingsTab =
  | "appearance"
  | "provider"
  | "skills"
  | "prompts"
  | "about";

const TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: "appearance", label: "Appearance" },
  { id: "provider", label: "Provider" },
  { id: "skills", label: "Skills" },
  { id: "prompts", label: "Prompts" },
  { id: "about", label: "About" },
];

/** Full settings body — tabbed SettingRow layout. */
export function SettingsPanel() {
  const { setStatus, contextReport } = useWorkspace();
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const { open: openArtifact } = useArtifact();
  const [tab, setTab] = useState<SettingsTab>("appearance");
  const [kind, setKind] = useState<ProviderKind>("ollama");
  const [model, setModel] = useState("qwen2.5-coder:14b");
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:11434/v1");
  const [apiKey, setApiKey] = useState("");
  const [ollamaModels, setOllamaModels] = useState<
    { name: string; supportsTools: boolean }[]
  >([]);
  const [skills, setSkills] = useState<SkillMeta[]>([]);
  const [prompts, setPrompts] = useState<PromptEntry[]>([]);
  const [skillName, setSkillName] = useState("");
  const [skillDesc, setSkillDesc] = useState("");
  const [skillBody, setSkillBody] = useState("");
  const [promptTitle, setPromptTitle] = useState("");
  const [promptBody, setPromptBody] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const settings = await api.agentGetSettings();
        setKind(settings.provider.kind);
        setModel(settings.provider.model);
        setBaseUrl(settings.provider.baseUrl ?? "");
        setSkills(await api.listSkills());
        setPrompts(await api.listPrompts());
        if (settings.provider.kind === "ollama") {
          try {
            const models = await api.listOllamaModels(
              settings.provider.baseUrl ?? undefined,
            );
            setOllamaModels(models);
          } catch {
            setOllamaModels([]);
          }
        }
      } catch (e) {
        if (!isDesktopRequiredError(e)) setStatus(String(e));
      }
    })();
  }, [setStatus]);

  useEffect(() => {
    if (kind !== "ollama") return;
    void (async () => {
      try {
        const models = await api.listOllamaModels(baseUrl || undefined);
        setOllamaModels(models);
      } catch {
        setOllamaModels([]);
      }
    })();
  }, [kind, baseUrl]);

  return (
    <div className="space-y-5">
      <UnderlineTabs className="border-b border-border/60">
        {TABS.map((t) => (
          <UnderlineTab
            key={t.id}
            active={tab === t.id}
            onClick={() => setTab(t.id)}
            className="px-3"
          >
            {t.label}
          </UnderlineTab>
        ))}
      </UnderlineTabs>

      {tab === "appearance" && (
        <SettingSection title="Appearance">
          <SettingRow
            title="Theme"
            description="Light, dark, or follow system."
            action={
              <Select
                value={themeMode}
                onValueChange={(v) => setThemeMode(v as ThemeMode)}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            }
          />
        </SettingSection>
      )}

      {tab === "provider" && (
        <SettingSection
          title="Model provider"
          description="Local Ollama by default. API keys stay in the OS keyring."
        >
          <SettingRow
            title="Provider"
            action={
              <Select
                value={kind}
                onValueChange={(v) => setKind(v as ProviderKind)}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ollama">Ollama (local)</SelectItem>
                  <SelectItem value="openaiCompatible">
                    OpenAI-compatible
                  </SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <SettingRow title="Model">
            {kind === "ollama" && ollamaModels.length > 0 ? (
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a local model" />
                </SelectTrigger>
                <SelectContent>
                  {ollamaModels.map((m) => (
                    <SelectItem key={m.name} value={m.name}>
                      {m.name}
                      {m.supportsTools ? " · tools" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                className="h-8"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            )}
            {kind === "ollama" && ollamaModels.length === 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                No Ollama models detected. Run `ollama serve` and pull a model
                (e.g. `ollama pull qwen2.5-coder:14b`).
              </p>
            )}
          </SettingRow>
          <SettingRow title="Base URL">
            <Input
              className="h-8"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </SettingRow>
          <SettingRow
            title="API key"
            description="Leave blank to keep the existing keyring value."
          >
            <Input
              className="h-8"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="••••••••"
            />
          </SettingRow>
          <div className="py-3">
            <Button
              onClick={() =>
                void (async () => {
                  await api.agentSetSettings(
                    {
                      provider: {
                        kind,
                        model,
                        baseUrl: baseUrl || null,
                      },
                    },
                    apiKey || undefined,
                  );
                  setStatus("Agent settings saved");
                })()
              }
            >
              Save provider
            </Button>
          </div>
        </SettingSection>
      )}

      {tab === "skills" && (
        <SettingSection title="Skills">
          {skills.length === 0 ? (
            <p className="py-3 text-xs text-muted-foreground">
              No skills yet. Save one below to reuse mid-session.
            </p>
          ) : (
            <ul className="space-y-2 py-3 text-xs text-muted-foreground">
              {skills.map((s) => (
                <li key={s.name}>
                  <span className="font-medium text-foreground">{s.name}</span>
                  {s.description ? ` — ${s.description}` : null}
                </li>
              ))}
            </ul>
          )}
          <div className="space-y-2 py-2">
            <Input
              className="h-8"
              placeholder="skill-name"
              value={skillName}
              onChange={(e) => setSkillName(e.target.value)}
            />
            <Input
              className="h-8"
              placeholder="description"
              value={skillDesc}
              onChange={(e) => setSkillDesc(e.target.value)}
            />
            <Textarea
              placeholder="Skill body markdown"
              value={skillBody}
              onChange={(e) => setSkillBody(e.target.value)}
            />
            <Button
              variant="secondary"
              onClick={() =>
                void (async () => {
                  await api.saveSkill(skillName, skillDesc, skillBody);
                  setSkills(await api.listSkills());
                  setStatus(`Saved skill ${skillName}`);
                })()
              }
            >
              Save skill
            </Button>
          </div>
        </SettingSection>
      )}

      {tab === "prompts" && (
        <SettingSection title="Prompt library">
          {prompts.length === 0 ? (
            <p className="py-3 text-xs text-muted-foreground">
              No saved prompts yet.
            </p>
          ) : (
            <ul className="space-y-1 py-3 text-xs text-muted-foreground">
              {prompts.map((p) => (
                <li key={p.id}>
                  <span className="font-medium text-foreground">{p.title}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="space-y-2 py-2">
            <Input
              className="h-8"
              placeholder="Title"
              value={promptTitle}
              onChange={(e) => setPromptTitle(e.target.value)}
            />
            <Textarea
              placeholder="Prompt body"
              value={promptBody}
              onChange={(e) => setPromptBody(e.target.value)}
            />
            <Button
              variant="secondary"
              onClick={() =>
                void (async () => {
                  await api.savePrompt(promptTitle, promptBody);
                  setPrompts(await api.listPrompts());
                  setStatus("Prompt saved");
                })()
              }
            >
              Save prompt
            </Button>
          </div>
        </SettingSection>
      )}

      {tab === "about" && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <LinkTile
              href="https://prompton.dev"
              title="Documentation"
              subtitle="prompton.dev"
              icon={BookOpen}
            />
            <LinkTile
              href="https://github.com/blakebauman/prompton"
              title="GitHub"
              subtitle="blakebauman/prompton"
              icon={Code2}
            />
          </div>
          <SettingSection
            title="Agent context"
            description={
              contextReport
                ? `Last context: ${contextReport.totalChars} chars${contextReport.truncated ? ", truncated" : ""}.`
                : "No context captured yet."
            }
          >
            <div className="py-2">
              <Button
                variant="secondary"
                onClick={() => openArtifact("context")}
              >
                Open Context artifact
              </Button>
            </div>
          </SettingSection>
          <p className="text-xs text-muted-foreground">
            Prompton v0.1 — native agentic database client.
          </p>
        </div>
      )}
    </div>
  );
}
