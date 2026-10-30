# Attribution

This directory is a vendored fork of
[`LiZhenNet/dsh-antigravity`](https://github.com/LiZhenNet/dsh-antigravity),
distributed under the MIT License (see `LICENSE`).

## Original work

- Project: `dsh-antigravity` — Google Antigravity / Cloud Code Assist model
  provider for DeepSeek Harness.
- Copyright: LiZhenNet and contributors.
- Vendored commit: `94957767c5e247d86cec8833fb1b67f659078af6` (v0.0.4,
  2026-08-19).

## Patches incorporated

- **PR #17** by kidbird — commits 2–6:
  - Gemini 3.8 Flash and Claude 5.5 catalog/routing updates.
  - Drop models the backend no longer advertises.
  - Treat backend "model retired" notices as errors.
  - Migrate stale catalogs and carry over enabled selections.
  - Documentation and version updates.
- **PR #19** by cyhkbl — resolve `ToolCallId ?? CallId` from the
  `@deepseek-ai/dsh-llm` namespace instead of a static `CallId` import.
- **PR #10** by miuzel — original `CallId` → `ToolCallId` rename (superseded by
  PR #19).

## Local changes in this fork

- Package version set to `0.1.0`, marked private, repository links pointed at
  `kimducanh27-cpu/antigravity-subagent`.
- Desktop-profile adaptation and install/rollback scripts (see `../install/`).
- Fork notes added to the READMEs.

## Disclaimer

Google Antigravity, Gemini, Claude and GPT are trademarks of their respective
owners. This project is unofficial and is not affiliated with or endorsed by
Google or DeepSeek.