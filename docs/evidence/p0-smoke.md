# P0 smoke evidence

- Timestamp: 2026-10-30T16:41:24.546Z
- dsh: 0.2.1-rc.5
- Model: gemini-3.8-flash (fixture: test/fixtures/antigravity-default-model.yml)
- Result: PASS

| Check | Result | Duration | Detail |
|---|---|---|---|
| scratch web profile | PASS | 395 ms | — |
| web bundles installed | PASS | 649 ms | — |
| scratch headless profile | PASS | 408 ms | — |
| headless bundles installed | PASS | 660 ms | — |
| scratch web boot + page fetch | PASS | 2475 ms | HTTP 200, 38166 bytes |
| headless chat via Antigravity | PASS | 6187 ms | — |
| subagent regression (agy) | PASS | 9905 ms | — |

## UI verification (Playwright, scratch web profile)

- Page loaded: HTTP 200, 38,166 bytes, title `DeepSeek Harness`.
- Model picker showed an **Antigravity** group with Gemini/Claude/GPT entries.
- Settings → **Antigravity** tab rendered:
  - Current account plan: **PRO** (email redacted).
  - Quota groups rendered: Claude & GPT weekly 100%, five-hour 100%.
  - Model selector refreshed to the live catalog: Gemini 3.8/3.5/3.1 Flash,
    Gemini 3.1 Flash Lite/Image, Gemini 3/2.5, GPT-OSS 120B, Claude Opus 4.6,
    Claude Sonnet 4.6.
- Console errors: only `[deepseek-account] account read failed {field: profile}`
  (the scratch profile has no DeepSeek account profile). No Antigravity errors.
- Known UX note: before the first live catalog fetch, the picker can list
  static-catalog entries the backend does not serve (e.g. Claude 5.5). Opening
  Settings refreshes to the live list; PR #17 commit 3 drops unadvertised models
  once the backend answers.

## Notes

- Scratch profiles only; the desktop profile was not modified.
- OAuth credentials were already present at the time of the run.
- Tokens, emails and the local web token are redacted in this file and in console output.
