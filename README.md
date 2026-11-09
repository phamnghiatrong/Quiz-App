# Quiz App - Ôn tập trắc nghiệm
## Cấu trúc file

Chỉ những file dưới đây là cần thiết để chạy ứng dụng:

| File | Vai trò |
|------|---------|
| `index.html` | Trang chính (đăng nhập, menu, làm bài, lịch sử, BXH) |
| `app.js` | Toàn bộ logic ứng dụng (ES module) |
| `settings.js` | Mục Tùy chỉnh: giao diện, cỡ chữ, font |
| `config.js` | Supabase URL + publishable key |
| `style.css` | Giao diện nền |
| `style-final-fix.css` | Lớp ghi đè giao diện, nạp sau `style.css` |
| `theme.css` | Biến màu của giao diện sáng/tối, cỡ chữ, font. Biến `--app-*` dùng chung cho cả 3 mục con trong Shadow DOM |
| `menu.css` | Menu ngang, Trang chủ (video, chân trang), tab Tiếng Anh, Tùy chỉnh, luật "mỗi trang một lớp khung" |
| `group.css` | Giao diện Học nhóm, nạp sau `menu.css` |
| `report.css` | Nút Báo cáo ở màn làm bài và hộp thoại báo cáo, nạp sau `group.css` |
| `supabase/functions/report-question/` | Edge Function nhận báo cáo câu hỏi, gửi email qua Cloudflare Worker (dự phòng Brevo) |
| `cloudflare/report-mail-worker/` | Cloudflare Worker gửi email báo cáo bằng Email Routing, xem README trong thư mục |
| `reset-password.html` / `reset-password.js` | Trang đặt lại mật khẩu từ email |
| `sw.js` | Service worker (PWA, cache offline) |
| `manifest.webmanifest` | Khai báo PWA (tên, icon, theme) |
| `vercel.json` | Rewrite `/reset-password`, header cache |
| `schema.sql` | Toàn bộ schema + RLS + RPC của Supabase |
| `migrations/` | Script nâng cấp DB đang chạy. Bản Học nhóm: `2026-11-hoc-nhom.sql`, chạy lại nhiều lần không lỗi |
| `migrations/` | Thay đổi SQL cho project đã có dữ liệu, chạy riêng trong SQL Editor |
| `public/favicon.png` | Icon ứng dụng (512x512) |
| `public/2.png` | Ảnh chữ thương hiệu trên header |
| `package.json` | Khai báo project tĩnh, không có dependency |
| `tenses/` | Mục "12 thì tiếng Anh" (nạp lười, vẽ trong Shadow DOM) |
| `chinese/` | Mục "Tiếng Trung YCT": `chinese.js` (logic, gồm Tra từ mới / Nghe & viết / Sổ từ của tôi), `chinese-api.js` (tra từ: Google Dịch, Tatoeba), `chinese-data.js` (301 thẻ), `chinese.css`, `img/*.webp` (hình thẻ). Sổ từ lưu ở bảng `vocab_words` với `lang = 'zh'` |
| `vocab/` | Mục "Từ vựng tiếng Anh": `vocab.js` (giao diện, sổ từ, ôn tập, đặt câu), `vocab-api.js` (tra từ: Wiktionary, Google Dịch, MyMemory, Datamuse; soát câu: LanguageTool), `vocab.css`, `vocab-schema.sql` (bảng `vocab_words`) |

## Tính năng

- Đăng ký / đăng nhập / đăng xuất, đổi tên hiển thị, đổi mật khẩu, quên mật khẩu
- Menu ngang trên cùng, trên điện thoại gom vào nút Menu. Chọn môn ngay trên menu, lọc theo bài/phần
- Luyện tập (không giới hạn thời gian) và thi thử 30 câu/20 phút hoặc 70 câu/60 phút
- Hiện đúng/sai ngay khi chọn đáp án, kèm giải thích nếu câu hỏi có cột `explanation`
- Tự lưu bài đang làm dở theo từng tài khoản + từng môn, cho phép tạm dừng và làm tiếp
  (nút Tiếp tục nằm ở màn của môn đó; rời app quá 10 phút thì quay về đúng màn môn học)
- Làm lại các câu sai gần nhất (không tính giờ, không tính điểm BXH)
- **Báo cáo câu hỏi**: nút Báo cáo ở góc trên bên phải màn làm bài, chọn loại vấn đề, đáp án đề
  xuất, mô tả; báo cáo lưu vào bảng `question_reports` và gửi email cho tác giả. Xem mục riêng bên dưới.
- Lịch sử ôn tập và bảng xếp hạng theo từng môn
- Tùy chỉnh: giao diện Sáng / Tối / Theo hệ thống, cỡ chữ, font chữ
- Cài được như app (PWA), dùng lại được khi mất mạng
- **Học nhóm**: tạo nhóm, mời bằng mã hoặc link và duyệt từng yêu cầu, bài kiểm tra có mật
  khẩu từ ngân hàng câu hỏi, người tạo bấm Bắt đầu thì mở, hết giờ tự đóng, hệ thống tự chấm
  và tổng hợp kết quả. Điểm và đáp án chỉ hiện khi bài kết thúc. Xem mục riêng bên dưới.
- **12 thì tiếng Anh**: lý thuyết, máy lắp câu, phòng luyện, bộ đề 49 câu.
- **Tiếng Trung YCT**: học từ vựng YCT 1-4 bằng thẻ có hình. Xem mục riêng bên dưới.

## Tiếng Trung YCT (học bằng thẻ)

301 thẻ từ vựng YCT 1-4 (YCT1: 80, YCT2: 69, YCT3: 102, YCT4: 50), mỗi thẻ có
hình minh hoạ, chữ Hán, pinyin, nghĩa tiếng Việt + tiếng Anh và một cụm/câu ví dụ.
Nguồn là bộ flashcard YCT dạng PDF ảnh (Lingo Bus): chữ và câu ví dụ được chép
lại từ mặt sau thẻ, hình cắt từ mặt trước (WebP 320px, tổng ~2,8 MB, chỉ tải khi cần).

5 trang con:

| Trang | Cách học |
|-------|----------|
| Lật thẻ | Xem hình + chữ, bấm lật xem nghĩa và câu ví dụ, tự chấm "Đã nhớ / Chưa nhớ" |
| Nhìn chữ & hình đoán nghĩa | Chọn nghĩa tiếng Việt đúng trong 4 phương án (có thể ẩn hình) |
| Ghép câu | Xếp các mảnh từ thành câu ví dụ theo nghĩa tiếng Việt (có mảnh thừa) |
| Chọn chữ đúng | Chọn chữ Hán theo hình + nghĩa, hoặc điền chữ còn thiếu vào câu |
| Tiến độ & bộ thẻ | Thống kê theo cấp, lưới toàn bộ thẻ, bấm để mở thẻ |

- Lọc theo cấp YCT (chọn nhiều cấp), bật/tắt pinyin, nghĩa tiếng Anh, tự phát âm.
- Phát âm bằng giọng đọc tiếng Trung có sẵn của trình duyệt/hệ điều hành
  (Web Speech API, không tốn chi phí). Máy chưa cài giọng tiếng Trung thì app báo.
- Mức nhớ từng thẻ theo kiểu hộp Leitner (0-5): đúng +1, sai về 0; từ 3 trở lên
  là "đã thuộc". Lượt luyện chọn thẻ ngẫu nhiên có trọng số, thẻ mới và thẻ hay
  sai ra nhiều hơn.
- Tiến độ lưu `localStorage` key `yct-cards-v1:<userId>` (theo tài khoản, theo
  trình duyệt), chưa đồng bộ Supabase và không tính vào bảng xếp hạng.
- 36 hình có in sẵn chữ Hán/câu (trường `txt` trong dữ liệu) được ẩn trước khi
  trả lời ở chế độ Ghép câu và Chọn chữ đúng để không lộ đáp án.
- Sửa file trong `chinese/` thì tăng `CHINESE_MODULE_URL` (`?v=`) trong `app.js`.
- Sửa file trong `vocab/` thì tăng `VOCAB_MODULE_URL` (`?v=`) trong `app.js`. Mục này cần bảng
  `vocab_words`: chạy `vocab/vocab-schema.sql` một lần trong Supabase SQL Editor.
  Đổi hình thì tăng `IMG_VERSION` trong `chinese-data.js`.

## Học nhóm

Vào mục **Học nhóm** trên menu sau khi đăng nhập. Tên nội bộ vẫn là `classes`, `classState`,
`#classCard`, `#classContent`, bảng và hàm `class_*`, link mời `?join=MÃ`.

| Hành động | Người tạo nhóm | Quản trị viên | Người tham gia |
|---|---|---|---|
| Xem danh sách, vào nhóm, xem lịch sử bài | Có | Có | Có |
| Sửa tên, xoá nhóm, đổi vai trò, chuyển quyền chủ nhóm | Có | Không | Không |
| Duyệt, từ chối yêu cầu tham gia, đổi mã mời | Có | Có | Không |
| Mời khỏi nhóm | Mọi người trừ mình | Chỉ người tham gia | Không |
| Tạo, bắt đầu, kết thúc sớm, đổi mật khẩu, xoá bài | Có | Có | Không |
| Xem bảng kết quả, xuất CSV | Có | Có | Không |
| Làm bài | Không | Không | Có |
| Rời nhóm | Phải chuyển quyền trước | Có | Có |

Quyền được kiểm tra trong RPC ở server, giao diện chỉ ẩn/hiện nút.

Luồng chính:

- **Tham gia**: nhập mã hoặc mở link `?join=MÃ`, tài khoản chưa có Mã sinh viên thì phải nhập.
  Yêu cầu ở trạng thái `pending` tới khi được duyệt, mỗi tài khoản tối đa 5 yêu cầu đang chờ.
- **Bài kiểm tra**: tạo ở trạng thái `draft`, bắt buộc thời gian (1-300 phút) và mật khẩu (4-32
  ký tự, băm bcrypt trong `class_quiz_secrets`). Bấm Bắt đầu thì `running`, qua `end_at` hoặc bấm
  Kết thúc sớm thì `closed`. Mỗi nhóm chỉ có một bài đang mở.
- **Làm bài**: sai mật khẩu 5 lần trong 10 phút thì khoá 5 phút. Đáp án lưu lên server sau 1,5
  giây (`save_class_quiz_answers`). Tiếp tục làm không hỏi lại mật khẩu.
- **Chấm**: hàm nội bộ `finalize_class_quiz` chấm các lượt dở theo đáp án đã lưu khi bài kết thúc,
  gọi lười ở đầu `get_class_quizzes`, `get_class_quiz_results`, `end_class_quiz_session`, không cần
  pg_cron. Lượt này có `auto_submitted = true`, trên bảng ghi "tự nộp".
- **Tự cập nhật**: gọi lại server 10 giây một lần lúc xem danh sách hoặc trong nhóm, tab ẩn thì
  dừng, đang làm bài thì không gọi. Muốn tức thời thì thêm `class_quizzes` vào publication
  `supabase_realtime` và nghe `postgres_changes` lọc theo `class_id`.

Code nằm ở khối `HỌC NHÓM` trong `app.js`, `group.css`, mục 5 trong `schema.sql`. Thiết kế chi
tiết xem `CLASS_FEATURE_DESIGN.md`.

**Giới hạn đã biết:**

- Bảng `questions` đọc được bằng token người dùng vì ôn tập cá nhân cần, kể cả cột
  `correct_answer`. Người biết kỹ thuật có thể tra đáp án theo `question_id` trong lúc làm bài
  nhóm. Muốn chặn phải đổi luồng ôn tập cá nhân.
- Chưa có màn cho chủ nhóm xem chi tiết bài làm của từng người.
- Không có thông báo email, không giám sát chuyển tab.

## Báo cáo câu hỏi

Luồng: nút `#reportQuestionBtn` (chỉ hiện khi đang hiển thị một câu hỏi) -> hộp thoại chọn vấn đề
-> `supabase.functions.invoke('report-question')` -> Edge Function gọi RPC
`submit_question_report` bằng JWT của người dùng -> RPC kiểm tra, chống spam (15 báo cáo/giờ,
cùng một câu cách nhau 5 phút), lưu vào `question_reports` kèm ảnh chụp câu hỏi lấy từ DB ->
Edge Function dựng email theo mục (vấn đề, câu hỏi, phương án và đáp án, người báo cáo, gợi ý
SQL sửa nhanh) và gửi qua Cloudflare Worker `quiz-report-mail` (Email Routing, người gửi
`bao-cao@phamnghiatrong.com`). Brevo chỉ là dự phòng khi chưa đặt `REPORT_MAIL_SECRET`.

- DB: `migrations/2026-11-bao-cao-cau-hoi.sql` (đã có trong `schema.sql`).
- Secrets của Edge Function (Dashboard > Edge Functions > Secrets): `REPORT_MAIL_SECRET` (giống
  secret của Worker; tuỳ chọn `REPORT_MAIL_WORKER_URL`). Dự phòng: `BREVO_API_KEY`.
  Chưa đặt secret nào thì báo cáo vẫn lưu, cột `email_sent = false`, lý do ở `email_error`.
- Cài Worker: `cloudflare/report-mail-worker/README.md`.
- Xem báo cáo chưa xử lý: `select * from question_reports where status = 'new' order by created_at desc;`
  Xử lý xong: `update question_reports set status = 'resolved', resolved_at = now() where id = '...';`
- Mã loại vấn đề (`REPORT_CATEGORIES` trong `app.js`, `v_allowed` trong RPC, `CATEGORY_LABELS`
  trong Edge Function) phải khớp nhau ở cả 3 nơi.

## Ghi chú kỹ thuật

- **Cách tính điểm bảng xếp hạng**: đang cộng dồn số câu đúng của tất cả các lượt
  thi thử (`sum`). Muốn đổi sang "điểm cao nhất của một lượt" hoặc tính cả luyện tập,
  xem phần 3.4 trong `schema.sql` - đã ghi sẵn hướng dẫn.
- **Xếp hạng**: mỗi người một hạng riêng (`row_number`). Bằng điểm thì ai ít lượt thi
  hơn xếp trên. Project đang chạy cần chạy `migrations/2026-11-leaderboard-unique-rank.sql`.
- **Menu**: đầu `app.js` có `MENU_HIDDEN_SUBJECTS` (môn tạm ẩn khỏi menu) và
  `MENU_SUBJECT_ORDER` (thứ tự môn). Thêm môn mới trên Supabase thì menu tự cập nhật,
  môn chưa có trong danh sách thứ tự được xếp cuối.
- **Trang chủ**: chỉ có menu, video toàn màn hình và chân trang. Video nằm trong
  `public/hero/`: `hero-16x9.mp4` (1920x1080) kèm poster `hero-16x9.webp`, khai báo ở
  `HOME_HERO_SOURCES` đầu `app.js`. Hiện chỉ bản web có video; bản điện thoại
  (`HOME_HERO_MOBILE_QUERY`, mốc 768px) để trống nên hiện nền gradient. Người dùng bật tiết
  kiệm dữ liệu thì chỉ hiện poster (bật "giảm chuyển động" vẫn phát video, vì video chuyển
  động nhẹ và Windows hay bật sẵn chế độ này). Video là H.264, không âm thanh,
  faststart; service worker không cache video. Muốn thêm khối thì đặt vào `#homeContent`
  trong `index.html`, khung này nằm giữa video và chân trang và tự ẩn khi trống.
- **Một lớp khung**: mỗi trang chỉ có một lớp khung. `#dashboardSection` và khung nội dung
  của 3 module không phải là khung, thẻ bên trong mới là khung. Trong thẻ thì dùng đường
  kẻ hoặc vạch màu bên trái, không lồng thêm ô.
- **Tùy chỉnh**: lưu ở `localStorage` khóa `quizapp-settings-v1`. Đoạn script đầu
  `<head>` trong `index.html` áp dụng trước khi trang hiện để không bị nháy sáng/tối.
  Đổi màu thì sửa `theme.css`, cả khối sáng lẫn tối. CSS đã dùng `rem` cho `font-size`,
  CSS mới cũng phải dùng `rem` thì mới scale theo cỡ chữ.
- **Lịch sử làm bài**: `app.js` truy vấn `quiz_attempts` không kèm bộ lọc
  `user_id`, việc mỗi người chỉ thấy lịch sử của mình phụ thuộc hoàn toàn vào
  policy RLS. Đừng tắt RLS trên bảng này.
- **RLS liên bảng cho Học nhóm**: `classes` và `class_members` cần kiểm tra
  chéo lẫn nhau (ai là chủ nhóm / ai là thành viên). Nếu viết policy bằng
  subquery trực tiếp vào bảng kia sẽ bị Postgres báo lỗi "infinite recursion
  detected in policy". Cách khắc phục đã áp dụng: 2 hàm `is_class_owner()` /
  `is_class_member()` (SECURITY DEFINER) dùng trong policy thay vì subquery
  thô. Nếu sau này sửa policy 2 bảng này, giữ nguyên cách dùng hàm để tránh
  lỗi tái diễn.
- **Cache**: các file CSS và `app.js` được nạp kèm tham số `?v=...` trong
  `index.html`. Sau mỗi lần sửa, nhớ tăng số phiên bản này, nếu không trình duyệt
  cũ sẽ dùng lại bản cũ. Sửa file trong `tenses/`, `vocab/`, `chinese/` thì tăng
  `TENSES_MODULE_URL` / `VOCAB_MODULE_URL` / `VOCAB_MINI_URL` / `CHINESE_MODULE_URL`
  trong `app.js`. Đổi danh sách file của app thì sửa `APP_SHELL` và tăng `CACHE_NAME`
  trong `sw.js`.
- **Icon**: dùng chung `public/favicon.png` (512x512) cho mọi kích thước.
