# Settings

Open **Settings** from the activity rail (gear). The page has a header, main form, and a short help aside.

## Appearance

- **Theme** — light / dark / system (persisted in local storage).

## Provider

Configures the LLM used by the assistant.

| Field | Notes |
| --- | --- |
| Provider type | Ollama, OpenAI-compatible, or Anthropic |
| Base URL | Required for Ollama / OpenAI-compatible |
| Model | Model id the provider expects |
| API key | Stored in the OS keyring (not in plain JSON) |

**Save** writes agent settings to disk and updates the keyring entry for the API key when provided.

Ollama tip: ensure the local server is running and the model supports **tool calling**.

## Shortcuts

Bind (or clear) app actions such as Run SQL, Format, Cancel. Conflicts are highlighted. Changes apply while Prompton is focused.

## About / Updates

- Shows the running **app version**.  
- **Check for updates** compares against GitHub Releases `latest.json`.  
- Download/install flow depends on platform packaging (dmg / deb / rpm / AppImage).

macOS Gatekeeper notes: see [Troubleshooting](./troubleshooting.md).

## What Settings does not do

- It does not store database passwords (those stay on each connection’s keyring entry).  
- It does not change remote database configuration.  
- Provider URL allowlists are not enforced in-app beyond what you configure — treat base URLs like any other network trust decision.
