// Edge Function: report-question
// Nhận báo cáo câu hỏi từ màn làm bài, lưu vào bảng question_reports (qua RPC
// submit_question_report, chạy bằng JWT của chính người dùng), rồi gửi email cho tác giả.
//
// Cách gửi mail (ưu tiên theo thứ tự):
//   1. Cloudflare Worker `quiz-report-mail` (thư mục cloudflare/report-mail-worker), dùng
//      Cloudflare Email Routing. Cần secret REPORT_MAIL_SECRET (giống secret của Worker);
//      tuỳ chọn REPORT_MAIL_WORKER_URL, mặc định https://report-mail.phamnghiatrong.com
//   2. Brevo API, nếu có secret BREVO_API_KEY (dự phòng; REPORT_TO_EMAIL, REPORT_FROM_EMAIL,
//      REPORT_FROM_NAME tuỳ chọn).
// Không có cách nào được cấu hình: báo cáo vẫn được lưu, chỉ không gửi mail (email_sent = false).

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CATEGORY_LABELS: Record<string, string> = {
  wrong_answer: 'Đáp án đúng bị sai',
  question_error: 'Đề bài sai, thiếu chữ hoặc lỗi chính tả',
  option_error: 'Phương án trả lời sai, bị lặp chữ hoặc chép nhầm',
  multiple_or_none: 'Có nhiều đáp án đúng hoặc không có đáp án nào đúng',
  explanation_error: 'Giải thích sai hoặc khó hiểu',
  wrong_place: 'Câu hỏi nằm sai môn / sai bài hoặc bị trùng',
  display_error: 'Lỗi hiển thị (mất chữ, lỗi font, tràn khung)',
  other: 'Vấn đề khác',
};
const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);
// Nhãn ngắn cho tiêu đề email.
const CATEGORY_SHORT: Record<string, string> = {
  wrong_answer: 'Sai đáp án',
  question_error: 'Lỗi đề bài',
  option_error: 'Lỗi phương án',
  multiple_or_none: 'Nhiều/không có đáp án đúng',
  explanation_error: 'Lỗi giải thích',
  wrong_place: 'Sai môn/bài',
  display_error: 'Lỗi hiển thị',
  other: 'Khác',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function str(value: unknown, max = 2000): string {
  if (value === null || value === undefined) return '';
  return String(value).slice(0, max).trim();
}

function formatVnTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      day: '2-digit', month: '2-digit', year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type Question = {
  id?: string;
  question_text?: string;
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
  correct_answer?: string;
  explanation?: string;
  lesson?: string;
  level?: string;
  subject_slug?: string;
  subject_name?: string;
  source?: string;
};

function buildEmail(report: Record<string, any>, context: Record<string, any>) {
  const categories: string[] = Array.isArray(report.categories) ? report.categories : [];
  const suggested = str(report.suggested_answer, 1);
  const note = str(report.note, 1000);
  const reporter = report.reporter || {};

  // Ưu tiên dữ liệu câu hỏi lấy từ DB; nếu câu không có trong DB thì dùng bản trình duyệt gửi kèm.
  const fromDb = Boolean(report.question);
  const client = (context.client_question && typeof context.client_question === 'object') ? context.client_question : {};
  const q: Question = fromDb ? report.question : {
    id: str(client.id, 64),
    question_text: str(client.question_text),
    option_a: str(client.option_a, 500),
    option_b: str(client.option_b, 500),
    option_c: str(client.option_c, 500),
    option_d: str(client.option_d, 500),
    correct_answer: str(client.correct_answer, 1),
    explanation: str(client.explanation),
    lesson: str(client.lesson, 200),
    subject_slug: str(client.subject_slug, 100),
    subject_name: str(context.subject_name, 200),
  };

  const subjectName = q.subject_name || str(context.subject_name, 200) || q.subject_slug || '(không rõ môn)';
  const selected = str(context.selected_answer, 1).toUpperCase();
  const qIndex = Math.trunc(Number(context.question_index)) || 0;
  const qTotal = Math.trunc(Number(context.question_total)) || 0;
  const position = qIndex > 0 ? `Câu ${qIndex}/${qTotal || '?'}` : '';
  const quizTitle = str(context.quiz_title, 200);
  // Tiêu đề bài thường đã chứa tên chế độ ("Luyện tập (...)"), khi đó không ghi lặp lại.
  const modeLabelRaw = str(context.mode_label, 80);
  const modeLabel = modeLabelRaw && !quizTitle.startsWith(modeLabelRaw) ? modeLabelRaw : '';
  const created = formatVnTime(report.created_at || new Date().toISOString());

  const options = (['A', 'B', 'C', 'D'] as const)
    .map((key) => ({ key, text: str((q as any)[`option_${key.toLowerCase()}`], 500) }))
    .filter((o) => o.text !== '');

  const shortLabels = categories.map((c) => CATEGORY_SHORT[c] || c);
  const subject = `[Quiz App] Báo cáo: ${shortLabels.join(', ')} - ${subjectName}${position ? ` - ${position}` : ''}`;

  const td = 'padding:6px 10px;border:1px solid #e2e8f0;vertical-align:top;';
  const th = `${td}background:#f8fafc;font-weight:600;white-space:nowrap;width:150px;`;
  const h2 = 'margin:24px 0 8px;font-size:16px;color:#6d28d9;';
  const row = (label: string, valueHtml: string) =>
    `<tr><td style="${th}">${esc(label)}</td><td style="${td}">${valueHtml || '<span style="color:#94a3b8">-</span>'}</td></tr>`;

  const checklist = CATEGORY_ORDER.map((c) => {
    const on = categories.includes(c);
    return `<li style="margin:2px 0;${on ? 'font-weight:700;color:#b91c1c;' : 'color:#94a3b8;'}">[${on ? 'x' : '&nbsp;&nbsp;'}] ${esc(CATEGORY_LABELS[c])}</li>`;
  }).join('');

  const optionRows = options.map((o) => {
    const tags: string[] = [];
    if (o.key === q.correct_answer) tags.push('<b style="color:#15803d">đáp án hiện tại</b>');
    if (o.key === selected) tags.push('<b style="color:#1d4ed8">người dùng chọn</b>');
    if (o.key === suggested) tags.push('<b style="color:#b91c1c">đề xuất là đúng</b>');
    return `<tr><td style="${th}">${o.key}</td><td style="${td}">${esc(o.text)}${tags.length ? ` &nbsp;(${tags.join(', ')})` : ''}</td></tr>`;
  }).join('');

  const sqlHint = (fromDb && q.id && suggested && suggested !== q.correct_answer)
    ? `<h2 style="${h2}">5. Gợi ý sửa nhanh (chạy trong SQL Editor sau khi đã kiểm tra)</h2>
       <pre style="background:#0f172a;color:#e2e8f0;padding:10px;border-radius:6px;white-space:pre-wrap;">update public.questions set correct_answer = '${esc(suggested)}' where id = '${esc(q.id)}';
update public.question_reports set status = 'resolved', resolved_at = now() where id = '${esc(report.report_id)}';</pre>`
    : '';

  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0f172a;line-height:1.5;max-width:720px;">
  <h1 style="font-size:20px;margin:0 0 4px;">Báo cáo câu hỏi - Quiz App</h1>
  <p style="margin:0;color:#475569;">Gửi lúc ${esc(created)} (giờ Việt Nam) · Mã báo cáo: <code>${esc(report.report_id)}</code></p>

  <h2 style="${h2}">1. Vấn đề được báo cáo</h2>
  <ul style="list-style:none;padding:0;margin:0;">${checklist}</ul>
  <table style="border-collapse:collapse;margin-top:10px;width:100%;">
    ${row('Đáp án đề xuất', suggested ? `<b>${esc(suggested)}</b>${q.correct_answer ? ` (hiện tại đang là ${esc(q.correct_answer)})` : ''}` : '')}
    ${row('Mô tả thêm', note ? esc(note).replace(/\n/g, '<br>') : '')}
  </table>

  <h2 style="${h2}">2. Câu hỏi</h2>
  <table style="border-collapse:collapse;width:100%;">
    ${row('Môn học', esc(subjectName))}
    ${row('Bài / phần', esc(q.lesson || ''))}
    ${row('Vị trí', [position, modeLabel, quizTitle].filter(Boolean).map(esc).join(' · '))}
    ${row('Mức độ', esc(q.level || ''))}
    ${row('ID câu hỏi', q.id ? `<code>${esc(q.id)}</code>` : '')}
    ${row('Nguồn dữ liệu', fromDb ? 'Bảng questions (dữ liệu thật trên server)' : '<b style="color:#b45309">Không tìm thấy trong DB, đây là dữ liệu trình duyệt gửi kèm</b>')}
    ${row('Đề bài', `<b>${esc(q.question_text || '')}</b>`)}
  </table>

  <h2 style="${h2}">3. Phương án và đáp án</h2>
  <table style="border-collapse:collapse;width:100%;">
    ${optionRows}
    ${row('Đáp án hiện tại', esc(q.correct_answer || ''))}
    ${row('Giải thích', esc(q.explanation || '').replace(/\n/g, '<br>'))}
  </table>

  <h2 style="${h2}">4. Người báo cáo</h2>
  <table style="border-collapse:collapse;width:100%;">
    ${row('Họ tên', esc(reporter.name || ''))}
    ${row('Email', esc(reporter.email || ''))}
    ${row('Mã sinh viên', esc(reporter.student_code || ''))}
    ${row('Đã chọn', selected ? esc(selected) : 'Chưa trả lời câu này')}
    ${row('Thiết bị', esc(str(context.user_agent, 300)))}
  </table>
  ${sqlHint}
  <p style="margin-top:24px;color:#94a3b8;font-size:12px;">Email tự động từ nút "Báo cáo" ở màn làm bài của Quiz App. Trả lời email này để phản hồi trực tiếp cho người báo cáo.</p>
</body></html>`;

  const text = [
    'BÁO CÁO CÂU HỎI - QUIZ APP',
    `Thời gian: ${created} | Mã báo cáo: ${report.report_id}`,
    '',
    '1. VẤN ĐỀ ĐƯỢC BÁO CÁO',
    ...CATEGORY_ORDER.map((c) => `[${categories.includes(c) ? 'x' : ' '}] ${CATEGORY_LABELS[c]}`),
    `Đáp án đề xuất: ${suggested || '-'}`,
    `Mô tả thêm: ${note || '-'}`,
    '',
    '2. CÂU HỎI',
    `Môn: ${subjectName} | Bài: ${q.lesson || '-'} | ${[position, modeLabel, quizTitle].filter(Boolean).join(' · ')}`,
    `ID: ${q.id || '-'}${fromDb ? '' : ' (không có trong DB)'}`,
    `Đề: ${q.question_text || ''}`,
    ...options.map((o) => `${o.key}. ${o.text}`),
    `Đáp án hiện tại: ${q.correct_answer || '-'}`,
    `Giải thích: ${q.explanation || '-'}`,
    '',
    '3. NGƯỜI BÁO CÁO',
    `${reporter.name || '-'} | ${reporter.email || '-'} | MSSV: ${reporter.student_code || '-'} | Đã chọn: ${selected || '-'}`,
  ].join('\n');

  return { subject: subject.slice(0, 250), html, text };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Bạn cần đăng nhập để gửi báo cáo.' }, 401);

  let payload: Record<string, any>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Dữ liệu gửi lên không hợp lệ.' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const context = (payload.context && typeof payload.context === 'object' && !Array.isArray(payload.context))
    ? payload.context
    : {};
  const questionId = typeof payload.question_id === 'string' && /^[0-9a-f-]{36}$/i.test(payload.question_id)
    ? payload.question_id
    : null;

  const { data: report, error } = await userClient.rpc('submit_question_report', {
    p_question_id: questionId,
    p_categories: Array.isArray(payload.categories) ? payload.categories.map(String).slice(0, 10) : [],
    p_suggested_answer: payload.suggested_answer ? String(payload.suggested_answer) : null,
    p_note: payload.note ? String(payload.note) : null,
    p_context: context,
  });

  if (error) {
    // Lỗi do RPC tự raise (kiểm tra dữ liệu, chống spam) -> báo nguyên văn cho người dùng.
    const status = error.code === 'P0001' ? 400 : (error.code === '42501' ? 401 : 500);
    console.error('submit_question_report', error.code, error.message);
    return json({ error: status === 500 ? 'Không lưu được báo cáo, vui lòng thử lại.' : error.message }, status);
  }

  const mail = buildEmail(report, context);
  const reporter = report.reporter || {};
  let emailed = false;
  let emailError: string | null = null;

  const workerSecret = Deno.env.get('REPORT_MAIL_SECRET');
  const workerUrl = Deno.env.get('REPORT_MAIL_WORKER_URL') || 'https://report-mail.phamnghiatrong.com';
  const brevoKey = Deno.env.get('BREVO_API_KEY');

  if (workerSecret) {
    // 1. Cloudflare Worker (Email Routing)
    try {
      const res = await fetch(workerUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${workerSecret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          reply_to: reporter.email ? { email: reporter.email, name: reporter.name || '' } : null,
        }),
      });
      if (res.ok) {
        emailed = true;
      } else {
        emailError = `Cloudflare ${res.status}: ${(await res.text()).slice(0, 300)}`;
      }
    } catch (err) {
      emailError = `Cloudflare: ${String((err as Error)?.message || err).slice(0, 300)}`;
    }
  } else if (brevoKey) {
    // 2. Brevo (dự phòng)
    const toEmail = Deno.env.get('REPORT_TO_EMAIL') || 'tp058235@gmail.com';
    const fromEmail = Deno.env.get('REPORT_FROM_EMAIL') || toEmail;
    const fromName = Deno.env.get('REPORT_FROM_NAME') || 'Quiz App';
    try {
      const body: Record<string, unknown> = {
        sender: { name: fromName, email: fromEmail },
        to: [{ email: toEmail }],
        subject: mail.subject,
        htmlContent: mail.html,
        textContent: mail.text,
        tags: ['question-report'],
      };
      if (reporter.email) body.replyTo = { email: reporter.email, name: reporter.name || reporter.email };
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevoKey, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        emailed = true;
      } else {
        emailError = `Brevo ${res.status}: ${(await res.text()).slice(0, 300)}`;
      }
    } catch (err) {
      emailError = `Brevo: ${String((err as Error)?.message || err).slice(0, 300)}`;
    }
  } else {
    emailError = 'Chưa cấu hình gửi mail (thiếu REPORT_MAIL_SECRET và BREVO_API_KEY)';
  }

  if (emailError) console.error('report-question email', emailError);

  // Ghi trạng thái gửi mail (cần service role vì người dùng không có quyền UPDATE).
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (serviceKey && report?.report_id) {
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    await admin.from('question_reports')
      .update({ email_sent: emailed, email_error: emailError })
      .eq('id', report.report_id);
  }

  return json({ ok: true, report_id: report?.report_id, emailed });
});
