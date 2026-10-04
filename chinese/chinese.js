/* chinese.js - Mục "Tiếng Trung YCT" (học từ vựng bằng thẻ) của Quiz App.
 *
 * Cách hoạt động (cùng khuôn với mục 12 thì tiếng Anh - tenses/):
 * - app.js gọi mountChinese(host, nav, { userId, scrollAnchor }) khi người
 *   dùng mở mục này lần đầu (nạp lười bằng import()).
 * - Nội dung vẽ trong Shadow DOM của `host`: CSS của app không đè vào được.
 * - `nav` là thanh chuyển trang con nằm ngoài Shadow DOM, dùng nút chuẩn của
 *   app (CSS trong index.html, chung với #tensesNav).
 * - Tiến độ từng thẻ YCT lưu trong localStorage, tách theo tài khoản.
 * - "Sổ từ của tôi" (từ người dùng tự tra) lưu ở bảng Supabase vocab_words
 *   với lang = 'zh' (dùng chung bảng với mục Từ vựng tiếng Anh; word = chữ Hán,
 *   ipa = pinyin), mức nhớ lưu luôn trong bảng nên đổi máy vẫn còn.
 *
 * 8 trang con:
 *   tra-tu      Tra từ mới: gõ chữ Hán hoặc nghĩa tiếng Việt -> pinyin, nghĩa, câu ví dụ;
 *               tự lưu vào Sổ từ của tôi
 *   lat-the     Lật thẻ: xem hình + chữ, lật xem nghĩa và câu ví dụ, tự chấm nhớ/chưa nhớ
 *               (bộ thẻ: YCT, Sổ từ của tôi, hoặc cả hai)
 *   doan-nghia  Nhìn chữ & hình, chọn nghĩa tiếng Việt đúng (4 lựa chọn)
 *   ghep-cau    Xếp các mảnh từ thành câu ví dụ theo nghĩa tiếng Việt
 *   chon-chu    Chọn chữ Hán đúng: theo hình + nghĩa, hoặc điền chỗ trống trong câu
 *   nghe-viet   Nghe đọc rồi gõ lại chữ Hán hoặc pinyin (bộ thẻ như Lật thẻ)
 *   so-tu       Sổ từ của tôi: tìm, lọc, xoá, chia trang 10 từ
 *   tien-do     Thống kê theo cấp YCT + lưới toàn bộ thẻ
 *
 * Mức nhớ mỗi thẻ (s, 0-5) theo kiểu hộp Leitner: trả lời đúng / "Đã nhớ" +1,
 * sai / "Chưa nhớ" về 0. s >= 3 coi là "đã thuộc". Lượt luyện chọn thẻ ngẫu
 * nhiên có trọng số: thẻ mới và thẻ hay sai ra nhiều hơn thẻ đã thuộc.
 */

const VERSION = new URL(import.meta.url).search; // ví dụ "?v=20261003-1"
const STORE_PREFIX = 'yct-cards-v1';
const KNOWN_AT = 3;

export const PAGES = [
  { id: 'tra-tu', label: 'Tra từ mới' },
  { id: 'lat-the', label: 'Lật thẻ' },
  { id: 'doan-nghia', label: 'Nhìn chữ & hình đoán nghĩa' },
  { id: 'ghep-cau', label: 'Ghép câu' },
  { id: 'chon-chu', label: 'Chọn chữ đúng' },
  { id: 'nghe-viet', label: 'Nghe & viết' },
  { id: 'so-tu', label: 'Sổ từ của tôi' },
  { id: 'tien-do', label: 'Tiến độ & bộ thẻ' },
];
const TABLE = 'vocab_words';

let assets = null; // { data, css, zapi }
let mounted = null; // { host, key, api }
let keyBound = false;

async function loadAssets() {
  if (assets) return assets;
  const [data, css, zapi] = await Promise.all([
    import('./chinese-data.js' + VERSION),
    fetch(new URL('./chinese.css' + VERSION, import.meta.url)).then((r) => {
      if (!r.ok) throw new Error('Không tải được chinese.css (' + r.status + ')');
      return r.text();
    }),
    import('./chinese-api.js' + VERSION),
  ]);
  assets = { data, css, zapi };
  return assets;
}

/** Gắn mục vào trang. Gọi lại nhiều lần được; đổi tài khoản thì dựng lại. */
export async function mountChinese(host, nav, { userId = null, supabase = null, scrollAnchor = null } = {}) {
  const { data, css, zapi } = await loadAssets();
  const key = STORE_PREFIX + (userId ? ':' + userId : '');
  if (mounted && mounted.host === host && mounted.key === key) return mounted.api;
  const api = build({ host, nav, key, data, css, zapi, supabase, scrollAnchor });
  mounted = { host, key, api };
  if (!keyBound) {
    keyBound = true;
    document.addEventListener('keydown', (e) => { if (mounted) mounted.api.onKey(e); });
  }
  return api;
}

/* ====================================================================== */

function build({ host, nav, key, data, css, zapi, supabase, scrollAnchor }) {
  const { CARDS, IMG_VERSION } = data;
  const { lookupZh, examplesZh, hasHan, onlyHan, plainPinyin } = zapi;
  const byId = Object.fromEntries(CARDS.map((c) => [c.id, c]));
  const byHanzi = new Map();
  CARDS.forEach((c) => { if (!byHanzi.has(c.h)) byHanzi.set(c.h, c); });
  const LEVELS = [1, 2, 3, 4];

  const root = host.shadowRoot || host.attachShadow({ mode: 'open' });

  /* ---------------- lưu trạng thái theo tài khoản ---------------- */
  let store = { page: 'lat-the', levels: [1], py: true, en: false, auto: false, hidePic: false, len: 10, st: {}, fc: { i: 0, only: false, shuffle: false, src: 'yct' }, nv: { src: 'yct', hintPy: false, hintVi: true }, nb: { filter: 'all', sort: 'new' } };
  try {
    const raw = localStorage.getItem(key);
    if (raw) store = Object.assign(store, JSON.parse(raw));
  } catch (e) { /* dữ liệu hỏng thì bỏ qua */ }
  if (!Array.isArray(store.levels) || !store.levels.length) store.levels = [1];
  store.levels = store.levels.filter((l) => LEVELS.includes(l));
  if (!store.levels.length) store.levels = [1];
  store.st = store.st && typeof store.st === 'object' ? store.st : {};
  store.fc = Object.assign({ i: 0, only: false, shuffle: false, src: 'yct' }, store.fc || {});
  store.nv = Object.assign({ src: 'yct', hintPy: false, hintVi: true }, store.nv || {});
  store.nb = Object.assign({ filter: 'all', sort: 'new' }, store.nb || {});
  const SRC_OK = ['yct', 'mine', 'all'];
  if (!SRC_OK.includes(store.fc.src)) store.fc.src = 'yct';
  if (!SRC_OK.includes(store.nv.src)) store.nv.src = 'yct';
  if (![10, 20, 30].includes(store.len)) store.len = 10;
  function save() {
    try { localStorage.setItem(key, JSON.stringify(store)); } catch (e) { /* hết chỗ / chế độ riêng tư */ }
  }

  /* ---------------- tiện ích ---------------- */
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const imgUrl = (id) => new URL(`./img/${id}.webp?v=${IMG_VERSION}`, import.meta.url).href;
  const img = (c, tag = 'figure') => (c.mine ? '' : `<${tag} class="pic"><img src="${imgUrl(c.id)}" width="320" height="290" alt="Hình minh hoạ" loading="lazy" decoding="async"></${tag}>`);
  // Hình có in sẵn chữ Hán (c.txt) sẽ lộ đáp án ở chế độ Ghép câu / Chọn chữ: chỉ hiện sau khi trả lời.
  const picHidden = (c, S) => Boolean(c.txt) && !S.answered;
  const preload = (c) => { if (c && !c.mine) { const i = new Image(); i.src = imgUrl(c.id); } };

  /* ---------------- phát âm (giọng đọc có sẵn của trình duyệt) ---------------- */
  const canSpeak = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
  let zhVoice = null;
  let voicesChecked = false;
  function pickVoice() {
    if (!canSpeak) return;
    const vs = speechSynthesis.getVoices();
    if (!vs.length) return;
    voicesChecked = true;
    zhVoice = vs.find((v) => /^zh[-_]CN/i.test(v.lang)) || vs.find((v) => /^(zh|cmn)/i.test(v.lang)) || null;
    const note = root.getElementById && root.getElementById('ttsNote');
    if (note) note.hidden = Boolean(zhVoice);
  }
  if (canSpeak) {
    pickVoice();
    try { speechSynthesis.addEventListener('voiceschanged', pickVoice); } catch (e) { /* trình duyệt cũ */ }
  }
  function speak(text) {
    if (!canSpeak || !text) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text).replace(/……/g, '，'));
      u.lang = 'zh-CN';
      u.rate = 0.85;
      if (zhVoice) u.voice = zhVoice;
      speechSynthesis.speak(u);
    } catch (e) { /* bỏ qua */ }
  }
  const SAY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  const sayBtn = (t, sm = false) => `<button class="say${sm ? ' sm' : ''}" type="button" data-say="${esc(t)}" aria-label="Nghe phát âm" title="Nghe phát âm">${SAY_SVG}</button>`;

  /* ---------------- Sổ từ của tôi (Supabase, lang = 'zh') ---------------- */
  let mine = []; // các dòng vocab_words, mới nhất trước
  let mineState = 'loading'; // loading | ready | missing | upgrade | error | nodb
  let mineErr = '';
  const mineCards = new Map(); // 'u:<id>' -> thẻ dạng giống CARDS
  const arr = (x) => (Array.isArray(x) ? x : []);
  function toCard(r) {
    const ex = arr(r.examples)[0] || null;
    const senses = arr(r.senses);
    return {
      id: 'u:' + r.id, rowId: r.id, mine: true, lv: 0, h: r.word, py: r.ipa || '',
      vi: (r.meaning_vi || '').trim() || (senses[0] && arr(senses[0].vi)[0]) || '',
      en: senses.flatMap((x) => arr(x.en)).slice(0, 3).join(', '),
      ex: ex ? ex.zh || '' : '', exPy: ex ? ex.py || '' : '', exVi: ex ? ex.vi || '' : '', exEn: ex ? ex.en || '' : '',
    };
  }
  function normRow(r) {
    return { ...r, senses: arr(r.senses), examples: arr(r.examples), level: r.level || 0, correct: r.correct || 0, wrong: r.wrong || 0, lookups: r.lookups || 1 };
  }
  function rebuildMineCards() {
    mineCards.clear();
    mine.forEach((r) => mineCards.set('u:' + r.id, toCard(r)));
  }
  const getCard = (id) => byId[id] || mineCards.get(id) || null;
  const mineRow = (id) => mine.find((r) => r.id === String(id).replace(/^u:/, '')) || null;
  const mineByWord = (h) => mine.find((r) => r.word === h) || null;
  function dbErrText(err) {
    const m = String((err && (err.message || err.details)) || err || '');
    // Thiếu cột lang phải kiểm tra trước: lỗi "column vocab_words.lang does not exist" cũng khớp mẫu "bảng không tồn tại".
    if (err && (err.code === '42703' || err.code === 'PGRST204') && /lang/.test(m)) { mineState = 'upgrade'; return 'Bảng vocab_words chưa có cột lang.'; }
    if (err && (err.code === '42P01' || err.code === 'PGRST205' || (/vocab_words/.test(m) && !/column/i.test(m) && /(does not exist|could not find|schema cache)/i.test(m)))) { mineState = 'missing'; return 'Chưa tạo bảng vocab_words.'; }
    return /fetch|network/i.test(m) ? 'Mất kết nối mạng.' : m || 'Lỗi không rõ';
  }
  async function loadMine() {
    if (!supabase) { mineState = 'nodb'; return; }
    mineState = 'loading';
    const { data: rows, error } = await supabase.from(TABLE).select('*').eq('lang', 'zh').order('created_at', { ascending: false }).limit(3000);
    if (error) {
      mineErr = dbErrText(error);
      if (mineState === 'loading') mineState = 'error';
      mine = [];
    } else {
      mine = (rows || []).map(normRow);
      mineState = 'ready';
    }
    rebuildMineCards();
  }
  async function dbInsert(row) {
    const { data: d, error } = await supabase.from(TABLE).insert({ ...row, lang: 'zh' }).select().single();
    if (error) throw error;
    return normRow(d);
  }
  async function dbUpdate(id, patch) {
    const { data: d, error } = await supabase.from(TABLE).update(patch).eq('id', id).select().single();
    if (error) throw error;
    return normRow(d);
  }
  async function dbDelete(id) {
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) throw error;
  }
  function putMine(row) {
    const k = mine.findIndex((r) => r.id === row.id);
    if (k >= 0) mine[k] = row; else mine.unshift(row);
    mineCards.set('u:' + row.id, toCard(row));
  }
  function mineNotice() {
    if (mineState === 'missing') return '<div class="notice warn"><b>Chưa lưu được Sổ từ của tôi.</b> Cơ sở dữ liệu chưa có bảng <code>vocab_words</code>. Quản trị viên chạy file <code>vocab/vocab-schema.sql</code> trong Supabase (SQL Editor &gt; dán &gt; Run). Trong lúc chờ vẫn tra từ được nhưng không lưu.</div>';
    if (mineState === 'upgrade') return '<div class="notice warn"><b>Cần nâng cấp bảng sổ từ.</b> Bảng <code>vocab_words</code> chưa có cột <code>lang</code> để tách từ tiếng Anh và tiếng Trung. Quản trị viên chạy lại file <code>vocab/vocab-schema.sql</code> trong Supabase (an toàn, không mất dữ liệu). Trong lúc chờ vẫn tra từ được nhưng không lưu.</div>';
    if (mineState === 'error') return `<div class="notice bad"><b>Không tải được Sổ từ của tôi:</b> ${esc(mineErr)} <button type="button" class="linkbtn" data-act="mine-reload">Thử lại</button></div>`;
    if (mineState === 'nodb') return '<div class="notice warn">Không kết nối được cơ sở dữ liệu nên từ tra sẽ không được lưu.</div>';
    return '';
  }

  /* ---------------- mức nhớ ---------------- */
  const stOf = (id) => {
    if (String(id).startsWith('u:')) { const r = mineRow(id); return r && (r.correct || r.wrong || r.level) ? { s: r.level, c: r.correct, w: r.wrong } : null; }
    return store.st[id] || null;
  };
  function status(id) {
    const s = stOf(id);
    if (!s) return 'new';
    return s.s >= KNOWN_AT ? 'known' : 'learn';
  }
  const STATUS_LABEL = { new: 'Chưa học', learn: 'Đang học', known: 'Đã thuộc' };
  const badge = (id) => { const s = status(id); return `<span class="badge s-${s}">${STATUS_LABEL[s]}</span>`; };
  function grade(id, ok) {
    if (String(id).startsWith('u:')) {
      const r = mineRow(id);
      if (!r) return;
      if (ok) { r.correct += 1; r.level = Math.min(5, r.level + 1); } else { r.wrong += 1; r.level = 0; }
      r.last_review = new Date().toISOString();
      if (mineState === 'ready') dbUpdate(r.id, { level: r.level, correct: r.correct, wrong: r.wrong, last_review: r.last_review }).catch((e) => toast('Chưa lưu được kết quả ôn: ' + dbErrText(e), 'bad'));
      return;
    }
    const s = store.st[id] || (store.st[id] = { s: 0, c: 0, w: 0 });
    if (ok) { s.c += 1; s.s = Math.min(5, s.s + 1); } else { s.w += 1; s.s = 0; }
    s.t = Date.now();
    save();
  }
  const WEIGHT = { new: 3, 0: 4, 1: 3, 2: 2, 3: 1, 4: 0.6, 5: 0.3 };
  function weight(id) { const s = stOf(id); return s ? WEIGHT[s.s] ?? 1 : WEIGHT.new; }

  const pool = () => CARDS.filter((c) => store.levels.includes(c.lv));
  /** Bộ thẻ cho Lật thẻ / Nghe & viết: YCT (cấp đang chọn), Sổ từ của tôi, hoặc cả hai. */
  const poolBySrc = (src) => [...(src !== 'mine' ? pool() : []), ...(src !== 'yct' ? [...mineCards.values()] : [])];
  const SRC_LABEL = { yct: 'Thẻ YCT', mine: 'Sổ từ của tôi', all: 'Cả hai' };
  const srcChips = (act, cur) => `<span class="src-chips" role="group" aria-label="Chọn bộ thẻ"><span class="tb-label">Bộ thẻ</span>${['yct', 'mine', 'all'].map((k) => `<button type="button" class="chip" data-act="${act}" data-src="${k}" aria-pressed="${cur === k}">${SRC_LABEL[k]}${k === 'mine' ? ` <span class="n">${mine.length}</span>` : ''}</button>`).join('')}</span>`;

  /* ---------------- chọn câu hỏi & phương án nhiễu ---------------- */
  function pickItems(cands, n) {
    const left = cands.slice();
    const out = [];
    const seenH = new Set();
    while (out.length < n && left.length) {
      const total = left.reduce((a, c) => a + weight(c.id), 0);
      let r = Math.random() * total;
      let k = 0;
      for (; k < left.length - 1; k++) { r -= weight(left[k].id); if (r <= 0) break; }
      const c = left.splice(k, 1)[0];
      if (seenH.has(c.h)) continue;
      seenH.add(c.h);
      out.push(c.id);
    }
    return out;
  }
  const enParts = (c) => c.en.toLowerCase().replace(/\(.*?\)/g, '').split(/[\/,]/).map((s) => s.trim()).filter(Boolean);
  function clash(a, b) {
    if (a.h === b.h || a.vi === b.vi) return true;
    const ea = enParts(a);
    if (enParts(b).some((x) => ea.includes(x))) return true;
    const SAME = [['二', '两'], ['你', '您'], ['短', '矮'], ['冬', '冷'], ['会', '可以'], ['现在', '今天'], ['他', '她', '它'], ['我', '我们']];
    return SAME.some((g) => g.includes(a.h) && g.includes(b.h));
  }
  /** Lấy k thẻ nhiễu cho thẻ c: ưu tiên cùng cấp và (tuỳ chọn) cùng độ dài chữ. */
  function distractors(c, k, { sameLen = false } = {}) {
    const ok = CARDS.filter((x) => x.id !== c.id && !clash(c, x));
    const chosen = [];
    const tiers = [
      ok.filter((x) => x.lv === c.lv && (!sameLen || [...x.h].length === [...c.h].length)),
      ok.filter((x) => store.levels.includes(x.lv) && (!sameLen || [...x.h].length === [...c.h].length)),
      ok.filter((x) => !sameLen || [...x.h].length === [...c.h].length),
      ok,
    ];
    for (const t of tiers) {
      for (const x of shuffle(t)) {
        if (chosen.length >= k) break;
        if (chosen.some((y) => clash(x, y))) continue;
        chosen.push(x);
      }
      if (chosen.length >= k) break;
    }
    return chosen;
  }

  /* ====================== KHUNG HTML ====================== */
  const levelCount = (l) => CARDS.filter((c) => c.lv === l).length;
  root.innerHTML = `<style>${css}</style>
<div class="yc${canSpeak ? '' : ' no-tts'}" id="yc">
  <div class="toolbar">
    <div class="tb-group" role="group" aria-label="Chọn cấp YCT">
      <span class="tb-label">Cấp độ</span>
      ${LEVELS.map((l) => `<button type="button" class="chip" data-act="level" data-lv="${l}" aria-pressed="false">YCT ${l} <span class="n">${levelCount(l)}</span></button>`).join('')}
    </div>
    <div class="tb-group" role="group" aria-label="Tuỳ chọn hiển thị">
      <button type="button" class="chip toggle" data-act="opt" data-opt="py" aria-pressed="true">Pinyin</button>
      <button type="button" class="chip toggle" data-act="opt" data-opt="en" aria-pressed="false">Tiếng Anh</button>
      ${canSpeak ? '<button type="button" class="chip toggle" data-act="opt" data-opt="auto" aria-pressed="false" title="Tự đọc to chữ Hán khi hiện thẻ">Tự phát âm</button>' : ''}
    </div>
    <p class="tts-note" id="ttsNote" hidden>Máy này chưa có giọng đọc tiếng Trung nên nút loa có thể không phát âm. Trên Windows: Cài đặt &gt; Thời gian &amp; ngôn ngữ &gt; Giọng nói, thêm giọng tiếng Trung (giản thể).</p>
  </div>

  <div class="toast" id="toast" role="status" aria-live="polite" hidden></div>

  <section class="page" data-page="tra-tu" aria-labelledby="h-tra-tu" hidden>
    <div class="sec-head"><h2 id="h-tra-tu">Tra từ mới</h2><p>Gõ chữ Hán (ví dụ 学习) hoặc nghĩa tiếng Việt (ví dụ "học tập"). App tìm pinyin, nghĩa, câu ví dụ và tự lưu vào Sổ từ của tôi để ôn bằng thẻ hoặc nghe - viết.</p></div>
    <div id="zNote"></div>
    <form class="lk-form" id="zLkForm" autocomplete="off">
      <label class="sr-only" for="zLkInput">Từ cần tra</label>
      <input id="zLkInput" class="input" type="search" enterkeyhint="search" placeholder="Chữ Hán hoặc nghĩa tiếng Việt, ví dụ: 电脑 / máy tính" maxlength="40" autocapitalize="off" spellcheck="false">
      <button class="btn primary" type="submit">Tra từ</button>
    </form>
    <div id="zLkResult" aria-live="polite"></div>
    <div id="zRecent"></div>
  </section>

  <section class="page" data-page="lat-the" aria-labelledby="h-lat-the">
    <div class="sec-head"><h2 id="h-lat-the">Lật thẻ</h2><p>Nhìn hình và chữ Hán, thử nhớ nghĩa rồi bấm vào thẻ để lật xem nghĩa và câu ví dụ. Tự chấm "Đã nhớ" hoặc "Chưa nhớ" để app biết thẻ nào cần ôn thêm.</p></div>
    <div id="fc"></div>
  </section>

  <section class="page" data-page="doan-nghia" aria-labelledby="h-doan-nghia" hidden>
    <div class="sec-head"><h2 id="h-doan-nghia">Nhìn chữ &amp; hình đoán nghĩa</h2><p>Nhìn chữ Hán và hình minh hoạ, chọn nghĩa tiếng Việt đúng. Bấm phím 1-4 để chọn, Enter để sang câu tiếp.</p></div>
    <div id="qz-doan-nghia" class="quiz"></div>
  </section>

  <section class="page" data-page="ghep-cau" aria-labelledby="h-ghep-cau" hidden>
    <div class="sec-head"><h2 id="h-ghep-cau">Ghép câu</h2><p>Đọc nghĩa tiếng Việt, bấm lần lượt các mảnh chữ để xếp thành câu tiếng Trung. Bấm vào mảnh đã xếp để bỏ ra. Có thể có mảnh thừa không dùng tới.</p></div>
    <div id="qz-ghep-cau" class="quiz"></div>
  </section>

  <section class="page" data-page="chon-chu" aria-labelledby="h-chon-chu" hidden>
    <div class="sec-head"><h2 id="h-chon-chu">Chọn chữ đúng</h2><p>Chọn chữ Hán khớp với hình và nghĩa, hoặc chọn chữ còn thiếu trong câu. Bấm phím 1-4 để chọn, Enter để sang câu tiếp.</p></div>
    <div id="qz-chon-chu" class="quiz"></div>
  </section>

  <section class="page" data-page="nghe-viet" aria-labelledby="h-nghe-viet" hidden>
    <div class="sec-head"><h2 id="h-nghe-viet">Nghe &amp; viết</h2><p>Nghe đọc một từ rồi gõ lại bằng chữ Hán hoặc pinyin (pinyin không cần dấu thanh, ví dụ "xuexi"). Bấm Enter để kiểm tra và sang câu tiếp.</p></div>
    <div id="qz-nghe-viet" class="quiz"></div>
  </section>

  <section class="page" data-page="so-tu" aria-labelledby="h-so-tu" hidden>
    <div class="sec-head"><h2 id="h-so-tu">Sổ từ của tôi</h2><p>Các từ bạn đã tra ở trang Tra từ mới. Ôn các từ này ở Lật thẻ hoặc Nghe &amp; viết bằng cách chọn bộ thẻ "Sổ từ của tôi".</p></div>
    <div id="zNb"></div>
  </section>

  <section class="page" data-page="tien-do" aria-labelledby="h-tien-do" hidden>
    <div class="sec-head"><h2 id="h-tien-do">Tiến độ &amp; bộ thẻ</h2><p>Thẻ được tính là "đã thuộc" khi trả lời đúng hoặc tự chấm "Đã nhớ" 3 lần liên tiếp; trả lời sai sẽ đưa thẻ về "đang học". Bấm vào một thẻ để mở nó ở chế độ Lật thẻ.</p></div>
    <div id="prog"></div>
  </section>
</div>`;
  const $ = (id) => root.getElementById(id);
  const yc = $('yc');
  let toastTimer = 0;
  function toast(msg, kind = '') {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 4500);
  }
  if (voicesChecked) $('ttsNote').hidden = Boolean(zhVoice);

  function syncToolbar() {
    root.querySelectorAll('[data-act="level"]').forEach((b) => b.setAttribute('aria-pressed', store.levels.includes(+b.dataset.lv) ? 'true' : 'false'));
    root.querySelectorAll('[data-act="opt"]').forEach((b) => b.setAttribute('aria-pressed', store[b.dataset.opt] ? 'true' : 'false'));
    yc.classList.toggle('no-py', !store.py);
    yc.classList.toggle('no-en', !store.en);
  }

  /* ====================== ĐIỀU HƯỚNG TRANG CON ====================== */
  const pageIds = PAGES.map((p) => p.id);
  const pageLabel = Object.fromEntries(PAGES.map((p) => [p.id, p.label]));
  nav.innerHTML =
    '<button type="button" class="tn-nav-toggle" aria-expanded="false" aria-controls="chineseNavList">' +
      '<span class="tn-nav-toggle-text"><span class="tn-nav-hint">Đang xem</span><span class="tn-nav-current"></span></span>' +
      '<span class="tn-nav-caret" aria-hidden="true">▼</span>' +
    '</button>' +
    '<div class="tn-nav-list" id="chineseNavList">' +
      PAGES.map((p) => `<button type="button" class="tn-nav-btn" data-yc-page="${p.id}">${esc(p.label)}</button>`).join('') +
    '</div>';
  const navToggle = nav.querySelector('.tn-nav-toggle');
  function setNavOpen(open) {
    nav.classList.toggle('is-open', open);
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    navToggle.querySelector('.tn-nav-caret').textContent = open ? '▲' : '▼';
  }
  nav.onclick = (e) => {
    if (e.target.closest('.tn-nav-toggle')) { setNavOpen(!nav.classList.contains('is-open')); return; }
    const b = e.target.closest('[data-yc-page]');
    if (b) { setNavOpen(false); showPage(b.dataset.ycPage, { scroll: true }); }
  };
  if (!nav.dataset.ycBound) {
    nav.dataset.ycBound = '1';
    document.addEventListener('click', (e) => { if (nav.classList.contains('is-open') && !nav.contains(e.target)) setNavOpen(false); });
  }

  function scrollIntoViewIfAbove(el) {
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.6) el.scrollIntoView({ block: 'start', behavior: smooth() });
  }
  const scrollToTop = () => scrollIntoViewIfAbove(scrollAnchor || nav);

  function showPage(id, { scroll = false } = {}) {
    if (!pageIds.includes(id)) id = 'lat-the';
    root.querySelectorAll('.page').forEach((s) => { s.hidden = s.dataset.page !== id; });
    nav.querySelectorAll('[data-yc-page]').forEach((b) => {
      const on = b.dataset.ycPage === id;
      if (on) { b.dataset.active = 'true'; b.setAttribute('aria-current', 'page'); }
      else { delete b.dataset.active; b.removeAttribute('aria-current'); }
    });
    nav.querySelector('.tn-nav-current').textContent = `${pageIds.indexOf(id) + 1}/${pageIds.length} · ${pageLabel[id]}`;
    store.page = id;
    save();
    if (id === 'lat-the') renderFc();
    else if (id === 'tien-do') renderProgress();
    else if (id === 'tra-tu') { renderLookup(); renderRecent(); }
    else if (id === 'so-tu') renderNotebook();
    else renderQuiz(id);
    if (scroll) scrollToTop();
  }

  /* ====================== 1. LẬT THẺ ====================== */
  let fcList = null; // danh sách id đang lật
  let fcBack = false;
  let fcJustRated = null;
  function buildFcList() {
    let list = poolBySrc(store.fc.src);
    if (store.fc.only) list = list.filter((c) => status(c.id) !== 'known');
    let ids = list.map((c) => c.id);
    if (store.fc.shuffle) ids = shuffle(ids);
    fcList = ids;
    if (store.fc.i >= fcList.length) store.fc.i = 0;
  }
  function renderFc() {
    if (!fcList) buildFcList();
    const box = $('fc');
    const total = fcList.length;
    const ctrl = `<div class="fc-nav">
      ${srcChips('fc-src', store.fc.src)}
      <button type="button" class="chip toggle" data-act="fc-shuffle" aria-pressed="${store.fc.shuffle}">Trộn thứ tự</button>
      <button type="button" class="chip toggle" data-act="fc-only" aria-pressed="${store.fc.only}">Chỉ thẻ chưa thuộc</button>
      <button type="button" class="chip" data-act="fc-first">Về thẻ đầu</button>
    </div>`;
    if (!total) {
      const emptyMsg = store.fc.only ? 'Bạn đã thuộc hết thẻ của bộ đang chọn. Tắt "Chỉ thẻ chưa thuộc" để xem lại toàn bộ.'
        : store.fc.src === 'mine' ? (mineState === 'loading' ? 'Đang tải Sổ từ của tôi...' : 'Sổ từ của tôi đang trống. <button type="button" class="linkbtn" data-act="goto" data-page="tra-tu">Tra từ mới</button> để thêm từ.')
        : 'Chưa có thẻ nào. Hãy chọn ít nhất một cấp YCT ở trên.';
      box.innerHTML = `<div class="fc-wrap">${ctrl}<div class="fc-empty">${emptyMsg}</div></div>`;
      return;
    }
    const c = getCard(fcList[store.fc.i]);
    if (!c) { fcList = null; renderFc(); return; }
    const back = c.ex
      ? `<div class="fc-hzsm">${esc(c.h)}</div>
         <div class="fc-vi">${esc(c.vi)}</div>
         <div class="fc-en en-opt">${esc(c.en)}</div>
         <div class="fc-sep"></div>
         <div class="fc-ex">${esc(c.ex)}</div>
         <div class="fc-expy py py-opt">${esc(c.exPy)}</div>
         <div class="fc-exvi">${esc(c.exVi)}</div>
         <div class="fc-en en-opt">${esc(c.exEn)}</div>`
      : `<div class="fc-hzsm">${esc(c.h)}</div>
         <div class="fc-expy py py-opt">${esc(c.py)}</div>
         <div class="fc-sep"></div>
         <div class="fc-vi">${esc(c.vi)}</div>
         <div class="fc-en en-opt">${esc(c.en)}</div>`;
    box.innerHTML = `<div class="fc-wrap">
      ${ctrl}
      <div class="fc-meta"><span>Thẻ <b>${store.fc.i + 1}</b>/${total}</span><span>${c.mine ? 'Sổ từ của tôi' : 'YCT ' + c.lv}</span>${badge(c.id)}${fcJustRated ? `<span class="muted small">${esc(fcJustRated)}</span>` : ''}<span class="fc-keys small">Phím tắt: Space lật thẻ · ← → chuyển thẻ · 1 chưa nhớ · 2 đã nhớ</span></div>
      <button type="button" class="flip${fcBack ? ' is-back' : ''}" data-act="flip" aria-label="Lật thẻ (phím cách)">
        <span class="flip-inner">
          <span class="face front${c.mine ? ' no-pic' : ''}" aria-hidden="${fcBack}">
            ${img(c, 'span')}
            <span class="fc-hz">${esc(c.h)}</span>
            <span class="fc-py py py-opt">${esc(c.py)}</span>
            <span class="fc-tap">Bấm vào thẻ để lật</span>
          </span>
          <span class="face back" aria-hidden="${!fcBack}">${back}</span>
        </span>
      </button>
      <div class="row center fc-say">${sayBtn(c.h)}<span class="muted small">Nghe từ</span>${c.ex ? `${sayBtn(c.ex, true)}<span class="muted small">Nghe câu ví dụ</span>` : ''}</div>
      <div class="fc-actions">
        <button type="button" class="btn nav-btn" data-act="fc-prev" aria-label="Thẻ trước">‹</button>
        <button type="button" class="btn again" data-act="fc-rate" data-ok="0">Chưa nhớ <kbd>1</kbd></button>
        <button type="button" class="btn good" data-act="fc-rate" data-ok="1">Đã nhớ <kbd>2</kbd></button>
        <button type="button" class="btn nav-btn" data-act="fc-next" aria-label="Thẻ sau">›</button>
      </div>
    </div>`;
    preload(getCard(fcList[store.fc.i + 1]));
    if (store.auto && !fcBack) speak(c.h);
  }
  function fcGo(delta) {
    if (!fcList || !fcList.length) return;
    store.fc.i = (store.fc.i + delta + fcList.length) % fcList.length;
    fcBack = false;
    fcJustRated = null;
    save();
    renderFc();
  }
  function fcRate(ok) {
    if (!fcList || !fcList.length) return;
    const id = fcList[store.fc.i];
    grade(id, ok);
    const c = getCard(id);
    fcJustRated = ok ? `Đã ghi nhớ "${c.h}"` : `Sẽ ôn lại "${c.h}"`;
    if (store.fc.only && status(id) === 'known') {
      fcList.splice(store.fc.i, 1);
      if (store.fc.i >= fcList.length) store.fc.i = 0;
    } else {
      store.fc.i = (store.fc.i + 1) % fcList.length;
    }
    fcBack = false;
    save();
    const msg = fcJustRated;
    renderFc();
    fcJustRated = msg;
  }

  /* ====================== 2-4. LUYỆN TẬP ====================== */
  const MODES = {
    'doan-nghia': { eligible: () => pool(), make: makeMeaningQ, render: renderMeaningQ },
    'ghep-cau': { eligible: () => pool().filter((c) => c.tok && c.tok.length >= 2), make: makeBuildQ, render: renderBuildQ },
    'chon-chu': { eligible: () => pool(), make: makePickQ, render: renderPickQ },
    'nghe-viet': { eligible: () => poolBySrc(store.nv.src), make: makeListenQ, render: renderListenQ },
  };
  const sessions = {}; // mode -> { items, i, right, log, q, answered }

  function startSession(mode, ids = null) {
    const elig = MODES[mode].eligible();
    const items = ids ? ids.filter((id) => getCard(id)) : pickItems(elig, store.len);
    sessions[mode] = { items, i: 0, right: 0, log: [], q: null, answered: false };
    if (items.length) sessions[mode].q = MODES[mode].make(getCard(items[0]));
    preload(getCard(items[1]));
  }
  function renderQuiz(mode) {
    if (!sessions[mode]) startSession(mode);
    const S = sessions[mode];
    const box = $('qz-' + mode);
    if (!S.items.length) {
      const msg = mode === 'ghep-cau' ? 'Cấp độ đang chọn chưa có câu ví dụ nào để ghép.'
        : mode === 'nghe-viet' && store.nv.src === 'mine' ? 'Sổ từ của tôi đang trống. <button type="button" class="linkbtn" data-act="goto" data-page="tra-tu">Tra từ mới</button> để thêm từ, hoặc chọn bộ thẻ YCT.'
        : 'Chưa có thẻ nào. Hãy chọn ít nhất một cấp YCT ở trên.';
      box.innerHTML = `${mode === 'nghe-viet' ? `<div class="row">${srcChips('nv-src', store.nv.src)}</div>` : ''}<div class="fc-empty">${msg}</div>`;
      return;
    }
    if (S.i >= S.items.length) { renderDone(mode); return; }
    const pct = Math.round((S.i / S.items.length) * 100);
    const top = `<div class="q-top">
        <span>Câu <b>${S.i + 1}</b>/${S.items.length} · Đúng <b>${S.right}</b></span>
        <span class="row">${mode === 'doan-nghia' ? `<button type="button" class="chip toggle" data-act="opt" data-opt="hidePic" aria-pressed="${store.hidePic}" title="Chỉ nhìn chữ, không xem hình">Ẩn hình</button>` : ''}${mode === 'nghe-viet' ? `<button type="button" class="chip toggle" data-act="nv-hint" data-h="hintPy" aria-pressed="${store.nv.hintPy}">Gợi ý pinyin</button><button type="button" class="chip toggle" data-act="nv-hint" data-h="hintVi" aria-pressed="${store.nv.hintVi}">Gợi ý nghĩa</button>` : ''}<button type="button" class="linkbtn" data-act="restart" data-mode="${mode}">Làm lượt mới</button></span>
        <div class="q-bar" aria-hidden="true"><i style="width:${pct}%"></i></div>
      </div>`;
    box.innerHTML = (mode === 'nghe-viet' ? `<div class="row">${srcChips('nv-src', store.nv.src)}</div>` : '') + top + `<div class="q-card" id="qc-${mode}">${MODES[mode].render(S.q, S)}</div>`;
    if (store.auto && mode === 'doan-nghia' && !S.answered) speak(S.q.c.h);
    if (mode === 'nghe-viet' && !S.answered) {
      if (!S.q.spoken) { S.q.spoken = true; speak(S.q.c.h); }
      const inp = $('nvInput');
      if (inp) inp.focus({ preventScroll: true });
    }
  }
  function nextQ(mode) {
    const S = sessions[mode];
    if (!S || !S.answered) return;
    S.i += 1;
    S.answered = false;
    if (S.i < S.items.length) {
      S.q = MODES[mode].make(getCard(S.items[S.i]));
      preload(getCard(S.items[S.i + 1]));
    }
    renderQuiz(mode);
    scrollIntoViewIfAbove($('qz-' + mode));
  }
  function record(mode, ok) {
    const S = sessions[mode];
    S.answered = true;
    if (ok) S.right += 1;
    S.log.push({ id: S.q.c.id, ok });
    grade(S.q.c.id, ok);
  }
  const fbExample = (c) => c.ex
    ? `<div class="fb-ex"><span class="zh">${esc(c.ex)}</span>${sayBtn(c.ex, true)}<span class="py py-opt">${esc(c.exPy)}</span></div>
       <div>${esc(c.exVi)} <span class="muted en-opt">(${esc(c.exEn)})</span></div>`
    : '';
  const nextBtn = (mode, last) => `<div class="q-actions"><button type="button" class="btn primary" data-act="next" data-mode="${mode}">${last ? 'Xem kết quả' : 'Câu tiếp'} <kbd>Enter</kbd></button></div>`;

  /* ---- 2. Đoán nghĩa ---- */
  function makeMeaningQ(c) {
    const opts = shuffle([c, ...distractors(c, 3)]);
    return { c, opts, pick: null };
  }
  function renderMeaningQ(q, S) {
    const { c } = q;
    const last = S.i === S.items.length - 1;
    const opts = q.opts.map((o, k) => {
      let cls = '';
      if (S.answered) cls = o.id === c.id ? ' right' : o.id === q.pick ? ' wrong' : ' dim';
      return `<button type="button" class="opt${cls}" data-act="ans" data-mode="doan-nghia" data-id="${o.id}"${S.answered ? ' disabled' : ''}><span class="k">${k + 1}</span><span class="t">${esc(o.vi)}<small class="en-opt">${esc(o.en)}</small></span></button>`;
    }).join('');
    let fb = '';
    if (S.answered) {
      const ok = q.pick === c.id;
      fb = `<div class="fb ${ok ? 'ok' : 'no'}" role="status">
        <div class="fb-title">${ok ? 'Chính xác!' : 'Chưa đúng.'} <span>${esc(c.h)} = ${esc(c.vi)}</span></div>
        ${fbExample(c)}
      </div>${nextBtn('doan-nghia', last)}`;
    }
    return `<div class="q-stage${store.hidePic ? ' no-pic' : ''}">
        ${store.hidePic ? '' : img(c)}
        <div class="q-word"><span class="q-hz">${esc(c.h)}</span><span class="q-py py py-opt">${esc(c.py)}</span>${sayBtn(c.h)}</div>
      </div>
      <p class="q-ask">Từ này nghĩa là gì?</p>
      <div class="opts">${opts}</div>${fb}`;
  }

  /* ---- 4. Chọn chữ đúng ---- */
  function makePickQ(c) {
    const canBlank = c.ex && c.ex.includes(c.h) && c.ex !== c.h;
    const type = canBlank && Math.random() < 0.5 ? 'blank' : 'pick';
    const opts = shuffle([c, ...distractors(c, 3, { sameLen: true })]);
    return { c, type, opts, pick: null };
  }
  function renderPickQ(q, S) {
    const { c } = q;
    const last = S.i === S.items.length - 1;
    const opts = q.opts.map((o, k) => {
      let cls = '';
      if (S.answered) cls = o.id === c.id ? ' right' : o.id === q.pick ? ' wrong' : ' dim';
      const after = S.answered ? `<small class="py-opt">${esc(o.py)}</small><small>${esc(o.vi)}</small>` : '';
      return `<button type="button" class="opt hz-opt${cls}" data-act="ans" data-mode="chon-chu" data-id="${o.id}"${S.answered ? ' disabled' : ''}><span class="k">${k + 1}</span><span class="t"><span class="big">${esc(o.h)}</span>${after}</span></button>`;
    }).join('');
    let stage;
    if (q.type === 'blank') {
      const parts = c.ex.split(c.h).map(esc);
      const blank = S.answered ? `<span class="blank filled">${esc(c.h)}</span>` : '<span class="blank" aria-label="chỗ trống">&nbsp;</span>';
      stage = `<div class="prompt-box${picHidden(c, S) ? ' no-pic' : ''}">${picHidden(c, S) ? '' : img(c)}<div>
          <div class="q-sent">${parts.join(blank)}</div>
          ${S.answered ? `<div class="py py-opt" style="text-align:center">${esc(c.exPy)}</div>` : ''}
          <div class="q-vi" style="font-size:17px;font-weight:600;text-align:center">${esc(c.exVi)}</div>
          <div class="en-opt muted" style="text-align:center">${esc(c.exEn)}</div>
        </div></div>
        <p class="q-ask">Chọn chữ điền vào chỗ trống</p>`;
    } else {
      stage = `<div class="q-stage${picHidden(c, S) ? ' no-pic' : ''}">
          ${picHidden(c, S) ? '' : img(c)}
          <div class="q-word"><span class="q-vi">${esc(c.vi)}</span><span class="en-opt muted">${esc(c.en)}</span><span class="q-py py py-opt">${esc(c.py)}</span>${sayBtn(c.h)}</div>
        </div>
        <p class="q-ask">Chọn chữ Hán đúng</p>`;
    }
    let fb = '';
    if (S.answered) {
      const ok = q.pick === c.id;
      fb = `<div class="fb ${ok ? 'ok' : 'no'}" role="status">
        <div class="fb-title">${ok ? 'Chính xác!' : 'Chưa đúng.'} <span class="zh">${esc(c.h)}</span> <span class="py">${esc(c.py)}</span> · ${esc(c.vi)}</div>
        ${q.type === 'pick' ? fbExample(c) : ''}
      </div>${nextBtn('chon-chu', last)}`;
    }
    return stage + `<div class="opts hz-opts">${opts}</div>` + fb;
  }

  function answer(mode, id) {
    const S = sessions[mode];
    if (!S || S.answered || !S.q) return;
    S.q.pick = id;
    const ok = id === S.q.c.id;
    record(mode, ok);
    renderQuiz(mode);
    if (mode === 'chon-chu' || store.auto) speak(S.q.type === 'blank' ? S.q.c.ex : S.q.c.h);
    const btn = root.querySelector(`#qz-${mode} [data-act="next"]`);
    if (btn) btn.focus({ preventScroll: true });
  }

  /* ---- 3. Ghép câu ---- */
  function makeBuildQ(c) {
    const sentence = c.tok.join('');
    const extraN = c.tok.length <= 3 ? 2 : 1;
    const pool2 = shuffle(CARDS.filter((x) => x.tok && x.id !== c.id));
    const extras = [];
    for (const x of pool2) {
      for (const [k, t] of x.tok.entries()) {
        if (extras.length >= extraN) break;
        if ([...t].some((ch) => sentence.includes(ch))) continue;
        if (extras.some((e) => e.t === t)) continue;
        if (Math.random() < 0.5) extras.push({ t, p: x.tokPy[k] });
      }
      if (extras.length >= extraN) break;
    }
    let tiles = [...c.tok.map((t, k) => ({ t, p: c.tokPy[k] })), ...extras].map((x, k) => ({ ...x, k }));
    const correctOrder = c.tok.join('|');
    for (let tries = 0; tries < 6; tries++) {
      tiles = shuffle(tiles);
      if (tiles.slice(0, c.tok.length).map((x) => x.t).join('|') !== correctOrder) break;
    }
    const answers = [sentence];
    if (c.tok.length === 3 && c.tok[1] === '和') answers.push(c.tok[2] + '和' + c.tok[0]);
    return { c, tiles, placed: [], answers, result: null };
  }
  function renderBuildQ(q, S) {
    const { c } = q;
    const last = S.i === S.items.length - 1;
    const tileBtn = (x, where) => `<button type="button" class="tile${where === 'bank' && q.placed.includes(x.k) ? ' used' : ''}" data-act="${where === 'bank' ? 'place' : 'unplace'}" data-k="${x.k}"${S.answered ? ' disabled' : ''} aria-label="${esc(x.t)}"><span class="zh">${esc(x.t)}</span><span class="tp py-opt">${esc(x.p)}</span></button>`;
    const placed = q.placed.map((k) => tileBtn(q.tiles.find((x) => x.k === k), 'slot')).join('');
    const slotCls = S.answered ? (q.result ? ' ok' : ' no') : '';
    let fb = '';
    if (S.answered) {
      fb = `<div class="fb ${q.result ? 'ok' : 'no'}" role="status">
        <div class="fb-title">${q.result ? 'Chính xác!' : 'Chưa đúng. Câu đúng là:'}</div>
        <div class="fb-ex"><span class="zh">${esc(c.ex)}</span>${sayBtn(c.ex, true)}<span class="py py-opt">${esc(c.exPy)}</span></div>
        <div>Từ trọng tâm: <span class="zh">${esc(c.h)}</span> <span class="py">${esc(c.py)}</span> · ${esc(c.vi)}</div>
      </div>${nextBtn('ghep-cau', last)}`;
    }
    return `<div class="prompt-box${picHidden(c, S) ? ' no-pic' : ''}">${picHidden(c, S) ? '' : img(c)}<div>
        <p class="q-ask">Dịch sang tiếng Trung:</p>
        <div class="q-vi">${esc(c.exVi)}</div>
        <div class="en-opt">${esc(c.exEn)}</div>
      </div></div>
      <div class="slots${slotCls}" aria-label="Câu của bạn" aria-live="polite">${placed || '<span class="slots-hint">Bấm các mảnh bên dưới để xếp câu (có thể có mảnh thừa)</span>'}</div>
      <div class="bank" aria-label="Các mảnh chữ">${q.tiles.map((x) => tileBtn(x, 'bank')).join('')}</div>
      ${S.answered ? '' : `<div class="q-actions">
        <button type="button" class="btn" data-act="clear"${q.placed.length ? '' : ' disabled'}>Xếp lại</button>
        <button type="button" class="btn primary" data-act="check"${q.placed.length ? '' : ' disabled'}>Kiểm tra <kbd>Enter</kbd></button>
      </div>`}
      ${fb}`;
  }
  function buildPlace(k) {
    const S = sessions['ghep-cau'];
    if (!S || S.answered) return;
    if (!S.q.placed.includes(k)) S.q.placed.push(k);
    renderQuiz('ghep-cau');
  }
  function buildUnplace(k) {
    const S = sessions['ghep-cau'];
    if (!S || S.answered) return;
    S.q.placed = S.q.placed.filter((x) => x !== k);
    renderQuiz('ghep-cau');
  }
  function buildCheck() {
    const S = sessions['ghep-cau'];
    if (!S || S.answered || !S.q.placed.length) return;
    const got = S.q.placed.map((k) => S.q.tiles.find((x) => x.k === k).t).join('');
    S.q.result = S.q.answers.includes(got);
    record('ghep-cau', S.q.result);
    renderQuiz('ghep-cau');
    speak(S.q.c.ex);
    const btn = root.querySelector('#qz-ghep-cau [data-act="next"]');
    if (btn) btn.focus({ preventScroll: true });
  }

  /* ---- kết thúc lượt ---- */
  function renderDone(mode) {
    const S = sessions[mode];
    const n = S.items.length;
    const p = Math.round((S.right / n) * 100);
    const miss = [...new Set(S.log.filter((x) => !x.ok).map((x) => x.id))].map(getCard).filter(Boolean);
    const msg = p === 100 ? 'Xuất sắc, đúng hết!' : p >= 80 ? 'Rất tốt!' : p >= 50 ? 'Khá rồi, ôn thêm chút nữa nhé.' : 'Cần ôn thêm. Thử chế độ Lật thẻ với các từ sai bên dưới.';
    $('qz-' + mode).innerHTML = `<div class="q-card"><div class="done">
      <div class="score-ring" style="--p:${p}"><span>${S.right}/${n}</span></div>
      <h3>${msg}</h3>
      ${miss.length ? `<div class="miss-list"><p class="muted small">Các từ trả lời sai:</p>${miss.map((c) => `<div class="miss">${c.mine ? '<span class="miss-noimg" aria-hidden="true"></span>' : `<img src="${imgUrl(c.id)}" width="320" height="290" alt="" loading="lazy">`}<div><span class="zh">${esc(c.h)}</span> <span class="py">${esc(c.py)}</span><div class="small">${esc(c.vi)}${c.ex ? ` · <span class="zh">${esc(c.ex)}</span>` : ''}</div></div>${sayBtn(c.h, true)}</div>`).join('')}</div>` : ''}
      <div class="len-pick"><span class="muted small">Số câu mỗi lượt:</span>${[10, 20, 30].map((k) => `<button type="button" class="chip" data-act="len" data-len="${k}" aria-pressed="${store.len === k}">${k}</button>`).join('')}</div>
      <div class="row center">
        ${miss.length ? `<button type="button" class="btn" data-act="retry" data-mode="${mode}">Làm lại ${miss.length} câu sai</button>` : ''}
        <button type="button" class="btn primary" data-act="restart" data-mode="${mode}">Luyện lượt mới <kbd>Enter</kbd></button>
      </div>
    </div></div>`;
  }

  /* ====================== 5. TIẾN ĐỘ ====================== */
  let progFilter = 'all';
  let resetArmed = 0;
  function renderProgress() {
    const lvStats = LEVELS.map((l) => {
      const cs = CARDS.filter((c) => c.lv === l);
      const k = cs.filter((c) => status(c.id) === 'known').length;
      const ln = cs.filter((c) => status(c.id) === 'learn').length;
      let right = 0; let wrong = 0;
      cs.forEach((c) => { const s = stOf(c.id); if (s) { right += s.c; wrong += s.w; } });
      return { l, n: cs.length, k, ln, acc: right + wrong ? Math.round((right / (right + wrong)) * 100) : null };
    });
    const list = pool().filter((c) => progFilter === 'all' || status(c.id) === progFilter);
    const F = [['all', 'Tất cả'], ['new', 'Chưa học'], ['learn', 'Đang học'], ['known', 'Đã thuộc']];
    $('prog').innerHTML = `
      <div class="stats">${lvStats.map((s) => `<div class="stat">
        <h3>YCT ${s.l} <span>${s.k}/${s.n} đã thuộc</span></h3>
        <div class="stack" role="img" aria-label="Đã thuộc ${s.k}, đang học ${s.ln}, chưa học ${s.n - s.k - s.ln}"><i class="k" style="width:${(s.k / s.n) * 100}%"></i><i class="l" style="width:${(s.ln / s.n) * 100}%"></i></div>
        <p class="muted small">Đang học ${s.ln} · Chưa học ${s.n - s.k - s.ln}${s.acc !== null ? ` · Tỉ lệ đúng ${s.acc}%` : ''}</p>
      </div>`).join('')}</div>
      <div class="legend"><span><i style="background:#22c55e"></i>Đã thuộc</span><span><i style="background:#f59e0b"></i>Đang học</span><span><i style="background:#cbd5e1"></i>Chưa học</span></div>
      <div class="grid-head">
        <h3>Thẻ của cấp đang chọn (${list.length})</h3>
        <div class="row">${F.map(([k, t]) => `<button type="button" class="chip" data-act="pfilter" data-f="${k}" aria-pressed="${progFilter === k}">${t}</button>`).join('')}</div>
      </div>
      ${list.length ? `<div class="cards-grid">${list.map((c) => `<button type="button" class="mini s-${status(c.id)}" data-act="open-card" data-id="${c.id}" title="${esc(c.vi)}"><span class="dot" aria-hidden="true"></span><img src="${imgUrl(c.id)}" width="320" height="290" alt="" loading="lazy"><span class="zh">${esc(c.h)}</span><span class="py py-opt">${esc(c.py)}</span></button>`).join('')}</div>` : '<div class="fc-empty">Không có thẻ nào trong mục này.</div>'}
      <div class="danger-zone"><button type="button" class="btn again" data-act="reset">${resetArmed ? 'Bấm lần nữa để xoá hẳn' : 'Xoá tiến độ học'}</button><span>Chỉ xoá mức nhớ các thẻ trên trình duyệt này.</span></div>`;
  }


  /* ====================== NGHE & VIẾT ====================== */
  function makeListenQ(c) { return { c, typed: '', result: null, how: '', spoken: false }; }
  /** Đúng nếu gõ đúng chữ Hán, hoặc đúng pinyin (bỏ qua dấu thanh, khoảng trắng). */
  function judgeListen(typed, c) {
    const t = String(typed || '').trim();
    if (!t) return { ok: false, how: '' };
    if (hasHan(t)) return { ok: onlyHan(t) === c.h, how: 'han' };
    const want = plainPinyin(c.py);
    return { ok: Boolean(want) && plainPinyin(t) === want, how: 'py' };
  }
  function renderListenQ(q, S) {
    const { c } = q;
    const last = S.i === S.items.length - 1;
    const noVoice = !canSpeak || (voicesChecked && !zhVoice);
    const showPy = store.nv.hintPy || noVoice;
    const showVi = store.nv.hintVi || noVoice;
    let body = `<div class="q-word">
        ${canSpeak ? `<button type="button" class="say big" data-say="${esc(c.h)}" aria-label="Nghe lại" title="Nghe lại">${SAY_SVG}</button>` : ''}
        ${noVoice ? '<span class="muted small">Máy chưa có giọng đọc tiếng Trung: nhìn pinyin và nghĩa rồi gõ chữ Hán.</span>' : ''}
        ${showPy ? `<span class="q-py py">${esc(c.py)}</span>` : ''}
        ${showVi ? `<span class="q-vi sm">${esc(c.vi)}</span>` : ''}
      </div>`;
    if (!S.answered) {
      body += `<form class="spell-form" data-form="listen" autocomplete="off">
        <label class="sr-only" for="nvInput">Gõ chữ Hán hoặc pinyin</label>
        <input id="nvInput" class="input big" type="text" maxlength="40" placeholder="Chữ Hán hoặc pinyin" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" value="${esc(q.typed)}">
        <button class="btn primary" type="submit">Kiểm tra <kbd>Enter</kbd></button>
        <button class="btn" type="button" data-act="nv-skip">Không biết</button>
      </form>`;
    } else {
      const ok = q.result;
      body += `<div class="fb ${ok ? 'ok' : 'no'}" role="status">
        <div class="fb-title">${ok ? (q.how === 'py' ? 'Đúng pinyin!' : 'Chính xác!') : 'Chưa đúng.'} <span class="zh">${esc(c.h)}</span> <span class="py">${esc(c.py)}</span> · ${esc(c.vi)} ${sayBtn(c.h, true)}</div>
        ${!ok && q.typed ? `<div>Bạn gõ: <b>${esc(q.typed)}</b></div>` : ''}
        ${fbExample(c)}
      </div>${nextBtn('nghe-viet', last)}`;
    }
    return body;
  }
  function checkListen(typed) {
    const S = sessions['nghe-viet'];
    if (!S || S.answered || !S.q) return;
    S.q.typed = String(typed || '').trim().slice(0, 40);
    const j = judgeListen(S.q.typed, S.q.c);
    S.q.result = j.ok;
    S.q.how = j.how;
    record('nghe-viet', j.ok);
    renderQuiz('nghe-viet');
    const btn = root.querySelector('#qz-nghe-viet [data-act="next"]');
    if (btn) btn.focus({ preventScroll: true });
  }

  /* ====================== TRA TỪ MỚI ====================== */
  let lk = { state: 'idle', q: '', res: null, row: null, err: '', saveErr: '', exState: '', editing: false };
  let lkSeq = 0;
  const POS_VI = { noun: 'danh từ', verb: 'động từ', adjective: 'tính từ', adverb: 'phó từ', pronoun: 'đại từ', preposition: 'giới từ', conjunction: 'liên từ', interjection: 'thán từ', particle: 'trợ từ', numeral: 'số từ', 'measure word': 'lượng từ', classifier: 'lượng từ', abbreviation: 'viết tắt', phrase: 'cụm từ', suffix: 'hậu tố', prefix: 'tiền tố' };
  const posVi = (p) => POS_VI[String(p || '').toLowerCase()] || String(p || '').toLowerCase() || 'khác';

  async function doLookup(raw) {
    const q = String(raw || '').trim();
    const input = $('zLkInput');
    if (!q) { lk = { ...lk, state: 'error', err: 'Hãy nhập chữ Hán hoặc nghĩa tiếng Việt.' }; renderLookup(); return; }
    const seq = ++lkSeq;
    lk = { state: 'loading', q, res: null, row: null, err: '', saveErr: '', exState: '', editing: false };
    renderLookup();
    let res;
    try {
      res = await lookupZh(q);
    } catch (e) {
      if (seq !== lkSeq) return;
      lk = { ...lk, state: 'error', err: e.code ? e.message : 'Không tra được lúc này (mất mạng hoặc dịch vụ tra từ đang lỗi). Thử lại sau ít phút.' };
      renderLookup();
      return;
    }
    if (seq !== lkSeq) return;
    const yct = byHanzi.get(res.word) || null;
    // Từ có trong bộ YCT: dùng pinyin / nghĩa / câu ví dụ đã kiểm tra trên thẻ in.
    if (yct) {
      res.pinyin = yct.py || res.pinyin;
      if (yct.vi) res.meaningVi = yct.vi;
    }
    res.examples = yct && yct.ex ? [{ zh: yct.ex, py: yct.exPy, vi: yct.exVi, en: yct.exEn, yct: true }] : [];
    if (input && res.fromVi) input.value = res.word;
    lk = { state: 'done', q, res, row: mineByWord(res.word), err: '', saveErr: '', exState: 'loading', editing: false, yct };
    renderLookup();
    if (store.auto) speak(res.word);
    const saving = saveLookup(res, seq);
    // Câu ví dụ (Tatoeba) tải sau để không chờ lâu.
    let more = [];
    try { more = await examplesZh(res.word, yct && yct.ex ? 2 : 3); } catch (e) { more = []; }
    if (seq !== lkSeq) return;
    const seen = new Set(res.examples.map((x) => x.zh));
    res.examples = [...res.examples, ...more.filter((x) => !seen.has(x.zh))].slice(0, 3);
    lk.exState = 'done';
    await saving;
    if (seq !== lkSeq) return;
    if (lk.row && !arr(lk.row.examples).length && res.examples.length && mineState === 'ready') {
      try { const row = await dbUpdate(lk.row.id, { examples: res.examples.map(cleanEx) }); putMine(row); lk.row = row; } catch (e) { /* để lần sau */ }
    }
    renderLookup();
  }
  const cleanEx = (x) => ({ zh: String(x.zh || '').slice(0, 120), py: String(x.py || '').slice(0, 200), vi: String(x.vi || '').slice(0, 200), en: String(x.en || '').slice(0, 200) });
  const sensesToSave = (res) => res.senses.slice(0, 3).map((g) => ({ pos: g.pos, vi: arr(g.vi).slice(0, 4).map((x) => String(x).slice(0, 60)), en: arr(g.en).slice(0, 4).map((x) => String(x).slice(0, 60)) }));

  async function saveLookup(res, seq) {
    if (mineState !== 'ready') { lk.saveErr = mineState === 'loading' ? 'Sổ từ đang tải, chưa lưu được từ này.' : 'Chưa lưu được vào Sổ từ của tôi (xem thông báo ở trên).'; renderLookup(); return; }
    const existing = mineByWord(res.word);
    try {
      let row;
      if (existing) {
        const patch = { lookups: (existing.lookups || 1) + 1 };
        if (!existing.ipa && res.pinyin) patch.ipa = res.pinyin;
        if (!existing.meaning_vi && res.meaningVi) patch.meaning_vi = res.meaningVi;
        if (!existing.senses.length && res.senses.length) patch.senses = sensesToSave(res);
        row = await dbUpdate(existing.id, patch);
      } else {
        try {
          row = await dbInsert({ word: res.word, ipa: res.pinyin.slice(0, 200), meaning_vi: res.meaningVi.slice(0, 500), senses: sensesToSave(res), examples: res.examples.map(cleanEx) });
        } catch (e) {
          if (e.code !== '23505') throw e;
          await loadMine();
          const again = mineByWord(res.word);
          row = again ? await dbUpdate(again.id, { lookups: (again.lookups || 1) + 1 }) : null;
        }
      }
      if (row) putMine(row);
      if (seq !== lkSeq) return;
      lk.row = row;
      lk.saveErr = '';
    } catch (e) {
      if (seq !== lkSeq) return;
      lk.saveErr = 'Chưa lưu được vào Sổ từ của tôi: ' + dbErrText(e);
    }
    fcList = null;
    renderLookup();
    renderRecent();
  }

  function showSaved(r) {
    lkSeq++;
    const yct = byHanzi.get(r.word) || null;
    lk = { state: 'done', q: r.word, res: null, row: r, err: '', saveErr: '', exState: 'done', editing: false, yct };
    const input = $('zLkInput');
    if (input) input.value = r.word;
    renderLookup();
  }

  function renderLookup() {
    const box = $('zLkResult');
    if (!box) return;
    $('zNote').innerHTML = mineNotice();
    if (lk.state === 'idle') { box.innerHTML = ''; return; }
    if (lk.state === 'loading') { box.innerHTML = `<div class="card entry loading" aria-busy="true"><div class="spinner" aria-hidden="true"></div><p>Đang tra "<b>${esc(lk.q)}</b>"...</p></div>`; return; }
    if (lk.state === 'error') { box.innerHTML = `<div class="notice bad">${esc(lk.err)}</div>`; return; }
    const r = lk.row;
    const res = lk.res;
    const word = (r && r.word) || res.word;
    const py = (r && r.ipa) || (res && res.pinyin) || '';
    const meaning = (r && r.meaning_vi) || (res && res.meaningVi) || '';
    const senses = r && r.senses.length ? r.senses : res ? res.senses : [];
    const exs = r && r.examples.length && !(res && res.examples.length > r.examples.length) ? r.examples : res ? res.examples : [];
    const yct = lk.yct;
    const saveLine = r
      ? `<span class="saved">Đã lưu vào Sổ từ của tôi${r.lookups > 1 ? ` · tra ${r.lookups} lần` : ''}</span>${badge('u:' + r.id)}`
      : lk.saveErr ? `<span class="warn-text">${esc(lk.saveErr)}</span>` : '<span class="muted small">Đang lưu vào sổ từ...</span>';
    box.innerHTML = `<article class="card entry" aria-label="Kết quả tra ${esc(word)}">
      ${res && res.fromVi ? `<p class="muted small">Từ tiếng Trung cho "${esc(res.query)}":</p>` : ''}
      <header class="entry-head">
        <span class="entry-hz">${esc(word)}</span>
        <span class="entry-py py">${esc(py)}</span>
        ${sayBtn(word)}
        ${yct ? `<span class="badge s-known">Có trong YCT ${yct.lv}</span>` : ''}
      </header>
      <div class="meaning-box">
        ${lk.editing
          ? `<form class="edit-form" data-form="meaning"><label class="sr-only" for="zEdit">Nghĩa tiếng Việt</label><input id="zEdit" class="input" maxlength="200" value="${esc(meaning)}"><button class="btn primary" type="submit">Lưu nghĩa</button><button class="btn" type="button" data-act="z-edit-cancel">Huỷ</button></form>`
          : `<div class="meaning">${meaning ? esc(meaning) : '<span class="muted">Chưa có nghĩa tiếng Việt</span>'}</div>${r ? '<button type="button" class="linkbtn small" data-act="z-edit">Sửa nghĩa</button>' : ''}`}
      </div>
      ${senses.length ? `<div class="senses">${senses.map((g) => `<div class="sense"><span class="pos">${esc(posVi(g.pos))}</span><div class="sense-body">${arr(g.vi).length ? `<div class="sense-vi">${esc(arr(g.vi).join(', '))}</div>` : ''}${arr(g.en).length ? `<div class="muted small en-opt">${esc(arr(g.en).join(', '))}</div>` : ''}</div></div>`).join('')}</div>` : ''}
      ${yct ? `<div class="yct-hit">${img(yct, 'figure')}<div><b>Thẻ YCT ${yct.lv}</b><div class="small muted">Có hình minh hoạ và câu ví dụ trong bộ thẻ in.</div><button type="button" class="btn" data-act="open-card" data-id="${yct.id}">Mở thẻ YCT</button></div></div>` : ''}
      <h4 class="sub">Câu ví dụ</h4>
      ${exs.length ? `<div class="exs">${exs.map((x) => `<div class="ex"><div class="ex-zh"><span class="zh">${esc(x.zh)}</span>${sayBtn(x.zh, true)}</div>${x.py ? `<div class="py py-opt">${esc(x.py)}</div>` : ''}${x.vi ? `<div>${esc(x.vi)}</div>` : ''}${x.en ? `<div class="muted small en-opt">${esc(x.en)}</div>` : ''}</div>`).join('')}</div>` : ''}
      ${lk.exState === 'loading' ? '<p class="muted small">Đang tìm câu ví dụ...</p>' : !exs.length ? '<p class="muted small">Chưa tìm được câu ví dụ cho từ này.</p>' : ''}
      <footer class="entry-foot">
        <div class="row">${saveLine}</div>
        <div class="row">
          ${r ? `<button type="button" class="btn" data-act="open-card" data-id="u:${r.id}">Ôn thẻ này</button>
          <button type="button" class="btn ghost-bad" data-act="z-del" data-id="${r.id}">${delArmed === r.id ? 'Bấm lần nữa để xoá' : 'Xoá khỏi sổ'}</button>` : ''}
          ${res ? '' : `<button type="button" class="btn" data-act="z-lookup" data-w="${esc(word)}">Tra lại trên mạng</button>`}
        </div>
      </footer>
      <p class="src-note">Nguồn: Google Dịch (pinyin, nghĩa), Tatoeba (câu ví dụ), bộ thẻ YCT (nếu có). Nghĩa dịch tự động có thể chưa sát, hãy sửa lại cho đúng ngữ cảnh bạn học.</p>
    </article>`;
    if (lk.editing) { const i = $('zEdit'); if (i) { i.focus(); i.select(); } }
  }

  function renderRecent() {
    const box = $('zRecent');
    if (!box) return;
    if (mineState !== 'ready' || !mine.length) { box.innerHTML = ''; return; }
    const recent = mine.slice().sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at))).slice(0, 14);
    box.innerHTML = `<div class="recent">
      <div class="grid-head"><h3>Từ vừa tra</h3><button type="button" class="linkbtn" data-act="goto" data-page="so-tu">Xem cả sổ từ (${mine.length})</button></div>
      <div class="row">${recent.map((r) => `<button type="button" class="chip word-chip s-${status('u:' + r.id)}" data-act="z-show" data-id="${r.id}" title="${esc(r.meaning_vi)}"><span class="zh">${esc(r.word)}</span></button>`).join('')}</div>
    </div>`;
  }

  async function saveMeaning(val) {
    const r = lk.row;
    if (!r) return;
    try {
      const row = await dbUpdate(r.id, { meaning_vi: String(val || '').trim().slice(0, 200) });
      putMine(row);
      lk.row = row;
      lk.editing = false;
      toast('Đã lưu nghĩa mới.', 'ok');
    } catch (e) {
      toast('Chưa lưu được: ' + dbErrText(e), 'bad');
    }
    renderLookup();
  }

  let delArmed = null;
  let delTimer = 0;
  async function deleteMine(id, after) {
    if (delArmed !== id) {
      delArmed = id;
      clearTimeout(delTimer);
      delTimer = setTimeout(() => { delArmed = null; after(); }, 4000);
      after();
      return;
    }
    delArmed = null;
    clearTimeout(delTimer);
    const r = mineRow(id);
    try {
      await dbDelete(id);
      mine = mine.filter((x) => x.id !== id);
      mineCards.delete('u:' + id);
      if (lk.row && lk.row.id === id) lk = { state: 'idle', q: '', res: null, row: null, err: '' };
      fcList = null;
      delete sessions['nghe-viet'];
      toast(`Đã xoá "${r ? r.word : ''}" khỏi sổ từ.`, 'ok');
    } catch (e) {
      toast('Chưa xoá được: ' + dbErrText(e), 'bad');
    }
    after();
    renderRecent();
  }

  /* ====================== SỔ TỪ CỦA TÔI ====================== */
  let nbQuery = '';
  let nbPage = 0;
  const NB_PER_PAGE = 10;
  function nbFiltered() {
    const q = nbQuery.trim().toLowerCase();
    const qp = plainPinyin(q);
    let list = mine.filter((r) => {
      if (store.nb.filter !== 'all' && status('u:' + r.id) !== store.nb.filter) return false;
      if (!q) return true;
      return r.word.includes(nbQuery.trim()) || (r.meaning_vi || '').toLowerCase().includes(q) || (qp && plainPinyin(r.ipa).includes(qp));
    });
    if (store.nb.sort === 'weak') list = list.slice().sort((a, b) => weight('u:' + b.id) - weight('u:' + a.id) || b.wrong - a.wrong);
    else if (store.nb.sort === 'py') list = list.slice().sort((a, b) => plainPinyin(a.ipa).localeCompare(plainPinyin(b.ipa)));
    return list;
  }
  function nbListHtml() {
    if (mineState === 'loading') return '<div class="fc-empty">Đang tải Sổ từ của tôi...</div>';
    if (!mine.length) return '<div class="fc-empty">Sổ từ đang trống. <button type="button" class="linkbtn" data-act="goto" data-page="tra-tu">Tra từ mới</button> để thêm từ.</div>';
    const all = nbFiltered();
    if (!all.length) return '<div class="fc-empty">Không có từ nào khớp.</div>';
    const pages = Math.ceil(all.length / NB_PER_PAGE);
    nbPage = Math.max(0, Math.min(nbPage, pages - 1));
    const list = all.slice(nbPage * NB_PER_PAGE, (nbPage + 1) * NB_PER_PAGE);
    return `<ul class="nb-list">${list.map((r) => { const st = status('u:' + r.id); return `<li class="nb-item s-${st}">
        <button type="button" class="nb-main" data-act="z-show" data-id="${r.id}" title="Xem chi tiết">
          <span class="nb-word zh">${esc(r.word)}</span><span class="py small">${esc(r.ipa)}</span>
          <span class="nb-mean">${esc(r.meaning_vi)}</span>
        </button>
        <span class="nb-meta">${badge('u:' + r.id)}</span>
        <span class="nb-act">${sayBtn(r.word, true)}
          <button type="button" class="chip" data-act="open-card" data-id="u:${r.id}">Ôn</button>
          <button type="button" class="chip bad" data-act="z-del" data-id="${r.id}">${delArmed === r.id ? 'Xoá hẳn?' : 'Xoá'}</button>
        </span>
      </li>`; }).join('')}</ul>
      ${pages > 1 ? `<nav class="pager" aria-label="Chuyển trang sổ từ">
        <button type="button" class="btn" data-act="nb-page" data-p="${nbPage - 1}"${nbPage <= 0 ? ' disabled' : ''}>‹ Trước</button>
        <span class="pager-info">Trang <b>${nbPage + 1}</b>/${pages} · ${all.length} từ</span>
        <button type="button" class="btn" data-act="nb-page" data-p="${nbPage + 1}"${nbPage >= pages - 1 ? ' disabled' : ''}>Sau ›</button>
      </nav>` : ''}`;
  }
  function renderNotebook() {
    const box = $('zNb');
    const n = mine.length;
    const known = mine.filter((r) => status('u:' + r.id) === 'known').length;
    const learn = mine.filter((r) => status('u:' + r.id) === 'learn').length;
    const F = [['all', 'Tất cả'], ['new', 'Chưa học'], ['learn', 'Đang học'], ['known', 'Đã thuộc']];
    box.innerHTML = `${mineNotice()}
      ${n ? `<div class="stats"><div class="stat"><h3>Sổ từ của tôi <span>${known}/${n} đã thuộc</span></h3>
        <div class="stack" role="img" aria-label="Đã thuộc ${known}, đang học ${learn}, chưa học ${n - known - learn}"><i class="k" style="width:${(known / n) * 100}%"></i><i class="l" style="width:${(learn / n) * 100}%"></i></div>
        <p class="muted small">Đang học ${learn} · Chưa học ${n - known - learn}</p></div></div>
      <div class="row"><button type="button" class="btn primary" data-act="mine-review">Ôn sổ từ bằng thẻ</button><button type="button" class="btn" data-act="mine-listen">Nghe &amp; viết các từ này</button></div>` : ''}
      <div class="nb-tools">
        <label class="sr-only" for="zNbSearch">Tìm trong sổ từ</label>
        <input id="zNbSearch" class="input" type="search" placeholder="Tìm chữ Hán, pinyin hoặc nghĩa..." value="${esc(nbQuery)}" autocapitalize="off" spellcheck="false">
        <label class="sr-only" for="zNbSort">Sắp xếp</label>
        <select id="zNbSort" class="input select"><option value="new"${store.nb.sort === 'new' ? ' selected' : ''}>Mới tra trước</option><option value="py"${store.nb.sort === 'py' ? ' selected' : ''}>Theo pinyin A-Z</option><option value="weak"${store.nb.sort === 'weak' ? ' selected' : ''}>Cần ôn trước</option></select>
      </div>
      <div class="row">${F.map(([k, t]) => `<button type="button" class="chip" data-act="nb-filter" data-f="${k}" aria-pressed="${store.nb.filter === k}">${t}</button>`).join('')}</div>
      <div id="zNbList">${nbListHtml()}</div>`;
  }
  function refreshNbList() { const el = $('zNbList'); if (el) el.innerHTML = nbListHtml(); }

  /* ====================== SỰ KIỆN ====================== */
  function resetAllSessions() {
    Object.keys(sessions).forEach((k) => delete sessions[k]);
    fcList = null;
    store.fc.i = 0;
    fcBack = false;
  }
  function rerender() { showPage(store.page); }

  yc.addEventListener('click', (e) => {
    const say = e.target.closest('[data-say]');
    if (say) { e.stopPropagation(); speak(say.dataset.say); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    switch (act) {
      case 'level': {
        const l = +b.dataset.lv;
        const has = store.levels.includes(l);
        if (has && store.levels.length === 1) return; // luôn giữ ít nhất 1 cấp
        store.levels = has ? store.levels.filter((x) => x !== l) : [...store.levels, l].sort();
        save(); syncToolbar(); resetAllSessions(); rerender();
        break;
      }
      case 'opt': {
        const o = b.dataset.opt;
        store[o] = !store[o];
        save(); syncToolbar();
        if (o === 'hidePic' || o === 'auto') rerender();
        break;
      }
      case 'flip': fcBack = !fcBack; b.classList.toggle('is-back', fcBack);
        b.querySelector('.front').setAttribute('aria-hidden', String(fcBack));
        b.querySelector('.back').setAttribute('aria-hidden', String(!fcBack));
        break;
      case 'fc-prev': fcGo(-1); break;
      case 'fc-next': fcGo(1); break;
      case 'fc-rate': fcRate(b.dataset.ok === '1'); break;
      case 'fc-shuffle': store.fc.shuffle = !store.fc.shuffle; store.fc.i = 0; fcList = null; fcBack = false; save(); renderFc(); break;
      case 'fc-only': store.fc.only = !store.fc.only; store.fc.i = 0; fcList = null; fcBack = false; save(); renderFc(); break;
      case 'fc-first': store.fc.i = 0; fcBack = false; save(); renderFc(); break;
      case 'ans': answer(b.dataset.mode, b.dataset.id); break;
      case 'next': nextQ(b.dataset.mode); break;
      case 'restart': startSession(b.dataset.mode); renderQuiz(b.dataset.mode); scrollIntoViewIfAbove($('qz-' + b.dataset.mode)); break;
      case 'retry': {
        const S = sessions[b.dataset.mode];
        const ids = [...new Set(S.log.filter((x) => !x.ok).map((x) => x.id))];
        startSession(b.dataset.mode, shuffle(ids)); renderQuiz(b.dataset.mode); scrollIntoViewIfAbove($('qz-' + b.dataset.mode));
        break;
      }
      case 'len': store.len = +b.dataset.len; save();
        root.querySelectorAll('[data-act="len"]').forEach((x) => x.setAttribute('aria-pressed', String(+x.dataset.len === store.len)));
        break;
      case 'place': buildPlace(+b.dataset.k); break;
      case 'unplace': buildUnplace(+b.dataset.k); break;
      case 'clear': { const S = sessions['ghep-cau']; if (S && !S.answered) { S.q.placed = []; renderQuiz('ghep-cau'); } break; }
      case 'check': buildCheck(); break;
      case 'pfilter': progFilter = b.dataset.f; renderProgress(); break;
      case 'open-card': {
        const id = b.dataset.id;
        if (id.startsWith('u:')) { if (store.fc.src === 'yct') store.fc.src = 'mine'; }
        else {
          if (store.fc.src === 'mine') store.fc.src = 'yct';
          const c = byId[id];
          if (c && !store.levels.includes(c.lv)) { store.levels = [...store.levels, c.lv].sort(); syncToolbar(); resetAllSessions(); }
        }
        store.fc.only = false; store.fc.shuffle = false; fcList = null; buildFcList();
        store.fc.i = Math.max(0, fcList.indexOf(b.dataset.id)); fcBack = false;
        showPage('lat-the', { scroll: true });
        break;
      }
      case 'fc-src': store.fc.src = b.dataset.src; store.fc.i = 0; fcList = null; fcBack = false; save(); renderFc(); break;
      case 'nv-src': store.nv.src = b.dataset.src; save(); delete sessions['nghe-viet']; renderQuiz('nghe-viet'); break;
      case 'nv-hint': {
        store.nv[b.dataset.h] = !store.nv[b.dataset.h]; save();
        const S = sessions['nghe-viet']; const i = $('nvInput'); if (S && S.q && i) S.q.typed = i.value;
        renderQuiz('nghe-viet');
        break;
      }
      case 'nv-skip': checkListen(''); break;
      case 'goto': showPage(b.dataset.page, { scroll: true }); if (b.dataset.page === 'tra-tu') { const i = $('zLkInput'); if (i) i.focus(); } break;
      case 'mine-reload': reloadMine(); break;
      case 'z-lookup': showPage('tra-tu'); { const i = $('zLkInput'); if (i) i.value = b.dataset.w; } doLookup(b.dataset.w); break;
      case 'z-show': { const r = mineRow(b.dataset.id); if (r) { showPage('tra-tu', { scroll: true }); showSaved(r); } break; }
      case 'z-edit': lk.editing = true; renderLookup(); break;
      case 'z-edit-cancel': lk.editing = false; renderLookup(); break;
      case 'z-del': deleteMine(b.dataset.id, () => { if (store.page === 'so-tu') renderNotebook(); else renderLookup(); }); break;
      case 'nb-filter': store.nb.filter = b.dataset.f; nbPage = 0; save(); renderNotebook(); break;
      case 'nb-page': nbPage = +b.dataset.p; refreshNbList(); scrollIntoViewIfAbove($('zNbList')); break;
      case 'mine-review': store.fc.src = 'mine'; store.fc.i = 0; store.fc.only = false; fcList = null; fcBack = false; save(); showPage('lat-the', { scroll: true }); break;
      case 'mine-listen': store.nv.src = 'mine'; save(); delete sessions['nghe-viet']; showPage('nghe-viet', { scroll: true }); break;
      case 'reset':
        if (resetArmed && Date.now() - resetArmed < 5000) {
          store.st = {}; resetArmed = 0; save(); resetAllSessions(); renderProgress();
        } else {
          resetArmed = Date.now(); renderProgress();
          setTimeout(() => { if (resetArmed && Date.now() - resetArmed >= 5000) { resetArmed = 0; if (store.page === 'tien-do') renderProgress(); } }, 5100);
        }
        break;
      default: break;
    }
  });

  yc.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.id === 'zLkForm') doLookup($('zLkInput').value);
    else if (f.dataset.form === 'meaning') saveMeaning($('zEdit').value);
    else if (f.dataset.form === 'listen') checkListen($('nvInput').value);
  });
  yc.addEventListener('input', (e) => {
    if (e.target.id === 'zNbSearch') { nbQuery = e.target.value; nbPage = 0; refreshNbList(); }
    else if (e.target.id === 'nvInput') { const S = sessions['nghe-viet']; if (S && S.q) S.q.typed = e.target.value; }
  });
  yc.addEventListener('change', (e) => {
    if (e.target.id === 'zNbSort') { store.nb.sort = e.target.value; nbPage = 0; save(); refreshNbList(); }
  });
  yc.addEventListener('keydown', (e) => {
    if (e.target.id === 'zEdit' && e.key === 'Escape') { lk.editing = false; renderLookup(); }
  });

  async function reloadMine() {
    await loadMine();
    fcList = null;
    delete sessions['nghe-viet'];
    if (lk.row) lk.row = mineRow(lk.row.id);
    if (['tra-tu', 'so-tu', 'lat-the', 'nghe-viet'].includes(store.page) && !(store.page === 'nghe-viet' && store.nv.src === 'yct') && !(store.page === 'lat-the' && store.fc.src === 'yct')) rerender();
  }

  /** Phím tắt: chỉ khi mục đang hiện và không gõ trong ô nhập. */
  function onKey(e) {
    if (!host.isConnected || host.offsetParent === null) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.composedPath ? e.composedPath()[0] : e.target;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return; // đang gõ (Tra từ, Nghe & viết, tìm kiếm)
    const inside = Boolean(t && t.getRootNode && t.getRootNode() === root);
    const inNav = Boolean(t && nav.contains(t));
    const neutral = !t || t === document.body || t === document.documentElement || t === host;
    if (!inside && !inNav && !neutral) return; // đang thao tác ở chỗ khác của app (menu, ô nhập...)
    // Enter/Space trên một nút đang focus: để nút tự xử lý, trừ các nút ngoại lệ bên dưới.
    const isBtn = Boolean(t && t.tagName === 'BUTTON' && (inside || inNav));
    const page = store.page;
    if (page === 'lat-the') {
      if (e.key === ' ' || e.key === 'Enter') {
        if (isBtn && !(inside && t.classList.contains('flip'))) return;
        e.preventDefault();
        const f = root.querySelector('.flip');
        if (f) f.click();
      } else if (e.key === 'ArrowLeft') { e.preventDefault(); fcGo(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); fcGo(1); }
      else if (e.key === '1') fcRate(false);
      else if (e.key === '2') fcRate(true);
      return;
    }
    if (!MODES[page]) return;
    const S = sessions[page];
    if (!S || !S.items.length) return;
    if (page === 'nghe-viet' && !(S.answered || S.i >= S.items.length)) return; // chờ gõ đáp án
    if (e.key === 'Enter') {
      if (isBtn && !(inside && ['next', 'check', 'restart'].includes(t.dataset.act))) return;
      e.preventDefault();
      if (S.i >= S.items.length) { startSession(page); renderQuiz(page); }
      else if (S.answered) nextQ(page);
      else if (page === 'ghep-cau') buildCheck();
      return;
    }
    if (S.i >= S.items.length || S.answered) return;
    if (page !== 'ghep-cau' && /^[1-4]$/.test(e.key)) {
      const o = S.q.opts[+e.key - 1];
      if (o) answer(page, o.id);
      return;
    }
    if (page === 'ghep-cau' && e.key === 'Backspace' && S.q.placed.length) {
      e.preventDefault(); S.q.placed.pop(); renderQuiz('ghep-cau');
    }
  }

  syncToolbar();
  showPage(store.page);
  reloadMine();
  return { showPage, onKey };
}
