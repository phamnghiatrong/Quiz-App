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
      dense_rank() over (order by best_score desc)::bigint as rank,
      user_id, full_name, best_score, attempts, latest_attempt
    from user_scores
  )
  select r.rank, r.user_id, r.full_name, r.best_score, r.attempts
  from ranked r
  order by r.rank asc, r.latest_attempt asc, r.full_name asc
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
-- 5. LỚP HỌC (KIỂM TRA THEO LỚP - Phase 1 MVP)
--    Giáo viên/quản trị lớp tạo lớp, mời thành viên bằng mã lớp, tạo bài kiểm
--    tra từ ngân hàng câu hỏi có sẵn, học sinh làm bài, hệ thống tự chấm và
--    tổng hợp kết quả tập trung.
--
--    Thiết kế bảo mật: 6 bảng dưới đây CHỈ có policy SELECT (đọc theo phạm vi
--    của mình). Toàn bộ thao tác ghi (tạo lớp, tham gia lớp, tạo bài kiểm tra,
--    nộp bài...) đều đi qua RPC SECURITY DEFINER có kiểm tra quyền bên trong,
--    ứng dụng không bao giờ insert/update trực tiếp các bảng này qua REST.
--    Câu hỏi + đáp án đúng của bài kiểm tra lớp KHÔNG lộ ra cho học sinh trước
--    khi nộp bài (khác với luyện tập cá nhân): start_class_quiz_attempt() chỉ
--    trả về nội dung câu hỏi, đáp án đúng chỉ được trả về sau khi nộp bài qua
--    submit_class_quiz_attempt() / get_class_quiz_review().
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
  status     text not null default 'active' check (status in ('active','left')),
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
  status             text not null default 'published' check (status in ('draft','published','closed')),
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

drop policy if exists "class_quiz_attempts_select_scope" on public.class_quiz_attempts;
create policy "class_quiz_attempts_select_scope"
  on public.class_quiz_attempts for select
  to authenticated
  using (
    user_id = auth.uid()
    or class_quiz_id in (
      select q.id from public.class_quizzes q
      join public.class_members m on m.class_id = q.class_id
      where m.user_id = auth.uid() and m.role = 'admin' and m.status = 'active'
    )
  );

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

-- 5.3 RPC ----------------------------------------------------------------------

-- Sinh mã lớp 6 ký tự, hoa, không trùng. Hàm nội bộ, không cấp quyền gọi trực
-- tiếp (được gọi bên trong create_class với quyền của SECURITY DEFINER).
drop function if exists public.generate_class_code();
create function public.generate_class_code()
returns text
language plpgsql
set search_path = public
as $$
declare
  v_code text;
begin
  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.classes where class_code = v_code);
  end loop;
  return v_code;
end;
$$;

-- Tạo lớp mới, người tạo tự động là admin của lớp.
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
begin
  if auth.uid() is null then
    raise exception 'Bạn cần đăng nhập.';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Tên lớp không được để trống.';
  end if;

  insert into public.classes (owner_id, name, description, subject_slug, class_code)
  values (
    auth.uid(), trim(p_name),
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

-- Tham gia lớp bằng mã lớp (không phân biệt hoa/thường khi nhập).
drop function if exists public.join_class_by_code(text);
create function public.join_class_by_code(p_code text)
returns public.classes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class    public.classes;
  v_existing public.class_members;
begin
  if auth.uid() is null then
    raise exception 'Bạn cần đăng nhập.';
  end if;
  if p_code is null or length(trim(p_code)) = 0 then
    raise exception 'Vui lòng nhập mã lớp.';
  end if;

  select * into v_class from public.classes where class_code = upper(trim(p_code));
  if v_class.id is null then
    raise exception 'Mã lớp không tồn tại.';
  end if;
  if v_class.status = 'archived' then
    raise exception 'Lớp học này đã được lưu trữ, không thể tham gia.';
  end if;

  select * into v_existing from public.class_members
  where class_id = v_class.id and user_id = auth.uid();

  if v_existing.id is not null then
    if v_existing.status = 'left' then
      update public.class_members set status = 'active', joined_at = now()
      where id = v_existing.id;
    end if;
  else
    insert into public.class_members (class_id, user_id, role, status)
    values (v_class.id, auth.uid(), 'member', 'active');
  end if;

  return v_class;
end;
$$;

-- Rời lớp (chủ lớp không thể tự rời, phải xoá lớp).
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
  if exists (select 1 from public.classes where id = p_class_id and owner_id = auth.uid()) then
    raise exception 'Chủ lớp không thể tự rời lớp.';
  end if;
  update public.class_members set status = 'left'
  where class_id = p_class_id and user_id = auth.uid();
end;
$$;

-- Danh sách lớp của tôi (chủ lớp hoặc thành viên đang hoạt động).
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

-- Chi tiết 1 lớp (kèm vai trò của người gọi).
drop function if exists public.get_class_detail(uuid);
create function public.get_class_detail(p_class_id uuid)
returns table (
  class_id     uuid,
  name         text,
  description  text,
  subject_slug text,
  class_code   text,
  owner_id     uuid,
  my_role      text,
  member_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id, c.name, c.description, c.subject_slug, c.class_code, c.owner_id, cm.role,
    (select count(*) from public.class_members m where m.class_id = c.id and m.status = 'active')::bigint
  from public.classes c
  join public.class_members cm on cm.class_id = c.id and cm.user_id = auth.uid() and cm.status = 'active'
  where c.id = p_class_id;
$$;

-- Danh sách thành viên (chỉ admin của lớp được gọi).
drop function if exists public.get_class_members(uuid);
create function public.get_class_members(p_class_id uuid)
returns table (
  user_id    uuid,
  full_name  text,
  email      text,
  role       text,
  joined_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Qualify bằng alias "cm": hàm này RETURNS TABLE có cột tên "user_id" và
  -- "role", nếu viết trần (không alias) PL/pgSQL sẽ báo lỗi "ambiguous" vì
  -- không phân biệt được đó là cột bảng hay tham số OUT của chính hàm.
  if not exists (
    select 1 from public.class_members cm0
    where cm0.class_id = p_class_id and cm0.user_id = auth.uid()
      and cm0.role = 'admin' and cm0.status = 'active'
  ) then
    raise exception 'Bạn không có quyền xem danh sách thành viên.';
  end if;

  return query
    select
      cm.user_id,
      coalesce(nullif(trim(p.full_name), ''), nullif(split_part(u.email, '@', 1), ''), 'Không tên'),
      u.email::text, cm.role, cm.joined_at
    from public.class_members cm
    left join public.profiles p on p.user_id = cm.user_id
    left join auth.users      u on u.id      = cm.user_id
    where cm.class_id = p_class_id and cm.status = 'active'
    order by (cm.role = 'admin') desc, cm.joined_at asc;
end;
$$;

-- Đổi vai trò thành viên (chỉ admin, không hạ quyền chủ lớp).
drop function if exists public.update_class_member_role(uuid, uuid, text);
create function public.update_class_member_role(p_class_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_role not in ('admin', 'member') then
    raise exception 'Vai trò không hợp lệ.';
  end if;
  if not exists (
    select 1 from public.class_members cm0
    where cm0.class_id = p_class_id and cm0.user_id = auth.uid()
      and cm0.role = 'admin' and cm0.status = 'active'
  ) then
    raise exception 'Bạn không có quyền thay đổi vai trò.';
  end if;
  if p_role = 'member' and exists (
    select 1 from public.classes where id = p_class_id and owner_id = p_user_id
  ) then
    raise exception 'Không thể hạ quyền chủ lớp.';
  end if;

  update public.class_members set role = p_role
  where class_id = p_class_id and user_id = p_user_id and status = 'active';
end;
$$;

-- Xoá thành viên khỏi lớp (chỉ admin, không xoá được chủ lớp).
drop function if exists public.remove_class_member(uuid, uuid);
create function public.remove_class_member(p_class_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.class_members cm0
    where cm0.class_id = p_class_id and cm0.user_id = auth.uid()
      and cm0.role = 'admin' and cm0.status = 'active'
  ) then
    raise exception 'Bạn không có quyền xoá thành viên.';
  end if;
  if exists (select 1 from public.classes where id = p_class_id and owner_id = p_user_id) then
    raise exception 'Không thể xoá chủ lớp.';
  end if;

  update public.class_members set status = 'left'
  where class_id = p_class_id and user_id = p_user_id;
end;
$$;

-- Tạo bài kiểm tra: chọn ngẫu nhiên p_question_count câu theo môn/bài, snapshot
-- thứ tự câu hỏi vào class_quiz_questions ngay lúc tạo (đề thống nhất cho cả lớp).
drop function if exists public.create_class_quiz(
  uuid, text, text, text, text, integer, integer, integer, timestamptz, timestamptz
);
create function public.create_class_quiz(
  p_class_id           uuid,
  p_title              text,
  p_description        text,
  p_subject_slug       text,
  p_lesson             text,
  p_question_count     integer,
  p_time_limit_minutes integer default null,
  p_max_attempts       integer default 1,
  p_start_at           timestamptz default null,
  p_end_at             timestamptz default null
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
  if not exists (
    select 1 from public.class_members
    where class_id = p_class_id and user_id = auth.uid() and role = 'admin' and status = 'active'
  ) then
    raise exception 'Bạn không có quyền tạo bài kiểm tra trong lớp này.';
  end if;
  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'Tên bài kiểm tra không được để trống.';
  end if;

  insert into public.class_quizzes (
    class_id, created_by, title, description, subject_slug, lesson,
    question_count, time_limit_minutes, max_attempts, start_at, end_at
  ) values (
    p_class_id, auth.uid(), trim(p_title),
    nullif(trim(coalesce(p_description, '')), ''),
    nullif(trim(coalesce(p_subject_slug, '')), ''),
    nullif(trim(coalesce(p_lesson, '')), ''),
    greatest(1, coalesce(p_question_count, 10)),
    p_time_limit_minutes,
    greatest(1, coalesce(p_max_attempts, 1)),
    p_start_at, p_end_at
  )
  returning * into v_quiz;

  insert into public.class_quiz_questions (class_quiz_id, question_id, question_order)
  select v_quiz.id, q.id, row_number() over (order by random())
  from public.questions q
  where (v_quiz.lesson is null or v_quiz.lesson = 'all' or q.lesson = v_quiz.lesson)
    and (v_quiz.subject_slug is null or q.subject_slug = v_quiz.subject_slug)
  order by random()
  limit v_quiz.question_count;

  select count(*) into v_count from public.class_quiz_questions where class_quiz_id = v_quiz.id;
  if v_count = 0 then
    delete from public.class_quizzes where id = v_quiz.id;
    raise exception 'Không tìm thấy câu hỏi phù hợp cho môn/bài đã chọn.';
  end if;

  update public.class_quizzes set question_count = v_count where id = v_quiz.id;
  v_quiz.question_count := v_count;
  return v_quiz;
end;
$$;

-- Danh sách bài kiểm tra trong lớp + trạng thái làm bài của người gọi.
drop function if exists public.get_class_quizzes(uuid);
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
  start_at           timestamptz,
  end_at             timestamptz,
  created_at         timestamptz,
  my_attempts        bigint,
  my_status          text,
  my_best_percent    numeric,
  submitted_count    bigint,
  total_members      bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.class_members
    where class_id = p_class_id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'Bạn không phải thành viên của lớp này.';
  end if;

  return query
    select
      q.id, q.title, q.description, q.subject_slug, q.lesson,
      q.question_count, q.time_limit_minutes, q.max_attempts,
      q.start_at, q.end_at, q.created_at,
      (select count(*) from public.class_quiz_attempts a
        where a.class_quiz_id = q.id and a.user_id = auth.uid())::bigint,
      coalesce((
        select a.status from public.class_quiz_attempts a
        where a.class_quiz_id = q.id and a.user_id = auth.uid()
        order by a.attempt_number desc limit 1
      ), 'not_started'),
      (select max(a.percent) from public.class_quiz_attempts a
        where a.class_quiz_id = q.id and a.user_id = auth.uid() and a.status = 'submitted'),
      (select count(*) from public.class_quiz_attempts a
        where a.class_quiz_id = q.id and a.status = 'submitted')::bigint,
      (select count(*) from public.class_members m
        where m.class_id = p_class_id and m.status = 'active')::bigint
    from public.class_quizzes q
    where q.class_id = p_class_id
    order by q.created_at desc;
end;
$$;

-- Xoá bài kiểm tra (chỉ admin lớp).
drop function if exists public.delete_class_quiz(uuid);
create function public.delete_class_quiz(p_quiz_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_id uuid;
begin
  select class_id into v_class_id from public.class_quizzes where id = p_quiz_id;
  if v_class_id is null then
    raise exception 'Không tìm thấy bài kiểm tra.';
  end if;
  if not exists (
    select 1 from public.class_members
    where class_id = v_class_id and user_id = auth.uid() and role = 'admin' and status = 'active'
  ) then
    raise exception 'Bạn không có quyền xoá bài kiểm tra này.';
  end if;

  delete from public.class_quizzes where id = p_quiz_id;
end;
$$;

-- Hạn nộp 1 lượt = sớm hơn giữa started_at + time_limit_minutes và end_at.
-- submit_class_quiz_attempt cho 120 giây ân hạn; nộp muộn hơn -> bỏ đáp án,
-- timed_out = true (chặn gọi thẳng RPC để nộp sau khi hết giờ).
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
revoke execute on function public.class_attempt_deadline(timestamptz, integer, timestamptz) from public, anon;
grant  execute on function public.class_attempt_deadline(timestamptz, integer, timestamptz) to authenticated;

-- Bắt đầu (hoặc tiếp tục) làm bài.
-- Thay đổi: trả thêm deadline_at (hạn do server tính, đã gồm end_at) và
-- server_now (để client bù lệch đồng hồ). 2 cột mới nằm CUỐI nên client cũ
-- vẫn chạy được. Lượt đang dở được trả về kể cả khi bài đã đóng, để client
-- tự nộp và đóng lượt đó (trước đây lượt dở bị kẹt vĩnh viễn ở in_progress).
drop function if exists public.start_class_quiz_attempt(uuid);
create function public.start_class_quiz_attempt(p_class_quiz_id uuid)
returns table (
  attempt_id         uuid,
  started_at         timestamptz,
  time_limit_minutes integer,
  question_id        uuid,
  question_order     integer,
  question_text      text,
  option_a           text,
  option_b           text,
  option_c           text,
  option_d           text,
  deadline_at        timestamptz,
  server_now         timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quiz          public.class_quizzes;
  v_attempt       public.class_quiz_attempts;
  v_attempt_count integer;
begin
  select * into v_quiz from public.class_quizzes where id = p_class_quiz_id;
  if v_quiz.id is null then
    raise exception 'Không tìm thấy bài kiểm tra.';
  end if;
  if not exists (
    select 1 from public.class_members
    where class_id = v_quiz.class_id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'Bạn không phải thành viên của lớp này.';
  end if;

  select * into v_attempt from public.class_quiz_attempts
  where class_quiz_id = p_class_quiz_id and user_id = auth.uid() and status = 'in_progress'
  order by attempt_number desc limit 1;

  if v_attempt.id is null then
    if v_quiz.start_at is not null and now() < v_quiz.start_at then
      raise exception 'Bài kiểm tra chưa mở.';
    end if;
    if v_quiz.end_at is not null and now() > v_quiz.end_at then
      raise exception 'Bài kiểm tra đã đóng.';
    end if;

    -- Khoá theo (quiz, user) để 2 tab bấm "Làm bài" cùng lúc không tạo 2 lượt.
    perform pg_advisory_xact_lock(hashtextextended(p_class_quiz_id::text || ':' || auth.uid()::text, 0));

    select * into v_attempt from public.class_quiz_attempts
    where class_quiz_id = p_class_quiz_id and user_id = auth.uid() and status = 'in_progress'
    order by attempt_number desc limit 1;

    if v_attempt.id is null then
      select count(*) into v_attempt_count from public.class_quiz_attempts
      where class_quiz_id = p_class_quiz_id and user_id = auth.uid();

      if v_attempt_count >= v_quiz.max_attempts then
        raise exception 'Bạn đã hết lượt làm bài kiểm tra này.';
      end if;

      insert into public.class_quiz_attempts (class_quiz_id, user_id, attempt_number, status)
      values (p_class_quiz_id, auth.uid(), v_attempt_count + 1, 'in_progress')
      returning * into v_attempt;
    end if;
  end if;

  return query
    select v_attempt.id, v_attempt.started_at, v_quiz.time_limit_minutes,
           cqq.question_id, cqq.question_order,
           q.question_text, q.option_a, q.option_b, q.option_c, q.option_d,
           public.class_attempt_deadline(v_attempt.started_at, v_quiz.time_limit_minutes, v_quiz.end_at),
           now()
    from public.class_quiz_questions cqq
    join public.questions q on q.id = cqq.question_id
    where cqq.class_quiz_id = p_class_quiz_id
    order by cqq.question_order asc;
end;
$$;

-- Nộp bài: chấm ở server. Thay đổi:
--  * khoá dòng attempt (for update) -> 2 request nộp song song không chấm 2 lần;
--  * quá hạn + 120s ân hạn -> bỏ toàn bộ đáp án gửi lên, timed_out = true;
--  * trả thêm cột timed_out (cuối bảng, client cũ không bị ảnh hưởng).
drop function if exists public.submit_class_quiz_attempt(uuid, jsonb);
create function public.submit_class_quiz_attempt(p_attempt_id uuid, p_answers jsonb)
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
  timed_out       boolean
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
  v_late     boolean := false;
  v_correct  integer := 0;
  v_total    integer := 0;
begin
  select * into v_attempt from public.class_quiz_attempts a
  where a.id = p_attempt_id
  for update;
  if v_attempt.id is null or v_attempt.user_id <> auth.uid() then
    raise exception 'Không tìm thấy bài làm.';
  end if;
  if v_attempt.status = 'submitted' then
    raise exception 'Bài làm này đã được nộp.';
  end if;

  select * into v_quiz from public.class_quizzes cq where cq.id = v_attempt.class_quiz_id;
  v_deadline := public.class_attempt_deadline(v_attempt.started_at, v_quiz.time_limit_minutes, v_quiz.end_at);
  v_late := v_deadline is not null and now() > v_deadline + c_grace;

  delete from public.class_quiz_answers cqa where cqa.attempt_id = p_attempt_id;

  insert into public.class_quiz_answers (
    attempt_id, question_id, question_order, question_text,
    option_a, option_b, option_c, option_d,
    correct_answer, explanation, selected_answer, is_correct
  )
  select
    p_attempt_id, cqq.question_id, cqq.question_order, q.question_text,
    q.option_a, q.option_b, q.option_c, q.option_d,
    q.correct_answer, q.explanation,
    ans.selected_answer,
    (ans.selected_answer is not null and ans.selected_answer = q.correct_answer)
  from public.class_quiz_questions cqq
  join public.questions q on q.id = cqq.question_id
  left join (
    select distinct on ((elem->>'question_id')::uuid)
           (elem->>'question_id')::uuid as question_id,
           upper(nullif(trim(elem->>'selected_answer'), '')) as selected_answer
    from jsonb_array_elements(
           case when v_late or jsonb_typeof(p_answers) is distinct from 'array'
                then '[]'::jsonb else p_answers end
         ) elem
  ) ans on ans.question_id = cqq.question_id
  where cqq.class_quiz_id = v_attempt.class_quiz_id;

  select count(*) filter (where cqa.is_correct), count(*)
    into v_correct, v_total
  from public.class_quiz_answers cqa where cqa.attempt_id = p_attempt_id;

  update public.class_quiz_attempts a
  set status = 'submitted',
      submitted_at = now(),
      timed_out = v_late,
      correct_count = v_correct,
      total_count = v_total,
      percent = case when v_total > 0 then round(v_correct::numeric / v_total * 100, 1) else 0 end
  where a.id = p_attempt_id;

  return query
    select a.question_order, a.question_text, a.option_a, a.option_b, a.option_c, a.option_d,
           a.correct_answer, a.selected_answer, a.is_correct, a.explanation, v_late
    from public.class_quiz_answers a
    where a.attempt_id = p_attempt_id
    order by a.question_order asc;
end;
$$;


-- Xem lại chi tiết 1 lượt làm bài đã nộp (chỉ chủ bài làm).
drop function if exists public.get_class_quiz_review(uuid);
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
  explanation     text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.class_quiz_attempts
    where id = p_attempt_id and user_id = auth.uid() and status = 'submitted'
  ) then
    raise exception 'Không tìm thấy bài làm đã nộp.';
  end if;

  return query
    select a.question_order, a.question_text, a.option_a, a.option_b, a.option_c, a.option_d,
           a.correct_answer, a.selected_answer, a.is_correct, a.explanation
    from public.class_quiz_answers a
    where a.attempt_id = p_attempt_id
    order by a.question_order asc;
end;
$$;

-- Bảng tổng kết cho admin: từng thành viên đã làm/chưa làm + điểm.
drop function if exists public.get_class_quiz_leaderboard(uuid);
create function public.get_class_quiz_leaderboard(p_class_quiz_id uuid)
returns table (
  user_id       uuid,
  full_name     text,
  status        text,
  correct_count integer,
  total_count   integer,
  percent       numeric,
  submitted_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_class_id uuid;
begin
  select cq0.class_id into v_class_id from public.class_quizzes cq0 where cq0.id = p_class_quiz_id;
  if v_class_id is null then
    raise exception 'Không tìm thấy bài kiểm tra.';
  end if;
  -- Qualify bằng alias "cm0": hàm này RETURNS TABLE có cột tên "user_id" và
  -- "status", viết trần sẽ bị PL/pgSQL báo "ambiguous".
  if not exists (
    select 1 from public.class_members cm0
    where cm0.class_id = v_class_id and cm0.user_id = auth.uid()
      and cm0.role = 'admin' and cm0.status = 'active'
  ) then
    raise exception 'Bạn không có quyền xem kết quả này.';
  end if;

  return query
    select
      m.user_id,
      coalesce(nullif(trim(p.full_name), ''), nullif(split_part(u.email, '@', 1), ''), 'Không tên') as v_full_name,
      coalesce(a.status, 'not_started'),
      a.correct_count, a.total_count, a.percent, a.submitted_at
    from public.class_members m
    left join public.profiles p on p.user_id = m.user_id
    left join auth.users      u on u.id      = m.user_id
    left join lateral (
      select * from public.class_quiz_attempts a2
      where a2.class_quiz_id = p_class_quiz_id and a2.user_id = m.user_id
      order by (a2.status = 'submitted') desc, a2.percent desc nulls last, a2.attempt_number desc
      limit 1
    ) a on true
    where m.class_id = v_class_id and m.status = 'active'
    order by (a.status = 'submitted') desc, coalesce(a.percent, -1) desc,
      coalesce(nullif(trim(p.full_name), ''), nullif(split_part(u.email, '@', 1), ''), 'Không tên') asc;
end;
$$;

-- 5.4 Quyền thực thi -----------------------------------------------------------
-- Toàn bộ tính năng lớp học yêu cầu đăng nhập -> chỉ grant cho authenticated.

revoke execute on function public.generate_class_code()                                                            from public, anon, authenticated;
revoke execute on function public.create_class(text, text, text)                                                    from public, anon;
revoke execute on function public.join_class_by_code(text)                                                          from public, anon;
revoke execute on function public.leave_class(uuid)                                                                 from public, anon;
revoke execute on function public.get_my_classes()                                                                  from public, anon;
revoke execute on function public.get_class_detail(uuid)                                                            from public, anon;
revoke execute on function public.get_class_members(uuid)                                                           from public, anon;
revoke execute on function public.update_class_member_role(uuid, uuid, text)                                        from public, anon;
revoke execute on function public.remove_class_member(uuid, uuid)                                                   from public, anon;
revoke execute on function public.create_class_quiz(uuid, text, text, text, text, integer, integer, integer, timestamptz, timestamptz) from public, anon;
revoke execute on function public.get_class_quizzes(uuid)                                                           from public, anon;
revoke execute on function public.delete_class_quiz(uuid)                                                           from public, anon;
revoke execute on function public.start_class_quiz_attempt(uuid)                                                    from public, anon;
revoke execute on function public.submit_class_quiz_attempt(uuid, jsonb)                                            from public, anon;
revoke execute on function public.get_class_quiz_review(uuid)                                                       from public, anon;
revoke execute on function public.get_class_quiz_leaderboard(uuid)                                                  from public, anon;

grant execute on function public.create_class(text, text, text)                                                    to authenticated;
grant execute on function public.join_class_by_code(text)                                                          to authenticated;
grant execute on function public.leave_class(uuid)                                                                 to authenticated;
grant execute on function public.get_my_classes()                                                                  to authenticated;
grant execute on function public.get_class_detail(uuid)                                                            to authenticated;
grant execute on function public.get_class_members(uuid)                                                           to authenticated;
grant execute on function public.update_class_member_role(uuid, uuid, text)                                        to authenticated;
grant execute on function public.remove_class_member(uuid, uuid)                                                   to authenticated;
grant execute on function public.create_class_quiz(uuid, text, text, text, text, integer, integer, integer, timestamptz, timestamptz) to authenticated;
grant execute on function public.get_class_quizzes(uuid)                                                           to authenticated;
grant execute on function public.delete_class_quiz(uuid)                                                           to authenticated;
grant execute on function public.start_class_quiz_attempt(uuid)                                                    to authenticated;
grant execute on function public.submit_class_quiz_attempt(uuid, jsonb)                                            to authenticated;
grant execute on function public.get_class_quiz_review(uuid)                                                       to authenticated;
grant execute on function public.get_class_quiz_leaderboard(uuid)                                                  to authenticated;

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
