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
