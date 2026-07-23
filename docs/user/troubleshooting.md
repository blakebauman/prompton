# Troubleshooting

## macOS: “Prompton can’t be opened”

Ad-hoc (unsigned / un-notarized) builds are blocked by Gatekeeper.

**Fix:**

1. Right-click the app → **Open** → confirm, or  
2. `xattr -cr /Applications/Prompton.app`

Developer-ID signed + notarized builds avoid this; unsigned CI builds will keep needing the workaround.

## Connection fails

- Verify host, port, database name, user, password, and SSL mode (Postgres).  
- Confirm the DB accepts TCP from your machine (firewall, `pg_hba.conf`, cloud allowlists).  
- For SQLite, confirm the file path exists and is readable/writable as needed.  
- Try **Disconnect** then **Connect** again after fixing credentials.

## Assistant errors

- Provider base URL reachable? (Ollama default `http://127.0.0.1:11434/v1`)  
- Model name exact? Tool-capable model installed?  
- API key saved for cloud providers?  
- Active connection selected?

Open **Settings → Provider**, save again, then retry a short question (“list tables”).

## Query stuck / Cancel does nothing

**Cancel** aborts work tracked by Prompton for that connection. Some drivers/servers may still finish a statement server-side. If the UI stays busy: Disconnect the connection (cancels pending writes and in-flight client work), then reconnect.

## Write approval disappeared

Pending writes expire after ~10 minutes. Re-run the SQL or ask the agent again. Disconnect/remove also clears pending approvals.

## Updates not found

- Confirm network access to GitHub Releases.  
- **Check for updates** reads `latest.json` from the latest release assets.  
- If you sideload a build, version skew vs Releases is expected until you install a published asset.

## Reset local state (destructive)

Only if you intend to wipe local app data:

1. Quit Prompton.  
2. Delete the app data directory for `dev.prompton.desktop` / Prompton (OS-specific; see [Security & data](../technical/security-and-data.md)).  
3. Optionally clear keyring entries for `dev.prompton.desktop`.  
4. Relaunch and recreate connections.

This does **not** delete your actual Postgres/MySQL/SQLite database files unless you delete them yourself.
