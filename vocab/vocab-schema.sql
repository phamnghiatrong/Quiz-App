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
