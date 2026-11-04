-- =============================================================================
-- Bảng xếp hạng: mỗi người một hạng riêng, không đồng hạng.
--
-- Trước đây: dense_rank() theo điểm, nên 2 người cùng điểm cùng hạng.
-- Bây giờ: row_number(). Bằng điểm thì ai ít lượt thi hơn xếp trên, tiếp theo là
-- ai có lượt thi cuối sớm hơn, cuối cùng theo tên.
--
-- Cách chạy: mở Supabase > SQL Editor, dán toàn bộ file này rồi Run.
-- An toàn: chỉ thay định nghĩa hàm, không đụng dữ liệu. Chạy lại nhiều lần được.
-- Dùng create or replace (cùng tham số, cùng kiểu trả về) nên quyền EXECUTE đã cấp
-- vẫn giữ nguyên, không cần grant lại.
--
-- App không phụ thuộc vào thứ tự chạy: chưa chạy migration thì BXH vẫn hoạt động
-- với cách xếp hạng cũ.
-- =============================================================================

create or replace function public.get_leaderboard(
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

-- Kiểm tra sau khi chạy (thay slug môn nếu muốn): cột rank phải tăng liên tục 1, 2, 3...
-- select rank, full_name, best_score, attempts from public.get_leaderboard(50, 'tieng-anh-2');
