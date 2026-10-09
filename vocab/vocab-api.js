/* vocab-api.js - Phần gọi dịch vụ ngoài cho mục "Từ vựng tiếng Anh".
 *
 * Tất cả là dịch vụ miễn phí, gọi thẳng từ trình duyệt (CORS mở), không cần
 * API key. Mỗi nguồn đều có thể lỗi/chậm nên luôn gọi song song, có hạn giờ,
 * và nguồn nào hỏng thì bỏ qua:
 *   - Wiktionary (en.wiktionary.org): phiên âm IPA Anh-Anh / Anh-Mỹ, nghĩa
 *     tiếng Anh theo từ loại, câu ví dụ.
 *   - Google Dịch (translate.googleapis.com, client=gtx): nghĩa tiếng Việt
 *     chính + nghĩa theo từ loại + phiên âm dự phòng; dịch câu ví dụ / câu
 *     người dùng tự đặt.
 *   - MyMemory (api.mymemory.translated.net): dịch dự phòng khi Google lỗi.
 *   - Datamuse (api.datamuse.com): IPA/nghĩa dự phòng, gợi ý khi gõ sai chính tả.
 *   - LanguageTool (api.languagetool.org): soát ngữ pháp câu người dùng đặt
 *     (bản miễn phí: tối đa 20 lần/phút mỗi IP).
 * Lưu ý: dictionaryapi.dev không truy cập được từ mạng VN lúc thử (04/10/2026)
 * nên không dùng.
 */

const TIMEOUT_MS = 9000;

async function getJson(url, { timeout = TIMEOUT_MS, init } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
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
const enc = encodeURIComponent;

/** Chuẩn hoá từ người dùng gõ: bỏ khoảng trắng thừa, dấu câu ở hai đầu. */
export function normalizeWord(raw) {
  return String(raw ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '')
    .slice(0, 64);
}
/** Chỉ nhận chữ cái Latin, khoảng trắng, gạch nối, nháy đơn, dấu chấm (e.g.). */
export const isValidWord = (w) => /^[A-Za-z][A-Za-z .'-]{0,63}$/.test(w);

/* ------------------------------------------------------------------ */
/* Bóc chữ khỏi HTML của Wiktionary                                    */
/* ------------------------------------------------------------------ */
function htmlToText(html, { dropLists = true } = {}) {
  const src = String(html || '');
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(`<div>${src}</div>`, 'text/html');
    const box = doc.body.firstElementChild;
    box.querySelectorAll('style, link, script, sup.reference' + (dropLists ? ', ol, ul, dl' : '')).forEach((n) => n.remove());
    return box.textContent.replace(/\s+/g, ' ').trim();
  }
  let s = src.replace(/<style[\s\S]*?<\/style>/gi, '');
  if (dropLists) s = s.replace(/<(ol|ul|dl)[\s\S]*?<\/\1>/gi, '');
  return s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------ */
/* Từ loại                                                             */
/* ------------------------------------------------------------------ */
const POS_VI = {
  noun: 'danh từ', 'proper noun': 'danh từ riêng', verb: 'động từ', adjective: 'tính từ', adverb: 'trạng từ',
  pronoun: 'đại từ', preposition: 'giới từ', conjunction: 'liên từ', interjection: 'thán từ', determiner: 'từ hạn định',
  article: 'mạo từ', numeral: 'số từ', phrase: 'cụm từ', 'prepositional phrase': 'cụm giới từ', idiom: 'thành ngữ',
  prefix: 'tiền tố', suffix: 'hậu tố', particle: 'tiểu từ', 'auxiliary verb': 'trợ động từ', abbreviation: 'viết tắt',
  'phrasal verb': 'cụm động từ', related: 'cụm trong câu', contraction: 'dạng rút gọn', symbol: 'ký hiệu', letter: 'chữ cái',
};
export const posVi = (pos) => POS_VI[String(pos || '').toLowerCase()] || String(pos || '').toLowerCase();

/* ------------------------------------------------------------------ */
/* Wiktionary                                                          */
/* ------------------------------------------------------------------ */
const ACC_UK = /\b(RP|UK|SSB|Received Pronunciation|British|England|Southern England)\b/i;
const ACC_US = /\b(GA|GenAm|US|USA|General American|American)\b/i;

/** Lấy IPA từ wikitext phần ==English==. Trả về { uk, us, any }. */
export function parseIpaFromWikitext(wikitext) {
  const wt = String(wikitext || '');
  const start = wt.search(/^==\s*English\s*==\s*$/m);
  if (start < 0) return null;
  const rest = wt.slice(start).replace(/^==\s*English\s*==\s*$/m, '');
  const stop = rest.search(/^==[^=].*==\s*$/m);
  const eng = stop >= 0 ? rest.slice(0, stop) : rest;
  const out = { uk: '', us: '', any: '' };
  for (const line of eng.split('\n')) {
    if (!/\{\{IPA\|en\|/.test(line)) continue;
    const tpl = line.match(/\{\{IPA\|en\|([^{}]*)\}\}/);
    if (!tpl) continue;
    const args = tpl[1].split('|').map((s) => s.trim());
    const prons = args.filter((a) => /^[/[]/.test(a));
    const named = Object.fromEntries(args.filter((a) => /^[a-z0-9]+=/.test(a)).map((a) => [a.split('=')[0], a.slice(a.indexOf('=') + 1)]));
    // Nhãn giọng: a=RP,GA hoặc {{a|UK}} / {{accent|US}} đứng trước trên cùng dòng.
    const pre = line.slice(0, tpl.index);
    const accText = [named.a || '', ...[...pre.matchAll(/\{\{(?:a|accent)\|([^{}]*)\}\}/g)].map((m) => m[1])].join(',');
    const pron = prons.find((p) => p.startsWith('/')) || prons[0];
    if (!pron) continue;
    const clean = cleanIpa(pron);
    if (!out.any) out.any = clean;
    if (!out.uk && ACC_UK.test(accText)) out.uk = clean;
    if (!out.us && ACC_US.test(accText)) out.us = clean;
    if (out.uk && out.us) break;
  }
  return out.any ? out : null;
}
/** Bỏ dấu tách âm tiết "." và khoảng trắng thừa: /əˈbæn.dən/ -> /əˈbændən/ */
export function cleanIpa(p) {
  let s = String(p || '').trim();
  const open = s[0] === '[' ? '[' : '/';
  const close = open === '[' ? ']' : '/';
  // Từ điển học tiếng Anh (Oxford, Cambridge) viết /r/ thay cho /ɹ/ và không dùng dấu nối t͡ʃ, d͡ʒ.
  s = s.replace(/^[/[]|[/\]]$/g, '').replace(/\./g, '').replace(/ɹ/g, 'r').replace(/\u0361/g, '').replace(/\s+/g, ' ').trim();
  return s ? open + s + close : '';
}
export function formatIpa(ip) {
  if (!ip) return '';
  if (ip.uk && ip.us && ip.uk !== ip.us) return `UK ${ip.uk} · US ${ip.us}`;
  return ip.uk || ip.us || ip.any || '';
}

async function wiktIpa(word) {
  const url = `https://en.wiktionary.org/w/api.php?action=parse&page=${enc(word)}&prop=wikitext&format=json&formatversion=2&redirects=1&origin=*`;
  const j = await getJson(url);
  if (j.error || !j.parse) return null;
  return parseIpaFromWikitext(j.parse.wikitext);
}

/** Nghĩa tiếng Anh + câu ví dụ từ REST API của Wiktionary. */
export function parseWiktDefinitions(json, { maxPos = 4, maxDefs = 3, maxEx = 4 } = {}) {
  const groups = (json && json.en) || [];
  const senses = [];
  const examples = [];
  for (const g of groups) {
    if (g.language && g.language !== 'English') continue;
    const defs = [];
    for (const d of g.definitions || []) {
      const text = htmlToText(d.definition);
      if (text && text.length > 2 && defs.length < maxDefs && !defs.includes(text)) defs.push(text);
      const exs = (d.parsedExamples || []).map((x) => x.example).concat(d.parsedExamples ? [] : (d.examples || []));
      for (const exHtml of exs) {
        const ex = htmlToText(exHtml, { dropLists: false });
        if (examples.length >= maxEx * 3) break;
        if (ex.length >= 18 && ex.length <= 160 && /[a-z]/.test(ex) && !examples.includes(ex)) examples.push(ex);
      }
    }
    if (defs.length) {
      const pos = String(g.partOfSpeech || '').toLowerCase();
      const same = senses.find((s) => s.pos === pos);
      if (same) { for (const d of defs) if (same.defs.length < maxDefs && !same.defs.includes(d)) same.defs.push(d); }
      else if (senses.length < maxPos) senses.push({ pos, defs });
    }
  }
  // Ưu tiên câu ví dụ vừa phải (không quá ngắn/quá dài), giữ thứ tự nghĩa.
  const picked = examples.filter((e) => e.length <= 120).slice(0, maxEx);
  for (const e of examples) { if (picked.length >= maxEx) break; if (!picked.includes(e)) picked.push(e); }
  return { senses, examples: picked };
}

async function wiktDefs(word) {
  const title = word.replace(/ /g, '_');
  try {
    return parseWiktDefinitions(await getJson(`https://en.wiktionary.org/api/rest_v1/page/definition/${enc(title)}`));
  } catch (e) {
    if (e.status === 404) return { senses: [], examples: [] };
    throw e;
  }
}

/* ------------------------------------------------------------------ */
/* Google Dịch (gtx) + MyMemory                                        */
/* ------------------------------------------------------------------ */
/**
 * Phân tích kết quả gtx (dạng dj=1): { main, translit, byPos: [{pos, terms}] }.
 * Danh sách nghĩa theo từ loại của Google xếp lộn xộn và có nhiều nghĩa cổ/hiếm
 * (vd "run": "đâm xuyên qua, kinh doanh, bay màu..."), nên tự chấm điểm lại:
 * nghĩa mà khi dịch ngược ra tiếng Anh có từ đang tra đứng đầu, dùng chung cho
 * nhiều từ tiếng Anh (là nghĩa phổ biến) và ngắn gọn thì xếp trước.
 */
export function parseGtx(j, { word = '', maxTerms = 4, maxPos = 3 } = {}) {
  if (!j || typeof j !== 'object') return null;
  const sents = Array.isArray(j.sentences) ? j.sentences : [];
  const main = sents.filter((x) => typeof x.trans === 'string').map((x) => x.trans).join('').trim();
  const tl = sents.find((x) => typeof x.src_translit === 'string');
  const w = String(word || '').toLowerCase();
  const byPos = [];
  for (const g of Array.isArray(j.dict) ? j.dict : []) {
    const entries = Array.isArray(g.entry) && g.entry.length ? g.entry : (g.terms || []).map((t) => ({ word: t, reverse_translation: [] }));
    const scored = entries.map((e, k) => {
      const term = String(e.word || '').trim();
      const rev = (e.reverse_translation || []).map((x) => String(x).toLowerCase());
      const at = w ? rev.indexOf(w) : -1;
      let sc = at === 0 ? 3 : at === 1 ? 2 : at === 2 ? 1 : 0;
      if (rev.length >= 2) sc += 1; else if (rev.length === 1) sc -= 1;
      if (term.split(/\s+/).length <= 2) sc += 1;
      if (typeof e.score === 'number') sc += Math.min(2, e.score * 20);
      return { term, sc, k };
    }).filter((x) => x.term && x.term.length <= 40 && !/[,;]/.test(x.term));
    scored.sort((a, b) => b.sc - a.sc || a.k - b.k);
    const terms = [];
    for (const x of scored) {
      if (terms.length >= maxTerms) break;
      if (!terms.some((t) => t.toLowerCase() === x.term.toLowerCase())) terms.push(x.term);
    }
    if (terms.length && byPos.length < maxPos) byPos.push({ pos: String(g.pos || '').toLowerCase(), terms });
  }
  return { main, translit: tl ? tl.src_translit : '', byPos };
}

async function gtx(text, { dict = false } = {}) {
  const dt = dict ? '&dt=t&dt=bd&dt=rm' : '&dt=t';
  const j = await getJson(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dj=1${dt}&q=${enc(text)}`);
  return parseGtx(j, { word: dict ? text : '' });
}
async function myMemory(text) {
  const j = await getJson(`https://api.mymemory.translated.net/get?q=${enc(text)}&langpair=en|vi`);
  if (!j || j.responseStatus !== 200 || j.quotaFinished) throw new Error('MyMemory: ' + (j && j.responseDetails));
  const t = String((j.responseData && j.responseData.translatedText) || '').trim();
  if (!t || /MYMEMORY WARNING/i.test(t)) throw new Error('MyMemory: rỗng');
  return t;
}

/** Dịch 1 đoạn sang tiếng Việt (Google, lỗi thì MyMemory). */
export async function translateVi(text) {
  const src = String(text || '').trim().slice(0, 1000);
  if (!src) return '';
  try {
    const g = await gtx(src);
    if (g && g.main) return g.main;
  } catch (e) { /* thử nguồn khác */ }
  return myMemory(src);
}

/** Dịch nhiều câu một lần (gộp bằng xuống dòng để đỡ số lần gọi). */
export async function translateManyVi(lines) {
  const list = lines.map((s) => String(s || '').replace(/\n/g, ' ').trim());
  if (!list.length) return [];
  try {
    const g = await gtx(list.join('\n'));
    const parts = (g && g.main ? g.main : '').split('\n').map((s) => s.trim());
    if (parts.length === list.length) return parts;
  } catch (e) { /* bỏ qua */ }
  // Gộp không khớp số dòng thì dịch từng câu.
  const res = await Promise.all(list.map((s) => settle(translateVi(s))));
  return res.map((r) => (r.ok ? r.v : ''));
}

/* ------------------------------------------------------------------ */
/* Datamuse                                                            */
/* ------------------------------------------------------------------ */
async function datamuse(word) {
  const j = await getJson(`https://api.datamuse.com/words?sp=${enc(word)}&md=dpr&ipa=1&max=1`);
  const hit = Array.isArray(j) ? j.find((x) => String(x.word).toLowerCase() === word.toLowerCase()) : null;
  if (!hit) return null;
  const ipaTag = (hit.tags || []).find((t) => t.startsWith('ipa_pron:'));
  const ipa = ipaTag ? '/' + ipaTag.slice(9).replace(/ɫ/g, 'l').trim() + '/' : '';
  const senses = [];
  for (const d of hit.defs || []) {
    const [p, text] = String(d).split('\t');
    const pos = { n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb', u: '' }[p] ?? p;
    const s = senses.find((x) => x.pos === pos) || (senses.push({ pos, defs: [] }), senses[senses.length - 1]);
    if (s.defs.length < 3 && text) s.defs.push(text.trim());
  }
  return { ipa, senses: senses.slice(0, 4) };
}
export async function suggestWords(word) {
  try {
    const j = await getJson(`https://api.datamuse.com/sug?s=${enc(word)}&max=6`, { timeout: 6000 });
    return (Array.isArray(j) ? j : []).map((x) => String(x.word)).filter((w) => w.toLowerCase() !== word.toLowerCase() && isValidWord(w)).slice(0, 5);
  } catch (e) {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Tra một từ                                                          */
/* ------------------------------------------------------------------ */
/**
 * Trả về:
 * { word, found, ipa: {uk,us,any}|null, ipaText, meaningVi, viByPos: [{pos, terms}],
 *   senses: [{pos, defs}], examples: [{en, vi}], suggestions: [], errors: [] }
 */
export async function lookupWord(raw) {
  const word = normalizeWord(raw);
  if (!isValidWord(word)) {
    const e = new Error('Hãy nhập một từ hoặc cụm từ tiếng Anh (chỉ gồm chữ cái).');
    e.code = 'INVALID';
    throw e;
  }
  // Wiktionary phân biệt hoa/thường: tra chữ thường trước (trừ khi người dùng
  // gõ chữ hoa giữa từ như "iPhone"), không có thì thử nguyên dạng đã gõ.
  const lower = /^[A-Z][a-z' .-]*$/.test(word) ? word.toLowerCase() : word;
  const [rIpa, rDef, rG, rDm] = await Promise.all([
    settle(wiktIpa(lower)),
    settle(wiktDefs(lower)),
    settle(gtx(lower, { dict: true })),
    settle(datamuse(lower)),
  ]);
  const errors = [];
  let ipa = rIpa.ok ? rIpa.v : null;
  let wd = rDef.ok ? rDef.v : { senses: [], examples: [] };
  if (!rIpa.ok) errors.push('wiktionary-ipa');
  if (!rDef.ok) errors.push('wiktionary-def');
  // Thử lại nguyên dạng đã gõ nếu chữ thường không có trang.
  if (lower !== word && !wd.senses.length) {
    const [a, b] = await Promise.all([settle(wiktIpa(word)), settle(wiktDefs(word))]);
    if (b.ok && b.v.senses.length) { wd = b.v; if (a.ok && a.v) ipa = a.v; }
  }
  const g = rG.ok ? rG.v : null;
  if (!rG.ok) errors.push('google');
  const dm = rDm.ok ? rDm.v : null;

  let senses = wd.senses;
  if (!senses.length && dm && dm.senses.length) senses = dm.senses;
  // Dự phòng phiên âm: Google (khá chuẩn) rồi mới tới Datamuse (đặt dấu nhấn
  // lệch, sai với cụm từ nên chỉ dùng cho từ đơn).
  if (!ipa) {
    if (g && g.translit) ipa = { uk: '', us: '', any: cleanIpa('/' + g.translit + '/') };
    else if (dm && dm.ipa && !lower.includes(' ')) ipa = { uk: '', us: '', any: cleanIpa(dm.ipa) };
  }

  let meaningVi = g && g.main && g.main.toLowerCase() !== lower.toLowerCase() ? g.main : '';
  const viByPos = g ? g.byPos : [];
  if (!meaningVi && viByPos.length) meaningVi = viByPos[0].terms[0];
  if (!meaningVi) {
    try { meaningVi = await myMemory(lower); if (meaningVi.toLowerCase() === lower.toLowerCase()) meaningVi = ''; } catch (e) { errors.push('mymemory'); }
  }
  let found = Boolean(senses.length || viByPos.length || (dm && dm.senses.length) || ipa);
  // Cụm từ tự do (vd "in his free time") không có trong từ điển nhưng Google vẫn dịch được:
  // hiện bản dịch cả cụm + các cụm con có trong từ điển (vd "free time").
  let phraseOnly = false;
  let related = [];
  if (!found && lower.includes(' ') && meaningVi && meaningVi.toLowerCase() !== lower.toLowerCase()) {
    phraseOnly = true;
    found = true;
    try { related = await relatedPhrases(lower); } catch (e) { related = []; }
  }

  let examples = [];
  if (found && wd.examples.length) {
    let vis = [];
    try { vis = await translateManyVi(wd.examples); } catch (e) { vis = []; }
    examples = wd.examples.map((en, k) => ({ en, vi: vis[k] || '' }));
  }
  const suggestions = found ? [] : await suggestWords(lower);
  return {
    word: lower,
    found,
    ipa,
    ipaText: formatIpa(ipa),
    meaningVi: meaningVi ? meaningVi.slice(0, 200) : '',
    viByPos,
    senses,
    examples,
    suggestions,
    errors,
    phraseOnly,
    related,
  };
}

const STOP = new Set('a an the in on at of to for with by from into about as his her him my your our their its this that these those is are was were be been being am and or but not no so very it he she we they you i me us them'.split(' '));
// Cụm được phép kết thúc bằng giới từ / tiểu từ (cụm động từ: "take care of", "look after", "give up").
const END_OK = new Set('of to for with on in at up out off after about into over down away back'.split(' '));
let pastToBase = null; // tính lười: IRREGULAR khai báo ở phía dưới file
function pastBase(w) {
  if (!pastToBase) {
    pastToBase = {};
    for (const [base, forms] of Object.entries(IRREGULAR)) for (const f of forms.split(' ')) if (!pastToBase[f]) pastToBase[f] = base;
  }
  return pastToBase[w];
}
/** Dạng nguyên mẫu đoán được của một từ đã chia (chỉ dùng để thử tra cụm). */
function baseForms(w) {
  const out = [];
  if (pastBase(w)) out.push(pastBase(w));
  if (/ing$/.test(w) && w.length > 5) { out.push(w.slice(0, -3)); out.push(w.slice(0, -3) + 'e'); }
  if (/ied$/.test(w)) out.push(w.slice(0, -3) + 'y');
  else if (/ed$/.test(w) && w.length > 4) { out.push(w.slice(0, -2)); out.push(w.slice(0, -1)); }
  if (/ies$/.test(w)) out.push(w.slice(0, -3) + 'y');
  else if (/s$/.test(w) && !/ss$/.test(w) && w.length > 3) out.push(w.slice(0, -1));
  return out.filter((x) => x && x !== w);
}
/**
 * Tìm cụm con (2-4 từ) có trong Wiktionary, bỏ cụm bắt đầu bằng hư từ hoặc kết thúc bằng
 * mạo từ/đại từ (cho phép kết thúc bằng giới từ như cụm động từ):
 * "in his free time" -> ["free time"], "take care of the children" -> ["take care of"].
 * Trả về [{ word, vi, def }] (tối đa 3).
 */
async function relatedPhrases(phrase) {
  const toks = phrase.toLowerCase().split(/\s+/).filter(Boolean);
  const cands = [];
  const push = (w) => { if (!cands.includes(w)) cands.push(w); };
  for (let n = Math.min(4, toks.length - 1); n >= 2; n--) {
    for (let i = 0; i + n <= toks.length; i++) {
      const g = toks.slice(i, i + n);
      if (STOP.has(g[0]) || END_OK.has(g[0])) continue;
      if (STOP.has(g[g.length - 1]) && !END_OK.has(g[g.length - 1])) continue;
      push(g.join(' '));
      // Động từ đã chia ở đầu cụm -> thử dạng nguyên mẫu: gave up -> give up, looking after -> look after
      for (const base of baseForms(g[0])) push([base, ...g.slice(1)].join(' '));
    }
  }
  // Ưu tiên cụm ngắn 2-3 từ (hay có trong từ điển hơn cụm 4 từ).
  cands.sort((a, b) => Math.abs(a.split(' ').length - 2.5) - Math.abs(b.split(' ').length - 2.5));
  const tries = cands.slice(0, 8);
  if (!tries.length) return [];
  const res = await Promise.all(tries.map((w) => settle(wiktDefs(w))));
  const hits = [];
  tries.forEach((w, k) => {
    const r = res[k];
    if (!r.ok || !r.v.senses.length) return;
    if (hits.some((h) => h.word.includes(w))) return; // đã có cụm dài hơn chứa nó
    hits.push({ word: w, def: r.v.senses[0].defs[0] || '' });
  });
  // Có cả dạng chia và dạng gốc ("gave up" và "give up"): chỉ giữ dạng gốc.
  const isInflectedOf = (a, b) => { const x = a.split(' '); const y = b.split(' '); return x.length === y.length && x.slice(1).join(' ') === y.slice(1).join(' ') && baseForms(x[0]).includes(y[0]); };
  const top = hits.filter((h) => !hits.some((o) => o !== h && isInflectedOf(h.word, o.word))).slice(0, 3);
  if (!top.length) return [];
  let vis = [];
  try { vis = await translateManyVi(top.map((h) => h.word)); } catch (e) { vis = []; }
  return top.map((h, k) => ({ ...h, vi: vis[k] || '' }));
}

/* ------------------------------------------------------------------ */
/* Đặt câu: kiểm tra có dùng từ + soát ngữ pháp                         */
/* ------------------------------------------------------------------ */
const IRREGULAR = {
  be: 'am is are was were been being', have: 'has had having', do: 'does did done doing', go: 'goes went gone going',
  say: 'said', make: 'made', get: 'got gotten', know: 'knew known', think: 'thought', take: 'took taken', see: 'saw seen',
  come: 'came', give: 'gave given', find: 'found', tell: 'told', become: 'became', leave: 'left', feel: 'felt',
  bring: 'brought', begin: 'began begun', keep: 'kept', hold: 'held', write: 'wrote written', stand: 'stood',
  hear: 'heard', let: 'let', mean: 'meant', set: 'set', meet: 'met', run: 'ran running', pay: 'paid', sit: 'sat',
  speak: 'spoke spoken', lie: 'lay lain lying lied', lead: 'led', read: 'read', grow: 'grew grown', lose: 'lost',
  fall: 'fell fallen', send: 'sent', build: 'built', understand: 'understood', draw: 'drew drawn', break: 'broke broken',
  spend: 'spent', cut: 'cut', rise: 'rose risen', drive: 'drove driven', buy: 'bought', wear: 'wore worn',
  choose: 'chose chosen', seek: 'sought', throw: 'threw thrown', catch: 'caught', deal: 'dealt', win: 'won',
  forget: 'forgot forgotten', sell: 'sold', fight: 'fought', teach: 'taught', eat: 'ate eaten', sing: 'sang sung',
  swim: 'swam swum', drink: 'drank drunk', fly: 'flew flown flies', forgive: 'forgave forgiven', hide: 'hid hidden',
  ride: 'rode ridden', shake: 'shook shaken', steal: 'stole stolen', strike: 'struck', swear: 'swore sworn',
  tear: 'tore torn', wake: 'woke woken', sleep: 'slept', sweep: 'swept', light: 'lit', feed: 'fed', flee: 'fled',
  bite: 'bit bitten', blow: 'blew blown', freeze: 'froze frozen', hang: 'hung', shoot: 'shot', shine: 'shone',
  dig: 'dug', stick: 'stuck', sting: 'stung', swing: 'swung', bend: 'bent', bind: 'bound', bleed: 'bled', breed: 'bred',
  arise: 'arose arisen', bear: 'bore borne born', beat: 'beaten', bet: 'bet', bid: 'bid', burst: 'burst', cost: 'cost',
  creep: 'crept', hit: 'hit', hurt: 'hurt', kneel: 'knelt', lend: 'lent', mislead: 'misled', overcome: 'overcame',
  quit: 'quit', shut: 'shut', slide: 'slid', split: 'split', spread: 'spread', undergo: 'underwent undergone',
  withdraw: 'withdrew withdrawn', good: 'better best', bad: 'worse worst', well: 'better best', many: 'more most',
  much: 'more most', little: 'less least', far: 'farther further farthest furthest', child: 'children', man: 'men',
  woman: 'women', person: 'people', foot: 'feet', tooth: 'teeth', mouse: 'mice', analysis: 'analyses',
  criterion: 'criteria', phenomenon: 'phenomena', datum: 'data', medium: 'media', life: 'lives', knife: 'knives',
  leaf: 'leaves', wife: 'wives', half: 'halves', self: 'selves',
};
const VOWEL = /[aeiou]/;
/** Các dạng biến đổi thường gặp của 1 từ (số nhiều, chia động từ, so sánh, -ly). */
export function wordForms(w) {
  const b = String(w || '').toLowerCase();
  const f = new Set([b]);
  if (!/^[a-z]+$/.test(b)) return f;
  const add = (...xs) => xs.forEach((x) => f.add(x));
  const last = b.slice(-1);
  const stem = b.slice(0, -1);
  add(b + 's', b + 'ed', b + 'ing', b + 'er', b + 'est', b + 'ly', b + "'s");
  if (/(s|x|z|ch|sh|o)$/.test(b)) add(b + 'es');
  if (last === 'y' && b.length > 2 && !VOWEL.test(b.slice(-2, -1))) add(stem + 'ies', stem + 'ied', stem + 'ier', stem + 'iest', stem + 'ily', stem + 'iness');
  if (last === 'e') add(b + 'd', stem + 'ing', b + 'r', b + 'st', stem + 'y');
  if (b.endsWith('ie')) add(b.slice(0, -2) + 'ying');
  if (b.endsWith('le')) add(stem + 'y');
  if (b.endsWith('ic')) add(b + 'ally', b + 'ked', b + 'king');
  // Gấp đôi phụ âm cuối: stop -> stopped, big -> bigger
  if (/[^aeiou][aeiou][bdgklmnprt]$/.test(b)) add(b + last + 'ed', b + last + 'ing', b + last + 'er', b + last + 'est');
  if (/(fe|f)$/.test(b)) add(b.replace(/(fe|f)$/, 'ves'));
  add(b + 'ness', b + 'ment');
  if (IRREGULAR[b]) IRREGULAR[b].split(' ').forEach((x) => f.add(x));
  return f;
}
/** Câu có dùng từ / cụm từ `word` không (chấp nhận dạng biến đổi, cụm từ có thể chen 1-2 từ). */
export function usesWord(sentence, word) {
  const toks = String(sentence || '').toLowerCase().replace(/[‘’]/g, "'").match(/[a-z]+(?:'[a-z]+)?/g) || [];
  const parts = String(word || '').toLowerCase().split(/[\s-]+/).filter(Boolean);
  if (!parts.length || !toks.length) return false;
  const joined = toks.join(' ');
  if (parts.length > 1 && joined.includes(parts.join(' '))) return true;
  const forms = parts.map((p) => wordForms(p));
  const match = (tok, k) => forms[k].has(tok) || forms[k].has(tok.replace(/'s$/, ''));
  for (let i = 0; i < toks.length; i++) {
    if (!match(toks[i], 0)) continue;
    let pos = i;
    let ok = true;
    for (let k = 1; k < parts.length; k++) {
      let hit = -1;
      for (let j = pos + 1; j <= Math.min(toks.length - 1, pos + 3); j++) if (match(toks[j], k)) { hit = j; break; }
      if (hit < 0) { ok = false; break; }
      pos = hit;
    }
    if (ok) return true;
  }
  return false;
}

/**
 * Soát ngữ pháp/chính tả bằng LanguageTool.
 * Trả về [{ offset, length, message, short, replacements: [..], type }]
 */
export async function checkGrammar(text) {
  const src = String(text || '').slice(0, 1500);
  const body = new URLSearchParams({ language: 'en-US', text: src, level: 'default' });
  let j;
  try {
    j = await getJson('https://api.languagetool.org/v2/check', {
      timeout: 12000,
      init: { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() },
    });
  } catch (e) {
    const err = new Error(e.status === 429 ? 'Kiểm tra quá nhiều lần trong 1 phút, đợi một lát rồi thử lại.' : 'Không kết nối được dịch vụ kiểm tra ngữ pháp.');
    err.code = e.status === 429 ? 'RATE' : 'NET';
    throw err;
  }
  return (j.matches || []).map((m) => ({
    offset: m.offset,
    length: m.length,
    message: m.message,
    short: m.shortMessage || '',
    replacements: (m.replacements || []).slice(0, 4).map((r) => r.value),
    type: (m.rule && m.rule.issueType) || '',
  }));
}

/* ------------------------------------------------------------------ */
/* Dữ liệu lưu vào sổ từ (dùng chung cho vocab.js và vocab-mini.js)     */
/* ------------------------------------------------------------------ */
/** Gộp nghĩa tiếng Việt theo từ loại (Google) với nghĩa tiếng Anh (Wiktionary). */
export function savedSenses(res) {
  const out = [];
  const get = (pos) => out.find((s) => s.pos === pos) || (out.push({ pos, vi: [], defs: [] }), out[out.length - 1]);
  for (const g of res.viByPos || []) get(g.pos).vi = g.terms.slice(0, 4);
  for (const s of res.senses || []) get(s.pos).defs = s.defs.slice(0, 3).map((d) => d.slice(0, 240));
  // Cụm con có trong từ điển (khi tra cả một cụm tự do): "free time: thời gian rảnh"
  if (res.related && res.related.length) {
    const g = get('related');
    g.vi = res.related.map((r) => `${r.word}: ${r.vi || '...'}`.slice(0, 120));
    g.defs = res.related.filter((r) => r.def).map((r) => `${r.word}: ${r.def}`.slice(0, 240));
  }
  return out.filter((s) => s.vi.length || s.defs.length).slice(0, 4);
}
export const savedExamples = (res) => (res.examples || []).slice(0, 4).map((e) => ({ en: String(e.en || '').slice(0, 200), vi: String(e.vi || '').slice(0, 240) }));
/** Dòng mới cho bảng vocab_words từ kết quả lookupWord(). */
export const newWordRow = (res) => ({ word: res.word, ipa: (res.ipaText || '').slice(0, 200), meaning_vi: (res.meaningVi || '').slice(0, 500), senses: savedSenses(res), examples: savedExamples(res) });
/** Báo cho mục Từ vựng tiếng Anh tải lại sổ từ khi mở lần sau (thêm từ ở nơi khác, vd ô tra từ lúc làm bài). */
export const notifyVocabChanged = () => { try { window.dispatchEvent(new CustomEvent('vocab:changed')); } catch (e) { /* bỏ qua */ } };
