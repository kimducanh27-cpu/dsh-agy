# Upstream provenance

- Project: `dsh-antigravity` — Google Antigravity / Cloud Code Assist model
  provider for DeepSeek Harness.
- Repository: https://github.com/LiZhenNet/dsh-antigravity
- Vendored commit: `94957767c5e247d86cec8833fb1b67f659078af6` (2026-08-19, v0.0.4)
- License: MIT — see `LICENSE` in this directory and `ATTRIBUTION.md`.
- Vendored on: 2026-10-30
- Upstream is unofficial and not affiliated with or endorsed by Google.

## Local patches on top of the vendored commit

1. **Tool-call id compatibility** — import the `@deepseek-ai/dsh-llm` namespace
   and resolve `ToolCallId ?? CallId` (PR #19 approach), replacing the removed
   static `CallId` import (upstream PRs #10 and #17.1 cover the same rename).
2. **Model catalog** — Gemini 3.8 Flash, Claude 5.5 routing, retire unserved
   models, treat backend retirement notices as errors, migrate stale catalogs
   (upstream PR #17 commits 2–6).
3. **Desktop profile** — settings client injection and profile registration are
   adapted for the Electron-managed `desktop` profile of DSH 0.2.1-rc.5.
4. **Windows browser opener** — open OAuth URLs with
   `rundll32 url.dll,FileProtocolHandler` instead of `cmd /c start`. The shell
   truncated the URL at the first `&`, dropping `response_type` and making
   Google answer `400: invalid_request`.

## Update policy

- Re-vendor only after CI is green against the pinned DSH version.
- Record every new upstream commit and every local patch in this file.
- Never commit OAuth tokens. The provider stores them under
  `$DSH_HOME/storages/antigravity-oauth.json`.

## Security notes

- The OAuth flow is a loopback callback on `http://localhost:51121/oauth-callback`.
- Tokens are bearer credentials for the Antigravity backend; treat the storage
  file as a secret.