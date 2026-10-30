#!/usr/bin/env node
/**
 * P0 smoke test for the Antigravity provider + subagent bundle.
 *
 * Requires one interactive Antigravity OAuth login first:
 *   node provider/bin/antigravity-login.mjs
 *
 * Runs against throwaway profiles only; the desktop profile is never touched.
 * Writes evidence to docs/evidence/p0-smoke.md.
 */
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    dsh: { type: "string" },
    model: { type: "string", default: "gemini-3.8-flash" },
    "skip-web": { type: "boolean", default: false },
    "skip-subagent": { type: "boolean", default: false },
  },
});

const repoRoot = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]+$/, "");
const dshHome = process.env.DSH_HOME ?? join(homedir(), ".dsh");
const credentialPath = join(dshHome, "storages", "antigravity-oauth.json");
const results = [];

function resolveDsh() {
  for (const candidate of [values.dsh, process.env.DSH_CLI]) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  const probe = spawnSync("dsh", ["--version"], { shell: true, encoding: "utf8" });
  if (probe.status === 0) return "dsh";
  const bundled = "D:/DeepSeek/resources/runtime/cli/bin/dsh.cmd";
  if (existsSync(bundled)) return bundled;
  console.error("p0-smoke: dsh CLI not found. Pass --dsh <path to dsh.cmd> or set DSH_CLI.");
  process.exit(1);
}

function quoteCmd(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function runLine(line, timeout) {
  const started = Date.now();
  const res = spawnSync(line, {
    shell: true,
    encoding: "utf8",
    timeout,
    maxBuffer: 16 * 1024 * 1024,
    cwd: repoRoot,
    env: process.env,
  });
  return { res, ms: Date.now() - started };
}

function runNode(script, args, timeout) {
  const started = Date.now();
  const res = spawnSync(process.execPath, [join(repoRoot, "scripts", script), ...args], {
    encoding: "utf8",
    timeout,
    maxBuffer: 16 * 1024 * 1024,
    cwd: repoRoot,
    env: process.env,
  });
  return { res, ms: Date.now() - started };
}

function record(check, ok, ms, detail) {
  results.push({ check, ok, ms, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${check}  (${ms}ms)${detail ? `  ${detail}` : ""}`);
}

function redact(text) {
  return String(text ?? "")
    .replace(/token=[^\s&"]+/gi, "token=<redacted>")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<email>")
    .replace(/ya29\.[A-Za-z0-9._-]+/g, "<access-token>")
    .replace(/1\/\/[A-Za-z0-9._-]+/g, "<refresh-token>");
}

function excerpt(text, limit = 1200) {
  const value = redact(text).trim();
  return value.length > limit ? `${value.slice(-limit)}` : value;
}

const dsh = resolveDsh();
const version = spawnSync([quoteCmd(dsh), quoteCmd("--version")].join(" "), {
  shell: true,
  encoding: "utf8",
}).stdout.trim();

if (!existsSync(credentialPath)) {
  console.error(`p0-smoke: no Antigravity credentials at ${credentialPath}`);
  console.error("Run: node provider/bin/antigravity-login.mjs");
  console.error("Then re-run this script.");
  process.exit(3);
}

const web = runNode("make-scratch-profile.mjs", ["--name", "scratch-agy", "--template", "web", "--force", "--dsh", dsh], 300000);
record("scratch web profile", web.res.status === 0, web.ms, web.res.status === 0 ? "" : excerpt(web.res.stderr));
const webInstall = runNode("install-into-profile.mjs", ["--profile", "scratch-agy", "--dsh", dsh], 300000);
record("web bundles installed", webInstall.res.status === 0, webInstall.ms, webInstall.res.status === 0 ? "" : excerpt(webInstall.res.stderr));

const headless = runNode("make-scratch-profile.mjs", ["--name", "scratch-agy-headless", "--template", "headless", "--force", "--dsh", dsh], 300000);
record("scratch headless profile", headless.res.status === 0, headless.ms, headless.res.status === 0 ? "" : excerpt(headless.res.stderr));
const headlessInstall = runNode("install-into-profile.mjs", ["--profile", "scratch-agy-headless", "--dsh", dsh], 300000);
record("headless bundles installed", headlessInstall.res.status === 0, headlessInstall.ms, headlessInstall.res.status === 0 ? "" : excerpt(headlessInstall.res.stderr));

if (!values["skip-web"]) {
  const logPath = join(tmpdir(), `dsh-p0-web-${Date.now()}.log`);
  const fd = openSync(logPath, "w");
  const line = [dsh, "scratch-agy", "--no-open", "--port", "0"].map(quoteCmd).join(" ");
  const child = spawn(line, {
    shell: true,
    stdio: ["ignore", fd, fd],
    detached: process.platform !== "win32",
    cwd: repoRoot,
    env: process.env,
  });
  const started = Date.now();
  let text = "";
  let match = null;
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (existsSync(logPath)) text = readFileSync(logPath, "utf8");
    match = text.match(/http:\/\/127\.0\.0\.1:(\d+)\/\?token=([^\s]+)/);
    if (match) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  let fetchOk = false;
  let fetchDetail = "";
  if (match) {
    try {
      const response = await fetch(match[0], {
        redirect: "manual",
        headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) dsh-p0-smoke" },
      });
      let status = response.status;
      let html = "";
      if (status >= 300 && status < 400) {
        const cookies = (response.headers.getSetCookie?.() ?? []).map((value) => value.split(";")[0]);
        const location = new URL(response.headers.get("location") ?? "./", match[0]).toString();
        const page = await fetch(location, {
          headers: {
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) dsh-p0-smoke",
            cookie: cookies.join("; "),
          },
        });
        status = page.status;
        html = await page.text();
      } else {
        html = await response.text();
      }
      fetchOk = status === 200 && /<html/i.test(html);
      fetchDetail = `HTTP ${status}, ${html.length} bytes`;
    } catch (error) {
      fetchDetail = error instanceof Error ? error.message : String(error);
    }
  } else {
    fetchDetail = "server URL not printed";
  }
  const badLog = /does not provide an export|Cannot find package|error:/i.test(text);
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      process.kill(-child.pid, "SIGTERM");
    }
  } catch {
    // The process may already be gone.
  }
  closeSync(fd);
  record("scratch web boot + page fetch", Boolean(match) && fetchOk && !badLog, Date.now() - started, badLog ? `log: ${excerpt(text, 400)}` : fetchDetail);
}

const patch = join(repoRoot, "test", "fixtures", "antigravity-default-model.yml");
const prompt = "Reply with exactly: P0 OK";
const chatLine = [dsh, "scratch-agy-headless", "--patch", patch, prompt].map(quoteCmd).join(" ");
const chat = runLine(chatLine, 300000);
const chatOut = `${chat.res.stdout ?? ""}\n${chat.res.stderr ?? ""}`;
const chatOk = chat.res.status === 0 && /P0 OK/i.test(chat.res.stdout ?? "");
record("headless chat via Antigravity", chatOk, chat.ms, chatOk ? "" : excerpt(chatOut, 800));

if (!values["skip-subagent"]) {
  const subPrompt = "Reply with exactly: SUBAGENT OK";
  const subStarted = Date.now();
  const sub = spawnSync(process.execPath, [join(repoRoot, "scripts", "agy-task.mjs"), "--timeout", "300", subPrompt], {
    encoding: "utf8",
    timeout: 360000,
    maxBuffer: 16 * 1024 * 1024,
    cwd: repoRoot,
    env: process.env,
  });
  const subMs = Date.now() - subStarted;
  const subOut = `${sub.stdout ?? ""}\n${sub.stderr ?? ""}`;
  const subOk = sub.status === 0 && /SUBAGENT OK/i.test(sub.stdout ?? "");
  record("subagent regression (agy)", subOk, subMs, subOk ? "" : excerpt(subOut, 800));
}

const allOk = results.every((entry) => entry.ok);
const evidenceDir = join(repoRoot, "docs", "evidence");
mkdirSync(evidenceDir, { recursive: true });
const lines = [
  "# P0 smoke evidence",
  "",
  `- Timestamp: ${new Date().toISOString()}`,
  `- dsh: ${version}`,
  `- Model: ${values.model} (fixture: test/fixtures/antigravity-default-model.yml)`,
  `- Result: ${allOk ? "PASS" : "FAIL"}`,
  "",
  "| Check | Result | Duration | Detail |",
  "|---|---|---|---|",
  ...results.map((entry) => `| ${entry.check} | ${entry.ok ? "PASS" : "FAIL"} | ${entry.ms} ms | ${redact(entry.detail).replaceAll("|", "\\|") || "—"} |`),
  "",
  "## Notes",
  "",
  "- Scratch profiles only; the desktop profile was not modified.",
  "- OAuth credentials were already present at the time of the run.",
  "- Tokens, emails and the local web token are redacted in this file and in console output.",
  "",
];
writeFileSync(join(evidenceDir, "p0-smoke.md"), lines.join("\n"));
console.log(`\n${allOk ? "P0 PASS" : "P0 FAIL"} — evidence: docs/evidence/p0-smoke.md`);
process.exit(allOk ? 0 : 1);