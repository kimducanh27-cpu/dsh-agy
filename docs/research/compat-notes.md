# Compatibility research — dsh-antigravity on DSH 0.2.1-rc.5

Date: 2026-10-30
Scope: card 1 of plan `plan-1793377108073-0040` (research only, no code changes).

## TL;DR (VI)

- Plugin provider gốc **không thể load** trên DSH hiện tại: `dsh-llm@0.2.1-rc.5`
  chỉ export `ToolCallId`, còn plugin import `CallId` → lỗi ESM ngay khi mount.
- Đã có sẵn bản vá cộng đồng: PR #17 (6 commit: đổi id, cập nhật catalog, bỏ model
  đã nghỉ, phân biệt thông báo "model retired", làm mới catalog cũ) và PR #19
  (né lỗi đổi tên xuyên phiên bản). PR #10 trùng PR #17.1.
- Tài khoản Antigravity trên máy này (CLI `agy models`) trả 6 model; catalog thật
  của provider lấy từ backend qua `fetchAvailableModels`, static catalog chỉ là
  fallback khi backend không trả lời.
- Quyết định: vendor đúng commit `94957767…` (MIT), áp PR #17 commit 2–6 và cách
  của PR #19; pin DSH 0.2.1-rc.5; không đụng `~/.gemini/antigravity-cli/`.

## Evidence

### 1. `CallId` was removed from `@deepseek-ai/dsh-llm`

- npm dist-tags: `next = 0.2.1-rc.5` (same version as the desktop app).
- Tarball: `https://registry.npmjs.org/@deepseek-ai/dsh-llm/-/dsh-llm-0.2.1-rc.5.tgz`
- `lib/types/brand.d.ts:25` — `export type ToolCallId = Branded<'ToolCallId'>;`
- `lib/types/brand.d.ts:31` — `export declare function ToolCallId(id: string): ToolCallId;`
- `grep -rn "export.*CallId" --include="*.d.ts"` returns only the two `ToolCallId`
  lines; no `CallId` export exists.
- Consequence: upstream `dsh-antigravity@0.0.4` statically imports `{ CallId }`,
  so the host rejects the whole plugin at mount:
  `SyntaxError: The requested module '@deepseek-ai/dsh-llm' does not provide an export named 'CallId'`.
- Confirmed independently by upstream issues/PRs #10, #17, #19.

### 2. Upstream patch inventory

| PR | Date | Content | Use |
|---|---|---|---|
| #10 | 2026-09-01 | Hard rename `CallId` → `ToolCallId` | Superseded by #19 |
| #17 | 2026-10-08 | 6 commits: (1) `ToolCallId`; (2) catalog Gemini 3.8 / Claude 5.5; (3) drop models the backend no longer advertises; (4) treat "model retired" notices as errors; (5) migrate stale catalog + enabled ids; (6) docs + bump 0.0.5 | Apply commits 2–6; take the import fix from #19 |
| #19 | 2026-10-21 | Namespace import: `const CallId = dshLlm.ToolCallId ?? dshLlm.CallId` | Use this import shape (works on both old and new dsh-llm) |

### 3. Live model catalog on this machine (2026-10-30)

`agy models` (Antigravity CLI 1.4.11, signed in):

```
gemini-3.8-flash-high    Gemini 3.8 Flash (High)
gemini-3.8-flash-medium  Gemini 3.8 Flash (Medium)
gemini-3.8-flash-low     Gemini 3.8 Flash (Low)
claude-sonnet-4-6        Claude Sonnet 4.6 (Thinking)
claude-opus-4-6-thinking Claude Opus 4.6 (Thinking)
gpt-oss-120b-medium      GPT-OSS 120B (Medium)
```

Discrepancy: PR #17 assumes Claude 4.6 is retired and 5.5 is served. This account
still sees 4.6 through the CLI catalog. The provider fetches the Cloud Code
Assist catalog directly (`fetchAvailableModels`), which is authoritative; the
static list is only a fallback. P0 must verify the picker against the live
backend, not against the static table.

### 4. Known upstream issues left out of scope

- #7, #9, #13 — image attachments to Antigravity.
- #6 — abnormal token throughput.
- #14 — unsafe `response.json()` on gzip error paths.
- #15 — multi-account pool / 429 failover.

Scope for this plan is load + one chat turn + subagent regression. These issues
are recorded here so they are not silently re-discovered later.

### 5. Decisions

1. Vendor upstream commit `94957767c5e247d86cec8833fb1b67f659078af6`
   (`LiZhenNet/dsh-antigravity`, MIT) into `provider/`.
2. Apply PR #17 commits 2–6; replace commit 1 with PR #19's namespace fallback
   (also covers #10).
3. Keep the upstream package name `dsh-antigravity` to minimize divergence; our
   fork version starts at `0.1.0`.
4. Pin the tested host: DSH desktop 0.2.1-rc.5 / dsh-llm 0.2.1-rc.5. CI checks
   the export surface against the npm `next` tag and fails loudly on rename.
5. Never read or write `~/.gemini/antigravity-cli/` (repo AGENTS.md rule). The
   provider uses its own OAuth store at
   `$DSH_HOME/storages/antigravity-oauth.json`; the subagent keeps using the
   CLI's cached login.

## Verification plan (P0)

1. Mount both bundles in a scratch profile → zero plugin load errors.
2. Model picker lists the live Antigravity catalog → ids match the backend.
3. One chat turn returns real text (not a retired-model notice).
4. `subagent_antigravity` smoke test still succeeds.
5. Evidence: raw logs + timings in `docs/evidence/p0-smoke.md`.