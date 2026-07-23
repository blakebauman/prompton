# Frontend

Stack: **React 19 + Vite + TypeScript + Tailwind 4 + shadcn/ui**, Zustand for workspace/theme/shortcuts, TanStack Virtual for results, Recharts for simple charts, Tauri APIs for invoke/events/updater.

## Shell IA

`src/App.tsx` hosts:

- **Activity rail** — `workspace` | `history` | `library` | `settings`
- **Workspace** — resizable `ConnectionsPanel` | `AssistantPanel` (chat) | `ArtifactPane`
- **History / Library / Settings** — full-bleed feature panels

Artifact tabs (context in `artifact-context.tsx`): Results, Chart, SQL, Schema, Explain, Context.

Brand constraints: see root `PRODUCT.md` (monochrome chrome; Chromatic for status only).

## Feature modules

| Path | Responsibility |
| --- | --- |
| `features/connections` | Connection list, connect/edit/remove, production, demo |
| `features/chat` | Prompton conversation, tool cards, composer |
| `features/sql-editor` | SQL draft, run/format/explain/cancel |
| `features/results` | Grid + chart |
| `features/schema` | Schema tree |
| `features/history` | List + detail over `history.json` |
| `features/library` | Skills + prompts |
| `features/settings` | Theme, provider, shortcuts, updates |

Shared UI lives under `src/components/` (`ai-elements/*` for chat primitives, `artifact/*`, form controls).

## State

| Store / hook | Role |
| --- | --- |
| `stores/workspace.ts` | Connections, active id, running/agent busy, results, schemas, status |
| `stores/theme.ts` | Theme preference |
| `stores/shortcuts.ts` | Key bindings |
| `stores/activity-log.ts` | Activity feed bridge |
| `hooks/use-workspace-persist.ts` | Persist drafts / workspace bits |
| `hooks/use-app-shortcuts.ts` | Global-in-app shortcut dispatch |

## Tauri bridge

`src/lib/tauri.ts` wraps `invoke` and surfaces desktop-required errors for browser-only Vite. Prefer typed helpers in `lib/*` (`run-query.ts`, `connection-health.ts`, `agent-history.ts`, …) over scattering raw invokes in components.

Events of interest include history refresh (`history:updated`) and agent streaming/tool updates (see chat panel subscriptions).

## HITL UI

`write-confirm-dialog.tsx` + workspace pending state: show SQL, approve → `confirm_write` / `agent_confirm`, reject → discard. Tool cards reflect awaiting / done / error via `tool-summary.ts`.

## Conventions

- Keep chrome monochrome; status color via Chromatic tokens only.  
- Prefer densified headers (`h-9` patterns already used on Connections / Chat / Results / Settings).  
- Match existing empty states and list+detail patterns when adding panels.  
- Don’t invent a second state system — extend Zustand workspace or local feature state.

## Checks

```bash
pnpm typecheck
pnpm build
```

There is no large frontend unit-test suite in-repo; rely on typecheck + manual/desktop smoke, plus Rust tests for safety-critical paths.
