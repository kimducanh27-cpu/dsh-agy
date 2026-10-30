# Spec — DSH khung + Antigravity ruột (cả hai)

- Ngày: 2026-10-30
- Plan: `plan-1793377108073-0040`
- Trạng thái: **CHỜ DUYỆT (gate 1)** — chưa code.
- Repo: `kimducanh27-cpu/antigravity-subagent` (public, MIT)
- Host đích: DSH desktop 0.2.1-rc.5, Antigravity CLI 1.4.11, Windows x64.

---

## 1. Một trang cho bạn (dễ hiểu)

**Mục tiêu:** DSH là mặt tiền (khung). Antigravity làm 2 việc:

1. **Não** — trả lời chat trong DSH bằng model Antigravity (Gemini/Claude/GPT).
2. **Thợ** — nhận việc nặng, tự chạy bằng agent Antigravity rồi trả kết quả.

**Đã có:** phần **thợ** đang chạy (plugin `dsh-subagent-antigravity` + `agy`).
**Sẽ thêm:** phần **não** (provider `dsh-antigravity`) — hiện chưa có.

**Bạn sẽ làm 5 bước:**

1. Chạy 1 lệnh cài (có sao lưu tự động).
2. Bấm **Login** Google trong DSH (1 lần).
3. Mở model picker, chọn **Antigravity** + model (khuyến nghị Gemini 3.8 Flash).
4. Dùng bình thường. Việc nặng vẫn giao qua `subagent_antigravity`.
5. Muốn quay lại: chạy `rollback` — mọi thứ trở như trước.

**Không làm:**

- Không sửa/fork DSH.
- Không đụng login của `agy` (`~/.gemini/antigravity-cli/`).
- Không đổi model mặc định của bạn.
- Không tự ý push/tag GitHub hay cài vào desktop — mỗi việc chờ bạn duyệt.

**Cảnh báo (quan trọng):**

- Đây là tích hợp **không chính thức**. Dùng OAuth Antigravity ngoài IDE có thể
  vi phạm điều khoản Google → **nguy cơ khóa tài khoản**.
- Cách an toàn tuyệt đối: giữ DeepSeek làm não chính, hoặc dùng Gemini API key
  (tốn phí). Hai cách này không nằm trong bản build này.
- Nếu có tài khoản Google phụ, nên dùng tài khoản đó cho OAuth.

| Hạng mục | Bạn quyết | AI làm |
|---|---|---|
| Có thêm "não" Antigravity | Đã chọn "cả hai" | Vendor + vá + test |
| Rủi ro tài khoản | Chấp nhận / đổi tài khoản phụ | Ghi cảnh báo, hỗ trợ rollback |
| Push/tag GitHub | Duyệt ở gate 2 | CI + release |
| Cài vào desktop thật | Duyệt ở gate 3 | Cài + nghiệm thu |

---

## 2. Phạm vi

**Trong phạm vi**

- Provider Antigravity cho DSH desktop (LlmAdapter + OAuth + settings + quota).
- Giữ nguyên subagent hiện có; kiểm tra hồi quy.
- Script cài/rollback, CI GitHub Actions, release tarball, tài liệu tiếng Việt.

**Ngoài phạm vi**

- Thay agent loop chính của DSH (không phải seam hỗ trợ).
- Viết engine ACP riêng bằng `google-antigravity` Python SDK.
- Ảnh/attachment, multi-account, 429 failover (`#7/#9/#13/#15`).
- Publish npm/marketplace, đổi default model, Việt hóa UI.

---

## 3. Kiến trúc

```
┌──────────────────────── DSH desktop (khung) ────────────────────────┐
│  UI chat / model picker / settings / sessions                       │
│                                                                     │
│  ctx.llm  ──► provider "antigravity"                                │
│                (provider/lib/index.js)                              │
│                   └── Cloud Code Assist streaming (OAuth)           │
│                        └── Gemini / Claude / GPT models             │
│                                                                     │
│  ctx.subagents ──► provider "antigravity"                           │
│                     (dsh-subagent-antigravity, giữ nguyên)          │
│                       └── spawn `agy` (one-shot)                    │
│                            └── Antigravity agent tự chạy tool       │
└─────────────────────────────────────────────────────────────────────┘
```

- **Hai "antigravity" là hai service khác nhau**: `ctx.llm` (model) và
  `ctx.subagents` (thợ). Không xung đột; trong UI, provider xuất hiện ở model
  picker, còn thợ là một tool.
- **Không sửa DSH.** Cả hai là bundle plugin, nạp qua profile desktop.
- **Hai login độc lập**: `agy` (đã có) và provider OAuth (mới, 1 lần). Provider
  lưu token ở `$DSH_HOME/storages/antigravity-oauth.json`; không đọc token của
  `agy`.

**Luồng chat (não):** UI → `AntigravityAdapter.stream()` → Cloud Code Assist →
stream chunks → DSH render. Model list lấy từ `fetchAvailableModels`; static
catalog chỉ dùng khi backend không trả lời. Thông báo "model retired" bị coi là
lỗi, không render thành câu trả lời.

**Luồng giao việc (thợ):** model gọi `subagent_antigravity` → plugin spawn `agy`
→ trả lời one-shot qua completion notice (giữ nguyên hành vi hiện tại).

---

## 4. Cấu trúc file

```
antigravity-subagent/
├─ package.json                 # bundle thợ (giữ nguyên)
├─ lib/ test/ scripts/          # giữ nguyên
├─ provider/                    # MỚI — bundle não (fork MIT)
│  ├─ package.json              #   dsh-antigravity 0.1.0
│  ├─ cordis.patch.yml          #   insert id dsh-antigravity
│  ├─ lib/index.js, client.js   #   adapter + settings UI (đã vá)
│  ├─ bin/antigravity-login.mjs
│  ├─ LICENSE, ATTRIBUTION.md, UPSTREAM.md
│  └─ test/                     #   test load/import/catalog
├─ install/
│  ├─ install-desktop.ps1
│  ├─ rollback-desktop.ps1
│  └─ README.vi.md
├─ scripts/
│  ├─ make-scratch-profile.mjs
│  └─ install-into-profile.mjs
├─ docs/
│  ├─ research/compat-notes.md
│  ├─ specs/2026-10-30-dsh-antigravity-both-design.md
│  ├─ guide-vi.md
│  └─ evidence/
└─ .github/workflows/ci.yml, release.yml
```

---

## 5. Cài đặt & rollback

**Preflight**

- DSH desktop đang tắt hoặc sẽ được khởi động lại; đọc phiên bản từ app.
- `agy --version` chạy được; port `51121` trống.
- Tạo thư mục backup có timestamp.

**Install (idempotent)**

1. Sao lưu `~/.dsh/profiles/desktop/{package.json,cordis.patch.yml,pnpm-lock.yaml}`.
2. Thêm dependency `link:<repo>/provider` (nếu chưa có).
3. Thêm `dsh-antigravity` vào `dsh.profile.bundles` (nếu chưa có).
4. Chạy `pnpm install` bằng pnpm đi kèm DSH.
5. Khởi động lại app; kiểm tra 2 bundle enabled.
6. Chạy lại lần 2: không thay đổi file, exit 0.

**Rollback**

1. Khôi phục 3 file từ backup (hash phải khớp trước cài).
2. `pnpm install`, khởi động lại.
3. Provider biến mất; thợ cũ vẫn hoạt động.

**Gate:** chỉ chạy trên desktop thật sau khi bạn duyệt (gate 3). Mọi thử nghiệm
trước đó dùng profile tạm.

---

## 6. CI/CD trên GitHub

- `ci.yml`: matrix Windows + Ubuntu, Node 20/24; `node --check`; `node --test`
  (root + provider); parse YAML; secret scan; kiểm tra `dsh-llm` còn export
  `ToolCallId` (npm `next`) để phát hiện rename sớm.
- Không gọi mạng Antigravity trong CI; test dùng fake subprocess/fixture.
- `release.yml`: tag `v*` → `npm pack` 2 gói + `SHA256SUMS` → GitHub Release.
- Push/tag chỉ sau khi bạn duyệt (gate 2).

---

## 7. Tiêu chí nghiệm thu (10, đo được)

1. **Load:** log boot (scratch + desktop) có 0 lần
   `does not provide an export named`; cả 2 bundle ở trạng thái enabled.
2. **Picker:** nhóm Antigravity liệt kê ≥1 model; mọi id chọn được đều resolve;
   không còn id "chết" chỉ có trong static catalog.
3. **Chat:** 1 lượt với model đã chọn trả text không rỗng trong ≤60s; finish
   reason không phải error; không có thông báo "no longer available".
4. **Quota:** settings hiển thị email + quota 5h/tuần, hoặc trạng thái
   "quota unavailable" rõ ràng, không crash.
5. **Hồi quy thợ:** `subagent_antigravity` trả lời không rỗng cho prompt cố định;
   exit 0.
6. **Test:** `node --test` (root + provider) xanh trên Windows và Ubuntu trong CI;
   `node --check` toàn bộ JS.
7. **Idempotent:** chạy installer 2 lần; lần 2 không đổi hash file profile,
   exit 0; chỉ 1 bộ backup.
8. **Rollback:** hash `package.json` + `cordis.patch.yml` bằng trước cài; sau
   restart không còn provider Antigravity; thợ vẫn chạy.
9. **Bí mật:** `git grep` không thấy `refresh_token`/`access_token`/`ya29.`;
   hash thư mục `~/.gemini/antigravity-cli/` không đổi; token không vào repo.
10. **Release:** tag `v0.2.0-rc.1` có 2 `.tgz` + `SHA256SUMS`; cài từ tarball
    vào profile tạm sạch tái lập được tiêu chí 1, 2, 5.

---

## 8. Rủi ro & giảm thiểu

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Vi phạm ToS Google → khóa tài khoản | Cao | Cảnh báo rõ; khuyến nghị tài khoản phụ; rollback 1 lệnh |
| Upstream ngừng bảo trì | Trung bình | Fork của bạn; CI + UPSTREAM.md ghi mọi bản vá |
| DSH update đổi API (`dsh-llm`) | Trung bình | Pin 0.2.1-rc.5; CI kiểm export; vá nhanh |
| App ghi đè profile | Trung bình | Backup + script cài lại; test sau update |
| Port 51121 bận | Thấp | Preflight; đóng app chiếm port; helper login |
| Cạn quota subscription | Trung bình | Mặc định khuyến nghị Flash; cảnh báo Opus |
| Catalog model trôi | Trung bình | Live fetch; retired-notice → error; test P0 |
| UI settings chỉ EN/ZH | Thấp | Ngoài phạm vi; ghi chú; thêm vi sau |

---

## 9. Thứ tự thực thi (khớp FlowPlan)

1. Research — xong.
2. Spec — file này, chờ duyệt.
3. Vendor + vá.
4. Scratch profile.
5. P0 smoke.
6. Chuẩn hóa 2 gói.
7. Installer/rollback.
8. CI/release.
9. CI xanh + dry-run (gate 2).
10. Hướng dẫn VI.
11. Nghiệm thu desktop (gate 3).
12. Tổng kết.

---

## 10. Chờ bạn duyệt

- Duyệt spec này để mình sang thẻ 3 (vendor + vá).
- Nếu muốn dùng **tài khoản Google phụ** cho OAuth, nói trước để mình ghi vào
  hướng dẫn.
- Nếu không chấp nhận rủi ro ToS, chọn **"chỉ giữ thợ"** — mình dừng phần não.