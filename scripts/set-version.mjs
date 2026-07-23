#!/usr/bin/env node
/**
 * Bump package.json (SoT), Cargo.toml, Cargo.lock, tauri.conf.json, and
 * src/lib/app-version.ts together.
 * Usage: pnpm run version 0.1.1
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = join(root, "package.json");
const cargoPath = join(root, "src-tauri/Cargo.toml");
const lockPath = join(root, "src-tauri/Cargo.lock");
const tauriPath = join(root, "src-tauri/tauri.conf.json");
const appVersionPath = join(root, "src/lib/app-version.ts");

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

const version = process.argv[2];
if (!version) {
  console.error("Usage: pnpm run version <semver>");
  process.exit(1);
}
if (!SEMVER.test(version)) {
  console.error(`Invalid semver: ${version}`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.version = version;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

let cargo = readFileSync(cargoPath, "utf8");
const nextCargo = cargo.replace(
  /^version\s*=\s*"[^"]*"/m,
  `version = "${version}"`,
);
if (nextCargo === cargo) {
  console.error("Failed to patch version in Cargo.toml");
  process.exit(1);
}
writeFileSync(cargoPath, nextCargo);

const tauri = JSON.parse(readFileSync(tauriPath, "utf8"));
tauri.version = version;
writeFileSync(tauriPath, `${JSON.stringify(tauri, null, 2)}\n`);

// Keep the workspace package entry in Cargo.lock aligned (CI version checks
// don't read the lockfile, but release builds should not drift).
let lock = readFileSync(lockPath, "utf8");
const nextLock = lock.replace(
  /(\[\[package\]\]\nname = "prompton"\n)version = "[^"]*"/,
  `$1version = "${version}"`,
);
if (nextLock === lock) {
  console.error("Failed to patch version in Cargo.lock (prompton package)");
  process.exit(1);
}
writeFileSync(lockPath, nextLock);

writeFileSync(
  appVersionPath,
  `/**
 * App semver shown in Settings / rail. Kept in sync by \`pnpm run version\`.
 * Prefer Tauri \`getVersion()\` at runtime when available; this is the fallback
 * and the value baked for Vite/browser shells.
 */
export const APP_VERSION = "${version}";
`,
);

console.log(`version → ${version}`);
console.log(`  ${pkgPath}`);
console.log(`  ${cargoPath}`);
console.log(`  ${lockPath}`);
console.log(`  ${tauriPath}`);
console.log(`  ${appVersionPath}`);
