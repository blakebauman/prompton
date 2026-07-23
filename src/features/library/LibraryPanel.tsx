import { useEffect, useMemo, useState } from "react";
import {
  BookMarked,
  FileText,
  MessageSquare,
  MessageSquarePlus,
  Plus,
  Sparkles,
} from "lucide-react";

import {
  DetailPane,
  DetailPaneActions,
  DetailPaneHeader,
  DetailPaneMeta,
  DetailPaneScroll,
  DetailPaneTitle,
} from "@/components/detail-pane";
import { EmptyState } from "@/components/empty-state";
import {
  ListPane,
  ListPaneActions,
  ListPaneHeader,
  ListPaneScroll,
  ListPaneSearch,
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
import { toast } from "@/hooks/use-toast";
import { formatWhen } from "@/lib/format";
import { api, isDesktopRequiredError } from "@/lib/tauri";
import type { PromptEntry, SkillMeta } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/stores/workspace";

type LibraryTab = "skills" | "prompts";

/** Skills & prompts browser — list+detail with create + edit. */
export function LibraryPanel({
  onOpenSettings,
  onOpenWorkspace,
}: {
  onOpenSettings?: () => void;
  onOpenWorkspace?: () => void;
}) {
  const { setStatus, setComposerDraft } = useWorkspace();
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
  const [query, setQuery] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newBody, setNewBody] = useState("");
  const [creating, setCreating] = useState(false);

  const filteredSkills = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.description?.toLowerCase().includes(q) ?? false),
    );
  }, [skills, query]);

  const filteredPrompts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return prompts;
    return prompts.filter(
      (p) =>
        p.title.toLowerCase().includes(q) || p.body.toLowerCase().includes(q),
    );
  }, [prompts, query]);

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
  const filteredEmpty =
    !empty &&
    ((tab === "skills" && filteredSkills.length === 0) ||
      (tab === "prompts" && filteredPrompts.length === 0));

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
      const msg =
        tab === "skills" ? "Skill name is required" : "Prompt title is required";
      setStatus(msg);
      toast({ title: msg });
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
        toast({
          title: "Skill created",
          description: saved.name,
          tone: "success",
        });
      } else {
        const saved = await api.savePrompt(name, newBody);
        const list = await api.listPrompts();
        setPrompts(list);
        setSelectedPrompt(saved.id);
        setStatus("Prompt created");
        toast({
          title: "Prompt created",
          description: saved.title,
          tone: "success",
        });
      }
      setCreateOpen(false);
    } catch (e) {
      if (!isDesktopRequiredError(e)) {
        setStatus(String(e));
        toast({
          title: "Create failed",
          description: String(e),
          tone: "error",
        });
      }
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
        toast({
          title: "Skill saved",
          description: selectedSkill,
          tone: "success",
        });
      } else if (tab === "prompts" && selectedPrompt) {
        const saved = await api.savePrompt(
          promptTitle,
          promptBody,
          selectedPrompt,
        );
        setPrompts(await api.listPrompts());
        setSelectedPrompt(saved.id);
        setStatus("Prompt saved");
        toast({
          title: "Prompt saved",
          description: saved.title,
          tone: "success",
        });
      }
      setDirty(false);
    } catch (e) {
      if (!isDesktopRequiredError(e)) {
        setStatus(String(e));
        toast({
          title: "Save failed",
          description: String(e),
          tone: "error",
        });
      }
    } finally {
      setSaving(false);
    }
  }

  function sendToAssistant(draft: string, label: string) {
    const text = draft.trim();
    if (!text) {
      toast({ title: "Nothing to send", description: "Add a body first." });
      return;
    }
    setComposerDraft(text);
    onOpenWorkspace?.();
    setStatus("Loaded into assistant");
    toast({
      title: "Loaded into assistant",
      description: label,
      tone: "success",
    });
  }

  function useInAssistant() {
    if (tab === "skills" && selectedSkill) {
      const text = skillBody.trim() || skillDesc.trim();
      if (!text) {
        toast({ title: "Nothing to send", description: "Add a body first." });
        return;
      }
      sendToAssistant(
        `Use skill “${selectedSkill}”:\n\n${text}`,
        selectedSkill,
      );
      return;
    }
    sendToAssistant(promptBody, promptTitle || "Prompt");
  }

  async function useSkillFromList(skill: SkillMeta) {
    setSelectedSkill(skill.name);
    try {
      const content = await api.getSkill(skill.name);
      const body =
        (content.body ?? "").trim() || (content.description ?? "").trim();
      if (!body) {
        toast({ title: "Nothing to send", description: "Add a body first." });
        return;
      }
      sendToAssistant(`Use skill “${skill.name}”:\n\n${body}`, skill.name);
    } catch (e) {
      const fallback = skill.description?.trim() ?? "";
      if (!fallback) {
        toast({
          title: "Couldn’t load skill",
          description: String(e),
          tone: "error",
        });
        return;
      }
      sendToAssistant(
        `Use skill “${skill.name}”:\n\n${fallback}`,
        skill.name,
      );
    }
  }

  function usePromptFromList(prompt: PromptEntry) {
    setSelectedPrompt(prompt.id);
    sendToAssistant(prompt.body, prompt.title || "Prompt");
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-[320px] shrink-0">
        <ListPane>
          <ListPaneHeader>
            <ListPaneTitleRow className="mb-1">
              <ListPaneTitle>Library</ListPaneTitle>
              <ListPaneActions>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={openCreate}
                  aria-label={tab === "skills" ? "New skill" : "New prompt"}
                >
                  <Plus className="size-3.5" />
                  New
                </Button>
              </ListPaneActions>
            </ListPaneTitleRow>
            <UnderlineTabs className="mb-1.5 border-b border-border/50">
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
                >
                  {t.label}
                </UnderlineTab>
              ))}
            </UnderlineTabs>
            <div className="pb-3">
              <ListPaneSearch
                value={query}
                onChange={setQuery}
                placeholder={
                  tab === "skills" ? "Search skills…" : "Search prompts…"
                }
              />
            </div>
          </ListPaneHeader>

          <ListPaneScroll className="pt-36">
            <div className="space-y-0.5 px-1">
              {empty && (
                <EmptyState
                  dashed
                  className="min-h-40 p-4"
                  icon={<BookMarked className="size-8" />}
                  title={tab === "skills" ? "No skills yet" : "No prompts yet"}
                  description="Create one here — they persist across sessions."
                  actions={
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button size="xs" onClick={openCreate}>
                        <Plus className="size-3.5" />
                        {tab === "skills" ? "New skill" : "New prompt"}
                      </Button>
                      {onOpenSettings && (
                        <Button
                          size="xs"
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

              {filteredEmpty && (
                <EmptyState
                  className="min-h-40 p-4"
                  title="No matches"
                  description={`Nothing matched “${query.trim()}”.`}
                />
              )}

              {tab === "skills" &&
                filteredSkills.map((s) => {
                  const active = selectedSkill === s.name;
                  return (
                    <div key={s.name} className="group relative">
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-start gap-2 rounded-md border px-2 py-1.5 pr-10 text-left transition-colors",
                          active
                            ? "border-border bg-muted/70"
                            : "border-transparent hover:bg-muted/30",
                        )}
                        onClick={() => setSelectedSkill(s.name)}
                      >
                        <Sparkles className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium leading-snug">
                            {s.name}
                          </span>
                          {s.description && (
                            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                              {s.description}
                            </span>
                          )}
                        </span>
                      </button>
                      <div className="absolute top-1 right-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          title="Use in assistant"
                          aria-label={`Use skill ${s.name} in assistant`}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            void useSkillFromList(s);
                          }}
                        >
                          <MessageSquarePlus className="size-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}

              {tab === "prompts" &&
                filteredPrompts.map((p) => {
                  const active = selectedPrompt === p.id;
                  return (
                    <div key={p.id} className="group relative">
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-start gap-2 rounded-md border px-2 py-1.5 pr-10 text-left transition-colors",
                          active
                            ? "border-border bg-muted/70"
                            : "border-transparent hover:bg-muted/30",
                        )}
                        onClick={() => setSelectedPrompt(p.id)}
                      >
                        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium leading-snug">
                            {p.title}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                            {p.body.trim()
                              ? p.body.replace(/\s+/g, " ").slice(0, 80)
                              : formatWhen(p.updatedAt)}
                          </span>
                        </span>
                      </button>
                      <div className="absolute top-1 right-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          title="Use in assistant"
                          aria-label={`Use prompt ${p.title} in assistant`}
                          disabled={!p.body.trim()}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            usePromptFromList(p);
                          }}
                        >
                          <MessageSquarePlus className="size-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </ListPaneScroll>
        </ListPane>
      </div>

      <DetailPane>
        {hasSelection ? (
          <>
            <DetailPaneHeader>
              <div className="min-w-0">
                <DetailPaneMeta>
                  {tab === "skills" ? "Skill" : "Prompt"}
                  {dirty ? " · unsaved" : ""}
                </DetailPaneMeta>
                <DetailPaneTitle>
                  {tab === "skills"
                    ? selectedSkill
                    : promptTitle || "Untitled prompt"}
                </DetailPaneTitle>
              </div>
              <DetailPaneActions>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={
                    tab === "skills"
                      ? !skillBody.trim() && !skillDesc.trim()
                      : !promptBody.trim()
                  }
                  onClick={useInAssistant}
                >
                  <MessageSquare className="size-3.5" />
                  Use in assistant
                </Button>
                <Button
                  size="xs"
                  disabled={!dirty || saving}
                  onClick={() => void save()}
                >
                  {saving ? "Saving…" : dirty ? "Save" : "Saved"}
                </Button>
              </DetailPaneActions>
            </DetailPaneHeader>
            <DetailPaneScroll className="space-y-2">
              {tab === "skills" ? (
                <>
                  <Input
                    value={skillDesc}
                    onChange={(e) => {
                      setSkillDesc(e.target.value);
                      setDirty(true);
                    }}
                    placeholder="Short description"
                    className="h-8 text-sm"
                  />
                  <Textarea
                    value={skillBody}
                    onChange={(e) => {
                      setSkillBody(e.target.value);
                      setDirty(true);
                    }}
                    placeholder="Skill body (markdown)"
                    className="min-h-[240px] font-mono text-xs leading-relaxed"
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
                    className="h-8 text-sm"
                  />
                  <Textarea
                    value={promptBody}
                    onChange={(e) => {
                      setPromptBody(e.target.value);
                      setDirty(true);
                    }}
                    placeholder="Prompt body"
                    className="min-h-[240px] text-sm leading-relaxed"
                  />
                </>
              )}
            </DetailPaneScroll>
          </>
        ) : (
          <>
            <DetailPaneHeader>
              <DetailPaneTitle className="mt-0">
                {tab === "skills" ? "Skill" : "Prompt"}
              </DetailPaneTitle>
            </DetailPaneHeader>
            <DetailPaneScroll>
              <EmptyState
                title="Select an item"
                description="Pick a skill or prompt from the list, or create a new one."
                actions={
                  <Button size="xs" onClick={openCreate}>
                    <Plus className="size-3.5" />
                    New
                  </Button>
                }
              />
            </DetailPaneScroll>
          </>
        )}
      </DetailPane>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="gap-3 p-4 sm:max-w-md">
          <DialogHeader className="gap-1">
            <DialogTitle className="text-base">
              {tab === "skills" ? "New skill" : "New prompt"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-0.5">
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
              className="min-h-28"
            />
          </div>
          <DialogFooter>
            <Button
              size="xs"
              variant="outline"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="xs"
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
