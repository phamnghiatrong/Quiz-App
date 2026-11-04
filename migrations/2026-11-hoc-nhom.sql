-- =============================================================================
-- Học nhóm: làm lại tính năng Lớp học.
--   * Tham gia nhóm phải được duyệt, thêm Mã sinh viên.
--   * Chủ nhóm / quản trị viên / người tham gia có quyền khác nhau, kiểm tra ở server.
--   * Bài kiểm tra có mật khẩu, chủ nhóm bấm Bắt đầu mới mở, hết giờ tự đóng.
--   * Lưu đáp án tự động lên server, hết giờ server tự chấm theo đáp án đã lưu.
--   * Điểm và đáp án chỉ hiện sau khi bài kết thúc.
--
-- Cách chạy: mở Supabase > SQL Editor, dán toàn bộ file này rồi Run.
-- Chạy lại nhiều lần không lỗi. Tên bảng và tên hàm cũ (classes, class_members...)
-- giữ nguyên, chỉ tên hiển thị đổi thành "nhóm".
-- =============================================================================

-- [BẢNG-BẮT-ĐẦU]
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
-- [BẢNG-KẾT-THÚC]

-- [RPC-BẮT-ĐẦU]
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
-- [RPC-KẾT-THÚC]

notify pgrst, 'reload schema';
