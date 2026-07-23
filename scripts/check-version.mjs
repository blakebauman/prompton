#!/usr/bin/env node
/** Fail if package.json / Cargo.toml / tauri.conf.json versions diverge. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const cargo = readFileSync(join(root, "src-tauri/Cargo.toml"), "utf8");
const tauri = JSON.parse(
  readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8"),
);

const cargoMatch = /^version\s*=\s*"([^"]*)"/m.exec(cargo);
if (!cargoMatch) {
  console.error("No version in src-tauri/Cargo.toml");
  process.exit(1);
}

const want = pkg.version;
const cargoVersion = cargoMatch[1];
const tauriVersion = tauri.version;

const mismatches = [];
if (cargoVersion !== want) {
  mismatches.push(`Cargo.toml=${cargoVersion}`);
}
if (tauriVersion !== want) {
  mismatches.push(`tauri.conf.json=${tauriVersion}`);
}

if (mismatches.length > 0) {
  console.error(
    `Version mismatch: package.json=${want} ${mismatches.join(" ")}\n` +
      `Run: pnpm run version ${want}`,
  );
  process.exit(1);
}

console.log(`versions ok: ${want}`);
