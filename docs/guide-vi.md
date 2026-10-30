# DSH + Antigravity — Hướng dẫn dùng (bản tiếng Việt)

Cập nhật: 2026-10-31. Áp dụng cho **DSH desktop 0.2.1-rc.5** và kit **dsh-agy 0.2.1-rc.5**.

## 1. Hiểu nhanh trong 1 phút

- **DSH** là cái khung: giao diện, session, plugin.
- **Antigravity** làm 2 việc:
  - **Não** — trả lời chat bằng model Antigravity (Gemini/Claude/GPT).
  - **Thợ** — nhận một việc trọn gói qua tool `subagent_antigravity`.
- Cơ chế: **OAuth Google**. Không dùng SDK, không cần dán API key.
- Hai login **độc lập**: provider (Settings → Antigravity) và CLI `agy`.

## 2. Cài đặt (5 bước)

Chuẩn bị: đã cài DSH desktop; `agy --version` chạy được.

1. Clone repo (bản `main` có installer đã vá):

   ```powershell
   git clone https://github.com/kimducanh27-cpu/dsh-agy.git
   cd dsh-agy
   ```

2. **Đóng app DSH** — đóng cả cửa sổ lẫn icon ở khay (tray).
3. Chạy installer:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File install\install-desktop.ps1 -AllowDesktop
   ```

   Script tự backup, tự link 2 gói và chạy pnpm 11.28.5 đi kèm DSH.
   Chạy lại lần 2 sẽ báo **Already installed**.

4. Mở DSH → **Settings → Antigravity → Sign in** (chỉ 1 lần).
5. Mở ô model, chọn **Antigravity** + model (khuyến nghị Gemini 3.8 Flash). Dùng.

## 3. Kiểm tra trong app

- Ô model có nhóm **Antigravity** (Gemini/Claude/GPT).
- **Settings → Antigravity**: tài khoản **PRO** + quota 5 giờ/tuần.
- Session mới có tool **`subagent_antigravity`** (thợ).
- Thử thợ: giao một việc ngắn, ví dụ "Review file X, chỉ báo lỗi, không sửa".

## 4. Rollback (trả như trước khi cài)

1. Đóng app DSH (cả tray).
2. Chạy:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File install\rollback-desktop.ps1 -AllowDesktop
   ```

Script khôi phục đúng file trước cài (kiểm hash), gỡ 2 bundle và dọn link.
Backup nằm ở `~/.dsh/backups/antigravity-kit/desktop-<thời-gian>/`.
Nếu đã cài nhiều lần, chọn bản backup: thêm `-Backup "<đường dẫn>"`.

## 5. Lỗi thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| `profile "desktop" is managed exclusively...` | Bản rc.5 dùng CLI cũ; clone `main` (đã vá) rồi chạy lại installer. |
| Installer báo app đang chạy | Đóng cả cửa sổ lẫn tray, rồi chạy lại. |
| Không thấy nhóm Antigravity | Mở Settings → Plugins xem có 2 bundle; chạy lại installer. |
| `Requests ending with a model turn are not supported` | Lỗi backend Antigravity ở một số session nhiều lượt/tool. Mở session mới hoặc gửi lại; bản vá đang chờ. |
| `AUTH` / 401 | Settings → Antigravity → Sign in lại. |
| Cửa sổ app biến mất | App vẫn chạy tray; mở lại từ Start Menu hoặc tắt hẳn rồi mở. |
| Quota 0% | Chờ mốc reset 5 giờ/tuần hoặc chọn model khác. |

## 6. Cảnh báo

- Đây là tích hợp **không chính thức**; dùng OAuth Antigravity ngoài IDE có thể
  vi phạm điều khoản Google → **nguy cơ khóa tài khoản**.
- Nên dùng **tài khoản Google phụ**.
- File `~/.dsh/storages/antigravity-oauth.json` là **bí mật** — không chia sẻ,
  không đưa lên GitHub.
- Model Antigravity dùng chung quota gói thuê bao (5 giờ/tuần).

## 7. 5 câu lệnh điều khiển AI

1. **"Cài lại này"** — chạy installer (có backup).
2. **"Rollback"** — trả profile về trước khi cài.
3. **"Kiểm tra quota"** — mở Settings → Antigravity.
4. **"Test thợ"** — giao một việc ngắn qua `subagent_antigravity`.
5. **"Dừng"** — không thao tác thêm.

## 8. Bạn không cần biết

`package.json`, `pnpm`, bundle, `cordis.patch.yml`, đường dẫn token — cứ để AI lo.
Bạn chỉ cần: đóng app, chạy 1 lệnh, mở app, chọn model.

---

## Phần kỹ thuật — AI đọc

- Installer sửa `~/.dsh/profiles/<profile>/package.json` (dependencies +
  `dsh.profile.bundles`) rồi chạy pnpm đi kèm DSH; **không** dùng
  `dsh plugin --profile desktop` (CLI chặn profile Electron).
- Link: `dsh-subagent-antigravity` → repo; `dsh-antigravity` → `repo/provider`.
- OAuth: `~/.dsh/storages/antigravity-oauth.json`; `agy`: `~/.gemini/antigravity-cli/`.
- Catalog model: live `fetchAvailableModels`; static chỉ là fallback; thông báo
  "model retired" bị coi là lỗi.
- Release: `v0.2.1-rc.5` (prerelease, 2 tarball + SHA256SUMS); CI 4/4.
- Known issue: backend Antigravity trả 400 "Requests ending with a model turn are
  not supported" ở một số lượt nối tiếp/tool; workaround: session mới.
- Rollback kiểm hash `package.json` + `cordis.patch.yml`; backup manifest ở
  `~/.dsh/backups/antigravity-kit/<profile>-<timestamp>/manifest.json`.