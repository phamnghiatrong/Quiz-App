/* vocab-mini.js - Ô tra từ tiếng Anh thu gọn, đặt bên phải màn hình làm bài
 * các môn Tiếng Anh (app.js gọi khi môn đang làm có slug bắt đầu bằng "tieng-anh").
 *
 * - mountMiniLookup(host, { supabase, userId }) vẽ vào Shadow DOM của host
 *   (CSS chung của app có nhiều !important nên phải tách riêng).
 * - Trả về { lookup(word) } để app.js tra nhanh khi người dùng bấm đúp vào
 *   một từ trong câu hỏi.
 * - Dùng chung phần tra từ của mục Từ vựng tiếng Anh (vocab-api.js). Không tự
 *   lưu: chỉ lưu khi bấm "Thêm vào sổ" (bảng vocab_words, lang = 'en'), rồi báo
 *   cho mục Từ vựng tải lại sổ từ ở lần mở sau.
 */

const VERSION = new URL(import.meta.url).search;
const TABLE = 'vocab_words';

const CSS = `
:host { display: block; color: #1e293b; font-size: 15px; line-height: 1.5; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
button, input { font: inherit; color: inherit; }
.box { display: grid; gap: 12px; padding: 16px; border: 1px solid rgba(148, 163, 184, .32); border-radius: 22px; background: #fff; box-shadow: 0 8px 24px rgba(15, 23, 42, .08); }
.head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.head h3 { margin: 0; font-size: 16px; font-weight: 700; color: #6d28d9; }
.toggle { appearance: none; border: 0; background: none; cursor: pointer; color: #64748b; font-size: 13px; font-weight: 600; padding: 4px 6px; border-radius: 8px; }
.toggle:hover { background: #f1f5f9; }
form { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
input { width: 100%; min-height: 42px; padding: 8px 12px; border: 1.5px solid rgba(148, 163, 184, .6); border-radius: 12px; background: #fff; font-size: 15px; }
input:focus { outline: none; border-color: #8b5cf6; box-shadow: 0 0 0 3px rgba(139, 92, 246, .18); }
.btn { appearance: none; cursor: pointer; min-height: 42px; padding: 8px 14px; border-radius: 12px; border: 1px solid rgba(139, 92, 246, .45); background: linear-gradient(135deg, #8b5cf6, #6366f1); color: #fff; font-weight: 600; font-size: 14px; }
.btn.ghost { background: #fff; color: #334155; border-color: rgba(148, 163, 184, .5); }
.btn:disabled { opacity: .5; cursor: default; }
.hint { margin: 0; font-size: 12.5px; color: #64748b; }
/* Điện thoại / máy tính bảng không bấm đúp chọn từ được -> ẩn mẹo */
@media (hover: none) and (pointer: coarse) { .hint { display: none; } }
.res { display: grid; gap: 8px; }
.word-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
.word { font-size: 24px; font-weight: 700; color: #3b2a8f; overflow-wrap: anywhere; }
.ipa { font-family: "Segoe UI", "Lucida Sans Unicode", "Noto Sans", sans-serif; color: #6d28d9; font-size: 14.5px; }
.meaning { font-size: 18px; font-weight: 700; }
.sense { font-size: 14px; }
.pos { display: inline-block; font-size: 11.5px; font-weight: 700; color: #6d28d9; background: #ede9fe; padding: 1px 7px; border-radius: 999px; margin-right: 6px; }
.ex { font-size: 13.5px; padding-left: 10px; border-left: 3px solid #ede9fe; }
.ex .vi { color: #64748b; }
.say { appearance: none; border: 0; background: #ede9fe; cursor: pointer; display: inline-grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; color: #6d28d9; flex: none; }
.say svg { width: 15px; height: 15px; }
.foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding-top: 8px; border-top: 1px solid rgba(148, 163, 184, .32); }
.saved { color: #15803d; font-weight: 600; font-size: 13.5px; }
.warn { color: #b45309; font-size: 13px; }
.err { color: #991b1b; font-size: 14px; }
.muted { color: #64748b; font-size: 13.5px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { appearance: none; cursor: pointer; padding: 3px 10px; border-radius: 999px; border: 1px solid rgba(148, 163, 184, .6); background: #fff; font-size: 13px; font-weight: 600; color: #334155; }
.chip:hover { border-color: #8b5cf6; }
.spin { width: 20px; height: 20px; border-radius: 50%; border: 3px solid #ede9fe; border-top-color: #8b5cf6; animation: s .8s linear infinite; display: inline-block; vertical-align: middle; margin-right: 8px; }
@keyframes s { to { transform: rotate(360deg); } }
.box.collapsed .body { display: none; }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
`;
const SAY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let apiPromise = null;
const loadApi = () => (apiPromise ||= import('./vocab-api.js' + VERSION));

export async function mountMiniLookup(host, { supabase = null, userId = null } = {}) {
  const api = await loadApi();
  if (host.__mini && host.__mini.userId === userId) return host.__mini;
  const mini = build(host, api, supabase, userId);
  host.__mini = mini;
  return mini;
}

function build(host, api, supabase, userId) {
  const { lookupWord, normalizeWord, isValidWord, posVi, newWordRow, savedSenses, notifyVocabChanged } = api;
  const root = host.shadowRoot || host.attachShadow({ mode: 'open' });
  const collapsedKey = 'vocab-mini-collapsed';
  let collapsed = false;
  try { collapsed = localStorage.getItem(collapsedKey) === '1'; } catch (e) { /* bỏ qua */ }

  root.innerHTML = `<style>${CSS}</style>
  <section class="box${collapsed ? ' collapsed' : ''}" id="box" aria-labelledby="miniTitle">
    <div class="head"><h3 id="miniTitle">Tra từ</h3><button type="button" class="toggle" id="tog" aria-expanded="${!collapsed}">${collapsed ? 'Mở' : 'Thu gọn'}</button></div>
    <div class="body">
      <form id="f" autocomplete="off">
        <label for="q" style="position:absolute;left:-9999px">Từ tiếng Anh cần tra</label>
        <input id="q" type="search" enterkeyhint="search" maxlength="64" placeholder="Nhập từ tiếng Anh..." autocapitalize="off" autocorrect="off" spellcheck="false">
        <button class="btn" type="submit">Tra</button>
      </form>
      <p class="hint">Mẹo: bấm đúp vào một từ trong câu hỏi để tra nhanh.</p>
      <div id="out" aria-live="polite"></div>
      <div id="recent"></div>
    </div>
  </section>`;
  const $ = (id) => root.getElementById(id);

  /* ---- phát âm ---- */
  const canSpeak = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
  function speak(text) {
    if (!canSpeak || !text) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 0.9;
      const v = speechSynthesis.getVoices().find((x) => /^en[-_]US/i.test(x.lang)) || speechSynthesis.getVoices().find((x) => /^en/i.test(x.lang));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch (e) { /* bỏ qua */ }
  }
  const sayBtn = (t) => (canSpeak ? `<button type="button" class="say" data-say="${esc(t)}" aria-label="Nghe phát âm" title="Nghe phát âm">${SAY_SVG}</button>` : '');

  /* ---- sổ từ (chỉ kiểm tra từ có sẵn + thêm mới) ---- */
  let legacyNoLang = false; // bảng tạo bằng bản SQL đầu, chưa có cột lang
  const noLang = (e) => Boolean(e) && (e.code === '42703' || e.code === 'PGRST204') && /lang/.test(String(e.message || ''));
  async function findSaved(word) {
    if (!supabase || !userId) return null;
    let q = supabase.from(TABLE).select('id, word, meaning_vi').ilike('word', word).limit(1);
    if (!legacyNoLang) q = q.eq('lang', 'en');
    let { data, error } = await q;
    if (error && noLang(error)) {
      legacyNoLang = true;
      ({ data, error } = await supabase.from(TABLE).select('id, word, meaning_vi').ilike('word', word).limit(1));
    }
    if (error) throw error;
    return (data && data[0]) || null;
  }
  async function insertWord(res) {
    const row = newWordRow(res);
    const { data, error } = await supabase.from(TABLE).insert(legacyNoLang ? row : { ...row, lang: 'en' }).select('id, word').single();
    if (error) throw error;
    return data;
  }
  const dbText = (e) => {
    const m = String((e && e.message) || e || '');
    if (e && (e.code === '42P01' || e.code === 'PGRST205')) return 'Chưa có bảng sổ từ (vocab_words).';
    if (e && e.code === '23505') return 'Từ này đã có trong sổ.';
    return /fetch|network/i.test(m) ? 'Mất kết nối mạng.' : m || 'Lỗi không rõ';
  };

  /* ---- trạng thái + vẽ ---- */
  let st = { state: 'idle', q: '', res: null, saved: null, checking: false, saving: false, err: '', saveErr: '' };
  let seq = 0;
  const recent = [];

  function render() {
    const out = $('out');
    if (st.state === 'idle') out.innerHTML = '';
    else if (st.state === 'loading') out.innerHTML = `<p class="muted"><span class="spin" aria-hidden="true"></span>Đang tra "${esc(st.q)}"...</p>`;
    else if (st.state === 'error') out.innerHTML = `<p class="err">${esc(st.err)}</p>`;
    else if (st.state === 'notfound') {
      const sug = st.res.suggestions || [];
      out.innerHTML = `<p class="muted">Không tìm thấy "${esc(st.q)}".</p>${sug.length ? `<div class="chips">${sug.map((w) => `<button type="button" class="chip" data-w="${esc(w)}">${esc(w)}</button>`).join('')}</div>` : ''}`;
    } else {
      const r = st.res;
      const senses = savedSenses(r).filter((g) => g.vi.length).slice(0, 3);
      const ex = (r.examples || [])[0];
      let foot;
      if (!supabase || !userId) foot = '<span class="muted">Đăng nhập để lưu từ vào sổ.</span>';
      else if (st.checking) foot = '<span class="muted">Đang kiểm tra sổ từ...</span>';
      else if (st.saved) foot = '<span class="saved">Đã có trong sổ từ</span>';
      else foot = `<button type="button" class="btn" id="add"${st.saving ? ' disabled' : ''}>${st.saving ? 'Đang thêm...' : '+ Thêm vào sổ'}</button>${st.saveErr ? `<span class="warn">${esc(st.saveErr)}</span>` : ''}`;
      out.innerHTML = `<div class="res">
        <div class="word-row"><span class="word">${esc(r.word)}</span>${sayBtn(r.word)}</div>
        ${r.ipaText ? `<span class="ipa">${esc(r.ipaText)}</span>` : ''}
        <div class="meaning">${r.meaningVi ? esc(r.meaningVi) : '<span class="muted">Chưa có nghĩa tiếng Việt</span>'}</div>
        ${r.phraseOnly ? '<p class="hint">Cụm này không có trong từ điển, đây là bản dịch cả cụm.</p>' : ''}
        ${senses.map((g) => `<div class="sense"><span class="pos">${esc(posVi(g.pos))}</span>${esc(g.vi.join(g.pos === 'related' ? '; ' : ', '))}</div>`).join('')}
        ${ex ? `<div class="ex"><div>${esc(ex.en)} ${sayBtn(ex.en)}</div>${ex.vi ? `<div class="vi">${esc(ex.vi)}</div>` : ''}</div>` : ''}
        <div class="foot">${foot}</div>
      </div>`;
    }
    $('recent').innerHTML = recent.length > 1
      ? `<p class="hint" style="margin-bottom:6px">Vừa tra:</p><div class="chips">${recent.map((w) => `<button type="button" class="chip" data-w="${esc(w)}">${esc(w)}</button>`).join('')}</div>`
      : '';
  }

  async function lookup(raw) {
    const q = normalizeWord(raw);
    if (!q) return;
    if (collapsed) setCollapsed(false);
    $('q').value = q;
    if (!isValidWord(q)) { st = { ...st, state: 'error', err: 'Chỉ nhập chữ cái tiếng Anh, ví dụ "routine", "give up".' }; render(); return; }
    const my = ++seq;
    st = { state: 'loading', q, res: null, saved: null, checking: false, saving: false, err: '', saveErr: '' };
    render();
    let res;
    try {
      res = await lookupWord(q);
    } catch (e) {
      if (my !== seq) return;
      st = { ...st, state: 'error', err: e.code === 'INVALID' ? e.message : 'Không tra được lúc này, thử lại sau.' };
      render();
      return;
    }
    if (my !== seq) return;
    if (!res.found) { st = { ...st, state: 'notfound', res }; render(); return; }
    const k = recent.indexOf(res.word);
    if (k >= 0) recent.splice(k, 1);
    recent.unshift(res.word);
    recent.length = Math.min(recent.length, 8);
    st = { ...st, state: 'done', res, checking: Boolean(supabase && userId) };
    render();
    if (!st.checking) return;
    try {
      const saved = await findSaved(res.word);
      if (my !== seq) return;
      st.saved = saved;
    } catch (e) {
      if (my !== seq) return;
      st.saveErr = dbText(e);
    }
    st.checking = false;
    render();
  }

  async function add() {
    if (!st.res || st.saved || st.saving) return;
    const my = seq;
    st.saving = true;
    st.saveErr = '';
    render();
    try {
      const row = await insertWord(st.res);
      if (my !== seq) return;
      st.saved = row;
      notifyVocabChanged();
    } catch (e) {
      if (my !== seq) return;
      if (e && e.code === '23505') st.saved = { word: st.res.word };
      else st.saveErr = 'Chưa lưu được: ' + dbText(e);
    }
    st.saving = false;
    render();
  }

  function setCollapsed(v) {
    collapsed = v;
    $('box').classList.toggle('collapsed', v);
    const t = $('tog');
    t.textContent = v ? 'Mở' : 'Thu gọn';
    t.setAttribute('aria-expanded', String(!v));
    try { localStorage.setItem(collapsedKey, v ? '1' : '0'); } catch (e) { /* bỏ qua */ }
  }

  $('f').addEventListener('submit', (e) => { e.preventDefault(); lookup($('q').value); });
  root.addEventListener('click', (e) => {
    const say = e.target.closest('[data-say]');
    if (say) { speak(say.dataset.say); return; }
    const chip = e.target.closest('[data-w]');
    if (chip) { lookup(chip.dataset.w); return; }
    if (e.target.closest('#add')) { add(); return; }
    if (e.target.closest('#tog')) setCollapsed(!collapsed);
  });
  // Phím tắt của màn làm bài (nếu có) không được ăn phím khi đang gõ trong ô tra từ.
  root.addEventListener('keydown', (e) => e.stopPropagation());

  render();
  return { lookup, userId };
}
