# Agent instructions

This repository lets a coding agent delegate one self-contained task to
**Google Antigravity** and read its final answer. Pick the path that matches your
host.

## 0. Check before installing anything

If the target profile already lists `dsh-subagent-antigravity` — in the profile
`package.json` under `dsh.profile.bundles`, in **Plugins → Installed plugins**,
or through `plugin_manager list_bundles` — do **not** install it again.
Reinstalling is unnecessary and may replace a working link; enable the bundle and
start a new session instead.

To update an existing install: the profile links this clone, so edit the files in
place, then toggle the bundle off and on (or restart the app). Do not reinstall.

The `dsh` CLI on `PATH` is a separate installation from the desktop app. Its
`--version` (for example `0.2.0-rc.2`) does not describe the running app, and it
cannot list or manage an Electron-managed profile. Do not report a CLI/app
version difference as a fault.

## 1. Check the CLI first

Run `agy --version`. If it fails, install the Antigravity CLI and make sure it is
on `PATH`. Run `agy` once interactively to sign in; headless runs reuse those
cached credentials.

Do not read, copy, or modify `~/.gemini/antigravity-cli/`. Do not ask the user
for Antigravity API keys.

## 2. If you are not DeepSeek Harness

Use the standalone bridge:

```bash
node scripts/agy-task.mjs "The complete, self-contained task"
```

- The answer is printed on **stdout**; warnings and errors on **stderr**.
- Exit `0` = success, `1` = Antigravity failure or empty answer, `2` = usage
  error, `124` = timeout.
- The task must be self-contained: Antigravity does not see your conversation,
  repository state, or tool results. Include the paths, constraints, and expected
  output format in the task text.
- Useful flags: `--cwd <dir>`, `--model <slug>`, `--effort <level>`,
  `--agent <name>`, `--timeout <seconds>`.

Example:

```bash
node scripts/agy-task.mjs --cwd . --timeout 600 \
  "Review src/cache.ts for correctness bugs. Report findings with file:line; do not edit files."
```

## 3. If you are DeepSeek Harness

Install this clone as a bundle **only when it is not already installed** (see
step 0), then enable it:

```text
plugin_manager list_bundles                 # look for dsh-subagent-antigravity
plugin_manager install_bundle <absolute path to this clone>   # only if absent
```

Then call the tool (one task per run; no follow-up messages):

```text
subagent_antigravity({ description: "Review cache layer", prompt: "…" })
```

The call returns a child id immediately; the answer arrives in a completion
notice. The tool is registered only for sessions composed after the bundle is
enabled.

## 4. Write a usable brief

One run = one task, and the subagent cannot see your chat, files, or tool
results. Read [DELEGATION.md](DELEGATION.md) before delegating, and start from
[prompts/brief.md](prompts/brief.md):

- one goal, one deliverable;
- the facts it cannot infer, with exact paths;
- scope and permissions — for reviews, "report only; do not edit files";
- acceptance criteria and the exact output format;
- no secrets, and state that no follow-up will come.

Ready-made briefs: [review](prompts/review.md),
[implement](prompts/implement.md), [research](prompts/research.md),
[debug](prompts/debug.md). Verify the answer yourself before using it.

## 5. Desktop profile (Electron-managed)

`dsh plugin --profile desktop ...` is refused by the CLI. Install with
`install\install-desktop.ps1 -AllowDesktop` after closing the app (including the
tray process): it edits the profile `package.json`, adds both bundles, and runs
the bundled pnpm directly. Roll back with
`install\rollback-desktop.ps1 -AllowDesktop`. Backups live under
`~/.dsh/backups/antigravity-kit/`. See [docs/guide-vi.md](docs/guide-vi.md).

## Rules

- **One task per delegation.** The target does not accept follow-up messages.
- **Do not pass secrets** in the task text; it may reach a third-party model.
- **Review-only means review-only.** Say "report findings; do not edit files" in
  the task when you do not want changes.
- **Never enable bypass permissions** (`--bypass-permissions`, or
  `permissionMode: bypass`) unless the user explicitly asks for it. The default
  honors the Antigravity CLI permission settings.
- **Verify the result** yourself; Antigravity is an independent model and can be
  wrong.

## Tests

```bash
node --test test/wire.test.mjs test/provider.test.mjs test/seam.test.mjs
```

The plugin tests use a fake subprocess and consume no Antigravity quota.
