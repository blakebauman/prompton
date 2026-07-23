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
| `APPLE_CERTIFICATE` | Optional | Base64 Developer ID Application `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | Optional | `.p12` password |
| `APPLE_SIGNING_IDENTITY` | Optional | e.g. `Developer ID Application: …` |
| `APPLE_ID` | Optional | Apple ID for notarization |
| `APPLE_PASSWORD` | Optional | App-specific password |
| `APPLE_TEAM_ID` | Optional | 10-character Team ID |

Without `APPLE_*`, macOS artifacts are **ad-hoc signed**. Users need Gatekeeper workarounds (right-click Open / `xattr -cr`). Document this on the release notes until notarization is wired.

See [Tauri macOS signing](https://v2.tauri.app/distribute/sign/macos/).

## Release checklist

1. `pnpm typecheck && pnpm test:rs && pnpm build`
2. `pnpm run version <semver>` and commit
3. Update user-facing notes if behavior changed (`docs/`, GitHub release body)
4. Tag `v<semver>` and push tags
5. Confirm Actions succeeded; download/smoke DMG or Linux package
6. Verify Settings → Check for updates sees `latest.json`
7. For ad-hoc macOS: mention Gatekeeper steps in the release description

## Hotfixes

Same pipeline: bump patch version, tag, let CI rebuild all platforms. Do not hand-edit only one of the version files — always use `pnpm run version`.
