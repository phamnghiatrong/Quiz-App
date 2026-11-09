-- =============================================================================
-- Quiz App - Schema Supabase (file DUY NHẤT, thay cho:
--   backup/supabase.sql + fix_leaderboard.sql + fix_leaderboard_total_score.sql)
--
-- Cách dùng: dán toàn bộ file này vào Supabase SQL Editor rồi Run.
-- An toàn: script chạy được nhiều lần, KHÔNG xoá bảng và KHÔNG xoá dữ liệu.
--   - create table if not exists  -> bảng đã có thì bỏ qua
--   - add column if not exists    -> cột đã có thì bỏ qua
--   - drop policy / drop function -> chỉ thay định nghĩa, không đụng dữ liệu
-- =============================================================================


-- =============================================================================
-- 1. BẢNG
-- =============================================================================

-- 1.1 Môn học ----------------------------------------------------------------
create table if not exists public.subjects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  created_at  timestamptz not null default now()
);

-- 1.2 Ngân hàng câu hỏi ------------------------------------------------------
create table if not exists public.questions (
  id              uuid primary key default gen_random_uuid(),
  question_text   text not null,
  option_a        text not null,
  option_b        text not null,
  option_c        text not null,
  option_d        text not null,
  correct_answer  text not null check (correct_answer in ('A','B','C','D')),
  lesson          text,
  level           text,
  created_at      timestamptz not null default now()
);

-- Các cột được thêm ở những lần nâng cấp sau (app.js có dùng):
alter table public.questions add column if not exists explanation  text;
alter table public.questions add column if not exists subject_slug text;

-- 1.3 Hồ sơ người dùng (tên hiển thị cho bảng xếp hạng) ----------------------
create table if not exists public.profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  full_name   text,
  created_at  timestamptz not null default now()
);

alter table public.profiles add column if not exists full_name  text;
alter table public.profiles add column if not exists email      text;
alter table public.profiles add column if not exists updated_at timestamptz default now();

-- app.js upsert với onConflict: 'user_id' -> bắt buộc user_id phải UNIQUE
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and contype = 'u'
      and conkey = array[(select attnum from pg_attribute
                          where attrelid = 'public.profiles'::regclass
                            and attname = 'user_id')]
  ) then
    alter table public.profiles add constraint profiles_user_id_key unique (user_id);
  end if;
end $$;

-- 1.4 Lịch sử làm bài --------------------------------------------------------
create table if not exists public.quiz_attempts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  mode              text not null,
  total_questions   integer not null,
  correct_count     integer not null,
  wrong_count       integer not null,
  score_percent     numeric not null,
  duration_seconds  integer not null,
  created_at        timestamptz not null default now()
);

alter table public.quiz_attempts add column if not exists score_points integer;
alter table public.quiz_attempts add column if not exists subject_slug text;
alter table public.quiz_attempts add column if not exists subject_id   text;

-- 1.5 Index cho truy vấn hay dùng -------------------------------------------
create index if not exists quiz_attempts_user_id_idx      on public.quiz_attempts (user_id);
create index if not exists quiz_attempts_subject_slug_idx on public.quiz_attempts (subject_slug);
create index if not exists quiz_attempts_created_at_idx   on public.quiz_attempts (created_at desc);
create index if not exists questions_subject_lesson_idx   on public.questions (subject_slug, lesson);


-- =============================================================================
-- 2. ROW LEVEL SECURITY
--    Lưu ý: app.js gọi .from('quiz_attempts').select('*') KHÔNG kèm bộ lọc
--    user_id -> việc "chỉ thấy lịch sử của mình" hoàn toàn dựa vào policy dưới.
-- =============================================================================

alter table public.subjects      enable row level security;
alter table public.questions     enable row level security;
alter table public.profiles      enable row level security;
alter table public.quiz_attempts enable row level security;

-- 2.1 subjects: ai cũng đọc được (màn hình chọn môn hiện trước khi đăng nhập)
drop policy if exists "subjects_select_all" on public.subjects;
create policy "subjects_select_all"
  on public.subjects for select
  to anon, authenticated
  using (true);

-- 2.2 questions: chỉ người đã đăng nhập mới đọc được
--     (chặn khách vãng lai tải nguyên ngân hàng câu hỏi kèm đáp án)
drop policy if exists "Authenticated users can read questions" on public.questions;
drop policy if exists "questions_select_authenticated" on public.questions;
create policy "questions_select_authenticated"
  on public.questions for select
  to authenticated
  using (true);

-- 2.3 profiles: mỗi người chỉ đọc/ghi hồ sơ của chính mình
--     (bảng xếp hạng lấy tên qua RPC security definer nên không cần mở rộng)
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2.4 quiz_attempts: mỗi người chỉ đọc/ghi lịch sử của chính mình
--
-- Dọn các policy kiểu cũ bị trùng và policy UPDATE.
-- App chỉ INSERT vào quiz_attempts, KHÔNG bao giờ UPDATE. Nếu vẫn mở quyền
-- UPDATE thì người dùng có thể tự sửa correct_count của mình để leo hạng.
drop policy if exists "Users can read their attempts"       on public.quiz_attempts;
drop policy if exists "Users can insert their attempts"     on public.quiz_attempts;
drop policy if exists "Users can read their own attempts"   on public.quiz_attempts;
drop policy if exists "Users can insert their own attempts" on public.quiz_attempts;
drop policy if exists "Users can update their own attempts" on public.quiz_attempts;
drop policy if exists "quiz_attempts_update_own"            on public.quiz_attempts;

drop policy if exists "quiz_attempts_select_own" on public.quiz_attempts;
create policy "quiz_attempts_select_own"
  on public.quiz_attempts for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "quiz_attempts_insert_own" on public.quiz_attempts;
create policy "quiz_attempts_insert_own"
  on public.quiz_attempts for insert
  to authenticated
  with check (auth.uid() = user_id);


-- =============================================================================
-- 3. RPC
--    Dùng drop + create (thay vì create or replace) để đổi được kiểu trả về.
-- =============================================================================

-- 3.1 Danh sách môn học ------------------------------------------------------
-- Trả id dạng text để chạy đúng dù cột subjects.id là uuid hay integer.
-- app.js chỉ gửi subject_id khi giá trị này là UUID hợp lệ (hàm isValidUuid).
drop function if exists public.get_subjects();
create function public.get_subjects()
returns table (id text, name text, slug text)
language sql
stable
set search_path = public
as $$
  select s.id::text, s.name, s.slug
  from public.subjects s
  order by s.name;
$$;

-- 3.2 Danh sách bài / phần của một môn ---------------------------------------
drop function if exists public.get_lessons();
drop function if exists public.get_lessons(text);
create function public.get_lessons(p_subject_slug text default null)
returns table (lesson text, question_count bigint)
language sql
stable
set search_path = public
as $$
  select q.lesson, count(*)::bigint as question_count
  from public.questions q
  where q.lesson is not null
    and length(trim(q.lesson)) > 0
    and (p_subject_slug is null or trim(p_subject_slug) = '' or q.subject_slug = p_subject_slug)
  group by q.lesson
  order by q.lesson;
$$;

-- 3.3 Lấy câu hỏi ngẫu nhiên theo môn + bài ----------------------------------
-- QUAN TRỌNG: có trả về cột explanation, nếu thiếu thì phần "Giải thích"
-- trong app.js sẽ không bao giờ hiện ra.
-- Xoá các overload cũ trùng tên tham số: nếu tồn tại nhiều hàm cùng bộ tên
-- {p_limit, p_lesson, p_subject_slug} thì PostgREST báo lỗi PGRST203 vì không
-- chọn được hàm nào.
drop function if exists public.get_random_questions_by_lesson(text, integer, text);
drop function if exists public.get_random_questions_by_lesson(integer, text);
drop function if exists public.get_random_questions(integer);
drop function if exists public.get_random_questions(integer, text);

drop function if exists public.get_random_questions_by_lesson(integer, text, text);
create function public.get_random_questions_by_lesson(
  p_limit        integer,
  p_lesson       text default null,
  p_subject_slug text default null
)
returns table (
  id              uuid,
  question_text   text,
  option_a        text,
  option_b        text,
  option_c        text,
  option_d        text,
  correct_answer  text,
  explanation     text,
  lesson          text,
  level           text,
  created_at      timestamptz
)
language sql
stable
set search_path = public
as $$
  select q.id, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d,
         q.correct_answer, q.explanation, q.lesson, q.level, q.created_at
  from public.questions q
  where (p_lesson is null or p_lesson = 'all' or q.lesson = p_lesson)
    and (p_subject_slug is null or trim(p_subject_slug) = '' or q.subject_slug = p_subject_slug)
  order by random()
  limit greatest(1, coalesce(p_limit, 30));
$$;

-- 3.4 Bảng xếp hạng ----------------------------------------------------------
-- security definer để đọc được quiz_attempts của mọi người dù bảng có RLS.
--
-- CÁCH TÍNH ĐIỂM: cộng dồn (SUM) số câu đúng của tất cả các lượt THI THỬ,
-- tính riêng cho từng môn. Bài luyện tập và bài "làm lại câu sai" KHÔNG được
-- tính điểm, tránh việc cày điểm bằng cách luyện tập lặp lại.
-- App luôn gọi kèm p_subject_slug nên điểm hiển thị là điểm của riêng môn đó.
--
-- Muốn tính cả bài luyện tập: xoá dòng "and qa.mode in ('exam_30','exam_70')".
-- Muốn lấy điểm cao nhất của 1 lượt thay vì cộng dồn: đổi sum(...) thành
--     max(coalesce(qa.correct_count, 0))::bigint as best_score
--
-- XẾP HẠNG: mỗi người một hạng riêng, không đồng hạng. Bằng điểm thì ai ít lượt thi
-- hơn xếp trên, tiếp theo là ai có lượt thi cuối sớm hơn, cuối cùng theo tên.
drop function if exists public.get_leaderboard();
drop function if exists public.get_leaderboard(integer);
drop function if exists public.get_leaderboard(integer, text);
drop function if exists public.get_leaderboard(text, integer);
create function public.get_leaderboard(
  p_limit        integer default 50,
  p_subject_slug text default null
)
returns table (
  rank        bigint,
  user_id     uuid,
  full_name   text,
  best_score  bigint,
  attempts    bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with user_scores as (
    select
      qa.user_id,
      coalesce(
        nullif(trim(p.full_name), ''),
        nullif(split_part(u.email, '@', 1), ''),
        'Không tên'
      )::text as full_name,
      sum(coalesce(qa.correct_count, 0))::bigint as best_score,
      count(*)::bigint as attempts,
      max(qa.created_at) as latest_attempt
    from public.quiz_attempts qa
    left join public.profiles p on p.user_id = qa.user_id
    left join auth.users     u on u.id      = qa.user_id
    where (p_subject_slug is null or trim(p_subject_slug) = '' or qa.subject_slug = p_subject_slug)
      and qa.mode in (
            'exam_30', 'exam_70',
            -- 2 nhãn cũ: các lượt thi thử được lưu trước khi app dùng mã
            -- exam_30 / exam_70. Xoá 2 dòng này nếu không muốn tính lịch sử cũ.
            '30 câu / 20 phút', '70 câu / 60 phút'
          )
    group by qa.user_id, p.full_name, u.email
  ),
  ranked as (
    select
      row_number() over (
        order by best_score desc, attempts asc, latest_attempt asc, full_name asc
      )::bigint as rank,
      user_id, full_name, best_score, attempts, latest_attempt
    from user_scores
  )
  select r.rank, r.user_id, r.full_name, r.best_score, r.attempts
  from ranked r
  order by r.rank asc
  limit least(greatest(coalesce(p_limit, 50), 1), 50);
$$;

-- Đồng bộ score_points = correct_count (nếu cột này còn được dùng ở đâu đó)
update public.quiz_attempts
set score_points = coalesce(correct_count, 0)
where score_points is distinct from coalesce(correct_count, 0);


-- =============================================================================
-- 4. QUYỀN THỰC THI
-- =============================================================================

-- Postgres mặc định cấp EXECUTE cho PUBLIC, và Supabase còn có sẵn
-- ALTER DEFAULT PRIVILEGES cấp EXECUTE cho anon với mọi function mới tạo.
-- Vì vậy phải revoke cả hai rồi mới grant lại đúng vai trò cần thiết.
revoke execute on function public.get_subjects()                                     from public;
revoke execute on function public.get_lessons(text)                                  from public;
revoke execute on function public.get_random_questions_by_lesson(integer, text, text) from public, anon;
revoke execute on function public.get_leaderboard(integer, text)                     from public, anon;

-- 2 hàm đầu được gọi ở màn hình chọn môn, trước khi đăng nhập.
grant execute on function public.get_subjects()                                     to anon, authenticated;
grant execute on function public.get_lessons(text)                                  to anon, authenticated;
-- 2 hàm sau bắt buộc phải đăng nhập (get_leaderboard là SECURITY DEFINER,
-- nếu mở cho anon thì người lạ lấy được toàn bộ tên + điểm người dùng).
grant execute on function public.get_random_questions_by_lesson(integer, text, text) to authenticated;
grant execute on function public.get_leaderboard(integer, text)                     to authenticated;

-- Nếu project có sẵn trigger function thì không cần cho gọi qua REST API.
do $$
begin
  if to_regprocedure('public.handle_new_user()') is not null then
    execute 'revoke execute on function public.handle_new_user() from anon, authenticated';
  end if;
  if to_regprocedure('public.quiz_attempts_before_save()') is not null then
    execute 'revoke execute on function public.quiz_attempts_before_save() from anon, authenticated';
  end if;
end $$;

notify pgrst, 'reload schema';


-- =============================================================================
-- 5. HỌC NHÓM (trên giao diện gọi là "Học nhóm", tên bảng và hàm giữ tên cũ class_*)
--    Người tạo nhóm và quản trị viên mời thành viên bằng mã nhóm, duyệt yêu cầu tham
--    gia, tạo bài kiểm tra có mật khẩu từ ngân hàng câu hỏi, bấm Bắt đầu để mở bài.
--    Người tham gia làm bài, hệ thống tự chấm và tổng hợp kết quả tập trung.
--
--    Thiết kế bảo mật: các bảng dưới đây CHỈ có policy SELECT (đọc theo phạm vi
--    của mình), riêng 2 bảng mật khẩu không có policy nào. Toàn bộ thao tác ghi đều đi
--    qua RPC SECURITY DEFINER có kiểm tra quyền bên trong, ứng dụng không bao giờ
--    insert/update trực tiếp các bảng này qua REST.
--    Điểm và đáp án đúng KHÔNG lộ ra cho người tham gia trước khi bài kết thúc:
--    start_class_quiz_attempt() chỉ trả về nội dung câu hỏi, submit_class_quiz_attempt()
--    chỉ báo đã nộp, get_class_quiz_review() từ chối khi bài chưa kết thúc.
-- =============================================================================

-- 5.1 Bảng -------------------------------------------------------------------

create table if not exists public.classes (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  description  text,
  subject_slug text,
  class_code   text not null unique,
  status       text not null default 'active' check (status in ('active','archived')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.class_members (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'member' check (role in ('admin','member')),
  status     text not null default 'active' check (status in ('pending','active','left','removed')),
  joined_at  timestamptz not null default now(),
  unique (class_id, user_id)
);

create table if not exists public.class_quizzes (
  id                 uuid primary key default gen_random_uuid(),
  class_id           uuid not null references public.classes(id) on delete cascade,
  created_by         uuid not null references auth.users(id) on delete cascade,
  title              text not null,
  description        text,
  subject_slug       text,
  lesson             text,
  question_count     integer not null default 10,
  time_limit_minutes integer,
  max_attempts       integer not null default 1,
  start_at           timestamptz,
  end_at             timestamptz,
  status             text not null default 'draft' check (status in ('draft','running','closed')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.class_quiz_questions (
  id             uuid primary key default gen_random_uuid(),
  class_quiz_id  uuid not null references public.class_quizzes(id) on delete cascade,
  question_id    uuid not null references public.questions(id) on delete cascade,
  question_order integer not null,
  unique (class_quiz_id, question_id)
);

-- Lưu lại lượt làm bài. status='in_progress' cho tới khi nộp bài.
create table if not exists public.class_quiz_attempts (
  id             uuid primary key default gen_random_uuid(),
  class_quiz_id  uuid not null references public.class_quizzes(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  attempt_number integer not null default 1,
  status         text not null default 'in_progress' check (status in ('in_progress','submitted')),
  correct_count  integer,
  total_count    integer,
  percent        numeric,
  started_at     timestamptz not null default now(),
  submitted_at   timestamptz,
  timed_out      boolean not null default false, -- nộp sau hạn chót + ân hạn -> đáp án không tính
  unique (class_quiz_id, user_id, attempt_number)
);
-- DB cũ đã có bảng: thêm cột nếu thiếu.
alter table public.class_quiz_attempts add column if not exists timed_out boolean not null default false;

-- Lưu snapshot câu hỏi + đáp án tại thời điểm nộp bài (không phụ thuộc vào
-- việc ngân hàng câu hỏi bị sửa/xoá sau này -> kết quả cũ vẫn xem lại đúng).
create table if not exists public.class_quiz_answers (
  id              uuid primary key default gen_random_uuid(),
  attempt_id      uuid not null references public.class_quiz_attempts(id) on delete cascade,
  question_id     uuid not null,
  question_order  integer,
  question_text   text,
  option_a        text,
  option_b        text,
  option_c        text,
  option_d        text,
  correct_answer  text,
  explanation     text,
  selected_answer text,
  is_correct      boolean,
  created_at      timestamptz not null default now()
);

create index if not exists class_members_class_id_idx      on public.class_members (class_id);
create index if not exists class_members_user_id_idx       on public.class_members (user_id);
create index if not exists class_quizzes_class_id_idx      on public.class_quizzes (class_id);
create index if not exists class_quiz_questions_quiz_idx   on public.class_quiz_questions (class_quiz_id);
create index if not exists class_quiz_attempts_quiz_user_idx on public.class_quiz_attempts (class_quiz_id, user_id);
create index if not exists class_quiz_answers_attempt_idx  on public.class_quiz_answers (attempt_id);

-- 5.1b Hàm hỗ trợ cho RLS -------------------------------------------------------
-- classes và class_members cần kiểm tra chéo lẫn nhau (classes cần biết ai là
-- thành viên, class_members cần biết ai là chủ lớp). Nếu viết trực tiếp bằng
-- subquery vào bảng kia trong mệnh đề USING, Postgres sẽ báo lỗi "infinite
-- recursion detected in policy" vì 2 policy gọi vòng qua lại nhau. Cách khắc
-- phục chuẩn: bọc phần kiểm tra trong hàm SECURITY DEFINER - hàm chạy với
-- quyền của chủ hàm (bỏ qua RLS khi đọc bảng bên trong hàm) nên không còn bị
-- Postgres coi là một phần của cùng một vòng đánh giá policy.
-- CREATE OR REPLACE (không dùng drop+create): các policy bên dưới phụ thuộc
-- vào 2 hàm này, drop function sẽ báo lỗi "other objects depend on it" khi
-- chạy lại script lần 2 trở đi. Chữ ký (tham số/kiểu trả về) không đổi giữa
-- các lần cập nhật nên OR REPLACE là an toàn.
create or replace function public.is_class_owner(p_class_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.classes where id = p_class_id and owner_id = p_user_id
  );
$$;

create or replace function public.is_class_member(p_class_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.class_members
    where class_id = p_class_id and user_id = p_user_id and status = 'active'
  );
$$;

revoke execute on function public.is_class_owner(uuid, uuid)  from public, anon;
revoke execute on function public.is_class_member(uuid, uuid) from public, anon;
grant execute on function public.is_class_owner(uuid, uuid)  to authenticated;
grant execute on function public.is_class_member(uuid, uuid) to authenticated;

-- 5.2 Row Level Security -------------------------------------------------------

alter table public.classes              enable row level security;
alter table public.class_members        enable row level security;
alter table public.class_quizzes        enable row level security;
alter table public.class_quiz_questions enable row level security;
alter table public.class_quiz_attempts  enable row level security;
alter table public.class_quiz_answers   enable row level security;

drop policy if exists "classes_select_member" on public.classes;
create policy "classes_select_member"
  on public.classes for select
  to authenticated
  using (
    owner_id = auth.uid()
    or public.is_class_member(id, auth.uid())
  );

-- LƯU Ý: KHÔNG được tự tham chiếu bảng class_members bên trong policy của
-- chính nó (Postgres báo lỗi "infinite recursion detected in policy"). Vì
-- vậy policy này chỉ cho thấy dòng của chính mình hoặc (nếu là chủ lớp) toàn
-- bộ thành viên lớp mình sở hữu. Trường hợp admin không phải chủ lớp xem
-- danh sách thành viên đã có RPC get_class_members() (SECURITY DEFINER, tự
-- kiểm tra quyền, không bị giới hạn bởi policy này) lo liệu.
drop policy if exists "class_members_select_scope" on public.class_members;
create policy "class_members_select_scope"
  on public.class_members for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_class_owner(class_id, auth.uid())
  );

drop policy if exists "class_quizzes_select_member" on public.class_quizzes;
create policy "class_quizzes_select_member"
  on public.class_quizzes for select
  to authenticated
  using (
    class_id in (select class_id from public.class_members where user_id = auth.uid() and status = 'active')
  );

-- Học sinh KHÔNG được đọc trực tiếp bảng này (sẽ lộ đáp án đúng qua join
-- questions). Chỉ admin của lớp đọc được, học sinh lấy câu hỏi qua RPC.
drop policy if exists "class_quiz_questions_select_admin" on public.class_quiz_questions;
create policy "class_quiz_questions_select_admin"
  on public.class_quiz_questions for select
  to authenticated
  using (
    class_quiz_id in (
      select q.id from public.class_quizzes q
      join public.class_members m on m.class_id = q.class_id
      where m.user_id = auth.uid() and m.role = 'admin' and m.status = 'active'
    )
  );

-- Policy của class_quiz_attempts nằm ở mục 5.2b vì cần hàm class_quiz_is_closed().

drop policy if exists "class_quiz_answers_select_scope" on public.class_quiz_answers;
create policy "class_quiz_answers_select_scope"
  on public.class_quiz_answers for select
  to authenticated
  using (
    attempt_id in (select id from public.class_quiz_attempts where user_id = auth.uid())
    or attempt_id in (
      select a.id from public.class_quiz_attempts a
      join public.class_quizzes q on q.id = a.class_quiz_id
      join public.class_members m on m.class_id = q.class_id
      where m.user_id = auth.uid() and m.role = 'admin' and m.status = 'active'
    )
  );

-- 5.2b Nâng cấp cho Học nhóm (cùng nội dung migrations/2026-11-hoc-nhom.sql) -----------
create extension if not exists pgcrypto with schema extensions;

-- Mã sinh viên: 4-20 ký tự chữ/số, lưu in hoa, cho phép trống.
alter table public.profiles add column if not exists student_code text;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_student_code_format' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_student_code_format
      check (student_code is null or student_code ~ '^[A-Z0-9]{4,20}$');
  end if;
end $$;

-- Thành viên: thêm trạng thái chờ duyệt (pending) và đã bị mời ra (removed).
do $$
declare
  v_name text;
begin
  for v_name in
    select conname from pg_constraint
    where conrelid = 'public.class_members'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table public.class_members drop constraint %I', v_name);
  end loop;
end $$;
alter table public.class_members
  add constraint class_members_status_check
  check (status in ('pending', 'active', 'left', 'removed'));
alter table public.class_members add column if not exists requested_at timestamptz;
alter table public.class_members add column if not exists decided_by uuid references auth.users(id) on delete set null;
alter table public.class_members add column if not exists decided_at timestamptz;
create index if not exists class_members_pending_user_idx on public.class_members (user_id) where status = 'pending';

-- Bài kiểm tra: draft (chưa bắt đầu) -> running (đang diễn ra) -> closed (đã kết thúc).
-- Dòng 'published' cũ không có phiên bắt đầu/kết thúc nên coi như đã kết thúc.
do $$
declare
  v_name text;
begin
  for v_name in
    select conname from pg_constraint
    where conrelid = 'public.class_quizzes'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table public.class_quizzes drop constraint %I', v_name);
  end loop;
end $$;
update public.class_quizzes set status = 'closed' where status = 'published';
alter table public.class_quizzes
  add constraint class_quizzes_status_check
  check (status in ('draft', 'running', 'closed'));
alter table public.class_quizzes alter column status set default 'draft';

-- Mỗi nhóm tối đa 1 bài đang diễn ra.
create unique index if not exists class_quizzes_one_running_idx
  on public.class_quizzes (class_id) where status = 'running';

-- Mật khẩu bài kiểm tra để bảng riêng: class_quizzes có policy SELECT cho thành viên,
-- để chung thì người tham gia đọc được cả hash. RLS bật và không có policy nào nên chỉ
-- RPC đọc được.
create table if not exists public.class_quiz_secrets (
  class_quiz_id uuid primary key references public.class_quizzes(id) on delete cascade,
  password_hash text not null
);
alter table public.class_quiz_secrets enable row level security;
revoke all on public.class_quiz_secrets from public, anon, authenticated;

-- Đếm số lần nhập sai mật khẩu: sai 5 lần trong 10 phút thì khoá thử 5 phút.
create table if not exists public.class_quiz_password_failures (
  class_quiz_id   uuid not null references public.class_quizzes(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  fail_count      integer not null default 0,
  first_failed_at timestamptz,
  locked_until    timestamptz,
  primary key (class_quiz_id, user_id)
);
alter table public.class_quiz_password_failures enable row level security;
revoke all on public.class_quiz_password_failures from public, anon, authenticated;

-- Lượt làm bài: đáp án lưu tạm và cờ "server tự nộp".
alter table public.class_quiz_attempts add column if not exists draft_answers jsonb not null default '{}'::jsonb;
alter table public.class_quiz_attempts add column if not exists auto_submitted boolean not null default false;

-- Bài đã kết thúc chưa (dùng trong policy). Trạng thái hiệu lực: running mà đã quá end_at
-- thì coi như closed, không cần ai bấm và không cần pg_cron.
create or replace function public.class_quiz_effective_status(p_status text, p_end_at timestamptz)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p_status = 'running' and p_end_at is not null and now() > p_end_at then 'closed'
    else p_status
  end;
$$;

create or replace function public.class_quiz_is_closed(p_quiz_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select public.class_quiz_effective_status(q.status, q.end_at) = 'closed'
    from public.class_quizzes q where q.id = p_quiz_id
  ), false);
$$;

revoke execute on function public.class_quiz_effective_status(text, timestamptz) from public, anon;
revoke execute on function public.class_quiz_is_closed(uuid) from public, anon;
grant execute on function public.class_quiz_effective_status(text, timestamptz) to authenticated;
grant execute on function public.class_quiz_is_closed(uuid) to authenticated;

-- Điểm và đáp án chỉ hiện sau khi bài kết thúc, kể cả khi gọi thẳng REST. Trước đây chủ bài
-- làm đọc được correct_count của mình ngay sau khi nộp, và class_quiz_answers (có cột
-- correct_answer) cũng vậy. Policy của class_quiz_answers giữ nguyên vì nó lọc qua bảng
-- attempts, nên tự chịu luôn điều kiện này.
drop policy if exists "class_quiz_attempts_select_scope" on public.class_quiz_attempts;
create policy "class_quiz_attempts_select_scope"
  on public.class_quiz_attempts for select
  to authenticated
  using (
    public.class_quiz_is_closed(class_quiz_id)
    and (
      user_id = auth.uid()
      or class_quiz_id in (
        select q.id from public.class_quizzes q
        join public.class_members m on m.class_id = q.class_id
        where m.user_id = auth.uid() and m.role = 'admin' and m.status = 'active'
      )
    )
  );

-- 5.3 RPC và quyền thực thi (cùng nội dung migrations/2026-11-hoc-nhom.sql) -------------
-- Thông báo lỗi viết tiếng Việt. Hàm RETURNS TABLE có cột trùng tên cột bảng (user_id,
-- role, status...) phải qualify bằng alias, nếu không PL/pgSQL báo "ambiguous".

drop function if exists public.get_class_quiz_leaderboard(uuid);
drop function if exists public.create_class_quiz(uuid, text, text, text, text, integer, integer, integer, timestamptz, timestamptz);
drop function if exists public.create_class_quiz(uuid, text, text, text, text, integer, integer, integer, text);
drop function if exists public.start_class_quiz_attempt(uuid);
drop function if exists public.start_class_quiz_attempt(uuid, text);
drop function if exists public.submit_class_quiz_attempt(uuid, jsonb);
drop function if exists public.get_class_quizzes(uuid);
drop function if exists public.get_class_members(uuid);
drop function if exists public.get_class_detail(uuid);
drop function if exists public.get_class_quiz_review(uuid);
drop function if exists public.get_class_quiz_results(uuid);
drop function if exists public.get_my_groups();
drop function if exists public.get_join_requests(uuid);

-- ---------- Hàm nội bộ (không cấp quyền cho client) ---------------------------------

-- Vai trò của một người trong nhóm: owner / admin / member, null nếu không phải thành viên.
create or replace function public.class_role_of(p_class_id uuid, p_user_id uuid default auth.uid())
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when c.owner_id = p_user_id then 'owner'
    else (
      select m.role from public.class_members m
      where m.class_id = c.id and m.user_id = p_user_id and m.status = 'active'
    )
  end
  from public.classes c
  where c.id = p_class_id;
$$;

create or replace function public.normalize_student_code(p_code text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
begin
  if v_code !~ '^[A-Z0-9]{4,20}$' then
    raise exception 'Mã sinh viên gồm 4-20 ký tự chữ hoặc số, không dấu.';
  end if;
  return v_code;
end;
$$;

-- Lưu Mã sinh viên vào hồ sơ của người đang đăng nhập. Trên DB thật profiles.id không có
-- giá trị mặc định và là khoá ngoại tới auth.users, nên khi tạo hồ sơ mới phải tự gán id
-- (giống cách saveNewName() trong app.js đang làm). Có dòng cũ user_id rỗng thì bổ sung luôn.
create or replace function public.save_my_student_code(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := public.normalize_student_code(p_code);
begin
  update public.profiles pr
  set student_code = v_code, user_id = coalesce(pr.user_id, auth.uid())
  where pr.user_id = auth.uid() or pr.id = auth.uid();
  if not found then
    insert into public.profiles (id, user_id, student_code)
    values (auth.uid(), auth.uid(), v_code);
  end if;
  return v_code;
end;
$$;

-- Sinh mã nhóm 6 ký tự, hoa, không trùng.
create or replace function public.generate_class_code()
returns text
language plpgsql
set search_path = public
as $$
declare
  v_code text;
begin
  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.classes c where c.class_code = v_code);
  end loop;
  return v_code;
end;
$$;

-- Hạn nộp 1 lượt = sớm hơn giữa started_at + time_limit_minutes và end_at.
create or replace function public.class_attempt_deadline(
  p_started_at timestamptz, p_time_limit_minutes integer, p_end_at timestamptz
)
returns timestamptz
language sql
immutable
set search_path = public
as $$
  -- least() bỏ qua null; trả null khi không có giới hạn nào.
  select least(
    case when p_time_limit_minutes is not null and p_time_limit_minutes > 0
         then p_started_at + make_interval(mins => p_time_limit_minutes) end,
    p_end_at
  );
$$;

-- Chấm 1 lượt theo bảng đáp án {question_id: 'A'}. p_auto = true: server tự nộp thay người
-- làm (hết giờ, kết thúc sớm, nộp quá muộn). Khoá dòng để không chấm 2 lần.
create or replace function public.grade_class_attempt(
  p_attempt_id uuid, p_answers jsonb, p_auto boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt  public.class_quiz_attempts;
  v_quiz     public.class_quizzes;
  v_deadline timestamptz;
  v_correct  integer := 0;
  v_total    integer := 0;
  v_answers  jsonb := case when jsonb_typeof(p_answers) = 'object' then p_answers else '{}'::jsonb end;
begin
  select * into v_attempt from public.class_quiz_attempts a where a.id = p_attempt_id for update;
  if v_attempt.id is null or v_attempt.status <> 'in_progress' then
    return;
  end if;

  select * into v_quiz from public.class_quizzes q where q.id = v_attempt.class_quiz_id;
  v_deadline := public.class_attempt_deadline(v_attempt.started_at, v_quiz.time_limit_minutes, v_quiz.end_at);

  delete from public.class_quiz_answers qa where qa.attempt_id = p_attempt_id;

  insert into public.class_quiz_answers (
    attempt_id, question_id, question_order, question_text,
    option_a, option_b, option_c, option_d,
    correct_answer, explanation, selected_answer, is_correct
  )
  select
    p_attempt_id, cqq.question_id, cqq.question_order, q.question_text,
    q.option_a, q.option_b, q.option_c, q.option_d,
    q.correct_answer, q.explanation,
    sel.answer,
    (sel.answer is not null and sel.answer = q.correct_answer)
  from public.class_quiz_questions cqq
  join public.questions q on q.id = cqq.question_id
  cross join lateral (
    select case
      when upper(trim(coalesce(v_answers->>(cqq.question_id::text), ''))) in ('A', 'B', 'C', 'D')
      then upper(trim(v_answers->>(cqq.question_id::text)))
    end as answer
  ) sel
  where cqq.class_quiz_id = v_attempt.class_quiz_id;

  select count(*) filter (where qa.is_correct), count(*)
    into v_correct, v_total
  from public.class_quiz_answers qa
  where qa.attempt_id = p_attempt_id;

  update public.class_quiz_attempts a
  set status = 'submitted',
      submitted_at = case when p_auto then least(now(), coalesce(v_deadline, now())) else now() end,
      auto_submitted = p_auto,
      timed_out = p_auto,
      correct_count = v_correct,
      total_count = v_total,
      percent = case when v_total > 0 then round(v_correct::numeric / v_total * 100, 1) else 0 end
  where a.id = p_attempt_id;
end;
$$;

-- Bài đã kết thúc: đóng trạng thái và chấm mọi lượt đang dở theo đáp án đã lưu. Chấm lười:
-- được gọi khi có người xem danh sách bài / kết quả, không cần pg_cron.
create or replace function public.finalize_class_quiz(p_quiz_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quiz    public.class_quizzes;
  v_attempt record;
begin
  select * into v_quiz from public.class_quizzes q where q.id = p_quiz_id for update;
  if v_quiz.id is null then
    return;
  end if;
  if public.class_quiz_effective_status(v_quiz.status, v_quiz.end_at) <> 'closed' then
    return;
  end if;

  if v_quiz.status <> 'closed' then
    update public.class_quizzes q set status = 'closed', updated_at = now() where q.id = p_quiz_id;
  end if;

  for v_attempt in
    select a.id, a.draft_answers from public.class_quiz_attempts a
    where a.class_quiz_id = p_quiz_id and a.status = 'in_progress'
  loop
    perform public.grade_class_attempt(v_attempt.id, v_attempt.draft_answers, true);
  end loop;
end;
$$;

-- Chấm các bài đã hết giờ trong 1 nhóm. Kiểm tra trước khi khoá để nhiều người cùng tải
-- danh sách (polling 10 giây) không phải chờ nhau.
create or replace function public.finalize_due_class_quizzes(p_class_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  for v_id in
    select q.id from public.class_quizzes q
    where q.class_id = p_class_id
      and (
        (q.status = 'running' and q.end_at is not null and now() > q.end_at)
        or (q.status = 'closed' and exists (
          select 1 from public.class_quiz_attempts a
          where a.class_quiz_id = q.id and a.status = 'in_progress'
        ))
      )
  loop
    perform public.finalize_class_quiz(v_id);
  end loop;
end;
$$;

-- ---------- Nhóm ----------------------------------------------------------------------

drop function if exists public.create_class(text, text, text);
create function public.create_class(
  p_name text,
  p_description text default null,
  p_subject_slug text default null
)
returns public.classes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class public.classes;
  v_name  text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if auth.uid() is null then
    raise exception 'Bạn cần đăng nhập.';
  end if;
  if length(v_name) = 0 or length(v_name) > 80 then
    raise exception 'Tên nhóm phải có từ 1 đến 80 ký tự.';
  end if;

  insert into public.classes (owner_id, name, description, subject_slug, class_code)
  values (
    auth.uid(), v_name,
    nullif(trim(coalesce(p_description, '')), ''),
    nullif(trim(coalesce(p_subject_slug, '')), ''),
    public.generate_class_code()
  )
  returning * into v_class;

  insert into public.class_members (class_id, user_id, role, status)
  values (v_class.id, auth.uid(), 'admin', 'active');

  return v_class;
end;
$$;

-- Gửi yêu cầu tham gia. Người đã rời hoặc đã bị mời ra gửi lại thì tạo yêu cầu mới, chủ
-- nhóm quyết định. Trả jsonb để không có cột OUT trùng tên cột bảng.
drop function if exists public.request_join_group(text, text);
create function public.request_join_group(p_code text, p_student_code text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class    public.classes;
  v_existing public.class_members;
  v_saved    text;
begin
  if auth.uid() is null then
    raise exception 'Bạn cần đăng nhập.';
  end if;
  if p_code is null or length(trim(p_code)) = 0 then
    raise exception 'Vui lòng nhập mã nhóm.';
  end if;

  select * into v_class from public.classes c where c.class_code = upper(trim(p_code));
  if v_class.id is null or v_class.status = 'archived' then
    raise exception 'Không tìm thấy nhóm.';
  end if;

  select * into v_existing from public.class_members m
  where m.class_id = v_class.id and m.user_id = auth.uid()
  for update;

  if v_class.owner_id = auth.uid() or v_existing.status = 'active' then
    raise exception 'Bạn đã ở trong nhóm này.';
  end if;
  if v_existing.status = 'pending' then
    raise exception 'Bạn đã gửi yêu cầu, đang chờ duyệt.';
  end if;

  -- Mã sinh viên: có nhập thì cập nhật hồ sơ, không nhập thì hồ sơ phải có sẵn.
  if p_student_code is not null and length(trim(p_student_code)) > 0 then
    perform public.save_my_student_code(p_student_code);
  else
    select pr.student_code into v_saved from public.profiles pr where pr.user_id = auth.uid() or pr.id = auth.uid() limit 1;
    if v_saved is null then
      raise exception 'Vui lòng nhập Mã sinh viên.';
    end if;
  end if;

  -- Chống spam: khoá theo người dùng để 2 yêu cầu song song không vượt giới hạn.
  perform pg_advisory_xact_lock(hashtextextended('join:' || auth.uid()::text, 0));
  if (select count(*) from public.class_members m where m.user_id = auth.uid() and m.status = 'pending') >= 5 then
    raise exception 'Bạn đang có 5 yêu cầu chờ duyệt. Hãy chờ duyệt hoặc huỷ bớt rồi gửi lại.';
  end if;

  if v_existing.id is not null then
    update public.class_members m
    set status = 'pending', role = 'member', requested_at = now(), decided_by = null, decided_at = null
    where m.id = v_existing.id;
  else
    insert into public.class_members (class_id, user_id, role, status, requested_at)
    values (v_class.id, auth.uid(), 'member', 'pending', now());
  end if;

  return jsonb_build_object('class_id', v_class.id, 'name', v_class.name);
end;
$$;

-- Giữ hàm cũ cho bản app còn trong cache, nhưng giờ cũng chỉ tạo yêu cầu chờ duyệt.
drop function if exists public.join_class_by_code(text);
create function public.join_class_by_code(p_code text)
returns public.classes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class public.classes;
begin
  perform public.request_join_group(p_code, null);
  select * into v_class from public.classes c where c.class_code = upper(trim(p_code));
  return v_class;
end;
$$;

drop function if exists public.cancel_join_request(uuid);
create function public.cancel_join_request(p_class_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Bạn cần đăng nhập.';
  end if;
  delete from public.class_members m
  where m.class_id = p_class_id and m.user_id = auth.uid() and m.status = 'pending';
end;
$$;

create function public.get_join_requests(p_class_id uuid)
returns table (
  user_id      uuid,
  student_code text,
  full_name    text,
  email        text,
  requested_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(public.class_role_of(p_class_id), '') not in ('owner', 'admin') then
    raise exception 'Bạn không có quyền xem yêu cầu tham gia.';
  end if;

  return query
    select
      m.user_id, pr.student_code,
      coalesce(nullif(trim(pr.full_name), ''), nullif(split_part(u.email, '@', 1), ''), 'Không tên'),
      u.email::text,
      coalesce(m.requested_at, m.joined_at)
    from public.class_members m
    left join public.profiles pr on pr.user_id = m.user_id
    left join auth.users u on u.id = m.user_id
    where m.class_id = p_class_id and m.status = 'pending'
    order by coalesce(m.requested_at, m.joined_at) asc;
end;
$$;

-- Duyệt thì thành active, từ chối thì xoá dòng. Trả số yêu cầu đã xử lý.
drop function if exists public.respond_join_request(uuid, uuid[], boolean);
create function public.respond_join_request(p_class_id uuid, p_user_ids uuid[], p_approve boolean)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if coalesce(public.class_role_of(p_class_id), '') not in ('owner', 'admin') then
    raise exception 'Bạn không có quyền duyệt yêu cầu tham gia.';
  end if;

  if p_approve then
    update public.class_members m
    set status = 'active', joined_at = now(), decided_by = auth.uid(), decided_at = now()
    where m.class_id = p_class_id and m.status = 'pending' and m.user_id = any(p_user_ids);
  else
    delete from public.class_members m
    where m.class_id = p_class_id and m.status = 'pending' and m.user_id = any(p_user_ids);
  end if;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Rời nhóm. Chủ nhóm phải chuyển quyền trước.
drop function if exists public.leave_class(uuid);
create function public.leave_class(p_class_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Bạn cần đăng nhập.';
  end if;
  if exists (select 1 from public.classes c where c.id = p_class_id and c.owner_id = auth.uid()) then
    raise exception 'Người tạo nhóm phải chuyển quyền chủ nhóm trước khi rời nhóm.';
  end if;
  update public.class_members m set status = 'left'
  where m.class_id = p_class_id and m.user_id = auth.uid() and m.status = 'active';
end;
$$;

-- Danh sách nhóm của tôi, gồm cả nhóm đang chờ duyệt. Nhóm có bài đang mở lên đầu.
create function public.get_my_groups()
returns table (
  class_id         uuid,
  name             text,
  owner_name       text,
  my_role          text,
  my_status        text,
  member_count     bigint,
  pending_count    bigint,
  has_running_quiz boolean,
  running_end_at   timestamptz,
  server_now       timestamptz,
  class_code       text,
  subject_slug     text,
  created_at       timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id, c.name,
    coalesce(nullif(trim(po.full_name), ''), nullif(split_part(uo.email, '@', 1), ''), 'Không tên'),
    case when c.owner_id = auth.uid() then 'owner' else cm.role end,
    cm.status,
    (select count(*) from public.class_members m
      where m.class_id = c.id and m.status = 'active' and m.user_id <> c.owner_id)::bigint,
    case when cm.status = 'active' and (c.owner_id = auth.uid() or cm.role = 'admin')
      then (select count(*) from public.class_members m where m.class_id = c.id and m.status = 'pending')::bigint
      else 0::bigint end,
    cm.status = 'active' and exists (
      select 1 from public.class_quizzes q
      where q.class_id = c.id and public.class_quiz_effective_status(q.status, q.end_at) = 'running'
    ),
    -- Giờ đóng của bài đang mở và giờ server, để danh sách hiện "Còn mm:ss" đúng giờ server.
    case when cm.status = 'active' then (
      select min(q.end_at) from public.class_quizzes q
      where q.class_id = c.id and public.class_quiz_effective_status(q.status, q.end_at) = 'running'
    ) end,
    now(),
    -- Mã mời chỉ trả cho chủ nhóm và quản trị viên.
    case when cm.status = 'active' and (c.owner_id = auth.uid() or cm.role = 'admin') then c.class_code end,
    c.subject_slug,
    c.created_at
  from public.classes c
  join public.class_members cm
    on cm.class_id = c.id and cm.user_id = auth.uid() and cm.status in ('active', 'pending')
  left join public.profiles po on po.user_id = c.owner_id
  left join auth.users uo on uo.id = c.owner_id
  where c.status <> 'archived'
  order by 8 desc, c.created_at desc;
$$;

-- Hàm cũ, giữ cho bản app còn trong cache. Bản mới dùng get_my_groups().
drop function if exists public.get_my_classes();
create function public.get_my_classes()
returns table (
  class_id     uuid,
  name         text,
  description  text,
  subject_slug text,
  class_code   text,
  role         text,
  member_count bigint,
  quiz_count   bigint,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id, c.name, c.description, c.subject_slug, c.class_code, cm.role,
    (select count(*) from public.class_members m where m.class_id = c.id and m.status = 'active')::bigint,
    (select count(*) from public.class_quizzes q where q.class_id = c.id)::bigint,
    c.created_at
  from public.classes c
  join public.class_members cm on cm.class_id = c.id and cm.user_id = auth.uid() and cm.status = 'active'
  where c.status <> 'archived'
  order by c.created_at desc;
$$;

-- Chi tiết 1 nhóm. my_role: owner / admin / member. Người đang chờ duyệt không vào được.
create function public.get_class_detail(p_class_id uuid)
returns table (
  class_id      uuid,
  name          text,
  description   text,
  subject_slug  text,
  class_code    text,
  owner_id      uuid,
  my_role       text,
  member_count  bigint,
  pending_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id, c.name, c.description, c.subject_slug,
    case when c.owner_id = auth.uid() or cm.role = 'admin' then c.class_code end,
    c.owner_id,
    case when c.owner_id = auth.uid() then 'owner' else cm.role end,
    (select count(*) from public.class_members m
      where m.class_id = c.id and m.status = 'active' and m.user_id <> c.owner_id)::bigint,
    case when c.owner_id = auth.uid() or cm.role = 'admin'
      then (select count(*) from public.class_members m where m.class_id = c.id and m.status = 'pending')::bigint
      else 0::bigint end
  from public.classes c
  join public.class_members cm on cm.class_id = c.id and cm.user_id = auth.uid() and cm.status = 'active'
  where c.id = p_class_id;
$$;

drop function if exists public.rename_group(uuid, text);
create function public.rename_group(p_class_id uuid, p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if public.class_role_of(p_class_id) is distinct from 'owner' then
    raise exception 'Chỉ người tạo nhóm mới được sửa tên nhóm.';
  end if;
  if length(v_name) = 0 or length(v_name) > 80 then
    raise exception 'Tên nhóm phải có từ 1 đến 80 ký tự.';
  end if;
  update public.classes c set name = v_name, updated_at = now() where c.id = p_class_id;
  return v_name;
end;
$$;

-- Xoá thật (cascade). Phải gõ lại đúng tên nhóm, không xoá được khi đang có bài mở.
drop function if exists public.delete_group(uuid, text);
create function public.delete_group(p_class_id uuid, p_confirm_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if public.class_role_of(p_class_id) is distinct from 'owner' then
    raise exception 'Chỉ người tạo nhóm mới được xoá nhóm.';
  end if;
  select c.name into v_name from public.classes c where c.id = p_class_id for update;
  if trim(coalesce(p_confirm_name, '')) <> v_name then
    raise exception 'Tên nhóm gõ lại không khớp.';
  end if;
  if exists (
    select 1 from public.class_quizzes q
    where q.class_id = p_class_id and public.class_quiz_effective_status(q.status, q.end_at) = 'running'
  ) then
    raise exception 'Nhóm đang có bài kiểm tra diễn ra, không xoá được. Hãy kết thúc bài trước.';
  end if;
  delete from public.classes c where c.id = p_class_id;
end;
$$;

drop function if exists public.regenerate_group_code(uuid);
create function public.regenerate_group_code(p_class_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if coalesce(public.class_role_of(p_class_id), '') not in ('owner', 'admin') then
    raise exception 'Bạn không có quyền đổi mã mời.';
  end if;
  v_code := public.generate_class_code();
  update public.classes c set class_code = v_code, updated_at = now() where c.id = p_class_id;
  return v_code;
end;
$$;

drop function if exists public.set_my_student_code(text);
create function public.set_my_student_code(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Bạn cần đăng nhập.';
  end if;
  return public.save_my_student_code(p_code);
end;
$$;

-- ---------- Thành viên ------------------------------------------------------------------

create function public.get_class_members(p_class_id uuid)
returns table (
  user_id         uuid,
  student_code    text,
  full_name       text,
  email           text,
  role            text,
  joined_at       timestamptz,
  submitted_count bigint,
  is_owner        boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if coalesce(public.class_role_of(p_class_id), '') not in ('owner', 'admin') then
    raise exception 'Bạn không có quyền xem danh sách thành viên.';
  end if;
  select c.owner_id into v_owner from public.classes c where c.id = p_class_id;

  return query
    select
      cm.user_id, pr.student_code,
      coalesce(nullif(trim(pr.full_name), ''), nullif(split_part(u.email, '@', 1), ''), 'Không tên'),
      u.email::text, cm.role, cm.joined_at,
      (select count(*) from public.class_quiz_attempts a
        join public.class_quizzes q on q.id = a.class_quiz_id
        where q.class_id = p_class_id and a.user_id = cm.user_id and a.status = 'submitted')::bigint,
      cm.user_id = v_owner
    from public.class_members cm
    left join public.profiles pr on pr.user_id = cm.user_id
    left join auth.users u on u.id = cm.user_id
    where cm.class_id = p_class_id and cm.status = 'active'
    order by (cm.user_id = v_owner) desc, (cm.role = 'admin') desc, pr.student_code asc nulls last, 3 asc;
end;
$$;

-- Đổi vai trò: chỉ chủ nhóm.
drop function if exists public.update_class_member_role(uuid, uuid, text);
create function public.update_class_member_role(p_class_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.class_role_of(p_class_id) is distinct from 'owner' then
    raise exception 'Chỉ người tạo nhóm mới được thay đổi vai trò.';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception 'Vai trò không hợp lệ.';
  end if;
  if public.class_role_of(p_class_id, p_user_id) = 'owner' then
    raise exception 'Không thể đổi vai trò của người tạo nhóm.';
  end if;
  update public.class_members m set role = p_role
  where m.class_id = p_class_id and m.user_id = p_user_id and m.status = 'active';
end;
$$;

-- Chuyển quyền chủ nhóm: chủ cũ thành quản trị viên.
drop function if exists public.transfer_group_ownership(uuid, uuid);
create function public.transfer_group_ownership(p_class_id uuid, p_new_owner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.class_role_of(p_class_id) is distinct from 'owner' then
    raise exception 'Chỉ người tạo nhóm mới được chuyển quyền chủ nhóm.';
  end if;
  if p_new_owner = auth.uid() then
    raise exception 'Bạn đang là người tạo nhóm.';
  end if;
  if not exists (
    select 1 from public.class_members m
    where m.class_id = p_class_id and m.user_id = p_new_owner and m.status = 'active'
  ) then
    raise exception 'Người nhận phải đang là thành viên của nhóm.';
  end if;

  update public.classes c set owner_id = p_new_owner, updated_at = now() where c.id = p_class_id;
  update public.class_members m set role = 'admin'
  where m.class_id = p_class_id and m.user_id in (p_new_owner, auth.uid());
end;
$$;

-- Mời khỏi nhóm. Quản trị viên chỉ mời ra được người tham gia. Kết quả bài cũ vẫn giữ.
drop function if exists public.remove_class_member(uuid, uuid);
create function public.remove_class_member(p_class_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me     text := public.class_role_of(p_class_id);
  v_target text := public.class_role_of(p_class_id, p_user_id);
begin
  if coalesce(v_me, '') not in ('owner', 'admin') then
    raise exception 'Bạn không có quyền mời thành viên khỏi nhóm.';
  end if;
  if v_target is null then
    raise exception 'Người này không còn ở trong nhóm.';
  end if;
  if v_target = 'owner' then
    raise exception 'Không thể mời người tạo nhóm ra khỏi nhóm.';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Bạn không thể tự mời mình ra khỏi nhóm.';
  end if;
  if v_me = 'admin' and v_target <> 'member' then
    raise exception 'Quản trị viên chỉ mời được người tham gia ra khỏi nhóm.';
  end if;

  update public.class_members m
  set status = 'removed', decided_by = auth.uid(), decided_at = now()
  where m.class_id = p_class_id and m.user_id = p_user_id and m.status = 'active';
end;
$$;

-- ---------- Bài kiểm tra ----------------------------------------------------------------

-- Tạo bài: chọn ngẫu nhiên câu theo môn/bài, đề thống nhất cho cả nhóm. Trạng thái draft,
-- chưa ai làm được cho tới khi bấm Bắt đầu.
create function public.create_class_quiz(
  p_class_id           uuid,
  p_title              text,
  p_description        text,
  p_subject_slug       text,
  p_lesson             text,
  p_question_count     integer,
  p_time_limit_minutes integer,
  p_max_attempts       integer,
  p_password           text
)
returns public.class_quizzes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quiz  public.class_quizzes;
  v_count integer;
begin
  if coalesce(public.class_role_of(p_class_id), '') not in ('owner', 'admin') then
    raise exception 'Bạn không có quyền tạo bài kiểm tra trong nhóm này.';
  end if;
  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'Tên bài kiểm tra không được để trống.';
  end if;
  if p_time_limit_minutes is null or p_time_limit_minutes < 1 or p_time_limit_minutes > 300 then
    raise exception 'Thời gian làm bài phải từ 1 đến 300 phút.';
  end if;
  if p_password is null or length(p_password) < 4 or length(p_password) > 32 then
    raise exception 'Mật khẩu bài kiểm tra phải có từ 4 đến 32 ký tự.';
  end if;

  insert into public.class_quizzes (
    class_id, created_by, title, description, subject_slug, lesson,
    question_count, time_limit_minutes, max_attempts, status
  ) values (
    p_class_id, auth.uid(), trim(p_title),
    nullif(trim(coalesce(p_description, '')), ''),
    nullif(trim(coalesce(p_subject_slug, '')), ''),
    nullif(trim(coalesce(p_lesson, '')), ''),
    greatest(1, coalesce(p_question_count, 10)),
    p_time_limit_minutes,
    greatest(1, coalesce(p_max_attempts, 1)),
    'draft'
  )
  returning * into v_quiz;

  insert into public.class_quiz_questions (class_quiz_id, question_id, question_order)
  select v_quiz.id, q.id, row_number() over (order by random())
  from public.questions q
  where (v_quiz.lesson is null or v_quiz.lesson = 'all' or q.lesson = v_quiz.lesson)
    and (v_quiz.subject_slug is null or q.subject_slug = v_quiz.subject_slug)
  order by random()
  limit v_quiz.question_count;

  select count(*) into v_count from public.class_quiz_questions cqq where cqq.class_quiz_id = v_quiz.id;
  if v_count = 0 then
    delete from public.class_quizzes q where q.id = v_quiz.id;
    raise exception 'Không tìm thấy câu hỏi phù hợp cho môn/bài đã chọn.';
  end if;

  update public.class_quizzes q set question_count = v_count where q.id = v_quiz.id;
  v_quiz.question_count := v_count;

  insert into public.class_quiz_secrets (class_quiz_id, password_hash)
  values (v_quiz.id, extensions.crypt(p_password, extensions.gen_salt('bf')));

  return v_quiz;
end;
$$;

drop function if exists public.set_class_quiz_password(uuid, text);
create function public.set_class_quiz_password(p_quiz_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quiz public.class_quizzes;
begin
  select * into v_quiz from public.class_quizzes q where q.id = p_quiz_id;
  if v_quiz.id is null then
    raise exception 'Không tìm thấy bài kiểm tra.';
  end if;
  if coalesce(public.class_role_of(v_quiz.class_id), '') not in ('owner', 'admin') then
    raise exception 'Bạn không có quyền đổi mật khẩu bài kiểm tra này.';
  end if;
  if public.class_quiz_effective_status(v_quiz.status, v_quiz.end_at) = 'closed' then
    raise exception 'Bài kiểm tra đã kết thúc.';
  end if;
  if p_password is null or length(p_password) < 4 or length(p_password) > 32 then
    raise exception 'Mật khẩu bài kiểm tra phải có từ 4 đến 32 ký tự.';
  end if;

  insert into public.class_quiz_secrets (class_quiz_id, password_hash)
  values (p_quiz_id, extensions.crypt(p_password, extensions.gen_salt('bf')))
  on conflict (class_quiz_id) do update set password_hash = excluded.password_hash;

  -- Đổi mật khẩu thì xoá khoá thử sai của mọi người.
  delete from public.class_quiz_password_failures f where f.class_quiz_id = p_quiz_id;
end;
$$;

drop function if exists public.start_class_quiz_session(uuid);
create function public.start_class_quiz_session(p_quiz_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quiz public.class_quizzes;
begin
  select * into v_quiz from public.class_quizzes q where q.id = p_quiz_id for update;
  if v_quiz.id is null then
    raise exception 'Không tìm thấy bài kiểm tra.';
  end if;
  if coalesce(public.class_role_of(v_quiz.class_id), '') not in ('owner', 'admin') then
    raise exception 'Bạn không có quyền bắt đầu bài kiểm tra này.';
  end if;
  if v_quiz.status <> 'draft' then
    raise exception 'Bài kiểm tra này đã bắt đầu hoặc đã kết thúc.';
  end if;
  if coalesce(v_quiz.time_limit_minutes, 0) <= 0 then
    raise exception 'Bài kiểm tra chưa có thời gian làm bài.';
  end if;
  if not exists (select 1 from public.class_quiz_secrets s where s.class_quiz_id = p_quiz_id) then
    raise exception 'Bài kiểm tra chưa có mật khẩu. Hãy đặt mật khẩu trước khi bắt đầu.';
  end if;

  -- Bài cũ đã hết giờ nhưng chưa ai tải lại vẫn mang trạng thái running: đóng trước.
  perform public.finalize_due_class_quizzes(v_quiz.class_id);

  begin
    update public.class_quizzes q
    set status = 'running',
        start_at = now(),
        end_at = now() + make_interval(mins => v_quiz.time_limit_minutes),
        updated_at = now()
    where q.id = p_quiz_id
    returning * into v_quiz;
  exception when unique_violation then
    raise exception 'Nhóm đang có bài kiểm tra khác diễn ra.';
  end;

  return jsonb_build_object('start_at', v_quiz.start_at, 'end_at', v_quiz.end_at, 'server_now', now());
end;
$$;

-- Kết thúc sớm: đóng bài và chấm các lượt đang dở theo đáp án đã lưu.
drop function if exists public.end_class_quiz_session(uuid);
create function public.end_class_quiz_session(p_quiz_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quiz public.class_quizzes;
begin
  select * into v_quiz from public.class_quizzes q where q.id = p_quiz_id for update;
  if v_quiz.id is null then
    raise exception 'Không tìm thấy bài kiểm tra.';
  end if;
  if coalesce(public.class_role_of(v_quiz.class_id), '') not in ('owner', 'admin') then
    raise exception 'Bạn không có quyền kết thúc bài kiểm tra này.';
  end if;
  if v_quiz.status = 'draft' then
    raise exception 'Bài kiểm tra chưa bắt đầu.';
  end if;

  if public.class_quiz_effective_status(v_quiz.status, v_quiz.end_at) = 'running' then
    update public.class_quizzes q
    set status = 'closed', end_at = now(), updated_at = now()
    where q.id = p_quiz_id;
  end if;

  perform public.finalize_class_quiz(p_quiz_id);
end;
$$;

-- Danh sách bài kiểm tra của nhóm + trạng thái của người gọi. Điểm chỉ trả khi đã kết thúc.
-- Không để stable vì có thể chấm các bài vừa hết giờ.
create function public.get_class_quizzes(p_class_id uuid)
returns table (
  quiz_id            uuid,
  title              text,
  description        text,
  subject_slug       text,
  lesson             text,
  question_count     integer,
  time_limit_minutes integer,
  max_attempts       integer,
  status             text,
  start_at           timestamptz,
  end_at             timestamptz,
  server_now         timestamptz,
  created_at         timestamptz,
  has_password       boolean,
  my_attempts        bigint,
  my_status          text,
  my_attempt_id      uuid,
  my_score10         numeric,
  my_correct         integer,
  my_total           integer,
  my_auto            boolean,
  submitted_count    bigint,
  total_members      bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.class_role_of(p_class_id);
begin
  if v_role is null then
    raise exception 'Bạn không phải thành viên của nhóm này.';
  end if;

  perform public.finalize_due_class_quizzes(p_class_id);

  return query
    select
      q.id, q.title, q.description, q.subject_slug, q.lesson,
      q.question_count, q.time_limit_minutes, q.max_attempts,
      eff.status, q.start_at, q.end_at, now(), q.created_at,
      case when v_role in ('owner', 'admin')
        then exists (select 1 from public.class_quiz_secrets s where s.class_quiz_id = q.id)
      end,
      (select count(*) from public.class_quiz_attempts a
        where a.class_quiz_id = q.id and a.user_id = auth.uid())::bigint,
      coalesce((
        select a.status from public.class_quiz_attempts a
        where a.class_quiz_id = q.id and a.user_id = auth.uid()
        order by a.attempt_number desc limit 1
      ), 'not_started'),
      case when eff.status = 'closed' then best.id end,
      case when eff.status = 'closed' and best.total_count > 0
        then round(best.correct_count * 10.0 / best.total_count, 2) end,
      case when eff.status = 'closed' then best.correct_count end,
      case when eff.status = 'closed' then best.total_count end,
      case when eff.status = 'closed' then best.auto_submitted end,
      case when v_role in ('owner', 'admin') and eff.status = 'closed' then
        (select count(distinct a.user_id) from public.class_quiz_attempts a
          where a.class_quiz_id = q.id and a.status = 'submitted')::bigint
      end,
      case when v_role in ('owner', 'admin') then
        (select count(*) from public.class_members m
          where m.class_id = p_class_id and m.status = 'active' and m.role = 'member')::bigint
      end
    from public.class_quizzes q
    cross join lateral (select public.class_quiz_effective_status(q.status, q.end_at) as status) eff
    left join lateral (
      select a2.id, a2.correct_count, a2.total_count, a2.auto_submitted
      from public.class_quiz_attempts a2
      where a2.class_quiz_id = q.id and a2.user_id = auth.uid() and a2.status = 'submitted'
      order by a2.percent desc nulls last, (a2.submitted_at - a2.started_at) asc
      limit 1
    ) best on true
    where q.class_id = p_class_id
    order by q.created_at desc;
end;
$$;

-- Không xoá được bài đang diễn ra.
drop function if exists public.delete_class_quiz(uuid);
create function public.delete_class_quiz(p_quiz_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quiz public.class_quizzes;
begin
  select * into v_quiz from public.class_quizzes q where q.id = p_quiz_id;
  if v_quiz.id is null then
    raise exception 'Không tìm thấy bài kiểm tra.';
  end if;
  if coalesce(public.class_role_of(v_quiz.class_id), '') not in ('owner', 'admin') then
    raise exception 'Bạn không có quyền xoá bài kiểm tra này.';
  end if;
  if public.class_quiz_effective_status(v_quiz.status, v_quiz.end_at) = 'running' then
    raise exception 'Bài kiểm tra đang diễn ra, hãy kết thúc trước khi xoá.';
  end if;
  delete from public.class_quizzes q where q.id = p_quiz_id;
end;
$$;

-- Bắt đầu hoặc tiếp tục làm bài. Lượt mới phải đúng mật khẩu, tiếp tục lượt đang dở thì không.
-- Sai mật khẩu KHÔNG dùng raise exception: raise sẽ hoàn tác giao dịch và số lần sai không
-- được lưu, nên không khoá được. Thay vào đó trả một dòng có error_code và attempt_id rỗng:
--   password_required : chưa nhập mật khẩu
--   wrong_password    : sai, tries_left = số lần còn lại
--   locked            : đang bị khoá, retry_after_seconds = số giây phải chờ
create function public.start_class_quiz_attempt(p_class_quiz_id uuid, p_password text default null)
returns table (
  attempt_id          uuid,
  started_at          timestamptz,
  time_limit_minutes  integer,
  question_id         uuid,
  question_order      integer,
  question_text       text,
  option_a            text,
  option_b            text,
  option_c            text,
  option_d            text,
  deadline_at         timestamptz,
  server_now          timestamptz,
  saved_answer        text,
  error_code          text,
  tries_left          integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max_fails   constant integer := 5;
  c_fail_window constant interval := interval '10 minutes';
  c_lock_time   constant interval := interval '5 minutes';
  v_quiz          public.class_quizzes;
  v_attempt       public.class_quiz_attempts;
  v_fail          public.class_quiz_password_failures;
  v_hash          text;
  v_attempt_count integer;
  v_status        text;
  v_fail_count    integer;
begin
  select * into v_quiz from public.class_quizzes q where q.id = p_class_quiz_id;
  if v_quiz.id is null then
    raise exception 'Không tìm thấy bài kiểm tra.';
  end if;
  if public.class_role_of(v_quiz.class_id) is distinct from 'member' then
    raise exception 'Chỉ người tham gia mới làm được bài kiểm tra.';
  end if;

  v_status := public.class_quiz_effective_status(v_quiz.status, v_quiz.end_at);
  if v_status = 'draft' then
    raise exception 'Bài kiểm tra chưa bắt đầu.';
  end if;
  if v_status = 'closed' then
    raise exception 'Bài kiểm tra đã kết thúc.';
  end if;

  -- Khoá theo (bài, người) để 2 tab bấm "Làm bài" cùng lúc không tạo 2 lượt.
  perform pg_advisory_xact_lock(hashtextextended(p_class_quiz_id::text || ':' || auth.uid()::text, 0));

  select * into v_attempt from public.class_quiz_attempts a
  where a.class_quiz_id = p_class_quiz_id and a.user_id = auth.uid() and a.status = 'in_progress'
  order by a.attempt_number desc limit 1;

  if v_attempt.id is null then
    select count(*) into v_attempt_count from public.class_quiz_attempts a
    where a.class_quiz_id = p_class_quiz_id and a.user_id = auth.uid();
    if v_attempt_count >= v_quiz.max_attempts then
      raise exception 'Bạn đã hết lượt làm bài kiểm tra này.';
    end if;

    select * into v_fail from public.class_quiz_password_failures f
    where f.class_quiz_id = p_class_quiz_id and f.user_id = auth.uid()
    for update;

    if v_fail.locked_until is not null and v_fail.locked_until > now() then
      return query select
        null::uuid, null::timestamptz, null::integer, null::uuid, null::integer, null::text,
        null::text, null::text, null::text, null::text, null::timestamptz, now(), null::text,
        'locked'::text, 0, ceil(extract(epoch from v_fail.locked_until - now()))::integer;
      return;
    end if;

    if p_password is null then
      return query select
        null::uuid, null::timestamptz, null::integer, null::uuid, null::integer, null::text,
        null::text, null::text, null::text, null::text, null::timestamptz, now(), null::text,
        'password_required'::text, null::integer, null::integer;
      return;
    end if;

    select s.password_hash into v_hash from public.class_quiz_secrets s where s.class_quiz_id = p_class_quiz_id;
    if v_hash is null then
      raise exception 'Bài kiểm tra chưa có mật khẩu. Hãy báo người tạo nhóm đặt lại.';
    end if;

    if extensions.crypt(p_password, v_hash) <> v_hash then
      -- Quá 10 phút kể từ lần sai đầu, hoặc vừa hết khoá, thì đếm lại từ đầu.
      if v_fail.first_failed_at is null
         or v_fail.first_failed_at < now() - c_fail_window
         or v_fail.locked_until is not null then
        v_fail_count := 1;
        insert into public.class_quiz_password_failures as f (class_quiz_id, user_id, fail_count, first_failed_at, locked_until)
        values (p_class_quiz_id, auth.uid(), 1, now(), null)
        on conflict on constraint class_quiz_password_failures_pkey
        do update set fail_count = 1, first_failed_at = now(), locked_until = null;
      else
        v_fail_count := v_fail.fail_count + 1;
        update public.class_quiz_password_failures f
        set fail_count = v_fail_count,
            locked_until = case when v_fail_count >= c_max_fails then now() + c_lock_time end
        where f.class_quiz_id = p_class_quiz_id and f.user_id = auth.uid();
      end if;

      if v_fail_count >= c_max_fails then
        return query select
          null::uuid, null::timestamptz, null::integer, null::uuid, null::integer, null::text,
          null::text, null::text, null::text, null::text, null::timestamptz, now(), null::text,
          'locked'::text, 0, extract(epoch from c_lock_time)::integer;
      else
        return query select
          null::uuid, null::timestamptz, null::integer, null::uuid, null::integer, null::text,
          null::text, null::text, null::text, null::text, null::timestamptz, now(), null::text,
          'wrong_password'::text, c_max_fails - v_fail_count, null::integer;
      end if;
      return;
    end if;

    delete from public.class_quiz_password_failures f
    where f.class_quiz_id = p_class_quiz_id and f.user_id = auth.uid();

    insert into public.class_quiz_attempts (class_quiz_id, user_id, attempt_number, status)
    values (p_class_quiz_id, auth.uid(), v_attempt_count + 1, 'in_progress')
    returning * into v_attempt;
  end if;

  return query
    select v_attempt.id, v_attempt.started_at, v_quiz.time_limit_minutes,
           cqq.question_id, cqq.question_order,
           q.question_text, q.option_a, q.option_b, q.option_c, q.option_d,
           public.class_attempt_deadline(v_attempt.started_at, v_quiz.time_limit_minutes, v_quiz.end_at),
           now(),
           v_attempt.draft_answers->>(cqq.question_id::text),
           null::text, null::integer, null::integer
    from public.class_quiz_questions cqq
    join public.questions q on q.id = cqq.question_id
    where cqq.class_quiz_id = p_class_quiz_id
    order by cqq.question_order asc;
end;
$$;

-- Lưu đáp án tạm {question_id: 'A'} lên server, gộp với đáp án đã lưu. Chỉ nhận câu thuộc
-- bài này và giá trị A-D. Quá hạn + 120 giây ân hạn thì từ chối.
drop function if exists public.save_class_quiz_answers(uuid, jsonb);
create function public.save_class_quiz_answers(p_attempt_id uuid, p_answers jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  c_grace    constant interval := interval '120 seconds';
  v_attempt  public.class_quiz_attempts;
  v_quiz     public.class_quizzes;
  v_deadline timestamptz;
  v_clean    jsonb;
begin
  select * into v_attempt from public.class_quiz_attempts a where a.id = p_attempt_id for update;
  if v_attempt.id is null or v_attempt.user_id <> auth.uid() then
    raise exception 'Không tìm thấy bài làm.';
  end if;
  if v_attempt.status <> 'in_progress' then
    raise exception 'Bài làm này đã được nộp.';
  end if;

  select * into v_quiz from public.class_quizzes q where q.id = v_attempt.class_quiz_id;
  if public.class_role_of(v_quiz.class_id) is null then
    raise exception 'Bạn không còn ở trong nhóm này.';
  end if;
  v_deadline := public.class_attempt_deadline(v_attempt.started_at, v_quiz.time_limit_minutes, v_quiz.end_at);
  if v_deadline is not null and now() > v_deadline + c_grace then
    raise exception 'Đã hết giờ làm bài.';
  end if;

  if jsonb_typeof(p_answers) = 'object' then
    select coalesce(jsonb_object_agg(e.key, upper(trim(e.value))), '{}'::jsonb) into v_clean
    from jsonb_each_text(p_answers) e
    where upper(trim(e.value)) in ('A', 'B', 'C', 'D')
      and e.key in (
        select cqq.question_id::text from public.class_quiz_questions cqq
        where cqq.class_quiz_id = v_attempt.class_quiz_id
      );
    update public.class_quiz_attempts a
    set draft_answers = a.draft_answers || v_clean
    where a.id = p_attempt_id;
  end if;

  return now();
end;
$$;

-- Nộp bài: chỉ báo đã nộp, không trả điểm hay đáp án. Nộp lại lượt đã nộp thì trả kết quả cũ
-- (ví dụ server vừa tự chấm lúc hết giờ). Nộp quá hạn + 120 giây thì chỉ tính đáp án đã lưu.
create function public.submit_class_quiz_attempt(p_attempt_id uuid, p_answers jsonb)
returns table (
  submitted_at timestamptz,
  timed_out    boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  c_grace    constant interval := interval '120 seconds';
  v_attempt  public.class_quiz_attempts;
  v_quiz     public.class_quizzes;
  v_deadline timestamptz;
  v_late     boolean;
  v_answers  jsonb;
begin
  select * into v_attempt from public.class_quiz_attempts a where a.id = p_attempt_id for update;
  if v_attempt.id is null or v_attempt.user_id <> auth.uid() then
    raise exception 'Không tìm thấy bài làm.';
  end if;

  if v_attempt.status = 'in_progress' then
    select * into v_quiz from public.class_quizzes q where q.id = v_attempt.class_quiz_id;
    if public.class_role_of(v_quiz.class_id) is null then
      raise exception 'Bạn không còn ở trong nhóm này.';
    end if;

    v_deadline := public.class_attempt_deadline(v_attempt.started_at, v_quiz.time_limit_minutes, v_quiz.end_at);
    v_late := v_deadline is not null and now() > v_deadline + c_grace;
    v_answers := v_attempt.draft_answers;

    -- p_answers: mảng [{question_id, selected_answer}], gộp đè lên đáp án đã lưu.
    if not v_late and jsonb_typeof(p_answers) = 'array' then
      select v_answers || coalesce(jsonb_object_agg(e->>'question_id', e->>'selected_answer'), '{}'::jsonb)
        into v_answers
      from jsonb_array_elements(p_answers) e
      where nullif(trim(coalesce(e->>'selected_answer', '')), '') is not null
        and e->>'question_id' is not null;
    end if;

    perform public.grade_class_attempt(p_attempt_id, v_answers, v_late);
  end if;

  return query
    select a.submitted_at, a.timed_out
    from public.class_quiz_attempts a
    where a.id = p_attempt_id;
end;
$$;

-- Xem lại 1 lượt của chính mình. Chỉ sau khi bài kết thúc.
create function public.get_class_quiz_review(p_attempt_id uuid)
returns table (
  question_order  integer,
  question_text   text,
  option_a        text,
  option_b        text,
  option_c        text,
  option_d        text,
  correct_answer  text,
  selected_answer text,
  is_correct      boolean,
  explanation     text,
  auto_submitted  boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_attempt public.class_quiz_attempts;
begin
  select * into v_attempt from public.class_quiz_attempts a
  where a.id = p_attempt_id and a.user_id = auth.uid() and a.status = 'submitted';
  if v_attempt.id is null then
    raise exception 'Không tìm thấy bài làm đã nộp.';
  end if;
  if not public.class_quiz_is_closed(v_attempt.class_quiz_id) then
    raise exception 'Kết quả chỉ xem được sau khi bài kiểm tra kết thúc.';
  end if;

  return query
    select a.question_order, a.question_text, a.option_a, a.option_b, a.option_c, a.option_d,
           a.correct_answer, a.selected_answer, a.is_correct, a.explanation, v_attempt.auto_submitted
    from public.class_quiz_answers a
    where a.attempt_id = p_attempt_id
    order by a.question_order asc;
end;
$$;

-- Bảng kết quả: chủ nhóm / quản trị viên, chỉ khi bài đã kết thúc. Gồm người tham gia đang
-- hoạt động cộng những ai đã có lượt làm (kể cả đã rời hoặc bị mời ra). Nhiều lượt thì lấy
-- lượt điểm cao nhất, bằng điểm lấy lượt nhanh hơn.
create function public.get_class_quiz_results(p_quiz_id uuid)
returns table (
  user_id          uuid,
  student_code     text,
  full_name        text,
  status           text,
  score10          numeric,
  correct_count    integer,
  wrong_count      integer,
  total_count      integer,
  duration_seconds integer,
  submitted_at     timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quiz public.class_quizzes;
begin
  select * into v_quiz from public.class_quizzes q where q.id = p_quiz_id;
  if v_quiz.id is null then
    raise exception 'Không tìm thấy bài kiểm tra.';
  end if;
  if coalesce(public.class_role_of(v_quiz.class_id), '') not in ('owner', 'admin') then
    raise exception 'Bạn không có quyền xem kết quả này.';
  end if;
  if public.class_quiz_effective_status(v_quiz.status, v_quiz.end_at) <> 'closed' then
    raise exception 'Bảng kết quả chỉ xem được sau khi bài kiểm tra kết thúc.';
  end if;

  perform public.finalize_class_quiz(p_quiz_id);

  return query
    with people as (
      select m.user_id as uid from public.class_members m
      where m.class_id = v_quiz.class_id and m.status = 'active' and m.role = 'member'
      union
      select a.user_id from public.class_quiz_attempts a where a.class_quiz_id = p_quiz_id
    )
    select
      pe.uid,
      pr.student_code,
      coalesce(nullif(trim(pr.full_name), ''), nullif(split_part(u.email, '@', 1), ''), 'Không tên'),
      case when best.id is null then 'absent' when best.auto_submitted then 'auto' else 'submitted' end,
      case when best.id is null or coalesce(best.total_count, 0) = 0 then 0::numeric
           else round(best.correct_count * 10.0 / best.total_count, 2) end,
      best.correct_count,
      best.total_count - best.correct_count,
      coalesce(best.total_count, v_quiz.question_count),
      floor(extract(epoch from best.submitted_at - best.started_at))::integer,
      best.submitted_at
    from people pe
    left join public.profiles pr on pr.user_id = pe.uid
    left join auth.users u on u.id = pe.uid
    left join lateral (
      select a2.id, a2.correct_count, a2.total_count, a2.auto_submitted, a2.started_at, a2.submitted_at
      from public.class_quiz_attempts a2
      where a2.class_quiz_id = p_quiz_id and a2.user_id = pe.uid and a2.status = 'submitted'
      order by a2.percent desc nulls last, (a2.submitted_at - a2.started_at) asc
      limit 1
    ) best on true
    order by pr.student_code asc nulls last, 3 asc;
end;
$$;

-- ---------- Quyền thực thi --------------------------------------------------------------

-- Hàm nội bộ: client không gọi được.
revoke execute on function public.class_role_of(uuid, uuid)                 from public, anon, authenticated;
revoke execute on function public.normalize_student_code(text)              from public, anon, authenticated;
revoke execute on function public.save_my_student_code(text)                from public, anon, authenticated;
revoke execute on function public.generate_class_code()                     from public, anon, authenticated;
revoke execute on function public.grade_class_attempt(uuid, jsonb, boolean) from public, anon, authenticated;
revoke execute on function public.finalize_class_quiz(uuid)                 from public, anon, authenticated;
revoke execute on function public.finalize_due_class_quizzes(uuid)          from public, anon, authenticated;

-- Dùng trong màn làm bài của bản cũ.
revoke execute on function public.class_attempt_deadline(timestamptz, integer, timestamptz) from public, anon;
grant  execute on function public.class_attempt_deadline(timestamptz, integer, timestamptz) to authenticated;

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.create_class(text, text, text)',
    'public.request_join_group(text, text)',
    'public.join_class_by_code(text)',
    'public.cancel_join_request(uuid)',
    'public.get_join_requests(uuid)',
    'public.respond_join_request(uuid, uuid[], boolean)',
    'public.leave_class(uuid)',
    'public.get_my_groups()',
    'public.get_my_classes()',
    'public.get_class_detail(uuid)',
    'public.rename_group(uuid, text)',
    'public.delete_group(uuid, text)',
    'public.regenerate_group_code(uuid)',
    'public.set_my_student_code(text)',
    'public.get_class_members(uuid)',
    'public.update_class_member_role(uuid, uuid, text)',
    'public.transfer_group_ownership(uuid, uuid)',
    'public.remove_class_member(uuid, uuid)',
    'public.create_class_quiz(uuid, text, text, text, text, integer, integer, integer, text)',
    'public.set_class_quiz_password(uuid, text)',
    'public.start_class_quiz_session(uuid)',
    'public.end_class_quiz_session(uuid)',
    'public.get_class_quizzes(uuid)',
    'public.delete_class_quiz(uuid)',
    'public.start_class_quiz_attempt(uuid, text)',
    'public.save_class_quiz_answers(uuid, jsonb)',
    'public.submit_class_quiz_attempt(uuid, jsonb)',
    'public.get_class_quiz_review(uuid)',
    'public.get_class_quiz_results(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end $$;

notify pgrst, 'reload schema';


-- =============================================================================
-- 6. KIỂM TRA SAU KHI CHẠY (chạy riêng từng câu để xem kết quả)
-- =============================================================================

-- 5.1 RLS đã bật chưa và mỗi bảng có mấy policy:
-- select c.relname as bang, c.relrowsecurity as rls_bat,
--        (select count(*) from pg_policies p
--         where p.schemaname = 'public' and p.tablename = c.relname) as so_policy
-- from pg_class c join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relkind = 'r'
-- order by c.relname;

-- 5.2 Thử bảng xếp hạng:
-- select * from public.get_leaderboard(50, null);

-- 5.3 Đếm câu hỏi theo môn (kiểm tra subject_slug đã gán đủ chưa):
-- select coalesce(subject_slug, '(chưa gán môn)') as mon, count(*) as so_cau
-- from public.questions group by 1 order by 2 desc;

-- =====================================================================
-- Sổ từ vựng (mục Từ vựng tiếng Anh + Tiếng Trung YCT). Bản riêng: vocab/vocab-schema.sql
-- =====================================================================
-- Chạy file này trong Supabase > SQL Editor (dán toàn bộ > Run).
-- Chạy lại nhiều lần cũng an toàn, KHÔNG xoá dữ liệu:
--   - chưa có bảng: tạo mới;
--   - đã có bảng từ bản trước (chưa có cột lang): tự nâng cấp.
-- Bảng sổ từ dùng chung cho mục "Từ vựng tiếng Anh" (vocab/, lang = 'en')
-- và "Tiếng Trung YCT" (chinese/, lang = 'zh'). Mức nhớ kiểu hộp Leitner (0-5).
-- Với tiếng Trung: word = chữ Hán, ipa = pinyin.

create table if not exists public.vocab_words (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lang         text not null default 'en',
  word         text not null check (char_length(btrim(word)) between 1 and 64),
  ipa          text not null default '' check (char_length(ipa) <= 200),
  meaning_vi   text not null default '' check (char_length(meaning_vi) <= 500),
  senses       jsonb not null default '[]'::jsonb check (jsonb_typeof(senses) = 'array' and pg_column_size(senses) <= 8000),
  examples     jsonb not null default '[]'::jsonb check (jsonb_typeof(examples) = 'array' and pg_column_size(examples) <= 4000),
  sentences    jsonb not null default '[]'::jsonb check (jsonb_typeof(sentences) = 'array' and pg_column_size(sentences) <= 8000),
  level        smallint not null default 0 check (level between 0 and 5),
  correct      integer not null default 0 check (correct >= 0),
  wrong        integer not null default 0 check (wrong >= 0),
  lookups      integer not null default 1 check (lookups >= 0),
  last_review  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Nâng cấp bảng tạo từ bản đầu (04/10/2026) chưa có cột lang.
alter table public.vocab_words add column if not exists lang text not null default 'en';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vocab_words_lang_check') then
    alter table public.vocab_words add constraint vocab_words_lang_check check (lang in ('en', 'zh'));
  end if;
end $$;

drop index if exists public.vocab_words_user_word_uidx;
create unique index if not exists vocab_words_user_lang_word_uidx on public.vocab_words (user_id, lang, lower(word));
create index if not exists vocab_words_user_created_idx on public.vocab_words (user_id, created_at desc);

-- Cập nhật updated_at + giới hạn 3000 từ / người / ngôn ngữ (chống ghi tràn).
create or replace function public.vocab_words_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.word := btrim(new.word);
  if tg_op = 'INSERT' then
    if (select count(*) from public.vocab_words w where w.user_id = new.user_id and w.lang = new.lang) >= 3000 then
      raise exception 'Sổ từ đã đủ 3000 từ, hãy xoá bớt từ cũ.' using errcode = 'P0001';
    end if;
  else
    new.user_id := old.user_id;      -- không cho đổi chủ
    new.lang := old.lang;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists vocab_words_before_write on public.vocab_words;
create trigger vocab_words_before_write
  before insert or update on public.vocab_words
  for each row execute function public.vocab_words_before_write();

alter table public.vocab_words enable row level security;

drop policy if exists "vocab_words_select_own" on public.vocab_words;
create policy "vocab_words_select_own" on public.vocab_words
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "vocab_words_insert_own" on public.vocab_words;
create policy "vocab_words_insert_own" on public.vocab_words
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "vocab_words_update_own" on public.vocab_words;
create policy "vocab_words_update_own" on public.vocab_words
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "vocab_words_delete_own" on public.vocab_words;
create policy "vocab_words_delete_own" on public.vocab_words
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.vocab_words from anon;
grant select, insert, update, delete on public.vocab_words to authenticated;

-- =============================================================================
-- Báo cáo câu hỏi (nút "Báo cáo" ở màn làm bài) - 09/11/2026
-- Chạy lại nhiều lần không lỗi.
--
-- Luồng: app.js -> Edge Function `report-question` (gửi kèm JWT người dùng)
--        -> RPC submit_question_report() kiểm tra + lưu báo cáo + trả ảnh chụp
--           câu hỏi lấy từ DB (không tin dữ liệu câu hỏi do trình duyệt gửi lên)
--        -> Edge Function dựng email theo mục và gửi qua Brevo.
-- Báo cáo luôn được lưu trong bảng, kể cả khi gửi mail lỗi (cột email_sent).
-- =============================================================================

create table if not exists public.question_reports (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  question_id       uuid references public.questions(id) on delete set null,
  categories        text[] not null,
  suggested_answer  text check (suggested_answer in ('A','B','C','D')),
  note              text,
  context           jsonb not null default '{}'::jsonb,
  question_snapshot jsonb,
  status            text not null default 'new' check (status in ('new','resolved','rejected')),
  email_sent        boolean not null default false,
  email_error       text,
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz
);

create index if not exists question_reports_user_created_idx
  on public.question_reports (user_id, created_at desc);
create index if not exists question_reports_question_idx
  on public.question_reports (question_id);
create index if not exists question_reports_status_idx
  on public.question_reports (status, created_at desc);

alter table public.question_reports enable row level security;

-- Người dùng chỉ xem được báo cáo của chính mình. Không có policy INSERT/UPDATE/DELETE:
-- ghi chỉ qua RPC bên dưới (người dùng) hoặc service role (Edge Function, Dashboard).
revoke insert, update, delete, truncate on public.question_reports from anon, authenticated;
revoke all on public.question_reports from anon;

drop policy if exists question_reports_select_own on public.question_reports;
create policy question_reports_select_own on public.question_reports
  for select to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
create or replace function public.submit_question_report(
  p_question_id      uuid,
  p_categories       text[],
  p_suggested_answer text default null,
  p_note             text default null,
  p_context          jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_allowed    text[] := array['wrong_answer','question_error','option_error','multiple_or_none',
                               'explanation_error','wrong_place','display_error','other'];
  v_cats       text[];
  v_note       text := nullif(btrim(coalesce(p_note, '')), '');
  v_suggest    text := nullif(upper(btrim(coalesce(p_suggested_answer, ''))), '');
  v_context    jsonb := coalesce(p_context, '{}'::jsonb);
  v_q          record;
  v_snapshot   jsonb;
  v_subject    text;
  v_name       text;
  v_email      text;
  v_code       text;
  v_report_id  uuid;
  v_created    timestamptz;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập để gửi báo cáo.';
  end if;

  -- Bỏ trùng, giữ đúng thứ tự trong danh sách cho phép.
  select coalesce(array_agg(c order by array_position(v_allowed, c)), '{}')
    into v_cats
    from (select distinct unnest(coalesce(p_categories, '{}')) as c) s
   where c = any (v_allowed);

  if exists (select 1 from unnest(coalesce(p_categories, '{}')) c where c is null or not (c = any (v_allowed))) then
    raise exception 'Loại vấn đề không hợp lệ.';
  end if;
  if coalesce(array_length(v_cats, 1), 0) = 0 then
    raise exception 'Vui lòng chọn ít nhất một vấn đề.';
  end if;
  if v_suggest is not null and v_suggest not in ('A','B','C','D') then
    raise exception 'Đáp án đề xuất không hợp lệ.';
  end if;
  if v_suggest is not null and not ('wrong_answer' = any (v_cats)) then
    v_suggest := null;
  end if;
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'Mô tả tối đa 1000 ký tự.';
  end if;
  if 'other' = any (v_cats) and coalesce(char_length(v_note), 0) < 5 then
    raise exception 'Chọn "Vấn đề khác" thì cần mô tả ngắn (ít nhất 5 ký tự).';
  end if;
  if jsonb_typeof(v_context) <> 'object' or octet_length(v_context::text) > 8000 then
    raise exception 'Dữ liệu kèm theo không hợp lệ.';
  end if;

  -- Chống spam: tối đa 15 báo cáo / giờ / tài khoản, cùng 1 câu cách nhau ít nhất 5 phút.
  if (select count(*) from public.question_reports r
       where r.user_id = v_uid and r.created_at > now() - interval '1 hour') >= 15 then
    raise exception 'Bạn đã gửi quá nhiều báo cáo trong 1 giờ. Vui lòng thử lại sau.';
  end if;
  if p_question_id is not null and exists (
       select 1 from public.question_reports r
        where r.user_id = v_uid and r.question_id = p_question_id
          and r.created_at > now() - interval '5 minutes') then
    raise exception 'Bạn vừa báo cáo câu này. Cảm ơn bạn, tác giả sẽ xem xét sớm.';
  end if;

  if p_question_id is not null then
    select q.id, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d,
           q.correct_answer, q.explanation, q.lesson, q.level, q.subject_slug
      into v_q
      from public.questions q
     where q.id = p_question_id;

    if found then
      select s.name into v_subject from public.subjects s where s.slug = v_q.subject_slug;
      v_snapshot := jsonb_build_object(
        'id', v_q.id,
        'question_text', v_q.question_text,
        'option_a', v_q.option_a,
        'option_b', v_q.option_b,
        'option_c', v_q.option_c,
        'option_d', v_q.option_d,
        'correct_answer', v_q.correct_answer,
        'explanation', v_q.explanation,
        'lesson', v_q.lesson,
        'level', v_q.level,
        'subject_slug', v_q.subject_slug,
        'subject_name', v_subject,
        'source', 'database'
      );
    end if;
  end if;

  select p.full_name, p.student_code into v_name, v_code
    from public.profiles p where p.user_id = v_uid
   limit 1;
  select u.email::text into v_email from auth.users u where u.id = v_uid;

  insert into public.question_reports (user_id, question_id, categories, suggested_answer, note, context, question_snapshot)
  values (v_uid, case when v_snapshot is null then null else p_question_id end,
          v_cats, v_suggest, v_note, v_context, v_snapshot)
  returning id, created_at into v_report_id, v_created;

  return jsonb_build_object(
    'report_id', v_report_id,
    'created_at', v_created,
    'categories', to_jsonb(v_cats),
    'suggested_answer', v_suggest,
    'note', v_note,
    'question', v_snapshot,
    'reporter', jsonb_build_object('name', v_name, 'email', v_email, 'student_code', v_code)
  );
end;
$$;

revoke all on function public.submit_question_report(uuid, text[], text, text, jsonb) from public, anon;
grant execute on function public.submit_question_report(uuid, text[], text, text, jsonb) to authenticated;
