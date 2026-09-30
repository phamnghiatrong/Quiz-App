/* tenses.js - Mục "12 thì tiếng Anh" của Quiz App.
 *
 * Cách hoạt động:
 * - app.js gọi mountTenses(host, nav, { userId }) khi người dùng mở mục này
 *   lần đầu (nạp lười bằng import() nên không làm chậm lúc mở app).
 * - Nội dung được vẽ trong Shadow DOM của `host`: CSS của app không đè vào
 *   được và CSS ở đây cũng không làm vỡ app.
 * - `nav` là thanh chuyển trang con (nằm ngoài Shadow DOM, dùng nút chuẩn
 *   của app để giao diện đồng bộ). Mỗi phần là một trang con riêng.
 * - Tiến độ (câu đã làm, thống kê, sổ lỗi sai) lưu trong localStorage của
 *   trình duyệt, tách riêng theo từng tài khoản.
 *
 * Dữ liệu (lý thuyết, câu hỏi) nằm trong tenses-data.js.
 */

const VERSION = new URL(import.meta.url).search; // ví dụ "?v=20260930-1"
const STORE_PREFIX = 'tenses12-v1';

export const PAGES = [
  { id: 'ban-do', label: 'Bản đồ 12 thì' },
  { id: 'chi-tiet', label: 'Chi tiết từng thì' },
  { id: 'lap-cau', label: 'Máy lắp câu' },
  { id: 'de-nham', label: 'Cặp thì dễ nhầm' },
  { id: 'tra-cuu', label: 'Chính tả & động từ BQT' },
  { id: 'phong-luyen', label: 'Phòng luyện' },
  { id: 'bai-tap', label: 'Bộ đề 49 câu' },
];

let assets = null; // { data, css } - chỉ tải 1 lần
let mounted = null; // { host, key, api }

async function loadAssets() {
  if (assets) return assets;
  const [data, css] = await Promise.all([
    import('./tenses-data.js' + VERSION),
    fetch(new URL('./tenses.css' + VERSION, import.meta.url)).then((r) => {
      if (!r.ok) throw new Error('Không tải được tenses.css (' + r.status + ')');
      return r.text();
    }),
  ]);
  assets = { data, css };
  return assets;
}

/**
 * Gắn mục 12 thì vào trang. Gọi lại nhiều lần cũng được: nếu đã gắn cho
 * đúng tài khoản thì chỉ trả về api cũ; đổi tài khoản thì dựng lại.
 */
export async function mountTenses(host, nav, { userId = null, scrollAnchor = null } = {}) {
  const { data, css } = await loadAssets();
  const key = STORE_PREFIX + (userId ? ':' + userId : '');
  if (mounted && mounted.host === host && mounted.key === key) return mounted.api;
  const api = build({ host, nav, key, data, css, scrollAnchor });
  mounted = { host, key, api };
  return api;
}

/* ====================================================================== */

function build({ host, nav, key, data, css, scrollAnchor }) {
  const { TIMES, ASPECTS, TENSES, CMPS, VERBS, SUBJ, PHRASES, BSIG, DSIG, DTAGS, PARTS } = data;

  const root = host.shadowRoot || host.attachShadow({ mode: 'open' });
  const $ = (id) => root.getElementById(id);

  /* ---------- lưu trạng thái theo người dùng ---------- */
  let store = { ans: {}, checked: {}, tense: 'present-simple', tab: 'drill', level: 'mc', sel: null, drill: null, page: 'ban-do' };
  try {
    const raw = localStorage.getItem(key);
    if (raw) store = Object.assign(store, JSON.parse(raw));
  } catch (e) { /* bỏ qua dữ liệu hỏng */ }
  store.drill = Object.assign({ st: {}, streak: 0, best: 0, wrong: [] }, store.drill || {});
  const D = store.drill;
  function save() {
    try { localStorage.setItem(key, JSON.stringify(store)); } catch (e) { /* hết chỗ / chế độ riêng tư */ }
  }

  /* ---------- tiện ích ---------- */
  const strip = (s) => String(s).replace(/<[^>]+>/g, '');
  const escA = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
  const canSpeak = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
  const SAY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  const sayBtn = (t) => `<button class="say" type="button" data-say="${escA(strip(t))}" aria-label="Nghe phát âm" title="Nghe">${SAY_SVG}</button>`;
  function speak(t) {
    if (!canSpeak) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(t);
      u.lang = 'en-US';
      u.rate = 0.92;
      const vs = speechSynthesis.getVoices();
      const v = vs.find((x) => /^en[-_]US/i.test(x.lang)) || vs.find((x) => /^en/i.test(x.lang));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch (e) { /* trình duyệt không hỗ trợ */ }
  }
  const byId = Object.fromEntries(TENSES.map((t) => [t.id, t]));
  const timeVi = (t) => TIMES.find((x) => x.id === t.time).vi;
  const tenseOpts = TIMES.map((tm) => `<optgroup label="${tm.vi}">` + TENSES.filter((t) => t.time === tm.id).map((t) => `<option value="${t.id}">${t.vi}</option>`).join('') + '</optgroup>').join('');

  /* ---------- khung HTML các trang con ---------- */
  root.innerHTML = `<style>${css}</style>
<div class="tn${canSpeak ? '' : ' no-tts'}">

<section class="page" data-page="ban-do" aria-labelledby="h-ban-do">
  <div class="sec-head">
    <h2 id="h-ban-do">Bản đồ 12 thì</h2>
    <p class="lead">Mọi thì đều được lắp từ hai mảnh: <b>thời</b> (quá khứ, hiện tại, tương lai) quyết định trợ động từ đứng đầu, <b>thể</b> (đơn, tiếp diễn, hoàn thành, hoàn thành tiếp diễn) quyết định phần đuôi. Hàng là thời, cột là thể. Bấm vào một ô để mở trang chi tiết của thì đó.</p>
  </div>
  <div class="legend"><span class="t-past">Quá khứ</span><span class="t-present">Hiện tại</span><span class="t-future">Tương lai</span></div>
  <div class="scroll-x"><div class="matrix" id="matrix"></div></div>
  <div class="build">
    <div class="panel">
      <h3>Công thức lắp ghép</h3>
      <div class="eq"><span>Chủ ngữ</span><span class="plus">+</span><span>trợ động từ theo THỜI</span><span class="plus">+</span><span>đuôi theo THỂ</span></div>
      <dl class="aux">
        <dt class="t-present">Hiện tại</dt><dd>do/does · am/is/are · have/has</dd>
        <dt class="t-past">Quá khứ</dt><dd>did · was/were · had</dd>
        <dt class="t-future">Tương lai</dt><dd>will (+ be / have …)</dd>
      </dl>
      <p style="font-size:15px">Ví dụ với thể <b>hoàn thành tiếp diễn</b> (đuôi <code>have been + V-ing</code>): chỉ cần đổi <code>have</code> theo thời:</p>
      <div class="eq"><span>has/have been working</span><span>had been working</span><span>will have been working</span></div>
      <p class="note">V3 = quá khứ phân từ (cột 3 bảng động từ bất quy tắc, hoặc V-ed với động từ có quy tắc).</p>
    </div>
    <div class="panel">
      <h3>Chọn thì bằng 3 câu hỏi</h3>
      <ol class="steps">
        <li><p><b>Hành động ở thời nào?</b><small>Nhìn dấu hiệu thời gian: yesterday → quá khứ, now → hiện tại, tomorrow → tương lai.</small></p></li>
        <li><p><b>Tại mốc đó, hành động đang dở dang?</b><small>Có → thể tiếp diễn (be + V-ing).</small></p></li>
        <li><p><b>Đã xong, hoặc kéo dài tính đến mốc đó?</b><small>Có → hoàn thành (have + V3). Nhấn mạnh quá trình kéo dài liên tục → hoàn thành tiếp diễn. Không rơi vào trường hợp nào → thể đơn.</small></p></li>
      </ol>
    </div>
  </div>
  <p class="tipbox">Mẹo ôn: mỗi ngày chọn 2 ô trên bản đồ, tự đặt 3 câu về chính bạn (thói quen, việc hôm qua, kế hoạch tuần sau) rồi đối chiếu với phần "Lỗi hay gặp" trong trang chi tiết.</p>
</section>

<section class="page" data-page="chi-tiet" aria-labelledby="h-chi-tiet" hidden>
  <div class="sec-head">
    <h2 id="h-chi-tiet">Chi tiết từng thì</h2>
    <p>Mỗi thì có sơ đồ trục thời gian: vạch <b>NOW</b> là hiện tại, bên trái là quá khứ, bên phải là tương lai. Dấu × là hành động xảy ra một lần, đường lượn sóng là hành động đang kéo dài, đường liền có mũi tên là hành động kéo dài đến một mốc.</p>
  </div>
  <div class="picker" id="picker"></div>
  <article class="detail" id="detail" aria-live="polite"></article>
</section>

<section class="page" data-page="lap-cau" aria-labelledby="h-lap-cau" hidden>
  <div class="sec-head">
    <h2 id="h-lap-cau">Máy lắp câu</h2>
    <p>Chọn chủ ngữ, động từ, thì và dạng câu: trang tự chia động từ theo đúng quy tắc chính tả và tô màu từng mảnh, để thấy trợ động từ (theo thời) và phần đuôi (theo thể) ghép lại thế nào. Muốn thử động từ khác, gõ vào ô bên dưới danh sách.</p>
  </div>
  <div class="builder">
    <div class="panel">
      <div class="ctl"><label for="bSubj">Chủ ngữ</label><select id="bSubj"></select></div>
      <div class="ctl"><label for="bVerb">Động từ</label><select id="bVerb"></select>
        <input type="text" class="itxt" id="bCustom" placeholder="hoặc tự gõ, ví dụ: get up early" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Tự gõ động từ"></div>
      <div class="ctl"><label for="bTense">Thì</label><select id="bTense"></select></div>
      <div class="ctl"><span class="lab">Dạng câu</span>
        <div class="segctl full" role="radiogroup" aria-label="Dạng câu">
          <label><input type="radio" name="bForm" value="+" checked>Khẳng định</label><label><input type="radio" name="bForm" value="−">Phủ định</label><label><input type="radio" name="bForm" value="?">Nghi vấn</label>
        </div></div>
      <label class="check"><input type="checkbox" id="bSig" checked> Thêm dấu hiệu thời gian</label>
    </div>
    <div class="panel bout" id="bOut"></div>
  </div>
  <div class="all12-wrap">
    <h3>Cùng câu đó ở cả 12 thì</h3>
    <p class="note">Bấm một dòng để xem cách lắp của thì đó ở khung phía trên.</p>
    <div class="vwrap" style="max-height:none"><table class="vtable all12" id="b12"></table></div>
  </div>
</section>

<section class="page" data-page="de-nham" aria-labelledby="h-de-nham" hidden>
  <div class="sec-head">
    <h2 id="h-de-nham">Cặp thì dễ nhầm</h2>
    <p>Phần lớn lỗi sai trong bài kiểm tra đến từ những cặp dưới đây. Đọc ví dụ hai bên, rồi nhớ mẹo phân biệt ở cuối mỗi thẻ.</p>
  </div>
  <div class="cmps" id="cmps"></div>
</section>

<section class="page" data-page="tra-cuu" aria-labelledby="h-tra-cuu" hidden>
  <div class="sec-head">
    <h2 id="h-tra-cuu">Chính tả &amp; động từ bất quy tắc</h2>
    <p>Quy tắc thêm đuôi -s/-es, -ed, -ing và cách phát âm; bảng động từ bất quy tắc hay gặp có ô tìm kiếm.</p>
  </div>
  <div class="refgrid">
    <div class="panel rule"><h4>Thêm -s / -es (hiện tại đơn, he/she/it)</h4>
      <ul>
        <li>Thường: thêm <b>-s</b> — work → works, play → plays</li>
        <li>Tận cùng o, s, x, z, ch, sh: thêm <b>-es</b> — go → goes, watch → watches, wash → washes</li>
        <li>Phụ âm + y: đổi <b>y → ies</b> — study → studies, fly → flies</li>
        <li>Đặc biệt: have → <b>has</b></li>
        <li>Phát âm: /s/ sau p, t, k, f, θ (stops) · /ɪz/ sau s, z, ʃ, tʃ, dʒ (watches) · /z/ còn lại (plays)</li>
      </ul></div>
    <div class="panel rule"><h4>Thêm -ed (quá khứ đơn, V3 có quy tắc)</h4>
      <ul>
        <li>Thường: thêm <b>-ed</b> — work → worked</li>
        <li>Tận cùng e: thêm <b>-d</b> — live → lived</li>
        <li>Phụ âm + y: <b>y → ied</b> — study → studied (nhưng play → played)</li>
        <li>1 âm tiết, phụ âm–nguyên âm–phụ âm: <b>gấp đôi</b> — stop → stopped, plan → planned</li>
        <li>Phát âm: /ɪd/ sau t, d (wanted) · /t/ sau p, k, f, s, ʃ, tʃ (stopped, washed) · /d/ còn lại (played)</li>
      </ul></div>
    <div class="panel rule"><h4>Thêm -ing (các thì tiếp diễn)</h4>
      <ul>
        <li>Tận cùng e câm: <b>bỏ e</b> — make → making, write → writing (see → seeing giữ nguyên)</li>
        <li>Tận cùng ie: <b>ie → y</b> — lie → lying, die → dying</li>
        <li>1 âm tiết, phụ âm–nguyên âm–phụ âm: <b>gấp đôi</b> — run → running, swim → swimming</li>
        <li>Không gấp đôi w, x, y: fix → fixing, play → playing</li>
      </ul></div>
    <div class="panel rule"><h4>Động từ trạng thái (không chia tiếp diễn)</h4>
      <ul>
        <li>Nhận thức: know, understand, believe, remember, forget, mean</li>
        <li>Cảm xúc: like, love, hate, want, need, prefer</li>
        <li>Sở hữu, trạng thái: have (sở hữu), own, belong, seem, cost, contain</li>
        <li>Ví dụ: I <b>know</b> the answer now. (không nói: I am knowing)</li>
      </ul></div>
  </div>
  <div class="verbs">
    <div class="verbs-tools">
      <h3>Động từ bất quy tắc hay gặp</h3>
      <input type="search" id="vsearch" placeholder="Tìm: go, went, đi…" aria-label="Tìm động từ" autocomplete="off" autocapitalize="off" spellcheck="false">
      <span id="vcount" class="hint"></span>
    </div>
    <div class="vwrap"><table class="vtable"><thead><tr><th>V1 (nguyên mẫu)</th><th>V2 (quá khứ)</th><th>V3 (phân từ)</th><th>Nghĩa</th></tr></thead><tbody id="vbody"></tbody></table></div>
  </div>
</section>

<section class="page" data-page="phong-luyen" aria-labelledby="h-phong-luyen" hidden>
  <div class="sec-head">
    <h2 id="h-phong-luyen">Phòng luyện</h2>
    <p>Câu hỏi được sinh ngẫu nhiên từ chủ ngữ, động từ và dấu hiệu thời gian nên không bao giờ hết. Trang ghi lại độ chính xác của từng thì và tự ra nhiều câu hơn ở những thì bạn còn yếu.</p>
  </div>
  <div class="panel">
    <div class="mhead"><div style="display:grid;gap:4px"><h3>Độ thành thạo từng thì</h3><p class="note" id="mSum"></p></div><button class="btn" type="button" id="mReset">Xoá thống kê</button></div>
    <div class="mastery" id="mastery"></div>
    <p class="note">Bấm vào một thì để luyện riêng thì đó.</p>
  </div>
  <div class="tabs" role="tablist" aria-label="Chế độ luyện">
    <button class="tab" type="button" role="tab" id="tab-drill" aria-controls="pn-drill" data-tab="drill">Luyện chia động từ</button>
    <button class="tab" type="button" role="tab" id="tab-diagram" aria-controls="pn-diagram" data-tab="diagram">Đọc sơ đồ</button>
    <button class="tab" type="button" role="tab" id="tab-wrong" aria-controls="pn-wrong" data-tab="wrong">Sổ lỗi sai <span id="wCount"></span></button>
  </div>
  <div id="pn-drill" role="tabpanel" aria-labelledby="tab-drill" class="drill">
    <div class="dtools">
      <div class="segctl" role="radiogroup" aria-label="Cách trả lời">
        <label><input type="radio" name="lvl" value="mc">Chọn đáp án</label><label><input type="radio" name="lvl" value="type">Tự gõ</label>
      </div>
      <button class="chip sm" type="button" id="selAll">Chọn cả 12 thì</button>
    </div>
    <div class="chips" id="dFilter" aria-label="Thì đang luyện"></div>
    <div class="qcard" id="dCard"></div>
  </div>
  <div id="pn-diagram" role="tabpanel" aria-labelledby="tab-diagram" hidden>
    <div class="qcard" id="gCard"></div>
  </div>
  <div id="pn-wrong" role="tabpanel" aria-labelledby="tab-wrong" hidden>
    <div class="dacts" style="margin-bottom:12px"><button class="btn primary" type="button" id="wRetry">Luyện lại các câu sai</button><button class="btn" type="button" id="wClear">Xoá sổ</button></div>
    <ul class="wlist" id="wList"></ul>
  </div>
</section>

<section class="page" data-page="bai-tap" aria-labelledby="h-bai-tap" hidden>
  <div class="sec-head">
    <h2 id="h-bai-tap">Bộ đề 49 câu</h2>
    <p>5 phần, 49 câu, từ nhận biết đến viết lại câu. Làm xong bấm <b>Kiểm tra</b> ở từng phần để xem đáp án và giải thích. Bài làm được lưu trên trình duyệt này, lần sau mở lại vẫn còn.</p>
  </div>
  <div class="scorebar">
    <div><div class="total" id="total">0 / 49</div><div class="parts" id="partscores"></div></div>
    <div class="acts"><button class="btn primary" type="button" id="checkAll">Kiểm tra tất cả</button><button class="btn" type="button" id="resetAll">Làm lại từ đầu</button></div>
  </div>
  <div class="partlist" id="parts"></div>
</section>

</div>`;

  /* ====================== ĐIỀU HƯỚNG TRANG CON ======================
   * Khung rộng: hàng nút. Khung hẹp (điện thoại, cửa sổ nhỏ): chỉ hiện 1 nút
   * ghi tên trang đang xem, bấm vào sổ danh sách 7 trang (CSS trong index.html
   * dùng container query trên .tenses-head để đổi giữa 2 kiểu). */
  const pageIds = PAGES.map((p) => p.id);
  const pageLabel = Object.fromEntries(PAGES.map((p) => [p.id, p.label]));
  nav.innerHTML =
    '<button type="button" class="tn-nav-toggle" aria-expanded="false" aria-controls="tensesNavList">' +
      '<span class="tn-nav-toggle-text"><span class="tn-nav-hint">Đang xem</span><span class="tn-nav-current"></span></span>' +
      '<span class="tn-nav-caret" aria-hidden="true">▼</span>' +
    '</button>' +
    '<div class="tn-nav-list" id="tensesNavList">' +
      PAGES.map((p) => `<button type="button" class="tn-nav-btn" data-tn-page="${p.id}">${escA(p.label)}</button>`).join('') +
    '</div>';
  const navToggle = nav.querySelector('.tn-nav-toggle');
  function setNavOpen(open) {
    nav.classList.toggle('is-open', open);
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    navToggle.querySelector('.tn-nav-caret').textContent = open ? '▲' : '▼';
  }
  nav.onclick = (e) => {
    if (e.target.closest('.tn-nav-toggle')) { setNavOpen(!nav.classList.contains('is-open')); return; }
    const b = e.target.closest('[data-tn-page]');
    if (b) { setNavOpen(false); showPage(b.dataset.tnPage, { scroll: true }); }
  };
  // Bấm ra ngoài hoặc nhấn Esc thì đóng menu sổ xuống (chỉ gắn 1 lần).
  if (!nav.dataset.tnBound) {
    nav.dataset.tnBound = '1';
    document.addEventListener('click', (e) => { if (nav.classList.contains('is-open') && !nav.contains(e.target)) setNavOpen(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('is-open')) { setNavOpen(false); navToggle.focus(); } });
  }

  function scrollToTop() {
    const anchor = scrollAnchor || nav;
    const top = anchor.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.5) anchor.scrollIntoView({ block: 'start', behavior: smooth() });
  }

  function showPage(id, { scroll = false } = {}) {
    if (!pageIds.includes(id)) id = 'ban-do';
    const changed = store.page !== id;
    root.querySelectorAll('.page').forEach((s) => { s.hidden = s.dataset.page !== id; });
    nav.querySelectorAll('[data-tn-page]').forEach((b) => {
      const on = b.dataset.tnPage === id;
      if (on) { b.dataset.active = 'true'; b.setAttribute('aria-current', 'page'); }
      else { delete b.dataset.active; b.removeAttribute('aria-current'); }
    });
    nav.querySelector('.tn-nav-current').textContent = `${pageIds.indexOf(id) + 1}/${pageIds.length} · ${pageLabel[id]}`;
    store.page = id;
    save();
    if (scroll) scrollToTop();
    return changed;
  }

  /* ====================== SƠ ĐỒ TRỤC THỜI GIAN ====================== */
  function crossAt(x, y) { return `<path class="tl-mark" stroke-width="2.6" stroke-linecap="round" d="M${x - 6} ${y - 6} L${x + 6} ${y + 6} M${x + 6} ${y - 6} L${x - 6} ${y + 6}"/>`; }
  function timeline(spec) {
    const Y = 62, M = 44;
    let s = '<svg viewBox="0 0 360 96" role="img" aria-label="Sơ đồ trục thời gian">';
    s += `<line class="tl-axis" x1="14" y1="${Y}" x2="340" y2="${Y}" stroke-width="1.5"/>`;
    s += `<path d="M340 ${Y - 5} L348 ${Y} L340 ${Y + 5} Z" style="fill:var(--muted)"/>`;
    s += `<line x1="180" y1="${Y - 8}" x2="180" y2="${Y + 8}" style="stroke:var(--ink)" stroke-width="2"/>`;
    s += `<text class="tl-now" x="180" y="${Y + 24}" text-anchor="middle">NOW</text>`;
    s += `<text class="tl-text" x="70" y="${Y + 24}" text-anchor="middle">Quá khứ</text>`;
    s += `<text class="tl-text" x="290" y="${Y + 24}" text-anchor="middle">Tương lai</text>`;
    for (const m of spec) {
      if (m[0] === 'ref') s += `<line class="tl-ref" x1="${m[1]}" y1="18" x2="${m[1]}" y2="${Y}" stroke-width="1.2"/><text class="tl-reflbl" x="${m[1]}" y="12" text-anchor="middle">${m[2]}</text>`;
    }
    for (const m of spec) {
      const k = m[0];
      if (k === 'x') { s += crossAt(m[1], M); if (m[2]) s += `<text class="tl-reflbl" x="${m[1]}" y="${M - 12}" text-anchor="middle" style="font-weight:700">${m[2]}</text>`; }
      else if (k === 'dots') { const [, a, b, n] = m; for (let i = 0; i < n; i++) s += crossAt(a + (b - a) * i / (n - 1), M); }
      else if (k === 'wave') { const [, a, b] = m; let d = `M${a} ${M}`; const w = 12; for (let x = a; x < b; x += w) { const mid = Math.min(x + w / 2, b), end = Math.min(x + w, b); d += ` Q${x + w / 4} ${M - 7} ${mid} ${M} Q${x + 3 * w / 4} ${M + 7} ${end} ${M}`; } s += `<path class="tl-mark" stroke-width="2.6" stroke-linecap="round" d="${d}"/>`; }
      else if (k === 'bar') { const [, a, b] = m; s += `<line class="tl-mark" x1="${a}" y1="${M}" x2="${b - 6}" y2="${M}" stroke-width="3" stroke-linecap="round"/><path class="tl-fill" d="M${b - 8} ${M - 6} L${b + 2} ${M} L${b - 8} ${M + 6} Z"/>`; }
      else if (k === 'bar0') { const [, a] = m; s += `<circle class="tl-fill" cx="${a}" cy="${M}" r="4"/>`; }
    }
    return s + '</svg>';
  }

  /* ====================== 1. BẢN ĐỒ ====================== */
  let mh = '<div></div>' + ASPECTS.map((a) => `<div class="mh"><b>${a.vi}</b><span>${a.tail}</span></div>`).join('');
  for (const tm of TIMES) {
    mh += `<div class="mrow t-${tm.id}">${tm.vi}</div>`;
    for (let a = 0; a < 4; a++) {
      const t = TENSES.find((x) => x.time === tm.id && x.a === a);
      mh += `<button type="button" class="cell t-${tm.id}" data-open="${t.id}"><span class="vi">${t.vi}</span><span class="en">${t.en}</span><span class="sk">${t.sk}</span></button>`;
    }
  }
  $('matrix').innerHTML = mh;

  /* ====================== 2. CHI TIẾT ====================== */
  const picker = $('picker');
  picker.innerHTML = TIMES.map((tm) => `<div class="pick-row t-${tm.id}"><span class="lbl">${tm.vi}</span>` +
    TENSES.filter((t) => t.time === tm.id).map((t) => `<button type="button" class="chip" data-id="${t.id}" aria-pressed="false">${ASPECTS[t.a].vi}</button>`).join('') + '</div>').join('');
  picker.addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (b) showTense(b.dataset.id); });

  const detail = $('detail');
  function showTense(id) {
    const t = byId[id];
    if (!t) return;
    const i = TENSES.indexOf(t);
    const prev = TENSES[(i + 11) % 12], next = TENSES[(i + 1) % 12];
    detail.className = 'detail t-' + t.time;
    detail.innerHTML = `
    <header class="d-head"><span class="eyebrow">${timeVi(t)} · ${ASPECTS[t.a].vi}</span>
      <h3>${t.vi}<small>${t.en}</small></h3><p>${t.gist}</p></header>
    <div class="d-body">
      <div class="d-top">
        <div>${t.forms.map((f) => `<div class="fblock"><span class="fl">${f.l}</span>${f.r.map((r) => `<div class="frow"><span class="sign">${r[0]}</span><div><div class="f">${r[1]}</div><div class="x">${r[2]} ${sayBtn(r[2])}</div></div></div>`).join('')}</div>`).join('')}</div>
        <figure class="tl">${timeline(t.tl)}<figcaption>${t.cap}</figcaption></figure>
      </div>
      <div class="d-sub"><h4>Cách dùng</h4><div class="uses">${t.uses.map((u) => `<div class="use"><span class="t">${u.t}</span><span class="en">${u.en} ${sayBtn(u.en)}</span><span class="vi">${u.vi}</span></div>`).join('')}</div></div>
      <div class="d-sub"><h4>Dấu hiệu nhận biết</h4><div class="signals">${t.sig.map((s) => `<span>${s}</span>`).join('')}</div></div>
      <div class="d-sub"><h4>Lưu ý</h4><ul class="notes">${t.notes.map((n) => `<li>${n}</li>`).join('')}</ul></div>
      <div class="d-sub"><h4>Lỗi hay gặp</h4><div class="mist">${t.mis.map((m) => `<div class="mrow2"><div class="bad"><span class="k">Sai</span><s>${m[0]}</s></div><div class="good"><span class="k">Đúng</span><span>${m[1]}</span></div></div>`).join('')}</div></div>
    </div>
    <div class="pager"><button type="button" class="btn" data-go="${prev.id}">← ${prev.vi}</button><button type="button" class="btn primary" data-drill="${t.id}">Luyện riêng thì này</button><button type="button" class="btn" data-go="${next.id}">${next.vi} →</button></div>`;
    picker.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', c.dataset.id === id ? 'true' : 'false'));
    store.tense = id;
    save();
  }
  detail.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (!b) return;
    showTense(b.dataset.go);
    if (detail.getBoundingClientRect().top < 0) detail.scrollIntoView({ block: 'start' });
  });

  /* ====================== 4. CẶP DỄ NHẦM ====================== */
  $('cmps').innerHTML = CMPS.map((c) => `<div class="cmp"><h3>${c.h}</h3><div class="sides">${[c.a, c.b].map((s) => `<div class="side t-${s[0]}"><span class="nm">${s[1]}</span><span class="en">${s[2]} ${sayBtn(s[2])}</span><span class="vi">${s[3]}</span></div>`).join('')}</div><p class="tip">${c.tip}</p></div>`).join('');

  /* ====================== 5. ĐỘNG TỪ BẤT QUY TẮC ====================== */
  const vbody = $('vbody'), vcount = $('vcount');
  function renderVerbs(q = '') {
    const n = q.trim().toLowerCase();
    const rows = VERBS.filter((v) => !n || v.some((c) => c.toLowerCase().includes(n)));
    vbody.innerHTML = rows.map((v) => `<tr><td>${v[0]}</td><td>${v[1]}</td><td>${v[2]}</td><td>${v[3]}</td></tr>`).join('') ||
      '<tr><td colspan="4" style="font-family:inherit;color:var(--muted)">Không tìm thấy động từ này trong bảng.</td></tr>';
    vcount.textContent = `${rows.length} / ${VERBS.length} động từ`;
  }
  $('vsearch').addEventListener('input', (e) => renderVerbs(e.target.value));
  renderVerbs();

  /* ====================== BỘ CHIA ĐỘNG TỪ ====================== */
  const IRR = {};
  VERBS.forEach(([b, v2, v3]) => { if (b !== 'be') IRR[b] = { v2: v2.split('/'), v3: v3.split('/') }; });
  const syl = (v) => (v.match(/[aeiouy]+/g) || []).length;
  const cvc = (v) => /[^aeiou][aeiou][^aeiouwxy]$/.test(v);
  const ING_X = { begin: 'beginning', forget: 'forgetting', prefer: 'preferring', admit: 'admitting', be: 'being', see: 'seeing', quit: 'quitting' };
  function ing(v) { if (ING_X[v]) return ING_X[v]; if (/ie$/.test(v)) return v.slice(0, -2) + 'ying'; if (/[^e]e$/.test(v)) return v.slice(0, -1) + 'ing'; if (syl(v) === 1 && cvc(v)) return v + v.slice(-1) + 'ing'; return v + 'ing'; }
  function s3(v) { if (v === 'have') return 'has'; if (/(s|x|z|ch|sh|o)$/.test(v)) return v + 'es'; if (/[^aeiou]y$/.test(v)) return v.slice(0, -1) + 'ies'; return v + 's'; }
  function edReg(v) { if (/e$/.test(v)) return v + 'd'; if (/[^aeiou]y$/.test(v)) return v.slice(0, -1) + 'ied'; if (syl(v) === 1 && cvc(v)) return v + v.slice(-1) + 'ed'; return v + 'ed'; }
  function vf(v) {
    const ir = IRR[v];
    const pref = (a) => { const e = a.filter((x) => /ed$/.test(x)); return e.length ? [...e, ...a.filter((x) => !/ed$/.test(x))] : a; };
    return { s: s3(v), ing: ing(v), v2: ir ? pref(ir.v2) : [edReg(v)], v3: ir ? pref(ir.v3) : [edReg(v)] };
  }
  const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const lowerSubj = (s) => (s === 'I' || s === 'Lan' ? s : s.charAt(0).toLowerCase() + s.slice(1));

  function conj(S, v, tid, form, opt = {}) {
    const t = byId[tid], f = vf(v), p = S.p, time = t.time, a = t.a, alt = opt.alt || 0;
    const pick = (arr) => arr[Math.min(alt, arr.length - 1)];
    let aux = null, tail = [], main, mn;
    if (a === 0) {
      if (time === 'present') { if (form === '+') { main = p === '3' ? f.s : v; mn = p === '3' ? 'V-s/es (thời hiện tại)' : 'V nguyên mẫu'; } else { aux = p === '3' ? 'does' : 'do'; main = v; mn = 'V nguyên mẫu'; } }
      else if (time === 'past') { if (form === '+') { main = pick(f.v2); mn = 'V2/V-ed (thời quá khứ)'; } else { aux = 'did'; main = v; mn = 'V nguyên mẫu'; } }
      else { aux = 'will'; main = v; mn = 'V nguyên mẫu'; }
    } else {
      const be = { present: p === '1' ? 'am' : p === '3' ? 'is' : 'are', past: p === 'pl' ? 'were' : 'was', future: 'will' };
      const hv = { present: p === '3' ? 'has' : 'have', past: 'had', future: 'will' };
      if (a === 1) { aux = be[time]; if (time === 'future') tail = ['be']; main = f.ing; mn = 'V-ing (thể tiếp diễn)'; }
      else if (a === 2) { aux = hv[time]; if (time === 'future') tail = ['have']; main = pick(f.v3); mn = 'V3 (thể hoàn thành)'; }
      else { aux = hv[time]; tail = time === 'future' ? ['have', 'been'] : ['been']; main = f.ing; mn = 'V-ing (thể tiếp diễn)'; }
    }
    const P = [];
    const add = (w, r, n) => P.push({ w, r, n });
    const auxN = 'trợ động từ (thời)', tailN = a === 1 ? 'đuôi thể tiếp diễn' : a === 2 ? 'đuôi thể hoàn thành' : 'đuôi thể HT tiếp diễn';
    if (form === '?') {
      add(opt.lower ? aux : capFirst(aux), 'aux', auxN); add(lowerSubj(S.t), 'subj', 'chủ ngữ');
      if (opt.adv) add(opt.adv, 'adv', 'trạng từ');
      tail.forEach((w) => add(w, 'tail', tailN)); add(main, 'main', mn);
    } else {
      add(opt.lower ? lowerSubj(S.t) : S.t, 'subj', 'chủ ngữ');
      if (aux) add(aux, 'aux', auxN);
      if (form === '−') add('not', 'not', 'phủ định');
      if (opt.adv) add(opt.adv, 'adv', 'trạng từ');
      tail.forEach((w) => add(w, 'tail', tailN)); add(main, 'main', mn);
    }
    return { P };
  }
  function sentence(S, v, rest, tid, form, sig) {
    const pre = (sig && sig.pre) || '';
    const c = conj(S, v, tid, form, { adv: sig && sig.adv, lower: !!pre });
    const post = sig && sig.post ? ' ' + sig.post : '';
    const end = form === '?' ? '?' : '.';
    const text = capFirst(pre + c.P.map((x) => x.w).join(' ') + (rest ? ' ' + rest : '') + post + end);
    return { c, text, pre, rest, post, end };
  }
  function contract(s) { return s.replace(/\bI am not\b/g, "I'm not").replace(/\bwill not\b/g, "won't").replace(/\b(do|does|did|is|are|was|were|have|has|had) not\b/g, "$1n't"); }
  const rnd = (a) => a[Math.floor(Math.random() * a.length)];
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function confusers(tid, n) {
    const t = byId[tid];
    return TENSES.filter((x) => x.id !== tid).map((x) => ({ id: x.id, s: (x.time === t.time ? 2 : 0) + (x.a === t.a ? 2 : 0) + Math.random() * 2.5 }))
      .sort((a, b) => b.s - a.s).slice(0, n).map((x) => x.id);
  }

  /* ====================== 3. MÁY LẮP CÂU ====================== */
  $('bSubj').innerHTML = SUBJ.map((s, i) => `<option value="${i}">${s.t}</option>`).join('');
  $('bVerb').innerHTML = PHRASES.map((p, i) => `<option value="${i}">${p.v} ${p.r}</option>`).join('');
  $('bTense').innerHTML = tenseOpts;
  $('bSubj').value = '2';
  function curB() {
    const S = SUBJ[+$('bSubj').value];
    let v, rest;
    const cu = $('bCustom').value.toLowerCase().replace(/[^a-z' -]/g, ' ').trim();
    if (cu) { const w = cu.split(/\s+/); v = w[0]; rest = w.slice(1).join(' '); }
    else { const ph = PHRASES[+$('bVerb').value]; v = ph.v; rest = ph.r; }
    const tid = $('bTense').value;
    const form = root.querySelector('input[name="bForm"]:checked').value;
    return { S, v, rest, tid, form, useSig: $('bSig').checked };
  }
  function renderBuilder() {
    const B = curB(), t = byId[B.tid], sig = B.useSig ? BSIG[B.tid] : null, s = sentence(B.S, B.v, B.rest, B.tid, B.form, sig);
    const out = $('bOut');
    out.className = 'panel bout t-' + t.time;
    const tailTxt = (((s.rest ? ' ' + s.rest : '') + (s.post || '')).trim() + s.end);
    const pcs = s.c.P.map((x, i) => `<span class="pc ${x.r}"><span class="w">${escA(i === 0 ? capFirst(x.w) : x.w)}</span><span class="l">${x.n}</span></span>`).join('');
    const short = contract(s.text);
    out.innerHTML = `<div class="bhead"><span class="eyebrow">${timeVi(t)} · ${ASPECTS[t.a].vi}</span><h3>${t.vi}<small>${t.en}</small></h3></div>
      <div class="bsent">${pcs}<span class="plain-w">${escA(tailTxt)}</span>${sayBtn(s.text)}</div>
      ${short !== s.text ? `<p class="bshort">Viết tắt: <b>${escA(short)}</b></p>` : ''}
      <p class="bshort">Khung: <code>${t.sk}</code>${sig ? ` · Dấu hiệu: <code>${escA(sig.post)}</code>` : ''}</p>
      <figure class="tl">${timeline(t.tl)}<figcaption>${t.cap}</figcaption></figure>
      <div class="dacts"><button type="button" class="btn" data-open="${t.id}">Xem lý thuyết thì này</button><button type="button" class="btn" data-drill="${t.id}">Luyện riêng thì này</button></div>`;
    $('b12').innerHTML = '<thead><tr><th>Thì</th><th>Câu</th></tr></thead><tbody>' + TENSES.map((x) => {
      const ss = sentence(B.S, B.v, B.rest, x.id, B.form, B.useSig ? BSIG[x.id] : null);
      return `<tr data-t="${x.id}" class="t-${x.time}${x.id === B.tid ? ' on' : ''}"><td><span class="tn">${x.vi}</span></td><td>${escA(ss.text)} ${sayBtn(ss.text)}</td></tr>`;
    }).join('') + '</tbody>';
  }
  ['bSubj', 'bVerb', 'bTense', 'bSig'].forEach((id) => $(id).addEventListener('change', renderBuilder));
  $('bCustom').addEventListener('input', renderBuilder);
  root.querySelectorAll('input[name="bForm"]').forEach((r) => r.addEventListener('change', renderBuilder));
  $('b12').addEventListener('click', (e) => {
    if (e.target.closest('[data-say]')) return;
    const tr = e.target.closest('tr[data-t]');
    if (tr) { $('bTense').value = tr.dataset.t; renderBuilder(); $('bOut').scrollIntoView({ block: 'nearest', behavior: smooth() }); }
  });

  /* ====================== 6. PHÒNG LUYỆN ====================== */
  function makeQ(tid) {
    const sigs = DSIG[tid];
    let form = rnd(['+', '+', '+', '−', '?']);
    let cand = sigs.filter((s) => !s.f || s.f.includes(form));
    if (!cand.length) { form = '+'; cand = sigs.filter((s) => !s.f || s.f.includes('+')); }
    const sig = rnd(cand);
    const tags = sig.tags || DTAGS[tid];
    const ph = rnd(PHRASES.filter((p) => [...tags].some((g) => p.tags.includes(g))));
    return { tid, s: Math.floor(Math.random() * SUBJ.length), v: ph.v, r: ph.r, form, sig };
  }
  function qData(Q) {
    const S = SUBJ[Q.s] || SUBJ[0], sig = Q.sig || {}, lower = !!sig.pre;
    const mk = (tid, alt) => { const c = conj(S, Q.v, tid, Q.form, { adv: sig.adv, lower, alt }); return (Q.form === '?' ? c.P : c.P.filter((x) => x.r !== 'subj')).map((x) => x.w).join(' '); };
    const ans = [];
    [Q.tid, ...(sig.also || [])].forEach((id) => [0, 1].forEach((a) => { const x = mk(id, a); if (!ans.includes(x)) ans.push(x); }));
    const subjT = lower ? lowerSubj(S.t) : S.t;
    const before = capFirst((sig.pre || '') + (Q.form === '?' ? '' : subjT + ' '));
    const after = ' ' + Q.r + (sig.post ? ' ' + sig.post : '') + (Q.form === '?' ? '?' : '.');
    const hv = [];
    if (Q.form === '−') hv.push('not');
    if (Q.form === '?') hv.push(lowerSubj(S.t));
    if (sig.adv) hv.push(sig.adv);
    hv.push(Q.v);
    const accept = Q.form === '?' ? ans : [...ans, ...ans.map((a) => subjT + ' ' + a)];
    return { before, after, hint: hv.join('/'), ans, accept, primary: ans[0], full: capFirst(before + ans[0] + after), mk, sig };
  }
  function record(tid, ok) {
    const s = D.st[tid] || (D.st[tid] = { c: 0, n: 0 });
    s.n++;
    if (ok) { s.c++; D.streak++; D.best = Math.max(D.best, D.streak); } else D.streak = 0;
  }
  function acc(tid) { const s = D.st[tid]; return s && s.n ? s.c / s.n : null; }
  function pickT(ids) {
    const w = ids.map((id) => { const a = acc(id); return a === null ? 2 : 1 + 3 * (1 - a); });
    let r = Math.random() * w.reduce((x, y) => x + y, 0);
    for (let i = 0; i < ids.length; i++) { r -= w[i]; if (r <= 0) return ids[i]; }
    return ids[ids.length - 1];
  }

  let level = store.level === 'type' ? 'type' : 'mc';
  let sel = new Set((store.sel || []).filter((id) => byId[id]));
  if (!sel.size) TENSES.forEach((t) => sel.add(t.id));
  let curQ = null, curD = null, answered = false, reviewQ = [], curOpts = [];

  function renderFilter() { $('dFilter').innerHTML = TENSES.map((t) => `<button type="button" class="chip sm t-${t.time}" data-f="${t.id}" aria-pressed="${sel.has(t.id)}">${t.vi}</button>`).join(''); }
  $('dFilter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    const id = b.dataset.f;
    if (sel.has(id)) { if (sel.size > 1) sel.delete(id); } else sel.add(id);
    store.sel = [...sel]; save(); renderFilter();
    if (curQ && !answered && !curQ.review && !sel.has(curQ.tid)) nextQ();
  });
  $('selAll').addEventListener('click', () => { TENSES.forEach((t) => sel.add(t.id)); store.sel = [...sel]; save(); renderFilter(); });
  root.querySelectorAll('input[name="lvl"]').forEach((r) => {
    r.checked = r.value === level;
    r.addEventListener('change', () => { level = r.value; store.level = level; save(); if (answered) nextQ(); else drawQ(); });
  });

  function drawQ() {
    const d = curD = qData(curQ);
    let h = `<div class="qmeta"><span>${curQ.review ? 'Ôn lại câu sai' : 'Câu hỏi ngẫu nhiên'}</span><span>Chuỗi đúng: <b>${D.streak}</b></span><span>Kỷ lục: ${D.best}</span>${reviewQ.length ? `<span>Còn ${reviewQ.length} câu sai chờ ôn</span>` : ''}</div>`;
    if (level === 'type') {
      h += `<p class="qsent">${escA(d.before)}<input class="blank" id="dIn" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Điền dạng đúng của động từ"> <span class="hint">(${escA(d.hint)})</span>${escA(d.after)}</p>
        <div class="dacts"><button type="button" class="btn primary" id="dGo">Kiểm tra</button><button type="button" class="btn" id="dSkip">Bỏ qua</button><span class="note">Nhấn Enter để kiểm tra, Enter lần nữa để sang câu tiếp.</span></div>`;
    } else {
      const dis = [];
      for (const id of confusers(curQ.tid, 11)) { const x = d.mk(id, 0); if (!d.ans.includes(x) && !dis.includes(x)) dis.push(x); if (dis.length === 3) break; }
      curOpts = shuffle([d.primary, ...dis]);
      h += `<p class="qsent">${escA(d.before)}<span class="gap" aria-label="chỗ trống"></span> <span class="hint">(${escA(d.hint)})</span>${escA(d.after)}</p>
        <div class="dopts" id="dOpts">${curOpts.map((o, k) => `<button type="button" class="dopt" data-o="${k}"><span class="key">${'ABCD'[k]}</span><span>${escA(o)}</span></button>`).join('')}</div>
        <div class="dacts"><button type="button" class="btn" id="dSkip">Bỏ qua</button></div>`;
    }
    h += '<div id="dFb"></div>';
    $('dCard').innerHTML = h;
    if (level === 'type') {
      const i = $('dIn');
      i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (answered) nextQ(true); else grade(i.value); } });
      $('dGo').onclick = () => (answered ? nextQ(true) : grade(i.value));
    }
    $('dSkip').onclick = () => nextQ(true);
  }
  function nextQ(focus) {
    if (reviewQ.length) { curQ = reviewQ.shift(); curQ.review = true; } else curQ = makeQ(pickT([...sel]));
    answered = false;
    drawQ();
    if (focus) { const i = $('dIn'); if (i) i.focus({ preventScroll: true }); }
  }
  $('dCard').addEventListener('click', (e) => { const b = e.target.closest('[data-o]'); if (b && !answered) grade(curOpts[+b.dataset.o], +b.dataset.o); });
  function grade(your, k) {
    if (answered) return;
    your = String(your || '').trim();
    if (level === 'type' && !your) { $('dIn').focus(); return; }
    answered = true;
    const d = curD, tid = curQ.tid, t = byId[tid];
    const ok = level === 'type' ? matches(your, d.accept) : d.ans.includes(your);
    record(tid, ok);
    D.wrong = D.wrong.filter((w) => qData(w.Q).full !== d.full);
    if (!ok) { const Q = { ...curQ }; delete Q.review; D.wrong.unshift({ Q, your }); D.wrong = D.wrong.slice(0, 40); }
    save(); renderMastery(); renderWrong();
    if (level === 'type') $('dIn').classList.add(ok ? 'is-right' : 'is-wrong');
    else root.querySelectorAll('#dOpts [data-o]').forEach((b) => { const o = curOpts[+b.dataset.o]; b.classList.toggle('is-right', d.ans.includes(o)); b.classList.toggle('is-wrong', +b.dataset.o === k && !ok); b.disabled = true; });
    const sigTxt = [d.sig.pre && d.sig.pre.replace(/[,!]\s*$/, '').trim(), d.sig.adv, d.sig.post].filter(Boolean).map((x) => `“${escA(x)}”`).join(' + ');
    const also = (d.sig.also || []).map((id) => byId[id].vi);
    $('dFb').innerHTML = `<div class="dfb ${ok ? 'ok' : 'no'}">
      <p><span class="v">${ok ? 'Đúng rồi.' : 'Chưa đúng.'}</span>${!ok && level === 'type' ? ` Bạn gõ: <s>${escA(your)}</s>.` : ''}${!ok ? ` Đáp án: <b>${escA(d.primary)}</b>` : ''}</p>
      <p class="full">${escA(d.full)} ${sayBtn(d.full)}</p>
      <p>Thì: <button type="button" class="linkbtn" data-open="${tid}">${t.vi}</button>. Dấu hiệu ${sigTxt} → ${t.gist.charAt(0).toLowerCase() + t.gist.slice(1)}</p>
      ${also.length ? `<p class="note">Câu này cũng chấp nhận ${also.join(', ')} vì có for/since.</p>` : ''}
      <figure class="tl t-${t.time}">${timeline(t.tl)}</figure></div>`;
    if (level === 'type') { $('dGo').textContent = 'Câu tiếp'; $('dSkip').hidden = true; }
    else { const n = $('dSkip'); n.textContent = 'Câu tiếp'; n.classList.add('primary'); n.focus({ preventScroll: true }); }
  }

  function renderMastery() {
    let C = 0, N = 0;
    const cells = [];
    for (const tm of TIMES) for (let a = 0; a < 4; a++) {
      const t = TENSES.find((x) => x.time === tm.id && x.a === a), s = D.st[t.id] || { c: 0, n: 0 };
      C += s.c; N += s.n;
      const p = s.n ? Math.round(100 * s.c / s.n) : 0;
      cells.push(`<button type="button" class="mcell t-${t.time}" data-drill="${t.id}" aria-label="Luyện riêng ${t.vi}"><span class="nm">${t.vi}</span><span class="mbar"><i style="width:${p}%"></i></span><span class="st">${s.n ? `${s.c}/${s.n} đúng · ${p}%` : 'Chưa luyện'}</span></button>`);
    }
    $('mastery').innerHTML = cells.join('');
    $('mSum').textContent = N ? `Đã làm ${N} câu, đúng ${Math.round(100 * C / N)}%. Chuỗi đúng dài nhất: ${D.best} câu.` : 'Chưa có dữ liệu. Làm vài câu ở phần luyện bên dưới, các thanh sẽ tự cập nhật.';
  }
  function armBtn(btn, label, fn) {
    let tm = null;
    btn.addEventListener('click', () => {
      if (btn.dataset.arm) { clearTimeout(tm); delete btn.dataset.arm; btn.textContent = label; fn(); }
      else { btn.dataset.arm = '1'; btn.textContent = 'Bấm lần nữa để xác nhận'; tm = setTimeout(() => { delete btn.dataset.arm; btn.textContent = label; }, 3000); }
    });
  }
  armBtn($('mReset'), 'Xoá thống kê', () => { D.st = {}; D.streak = 0; D.best = 0; save(); renderMastery(); if (curQ && !answered) drawQ(); });

  function renderWrong() {
    const W = D.wrong;
    $('wCount').textContent = W.length ? `(${W.length})` : '';
    $('wRetry').disabled = !W.length; $('wClear').disabled = !W.length;
    $('wRetry').textContent = W.length ? `Luyện lại ${W.length} câu sai` : 'Luyện lại các câu sai';
    $('wList').innerHTML = W.length
      ? W.map((w) => { const d = qData(w.Q), t = byId[w.Q.tid]; return `<li><span>${escA(d.full)} ${sayBtn(d.full)}</span><span class="yr">Bạn trả lời: ${escA(w.your || '(trống)')}</span><span>Đáp án: <b class="rt">${escA(d.primary)}</b> · <button type="button" class="linkbtn" data-open="${t.id}">${t.vi}</button></span></li>`; }).join('')
      : '<li class="empty">Chưa có câu sai nào. Câu làm sai ở phần luyện chia động từ sẽ được lưu vào đây để ôn lại.</li>';
  }
  $('wRetry').addEventListener('click', () => {
    if (!D.wrong.length) return;
    reviewQ = D.wrong.map((w) => ({ ...w.Q }));
    setTab('drill'); nextQ(true);
    $('pn-drill').scrollIntoView({ block: 'nearest', behavior: smooth() });
  });
  armBtn($('wClear'), 'Xoá sổ', () => { D.wrong = []; save(); renderWrong(); });

  /* đọc sơ đồ */
  let G = null;
  function nextG() {
    const tid = pickT(TENSES.map((t) => t.id));
    const mode = Math.random() < 0.5 ? 1 : 2;
    G = { tid, mode, opts: shuffle([tid, ...confusers(tid, 3)]), sent: mode === 2 ? qData(makeQ(tid)).full : null, done: false };
    drawG();
  }
  function drawG() {
    const t = byId[G.tid];
    let h = `<div class="qmeta"><span>${G.mode === 1 ? 'Nhìn sơ đồ, chọn thì' : 'Đọc câu, chọn sơ đồ khớp với câu'}</span><span>Chuỗi đúng: <b>${D.streak}</b></span></div>`;
    if (G.mode === 1) {
      h += `<figure class="tl t-neutral" style="max-width:520px">${timeline(t.tl)}</figure>
        <div class="dopts">${G.opts.map((id, k) => `<button type="button" class="dopt" data-g="${k}"><span class="key">${'ABCD'[k]}</span><span>${byId[id].vi}</span></button>`).join('')}</div>`;
    } else {
      h += `<p class="qsent">${escA(G.sent)} ${sayBtn(G.sent)}</p>
        <div class="dopts">${G.opts.map((id, k) => `<button type="button" class="dopt svgopt t-neutral" data-g="${k}" aria-label="Sơ đồ ${'ABCD'[k]}"><span class="key">${'ABCD'[k]}</span>${timeline(byId[id].tl)}</button>`).join('')}</div>`;
    }
    h += '<div id="gFb"></div><div class="dacts"><button type="button" class="btn" id="gNext">Bỏ qua</button></div>';
    $('gCard').innerHTML = h;
    $('gNext').onclick = nextG;
  }
  $('gCard').addEventListener('click', (e) => {
    const b = e.target.closest('[data-g]');
    if (!b || G.done) return;
    const k = +b.dataset.g, pick = G.opts[k], ok = pick === G.tid;
    G.done = true; record(G.tid, ok); save(); renderMastery();
    root.querySelectorAll('#gCard [data-g]').forEach((x) => { const id = G.opts[+x.dataset.g]; x.classList.toggle('is-right', id === G.tid); x.classList.toggle('is-wrong', +x.dataset.g === k && !ok); x.disabled = true; });
    const t = byId[G.tid], pt = byId[pick];
    $('gFb').innerHTML = `<div class="dfb ${ok ? 'ok' : 'no'}"><p><span class="v">${ok ? 'Đúng rồi.' : 'Chưa đúng.'}</span> Đây là <button type="button" class="linkbtn" data-open="${t.id}">${t.vi}</button> (${t.en}): ${t.cap.charAt(0).toLowerCase() + t.cap.slice(1)}</p>${!ok ? `<p class="note">Sơ đồ bạn chọn là ${pt.vi}: ${pt.cap.charAt(0).toLowerCase() + pt.cap.slice(1)}</p>` : ''}</div>`;
    const n = $('gNext'); n.textContent = 'Câu tiếp'; n.classList.add('primary'); n.focus({ preventScroll: true });
  });

  /* tab trong phòng luyện */
  const TABS = ['drill', 'diagram', 'wrong'];
  function setTab(id) {
    if (!TABS.includes(id)) id = 'drill';
    store.tab = id; save();
    root.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === id ? 'true' : 'false'));
    TABS.forEach((p) => { $('pn-' + p).hidden = p !== id; });
  }
  root.querySelector('.tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
  function drillOnly(tid) {
    sel = new Set([tid]); store.sel = [...sel]; save(); renderFilter();
    reviewQ = []; setTab('drill'); nextQ();
    const changed = showPage('phong-luyen');
    if (changed) scrollToTop();
    else $('pn-drill').scrollIntoView({ block: 'start', behavior: smooth() });
  }

  /* hành động chung: nghe, mở chi tiết thì, luyện riêng thì */
  root.addEventListener('click', (e) => {
    const s = e.target.closest('[data-say]');
    if (s) { speak(s.dataset.say); return; }
    const o = e.target.closest('[data-open]');
    if (o) { showTense(o.dataset.open); showPage('chi-tiet', { scroll: true }); return; }
    const d = e.target.closest('[data-drill]');
    if (d) drillOnly(d.dataset.drill);
  });

  /* ====================== 7. BỘ ĐỀ 49 CÂU ====================== */
  function variants(s) {
    s = String(s || '').toLowerCase().replace(/[’‘`´]/g, "'").replace(/[.,!?;:]/g, ' ');
    s = s.replace(/\bwon't\b/g, 'will not').replace(/\bcan't\b/g, 'can not').replace(/\bcannot\b/g, 'can not').replace(/n't\b/g, ' not')
      .replace(/'ll\b/g, ' will').replace(/'m\b/g, ' am').replace(/'re\b/g, ' are').replace(/'ve\b/g, ' have').replace(/'d\b/g, ' had');
    const clean = (x) => x.replace(/\s+/g, ' ').trim();
    if (/'s\b/.test(s)) return [clean(s.replace(/'s\b/g, ' is')), clean(s.replace(/'s\b/g, ' has'))];
    return [clean(s)];
  }
  function matches(input, accepted) { const inV = variants(input); const accS = new Set(accepted.flatMap(variants)); return inV.some((v) => v && accS.has(v)); }

  const partsEl = $('parts');
  function blanks(part) { return part.type === 'passage' ? part.text.filter((x) => typeof x === 'object') : part.items; }

  function renderParts() {
    partsEl.innerHTML = PARTS.map((p) => {
      let body = '';
      if (p.type === 'mc') {
        body = '<ol class="qs">' + p.items.map((it, i) => { const qid = p.id + i; return `<li class="q"><span class="qn">${i + 1}</span><div class="qb"><p class="qtext">${it.q}</p><div class="opts">${it.o.map((o, k) => `<label class="opt" data-q="${qid}" data-k="${k}"><input type="radio" name="${qid}" id="${qid}_${k}" value="${k}"><span class="key">${'ABCD'[k]}</span><span>${o}</span></label>`).join('')}</div><div class="fb" id="fb_${qid}" hidden></div></div></li>`; }).join('') + '</ol>';
      } else if (p.type === 'fill') {
        body = '<ol class="qs">' + p.items.map((it, i) => { const qid = p.id + i; const inp = `<input class="blank" id="${qid}" data-q="${qid}" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Câu ${i + 1}">`; return `<li class="q"><span class="qn">${i + 1}</span><div class="qb"><p class="qtext">${it.q.replace('___', inp)} <span class="hint">(${it.h})</span></p><div class="fb" id="fb_${qid}" hidden></div></div></li>`; }).join('') + '</ol>';
      } else if (p.type === 'err') {
        body = '<ol class="qs">' + p.items.map((it, i) => { const qid = p.id + i; return `<li class="q"><span class="qn">${i + 1}</span><div class="qb"><div class="segs">${it.p.map((w, k) => `<label class="seg" data-q="${qid}" data-k="${k}"><input type="radio" name="${qid}" id="${qid}_${k}" value="${k}"><span class="w">${w}</span><span class="l">${'ABCD'[k]}</span></label>`).join('')}</div><div class="fb" id="fb_${qid}" hidden></div></div></li>`; }).join('') + '</ol>';
      } else if (p.type === 'passage') {
        let n = 0;
        body = '<p class="passage">' + p.text.map((x) => { if (typeof x === 'string') return x; const qid = p.id + n; n++; return `<span class="pn">(${n})</span><input class="blank" id="${qid}" data-q="${qid}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${x.h}" aria-label="Chỗ trống ${n}: ${x.h}">`; }).join('') +
          '</p><div class="pfb">' + blanks(p).map((x, i) => `<div class="fb" id="fb_${p.id + i}" hidden></div>`).join('') + '</div>';
      } else if (p.type === 'rewrite') {
        body = '<ol class="qs">' + p.items.map((it, i) => { const qid = p.id + i; return `<li class="q"><span class="qn">${i + 1}</span><div class="qb"><p class="qtext">${it.q}</p><input class="txt" id="${qid}" data-q="${qid}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${escA(it.lead)}" aria-label="Viết lại câu ${i + 1}"><div class="fb" id="fb_${qid}" hidden></div></div></li>`; }).join('') + '</ol>';
      }
      return `<div class="part" id="part_${p.id}"><div class="part-h"><div><h3>${p.title}</h3><p>${p.desc}</p></div><div class="pact"><span class="ps" id="ps_${p.id}"></span><button type="button" class="btn primary" data-check="${p.id}">Kiểm tra</button></div></div>${body}</div>`;
    }).join('');

    // khôi phục bài đang làm dở
    for (const [qid, v] of Object.entries(store.ans)) {
      const r = $(qid + '_' + v);
      if (r && r.type === 'radio') { r.checked = true; continue; }
      const t = $(qid);
      if (t && t.tagName === 'INPUT') t.value = v;
    }
    for (const pid of Object.keys(store.checked)) if (store.checked[pid]) checkPart(pid);
    updateTotal();
  }
  partsEl.addEventListener('change', (e) => { const el = e.target; if (el.type === 'radio') { store.ans[el.name] = el.value; save(); } });
  partsEl.addEventListener('input', (e) => { const el = e.target; if (el.dataset && el.dataset.q && el.tagName === 'INPUT' && el.type !== 'radio') { store.ans[el.dataset.q] = el.value; save(); } });
  partsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-check]'); if (b) checkPart(b.dataset.check); });

  function scoreOf(p) {
    const items = blanks(p);
    let c = 0;
    items.forEach((it, i) => {
      const v = store.ans[p.id + i];
      if (p.type === 'mc' || p.type === 'err') { if (v !== undefined && +v === it.a) c++; }
      else if (v && matches(v, it.a)) c++;
    });
    return [c, items.length];
  }
  function checkPart(pid) {
    const p = PARTS.find((x) => x.id === pid);
    if (!p) return;
    blanks(p).forEach((it, i) => {
      const qid = p.id + i, v = store.ans[qid], fb = $('fb_' + qid);
      let ok = false, ansText = '';
      if (p.type === 'mc' || p.type === 'err') {
        ok = v !== undefined && +v === it.a;
        root.querySelectorAll(`[data-q="${qid}"][data-k]`).forEach((l) => { const k = +l.dataset.k; l.classList.toggle('is-right', k === it.a); l.classList.toggle('is-wrong', v !== undefined && k === +v && k !== it.a); });
        ansText = p.type === 'mc' ? `${'ABCD'[it.a]}. ${it.o[it.a]}` : `${'ABCD'[it.a]} — sửa: ${it.fix}`;
      } else {
        ok = !!v && matches(v, it.a);
        const inp = $(qid);
        inp.classList.toggle('is-right', ok); inp.classList.toggle('is-wrong', !ok);
        ansText = it.a.slice(0, p.type === 'rewrite' ? 2 : 3).join(' / ');
      }
      const num = p.type === 'passage' ? `(${i + 1}) ` : '';
      fb.hidden = false;
      fb.className = 'fb ' + (ok ? 'ok' : 'no');
      fb.innerHTML = ok
        ? `${num}<span class="v">Đúng.</span> ${p.type === 'err' ? 'Sửa: ' + it.fix + '. ' : ''}${it.why}`
        : `${num}<span class="v">${v === undefined || v === '' ? 'Chưa làm.' : 'Chưa đúng.'}</span> Đáp án: <b>${ansText}</b>. ${it.why}`;
    });
    const [c, n] = scoreOf(p);
    $('ps_' + pid).textContent = `${c}/${n}`;
    store.checked[pid] = true; save(); updateTotal();
  }
  function updateTotal() {
    let tc = 0, tn = 0;
    const bits = [];
    PARTS.forEach((p) => {
      const [c, n] = scoreOf(p);
      tn += n;
      if (store.checked[p.id]) { tc += c; bits.push(`<span>${p.id}: ${c}/${n}</span>`); } else bits.push(`<span>${p.id}: –/${n}</span>`);
    });
    $('total').textContent = `${tc} / ${tn} câu đúng`;
    $('partscores').innerHTML = bits.join('');
  }
  $('checkAll').addEventListener('click', () => PARTS.forEach((p) => checkPart(p.id)));
  armBtn($('resetAll'), 'Làm lại từ đầu', () => { store.ans = {}; store.checked = {}; save(); renderParts(); scrollToTop(); });

  /* ====================== KHỞI TẠO ====================== */
  renderParts();
  showTense(byId[store.tense] ? store.tense : 'present-simple');
  renderBuilder();
  renderFilter(); renderMastery(); renderWrong();
  setTab(store.tab);
  nextQ(); nextG();
  showPage(store.page);

  return { showPage };
}
