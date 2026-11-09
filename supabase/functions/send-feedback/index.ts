// Edge Function: send-feedback
// Nhận góp ý từ trang Góp ý, lưu vào bảng feedback_messages (RPC submit_feedback, chạy bằng
// JWT của người dùng), rồi gửi email cho tác giả qua Cloudflare Worker quiz-report-mail
// (dùng chung secret REPORT_MAIL_SECRET với Edge Function report-question).

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CATEGORY_LABELS: Record<string, string> = {
  feature: 'Đề xuất tính năng mới',
  ui: 'Giao diện, trải nghiệm sử dụng',
  bug: 'Báo lỗi ứng dụng',
  content: 'Nội dung câu hỏi, môn học',
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

function str(value: unknown, max = 300): string {
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

function buildEmail(fb: Record<string, any>, context: Record<string, any>) {
  const reporter = fb.reporter || {};
  const category = CATEGORY_LABELS[fb.category] || CATEGORY_LABELS.other;
  const created = formatVnTime(fb.created_at || new Date().toISOString());
  const preview = String(fb.content || '').replace(/\s+/g, ' ').slice(0, 60);
  const subject = `[Quiz App] Góp ý: ${category} - ${preview}${String(fb.content || '').length > 60 ? '...' : ''}`;

  const td = 'padding:6px 10px;border:1px solid #e2e8f0;vertical-align:top;';
  const th = `${td}background:#f8fafc;font-weight:600;white-space:nowrap;width:150px;`;
  const h2 = 'margin:24px 0 8px;font-size:16px;color:#6d28d9;';
  const row = (label: string, valueHtml: string) =>
    `<tr><td style="${th}">${esc(label)}</td><td style="${td}">${valueHtml || '<span style="color:#94a3b8">-</span>'}</td></tr>`;

  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0f172a;line-height:1.5;max-width:720px;">
  <h1 style="font-size:20px;margin:0 0 4px;">Góp ý về ứng dụng - Quiz App</h1>
  <p style="margin:0;color:#475569;">Gửi lúc ${esc(created)} (giờ Việt Nam) · Mã góp ý: <code>${esc(fb.feedback_id)}</code></p>

  <h2 style="${h2}">1. Nội dung góp ý</h2>
  <table style="border-collapse:collapse;width:100%;">
    ${row('Loại góp ý', `<b>${esc(category)}</b>`)}
    ${row('Nội dung', esc(fb.content).replace(/\n/g, '<br>'))}
  </table>

  <h2 style="${h2}">2. Người gửi</h2>
  <table style="border-collapse:collapse;width:100%;">
    ${row('Họ tên', esc(reporter.name || ''))}
    ${row('Email', esc(reporter.email || ''))}
    ${row('Mã sinh viên', esc(reporter.student_code || ''))}
    ${row('Phiên bản app', esc(str(context.app_version, 40)))}
    ${row('Thiết bị', esc(str(context.user_agent, 300)))}
  </table>
  <p style="margin-top:24px;color:#94a3b8;font-size:12px;">Email tự động từ trang Góp ý của Quiz App. Trả lời email này để phản hồi trực tiếp cho người gửi.</p>
</body></html>`;

  const text = [
    'GÓP Ý VỀ ỨNG DỤNG - QUIZ APP',
    `Thời gian: ${created} | Mã góp ý: ${fb.feedback_id}`,
    '',
    `Loại góp ý: ${category}`,
    'Nội dung:',
    String(fb.content || ''),
    '',
    `Người gửi: ${reporter.name || '-'} | ${reporter.email || '-'} | MSSV: ${reporter.student_code || '-'}`,
  ].join('\n');

  return { subject: subject.slice(0, 250), html, text };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Bạn cần đăng nhập để gửi góp ý.' }, 401);

  let payload: Record<string, any>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Dữ liệu gửi lên không hợp lệ.' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const context = (payload.context && typeof payload.context === 'object' && !Array.isArray(payload.context))
    ? payload.context
    : {};

  const { data: fb, error } = await userClient.rpc('submit_feedback', {
    p_content: typeof payload.content === 'string' ? payload.content.slice(0, 4000) : '',
    p_category: typeof payload.category === 'string' ? payload.category : 'other',
    p_context: context,
  });

  if (error) {
    const status = error.code === 'P0001' ? 400 : (error.code === '42501' ? 401 : 500);
    console.error('submit_feedback', error.code, error.message);
    return json({ error: status === 500 ? 'Không lưu được góp ý, vui lòng thử lại.' : error.message }, status);
  }

  let emailed = false;
  let emailError: string | null = null;
  const workerSecret = Deno.env.get('REPORT_MAIL_SECRET');
  const workerUrl = Deno.env.get('REPORT_MAIL_WORKER_URL') || 'https://report-mail.phamnghiatrong.com';

  if (!workerSecret) {
    emailError = 'Chưa cấu hình REPORT_MAIL_SECRET';
  } else {
    try {
      const mail = buildEmail(fb, context);
      const reporter = fb.reporter || {};
      const res = await fetch(workerUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${workerSecret.trim()}`, 'Content-Type': 'application/json' },
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
  }

  if (emailError) console.error('send-feedback email', emailError);

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (serviceKey && fb?.feedback_id) {
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    await admin.from('feedback_messages')
      .update({ email_sent: emailed, email_error: emailError })
      .eq('id', fb.feedback_id);
  }

  return json({ ok: true, feedback_id: fb?.feedback_id, emailed });
});
