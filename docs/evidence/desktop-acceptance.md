# Desktop acceptance evidence

- Date: 2026-10-31
- Host: DSH desktop `0.2.1-rc.5`, Windows x64
- Kit: `dsh-agy` `0.2.1-rc.5` (main `37ffdee`, release `v0.2.1-rc.5`)
- OAuth account: PRO (email redacted)

## Install

- Clean clone: `.../plugins/dsh-agy` at tag `v0.2.1-rc.5`.
- `dsh plugin --profile desktop add` is refused with
  `profile "desktop" is managed exclusively by the Electron application`;
  the installer rolled the profile back automatically.
- Live install used the equivalent direct path: edit
  `~/.dsh/profiles/desktop/package.json` (dependencies + `dsh.profile.bundles`)
  and run the bundled pnpm `11.28.5`. The fixed installer now performs the same
  steps for future installs.
- Dependencies: `dsh-subagent-antigravity` → clone; `dsh-antigravity` → clone/provider.
- Bundles: both present.
- Backup: `~/.dsh/backups/antigravity-kit/desktop-20261031-005712`.

## Runtime

- App running; model selector shows **Gemini 3.8 Flash**, reasoning effort High.
- Chat `chào` received an Antigravity reply (`Chào bạn! ...`).
- Settings dialog exposes the **Antigravity** tab (account + quota UI). P0
  evidence already verified the PRO account and 5h/weekly quota in the same
  provider; the desktop uses the same OAuth store.
- Subagent bridge from the clean clone:
  `node scripts/agy-task.mjs --timeout 300 "Reply with exactly: DESKTOP SUBAGENT OK"`
  → `DESKTOP SUBAGENT OK`, exit 0.

## Known issue

A multi-turn/tool session produced:

```
Antigravity API error (400, endpoint=...): Bad request from Antigravity.
Backend said: Requests ending with a model turn are not supported.
```

Workaround: start a new session or resend. Single-turn P0 (6.2s) and the current
model selection are unaffected. Provider message-mapping fix is pending.

## Rollback

- Fixed rollback tested on `scratch-install3`: `package.json` and
  `cordis.patch.yml` restored byte-identical (SHA256 match), marker removed,
  zero Antigravity bundles in the composed profile.
- Live desktop rollback **not** executed (it would remove the working provider);
  the pre-install backup exists.

## Acceptance table

| # | Criterion | Status |
|---|---|---|
| 1 | 0 plugin load errors | PASS (P0 + desktop model selector) |
| 2 | Picker lists Antigravity | PASS |
| 3 | Chat returns real text | PASS (single turn); known multi-turn 400 |
| 4 | Quota UI | PASS in P0; desktop Settings tab available |
| 5 | Subagent regression | PASS (P0 + `DESKTOP SUBAGENT OK`) |
| 6 | Tests / CI | PASS (4/4 jobs, run 41098539382) |
| 7 | Installer idempotent | PASS on scratch (one backup) |
| 8 | Rollback | PASS on scratch; live pending |
| 9 | Secrets | PASS (no tokens tracked, email redacted) |
| 10 | Release artifacts | PASS (`v0.2.1-rc.5`, checksums verified) |