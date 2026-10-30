#!/usr/bin/env node
/** Syntax-check every shipped and test JavaScript file without executing it. */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));
const files = [
  "lib/index.js",
  "lib/seam.js",
  "lib/wire.js",
  "scripts/agy-task.mjs",
  "scripts/make-scratch-profile.mjs",
  "scripts/install-into-profile.mjs",
  "scripts/p0-smoke.mjs",
  "scripts/check-syntax.mjs",
  "scripts/check-provider-load.mjs",
  "scripts/verify-release.mjs",
  "provider/lib/index.js",
  "provider/lib/client.js",
  "provider/bin/antigravity-login.mjs",
  "test/wire.test.mjs",
  "test/provider.test.mjs",
  "test/seam.test.mjs",
];

let failed = 0;
for (const file of files) {
  const path = join(root, file);
  if (!existsSync(path)) {
    console.error(`missing: ${file}`);
    failed++;
    continue;
  }
  const result = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
  if (result.status !== 0) {
    console.error(`syntax error: ${file}\n${result.stderr}`);
    failed++;
  }
}
if (failed > 0) process.exit(1);
console.log(`syntax OK: ${files.length} files`);