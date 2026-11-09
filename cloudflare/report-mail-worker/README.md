# quiz-report-mail (Cloudflare Worker)

Gửi email báo cáo câu hỏi của Quiz App về `phamnghiatrong1412@gmail.com` bằng Cloudflare Email Routing.

```
Trình duyệt --(JWT)--> Supabase Edge Function report-question --(Bearer REPORT_MAIL_SECRET)-->
https://report-mail.phamnghiatrong.com (Worker) --(send_email binding)--> Gmail của tác giả
```

- Người gửi: `bao-cao@phamnghiatrong.com` (tên miền phải bật Email Routing).
- Người nhận bị khoá cứng trong `wrangler.toml` (`destination_address`), Worker không gửi được tới địa chỉ khác.
- Gửi tới địa chỉ đã xác minh là miễn phí (gói Workers Free).

## Cài đặt lần đầu

1. **Bật Email Routing**: Cloudflare Dashboard (dash.cloudflare.com) > menu trái **Compute** >
   **Email Service** > **Email Routing** > chọn `phamnghiatrong.com` > bật / Enable. Cho Cloudflare tự
   thêm bản ghi MX, SPF, DKIM. (Giao diện cũ: chọn tên miền > Email > Email Routing.)
2. **Xác minh hộp thư nhận**: cùng trang Email Routing > tab **Destination Addresses** > nhập
   `phamnghiatrong1412@gmail.com`, mở Gmail bấm **Verify email address**. Trạng thái phải là Verified.
3. **Tạo secret** (PowerShell, chạy 1 lần, copy kết quả):
   ```powershell
   -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | ForEach-Object {[char]$_})
   ```
4. **Deploy Worker** (cần Node.js, kiểm tra bằng `node -v`):
   ```powershell
   cd "T:\Quiz App\cloudflare\report-mail-worker"
   npx wrangler login
   npx wrangler deploy
   npx wrangler secret put REPORT_MAIL_SECRET
   ```
   Lệnh cuối hỏi giá trị: dán chuỗi ở bước 3.
5. **Supabase**: Dashboard > Edge Functions > Secrets > thêm `REPORT_MAIL_SECRET` = cùng chuỗi ở bước 3.

## Kiểm tra lỗi

```sql
select created_at, email_sent, email_error from question_reports order by created_at desc limit 5;
```
- `Cloudflare 401`: secret ở Supabase và Worker không giống nhau.
- `Cloudflare 502 ... destination address not verified`: chưa xác minh Gmail ở bước 2.
- `Cloudflare: ... dns error / connection`: Worker chưa deploy hoặc tên miền `report-mail` chưa nhận.
- Log trực tiếp của Worker: `npx wrangler tail`.

## Chạy thử cục bộ

Tạo file `.dev.vars` chứa `REPORT_MAIL_SECRET=thu-nghiem`, chạy `npx wrangler dev`, rồi POST JSON
`{"subject":"...","html":"...","text":"..."}` kèm header `Authorization: Bearer thu-nghiem`.
Wrangler ghi thư ra file `.eml` trong `.wrangler/tmp` thay vì gửi thật.
