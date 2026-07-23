# Releases

## Version source of truth

App version is kept in sync across:

- `package.json`
- `src-tauri/Cargo.toml` (+ lockfile as needed)
- `src-tauri/tauri.conf.json`
- Frontend `APP_VERSION` / Settings About display

Bump with:

```bash
pnpm run version 0.1.6
pnpm run version:check
```

Commit the synced files, then tag:

```bash
git tag v0.1.6
git push origin main --tags
```

Tags matching `v*` trigger `.github/workflows/release.yml` (also runnable via `workflow_dispatch`).

## What release CI produces

- macOS `.app` / `.dmg` (aarch64 and/or targets configured in the workflow)
- Linux AppImage / deb / rpm
- Updater signatures + **`latest.json`** for in-app **Settings → About → Check for updates**

## Required / optional secrets

| Secret | Required? | Purpose |
| --- | --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Yes (updater) | Minisign private key for updater artifacts |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Yes if key encrypted | Key password |
| `APPLE_CERTIFICATE` | Optional* | Base64 Developer ID Application `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | Optional* | `.p12` password |
| `APPLE_SIGNING_IDENTITY` | Optional* | e.g. `Developer ID Application: …` |
| `APPLE_ID` + `APPLE_PASSWORD` + `APPLE_TEAM_ID` | Optional* | Apple ID notarization auth |
| `APPLE_API_ISSUER` + `APPLE_API_KEY` + `APPLE_API_KEY_BASE64` | Optional* | App Store Connect API notarization auth (alt.) |

\*For notarized macOS: set the three signing secrets **and** one notarization auth set (Apple ID **or** API key). Missing all `APPLE_*` → ad-hoc. Partial `APPLE_*` → CI **fails**.

Operator guide: [macOS signing & notarization](./macos-notarization.md).  
Upstream: [Tauri macOS signing](https://v2.tauri.app/distribute/sign/macos/).

## Release checklist

1. `pnpm typecheck && pnpm test:rs && pnpm build`
2. For a Gatekeeper-clean macOS build: complete [notarization secrets](./macos-notarization.md) first
3. `pnpm run version <semver>` and commit
4. Update user-facing notes if behavior changed (`docs/`, GitHub release body)
5. Tag `v<semver>` and push tags
6. Confirm Actions succeeded; macOS log should say signing + notarization enabled when secrets are set
7. Smoke-test DMG / Linux packages; on macOS prefer a clean machine (`spctl -a -vv`)
8. Verify Settings → Check for updates sees `latest.json`
9. If still ad-hoc: keep Gatekeeper steps in the release description

## Hotfixes

Same pipeline: bump patch version, tag, let CI rebuild all platforms. Do not hand-edit only one of the version files — always use `pnpm run version`.
