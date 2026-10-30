# Cài Antigravity vào DSH desktop (bản tiếng Việt)

Bộ cài này thêm **2 gói** vào profile `desktop` của DSH:

- **Não** — `dsh-antigravity`: model Antigravity trong model picker.
- **Thợ** — `dsh-subagent-antigravity`: tool `subagent_antigravity` (đã có từ trước).

Cài đặt có **sao lưu tự động** và **rollback** trả profile về đúng như trước.

## Trước khi cài

1. Đóng app **DeepSeek Harness**.
2. Kiểm tra `agy --version` chạy được (dùng cho phần thợ).
3. Chuẩn bị tài khoản Google cho phần não — **nên dùng tài khoản phụ**.
4. Không cần quyền admin.

## Cài (1 lệnh)

Mở PowerShell tại thư mục repo:

```powershell
cd C:\Users\ducti\Documents\deepseek-harness\default-workspace\plugins\dsh-subagent-antigravity
powershell -NoProfile -ExecutionPolicy Bypass -File install\install-desktop.ps1 -AllowDesktop
```

Script sẽ:

- Sao lưu `package.json`, `cordis.patch.yml`, `pnpm-lock.yaml` vào
  `~/.dsh/backups/antigravity-kit/desktop-<thời-gian>/`.
- Link 2 gói vào profile và bật 2 bundle.
- Ghi marker `~/.dsh/profiles/desktop/.antigravity-kit.json`.
- Nếu lỗi giữa chừng: tự khôi phục backup.

Chạy lại lần 2: script báo **Already installed** và không đổi gì.

## Sau khi cài

1. Mở DSH.
2. **Settings → Antigravity → Sign in** — đăng nhập Google **1 lần**.
3. Mở model picker, chọn **Antigravity** + model (khuyến nghị Gemini 3.8 Flash).
4. Giao việc nặng qua `subagent_antigravity` như cũ.

## Rollback

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File install\rollback-desktop.ps1 -AllowDesktop
```

Script khôi phục đúng file trước khi cài (kiểm tra hash), gỡ 2 bundle và chạy
`pnpm install` để dọn link. Nếu đã cài nhiều lần, chọn bản backup cụ thể:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File install\rollback-desktop.ps1 -AllowDesktop -Backup "C:\Users\ducti\.dsh\backups\antigravity-kit\desktop-20261030-234500"
```

## Kiểm tra nhanh

- `~/.dsh/profiles/desktop/package.json` có 2 dependency và 2 bundle.
- Có marker `~/.dsh/profiles/desktop/.antigravity-kit.json`.
- Settings có tab **Antigravity**; model picker có nhóm **Antigravity**.
- Console không có lỗi `does not provide an export` hay `Cannot find package`.

## Cảnh báo

- Đây là tích hợp **không chính thức**; dùng OAuth Antigravity ngoài IDE có thể
  vi phạm điều khoản Google → **nguy cơ khóa tài khoản**.
- Model Antigravity dùng chung quota gói thuê bao (5 giờ/tuần).
- File `~/.dsh/storages/antigravity-oauth.json` là **bí mật** — không đưa lên
  GitHub, không gửi qua chat.
- DSH cập nhật phiên bản có thể làm vỡ adapter; chạy lại `npm run check` và
  test P0 sau mỗi lần update.

## Ghi chú kỹ thuật

- Installer dùng `dsh plugin --profile <name> add link:<repo> link:<repo>/provider`;
  lệnh này tự thêm cả 2 bundle (đã kiểm chứng ở P0).
- Thử trên profile tạm: thêm `-Profile scratch-install` (không cần `-AllowDesktop`).
- Nếu CLI không có trên PATH: thêm `-Dsh "D:\DeepSeek\resources\runtime\cli\bin\dsh.cmd"`.