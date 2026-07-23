# Contributing

## Prerequisites

- Node **20+**, **pnpm**, **Rust stable**
- Platform Tauri deps ([Tauri prerequisites](https://v2.tauri.app/start/prerequisites/))
- Linux: WebKitGTK + build packages (see root README); Secret Service for keyring

## Setup

```bash
pnpm install
pnpm tauri dev
```

## Checks before PR

```bash
pnpm typecheck
pnpm test:rs
pnpm build
pnpm run version:check   # when touching versioned manifests
```

CI (`.github/workflows/ci.yml`) runs frontend typecheck/build and `cargo test` on Ubuntu + macOS.

## Conventions

- **Safety:** mutating SQL and agent writes must remain HITL; do not reintroduce a client-side `allow_mutating` bypass.
- **Secrets:** never persist passwords/API keys in JSON; use `SecretStore`.
- **Errors:** user-visible strings via `public_message()` where applicable.
- **Brand:** follow `PRODUCT.md` (no Voicebox naming; monochrome chrome).
- **Scope:** prefer small PRs; match existing density/IA rather than redesigning shells.
- **Docs:** user-facing behavior changes should update `docs/user/*`; protocol/API changes update `docs/technical/*`.

## Useful entry points

| Task | Start |
| --- | --- |
| New Tauri command | `src-tauri/src/commands/mod.rs` + register in `lib.rs` + `src/lib/tauri.ts` |
| SQL classify / HITL | `src-tauri/src/db/types.rs`, `manager.rs` |
| Agent tool | `agent/runtime.rs`, `tool_parse.rs`, frontend tool summary |
| UI panel | `src/features/<area>/`, wire in `App.tsx` if new activity |
| Version bump | `pnpm run version <semver>` — see [Releases](./releases.md) |

## Local packaging

```bash
pnpm tauri build
# macOS example:
pnpm tauri build --bundles app,dmg
```

## Questions

Product/brand: `PRODUCT.md`  
User docs: `docs/user/`  
Architecture deep-dives: `docs/technical/`
