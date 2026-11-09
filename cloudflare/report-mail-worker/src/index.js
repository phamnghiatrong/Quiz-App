// Cloudflare Worker: quiz-report-mail
// Nhận nội dung email (đã dựng sẵn) từ Supabase Edge Function `report-question` và gửi về
// hộp thư của tác giả bằng Cloudflare Email Routing (binding send_email).
//
// Bảo vệ: chỉ nhận request có header  Authorization: Bearer <REPORT_MAIL_SECRET>.
// REPORT_MAIL_SECRET đặt bằng `npx wrangler secret put REPORT_MAIL_SECRET`, giá trị phải
// giống secret cùng tên trong Supabase (Edge Functions > Secrets).
//
// Binding REPORT_MAILER bị khoá cứng chỉ gửi tới destination_address trong wrangler.toml,
// nên dù lộ secret thì cũng chỉ gửi được thư vào hộp thư của chính tác giả.

import { EmailMessage } from 'cloudflare:email';

const MAX_BODY_BYTES = 200_000;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// So sánh chuỗi không dừng sớm, tránh dò secret theo thời gian phản hồi.
function safeEqual(a, b) {
  const x = new TextEncoder().encode(String(a));
  const y = new TextEncoder().encode(String(b));
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i += 1) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function utf8Base64(text) {
  const bytes = new TextEncoder().encode(String(text));
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

// Base64 cho thân thư phải xuống dòng mỗi 76 ký tự (RFC 2045).
function wrap76(b64) {
  return b64.replace(/.{1,76}/g, '$&\r\n');
}

// Tiêu đề / tên hiển thị có dấu tiếng Việt: dùng encoded-word, chia nhỏ để mỗi đoạn < 75 ký tự.
function encodeWord(text) {
  const value = String(text ?? '').replace(/[\r\n]+/g, ' ').trim();
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  const chunks = [];
  let current = '';
  for (const ch of value) {
    if (new TextEncoder().encode(current + ch).length > 42) {
      chunks.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current) chunks.push(current);
  return chunks.map((c) => `=?UTF-8?B?${utf8Base64(c)}?=`).join('\r\n ');
}

function isEmail(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(value);
}

function mailbox(email, name) {
  return name ? `${encodeWord(name)} <${email}>` : `<${email}>`;
}

function buildMime({ from, fromName, to, replyTo, replyToName, subject, html, text, domain }) {
  const boundary = `quiz-${crypto.randomUUID()}`;
  const headers = [
    `From: ${mailbox(from, fromName)}`,
    `To: <${to}>`,
    replyTo ? `Reply-To: ${mailbox(replyTo, replyToName)}` : null,
    `Subject: ${encodeWord(subject)}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean);

  const part = (type, body) => [
    `--${boundary}`,
    `Content-Type: ${type}; charset=UTF-8`,
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(utf8Base64(body)),
  ].join('\r\n');

  return [
    headers.join('\r\n'),
    '',
    part('text/plain', text || ''),
    part('text/html', html || ''),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const secret = env.REPORT_MAIL_SECRET;
    if (!secret) return json({ error: 'REPORT_MAIL_SECRET chưa được đặt' }, 500);
    const auth = request.headers.get('Authorization') || '';
    if (!safeEqual(auth, `Bearer ${secret}`)) return json({ error: 'Unauthorized' }, 401);

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: 'Nội dung quá lớn' }, 413);

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return json({ error: 'JSON không hợp lệ' }, 400);
    }

    const subject = String(data.subject || '').slice(0, 250);
    if (!subject || (!data.html && !data.text)) return json({ error: 'Thiếu tiêu đề hoặc nội dung' }, 400);

    const from = env.MAIL_FROM;
    const to = env.MAIL_TO;
    const replyTo = isEmail(data.reply_to?.email) ? data.reply_to.email : '';

    const mime = buildMime({
      from,
      fromName: env.MAIL_FROM_NAME || 'Quiz App',
      to,
      replyTo,
      replyToName: replyTo ? String(data.reply_to?.name || '').slice(0, 100) : '',
      subject,
      html: String(data.html || ''),
      text: String(data.text || ''),
      domain: from.split('@')[1],
    });

    try {
      await env.REPORT_MAILER.send(new EmailMessage(from, to, mime));
    } catch (err) {
      return json({ error: `Gửi mail thất bại: ${String(err?.message || err).slice(0, 300)}` }, 502);
    }
    return json({ ok: true });
  },
};
