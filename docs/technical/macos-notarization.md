# macOS signing & notarization

Gatekeeper blocks ad-hoc Prompton builds until the user right-clicks **Open** or clears quarantine. Developer ID signing + Apple notarization removes that friction for downloads from GitHub Releases.

Release CI already supports this when repository secrets are set (`.github/workflows/release.yml`). This page is the operator checklist to turn it on, then cut **v0.1.6**.

## Prerequisites

- Paid [Apple Developer Program](https://developer.apple.com) membership
- A Mac to create the CSR and export the `.p12` (Apple’s process requires it)
- Repo admin access to add GitHub Actions secrets on `blakebauman/prompton`

## 1. Create a Developer ID Application certificate

1. On a Mac, create a Certificate Signing Request (Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority).
2. In [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/certificates/list), create a certificate of type **Developer ID Application** (not Apple Distribution — that is for the Mac App Store).
3. Upload the CSR, download the `.cer`, and double-click to install it into your login keychain.

Confirm the identity name:

```bash
security find-identity -v -p codesigning
# expect something like: "Developer ID Application: Your Name (TEAMID)"
```

## 2. Export the certificate for CI

1. Keychain Access → **My Certificates** → expand the Developer ID entry.
2. Right-click the private key → **Export** → save a `.p12` with a strong password.
3. Base64-encode for the GitHub secret:

```bash
openssl base64 -A -in /path/to/certificate.p12 -out certificate-base64.txt
```

Use the **entire** contents of `certificate-base64.txt` as `APPLE_CERTIFICATE`.

## 3. Choose a notarization auth method

Pick **one**:

### Option A — Apple ID (simplest)

| Secret | Value |
| --- | --- |
| `APPLE_ID` | Apple ID email for the developer account |
| `APPLE_PASSWORD` | [App-specific password](https://appleid.apple.com) (not your login password) |
| `APPLE_TEAM_ID` | 10-character Team ID (Membership details) |

### Option B — App Store Connect API key (recommended for CI)

1. [Users and Access → Integrations → App Store Connect API](https://appstoreconnect.apple.com/access/integrations/api) → create a key with **Developer** access.
2. Note **Issuer ID** and **Key ID**; download the `.p8` once.
3. Base64 the key file:

```bash
openssl base64 -A -in AuthKey_XXXXXXXXXX.p8 -out api-key-base64.txt
```

| Secret | Value |
| --- | --- |
| `APPLE_API_ISSUER` | Issuer ID UUID |
| `APPLE_API_KEY` | Key ID |
| `APPLE_API_KEY_BASE64` | Base64 of the `.p8` file |

## 4. Add GitHub repository secrets

**Settings → Secrets and variables → Actions** on the repo. Set:

| Secret | Required for notarized macOS |
| --- | --- |
| `APPLE_CERTIFICATE` | Yes |
| `APPLE_CERTIFICATE_PASSWORD` | Yes |
| `APPLE_SIGNING_IDENTITY` | Yes — exact string from `security find-identity` |
| Apple ID trio **or** API key trio | Yes — see above |

Keep existing updater secrets (`TAURI_SIGNING_PRIVATE_KEY`, optional password) unchanged.

### Behavior in CI

- **No** `APPLE_*` secrets → ad-hoc macOS build (current default); release notes mention Gatekeeper.
- **Complete** signing + notarization auth → Developer ID sign + notarize + staple.
- **Partial** `APPLE_*` set → the release job **fails** with an explicit error (avoids silent broken signing).

## 5. Verify on a release build

After secrets are saved:

```bash
pnpm run version 0.1.6
# commit, merge this prep PR if needed, then:
git tag v0.1.6
git push origin main --tags
```

Or re-run **Release** via `workflow_dispatch` against an existing tag once secrets exist.

In the macOS job log, look for:

`Apple Developer ID secrets present — signing + notarization enabled.`

Then smoke-test the DMG on a clean Mac (or a VM without prior Gatekeeper exceptions): drag to Applications and open **without** right-click bypass. `spctl -a -vv /Applications/Prompton.app` should report accepted/notarized.

## Local signed builds (optional)

On a Mac with the cert in the login keychain:

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: …"
# plus APPLE_ID / APPLE_PASSWORD / APPLE_TEAM_ID or APPLE_API_* for notarization
pnpm tauri build --bundles app,dmg
```

## References

- [Tauri macOS code signing](https://v2.tauri.app/distribute/sign/macos/)
- [Apple notarization overview](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- Release workflow: [`.github/workflows/release.yml`](../../.github/workflows/release.yml)
- Versioning: [Releases](./releases.md)
