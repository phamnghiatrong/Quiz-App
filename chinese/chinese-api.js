/* chinese-api.js - Tra từ tiếng Trung cho mục "Tiếng Trung YCT" (trang "Tra từ mới").
 *
 * Gọi thẳng từ trình duyệt, không cần API key; nguồn nào lỗi thì bỏ qua:
 *   - Google Dịch (translate.googleapis.com, client=gtx):
 *       zh-CN -> vi : nghĩa tiếng Việt chính + pinyin (src_translit)
 *       zh-CN -> en : nghĩa theo từ loại (tiếng Anh, có điểm phổ biến)
 *       en -> vi    : dịch các nghĩa theo từ loại sang tiếng Việt
 *       vi -> zh-CN : khi người dùng gõ nghĩa tiếng Việt thay vì chữ Hán
 *     (endpoint không chính thức, có thể đổi; khi đó chỉ còn MyMemory cho nghĩa chính)
 *   - Tatoeba (api.tatoeba.org): câu ví dụ tiếng Trung thật (giản thể) kèm bản
 *     dịch tiếng Anh; pinyin + nghĩa tiếng Việt của câu lấy từ Google Dịch.
 * Đã thử 04/10/2026: Wiktionary không có trang định nghĩa cho từ tiếng Trung qua
 * REST API (404), Tatoeba bản API cũ (tatoeba.org/eng/api_v0) bị chặn CORS.
 */

const TIMEOUT_MS = 9000;
const enc = encodeURIComponent;

async function getJson(url, timeout = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) {
      const err = new Error('HTTP ' + r.status);
      err.status = r.status;
      throw err;
    }
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}
const settle = (p) => p.then((v) => ({ ok: true, v }), (e) => ({ ok: false, e }));

export const HAN_RE = /\p{Script=Han}/u;
export const hasHan = (s) => HAN_RE.test(String(s || ''));
/** Chỉ giữ chữ Hán (bỏ dấu câu, khoảng trắng, chữ Latin lẫn vào). */
export const onlyHan = (s) => [...String(s || '')].filter((ch) => HAN_RE.test(ch)).join('');

/** Pinyin bỏ dấu thanh, số thanh, khoảng trắng, dấu nháy: "Xuéxí" -> "xuexi". */
export function plainPinyin(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ü|v/g, 'u')
    .replace(/[^a-z]/g, '');
}

async function gtx(text, sl, tl, dt = ['t']) {
  const q = dt.map((d) => '&dt=' + d).join('');
  return getJson(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dj=1${q}&q=${enc(text)}`);
}
const gtxMain = (j) => (j && Array.isArray(j.sentences) ? j.sentences.filter((x) => typeof x.trans === 'string').map((x) => x.trans).join('').trim() : '');
const gtxTranslit = (j) => {
  const s = j && Array.isArray(j.sentences) ? j.sentences.find((x) => typeof x.src_translit === 'string' || typeof x.translit === 'string') : null;
  return s ? (s.src_translit || s.translit || '').trim() : '';
};

async function myMemory(text, pair) {
  const j = await getJson(`https://api.mymemory.translated.net/get?q=${enc(text)}&langpair=${pair}`);
  const t = String((j && j.responseData && j.responseData.translatedText) || '').trim();
  if (!t || j.quotaFinished || /MYMEMORY WARNING/i.test(t)) throw new Error('MyMemory lỗi');
  return t;
}

/** Pinyin của một từ/câu: "Wǒ měitiān xuéxí hànyǔ." -> giữ dấu thanh, chữ thường đầu câu. */
function tidyPinyin(p, { sentence = false } = {}) {
  const s = String(p || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return sentence ? s : s.toLowerCase();
}

/**
 * Nghĩa theo từ loại: lấy nghĩa tiếng Anh của Google (zh->en, có điểm) rồi dịch
 * các nghĩa phổ biến nhất sang tiếng Việt. Trả về [{ pos, en: [...], vi: [...] }].
 */
async function sensesOf(word) {
  const j = await gtx(word, 'zh-CN', 'en', ['t', 'bd']);
  const groups = [];
  for (const g of Array.isArray(j.dict) ? j.dict : []) {
    const entries = (Array.isArray(g.entry) ? g.entry : []).slice().sort((a, b) => (b.score || 0) - (a.score || 0));
    const en = [];
    for (const e of entries) {
      const w = String(e.word || '').trim();
      if (!w || en.includes(w)) continue;
      // Bỏ nghĩa quá hiếm (điểm rất thấp) nếu đã có ít nhất 2 nghĩa.
      if (en.length >= 2 && typeof e.score === 'number' && e.score < 0.0005) break;
      en.push(w);
      if (en.length >= 4) break;
    }
    if (en.length && groups.length < 3) groups.push({ pos: String(g.pos || '').toLowerCase(), en, vi: [] });
  }
  const flat = groups.flatMap((g) => g.en);
  if (flat.length) {
    try {
      const vj = await gtx(flat.join('\n'), 'en', 'vi');
      const parts = gtxMain(vj).split('\n').map((s) => s.trim());
      if (parts.length === flat.length) {
        let k = 0;
        for (const g of groups) {
          const seen = new Set();
          g.vi = g.en.map(() => parts[k++]).filter((v) => v && !seen.has(v.toLowerCase()) && seen.add(v.toLowerCase()));
        }
      }
    } catch (e) { /* chỉ hiện nghĩa tiếng Anh */ }
  }
  return { main: gtxMain(j), groups };
}

/**
 * Câu ví dụ từ Tatoeba (giản thể, có chứa từ, ngắn gọn), kèm pinyin + nghĩa Việt.
 * Tatoeba có lúc chậm (2-10 giây) nên giao diện gọi riêng hàm này sau khi đã
 * hiện nghĩa. Bỏ câu dịch hỏng (bản dịch còn chữ Hán) và câu trùng nghĩa.
 */
export async function examplesZh(word, max = 3) {
  const j = await getJson(`https://api.tatoeba.org/unstable/sentences?lang=cmn&q=${enc(word)}&trans:lang=eng&sort=relevance&limit=30`, 10000);
  const cand = (Array.isArray(j.data) ? j.data : [])
    .filter((s) => s.script !== 'Hant' && typeof s.text === 'string' && s.text.includes(word) && [...s.text].length <= 28 && [...s.text].length >= [...word].length + 2)
    .map((s) => {
      const tr = (s.translations || []).find((t) => t.lang === 'eng' && t.is_direct) || (s.translations || []).find((t) => t.lang === 'eng');
      return { zh: s.text.trim(), en: tr ? String(tr.text).trim() : '' };
    });
  // Ưu tiên câu vừa phải (6-16 chữ), bỏ câu trùng.
  const seen = new Set();
  const uniq = cand.filter((c) => !seen.has(c.zh) && seen.add(c.zh));
  uniq.sort((a, b) => Math.abs([...a.zh].length - 11) - Math.abs([...b.zh].length - 11));
  const picked = uniq.slice(0, max + 3);
  const filled = await Promise.all(picked.map(async (c) => {
    try {
      const g = await gtx(c.zh, 'zh-CN', 'vi', ['t', 'rm']);
      return { ...c, vi: gtxMain(g), py: tidyPinyin(gtxTranslit(g), { sentence: true }) };
    } catch (e) {
      return { ...c, vi: '', py: '' };
    }
  }));
  const seenEn = new Set();
  return filled
    .filter((c) => c.vi && c.py && !hasHan(c.vi))
    .filter((c) => { const k = c.en.toLowerCase() || c.vi.toLowerCase(); if (seenEn.has(k)) return false; seenEn.add(k); return true; })
    .slice(0, max);
}

/**
 * Tra một từ. `raw` có thể là chữ Hán (学习) hoặc nghĩa tiếng Việt (học tập):
 * nếu không có chữ Hán thì dịch Việt -> Trung trước rồi tra từ đó.
 * Trả về { word, query, fromVi, pinyin, meaningVi, meaningEn, senses: [{pos, en, vi}] }
 * (câu ví dụ: gọi examplesZh(word) riêng).
 */
export async function lookupZh(raw) {
  const query = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!query) { const e = new Error('Hãy nhập chữ Hán hoặc nghĩa tiếng Việt.'); e.code = 'INVALID'; throw e; }
  let word = onlyHan(query);
  let fromVi = false;
  if (!word) {
    // Không có chữ Hán: coi là nghĩa tiếng Việt (hoặc tiếng Anh), để Google tự nhận ngôn ngữ.
    const j = await gtx(query, 'auto', 'zh-CN');
    word = onlyHan(gtxMain(j));
    fromVi = true;
    if (!word) { const e = new Error(`Không tìm được từ tiếng Trung cho "${query}".`); e.code = 'NOTFOUND'; throw e; }
  }
  if ([...word].length > 12) { const e = new Error('Từ quá dài, hãy tra từng từ (tối đa 12 chữ Hán).'); e.code = 'INVALID'; throw e; }

  const [rVi, rSense] = await Promise.all([
    settle(gtx(word, 'zh-CN', 'vi', ['t', 'rm'])),
    settle(sensesOf(word)),
  ]);
  let meaningVi = rVi.ok ? gtxMain(rVi.v) : '';
  const pinyin = rVi.ok ? tidyPinyin(gtxTranslit(rVi.v)) : '';
  if (!meaningVi) {
    try { meaningVi = await myMemory(word, 'zh-CN|vi'); } catch (e) { /* bỏ qua */ }
  }
  if (meaningVi && onlyHan(meaningVi) === word) meaningVi = '';
  // Google viết hoa chữ đầu ("Tốt"): đổi về chữ thường cho giống từ điển.
  if (meaningVi && meaningVi.length <= 40 && !/[.!?]$/.test(meaningVi)) meaningVi = meaningVi.charAt(0).toLowerCase() + meaningVi.slice(1);
  const senses = rSense.ok ? rSense.v.groups : [];
  const meaningEn = rSense.ok ? rSense.v.main : '';
  return {
    word,
    query,
    fromVi,
    pinyin,
    meaningVi: meaningVi.slice(0, 200),
    meaningEn: meaningEn.slice(0, 200),
    senses,
    errors: [!rVi.ok && 'google', !rSense.ok && 'google-dict'].filter(Boolean),
  };
}
