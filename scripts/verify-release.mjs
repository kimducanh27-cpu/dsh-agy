#!/usr/bin/env node
/** Verify dist/ release artifacts: checksums, both packages, required files. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repo = fileURLToPath(new URL("..", import.meta.url));
const dist = join(repo, "dist");

function fail(message) {
  console.error(`verify-release: ${message}`);
  process.exit(1);
}

if (!existsSync(dist)) fail("dist/ missing; run npm pack first");
const tarballs = readdirSync(dist).filter((name) => name.endsWith(".tgz")).sort();
if (tarballs.length !== 2) fail(`expected 2 tarballs, found ${tarballs.length}`);

const sumsPath = join(dist, "SHA256SUMS");
if (!existsSync(sumsPath)) fail("SHA256SUMS missing");
const sums = new Map();
for (const line of readFileSync(sumsPath, "utf8").trim().split(/\r?\n/)) {
  const [hash, rawName] = line.trim().split(/\s+/);
  const name = rawName?.replace(/^\*/, "");
  if (hash && name) sums.set(name, hash);
}

function readPackage(file) {
  const result = spawnSync("tar", ["-xOzf", file, "package/package.json"], { cwd: dist, encoding: "utf8" });
  if (result.status !== 0) fail(`cannot read package.json from ${file}: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function listFiles(file) {
  const result = spawnSync("tar", ["-tzf", file], { cwd: dist, encoding: "utf8" });
  if (result.status !== 0) fail(`cannot list ${file}: ${result.stderr}`);
  return new Set(result.stdout.split(/\r?\n/).filter(Boolean));
}

const names = new Set();
const versions = new Set();
for (const file of tarballs) {
  const actual = createHash("sha256").update(readFileSync(join(dist, file))).digest("hex");
  if (sums.get(file) !== actual) fail(`checksum mismatch for ${file}`);

  const pkg = readPackage(file);
  names.add(pkg.name);
  versions.add(pkg.version);
  const entries = listFiles(file);
  const required = pkg.name === "dsh-antigravity"
    ? ["package/lib/index.js", "package/cordis.patch.yml", "package/ATTRIBUTION.md", "package/LICENSE"]
    : ["package/lib/index.js", "package/cordis.patch.yml", "package/scripts/agy-task.mjs"];
  for (const entry of required) {
    if (!entries.has(entry)) fail(`${file} is missing ${entry}`);
  }
  console.log(`${file}: ${pkg.name}@${pkg.version} OK`);
}

if (!names.has("dsh-antigravity") || !names.has("dsh-subagent-antigravity")) {
  fail(`unexpected package set: ${[...names].join(", ")}`);
}
if (versions.size !== 1) fail(`package versions differ: ${[...versions].join(", ")}`);
console.log(`release artifacts OK: version ${[...versions][0]}, ${tarballs.length} tarballs`);