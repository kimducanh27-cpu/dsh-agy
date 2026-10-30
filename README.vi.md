# Antigravity subagent (bản tiếng Việt)

Giao **một việc trọn gói** cho Google Antigravity, dùng đúng tài khoản và cài
đặt sẵn có của nó. Không cần dán API key: chỉ cần đăng nhập `agy` một lần.

Repo có 2 gói cho DSH và 1 cách dùng độc lập:

- **Não chính** — `provider/`: Antigravity trả lời chat trong DSH
  (Gemini/Claude/GPT). Cần đăng nhập Google riêng, dùng chung quota; không chính
  thức nên ưu tiên tài khoản phụ. Xem `provider/README.md`.
- **Thợ** — gói gốc: tool `subagent_antigravity`, giao một việc trọn gói qua `agy`.
- **Độc lập** — `scripts/agy-task.mjs` cho mọi agent.

## Cài vào DSH desktop

Hướng dẫn 5 bước đầy đủ: [docs/guide-vi.md](docs/guide-vi.md).
Tóm tắt: clone repo → đóng app (cả tray) → chạy
`install\install-desktop.ps1 -AllowDesktop` → mở app → Settings → Antigravity →
Sign in → chọn model Antigravity. Rollback:
`install\rollback-desktop.ps1 -AllowDesktop`.

Chi tiết từng cách:

## 1. Cho mọi AI agent (Codex, Claude Code, Qoder, Cursor…)

```bash
git clone https://github.com/kimducanh27-cpu/dsh-agy.git
cd dsh-agy
node scripts/agy-task.mjs "Trả lời đúng một dòng: xin chào từ Antigravity"
```

- Câu trả lời in ra **stdout**; lỗi in ra **stderr**.
- Mã thoát: `0` thành công, `1` lỗi/không có câu trả lời, `2` sai cách dùng,
  `124` quá thời gian.
- Việc giao phải **tự chứa đủ thông tin** (Antigravity không thấy hội thoại của
  bạn). Ghi rõ đường dẫn, yêu cầu, định dạng kết quả.
- Tùy chọn: `--cwd <thư mục>`, `--model <tên>`, `--effort <mức>`,
  `--agent <tên>`, `--timeout <giây>`.

Ví dụ:

```bash
node scripts/agy-task.mjs --cwd . --timeout 600 \
  "Kiểm tra src/cache.ts xem có lỗi logic không. Chỉ báo lỗi kèm file:dòng, không sửa file."
```

## 2. Cho DeepSeek Harness

1. Clone repo về máy.
2. Mở **Plugins → Add plugin**, nhập đường dẫn tuyệt đối tới thư mục vừa clone
   (hoặc gọi `plugin_manager install_bundle <đường dẫn>`) — **chỉ khi chưa cài**.
   Nếu **Plugins → Installed plugins** đã có **Antigravity subagent** thì đừng cài
   lại: profile đang trỏ thẳng vào thư mục clone, chỉ cần sửa file tại chỗ rồi
   tắt/bật bundle (hoặc khởi động lại app).
3. Bật **Antigravity subagent** trong **Plugins → Installed plugins**.
4. Trong chat, nhờ agent dùng tool `subagent_antigravity`:

   ```text
   subagent_antigravity({ description: "Soát cache", prompt: "Soát src/cache.ts, chỉ báo lỗi." })
   ```

Mỗi lần gọi là một việc độc lập; không chat tiếp với việc đó được. Kết quả về
qua thông báo hoàn thành.

> `dsh --version` trên máy có thể khác phiên bản app (CLI là bản cài riêng, không
> xem/quản lý được profile của app Electron). Chỉ cần app đang chạy bản có plugin
> đã bật và mở **phiên mới** sau khi bật là tool xuất hiện.

## Giao việc sao cho hiệu quả

Antigravity **không thấy chat của bạn**, không thấy file bạn đã đọc, không thấy
kết quả tool. Mỗi lần chạy chỉ làm **một việc** và không hỏi lại. Vì vậy hãy viết
brief đủ 7 phần:

1. **Mục tiêu** — một câu, một kết quả.
2. **Bối cảnh** — thông tin nó không thể tự suy ra (phiên bản, lỗi, đoạn code).
3. **Đường dẫn** — file/glob được đọc, file được ghi (hoặc "không sửa file").
4. **Ràng buộc** — chỉ đọc hay được sửa, không thêm dependency, phạm vi.
5. **Tiêu chí đạt** — kiểm tra nào phải đúng.
6. **Định dạng đầu ra** — bảng `file:dòng`, diff, JSON… kèm giới hạn độ dài.
7. **Kiểm tra trước khi trả lời** — lệnh/điểm kiểm tra nó phải tự chạy.

Đừng đưa bí mật vào brief; hãy tự kiểm tra lại câu trả lời trước khi dùng.

Chi tiết + mẫu copy-paste:

- [DELEGATION.md](DELEGATION.md) — playbook đầy đủ (tiếng Anh).
- [prompts/brief.md](prompts/brief.md) — mẫu trống.
- [prompts/review.md](prompts/review.md), [prompts/implement.md](prompts/implement.md),
  [prompts/research.md](prompts/research.md), [prompts/debug.md](prompts/debug.md).

Mẹo tiết kiệm token: để Antigravity đọc file/log lớn, yêu cầu trả lời ngắn có
cấu trúc, và chỉ giữ lại bản tóm tắt trong phiên chính.

## Yêu cầu & bảo mật

- Cài Antigravity CLI (`agy --version` chạy được) và đăng nhập một lần.
- Mặc định tôn trọng quyền trong `~/.gemini/antigravity-cli/settings.json`.
- Chỉ bật `--bypass-permissions` (hoặc `permissionMode: bypass`) khi thật sự tin
  tưởng, vì nó tự đồng ý mọi thao tác ghi file/chạy lệnh.
- Đây là tích hợp không chính thức; Antigravity thuộc Google, DeepSeek Harness
  thuộc DeepSeek.

Chi tiết đầy đủ (tiếng Anh): [README.md](README.md) và [AGENTS.md](AGENTS.md).
