/* chinese.js - Mục "Tiếng Trung YCT" (học từ vựng bằng thẻ) của Quiz App.
 *
 * Cách hoạt động (cùng khuôn với mục 12 thì tiếng Anh - tenses/):
 * - app.js gọi mountChinese(host, nav, { userId, scrollAnchor }) khi người
 *   dùng mở mục này lần đầu (nạp lười bằng import()).
 * - Nội dung vẽ trong Shadow DOM của `host`: CSS của app không đè vào được.
 * - `nav` là thanh chuyển trang con nằm ngoài Shadow DOM, dùng nút chuẩn của
 *   app (CSS trong index.html, chung với #tensesNav).
 * - Tiến độ từng thẻ lưu trong localStorage, tách theo tài khoản.
 *
 * 5 trang con:
 *   lat-the     Lật thẻ: xem hình + chữ, lật xem nghĩa và câu ví dụ, tự chấm nhớ/chưa nhớ
 *   doan-nghia  Nhìn chữ & hình, chọn nghĩa tiếng Việt đúng (4 lựa chọn)
 *   ghep-cau    Xếp các mảnh từ thành câu ví dụ theo nghĩa tiếng Việt
 *   chon-chu    Chọn chữ Hán đúng: theo hình + nghĩa, hoặc điền chỗ trống trong câu
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
  { id: 'lat-the', label: 'Lật thẻ' },
  { id: 'doan-nghia', label: 'Nhìn chữ & hình đoán nghĩa' },
  { id: 'ghep-cau', label: 'Ghép câu' },
  { id: 'chon-chu', label: 'Chọn chữ đúng' },
  { id: 'tien-do', label: 'Tiến độ & bộ thẻ' },
];

let assets = null; // { data, css }
let mounted = null; // { host, key, api }
let keyBound = false;

async function loadAssets() {
  if (assets) return assets;
  const [data, css] = await Promise.all([
    import('./chinese-data.js' + VERSION),
    fetch(new URL('./chinese.css' + VERSION, import.meta.url)).then((r) => {
      if (!r.ok) throw new Error('Không tải được chinese.css (' + r.status + ')');
      return r.text();
    }),
  ]);
  assets = { data, css };
  return assets;
}

/** Gắn mục vào trang. Gọi lại nhiều lần được; đổi tài khoản thì dựng lại. */
export async function mountChinese(host, nav, { userId = null, scrollAnchor = null } = {}) {
  const { data, css } = await loadAssets();
  const key = STORE_PREFIX + (userId ? ':' + userId : '');
  if (mounted && mounted.host === host && mounted.key === key) return mounted.api;
  const api = build({ host, nav, key, data, css, scrollAnchor });
  mounted = { host, key, api };
  if (!keyBound) {
    keyBound = true;
    document.addEventListener('keydown', (e) => { if (mounted) mounted.api.onKey(e); });
  }
  return api;
}

/* ====================================================================== */

function build({ host, nav, key, data, css, scrollAnchor }) {
  const { CARDS, IMG_VERSION } = data;
  const byId = Object.fromEntries(CARDS.map((c) => [c.id, c]));
  const LEVELS = [1, 2, 3, 4];

  const root = host.shadowRoot || host.attachShadow({ mode: 'open' });

  /* ---------------- lưu trạng thái theo tài khoản ---------------- */
  let store = { page: 'lat-the', levels: [1], py: true, en: false, auto: false, hidePic: false, len: 10, st: {}, fc: { i: 0, only: false, shuffle: false } };
  try {
    const raw = localStorage.getItem(key);
    if (raw) store = Object.assign(store, JSON.parse(raw));
  } catch (e) { /* dữ liệu hỏng thì bỏ qua */ }
  if (!Array.isArray(store.levels) || !store.levels.length) store.levels = [1];
  store.levels = store.levels.filter((l) => LEVELS.includes(l));
  if (!store.levels.length) store.levels = [1];
  store.st = store.st && typeof store.st === 'object' ? store.st : {};
  store.fc = Object.assign({ i: 0, only: false, shuffle: false }, store.fc || {});
  if (![10, 20, 30].includes(store.len)) store.len = 10;
  function save() {
    try { localStorage.setItem(key, JSON.stringify(store)); } catch (e) { /* hết chỗ / chế độ riêng tư */ }
  }

  /* ---------------- tiện ích ---------------- */
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const imgUrl = (id) => new URL(`./img/${id}.webp?v=${IMG_VERSION}`, import.meta.url).href;
  const img = (c, tag = 'figure') => `<${tag} class="pic"><img src="${imgUrl(c.id)}" width="320" height="290" alt="Hình minh hoạ" loading="lazy" decoding="async"></${tag}>`;
  // Hình có in sẵn chữ Hán (c.txt) sẽ lộ đáp án ở chế độ Ghép câu / Chọn chữ: chỉ hiện sau khi trả lời.
  const picHidden = (c, S) => Boolean(c.txt) && !S.answered;
  const preload = (c) => { if (c) { const i = new Image(); i.src = imgUrl(c.id); } };

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

  /* ---------------- mức nhớ ---------------- */
  const stOf = (id) => store.st[id] || null;
  function status(id) {
    const s = stOf(id);
    if (!s) return 'new';
    return s.s >= KNOWN_AT ? 'known' : 'learn';
  }
  const STATUS_LABEL = { new: 'Chưa học', learn: 'Đang học', known: 'Đã thuộc' };
  const badge = (id) => { const s = status(id); return `<span class="badge s-${s}">${STATUS_LABEL[s]}</span>`; };
  function grade(id, ok) {
    const s = store.st[id] || (store.st[id] = { s: 0, c: 0, w: 0 });
    if (ok) { s.c += 1; s.s = Math.min(5, s.s + 1); } else { s.w += 1; s.s = 0; }
    s.t = Date.now();
    save();
  }
  const WEIGHT = { new: 3, 0: 4, 1: 3, 2: 2, 3: 1, 4: 0.6, 5: 0.3 };
  function weight(id) { const s = stOf(id); return s ? WEIGHT[s.s] ?? 1 : WEIGHT.new; }

  const pool = () => CARDS.filter((c) => store.levels.includes(c.lv));

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

  <section class="page" data-page="tien-do" aria-labelledby="h-tien-do" hidden>
    <div class="sec-head"><h2 id="h-tien-do">Tiến độ &amp; bộ thẻ</h2><p>Thẻ được tính là "đã thuộc" khi trả lời đúng hoặc tự chấm "Đã nhớ" 3 lần liên tiếp; trả lời sai sẽ đưa thẻ về "đang học". Bấm vào một thẻ để mở nó ở chế độ Lật thẻ.</p></div>
    <div id="prog"></div>
  </section>
</div>`;
  const $ = (id) => root.getElementById(id);
  const yc = $('yc');
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
    else renderQuiz(id);
    if (scroll) scrollToTop();
  }

  /* ====================== 1. LẬT THẺ ====================== */
  let fcList = null; // danh sách id đang lật
  let fcBack = false;
  let fcJustRated = null;
  function buildFcList() {
    let list = pool();
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
      <button type="button" class="chip toggle" data-act="fc-shuffle" aria-pressed="${store.fc.shuffle}">Trộn thứ tự</button>
      <button type="button" class="chip toggle" data-act="fc-only" aria-pressed="${store.fc.only}">Chỉ thẻ chưa thuộc</button>
      <button type="button" class="chip" data-act="fc-first">Về thẻ đầu</button>
    </div>`;
    if (!total) {
      box.innerHTML = `<div class="fc-wrap">${ctrl}<div class="fc-empty">${store.fc.only ? 'Bạn đã thuộc hết thẻ của cấp độ đang chọn. Tắt "Chỉ thẻ chưa thuộc" để xem lại toàn bộ.' : 'Chưa có thẻ nào. Hãy chọn ít nhất một cấp YCT ở trên.'}</div></div>`;
      return;
    }
    const c = byId[fcList[store.fc.i]];
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
      <div class="fc-meta"><span>Thẻ <b>${store.fc.i + 1}</b>/${total}</span><span>YCT ${c.lv}</span>${badge(c.id)}${fcJustRated ? `<span class="muted small">${esc(fcJustRated)}</span>` : ''}<span class="fc-keys small">Phím tắt: Space lật thẻ · ← → chuyển thẻ · 1 chưa nhớ · 2 đã nhớ</span></div>
      <button type="button" class="flip${fcBack ? ' is-back' : ''}" data-act="flip" aria-label="Lật thẻ (phím cách)">
        <span class="flip-inner">
          <span class="face front" aria-hidden="${fcBack}">
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
    preload(byId[fcList[store.fc.i + 1]]);
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
    const c = byId[id];
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
  };
  const sessions = {}; // mode -> { items, i, right, log, q, answered }

  function startSession(mode, ids = null) {
    const elig = MODES[mode].eligible();
    const items = ids ? ids.filter((id) => byId[id]) : pickItems(elig, store.len);
    sessions[mode] = { items, i: 0, right: 0, log: [], q: null, answered: false };
    if (items.length) sessions[mode].q = MODES[mode].make(byId[items[0]]);
    preload(byId[items[1]]);
  }
  function renderQuiz(mode) {
    if (!sessions[mode]) startSession(mode);
    const S = sessions[mode];
    const box = $('qz-' + mode);
    if (!S.items.length) {
      box.innerHTML = `<div class="fc-empty">${mode === 'ghep-cau' ? 'Cấp độ đang chọn chưa có câu ví dụ nào để ghép.' : 'Chưa có thẻ nào. Hãy chọn ít nhất một cấp YCT ở trên.'}</div>`;
      return;
    }
    if (S.i >= S.items.length) { renderDone(mode); return; }
    const pct = Math.round((S.i / S.items.length) * 100);
    const top = `<div class="q-top">
        <span>Câu <b>${S.i + 1}</b>/${S.items.length} · Đúng <b>${S.right}</b></span>
        <span class="row">${mode === 'doan-nghia' ? `<button type="button" class="chip toggle" data-act="opt" data-opt="hidePic" aria-pressed="${store.hidePic}" title="Chỉ nhìn chữ, không xem hình">Ẩn hình</button>` : ''}<button type="button" class="linkbtn" data-act="restart" data-mode="${mode}">Làm lượt mới</button></span>
        <div class="q-bar" aria-hidden="true"><i style="width:${pct}%"></i></div>
      </div>`;
    box.innerHTML = top + `<div class="q-card" id="qc-${mode}">${MODES[mode].render(S.q, S)}</div>`;
    if (store.auto && mode === 'doan-nghia' && !S.answered) speak(S.q.c.h);
  }
  function nextQ(mode) {
    const S = sessions[mode];
    if (!S || !S.answered) return;
    S.i += 1;
    S.answered = false;
    if (S.i < S.items.length) {
      S.q = MODES[mode].make(byId[S.items[S.i]]);
      preload(byId[S.items[S.i + 1]]);
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
    const miss = S.log.filter((x) => !x.ok).map((x) => byId[x.id]);
    const msg = p === 100 ? 'Xuất sắc, đúng hết!' : p >= 80 ? 'Rất tốt!' : p >= 50 ? 'Khá rồi, ôn thêm chút nữa nhé.' : 'Cần ôn thêm. Thử chế độ Lật thẻ với các từ sai bên dưới.';
    $('qz-' + mode).innerHTML = `<div class="q-card"><div class="done">
      <div class="score-ring" style="--p:${p}"><span>${S.right}/${n}</span></div>
      <h3>${msg}</h3>
      ${miss.length ? `<div class="miss-list"><p class="muted small">Các từ trả lời sai:</p>${miss.map((c) => `<div class="miss"><img src="${imgUrl(c.id)}" width="320" height="290" alt="" loading="lazy"><div><span class="zh">${esc(c.h)}</span> <span class="py">${esc(c.py)}</span><div class="small">${esc(c.vi)}${c.ex ? ` · <span class="zh">${esc(c.ex)}</span>` : ''}</div></div>${sayBtn(c.h, true)}</div>`).join('')}</div>` : ''}
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
        store.fc.only = false; store.fc.shuffle = false; fcList = null; buildFcList();
        store.fc.i = Math.max(0, fcList.indexOf(b.dataset.id)); fcBack = false;
        showPage('lat-the', { scroll: true });
        break;
      }
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

  /** Phím tắt: chỉ khi mục đang hiện và không gõ trong ô nhập. */
  function onKey(e) {
    if (!host.isConnected || host.offsetParent === null) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.composedPath ? e.composedPath()[0] : e.target;
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
  return { showPage, onKey };
}
