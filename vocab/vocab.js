/* vocab.js - Mục "Từ vựng tiếng Anh" của Quiz App.
 *
 * Cùng khuôn với mục Tiếng Trung YCT (chinese/):
 * - app.js gọi mountVocab(host, nav, { userId, supabase, scrollAnchor }) khi
 *   người dùng mở mục này lần đầu (nạp lười bằng import()).
 * - Nội dung vẽ trong Shadow DOM của `host`; `nav` là thanh trang con ngoài
 *   Shadow DOM (CSS trong index.html, chung với #tensesNav / #chineseNav).
 * - Sổ từ lưu ở bảng Supabase `vocab_words` (RLS: mỗi người chỉ thấy từ của
 *   mình) nên đổi máy vẫn còn. Tuỳ chọn hiển thị lưu localStorage.
 *
 * 6 trang con:
 *   tra-tu     Nhập từ mới -> nghĩa tiếng Việt, phiên âm IPA, nghĩa theo từ loại,
 *              câu ví dụ; tự lưu vào sổ từ (sửa được nghĩa).
 *   lat-the    Ôn thẻ: lật thẻ Anh -> Việt (hoặc ngược lại), tự chấm nhớ/chưa nhớ.
 *   chon-nghia Trắc nghiệm 4 lựa chọn: nhìn từ chọn nghĩa / nhìn nghĩa chọn từ.
 *   nghe-viet  Nghe phát âm rồi gõ lại từ.
 *   dat-cau    Đặt câu với từ mới: kiểm tra có dùng đúng từ, soát ngữ pháp
 *              (LanguageTool), dịch câu sang tiếng Việt để tự đối chiếu, lưu câu.
 *   so-tu      Sổ từ & tiến độ: tìm, lọc, xoá từ.
 *
 * Mức nhớ (level 0-5) kiểu hộp Leitner như mục Tiếng Trung: đúng / "Đã nhớ" +1,
 * sai / "Chưa nhớ" về 0; level >= 3 là "đã thuộc".
 */

const VERSION = new URL(import.meta.url).search;
const STORE_PREFIX = 'vocab-en-v1';
const KNOWN_AT = 3;
const TABLE = 'vocab_words';

export const PAGES = [
  { id: 'tra-tu', label: 'Tra từ mới' },
  { id: 'lat-the', label: 'Ôn thẻ' },
  { id: 'chon-nghia', label: 'Chọn nghĩa' },
  { id: 'nghe-viet', label: 'Nghe & viết' },
  { id: 'dat-cau', label: 'Đặt câu' },
  { id: 'so-tu', label: 'Sổ từ & tiến độ' },
];

let assets = null; // { api, css }
let mounted = null; // { host, key, api }
let keyBound = false;

async function loadAssets() {
  if (assets) return assets;
  const [api, css] = await Promise.all([
    import('./vocab-api.js' + VERSION),
    fetch(new URL('./vocab.css' + VERSION, import.meta.url)).then((r) => {
      if (!r.ok) throw new Error('Không tải được vocab.css (' + r.status + ')');
      return r.text();
    }),
  ]);
  assets = { api, css };
  return assets;
}

/** Gắn mục vào trang. Gọi lại nhiều lần được; đổi tài khoản thì dựng lại. */
export async function mountVocab(host, nav, { userId = null, supabase = null, scrollAnchor = null } = {}) {
  const { api, css } = await loadAssets();
  const key = STORE_PREFIX + (userId ? ':' + userId : '');
  if (mounted && mounted.host === host && mounted.key === key) {
    mounted.api.refresh();
    return mounted.api;
  }
  const inst = build({ host, nav, key, api, css, supabase, userId, scrollAnchor });
  mounted = { host, key, api: inst };
  if (!keyBound) {
    keyBound = true;
    document.addEventListener('keydown', (e) => { if (mounted) mounted.api.onKey(e); });
  }
  return inst;
}

/* ====================================================================== */

function build({ host, nav, key, api, css, supabase, userId, scrollAnchor }) {
  const { lookupWord, normalizeWord, isValidWord, posVi, usesWord, checkGrammar, translateVi, translateManyVi } = api;
  const root = host.shadowRoot || host.attachShadow({ mode: 'open' });

  /* ---------------- tuỳ chọn (localStorage, theo tài khoản) ---------------- */
  let store = { page: 'tra-tu', accent: 'us', auto: false, front: 'en', len: 10, sort: 'new', filter: 'all', scId: null, fc: { i: 0, only: false, shuffle: false }, nvHint: true };
  try {
    const raw = localStorage.getItem(key);
    if (raw) store = Object.assign(store, JSON.parse(raw));
  } catch (e) { /* dữ liệu hỏng thì bỏ qua */ }
  store.fc = Object.assign({ i: 0, only: false, shuffle: false }, store.fc || {});
  if (![10, 20, 30].includes(store.len)) store.len = 10;
  if (!['us', 'uk'].includes(store.accent)) store.accent = 'us';
  if (!['en', 'vi'].includes(store.front)) store.front = 'en';
  function save() {
    try { localStorage.setItem(key, JSON.stringify(store)); } catch (e) { /* hết chỗ / chế độ riêng tư */ }
  }

  /* ---------------- tiện ích ---------------- */
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const arr = (x) => (Array.isArray(x) ? x : []);

  /* ---------------- phát âm (giọng đọc có sẵn của trình duyệt) ---------------- */
  const canSpeak = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
  const voices = { us: null, uk: null };
  function pickVoices() {
    if (!canSpeak) return;
    const vs = speechSynthesis.getVoices();
    if (!vs.length) return;
    const pick = (re) => vs.find((v) => re.test(v.lang) && /natural|online|google/i.test(v.name)) || vs.find((v) => re.test(v.lang)) || null;
    voices.us = pick(/^en[-_]US/i) || pick(/^en/i);
    voices.uk = pick(/^en[-_]GB/i) || voices.us;
  }
  if (canSpeak) {
    pickVoices();
    try { speechSynthesis.addEventListener('voiceschanged', pickVoices); } catch (e) { /* trình duyệt cũ */ }
  }
  function speak(text, acc = store.accent, rate = 0.9) {
    if (!canSpeak || !text) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = acc === 'uk' ? 'en-GB' : 'en-US';
      u.rate = rate;
      const v = voices[acc];
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch (e) { /* bỏ qua */ }
  }
  const SAY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  const sayBtn = (t, { sm = false, acc = '', label = 'Nghe phát âm' } = {}) =>
    `<button class="say${sm ? ' sm' : ''}" type="button" data-say="${esc(t)}"${acc ? ` data-acc="${acc}"` : ''} aria-label="${esc(label)}" title="${esc(label)}">${SAY_SVG}</button>`;

  /* ---------------- dữ liệu sổ từ ---------------- */
  let words = []; // các dòng của bảng vocab_words, mới nhất trước
  let dbState = 'loading'; // loading | ready | missing | error | nodb
  let dbError = '';
  const byId = (id) => words.find((w) => w.id === id) || null;
  const byWord = (w) => words.find((x) => x.word.toLowerCase() === String(w).toLowerCase()) || null;

  function isMissingTable(err) {
    const m = String((err && (err.message || err.details || err.hint)) || '');
    return Boolean(err) && (err.code === '42P01' || err.code === 'PGRST205' || err.code === 'PGRST202' || /vocab_words/.test(m) && /(does not exist|could not find|schema cache)/i.test(m));
  }
  function dbFail(err) {
    if (isMissingTable(err)) { dbState = 'missing'; return 'Chưa tạo bảng vocab_words trên Supabase.'; }
    const m = String((err && err.message) || err || 'Lỗi không rõ');
    return /fetch|network/i.test(m) ? 'Mất kết nối mạng, chưa lưu được.' : m;
  }
  async function loadWords() {
    if (!supabase) { dbState = 'nodb'; return; }
    dbState = 'loading';
    const { data, error } = await supabase.from(TABLE).select('*').order('created_at', { ascending: false }).limit(3000);
    if (error) {
      dbError = dbFail(error);
      if (dbState !== 'missing') dbState = 'error';
      words = [];
      return;
    }
    words = (data || []).map(normRow);
    dbState = 'ready';
  }
  function normRow(r) {
    return { ...r, senses: arr(r.senses), examples: arr(r.examples), sentences: arr(r.sentences), level: r.level || 0, correct: r.correct || 0, wrong: r.wrong || 0 };
  }
  async function dbInsert(row) {
    const { data, error } = await supabase.from(TABLE).insert(row).select().single();
    if (error) throw error;
    return normRow(data);
  }
  async function dbUpdate(id, patch) {
    const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select().single();
    if (error) throw error;
    return normRow(data);
  }
  async function dbDelete(id) {
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) throw error;
  }
  function replaceLocal(row) {
    const k = words.findIndex((w) => w.id === row.id);
    if (k >= 0) words[k] = row; else words.unshift(row);
  }

  /* ---------------- mức nhớ ---------------- */
  function status(w) {
    if (!w || (!w.correct && !w.wrong && !w.level)) return 'new';
    return w.level >= KNOWN_AT ? 'known' : 'learn';
  }
  const STATUS_LABEL = { new: 'Chưa ôn', learn: 'Đang học', known: 'Đã thuộc' };
  const badge = (w) => { const s = status(w); return `<span class="badge s-${s}">${STATUS_LABEL[s]}</span>`; };
  const WEIGHT = { new: 3, 0: 4, 1: 3, 2: 2, 3: 1, 4: 0.6, 5: 0.3 };
  const weight = (w) => (status(w) === 'new' ? WEIGHT.new : WEIGHT[w.level] ?? 1);
  /** Ghi kết quả ôn: cập nhật ngay trên máy, ghi DB sau (lỗi thì báo, không chặn). */
  function grade(w, ok) {
    if (!w) return;
    if (ok) { w.correct += 1; w.level = Math.min(5, w.level + 1); } else { w.wrong += 1; w.level = 0; }
    w.last_review = new Date().toISOString();
    if (dbState !== 'ready') return;
    dbUpdate(w.id, { level: w.level, correct: w.correct, wrong: w.wrong, last_review: w.last_review })
      .catch((e) => toast('Chưa lưu được kết quả ôn: ' + dbFail(e), 'bad'));
  }
  function pickItems(cands, n) {
    const left = cands.slice();
    const out = [];
    while (out.length < n && left.length) {
      const total = left.reduce((a, c) => a + weight(c), 0);
      let r = Math.random() * total;
      let k = 0;
      for (; k < left.length - 1; k++) { r -= weight(left[k]); if (r <= 0) break; }
      out.push(left.splice(k, 1)[0].id);
    }
    return out;
  }
  const meaningOf = (w) => (w.meaning_vi || '').trim() || (w.senses[0] && w.senses[0].vi && w.senses[0].vi[0]) || '';
  const normMeaning = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();
  function distractors(w, k) {
    const mine = normMeaning(meaningOf(w));
    const ok = words.filter((x) => x.id !== w.id && meaningOf(x) && normMeaning(meaningOf(x)) !== mine && x.word.toLowerCase() !== w.word.toLowerCase());
    const chosen = [];
    for (const x of shuffle(ok)) {
      if (chosen.length >= k) break;
      if (chosen.some((y) => normMeaning(meaningOf(y)) === normMeaning(meaningOf(x)))) continue;
      chosen.push(x);
    }
    return chosen;
  }

  /* ====================== KHUNG HTML ====================== */
  root.innerHTML = `<style>${css}</style>
<div class="vb${canSpeak ? '' : ' no-tts'}" id="vb">
  <div class="toolbar">
    <div class="tb-group" id="tbStats" aria-live="polite"></div>
    <div class="tb-group" role="group" aria-label="Tuỳ chọn phát âm">
      ${canSpeak ? `<span class="tb-label">Giọng đọc</span>
      <button type="button" class="chip" data-act="accent" data-acc="us" aria-pressed="false">Anh-Mỹ</button>
      <button type="button" class="chip" data-act="accent" data-acc="uk" aria-pressed="false">Anh-Anh</button>
      <button type="button" class="chip toggle" data-act="opt" data-opt="auto" aria-pressed="false" title="Tự đọc to từ khi hiện thẻ / câu hỏi">Tự phát âm</button>` : '<span class="muted small">Trình duyệt này không hỗ trợ đọc to.</span>'}
    </div>
  </div>
  <div id="dbNote"></div>
  <div class="toast" id="toast" role="status" aria-live="polite" hidden></div>

  <section class="page" data-page="tra-tu" aria-labelledby="h-tra-tu">
    <div class="sec-head"><h2 id="h-tra-tu">Tra từ mới</h2><p>Gõ một từ hoặc cụm từ tiếng Anh bạn chưa biết. App tìm nghĩa tiếng Việt, phiên âm, nghĩa theo từ loại và câu ví dụ, rồi tự lưu vào sổ từ để ôn lại.</p></div>
    <form class="lk-form" id="lkForm" autocomplete="off">
      <label class="sr-only" for="lkInput">Từ tiếng Anh cần tra</label>
      <input id="lkInput" class="input" type="search" inputmode="text" enterkeyhint="search" placeholder="Ví dụ: resilient, give up, router" maxlength="64" autocapitalize="off" autocorrect="off" spellcheck="false">
      <button class="btn primary" type="submit">Tra từ</button>
    </form>
    <div id="lkResult" aria-live="polite"></div>
    <div id="lkRecent"></div>
  </section>

  <section class="page" data-page="lat-the" aria-labelledby="h-lat-the" hidden>
    <div class="sec-head"><h2 id="h-lat-the">Ôn thẻ</h2><p>Nhìn mặt trước, thử nhớ nghĩa rồi bấm vào thẻ để lật. Tự chấm "Đã nhớ" hoặc "Chưa nhớ" để app biết từ nào cần ôn thêm.</p></div>
    <div id="fc"></div>
  </section>

  <section class="page" data-page="chon-nghia" aria-labelledby="h-chon-nghia" hidden>
    <div class="sec-head"><h2 id="h-chon-nghia">Chọn nghĩa</h2><p>Nhìn từ chọn nghĩa tiếng Việt, hoặc nhìn nghĩa chọn từ tiếng Anh. Cần ít nhất 4 từ trong sổ. Bấm phím 1-4 để chọn, Enter để sang câu tiếp.</p></div>
    <div id="qz-chon-nghia" class="quiz"></div>
  </section>

  <section class="page" data-page="nghe-viet" aria-labelledby="h-nghe-viet" hidden>
    <div class="sec-head"><h2 id="h-nghe-viet">Nghe &amp; viết</h2><p>Nghe phát âm rồi gõ lại đúng chính tả của từ. Bấm Enter để kiểm tra và sang câu tiếp.</p></div>
    <div id="qz-nghe-viet" class="quiz"></div>
  </section>

  <section class="page" data-page="dat-cau" aria-labelledby="h-dat-cau" hidden>
    <div class="sec-head"><h2 id="h-dat-cau">Đặt câu với từ mới</h2><p>Tự viết một câu tiếng Anh có dùng từ đang học. App kiểm tra câu có dùng đúng từ không, soát lỗi ngữ pháp, chính tả và dịch câu sang tiếng Việt để bạn tự đối chiếu ý mình muốn nói.</p></div>
    <div id="sc"></div>
  </section>

  <section class="page" data-page="so-tu" aria-labelledby="h-so-tu" hidden>
    <div class="sec-head"><h2 id="h-so-tu">Sổ từ &amp; tiến độ</h2><p>Mọi từ bạn đã tra. Từ được tính "đã thuộc" khi trả lời đúng hoặc tự chấm "Đã nhớ" 3 lần liên tiếp; trả lời sai sẽ đưa từ về "đang học".</p></div>
    <div id="nb"></div>
  </section>
</div>`;
  const $ = (id) => root.getElementById(id);
  const vb = $('vb');

  let toastTimer = 0;
  function toast(msg, kind = '') {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 4500);
  }

  function syncToolbar() {
    root.querySelectorAll('[data-act="accent"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.acc === store.accent)));
    root.querySelectorAll('[data-act="opt"]').forEach((b) => b.setAttribute('aria-pressed', store[b.dataset.opt] ? 'true' : 'false'));
    const known = words.filter((w) => status(w) === 'known').length;
    $('tbStats').innerHTML = dbState === 'ready'
      ? `<span class="tb-stat"><b>${words.length}</b> từ trong sổ</span><span class="tb-stat"><b>${known}</b> đã thuộc</span>`
      : dbState === 'loading' ? '<span class="muted small">Đang tải sổ từ...</span>' : '<span class="muted small">Sổ từ chưa sẵn sàng</span>';
    const note = $('dbNote');
    if (dbState === 'missing') {
      note.innerHTML = `<div class="notice warn"><b>Chưa lưu được sổ từ.</b> Cơ sở dữ liệu chưa có bảng <code>vocab_words</code>. Quản trị viên cần chạy file <code>vocab/vocab-schema.sql</code> trong Supabase (SQL Editor &gt; dán &gt; Run). Trong lúc chờ, bạn vẫn tra từ được nhưng từ sẽ không được lưu.</div>`;
    } else if (dbState === 'error') {
      note.innerHTML = `<div class="notice bad"><b>Không tải được sổ từ:</b> ${esc(dbError)} <button type="button" class="linkbtn" data-act="reload">Thử lại</button></div>`;
    } else if (dbState === 'nodb') {
      note.innerHTML = '<div class="notice warn">Không kết nối được cơ sở dữ liệu nên từ sẽ không được lưu.</div>';
    } else note.innerHTML = '';
  }

  /* ====================== ĐIỀU HƯỚNG TRANG CON ====================== */
  const pageIds = PAGES.map((p) => p.id);
  const pageLabel = Object.fromEntries(PAGES.map((p) => [p.id, p.label]));
  nav.innerHTML =
    '<button type="button" class="tn-nav-toggle" aria-expanded="false" aria-controls="vocabNavList">' +
      '<span class="tn-nav-toggle-text"><span class="tn-nav-hint">Đang xem</span><span class="tn-nav-current"></span></span>' +
      '<span class="tn-nav-caret" aria-hidden="true">▼</span>' +
    '</button>' +
    '<div class="tn-nav-list" id="vocabNavList">' +
      PAGES.map((p) => `<button type="button" class="tn-nav-btn" data-vb-page="${p.id}">${esc(p.label)}</button>`).join('') +
    '</div>';
  const navToggle = nav.querySelector('.tn-nav-toggle');
  function setNavOpen(open) {
    nav.classList.toggle('is-open', open);
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    navToggle.querySelector('.tn-nav-caret').textContent = open ? '▲' : '▼';
  }
  nav.onclick = (e) => {
    if (e.target.closest('.tn-nav-toggle')) { setNavOpen(!nav.classList.contains('is-open')); return; }
    const b = e.target.closest('[data-vb-page]');
    if (b) { setNavOpen(false); showPage(b.dataset.vbPage, { scroll: true }); }
  };
  if (!nav.dataset.vbBound) {
    nav.dataset.vbBound = '1';
    document.addEventListener('click', (e) => { if (nav.classList.contains('is-open') && !nav.contains(e.target)) setNavOpen(false); });
  }

  function scrollIntoViewIfAbove(el) {
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.6) el.scrollIntoView({ block: 'start', behavior: smooth() });
  }
  const scrollToTop = () => scrollIntoViewIfAbove(scrollAnchor || nav);

  function showPage(id, { scroll = false } = {}) {
    if (!pageIds.includes(id)) id = 'tra-tu';
    root.querySelectorAll('.page').forEach((s) => { s.hidden = s.dataset.page !== id; });
    nav.querySelectorAll('[data-vb-page]').forEach((b) => {
      const on = b.dataset.vbPage === id;
      if (on) { b.dataset.active = 'true'; b.setAttribute('aria-current', 'page'); }
      else { delete b.dataset.active; b.removeAttribute('aria-current'); }
    });
    nav.querySelector('.tn-nav-current').textContent = `${pageIds.indexOf(id) + 1}/${pageIds.length} · ${pageLabel[id]}`;
    store.page = id;
    save();
    renderPage(id);
    if (scroll) scrollToTop();
  }
  function renderPage(id) {
    if (id === 'tra-tu') { renderLookup(); renderRecent(); }
    else if (id === 'lat-the') renderFc();
    else if (id === 'chon-nghia' || id === 'nghe-viet') renderQuiz(id);
    else if (id === 'dat-cau') renderSentence();
    else if (id === 'so-tu') renderNotebook();
  }

  const emptyBook = (need = 1) => `<div class="fc-empty">${dbState === 'loading' ? 'Đang tải sổ từ...' : words.length
    ? `Cần ít nhất ${need} từ trong sổ để luyện phần này (hiện có ${words.length}).`
    : 'Sổ từ đang trống.'} <button type="button" class="linkbtn" data-act="goto" data-page="tra-tu">Tra thêm từ mới</button></div>`;

  /* ====================== 1. TRA TỪ ====================== */
  let lk = { state: 'idle', q: '', res: null, row: null, err: '', saveErr: '', editing: false };
  let lkSeq = 0;

  /** Gộp nghĩa tiếng Việt theo từ loại (Google) với nghĩa tiếng Anh (Wiktionary). */
  function mergeSenses(res) {
    const out = [];
    const get = (pos) => out.find((s) => s.pos === pos) || (out.push({ pos, vi: [], defs: [] }), out[out.length - 1]);
    for (const g of res.viByPos || []) get(g.pos).vi = g.terms.slice(0, 4);
    for (const s of res.senses || []) get(s.pos).defs = s.defs.slice(0, 3).map((d) => d.slice(0, 240));
    return out.filter((s) => s.vi.length || s.defs.length).slice(0, 4);
  }

  async function doLookup(raw) {
    const q = normalizeWord(raw);
    const input = $('lkInput');
    if (input && input.value !== q && q) input.value = q;
    if (!q) { lk = { state: 'error', q: '', res: null, row: null, err: 'Hãy nhập một từ tiếng Anh.' }; renderLookup(); return; }
    if (!isValidWord(q)) { lk = { state: 'error', q, res: null, row: null, err: 'Chỉ nhập chữ cái tiếng Anh (có thể có khoảng trắng, dấu gạch nối, dấu nháy). Ví dụ: "resilient", "give up".' }; renderLookup(); return; }
    const seq = ++lkSeq;
    lk = { state: 'loading', q, res: null, row: null, err: '', saveErr: '', editing: false };
    renderLookup();
    let res;
    try {
      res = await lookupWord(q);
    } catch (e) {
      if (seq !== lkSeq) return;
      lk = { state: 'error', q, res: null, row: null, err: e.code === 'INVALID' ? e.message : 'Không tra được từ lúc này (mất mạng hoặc dịch vụ tra từ đang lỗi). Thử lại sau ít phút.' };
      renderLookup();
      return;
    }
    if (seq !== lkSeq) return;
    if (!res.found) { lk = { state: 'notfound', q, res, row: null, err: '' }; renderLookup(); return; }
    lk = { state: 'done', q, res, row: byWord(res.word), err: '', saveErr: '', editing: false };
    renderLookup();
    if (store.auto) speak(res.word);
    await saveLookup(res, seq);
  }

  async function saveLookup(res, seq) {
    if (dbState !== 'ready') { lk.saveErr = dbState === 'missing' ? 'Chưa có bảng vocab_words nên chưa lưu được từ này.' : 'Sổ từ chưa sẵn sàng nên chưa lưu được từ này.'; renderLookup(); return; }
    const senses = mergeSenses(res);
    const examples = res.examples.slice(0, 4).map((e) => ({ en: e.en.slice(0, 200), vi: (e.vi || '').slice(0, 240) }));
    const existing = byWord(res.word);
    try {
      let row;
      if (existing) {
        // Giữ nghĩa người dùng đã sửa; chỉ bổ sung phần còn trống.
        const patch = { lookups: (existing.lookups || 0) + 1 };
        if (!existing.ipa && res.ipaText) patch.ipa = res.ipaText;
        if (!existing.meaning_vi && res.meaningVi) patch.meaning_vi = res.meaningVi;
        if (!existing.senses.length && senses.length) patch.senses = senses;
        if (!existing.examples.length && examples.length) patch.examples = examples;
        row = await dbUpdate(existing.id, patch);
      } else {
        try {
          row = await dbInsert({ word: res.word, ipa: res.ipaText.slice(0, 200), meaning_vi: res.meaningVi.slice(0, 500), senses, examples });
        } catch (e) {
          if (e.code !== '23505') throw e; // đã có (mở ở thiết bị khác) -> tải lại
          await loadWords();
          const again = byWord(res.word);
          row = again ? await dbUpdate(again.id, { lookups: (again.lookups || 0) + 1 }) : null;
        }
      }
      if (row) replaceLocal(row);
      if (seq !== lkSeq) return;
      lk.row = row;
      lk.saveErr = '';
    } catch (e) {
      if (seq !== lkSeq) return;
      lk.saveErr = 'Chưa lưu được vào sổ từ: ' + dbFail(e);
    }
    syncToolbar();
    renderLookup();
    renderRecent();
  }

  /** Hiện một từ đã lưu (không cần mạng). */
  function showSaved(w) {
    lkSeq++;
    lk = { state: 'done', q: w.word, res: null, row: w, err: '', saveErr: '', editing: false };
    const input = $('lkInput');
    if (input) input.value = w.word;
    renderLookup();
  }

  /** Dữ liệu hiển thị: ưu tiên bản đã lưu (có nghĩa người dùng sửa), bổ sung từ kết quả tra. */
  function entryView() {
    const r = lk.row;
    const res = lk.res;
    return {
      word: (r && r.word) || (res && res.word) || lk.q,
      ipa: (r && r.ipa) || (res && res.ipaText) || '',
      ipaObj: res && res.ipa,
      meaning: (r && r.meaning_vi) || (res && res.meaningVi) || '',
      senses: r && r.senses.length ? r.senses : res ? mergeSenses(res) : [],
      examples: r && r.examples.length ? r.examples : res ? res.examples : [],
      sentences: r ? r.sentences : [],
    };
  }

  function ipaLine(v) {
    const o = v.ipaObj;
    if (o && o.uk && o.us && o.uk !== o.us) {
      return `<span class="ipa-item"><span class="acc">UK</span><span class="ipa">${esc(o.uk)}</span>${sayBtn(v.word, { sm: true, acc: 'uk', label: 'Nghe giọng Anh-Anh' })}</span>
        <span class="ipa-item"><span class="acc">US</span><span class="ipa">${esc(o.us)}</span>${sayBtn(v.word, { sm: true, acc: 'us', label: 'Nghe giọng Anh-Mỹ' })}</span>`;
    }
    if (!o && /^UK .+ · US /.test(v.ipa)) {
      const [uk, us] = v.ipa.replace(/^UK /, '').split(' · US ');
      return `<span class="ipa-item"><span class="acc">UK</span><span class="ipa">${esc(uk)}</span>${sayBtn(v.word, { sm: true, acc: 'uk', label: 'Nghe giọng Anh-Anh' })}</span>
        <span class="ipa-item"><span class="acc">US</span><span class="ipa">${esc(us)}</span>${sayBtn(v.word, { sm: true, acc: 'us', label: 'Nghe giọng Anh-Mỹ' })}</span>`;
    }
    return `<span class="ipa-item">${v.ipa ? `<span class="ipa">${esc(v.ipa)}</span>` : '<span class="muted small">Chưa có phiên âm</span>'}${sayBtn(v.word, { sm: true })}</span>`;
  }

  function sensesHtml(senses, { full = true } = {}) {
    if (!senses.length) return '';
    return `<div class="senses">${senses.map((s) => `<div class="sense">
        <span class="pos">${esc(posVi(s.pos) || 'khác')}</span>
        <div class="sense-body">
          ${s.vi && s.vi.length ? `<div class="sense-vi">${esc(s.vi.join(', '))}</div>` : ''}
          ${full && s.defs && s.defs.length ? `<ul class="defs">${s.defs.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
        </div>
      </div>`).join('')}</div>`;
  }
  function examplesHtml(exs, n = 4) {
    const list = exs.slice(0, n);
    if (!list.length) return '';
    return `<div class="exs">${list.map((e) => `<div class="ex">
        <div class="ex-en">${sayBtn(e.en, { sm: true, label: 'Nghe câu' })}<span>${esc(e.en)}</span></div>
        ${e.vi ? `<div class="ex-vi">${esc(e.vi)}</div>` : ''}
      </div>`).join('')}</div>`;
  }

  function renderLookup() {
    const box = $('lkResult');
    if (!box) return;
    if (lk.state === 'idle') { box.innerHTML = ''; return; }
    if (lk.state === 'loading') {
      box.innerHTML = `<div class="card entry loading" aria-busy="true"><div class="spinner" aria-hidden="true"></div><p>Đang tra "<b>${esc(lk.q)}</b>"...</p></div>`;
      return;
    }
    if (lk.state === 'error') { box.innerHTML = `<div class="notice bad">${esc(lk.err)}</div>`; return; }
    if (lk.state === 'notfound') {
      const sug = lk.res.suggestions;
      box.innerHTML = `<div class="card entry">
        <p>Không tìm thấy từ "<b>${esc(lk.q)}</b>" trong từ điển.${lk.res.meaningVi ? ` Google dịch là "${esc(lk.res.meaningVi)}" nhưng có thể bạn gõ sai chính tả.` : ''}</p>
        ${sug.length ? `<div class="row"><span class="muted small">Có phải bạn muốn tra:</span>${sug.map((s) => `<button type="button" class="chip" data-act="lookup" data-w="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : '<p class="muted small">Kiểm tra lại chính tả rồi tra lại nhé.</p>'}
      </div>`;
      return;
    }
    const v = entryView();
    const r = lk.row;
    const saveLine = r
      ? `<span class="saved">Đã lưu vào sổ từ${r.lookups > 1 ? ` · tra ${r.lookups} lần` : ''}</span>${badge(r)}`
      : lk.saveErr ? `<span class="warn-text">${esc(lk.saveErr)}</span>` : '<span class="muted small">Đang lưu vào sổ từ...</span>';
    box.innerHTML = `<article class="card entry" aria-label="Kết quả tra từ ${esc(v.word)}">
      <header class="entry-head">
        <h3 class="word">${esc(v.word)}</h3>
        <div class="ipa-line">${ipaLine(v)}</div>
      </header>
      <div class="meaning-box">
        ${lk.editing
          ? `<form class="edit-form" data-form="meaning"><label class="sr-only" for="mEdit">Nghĩa tiếng Việt</label><input id="mEdit" class="input" maxlength="200" value="${esc(v.meaning)}"><button class="btn primary" type="submit">Lưu nghĩa</button><button class="btn" type="button" data-act="edit-cancel">Huỷ</button></form>`
          : `<div class="meaning">${v.meaning ? esc(v.meaning) : '<span class="muted">Chưa có nghĩa tiếng Việt</span>'}</div>${r ? '<button type="button" class="linkbtn small" data-act="edit-meaning">Sửa nghĩa</button>' : ''}`}
      </div>
      ${sensesHtml(v.senses)}
      ${v.examples.length ? `<h4 class="sub">Câu ví dụ</h4>${examplesHtml(v.examples)}` : ''}
      ${v.sentences.length ? `<h4 class="sub">Câu bạn đã đặt</h4><ul class="my-sents">${v.sentences.map((s) => `<li>${sayBtn(s.text, { sm: true, label: 'Nghe câu' })}<span>${esc(s.text)}</span></li>`).join('')}</ul>` : ''}
      <footer class="entry-foot">
        <div class="row">${saveLine}</div>
        <div class="row">
          ${r ? `<button type="button" class="btn" data-act="to-sentence" data-id="${r.id}">Đặt câu với từ này</button>
          <button type="button" class="btn" data-act="open-card" data-id="${r.id}">Ôn thẻ này</button>
          <button type="button" class="btn ghost-bad" data-act="del" data-id="${r.id}">${delArmed === r.id ? 'Bấm lần nữa để xoá' : 'Xoá khỏi sổ'}</button>` : ''}
          ${lk.res ? '' : `<button type="button" class="btn" data-act="lookup" data-w="${esc(v.word)}">Tra lại trên mạng</button>`}
        </div>
      </footer>
      <p class="src-note">Nguồn: Wiktionary (nghĩa tiếng Anh, phiên âm, câu ví dụ), Google Dịch (nghĩa tiếng Việt). Nghĩa dịch tự động có thể chưa sát, hãy sửa lại cho đúng ngữ cảnh bạn học.</p>
    </article>`;
    if (lk.editing) { const i = $('mEdit'); if (i) { i.focus(); i.select(); } }
  }

  function renderRecent() {
    const box = $('lkRecent');
    if (!box) return;
    if (dbState !== 'ready' || !words.length) { box.innerHTML = ''; return; }
    const recent = words.slice().sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at))).slice(0, 14);
    box.innerHTML = `<div class="recent">
      <div class="grid-head"><h3>Từ vừa tra</h3><button type="button" class="linkbtn" data-act="goto" data-page="so-tu">Xem cả sổ từ (${words.length})</button></div>
      <div class="row">${recent.map((w) => `<button type="button" class="chip word-chip s-${status(w)}" data-act="show-saved" data-id="${w.id}" title="${esc(meaningOf(w))}">${esc(w.word)}</button>`).join('')}</div>
    </div>`;
  }

  async function saveMeaning(val) {
    const r = lk.row;
    if (!r) return;
    const m = String(val || '').trim().slice(0, 200);
    try {
      const row = await dbUpdate(r.id, { meaning_vi: m });
      replaceLocal(row);
      lk.row = row;
      lk.editing = false;
      toast('Đã lưu nghĩa mới.', 'ok');
    } catch (e) {
      toast('Chưa lưu được: ' + dbFail(e), 'bad');
    }
    renderLookup();
  }

  let delArmed = null;
  let delTimer = 0;
  async function deleteWord(id, rerenderFn) {
    if (delArmed !== id) {
      delArmed = id;
      clearTimeout(delTimer);
      delTimer = setTimeout(() => { delArmed = null; rerenderFn(); }, 4000);
      rerenderFn();
      return;
    }
    delArmed = null;
    clearTimeout(delTimer);
    const w = byId(id);
    try {
      await dbDelete(id);
      words = words.filter((x) => x.id !== id);
      if (lk.row && lk.row.id === id) lk = { state: 'idle', q: '', res: null, row: null, err: '' };
      fcList = null;
      Object.keys(sessions).forEach((k) => delete sessions[k]);
      toast(`Đã xoá "${w ? w.word : ''}" khỏi sổ từ.`, 'ok');
    } catch (e) {
      toast('Chưa xoá được: ' + dbFail(e), 'bad');
    }
    syncToolbar();
    rerenderFn();
    renderRecent();
  }

  /* ====================== 2. ÔN THẺ ====================== */
  let fcList = null;
  let fcBack = false;
  let fcMsg = null;
  function buildFcList() {
    let list = words.slice();
    if (store.fc.only) list = list.filter((w) => status(w) !== 'known');
    let ids = list.map((w) => w.id);
    if (store.fc.shuffle) ids = shuffle(ids);
    fcList = ids;
    if (store.fc.i >= fcList.length) store.fc.i = 0;
  }
  function cardBack(w) {
    const ex = w.examples[0];
    const mySent = w.sentences[w.sentences.length - 1];
    const vi = w.senses.filter((s) => s.vi && s.vi.length).slice(0, 2);
    return `<span class="fc-word-sm">${esc(w.word)}</span>
      ${w.ipa ? `<span class="ipa">${esc(w.ipa)}</span>` : ''}
      <span class="fc-vi">${esc(meaningOf(w) || 'Chưa có nghĩa')}</span>
      ${vi.length ? `<span class="fc-pos">${vi.map((s) => `<span><b>${esc(posVi(s.pos))}:</b> ${esc(s.vi.join(', '))}</span>`).join('')}</span>` : ''}
      ${ex ? `<span class="fc-sep"></span><span class="fc-ex">${esc(ex.en)}</span>${ex.vi ? `<span class="fc-exvi">${esc(ex.vi)}</span>` : ''}` : ''}
      ${mySent ? `<span class="fc-mine"><b>Câu của bạn:</b> ${esc(mySent.text)}</span>` : ''}`;
  }
  function renderFc() {
    const box = $('fc');
    if (!words.length) { box.innerHTML = emptyBook(1); return; }
    if (!fcList) buildFcList();
    const total = fcList.length;
    const ctrl = `<div class="fc-nav">
      <button type="button" class="chip toggle" data-act="fc-front" aria-pressed="${store.front === 'vi'}" title="Mặt trước là nghĩa tiếng Việt, tự nhớ từ tiếng Anh">Mặt trước: ${store.front === 'vi' ? 'Tiếng Việt' : 'Tiếng Anh'}</button>
      <button type="button" class="chip toggle" data-act="fc-shuffle" aria-pressed="${store.fc.shuffle}">Trộn thứ tự</button>
      <button type="button" class="chip toggle" data-act="fc-only" aria-pressed="${store.fc.only}">Chỉ từ chưa thuộc</button>
      <button type="button" class="chip" data-act="fc-first">Về thẻ đầu</button>
    </div>`;
    if (!total) {
      box.innerHTML = `<div class="fc-wrap">${ctrl}<div class="fc-empty">Bạn đã thuộc hết các từ trong sổ. Tắt "Chỉ từ chưa thuộc" để xem lại toàn bộ.</div></div>`;
      return;
    }
    const w = byId(fcList[store.fc.i]);
    if (!w) { fcList = null; renderFc(); return; }
    const front = store.front === 'vi'
      ? `<span class="fc-vi big">${esc(meaningOf(w) || '(chưa có nghĩa)')}</span>
         <span class="fc-tap">Từ tiếng Anh là gì? Bấm vào thẻ để lật</span>`
      : `<span class="fc-word">${esc(w.word)}</span>
         ${w.ipa ? `<span class="ipa">${esc(w.ipa)}</span>` : ''}
         <span class="fc-tap">Bấm vào thẻ để lật</span>`;
    box.innerHTML = `<div class="fc-wrap">
      ${ctrl}
      <div class="fc-meta"><span>Thẻ <b>${store.fc.i + 1}</b>/${total}</span>${badge(w)}${fcMsg ? `<span class="muted small">${esc(fcMsg)}</span>` : ''}<span class="fc-keys small">Phím tắt: Space lật thẻ · ← → chuyển thẻ · 1 chưa nhớ · 2 đã nhớ</span></div>
      <button type="button" class="flip${fcBack ? ' is-back' : ''}" data-act="flip" aria-label="Lật thẻ (phím cách)">
        <span class="flip-inner">
          <span class="face front" aria-hidden="${fcBack}">${front}</span>
          <span class="face back" aria-hidden="${!fcBack}">${cardBack(w)}</span>
        </span>
      </button>
      <div class="row center fc-say">${sayBtn(w.word)}<span class="muted small">Nghe từ</span>${w.examples[0] ? `${sayBtn(w.examples[0].en, { sm: true, label: 'Nghe câu ví dụ' })}<span class="muted small">Nghe câu ví dụ</span>` : ''}</div>
      <div class="fc-actions">
        <button type="button" class="btn nav-btn" data-act="fc-prev" aria-label="Thẻ trước">‹</button>
        <button type="button" class="btn again" data-act="fc-rate" data-ok="0">Chưa nhớ <kbd>1</kbd></button>
        <button type="button" class="btn good" data-act="fc-rate" data-ok="1">Đã nhớ <kbd>2</kbd></button>
        <button type="button" class="btn nav-btn" data-act="fc-next" aria-label="Thẻ sau">›</button>
      </div>
    </div>`;
    if (store.auto && !fcBack && store.front === 'en') speak(w.word);
  }
  function fcGo(delta) {
    if (!fcList || !fcList.length) return;
    store.fc.i = (store.fc.i + delta + fcList.length) % fcList.length;
    fcBack = false;
    fcMsg = null;
    save();
    renderFc();
  }
  function fcRate(ok) {
    if (!fcList || !fcList.length) return;
    const w = byId(fcList[store.fc.i]);
    if (!w) return;
    grade(w, ok);
    const msg = ok ? `Đã ghi nhớ "${w.word}"` : `Sẽ ôn lại "${w.word}"`;
    if (store.fc.only && status(w) === 'known') {
      fcList.splice(store.fc.i, 1);
      if (store.fc.i >= fcList.length) store.fc.i = 0;
    } else {
      store.fc.i = (store.fc.i + 1) % fcList.length;
    }
    fcBack = false;
    save();
    fcMsg = msg;
    renderFc();
    syncToolbar();
  }

  /* ====================== 3-4. LUYỆN TẬP ====================== */
  const MODES = {
    'chon-nghia': { need: 4, eligible: () => words.filter((w) => meaningOf(w)), make: makeChoiceQ, render: renderChoiceQ },
    'nghe-viet': { need: 1, eligible: () => words.filter((w) => /^[a-z' -]+$/i.test(w.word)), make: makeSpellQ, render: renderSpellQ },
  };
  const sessions = {};
  function startSession(mode, ids = null) {
    const elig = MODES[mode].eligible();
    const items = ids ? ids.filter((id) => byId(id)) : pickItems(elig, Math.min(store.len, elig.length));
    sessions[mode] = { items, i: 0, right: 0, log: [], q: null, answered: false };
    if (items.length) sessions[mode].q = MODES[mode].make(byId(items[0]));
  }
  function renderQuiz(mode) {
    const box = $('qz-' + mode);
    const elig = MODES[mode].eligible();
    if (elig.length < MODES[mode].need) { box.innerHTML = emptyBook(MODES[mode].need); return; }
    if (!sessions[mode] || !sessions[mode].items.length) startSession(mode);
    const S = sessions[mode];
    if (S.i >= S.items.length) { renderDone(mode); return; }
    const pct = Math.round((S.i / S.items.length) * 100);
    box.innerHTML = `<div class="q-top">
        <span>Câu <b>${S.i + 1}</b>/${S.items.length} · Đúng <b>${S.right}</b></span>
        <span class="row">${mode === 'nghe-viet' ? `<button type="button" class="chip toggle" data-act="nv-hint" aria-pressed="${store.nvHint}" title="Hiện nghĩa tiếng Việt làm gợi ý">Gợi ý nghĩa</button>` : ''}<button type="button" class="linkbtn" data-act="restart" data-mode="${mode}">Làm lượt mới</button></span>
        <div class="q-bar" aria-hidden="true"><i style="width:${pct}%"></i></div>
      </div>
      <div class="q-card">${MODES[mode].render(S.q, S)}</div>`;
    if (mode === 'nghe-viet' && !S.answered) {
      const inp = $('nvInput');
      if (inp) inp.focus({ preventScroll: true });
      if (!S.q.spoken) { S.q.spoken = true; speak(S.q.w.word, store.accent, 0.85); }
    } else if (mode === 'chon-nghia' && store.auto && !S.answered && S.q.type === 'en2vi') speak(S.q.w.word);
  }
  function nextQ(mode) {
    const S = sessions[mode];
    if (!S || !S.answered) return;
    S.i += 1;
    S.answered = false;
    if (S.i < S.items.length) S.q = MODES[mode].make(byId(S.items[S.i]));
    renderQuiz(mode);
    scrollIntoViewIfAbove($('qz-' + mode));
  }
  function record(mode, ok) {
    const S = sessions[mode];
    S.answered = true;
    if (ok) S.right += 1;
    S.log.push({ id: S.q.w.id, ok });
    grade(S.q.w, ok);
    syncToolbar();
  }
  const nextBtn = (mode, last) => `<div class="q-actions"><button type="button" class="btn primary" data-act="next" data-mode="${mode}">${last ? 'Xem kết quả' : 'Câu tiếp'} <kbd>Enter</kbd></button></div>`;
  const fbExample = (w) => (w.examples[0] ? `<div class="fb-ex">${sayBtn(w.examples[0].en, { sm: true, label: 'Nghe câu' })}<span>${esc(w.examples[0].en)}</span></div>${w.examples[0].vi ? `<div class="muted">${esc(w.examples[0].vi)}</div>` : ''}` : '');

  /* ---- Chọn nghĩa ---- */
  function makeChoiceQ(w) {
    const type = Math.random() < 0.5 ? 'en2vi' : 'vi2en';
    const opts = shuffle([w, ...distractors(w, 3)]);
    return { w, type, opts, pick: null };
  }
  function renderChoiceQ(q, S) {
    const { w } = q;
    const last = S.i === S.items.length - 1;
    const opts = q.opts.map((o, k) => {
      let cls = '';
      if (S.answered) cls = o.id === w.id ? ' right' : o.id === q.pick ? ' wrong' : ' dim';
      const label = q.type === 'en2vi' ? esc(meaningOf(o)) : `<span class="opt-word">${esc(o.word)}</span>${S.answered ? `<small>${esc(meaningOf(o))}</small>` : ''}`;
      return `<button type="button" class="opt${cls}" data-act="ans" data-mode="chon-nghia" data-id="${o.id}"${S.answered ? ' disabled' : ''}><span class="k">${k + 1}</span><span class="t">${label}</span></button>`;
    }).join('');
    const stage = q.type === 'en2vi'
      ? `<div class="q-word"><span class="q-en">${esc(w.word)}</span>${w.ipa ? `<span class="ipa">${esc(w.ipa)}</span>` : ''}${sayBtn(w.word)}</div><p class="q-ask">Từ này nghĩa là gì?</p>`
      : `<div class="q-word"><span class="q-vi">${esc(meaningOf(w))}</span></div><p class="q-ask">Chọn từ tiếng Anh đúng</p>`;
    let fb = '';
    if (S.answered) {
      const ok = q.pick === w.id;
      fb = `<div class="fb ${ok ? 'ok' : 'no'}" role="status">
        <div class="fb-title">${ok ? 'Chính xác!' : 'Chưa đúng.'} <span>${esc(w.word)} = ${esc(meaningOf(w))}</span>${sayBtn(w.word, { sm: true })}</div>
        ${fbExample(w)}
      </div>${nextBtn('chon-nghia', last)}`;
    }
    return stage + `<div class="opts">${opts}</div>` + fb;
  }
  function answerChoice(id) {
    const S = sessions['chon-nghia'];
    if (!S || S.answered || !S.q) return;
    S.q.pick = id;
    record('chon-nghia', id === S.q.w.id);
    renderQuiz('chon-nghia');
    if (store.auto || S.q.type === 'vi2en') speak(S.q.w.word);
    const btn = root.querySelector('#qz-chon-nghia [data-act="next"]');
    if (btn) btn.focus({ preventScroll: true });
  }

  /* ---- Nghe & viết ---- */
  function makeSpellQ(w) { return { w, typed: '', spoken: false }; }
  const cleanSpell = (s) => String(s || '').toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
  function diffHtml(typed, target) {
    // Tô màu từng ký tự: đúng vị trí = xanh, sai = đỏ (so khớp theo vị trí, đủ dùng cho từ ngắn).
    const a = [...typed];
    const b = [...target];
    return a.map((ch, k) => `<span class="${b[k] && b[k].toLowerCase() === ch.toLowerCase() ? 'c-ok' : 'c-no'}">${esc(ch)}</span>`).join('') + (b.length > a.length ? `<span class="c-miss">${'_'.repeat(b.length - a.length)}</span>` : '');
  }
  function renderSpellQ(q, S) {
    const { w } = q;
    const last = S.i === S.items.length - 1;
    const hint = store.nvHint || !canSpeak;
    let body = `<div class="q-word">
        ${canSpeak ? `<button type="button" class="say big" data-say="${esc(w.word)}" data-rate="0.85" aria-label="Nghe lại (phím Ctrl+Space)" title="Nghe lại">${SAY_SVG}</button>
        <div class="row center"><button type="button" class="linkbtn small" data-act="say-slow" data-w="${esc(w.word)}">Nghe chậm</button></div>` : `<span class="ipa big">${esc(w.ipa || '')}</span>`}
        ${hint ? `<span class="q-vi sm">${esc(meaningOf(w))}</span>` : ''}
      </div>
      <p class="q-ask">${canSpeak ? 'Gõ lại từ bạn vừa nghe' : 'Trình duyệt không đọc to được: nhìn phiên âm và nghĩa rồi gõ từ'}</p>`;
    if (!S.answered) {
      body += `<form class="spell-form" data-form="spell" autocomplete="off">
        <label class="sr-only" for="nvInput">Từ bạn nghe được</label>
        <input id="nvInput" class="input big" type="text" maxlength="64" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" value="${esc(q.typed)}">
        <button class="btn primary" type="submit">Kiểm tra <kbd>Enter</kbd></button>
        <button class="btn" type="button" data-act="spell-skip">Không biết</button>
      </form>`;
    } else {
      const ok = q.result;
      body += `<div class="fb ${ok ? 'ok' : 'no'}" role="status">
        <div class="fb-title">${ok ? 'Chính xác!' : 'Chưa đúng.'}</div>
        ${!ok && q.typed ? `<div>Bạn gõ: <span class="spell">${diffHtml(q.typed, w.word)}</span></div>` : ''}
        <div>Đáp án: <b class="spell">${esc(w.word)}</b> ${w.ipa ? `<span class="ipa">${esc(w.ipa)}</span>` : ''} · ${esc(meaningOf(w))} ${sayBtn(w.word, { sm: true })}</div>
        ${fbExample(w)}
      </div>${nextBtn('nghe-viet', last)}`;
    }
    return body;
  }
  function checkSpell(typed) {
    const S = sessions['nghe-viet'];
    if (!S || S.answered) return;
    S.q.typed = String(typed || '').trim().slice(0, 64);
    S.q.result = cleanSpell(S.q.typed) === cleanSpell(S.q.w.word);
    record('nghe-viet', S.q.result);
    renderQuiz('nghe-viet');
    const btn = root.querySelector('#qz-nghe-viet [data-act="next"]');
    if (btn) btn.focus({ preventScroll: true });
  }

  function renderDone(mode) {
    const S = sessions[mode];
    const n = S.items.length;
    const p = Math.round((S.right / n) * 100);
    const miss = [...new Set(S.log.filter((x) => !x.ok).map((x) => x.id))].map(byId).filter(Boolean);
    const msg = p === 100 ? 'Xuất sắc, đúng hết!' : p >= 80 ? 'Rất tốt!' : p >= 50 ? 'Khá rồi, ôn thêm chút nữa nhé.' : 'Cần ôn thêm. Thử chế độ Ôn thẻ với các từ sai bên dưới.';
    $('qz-' + mode).innerHTML = `<div class="q-card"><div class="done">
      <div class="score-ring" style="--p:${p}"><span>${S.right}/${n}</span></div>
      <h3>${msg}</h3>
      ${miss.length ? `<div class="miss-list"><p class="muted small">Các từ trả lời sai:</p>${miss.map((w) => `<div class="miss"><div><b class="w">${esc(w.word)}</b> ${w.ipa ? `<span class="ipa">${esc(w.ipa)}</span>` : ''}<div class="small">${esc(meaningOf(w))}</div></div>${sayBtn(w.word, { sm: true })}</div>`).join('')}</div>` : ''}
      <div class="len-pick"><span class="muted small">Số câu mỗi lượt:</span>${[10, 20, 30].map((k) => `<button type="button" class="chip" data-act="len" data-len="${k}" aria-pressed="${store.len === k}">${k}</button>`).join('')}</div>
      <div class="row center">
        ${miss.length ? `<button type="button" class="btn" data-act="retry" data-mode="${mode}">Làm lại ${miss.length} từ sai</button>` : ''}
        <button type="button" class="btn primary" data-act="restart" data-mode="${mode}">Luyện lượt mới <kbd>Enter</kbd></button>
      </div>
    </div></div>`;
  }

  /* ====================== 5. ĐẶT CÂU ====================== */
  let sc = { text: '', state: 'idle', result: null, err: '' };
  let scSeq = 0;
  function scWord() {
    let w = store.scId ? byId(store.scId) : null;
    if (!w && words.length) {
      // Mặc định: từ có ít câu nhất, mới tra nhất.
      w = words.slice().sort((a, b) => a.sentences.length - b.sentences.length)[0];
      store.scId = w.id;
      save();
    }
    return w;
  }
  function selectScWord(id) {
    store.scId = id;
    save();
    sc = { text: '', state: 'idle', result: null, err: '' };
    scSeq++;
    renderSentence();
  }
  function renderSentence() {
    const box = $('sc');
    if (!words.length) { box.innerHTML = emptyBook(1); return; }
    const w = scWord();
    const opts = words.slice().sort((a, b) => a.word.localeCompare(b.word)).map((x) => `<option value="${x.id}"${x.id === w.id ? ' selected' : ''}>${esc(x.word)}${x.sentences.length ? ` (${x.sentences.length} câu)` : ''}</option>`).join('');
    const R = sc.result;
    let resHtml = '';
    if (sc.state === 'checking') resHtml = '<div class="card sc-res loading" aria-busy="true"><div class="spinner" aria-hidden="true"></div><p>Đang kiểm tra câu...</p></div>';
    else if (sc.state === 'error') resHtml = `<div class="notice bad">${esc(sc.err)}</div>`;
    else if (sc.state === 'done' && R) {
      const items = [];
      items.push(R.uses
        ? `<li class="ck ok"><b>Có dùng từ "${esc(w.word)}".</b></li>`
        : `<li class="ck no"><b>Câu chưa dùng từ "${esc(w.word)}"</b> (hoặc dạng chia/số nhiều của nó). Hãy viết lại câu có từ này.</li>`);
      if (R.grammarErr) items.push(`<li class="ck warn"><b>Chưa soát được ngữ pháp:</b> ${esc(R.grammarErr)}</li>`);
      else if (!R.issues.length) items.push('<li class="ck ok"><b>Không thấy lỗi ngữ pháp, chính tả.</b></li>');
      else items.push(`<li class="ck no"><b>Có ${R.issues.length} chỗ cần xem lại:</b>
          <div class="marked">${markIssues(R.text, R.issues)}</div>
          <ol class="issues">${R.issues.map((m, k) => `<li><span class="iss-txt">"${esc(R.text.substr(m.offset, m.length))}"</span>: ${esc(m.vi || m.message)}${m.vi ? `<span class="muted small"> (${esc(m.message)})</span>` : ''}
            ${m.replacements.length ? `<div class="row fix-row"><span class="muted small">Sửa thành:</span>${m.replacements.map((r) => `<button type="button" class="chip" data-act="apply-fix" data-k="${k}" data-r="${esc(r)}">${esc(r || '(xoá)')}</button>`).join('')}</div>` : ''}</li>`).join('')}</ol></li>`);
      if (R.vi) items.push(`<li class="ck info"><b>Nghĩa câu của bạn (Google dịch):</b> ${esc(R.vi)}<div class="muted small">Đối chiếu xem có đúng ý bạn muốn nói không.</div></li>`);
      const good = R.uses && !R.issues.length && !R.grammarErr;
      resHtml = `<div class="card sc-res ${good ? 'good' : ''}" role="status">
        <ul class="checks">${items.join('')}</ul>
        <div class="row">
          <button type="button" class="btn ${good ? 'primary' : ''}" data-act="sc-save"${R.uses ? '' : ' disabled'}>${good ? 'Lưu câu vào thẻ' : 'Vẫn lưu câu này'}</button>
          ${sayBtn(R.text, { label: 'Nghe câu của bạn' })}
        </div>
      </div>`;
    }
    const exs = w.examples.slice(0, 2);
    box.innerHTML = `<div class="sc-wrap">
      <div class="sc-pick row">
        <label for="scSelect" class="tb-label">Từ cần đặt câu</label>
        <select id="scSelect" class="input select">${opts}</select>
        <button type="button" class="btn" data-act="sc-random">Từ ngẫu nhiên</button>
      </div>
      <div class="card sc-word">
        <div class="entry-head"><h3 class="word">${esc(w.word)}</h3><div class="ipa-line"><span class="ipa-item">${w.ipa ? `<span class="ipa">${esc(w.ipa)}</span>` : ''}${sayBtn(w.word, { sm: true })}</span></div>${badge(w)}</div>
        <div class="meaning">${esc(meaningOf(w) || 'Chưa có nghĩa')}</div>
        ${sensesHtml(w.senses.filter((s) => s.vi && s.vi.length), { full: false })}
        ${exs.length ? `<details class="model"><summary>Xem câu mẫu (${exs.length})</summary>${examplesHtml(exs, 2)}</details>` : ''}
      </div>
      <form class="sc-form" data-form="sentence" autocomplete="off">
        <label for="scText" class="sc-label">Câu của bạn</label>
        <textarea id="scText" class="input" rows="3" maxlength="300" placeholder="Viết một câu tiếng Anh có dùng từ &quot;${esc(w.word)}&quot;..." spellcheck="false">${esc(sc.text)}</textarea>
        <div class="row"><button class="btn primary" type="submit"${sc.state === 'checking' ? ' disabled' : ''}>Kiểm tra câu</button><span class="muted small">Ctrl + Enter để kiểm tra</span></div>
      </form>
      ${resHtml}
      ${w.sentences.length ? `<div class="card"><h4 class="sub">Câu đã đặt với "${esc(w.word)}" (${w.sentences.length})</h4>
        <ul class="my-sents">${w.sentences.map((s, k) => `<li>${sayBtn(s.text, { sm: true, label: 'Nghe câu' })}<span><span class="${s.ok ? '' : 'warn-text'}">${esc(s.text)}</span>${s.vi ? `<span class="muted small d-block">${esc(s.vi)}</span>` : ''}</span><button type="button" class="x-btn" data-act="sc-del" data-k="${k}" aria-label="Xoá câu này" title="Xoá câu này">×</button></li>`).join('')}</ul></div>` : ''}
      <p class="src-note">Câu được soát bằng LanguageTool (lỗi ngữ pháp, chính tả phổ biến) và dịch bằng Google Dịch. Công cụ tự động không đánh giá được câu có tự nhiên hay dùng từ đúng ngữ cảnh hay không, nên hãy đọc kỹ phần nghĩa tiếng Việt và câu mẫu.</p>
    </div>`;
  }
  function markIssues(text, issues) {
    let out = '';
    let pos = 0;
    const list = issues.slice().sort((a, b) => a.offset - b.offset);
    for (const m of list) {
      if (m.offset < pos) continue;
      out += esc(text.slice(pos, m.offset)) + `<mark title="${esc(m.message)}">${esc(text.substr(m.offset, m.length) || ' ')}</mark>`;
      pos = m.offset + m.length;
    }
    return out + esc(text.slice(pos));
  }
  async function checkSentence(text) {
    const w = scWord();
    const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    sc.text = t;
    if (t.split(' ').length < 3) { sc.state = 'error'; sc.err = 'Câu quá ngắn, hãy viết ít nhất 3 từ.'; renderSentence(); return; }
    if (/[^\x00-\x7F‘’“”–—]/.test(t)) { sc.state = 'error'; sc.err = 'Câu có ký tự không phải tiếng Anh (chữ có dấu tiếng Việt?). Hãy viết câu bằng tiếng Anh.'; renderSentence(); return; }
    const seq = ++scSeq;
    sc.state = 'checking';
    renderSentence();
    const uses = usesWord(t, w.word);
    const [g, v] = await Promise.all([
      checkGrammar(t).then((x) => ({ ok: true, x }), (e) => ({ ok: false, e })),
      translateVi(t).then((x) => x, () => ''),
    ]);
    let issues = g.ok ? g.x : [];
    // Dịch lời giải thích lỗi sang tiếng Việt cho dễ hiểu (lỗi thì giữ tiếng Anh).
    if (issues.length) {
      try {
        const vis = await translateManyVi(issues.map((m) => m.message));
        issues = issues.map((m, k) => ({ ...m, vi: vis[k] || '' }));
      } catch (e) { /* giữ tiếng Anh */ }
    }
    if (seq !== scSeq) return;
    sc.state = 'done';
    sc.result = { text: t, uses, issues, grammarErr: g.ok ? '' : g.e.message, vi: v };
    renderSentence();
    const res = root.querySelector('.sc-res');
    if (res) scrollIntoViewIfAbove(res);
  }
  async function saveSentence() {
    const w = scWord();
    const R = sc.result;
    if (!w || !R || !R.uses) return;
    if (dbState !== 'ready') { toast('Sổ từ chưa sẵn sàng nên chưa lưu được câu.', 'bad'); return; }
    const ok = !R.issues.length && !R.grammarErr;
    const list = w.sentences.filter((s) => s.text.toLowerCase() !== R.text.toLowerCase());
    list.push({ text: R.text, vi: (R.vi || '').slice(0, 300), ok, t: new Date().toISOString() });
    const sentences = list.slice(-10);
    try {
      const row = await dbUpdate(w.id, { sentences });
      replaceLocal(row);
      if (ok) grade(byId(w.id), true);
      sc = { text: '', state: 'idle', result: null, err: '' };
      toast(sentences.length >= 10 && list.length > 10 ? 'Đã lưu câu (mỗi từ giữ 10 câu gần nhất).' : 'Đã lưu câu vào thẻ từ.', 'ok');
    } catch (e) {
      toast('Chưa lưu được câu: ' + dbFail(e), 'bad');
    }
    syncToolbar();
    renderSentence();
  }
  async function deleteSentence(k) {
    const w = scWord();
    if (!w) return;
    const sentences = w.sentences.filter((_, i) => i !== k);
    try {
      replaceLocal(await dbUpdate(w.id, { sentences }));
    } catch (e) {
      toast('Chưa xoá được câu: ' + dbFail(e), 'bad');
    }
    renderSentence();
  }

  /* ====================== 6. SỔ TỪ ====================== */
  let nbQuery = '';
  let resetArmed = 0;
  function renderNotebook() {
    const box = $('nb');
    if (dbState === 'loading') { box.innerHTML = '<div class="fc-empty">Đang tải sổ từ...</div>'; return; }
    const n = words.length;
    const known = words.filter((w) => status(w) === 'known').length;
    const learn = words.filter((w) => status(w) === 'learn').length;
    const sents = words.reduce((a, w) => a + w.sentences.length, 0);
    let right = 0; let wrong = 0;
    words.forEach((w) => { right += w.correct; wrong += w.wrong; });
    const q = nbQuery.trim().toLowerCase();
    let list = words.filter((w) => (store.filter === 'all' || status(w) === store.filter) && (!q || w.word.toLowerCase().includes(q) || (w.meaning_vi || '').toLowerCase().includes(q)));
    if (store.sort === 'az') list = list.slice().sort((a, b) => a.word.localeCompare(b.word));
    else if (store.sort === 'weak') list = list.slice().sort((a, b) => weight(b) - weight(a) || b.wrong - a.wrong);
    const F = [['all', 'Tất cả'], ['new', 'Chưa ôn'], ['learn', 'Đang học'], ['known', 'Đã thuộc']];
    box.innerHTML = `
      <div class="stats">
        <div class="stat"><h3>Tổng số từ <span>${n}</span></h3>
          <div class="stack" role="img" aria-label="Đã thuộc ${known}, đang học ${learn}, chưa ôn ${n - known - learn}"><i class="k" style="width:${n ? (known / n) * 100 : 0}%"></i><i class="l" style="width:${n ? (learn / n) * 100 : 0}%"></i></div>
          <p class="muted small">Đã thuộc ${known} · Đang học ${learn} · Chưa ôn ${n - known - learn}</p></div>
        <div class="stat"><h3>Lượt ôn <span>${right + wrong}</span></h3><p class="muted small">${right + wrong ? `Tỉ lệ đúng ${Math.round((right / (right + wrong)) * 100)}%` : 'Chưa ôn lần nào'}</p></div>
        <div class="stat"><h3>Câu đã đặt <span>${sents}</span></h3><p class="muted small">${words.filter((w) => w.sentences.length).length} từ đã có câu</p></div>
      </div>
      <div class="legend"><span><i style="background:#22c55e"></i>Đã thuộc</span><span><i style="background:#f59e0b"></i>Đang học</span><span><i style="background:#cbd5e1"></i>Chưa ôn</span></div>
      <div class="nb-tools">
        <label class="sr-only" for="nbSearch">Tìm trong sổ từ</label>
        <input id="nbSearch" class="input" type="search" placeholder="Tìm từ hoặc nghĩa..." value="${esc(nbQuery)}" autocapitalize="off" spellcheck="false">
        <label class="sr-only" for="nbSort">Sắp xếp</label>
        <select id="nbSort" class="input select"><option value="new"${store.sort === 'new' ? ' selected' : ''}>Mới tra trước</option><option value="az"${store.sort === 'az' ? ' selected' : ''}>A đến Z</option><option value="weak"${store.sort === 'weak' ? ' selected' : ''}>Cần ôn trước</option></select>
      </div>
      <div class="row">${F.map(([k, t]) => `<button type="button" class="chip" data-act="nfilter" data-f="${k}" aria-pressed="${store.filter === k}">${t}</button>`).join('')}</div>
      <div id="nbList">${nbListHtml(list)}</div>
      ${n ? `<div class="danger-zone"><button type="button" class="btn again" data-act="reset">${resetArmed ? 'Bấm lần nữa để đặt lại' : 'Đặt lại tiến độ ôn'}</button><span>Đưa mọi từ về "chưa ôn", không xoá từ và câu đã đặt.</span></div>` : ''}`;
  }
  function nbListHtml(list) {
    if (!words.length) return emptyBook(1);
    if (!list.length) return '<div class="fc-empty">Không có từ nào khớp.</div>';
    return `<ul class="nb-list">${list.map((w) => `<li class="nb-item s-${status(w)}">
        <button type="button" class="nb-main" data-act="show-saved" data-id="${w.id}" title="Xem chi tiết">
          <span class="nb-word">${esc(w.word)}</span>
          ${w.ipa ? `<span class="ipa small">${esc(w.ipa)}</span>` : ''}
          <span class="nb-mean">${esc(meaningOf(w))}</span>
        </button>
        <span class="nb-meta">${badge(w)}${w.sentences.length ? `<span class="muted small">${w.sentences.length} câu</span>` : ''}</span>
        <span class="nb-act">
          ${sayBtn(w.word, { sm: true })}
          <button type="button" class="chip" data-act="open-card" data-id="${w.id}">Ôn</button>
          <button type="button" class="chip" data-act="to-sentence" data-id="${w.id}">Đặt câu</button>
          <button type="button" class="chip bad" data-act="del" data-id="${w.id}">${delArmed === w.id ? 'Xoá hẳn?' : 'Xoá'}</button>
        </span>
      </li>`).join('')}</ul>`;
  }
  function refreshNbList() {
    const q = nbQuery.trim().toLowerCase();
    let list = words.filter((w) => (store.filter === 'all' || status(w) === store.filter) && (!q || w.word.toLowerCase().includes(q) || (w.meaning_vi || '').toLowerCase().includes(q)));
    if (store.sort === 'az') list = list.slice().sort((a, b) => a.word.localeCompare(b.word));
    else if (store.sort === 'weak') list = list.slice().sort((a, b) => weight(b) - weight(a) || b.wrong - a.wrong);
    const el = $('nbList');
    if (el) el.innerHTML = nbListHtml(list);
  }
  async function resetProgress() {
    if (!(resetArmed && Date.now() - resetArmed < 5000)) {
      resetArmed = Date.now();
      renderNotebook();
      setTimeout(() => { if (resetArmed && Date.now() - resetArmed >= 5000) { resetArmed = 0; if (store.page === 'so-tu') renderNotebook(); } }, 5100);
      return;
    }
    resetArmed = 0;
    try {
      const { error } = await supabase.from(TABLE).update({ level: 0, correct: 0, wrong: 0, last_review: null }).not('id', 'is', null);
      if (error) throw error;
      words.forEach((w) => { w.level = 0; w.correct = 0; w.wrong = 0; w.last_review = null; });
      Object.keys(sessions).forEach((k) => delete sessions[k]);
      fcList = null;
      toast('Đã đặt lại tiến độ ôn.', 'ok');
    } catch (e) {
      toast('Chưa đặt lại được: ' + dbFail(e), 'bad');
    }
    syncToolbar();
    renderNotebook();
  }

  /* ====================== SỰ KIỆN ====================== */
  const rerender = () => renderPage(store.page);

  vb.addEventListener('click', (e) => {
    const say = e.target.closest('[data-say]');
    if (say) { e.stopPropagation(); speak(say.dataset.say, say.dataset.acc || store.accent, say.dataset.rate ? +say.dataset.rate : 0.9); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    switch (act) {
      case 'accent': store.accent = b.dataset.acc; save(); syncToolbar(); break;
      case 'opt': store[b.dataset.opt] = !store[b.dataset.opt]; save(); syncToolbar(); break;
      case 'reload': reload(); break;
      case 'goto': showPage(b.dataset.page, { scroll: true }); if (b.dataset.page === 'tra-tu') { const i = $('lkInput'); if (i) i.focus(); } break;
      case 'lookup': showPage('tra-tu'); doLookup(b.dataset.w); break;
      case 'show-saved': { const w = byId(b.dataset.id); if (w) { showPage('tra-tu', { scroll: true }); showSaved(w); } break; }
      case 'edit-meaning': lk.editing = true; renderLookup(); break;
      case 'edit-cancel': lk.editing = false; renderLookup(); break;
      case 'del': deleteWord(b.dataset.id, rerender); break;
      case 'to-sentence': selectScWord(b.dataset.id); showPage('dat-cau', { scroll: true }); { const t = $('scText'); if (t) t.focus({ preventScroll: true }); } break;
      case 'open-card': {
        store.fc.only = false; store.fc.shuffle = false; fcList = null; buildFcList();
        store.fc.i = Math.max(0, fcList.indexOf(b.dataset.id)); fcBack = false; fcMsg = null;
        showPage('lat-the', { scroll: true });
        break;
      }
      case 'flip': fcBack = !fcBack; b.classList.toggle('is-back', fcBack);
        b.querySelector('.front').setAttribute('aria-hidden', String(fcBack));
        b.querySelector('.back').setAttribute('aria-hidden', String(!fcBack));
        if (fcBack && store.auto && store.front === 'vi') { const w = byId(fcList[store.fc.i]); if (w) speak(w.word); }
        break;
      case 'fc-prev': fcGo(-1); break;
      case 'fc-next': fcGo(1); break;
      case 'fc-rate': fcRate(b.dataset.ok === '1'); break;
      case 'fc-front': store.front = store.front === 'en' ? 'vi' : 'en'; fcBack = false; save(); renderFc(); break;
      case 'fc-shuffle': store.fc.shuffle = !store.fc.shuffle; store.fc.i = 0; fcList = null; fcBack = false; save(); renderFc(); break;
      case 'fc-only': store.fc.only = !store.fc.only; store.fc.i = 0; fcList = null; fcBack = false; save(); renderFc(); break;
      case 'fc-first': store.fc.i = 0; fcBack = false; save(); renderFc(); break;
      case 'ans': answerChoice(b.dataset.id); break;
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
      case 'nv-hint': store.nvHint = !store.nvHint; save(); { const S = sessions['nghe-viet']; if (S && S.q) { const i = $('nvInput'); if (i) S.q.typed = i.value; } } renderQuiz('nghe-viet'); break;
      case 'say-slow': speak(b.dataset.w, store.accent, 0.55); break;
      case 'spell-skip': checkSpell(''); break;
      case 'sc-random': {
        const others = words.filter((w) => w.id !== store.scId);
        if (others.length) selectScWord(shuffle(others)[0].id);
        break;
      }
      case 'apply-fix': {
        const R = sc.result;
        const m = R && R.issues[+b.dataset.k];
        if (!m) break;
        const fixed = R.text.slice(0, m.offset) + b.dataset.r + R.text.slice(m.offset + m.length);
        sc = { text: fixed, state: 'idle', result: null, err: '' };
        renderSentence();
        { const t = $('scText'); if (t) { t.focus({ preventScroll: true }); t.setSelectionRange(fixed.length, fixed.length); } }
        break;
      }
      case 'sc-save': saveSentence(); break;
      case 'sc-del': deleteSentence(+b.dataset.k); break;
      case 'nfilter': store.filter = b.dataset.f; save(); renderNotebook(); break;
      case 'reset': resetProgress(); break;
      default: break;
    }
  });

  vb.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.id === 'lkForm') { doLookup($('lkInput').value); return; }
    const kind = f.dataset.form;
    if (kind === 'meaning') saveMeaning($('mEdit').value);
    else if (kind === 'spell') checkSpell($('nvInput').value);
    else if (kind === 'sentence') checkSentence($('scText').value);
  });
  vb.addEventListener('change', (e) => {
    if (e.target.id === 'scSelect') selectScWord(e.target.value);
    else if (e.target.id === 'nbSort') { store.sort = e.target.value; save(); refreshNbList(); }
  });
  vb.addEventListener('input', (e) => {
    if (e.target.id === 'nbSearch') { nbQuery = e.target.value; refreshNbList(); }
    else if (e.target.id === 'scText') { sc.text = e.target.value; }
    else if (e.target.id === 'nvInput') { const S = sessions['nghe-viet']; if (S && S.q) S.q.typed = e.target.value; }
  });
  vb.addEventListener('keydown', (e) => {
    if (e.target.id === 'scText' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); checkSentence(e.target.value); }
    if (e.target.id === 'nvInput' && e.key === ' ' && e.ctrlKey) { e.preventDefault(); const S = sessions['nghe-viet']; if (S && S.q) speak(S.q.w.word, store.accent, 0.85); }
    if (e.target.id === 'mEdit' && e.key === 'Escape') { lk.editing = false; renderLookup(); }
  });

  /** Phím tắt: chỉ khi mục đang hiện và không gõ trong ô nhập. */
  function onKey(e) {
    if (!host.isConnected || host.offsetParent === null) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.composedPath ? e.composedPath()[0] : e.target;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    const inside = Boolean(t && t.getRootNode && t.getRootNode() === root);
    const inNav = Boolean(t && nav.contains(t));
    const neutral = !t || t === document.body || t === document.documentElement || t === host;
    if (!inside && !inNav && !neutral) return;
    const isBtn = Boolean(t && t.tagName === 'BUTTON' && (inside || inNav));
    const page = store.page;
    if (page === 'lat-the') {
      if (!fcList || !fcList.length) return;
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
    if (e.key === 'Enter') {
      if (isBtn && !(inside && ['next', 'restart'].includes(t.dataset.act))) return;
      e.preventDefault();
      if (S.i >= S.items.length) { startSession(page); renderQuiz(page); }
      else if (S.answered) nextQ(page);
      return;
    }
    if (page === 'chon-nghia' && !S.answered && S.i < S.items.length && /^[1-4]$/.test(e.key)) {
      const o = S.q.opts[+e.key - 1];
      if (o) answerChoice(o.id);
    }
  }

  async function reload() {
    await loadWords();
    fcList = null;
    Object.keys(sessions).forEach((k) => delete sessions[k]);
    if (lk.row) lk.row = byId(lk.row.id);
    syncToolbar();
    rerender();
  }

  syncToolbar();
  showPage(store.page);
  reload();
  return { showPage, onKey, refresh: () => { syncToolbar(); rerender(); }, reload };
}
