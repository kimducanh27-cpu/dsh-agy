#!/usr/bin/env node
/**
 * Load the vendored provider against the published dsh-llm "next" build.
 * Catches host API renames (for example CallId -> ToolCallId) before a user
 * hits them at mount time. Requires network access for npm install.
 */
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const repo = fileURLToPath(new URL("..", import.meta.url));
const temp = mkdtempSync(join(tmpdir(), "dsh-provider-load-"));

function npm(args) {
  const execPath = process.env.npm_execpath;
  const options = { cwd: temp, encoding: "utf8", timeout: 180000 };
  if (execPath) return spawnSync(process.execPath, [execPath, ...args], options);
  return spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", args, {
    ...options,
    shell: process.platform === "win32",
  });
}

function fail(message, detail = "") {
  console.error(`check-provider-load: ${message}`);
  if (detail) console.error(detail.trim());
  if (!process.env.KEEP_CI_TEMP) rmSync(temp, { recursive: true, force: true });
  process.exit(1);
}

writeFileSync(join(temp, "package.json"), JSON.stringify({ name: "dsh-provider-load", private: true }, null, 2));

const install = npm([
  "install",
  "--no-audit",
  "--no-fund",
  "--no-package-lock",
  "@deepseek-ai/dsh-llm@next",
  "@deepseek-ai/dsh-home-paths",
  "@deepseek-ai/dsh-timeout",
]);
if (install.status !== 0) fail("npm install failed", install.stderr || install.stdout);

const probe = spawnSync(
  process.execPath,
  [
    "--input-type=module",
    "-e",
    "import('@deepseek-ai/dsh-llm').then((m) => { const id = m.ToolCallId || m.CallId; if (!id) { console.error('dsh-llm exports neither ToolCallId nor CallId'); process.exit(1); } console.log('tool-call id export OK'); })",
  ],
  { cwd: temp, encoding: "utf8" },
);
if (probe.status !== 0) fail("dsh-llm export probe failed", probe.stderr || probe.stdout);

copyFileSync(join(repo, "provider", "lib", "index.js"), join(temp, "index.mjs"));
const adapter = await import(pathToFileURL(join(temp, "index.mjs")).href);
if (adapter.name !== "dsh-antigravity" || adapter.PROVIDER !== "antigravity" || typeof adapter.apply !== "function") {
  fail(`unexpected adapter exports: name=${adapter.name} provider=${adapter.PROVIDER} apply=${typeof adapter.apply}`);
}

const version = JSON.parse(readFileSync(join(temp, "node_modules", "@deepseek-ai", "dsh-llm", "package.json"), "utf8")).version;
console.log(`provider load OK against dsh-llm@${version}`);
if (!process.env.KEEP_CI_TEMP) rmSync(temp, { recursive: true, force: true });