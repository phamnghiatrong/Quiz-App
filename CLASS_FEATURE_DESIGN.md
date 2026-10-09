# Thiết kế Feature: Kiểm Tra Theo Lớp (Class-Based Quizzes)

## 1. Tổng quan Feature

### Mục đích
- Giáo viên/admin lớp tạo các bài kiểm tra cho cả lớp
- Học sinh làm bài trong lớp với điều kiện thống nhất (thời gian, câu hỏi, điều kiện)
- Theo dõi kết quả tập trung, so sánh hiệu suất học sinh
- Quản lý danh sách lớp và quyền truy cập

---

## 2. Yêu cầu Chi tiết

### 2.1 Quản lý Lớp (Class Management)

#### Tạo Lớp
- **Quyền**: Bất kỳ user nào (cả giáo viên lẫn học sinh)
- **Thông tin cơ bản**:
  - Tên lớp
  - Mô tả
  - Mã môn học (nếu có)
  - Ảnh đại diện lớp (optional)
  - Trạng thái: Hoạt động / Lưu trữ

#### Mã Lớp & QR Code
- **Mã tham gia**: Auto-generate 6-8 ký tự (VD: `ABC123`)
- **QR Code**: Tự động tạo từ link: `quiz-app.com/join/ABC123`
- **Link tham gia**: `https://quiz-app.com/join/ABC123`
- **Tùy chọn**:
  - Cho phép tự động tham gia (không cần duyệt)
  - Yêu cầu duyệt (admin phải accept)

#### Quản lý Thành viên
- **Danh sách**:
  - ID user
  - Tên hiển thị
  - Email
  - Số điện thoại (nếu có)
  - Vai trò: Admin / Thành viên
  - Ngày tham gia
  - Trạng thái: Hoạt động / Rời khỏi
  
- **Chức năng Admin**:
  - Thêm thành viên (upload CSV hoặc thêm thủ công)
  - Xóa thành viên
  - Thay đổi vai trò (member → admin, admin → member)
  - Gửi thư mời
  - Khóa/mở khóa tài khoản thành viên trong lớp
  - Export danh sách

### 2.2 Kiểm Tra Lớp (Class Quizzes)

#### Tạo Kiểm Tra
- **Thông tin**:
  - Tên bài kiểm tra
  - Mô tả
  - Môn học
  - Bài/phần (nếu có)
  - Loại kiểm tra:
    - **Open quiz**: Mở cửa cho tất cả từ lúc tạo
    - **Scheduled**: Mở cửa vào thời điểm cụ thể
    - **Closed quiz**: Chỉ dành cho những ai được mời

#### Cấu hình Kiểm Tra
- **Câu hỏi**:
  - Số lượng câu (fixed hoặc random từ bank)
  - Loại câu (trắc nghiệm, đúng/sai, tự luận - future)
  - Thứ tự: Fixed / Random
  - Hiển thị kết quả: Ngay / Sau khi kết thúc / Sau khi giáo viên release

- **Thời gian**:
  - Ngày bắt đầu & kết thúc
  - Giờ bắt đầu & kết thúc (để hạn chế gian lận)
  - Thời lượng làm bài (phút):
    - Bỏ qua = vô hạn
    - Fixed = giới hạn cứng (tự động submit sau hết giờ)
  - Cho phép làm lại: Có / Không / Số lần

- **Điều kiện**:
  - Bắt buộc tham gia: Có / Không
  - Bắt buộc hoàn thành: Có / Không
  - Cho phép xem lại: Có / Không
  - Cho phép copy: Có / Không (chống gian lận)

- **Điểm**:
  - Cách tính: Từng câu đúng +1 / Custom weight
  - Điểm tối đa
  - Passing grade (%) nếu có

#### Quản lý Kiểm Tra (Danh sách từ giao diện Admin)
- Tạo kiểm tra mới
- Chỉnh sửa kiểm tra (trước khi có người làm)
- Xóa kiểm tra (nếu chưa ai làm)
- Publish / Unpublish
- Sao chép kiểm tra
- Xem thống kê real-time:
  - Số người đã làm / Tổng số
  - Điểm trung bình
  - Cao nhất / Thấp nhất

### 2.3 Kết Quả & Tính Điểm

#### Bảng Tổng Kết (Scoreboard)
**Hiển thị cho Admin (giao diện chuyên):
- Bảng xếp hạng:
  - Tên học sinh
  - Điểm số (tuyệt đối + %)
  - Trạng thái: Hoàn thành / Đang làm / Chưa làm
  - Thời gian hoàn thành
  - Chi tiết bài làm

**Hiển thị cho Học sinh**:
- Điểm của mình
- Xếp hạng trong lớp (nếu admin cho phép)
- Feedback từ admin (nếu có)

#### Phân tích Kết quả (Analytics)
- **Thống kê chung**:
  - Điểm trung bình lớp
  - Tỷ lệ pass/fail
  - Câu hỏi khó nhất (% làm đúng thấp nhất)
  - Câu hỏi dễ nhất (% làm đúng cao nhất)

- **Phân tích từng câu**:
  - % học sinh làm đúng
  - Các lựa chọn phổ biến
  - Phân loại: Dễ / Trung bình / Khó

- **Export dữ liệu**:
  - Excel (tên, điểm, thời gian)
  - PDF report

### 2.4 Quyền Truy Cập (Permissions)

| Hành động | Admin | Thành viên |
|-----------|-------|-----------|
| Tạo lớp | ✅ | ✅ |
| Mời/Thêm thành viên | ✅ | ❌ |
| Xóa thành viên | ✅ | ❌ |
| Tạo kiểm tra | ✅ | ❌ |
| Làm kiểm tra | ❌* | ✅ |
| Xem kết quả của người khác | ✅ | ❌ |
| Xem kết quả của mình | ✅ | ✅ |
| Chỉnh sửa kiểm tra | ✅ | ❌ |
| Xem analytics | ✅ | ❌ |
| Rời khỏi lớp | ✅ | ✅ |

*Admin có thể làm bài nếu muốn (để test), nhưng điểm không tính

---

## 3. Thiếu Sót & Cải Tiến Đề Xuất

### 3.1 Security & Gian Lận
- [ ] Hạn chế IP: Nếu IP khác → cảnh báo/block
- [ ] Hạn chế thiết bị: Chỉ làm từ 1 thiết bị
- [ ] Phát hiện gian lận:
  - Thời gian hoàn thành bất thường (quá nhanh)
  - Tab switching (nếu dùng `visibilitychange` event)
  - Right-click / Inspect element (block)
- [ ] Proctoring (tương lai): Yêu cầu camera/mic

### 3.2 Communication
- [ ] Thông báo:
  - Email khi có kiểm tra mới
  - In-app notification
  - SMS (optional)
- [ ] Tin nhắn lớp: Admin gửi thông báo cho lớp
- [ ] Q&A: Học sinh hỏi, admin trả lời (trong kiểm tra)

### 3.3 Feedback & Marks
- [ ] Comment từng câu: Admin ghi ghi chú cho từng câu
- [ ] Overall comment: Feedback chung cho bài
- [ ] Rubric scoring (tương lai): Nếu có tự luận

### 3.4 Lịch sử & Lưu trữ
- [ ] Xem tất cả lần làm bài: `attempt_1, attempt_2, ...`
- [ ] Lưu trữ lớp: Sau học kỳ, lớp có thể lưu trữ
- [ ] Export dữ liệu lớp: Backup toàn bộ dữ liệu lớp

### 3.5 Tùy chỉnh Nâng cao
- [ ] Branching/Adaptive quiz: Câu tiếp theo dựa trên câu trước
- [ ] Time limits per question: Giới hạn thời gian từng câu
- [ ] Question bank: Thư viện câu hỏi dùng chung
- [ ] Template kiểm tra: Tạo sẵn các template tiêu chuẩn

### 3.6 Mobile Optimization
- [ ] Progressive Web App (PWA): Làm bài offline
- [ ] Native mobile app (tương lai)

---

## 4. Database Schema (Supabase PostgreSQL)

### 4.1 Tables

```sql
-- Bảng lớp
CREATE TABLE classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  subject_slug TEXT,
  class_code VARCHAR(8) UNIQUE NOT NULL,
  qr_code TEXT,
  status VARCHAR(20) DEFAULT 'active', -- active, archived
  allow_auto_join BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Bảng thành viên lớp
CREATE TABLE class_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid REFERENCES classes NOT NULL,
  user_id uuid REFERENCES auth.users NOT NULL,
  role VARCHAR(20) DEFAULT 'member', -- admin, member
  joined_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'active', -- active, left, blocked
  UNIQUE(class_id, user_id)
);

-- Bảng kiểm tra lớp
CREATE TABLE class_quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid REFERENCES classes NOT NULL,
  created_by uuid REFERENCES auth.users NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  subject_slug TEXT,
  lesson_slug TEXT,
  quiz_type VARCHAR(20) DEFAULT 'standard', -- standard, adaptive (future)
  
  -- Cấu hình
  question_count INT,
  time_limit_minutes INT, -- NULL = unlimited
  allow_retake BOOLEAN DEFAULT FALSE,
  retake_count INT,
  shuffle_questions BOOLEAN DEFAULT FALSE,
  shuffle_options BOOLEAN DEFAULT FALSE,
  
  -- Thời gian
  start_at TIMESTAMP,
  end_at TIMESTAMP,
  
  -- Hiển thị kết quả
  show_results VARCHAR(30) DEFAULT 'after_submit', -- immediate, after_submit, after_deadline, manual
  show_explanation BOOLEAN DEFAULT TRUE,
  allow_review BOOLEAN DEFAULT TRUE,
  
  -- Điểm
  passing_grade_percent INT,
  
  -- Điều kiện
  mandatory BOOLEAN DEFAULT FALSE,
  
  status VARCHAR(20) DEFAULT 'draft', -- draft, published, closed
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Bảng câu hỏi trong kiểm tra (liên kết với questions table cũ)
CREATE TABLE class_quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_quiz_id uuid REFERENCES class_quizzes NOT NULL,
  question_id uuid REFERENCES questions NOT NULL,
  question_order INT,
  points INT DEFAULT 1,
  UNIQUE(class_quiz_id, question_id)
);

-- Bảng bài làm của học sinh
CREATE TABLE class_quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_quiz_id uuid REFERENCES class_quizzes NOT NULL,
  user_id uuid REFERENCES auth.users NOT NULL,
  attempt_number INT DEFAULT 1,
  
  started_at TIMESTAMP DEFAULT NOW(),
  submitted_at TIMESTAMP,
  
  total_score INT,
  max_score INT,
  percentage DECIMAL(5,2),
  passed BOOLEAN,
  
  ip_address INET,
  device_info TEXT,
  
  status VARCHAR(20) DEFAULT 'in_progress', -- in_progress, submitted, graded
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(class_quiz_id, user_id, attempt_number)
);

-- Bảng câu trả lời chi tiết
CREATE TABLE class_quiz_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid REFERENCES class_quiz_attempts NOT NULL,
  question_id uuid REFERENCES questions NOT NULL,
  selected_option_id uuid, -- NULL nếu để trống
  is_correct BOOLEAN,
  points_earned INT DEFAULT 0,
  time_spent_seconds INT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Bảng ghi chú/feedback từ admin
CREATE TABLE class_quiz_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid REFERENCES class_quiz_attempts NOT NULL,
  admin_id uuid REFERENCES auth.users NOT NULL,
  comment_text TEXT,
  admin_score INT, -- Nếu override điểm
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Bảng lịch sử tham gia
CREATE TABLE class_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid REFERENCES classes NOT NULL,
  user_id uuid REFERENCES auth.users NOT NULL,
  action VARCHAR(50), -- joined, left, created_quiz, submitted_quiz
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 4.2 RLS Policies

```sql
-- Classes: User có thể xem lớp họ tham gia hoặc sở hữu
CREATE POLICY classes_select ON classes FOR SELECT
  USING (
    owner_id = auth.uid()
    OR id IN (SELECT class_id FROM class_members WHERE user_id = auth.uid())
  );

-- Class Members: Chỉ admin + user có thể xem danh sách
CREATE POLICY class_members_select ON class_members FOR SELECT
  USING (
    class_id IN (
      SELECT id FROM classes WHERE owner_id = auth.uid()
    )
    OR user_id = auth.uid()
  );

-- Class Quizzes: Chỉ những ai tham gia lớp mới xem
CREATE POLICY class_quizzes_select ON class_quizzes FOR SELECT
  USING (
    class_id IN (
      SELECT id FROM classes 
      WHERE owner_id = auth.uid() 
        OR id IN (SELECT class_id FROM class_members WHERE user_id = auth.uid())
    )
  );

-- Class Quiz Attempts: User chỉ xem bài của mình, admin xem tất cả
CREATE POLICY class_quiz_attempts_select ON class_quiz_attempts FOR SELECT
  USING (
    user_id = auth.uid()
    OR class_quiz_id IN (
      SELECT id FROM class_quizzes 
      WHERE class_id IN (SELECT id FROM classes WHERE owner_id = auth.uid())
    )
  );
```

---

## 5. Giao Diện (UI/UX)

### 5.1 Workflow Admin (Giáo viên)

**Trang Lớp:**
```
┌─ Lớp của tôi
│  ├─ [+] Tạo lớp mới
│  ├─ Lớp 10A (30 thành viên)
│  │  ├─ Quản lý thành viên
│  │  ├─ Tạo kiểm tra
│  │  ├─ Kiểm tra (5 bài)
│  │  │  ├─ [Bài 1] - 25/30 hoàn thành - Điểm TB: 7.2/10
│  │  │  ├─ [Bài 2] - 28/30 hoàn thành - Điểm TB: 8.5/10
│  │  └─ Tổng kết & Analytics
│  └─ Lớp 11B (28 thành viên)
│     └─ ...
```

**Tạo Kiểm Tra:**
```
┌─ Tạo Kiểm Tra
│  ├─ Thông tin cơ bản
│  │  ├─ Tên kiểm tra: [input]
│  │  ├─ Môn học: [select: Toán, Lý, ...]
│  │  └─ Bài/Phần: [input]
│  ├─ Câu hỏi
│  │  ├─ Số lượng: [input]
│  │  ├─ Thứ tự: [Cố định / Ngẫu nhiên]
│  │  └─ Chọn câu hỏi [+]
│  ├─ Cấu hình
│  │  ├─ Thời gian làm bài: [input] phút
│  │  ├─ Cho phép làm lại: [checkbox]
│  │  ├─ Hiển thị kết quả: [select]
│  │  └─ Bắt buộc hoàn thành: [checkbox]
│  ├─ Lịch
│  │  ├─ Ngày bắt đầu: [datepicker]
│  │  └─ Ngày kết thúc: [datepicker]
│  └─ [Save] [Publish]
```

**Xem Kết Quả:**
```
┌─ Kết Quả - Bài 1
│  ├─ Tổng kết (Card)
│  │  ├─ Điểm TB: 7.2/10
│  │  ├─ Tỷ lệ Pass: 80%
│  │  ├─ Cao nhất: 10/10 (Nguyễn A)
│  │  └─ Thấp nhất: 3/10 (Trần C)
│  ├─ Phân tích câu hỏi
│  │  ├─ Câu 1: 90% đúng (Dễ)
│  │  ├─ Câu 2: 40% đúng (Khó)
│  │  └─ Câu 3: 60% đúng (Trung bình)
│  ├─ Bảng xếp hạng
│  │  ├─ Nguyễn A - 10/10 - Hoàn thành
│  │  ├─ Lê B - 8/10 - Hoàn thành
│  │  ├─ Trần C - 3/10 - Hoàn thành
│  │  └─ Phạm D - - - Chưa làm
│  └─ [Export Excel] [In]
```

### 5.2 Workflow Học sinh

**Trang Lớp:**
```
┌─ Lớp của tôi
│  ├─ Lớp 10A
│  │  ├─ Thành viên (30)
│  │  ├─ Kiểm tra sắp tới
│  │  │  ├─ [🔔] Bài 1 - Mở từ hôm nay 8h - [Làm bài]
│  │  │  └─ Bài 2 - Mở 15/9 - Locked
│  │  └─ Lịch sử làm bài
│  │     ├─ Bài 1 - 8/10 - Completed
│  │     └─ Bài 2 - 9/10 - Completed
│  └─ [Tham gia lớp mới]
```

**Làm Bài:**
```
┌─ Bài 1 - Toán
│  ├─ [Timer: 15:32] [Progress: 5/20]
│  ├─ Câu 1: ... (radio buttons)
│  ├─ Câu 2: ... (radio buttons)
│  └─ [Trước] [Tiếp] [Submit]
```

**Xem Kết Quả:**
```
┌─ Kết Quả - Bài 1
│  ├─ Điểm của bạn: 8/10 (80%)
│  ├─ Xếp hạng: 5/30
│  ├─ Thời gian: 12 phút 30 giây
│  ├─ Chi tiết
│  │  ├─ Câu 1: ✅ Đúng (Giải thích: ...)
│  │  ├─ Câu 2: ❌ Sai (Đúng là B, bạn chọn C)
│  │  └─ ...
│  └─ Feedback từ thầy: "Chúc mừng! Bạn làm tốt."
```

---

## 6. Tech Stack Đề Xuất

### Backend (Supabase)
- PostgreSQL (schema như trên)
- RLS policies (security)
- Real-time subscriptions (update kết quả live)
- Edge Functions (tính điểm, gửi email)

### Frontend (JavaScript/React)
- Giao diện Admin: Bảng điều khiển, form tạo quiz, analytics
- Giao diện Quiz: Full-screen quiz, timer, progress
- Charts: Chart.js / Plotly (hiển thị thống kê)
- QR Generator: `qrcode.js` library

### Email & Notification
- SendGrid / Resend (email mời)
- In-app notifications (WebSocket / Supabase Realtime)

---

## 7. Roadmap Implementation

### Phase 1 (MVP - 2 tuần)
- [ ] Tạo/Quản lý lớp
- [ ] Mời thành viên (link + manual)
- [ ] Tạo kiểm tra từ câu hỏi có sẵn
- [ ] Làm bài & tính điểm tự động
- [ ] Bảng xếp hạng đơn giản

### Phase 2 (1 tuần)
- [ ] QR code tham gia
- [ ] Feedback admin cho bài làm
- [ ] Analytics cơ bản (% đúng từng câu)
- [ ] Export Excel
- [ ] Email notifications

### Phase 3 (2 tuần)
- [ ] Gian lận detection (IP, device, time)
- [ ] Branching/Adaptive quiz
- [ ] Lưu trữ lớp
- [ ] Mobile optimization
- [ ] Messaging trong lớp

### Phase 4 (Tương lai)
- [ ] Tự luận + rubric scoring
- [ ] Proctoring (camera)
- [ ] Mobile app native
- [ ] LMS integration (Google Classroom)

---

## 8. Security Considerations

- [ ] SQL Injection: Dùng Supabase parameterized queries
- [ ] XSS: Sanitize user input, escape HTML
- [ ] Rate limiting: Limit quiz submissions (prevent brute force)
- [ ] HTTPS only: Encrypt quiz data in transit
- [ ] Data privacy: GDPR compliance cho EU users
- [ ] Audit log: Ghi lại tất cả hành động

---

## 9. Testing Strategy

- [ ] Unit tests: Tính điểm, logic phân quyền
- [ ] Integration tests: Tạo lớp → tạo quiz → làm bài → tính điểm
- [ ] E2E tests: User flow hoàn chỉnh
- [ ] Load testing: Nhiều user làm bài cùng lúc
- [ ] Security testing: Bypass checks, SQL injection, XSS

---

## 10. Metrics & Monitoring

- [ ] Engagement: % học sinh tham gia, % hoàn thành
- [ ] Performance: Điểm TB, tỷ lệ pass
- [ ] System: Response time, error rate, uptime
- [ ] User feedback: Rating, bugs reported

---

## Tóm tắt Thiếu Sót

1. **Security**: Cần anti-cheating measures
2. **Communication**: Email/notification thông báo
3. **Analytics**: Dashboard thống kê chi tiết
4. **Feedback**: Comment từ admin cho học sinh
5. **Mobile**: PWA hoặc native app
6. **Scalability**: Xử lý khi có nhiều lớp/quiz
7. **Accessibility**: WCAG compliance
8. **Performance**: Optimization cho slow network

---

**Bước tiếp theo**: Bạn muốn bắt đầu với Phase 1 (MVP) không? Tôi có thể giúp thiết kế database + API endpoints chi tiết.
