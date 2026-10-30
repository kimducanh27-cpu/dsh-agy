#!/usr/bin/env node
/**
 * Create or refresh a throwaway DSH profile from a shipped template without
 * booting an app server. Used by the P0 smoke test so the desktop profile is
 * never touched.
 */
import { existsSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

const SHIPPED = new Set(["web", "headless", "tui", "desktop", "rescue"]);
const EXPECTED_VERSION = "0.2.1-rc.5";

const { values } = parseArgs({
  options: {
    name: { type: "string", default: "scratch-agy" },
    template: { type: "string", default: "web" },
    dsh: { type: "string" },
    "dsh-home": { type: "string" },
    force: { type: "boolean", default: false },
  },
});

function fail(message) {
  console.error(`make-scratch-profile: ${message}`);
  process.exit(1);
}

function resolveDsh(explicit) {
  for (const candidate of [explicit, process.env.DSH_CLI]) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  const probe = spawnSync("dsh", ["--version"], { shell: true, encoding: "utf8" });
  if (probe.status === 0) return "dsh";
  const bundled = "D:/DeepSeek/resources/runtime/cli/bin/dsh.cmd";
  if (existsSync(bundled)) return bundled;
  fail("dsh CLI not found. Pass --dsh <path to dsh.cmd> or set DSH_CLI.");
}

function quoteCmd(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function runDsh(dsh, args, timeout = 180000) {
  const line = [dsh, ...args].map(quoteCmd).join(" ");
  return spawnSync(line, {
    shell: true,
    encoding: "utf8",
    timeout,
    env: process.env,
  });
}

const name = values.name;
const template = values.template;
if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) fail(`invalid profile name: ${name}`);
if (SHIPPED.has(name)) fail(`refusing to overwrite shipped profile "${name}"`);
if (!SHIPPED.has(template)) fail(`unknown template "${template}"`);

const dshHome = values["dsh-home"] ?? process.env.DSH_HOME ?? join(homedir(), ".dsh");
const profilePath = join(dshHome, "profiles", name);
const dsh = resolveDsh(values.dsh);

const versionRun = runDsh(dsh, ["--version"], 60000);
const version = (versionRun.stdout || "").trim().split(/\r?\n/)[0];
if (versionRun.status !== 0) fail(`cannot run dsh: ${versionRun.stderr || versionRun.error}`);
if (version !== EXPECTED_VERSION) {
  console.warn(`warning: dsh version ${version || "unknown"} differs from tested ${EXPECTED_VERSION}`);
}

let backup = null;
if (existsSync(profilePath)) {
  if (!values.force) {
    fail(`profile "${name}" already exists at ${profilePath}; use --force to back it up and recreate`);
  }
  backup = `${profilePath}.bak-${Date.now()}`;
  renameSync(profilePath, backup);
}

const create = runDsh(dsh, [name, "--from-default-profile", template, "--dump-config"]);
if (create.status !== 0) {
  fail(`profile creation failed: ${create.stderr || create.error || `exit ${create.status}`}`);
}
if (!existsSync(join(profilePath, "package.json"))) {
  fail(`profile was not created at ${profilePath}`);
}

console.log(JSON.stringify({
  profile: name,
  template,
  path: profilePath,
  dsh,
  version,
  expectedVersion: EXPECTED_VERSION,
  backup,
  composedLines: (create.stdout || "").split(/\r?\n/).length,
}, null, 2));