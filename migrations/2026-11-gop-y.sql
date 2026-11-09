-- =============================================================================
-- Góp ý gửi thẳng (không phải mở Gmail) - 09/11/2026
-- Chạy lại nhiều lần không lỗi.
--
-- Luồng: app.js -> Edge Function `send-feedback` (JWT người dùng) -> RPC submit_feedback()
--        lưu góp ý + trả thông tin người gửi -> Edge Function dựng email -> Cloudflare Worker
--        quiz-report-mail (dùng chung với Báo cáo câu hỏi) -> hộp thư tác giả.
-- =============================================================================

create table if not exists public.feedback_messages (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  category     text not null default 'other'
               check (category in ('feature','ui','bug','content','other')),
  content      text not null,
  context      jsonb not null default '{}'::jsonb,
  status       text not null default 'new' check (status in ('new','done','ignored')),
  email_sent   boolean not null default false,
  email_error  text,
  created_at   timestamptz not null default now()
);

create index if not exists feedback_messages_user_created_idx
  on public.feedback_messages (user_id, created_at desc);
create index if not exists feedback_messages_status_idx
  on public.feedback_messages (status, created_at desc);

alter table public.feedback_messages enable row level security;

revoke insert, update, delete, truncate on public.feedback_messages from anon, authenticated;
revoke all on public.feedback_messages from anon;

drop policy if exists feedback_messages_select_own on public.feedback_messages;
create policy feedback_messages_select_own on public.feedback_messages
  for select to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
create or replace function public.submit_feedback(
  p_content  text,
  p_category text default 'other',
  p_context  jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_content  text := btrim(coalesce(p_content, ''));
  v_category text := coalesce(nullif(btrim(p_category), ''), 'other');
  v_context  jsonb := coalesce(p_context, '{}'::jsonb);
  v_name     text;
  v_email    text;
  v_code     text;
  v_id       uuid;
  v_created  timestamptz;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập để gửi góp ý.';
  end if;
  if v_category not in ('feature','ui','bug','content','other') then
    raise exception 'Loại góp ý không hợp lệ.';
  end if;
  if char_length(v_content) < 5 then
    raise exception 'Nội dung góp ý quá ngắn (ít nhất 5 ký tự).';
  end if;
  if char_length(v_content) > 3000 then
    raise exception 'Nội dung góp ý tối đa 3000 ký tự.';
  end if;
  if jsonb_typeof(v_context) <> 'object' or octet_length(v_context::text) > 4000 then
    raise exception 'Dữ liệu kèm theo không hợp lệ.';
  end if;

  -- Chống spam: tối đa 5 góp ý / giờ / tài khoản, nội dung giống hệt trong 10 phút bị chặn.
  if (select count(*) from public.feedback_messages f
       where f.user_id = v_uid and f.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Bạn đã gửi 5 góp ý trong 1 giờ qua. Vui lòng thử lại sau.';
  end if;
  if exists (select 1 from public.feedback_messages f
              where f.user_id = v_uid and f.content = v_content
                and f.created_at > now() - interval '10 minutes') then
    raise exception 'Bạn vừa gửi góp ý này rồi. Cảm ơn bạn!';
  end if;

  select p.full_name, p.student_code into v_name, v_code
    from public.profiles p where p.user_id = v_uid limit 1;
  select u.email::text into v_email from auth.users u where u.id = v_uid;

  insert into public.feedback_messages (user_id, category, content, context)
  values (v_uid, v_category, v_content, v_context)
  returning id, created_at into v_id, v_created;

  return jsonb_build_object(
    'feedback_id', v_id,
    'created_at', v_created,
    'category', v_category,
    'content', v_content,
    'reporter', jsonb_build_object('name', v_name, 'email', v_email, 'student_code', v_code)
  );
end;
$$;

revoke all on function public.submit_feedback(text, text, jsonb) from public, anon;
grant execute on function public.submit_feedback(text, text, jsonb) to authenticated;
