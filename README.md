# Antigravity subagent

Delegate **one task** from any coding agent to [Google Antigravity](https://antigravity.google/)
using its own **cached authentication and settings**. No API key is copied,
stored, or forwarded: the Antigravity CLI (`agy`) signs in once, and every
delegation reuses that login.

This repository ships three ways to use Antigravity:

1. **Model provider** — the `provider/` bundle registers Antigravity models
   (Gemini/Claude/GPT) in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness),
   so the main chat is answered by Antigravity.
2. **Subagent** — the root bundle exposes the `subagent_antigravity` tool for
   one-shot delegation to the Antigravity agent.
3. **Standalone bridge** — `scripts/agy-task.mjs`, a dependency-free Node.js
   script any agent (Codex, Claude Code, Qoder, Cursor, …) can clone and run.

Vietnamese quick start: [README.vi.md](README.vi.md).

## Repository layout

| Path | What it is |
|---|---|
| root | `dsh-subagent-antigravity` — worker bundle (one-shot delegation via `agy`) |
| `provider/` | `dsh-antigravity` — model-provider bundle (Antigravity as the main brain) |
| `scripts/` | standalone bridge, scratch-profile and P0 smoke tooling |
| `install/` | desktop installer and rollback (see `install/README.vi.md`) |
| `docs/` | research notes, design spec, evidence and the Vietnamese guide |

## Use Antigravity as the model provider

`provider/` registers Antigravity in DSH's model picker and streams answers
through Cloud Code Assist. It keeps its own Google OAuth credentials under
`$DSH_HOME/storages/antigravity-oauth.json` — separate from the `agy` login used
by the subagent — and consumes the same subscription quota.

> Unofficial integration: use it only with an account you are authorized to
> use, and prefer a secondary Google account. See `provider/README.md`.
> Desktop install and rollback: `install/README.vi.md`.

## Requirements

- [Antigravity CLI](https://antigravity.google/docs/cli/headless/) installed
  (`agy --version` works).
- Signed in once with an interactive `agy` session. The CLI keeps the
  credentials in `~/.gemini/antigravity-cli/`; this project never reads or
  rewrites them.
- Node.js 20+ for the standalone script and tests.
- Windows, macOS, or Linux.

## Use it from any agent (standalone)

```bash
git clone https://github.com/kimducanh27-cpu/dsh-agy.git
cd dsh-agy

node scripts/agy-task.mjs "Reply with exactly: hello from Antigravity"
```

The final answer is written to **stdout**; diagnostics go to **stderr**.
A successful run exits `0`; a failure exits `1`; bad usage exits `2`; a timeout
exits `124`.

Options:

```bash
node scripts/agy-task.mjs --cwd ./my-project "Review src/cache.ts for bugs"
node scripts/agy-task.mjs --model gemini-3.8-flash-medium --effort high "..."
node scripts/agy-task.mjs --agent reviewer "..."
node scripts/agy-task.mjs --timeout 600 "Run the test suite and report failures"
node scripts/agy-task.mjs --bypass-permissions "..."   # dangerous, see Security
node scripts/agy-task.mjs -- "task text that starts with --"
```

Point the script at a specific binary with `AGY_BIN=/path/to/agy`. Without it,
the script checks `PATH` and the usual install locations
(`%LOCALAPPDATA%\agy\bin\agy.exe` on Windows, `~/.local/bin/agy`,
`/usr/local/bin/agy`, `/opt/homebrew/bin/agy` elsewhere).

Agents that need structured guidance can read [AGENTS.md](AGENTS.md).

## Use it in DeepSeek Harness (plugin)

1. Clone this repository anywhere, for example into your workspace.
2. Install the bundle **only if it is not already listed**. In the Harness Web UI
   open **Plugins → Add plugin** and enter the absolute path of the clone, or from
   an agent call:

   ```text
   plugin_manager list_bundles                                  # is it already there?
   plugin_manager install_bundle <absolute path to the clone>   # only if absent
   ```

3. Enable **Antigravity subagent** under **Plugins → Installed plugins**. Two
   rows appear: `subagent-antigravity` (the provider) and
   `tool-subagent-antigravity` (the model-facing tool).
4. The `subagent_antigravity` tool is now available to agents in that profile:

   ```text
   subagent_antigravity({ description: "Review cache layer", prompt: "Review src/cache.ts for bugs. Report findings only." })
   ```

   The call returns a child id immediately; the final answer arrives as a
   completion notice. Antigravity runs are one-shot: they accept no follow-up
   messages.

### Already installed, or updating

If **Plugins → Installed plugins** already lists **Antigravity subagent**, do not
install it again. The profile links the clone you installed, so updating is just:

1. edit the files in place;
2. toggle the bundle off and on (or restart the app) so the new code loads;
3. start a new session so the tool schema is composed.

Reinstalling is only for a machine where the bundle is absent. A running session
does not gain a newly mounted tool retroactively.

### Briefing the subagent (leaders)

A one-shot subagent only knows what you put in the task. The plugin also
registers a short `delegation:antigravity` system-prompt section with the same
checklist, so a Harness leader sees it without opening this file.

- Playbook: [DELEGATION.md](DELEGATION.md) — when to delegate, the six-part
  brief, two filled examples, anti-patterns, the verification loop, and
  token-saving rules.
- Templates: [brief](prompts/brief.md), [review](prompts/review.md),
  [implement](prompts/implement.md), [research](prompts/research.md),
  [debug](prompts/debug.md).

The short version: one goal; the context it cannot infer; exact paths; scope and
permissions; acceptance criteria; the exact output format; no secrets; verify
the answer before using it.

### Configuration

The plugin row accepts these fields (set them in the profile's bundle patch or
row config):

| Field | Default | Meaning |
|---|---|---|
| `providerName` | `antigravity` | Registry name on the subagent service |
| `executable` | `agy` | CLI name or absolute path |
| `model` | — (CLI setting) | `--model` |
| `effort` | — | `--effort low\|medium\|high\|xhigh\|max` |
| `agent` | — | `--agent` |
| `permissionMode` | `settings` | `settings` honors the CLI's permission settings; `bypass` adds `--dangerously-skip-permissions` |
| `sandbox` | `false` | Adds `--sandbox` |
| `allowSlashCommands` | `false` | When `false`, adds `--disable-slash-commands` so the task is treated as literal text |
| `env` | `{}` | Extra environment entries merged over the scrubbed parent environment |
| `disposeGraceMs` | `3000` | Grace period for the subprocess termination ladder |

The display title, description, and icon come from `locale/*.json` and
`icon.svg`. The plugin is tested against the bundled DeepSeek Harness desktop
runtime `0.2.1-rc.5`. The `dsh` CLI on `PATH` is a **separate installation**:
its `--version` (for example `0.2.0-rc.2`) does not describe the running desktop
app, and it cannot list or manage an Electron-managed profile. Do not treat a
CLI/app version difference as a fault.

> The Harness “Experimental plugins” list is compiled into the shipped UI, so a
> locally installed bundle appears under **Installed plugins**, not in that
> curated list.

## How it works

Both entry points speak the Antigravity CLI's headless JSON protocol:

- The task is written to **stdin** as one NDJSON line
  (`{"event":"user","message":{"content":[{"type":"text","text":"…"}]}}`), then
  stdin closes. This avoids command-line length limits and keeps the task out of
  process listings.
- The CLI prints NDJSON events on stdout: `init`, `step_update` text deltas, and
  one terminal `result` with `status` (`SUCCESS`, `ERROR`, `CANCELED`,
  `INTERRUPTED`, `WAITING`, `RUNNING`), `response`, `error`, and usage.
- On success the exact response text is returned. On failure the bridge exits
  non-zero; the plugin returns an errored tool result with a short, safe
  diagnostic (status, exit facts, conversation id, permission mode) and never
  pastes raw protocol output or stderr into the model-visible text.

Each delegation is a fresh, stateless CLI run (no `--continue`), executed in the
caller's working directory.

## Security

- Delegated work runs under Antigravity's own permission system. With the
  default `permissionMode: settings`, `~/.gemini/antigravity-cli/settings.json`
  decides which tools may run; headless mode soft-denies anything it cannot ask
  about.
- `permissionMode: bypass` / `--bypass-permissions` auto-approves **every** tool
  call, including file writes and command execution. Use only with trusted
  tasks.
- The task can be model-generated. Treat it as untrusted input and keep secrets
  out of it.
- This is an unofficial integration. Antigravity and its CLI belong to Google;
  DeepSeek Harness belongs to DeepSeek. This repository only wraps the public
  headless interface.

## Tests

```bash
node --test test/wire.test.mjs test/provider.test.mjs test/seam.test.mjs
```

The plugin tests use a fake subprocess, so they do not need Antigravity installed
or consume quota. Wire-mapping, cancellation, teardown, config validation,
diagnostic truncation, and the standalone CLI parser are covered.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Antigravity CLI was not found` | Install `agy`, put it on `PATH`, or set `executable` / `AGY_BIN` |
| `authentication required` | Run `agy` once interactively and sign in |
| `invalid model selection` | Check `agy models`; pin a valid `model` or omit it |
| A tool the agent needs was denied | Add a scoped rule under `permissions.allow` in `~/.gemini/antigravity-cli/settings.json`. Do not enable `permissionMode: bypass` just for one run: it is a profile-wide setting, not a per-run option, and auto-approves every tool |
| Plugin installed but no tool | Enable the bundle, then start a new session so the tool schema is composed; a running session does not gain it retroactively |
| `dsh --version` differs from the app | Ignore it: the CLI is a separate install and cannot manage the desktop app's profile |

## License

MIT. See [LICENSE](LICENSE).
