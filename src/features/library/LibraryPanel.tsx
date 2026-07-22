import { useEffect, useState } from "react";
import { BookMarked, FileText, Plus, Sparkles } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import {
  ListPane,
  ListPaneActions,
  ListPaneHeader,
  ListPaneScroll,
  ListPaneTitle,
  ListPaneTitleRow,
} from "@/components/list-pane";
import { UnderlineTab, UnderlineTabs } from "@/components/underline-tabs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, isDesktopRequiredError } from "@/lib/tauri";
import type { PromptEntry, SkillMeta } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/stores/workspace";

type LibraryTab = "skills" | "prompts";

/** Skills & prompts browser — list+detail with create + edit. */
export function LibraryPanel({
  onOpenSettings,
}: {
  onOpenSettings?: () => void;
}) {
  const { setStatus } = useWorkspace();
  const [tab, setTab] = useState<LibraryTab>("skills");
  const [skills, setSkills] = useState<SkillMeta[]>([]);
  const [prompts, setPrompts] = useState<PromptEntry[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);
  const [skillDesc, setSkillDesc] = useState("");
  const [skillBody, setSkillBody] = useState("");
  const [promptTitle, setPromptTitle] = useState("");
  const [promptBody, setPromptBody] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newBody, setNewBody] = useState("");
  const [creating, setCreating] = useState(false);

  async function refresh() {
    try {
      const [s, p] = await Promise.all([api.listSkills(), api.listPrompts()]);
      setSkills(s);
      setPrompts(p);
      setSelectedSkill((prev) => prev ?? s[0]?.name ?? null);
      setSelectedPrompt((prev) => prev ?? p[0]?.id ?? null);
    } catch (e) {
      if (!isDesktopRequiredError(e)) setStatus(String(e));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (tab !== "skills" || !selectedSkill) {
      if (tab === "skills") {
        setSkillDesc("");
        setSkillBody("");
        setDirty(false);
      }
      return;
    }
    void (async () => {
      try {
        const content = await api.getSkill(selectedSkill);
        setSkillDesc(content.description ?? "");
        setSkillBody(content.body ?? "");
        setDirty(false);
      } catch {
        const meta = skills.find((s) => s.name === selectedSkill);
        setSkillDesc(meta?.description ?? "");
        setSkillBody("");
        setDirty(false);
      }
    })();
  }, [tab, selectedSkill, skills]);

  useEffect(() => {
    if (tab !== "prompts" || !selectedPrompt) {
      if (tab === "prompts") {
        setPromptTitle("");
        setPromptBody("");
        setDirty(false);
      }
      return;
    }
    const p = prompts.find((x) => x.id === selectedPrompt);
    setPromptTitle(p?.title ?? "");
    setPromptBody(p?.body ?? "");
    setDirty(false);
  }, [tab, selectedPrompt, prompts]);

  const empty =
    (tab === "skills" && skills.length === 0) ||
    (tab === "prompts" && prompts.length === 0);

  const hasSelection =
    (tab === "skills" && !!selectedSkill) ||
    (tab === "prompts" && !!selectedPrompt);

  function openCreate() {
    setNewName("");
    setNewDesc("");
    setNewBody("");
    setCreateOpen(true);
  }

  async function createItem() {
    const name = newName.trim();
    if (!name) {
      setStatus(
        tab === "skills" ? "Skill name is required" : "Prompt title is required",
      );
      return;
    }
    setCreating(true);
    try {
      if (tab === "skills") {
        const saved = await api.saveSkill(name, newDesc.trim(), newBody);
        const list = await api.listSkills();
        setSkills(list);
        setSelectedSkill(saved.name);
        setStatus(`Created skill ${saved.name}`);
      } else {
        const saved = await api.savePrompt(name, newBody);
        const list = await api.listPrompts();
        setPrompts(list);
        setSelectedPrompt(saved.id);
        setStatus("Prompt created");
      }
      setCreateOpen(false);
    } catch (e) {
      if (!isDesktopRequiredError(e)) setStatus(String(e));
    } finally {
      setCreating(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      if (tab === "skills" && selectedSkill) {
        await api.saveSkill(selectedSkill, skillDesc, skillBody);
        setSkills(await api.listSkills());
        setStatus(`Saved skill ${selectedSkill}`);
      } else if (tab === "prompts" && selectedPrompt) {
        const saved = await api.savePrompt(
          promptTitle,
          promptBody,
          selectedPrompt,
        );
        setPrompts(await api.listPrompts());
        setSelectedPrompt(saved.id);
        setStatus("Prompt saved");
      }
      setDirty(false);
    } catch (e) {
      if (!isDesktopRequiredError(e)) setStatus(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-[320px] shrink-0">
        <ListPane>
          <ListPaneHeader>
            <ListPaneTitleRow className="mb-2">
              <ListPaneTitle>Library</ListPaneTitle>
              <ListPaneActions>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={openCreate}
                  aria-label={tab === "skills" ? "New skill" : "New prompt"}
                >
                  <Plus className="size-3.5" />
                  New
                </Button>
              </ListPaneActions>
            </ListPaneTitleRow>
            <UnderlineTabs className="border-b border-border/60">
              {(
                [
                  { id: "skills", label: "Skills" },
                  { id: "prompts", label: "Prompts" },
                ] as const
              ).map((t) => (
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
          </ListPaneHeader>

          <ListPaneScroll className="pt-28">
            <div className="space-y-1 px-1">
              {empty && (
                <EmptyState
                  dashed
                  className="min-h-40 p-4"
                  icon={<BookMarked className="size-8" />}
                  title={tab === "skills" ? "No skills yet" : "No prompts yet"}
                  description="Create one here — they persist across sessions."
                  actions={
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button size="sm" onClick={openCreate}>
                        <Plus className="size-3.5" />
                        {tab === "skills" ? "New skill" : "New prompt"}
                      </Button>
                      {onOpenSettings && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={onOpenSettings}
                        >
                          Open Settings
                        </Button>
                      )}
                    </div>
                  }
                />
              )}

              {tab === "skills" &&
                skills.map((s) => {
                  const active = selectedSkill === s.name;
                  return (
                    <button
                      key={s.name}
                      type="button"
                      className={cn(
                        "flex w-full items-start gap-2 rounded-lg border p-3 text-left transition-colors",
                        active
                          ? "border-border bg-muted/70"
                          : "border-transparent hover:bg-muted/30",
                      )}
                      onClick={() => setSelectedSkill(s.name)}
                    >
                      <Sparkles className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium">
                          {s.name}
                        </span>
                        {s.description && (
                          <span className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                            {s.description}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}

              {tab === "prompts" &&
                prompts.map((p) => {
                  const active = selectedPrompt === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={cn(
                        "flex w-full items-start gap-2 rounded-lg border p-3 text-left transition-colors",
                        active
                          ? "border-border bg-muted/70"
                          : "border-transparent hover:bg-muted/30",
                      )}
                      onClick={() => setSelectedPrompt(p.id)}
                    >
                      <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium">
                          {p.title}
                        </span>
                        <span className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                          {p.body.slice(0, 120)}
                        </span>
                      </span>
                    </button>
                  );
                })}
            </div>
          </ListPaneScroll>
        </ListPane>
      </div>

      <div className="relative min-w-0 flex-1 overflow-hidden border-l border-border/60">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-background to-transparent" />
        {hasSelection ? (
          <>
            <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 px-6 pt-5">
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">
                  {tab === "skills" ? "Skill" : "Prompt"}
                  {dirty ? " · unsaved" : ""}
                </p>
                <h2 className="mt-1 truncate text-xl font-bold tracking-tight">
                  {tab === "skills"
                    ? selectedSkill
                    : promptTitle || "Untitled prompt"}
                </h2>
              </div>
              <Button
                size="sm"
                disabled={!dirty || saving}
                onClick={() => void save()}
              >
                {saving ? "Saving…" : dirty ? "Save" : "Saved"}
              </Button>
            </div>
            <div className="h-full space-y-3 overflow-y-auto px-6 pt-20 pb-8">
              {tab === "skills" ? (
                <>
                  <Input
                    value={skillDesc}
                    onChange={(e) => {
                      setSkillDesc(e.target.value);
                      setDirty(true);
                    }}
                    placeholder="Short description"
                    className="text-sm"
                  />
                  <Textarea
                    value={skillBody}
                    onChange={(e) => {
                      setSkillBody(e.target.value);
                      setDirty(true);
                    }}
                    placeholder="Skill body (markdown)"
                    className="min-h-[280px] font-mono text-xs leading-relaxed"
                  />
                </>
              ) : (
                <>
                  <Input
                    value={promptTitle}
                    onChange={(e) => {
                      setPromptTitle(e.target.value);
                      setDirty(true);
                    }}
                    placeholder="Title"
                    className="text-sm"
                  />
                  <Textarea
                    value={promptBody}
                    onChange={(e) => {
                      setPromptBody(e.target.value);
                      setDirty(true);
                    }}
                    placeholder="Prompt body"
                    className="min-h-[280px] text-sm leading-relaxed"
                  />
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="absolute inset-x-0 top-0 z-20 px-6 pt-5">
              <h2 className="text-xl font-bold tracking-tight">
                {tab === "skills" ? "Skill" : "Prompt"}
              </h2>
            </div>
            <div className="h-full px-6 pt-16">
              <EmptyState
                title="Select an item"
                description="Pick a skill or prompt from the list, or create a new one."
                actions={
                  <Button size="sm" onClick={openCreate}>
                    <Plus className="size-3.5" />
                    New
                  </Button>
                }
              />
            </div>
          </>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {tab === "skills" ? "New skill" : "New prompt"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={
                tab === "skills" ? "skill-name" : "Prompt title"
              }
            />
            {tab === "skills" && (
              <Input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Short description"
              />
            )}
            <Textarea
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              placeholder={
                tab === "skills" ? "Skill body (markdown)" : "Prompt body"
              }
              className="min-h-32"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={creating || !newName.trim()}
              onClick={() => void createItem()}
            >
              {creating ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
