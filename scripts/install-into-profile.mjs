#!/usr/bin/env node
/**
 * Link both bundles (subagent + Antigravity model provider) into a DSH profile
 * and verify the profile lists them. Idempotent: re-running makes no changes.
 *
 * Used for scratch profiles in P0. The desktop profile is refused unless
 * --allow-desktop is passed, because the installer in install/ owns backups and
 * rollback for that profile.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

const SHIPPED = new Set(["web", "headless", "tui", "rescue", "desktop"]);
const BUNDLES = ["dsh-subagent-antigravity", "dsh-antigravity"];

const { values } = parseArgs({
  options: {
    profile: { type: "string", default: "scratch-agy" },
    repo: { type: "string" },
    dsh: { type: "string" },
    "dsh-home": { type: "string" },
    "allow-desktop": { type: "boolean", default: false },
    verbose: { type: "boolean", default: false },
  },
});

function fail(message) {
  console.error(`install-into-profile: ${message}`);
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

const profile = values.profile;
if (!/^[a-z0-9][a-z0-9._-]*$/i.test(profile)) fail(`invalid profile name: ${profile}`);
if (profile === "desktop" && !values["allow-desktop"]) {
  fail("refusing the desktop profile; use install/install-desktop.ps1 or pass --allow-desktop");
}
if (SHIPPED.has(profile) && profile !== "desktop") {
  fail(`refusing shipped profile "${profile}"; create a scratch profile instead`);
}

const repoRoot = (values.repo ?? fileURLToPath(new URL("..", import.meta.url))).replace(/[\\/]+$/, "");
const providerRoot = join(repoRoot, "provider");
if (!existsSync(join(providerRoot, "package.json"))) fail(`provider package missing at ${providerRoot}`);

const dshHome = values["dsh-home"] ?? process.env.DSH_HOME ?? join(homedir(), ".dsh");
const profilePath = join(dshHome, "profiles", profile);
if (!existsSync(join(profilePath, "package.json"))) {
  fail(`profile "${profile}" does not exist at ${profilePath}; run make-scratch-profile.mjs first`);
}

const dsh = resolveDsh(values.dsh);
const linkRoot = repoRoot.replaceAll("\\", "/");
const linkProvider = providerRoot.replaceAll("\\", "/");

function quoteCmd(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

const addLine = [
  dsh,
  "plugin",
  "--profile",
  profile,
  "add",
  `link:${linkRoot}`,
  `link:${linkProvider}`,
].map(quoteCmd).join(" ");
const add = spawnSync(addLine, {
  shell: true,
  encoding: "utf8",
  timeout: 300000,
  env: process.env,
});
if (add.status !== 0) {
  fail(`dsh plugin add failed: ${add.stderr || add.error || `exit ${add.status}`}`);
}
if (values.verbose) process.stdout.write(add.stdout || "");

const packagePath = join(profilePath, "package.json");
const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
const dependencies = (pkg.dependencies ??= {});
const bundles = (pkg.dsh ??= {}).profile?.bundles;
if (!Array.isArray(bundles)) fail(`profile package.json has no dsh.profile.bundles array`);

let repaired = false;
for (const name of BUNDLES) {
  if (!dependencies[name]) {
    dependencies[name] = name === "dsh-antigravity" ? `link:${linkProvider}` : `link:${linkRoot}`;
    repaired = true;
  }
  if (!bundles.includes(name)) {
    bundles.push(name);
    repaired = true;
  }
}
if (repaired) writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

const missing = BUNDLES.filter((name) => !bundles.includes(name));
if (missing.length > 0) fail(`bundles still missing after install: ${missing.join(", ")}`);

console.log(JSON.stringify({
  profile,
  path: profilePath,
  dependencies,
  bundles,
  repairedManually: repaired,
  idempotent: !repaired,
}, null, 2));