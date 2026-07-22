import { useState } from "react";

import { ChordPicker } from "@/components/chord-picker";
import { KeyCapChord } from "@/components/key-cap";
import { SettingRow, SettingSection } from "@/components/setting-row";
import { SettingsHelpAside } from "@/components/settings-help-aside";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  SHORTCUT_DEFS,
  useShortcuts,
  type ShortcutId,
} from "@/stores/shortcuts";

/** Settings → Shortcuts: rebindable chords with keycap preview. */
export function ShortcutsSettings() {
  const bindings = useShortcuts((s) => s.bindings);
  const setBinding = useShortcuts((s) => s.setBinding);
  const resetDefaults = useShortcuts((s) => s.resetDefaults);
  const [editing, setEditing] = useState<ShortcutId | null>(null);

  const active = SHORTCUT_DEFS.find((d) => d.id === editing);

  return (
    <div className="flex items-start gap-8">
      <div className="min-w-0 flex-1 space-y-4">
        <SettingSection
          title="Keyboard shortcuts"
          description="App-local chords. Click Change, then hold the new combination."
        >
          {SHORTCUT_DEFS.map((def) => (
            <SettingRow
              key={def.id}
              title={def.title}
              description={def.description}
              action={
                <div className="flex items-center gap-2">
                  <KeyCapChord keys={bindings[def.id] ?? []} />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setEditing(def.id)}
                  >
                    Change
                  </Button>
                </div>
              }
            />
          ))}
          <div className="py-3">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => {
                resetDefaults();
                toast({
                  title: "Shortcuts reset",
                  description: "Defaults restored for this machine.",
                  tone: "success",
                });
              }}
            >
              Reset to defaults
            </Button>
          </div>
        </SettingSection>
      </div>
      <SettingsHelpAside
        title="About shortcuts"
        body="Shortcuts work while Prompton is focused. They do not register as global OS hotkeys."
        tips={[
          {
            title: "Peak capture",
            body: "Hold the full chord, then release before Save — the peak set is kept.",
          },
          {
            title: "Modifiers",
            body: "Left and right modifiers are stored distinctly; matching treats them as the same side for Meta/Ctrl/Shift.",
          },
        ]}
      />

      {active && (
        <ChordPicker
          open
          title={active.title}
          description="Hold the keys, release, then Save."
          initialKeys={bindings[active.id] ?? []}
          onCancel={() => setEditing(null)}
          onSave={(keys) => {
            setBinding(active.id, keys);
            setEditing(null);
            toast({
              title: "Shortcut saved",
              description: active.title,
              tone: "success",
            });
          }}
        />
      )}
    </div>
  );
}
