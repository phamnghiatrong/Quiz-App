import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL as DEFAULT_SUPABASE_URL, SUPABASE_ANON_KEY as DEFAULT_SUPABASE_ANON_KEY } from './config.js';
import {
  captchaEnabled,
  createCaptcha,
  isCaptchaError,
  CAPTCHA_REQUIRED_MESSAGE,
  CAPTCHA_FAILED_MESSAGE,
} from './captcha.js?v=20260927-1';

const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};

const APP_NAME = "Quiz App"; // New: Global app name
const SUPABASE_URL = (env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = (env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY || '').trim();

const configError = !SUPABASE_URL || !SUPABASE_ANON_KEY
  ? 'Thiếu biến môi trường VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY. Vui lòng cập nhật file config.js hoặc biến môi trường trước khi đăng nhập.'
  : SUPABASE_ANON_KEY.includes('service_role')
    ? 'Khóa Supabase đang dùng là service_role key. Vui lòng dùng VITE_SUPABASE_ANON_KEY (khóa công khai) cho ứng dụng này.'
    : ''; // Updated message below

const supabase = configError
  ? null
  : createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
      },
    });
const LEGACY_QUIZ_DRAFT_KEY = 'politics_quiz_draft';
const QUIZ_DRAFT_PREFIX = 'quiz-progress';


const elements = {
    sidebar: document.getElementById('sidebar'),
  sidebarToggle: document.getElementById('sidebarToggle'),
  sidebarItems: document.querySelectorAll('.sidebar-item[data-nav]'),

  authSection: document.getElementById('authSection'),
  dashboardSection: document.getElementById('dashboardSection'),
  quizSection: document.getElementById('quizSection'),


  homeView: document.getElementById('homeView'),
  lessonSelect: document.getElementById('lessonSelect'),

    accountView: document.getElementById('accountView'),
  accountName: document.getElementById('accountName'),
  accountEmail: document.getElementById('accountEmail'),
  accountMessage: document.getElementById('accountMessage'),

  editNameBtn: document.getElementById('editNameBtn'),
  editNameForm: document.getElementById('editNameForm'),
  newNameInput: document.getElementById('newNameInput'),
  saveNameBtn: document.getElementById('saveNameBtn'),
  cancelNameBtn: document.getElementById('cancelNameBtn'),

  authForm: document.getElementById('authForm'),
  authSubmitBtn: document.getElementById('authSubmitBtn'),
  fullNameInput: document.getElementById('fullNameInput'),
  fullNameLabel: document.getElementById('fullNameLabel'),
  emailInput: document.getElementById('emailInput'),
  passwordInput: document.getElementById('passwordInput'),
  confirmPasswordInput: document.getElementById('confirmPasswordInput'),
  confirmPasswordLabel: document.getElementById('confirmPasswordLabel'),
  authMessage: document.getElementById('authMessage'),
  forgotPasswordBtn: document.getElementById('forgotPasswordBtn'),
  forgotPasswordForm: document.getElementById('forgotPasswordForm'),
  forgotEmailInput: document.getElementById('forgotEmailInput'),
  sendResetBtn: document.getElementById('sendResetBtn'),
  cancelResetBtn: document.getElementById('cancelResetBtn'),


  userBadge: document.getElementById('userBadge'),
  userEmail: document.getElementById('userEmail'),
  logoutBtn: document.getElementById('logoutBtn'),

    modeChips: document.querySelectorAll('.mode-chip'),
    modeCards: document.querySelectorAll('.mode-card'),
    examStartBtn: document.getElementById('examStartBtn'),
    practiceContinueBtn: document.getElementById('practiceContinueBtn'),
    examContinueBtn: document.getElementById('examContinueBtn'),
    retryWrongBtn: document.getElementById('retryWrongBtn'),



  historyCard: document.getElementById('historyCard'),
  historyTableBody: document.getElementById('historyTableBody'),
  refreshHistoryBtn: document.getElementById('refreshHistoryBtn'),

  leaderboardCard: document.getElementById('leaderboardCard'),
  leaderboardTableBody: document.getElementById('leaderboardTableBody'),
  refreshLeaderboardBtn: document.getElementById('refreshLeaderboardBtn'),

  classCard: document.getElementById('classCard'),
  classContent: document.getElementById('classContent'),

  tensesView: document.getElementById('tensesView'),
  tensesNav: document.getElementById('tensesNav'),
  tensesHost: document.getElementById('tensesHost'),
  chineseView: document.getElementById('chineseView'),
  chineseNav: document.getElementById('chineseNav'),
  chineseHost: document.getElementById('chineseHost'),

  quizTitle: document.getElementById('quizTitle'),
  timerBadge: document.getElementById('timerBadge'),
  pauseBtn: document.getElementById('pauseBtn'),
  quizStatus: document.getElementById('quizStatus'),
    quizCard: document.getElementById('quizCard'),
  prevQuestionBtn: document.getElementById('prevQuestionBtn'),
  nextQuestionBtn: document.getElementById('nextQuestionBtn'),
  submitQuizBtn: document.getElementById('submitQuizBtn'),


  aboutCard: document.getElementById('aboutCard'),
  appInfoCard: document.getElementById('appInfoCard'),

  feedbackSection: document.getElementById('feedbackSection'),
    feedbackInput: document.getElementById('feedbackInput'),
  sendFeedbackBtn: document.getElementById('sendFeedbackBtn'),

  // New: Home view cards
  subjectSelectionCard: null,
  quizStartCard: null,
  selectedSubjectTitle: null,
  changeSubjectBtn: null,
  confirmSubjectBtn: null,
  announcementCard: null,
  reviewCard: null,

  // Mobile menu elements (created dynamically)
  mobileMenu: document.getElementById('mobileMenu'),
  mobileMenuToggle: document.getElementById('mobileMenuToggle'),
  mobileMenuPanel: document.getElementById('mobileMenuPanel'),
  mobileUserBadge: null,
  mobileUserEmail: null,
  mobileLogoutBtn: null,
};


let authMode = 'login';

// Ô xác minh chống bot (Turnstile/hCaptcha) - xem captcha.js
const captchas = {};
function getCaptcha(slotId) {
  if (!captchas[slotId]) {
    const slot = document.getElementById(slotId);
    if (!slot) return null;
    captchas[slotId] = createCaptcha(slot);
  }
  return captchas[slotId];
}

function showCaptcha(slotId) {
  if (!captchaEnabled) return;
  getCaptcha(slotId)?.ensure();
}

// Trả về token captcha, '' nếu captcha đang tắt, hoặc null nếu người dùng chưa tích.
function readCaptchaToken(slotId, report) {
  if (!captchaEnabled) return '';
  const captcha = getCaptcha(slotId);
  const token = captcha?.getToken() || '';
  if (!token) {
    report(CAPTCHA_REQUIRED_MESSAGE, 'error');
    captcha?.ensure();
    return null;
  }
  return token;
}

function resetCaptcha(slotId) {
  if (!captchaEnabled) return;
  captchas[slotId]?.reset();
}
let currentMode = null;
let currentView = 'auth';
let currentUserId = null; // Dùng để tách bài đang làm theo từng tài khoản
let selectedSubjectSlug = null; // Môn đang được click trên UI
let confirmedSubjectSlug = null; // Môn đã được xác nhận


// Lesson filter state
let selectedLesson = 'all';
let questionLessons = [];
let lessonsLoading = false;
let lessonsError = '';

// New: Subjects state
const FALLBACK_SUBJECTS = [
    { id: 'chinh-tri-id', name: 'Chính Trị', slug: 'chinh-tri' },
    { id: 'tieng-anh-1-id', name: 'Tiếng Anh 1', slug: 'tieng-anh-1' },
    { id: 'tieng-anh-2-id', name: 'Tiếng Anh 2', slug: 'tieng-anh-2' },
    { id: 'phap-luat-id', name: 'Pháp Luật', slug: 'phap-luat' },
    { id: 'co-so-du-lieu-id', name: 'Cơ Sở Dữ Liệu', slug: 'co-so-du-lieu' },
    { id: 'ky-nang-mem-id', name: 'Kỹ Năng Mềm', slug: 'ky-nang-mem' },
    { id: 'mang-cap-quang-id', name: 'Mạng Cáp Quang', slug: 'mang-cap-quang' },
];
let availableSubjects = [];

const LAST_WRONG_KEY = 'politics_last_wrong'; // Keep existing key for compatibility
const SIDEBAR_COLLAPSED_KEY = 'politics_sidebar_collapsed'; // Keep existing key for compatibility



let questionCount = 0;
let durationMinutes = 0;
let questions = [];
let currentQuestionIndex = 0;
let selectedAnswers = [];
let answeredState = [];
let quizStartTime = 0;
let timerId = null;
let totalDurationSeconds = 0;
let isLoading = false;
let loadError = '';
let isPaused = false;
let leaderboardData = [];

// quiz mode: practice | exam_30 | exam_70
let quizMode = null;

// chọn đề thi thử (chỉ set khi click ô 30/70, chưa bắt đầu làm bài)
let selectedExamType = null;

// draft/paused quiz (đọc từ localStorage qua loadDraft)
let pausedQuizDraft = null;



function isInteractionLocked() {
  // Chỉ khóa tương tác khi đang pause ở chế độ thi thử (practice không dùng pause/timer)
  return Boolean(isPaused) && quizMode !== 'practice';
}

function isValidUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Chuyển ký tự đặc biệt của HTML thành entity trước khi ghép vào innerHTML.
 * BẮT BUỘC dùng cho mọi dữ liệu lấy từ Supabase (tên người dùng, nội dung câu
 * hỏi, tên môn...). Nếu không, một người dùng chỉ cần đổi tên hiển thị thành
 * một đoạn thẻ HTML là có thể chèn mã chạy trong trình duyệt của người khác.
 */
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


function ensureVersionFooterPlacement() {
  const versionFooter = document.getElementById('versionFooter');
  const appShell = document.querySelector('.app-shell');
  const appFrame = document.querySelector('.app-frame');

  if (!versionFooter || !appShell || !appFrame) return;

  // Thêm class riêng để style căn giữa theo toàn bộ layout
  versionFooter.classList.add('app-footer-version');

  // Nếu đang nằm trong cột nội dung bên phải (.app-content), đưa ra ngoài để căn giữa toàn trang
  const isInsideAppContent = Boolean(versionFooter.closest('.app-content'));
  if (!isInsideAppContent) return;

  // Đặt xuống cuối app-shell (sau app-frame) để không bị căn theo cột phải
  appShell.appendChild(versionFooter);
}


function setStatus(message, variant = 'info') {
  elements.authMessage.textContent = message || '';
  elements.authMessage.className = `status-text ${variant}`;
  if (variant === 'error' && elements.authSection && elements.authSection.hidden) {
    alert(message);
  }
}

function setAccountStatus(message, variant = 'info') {
  if (!elements.accountMessage) return;
  elements.accountMessage.textContent = message || '';
  elements.accountMessage.className = `status-text ${variant}`;
}

function ensureForgotPasswordUI() {
  const authSection = elements.authSection;
  if (!authSection) return;

  if (document.getElementById('forgotPasswordBtn')) {
    elements.forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
    elements.forgotPasswordForm = document.getElementById('forgotPasswordForm');
    elements.forgotEmailInput = document.getElementById('forgotEmailInput');
    elements.sendResetBtn = document.getElementById('sendResetBtn');
    elements.cancelResetBtn = document.getElementById('cancelResetBtn');
    return;
  }

  const row = document.createElement('div');
  row.className = 'forgot-password-row';

  const btn = document.createElement('button');
  btn.id = 'forgotPasswordBtn';
  btn.type = 'button';
  btn.className = 'ghost-btn';
  btn.textContent = 'Quên mật khẩu?';

  row.appendChild(btn);

  const form = document.createElement('div');
  form.id = 'forgotPasswordForm';
  form.className = 'auth-form';
  form.hidden = true;
  form.innerHTML = `
    <label for="forgotEmailInput">Email</label>
    <input id="forgotEmailInput" type="email" placeholder="you@example.com" />
    <div id="forgotCaptcha" class="captcha-slot" hidden></div>
    <div class="inline-actions">
      <button id="sendResetBtn" class="primary-btn" type="button">Gửi email đặt lại</button>
      <button id="cancelResetBtn" class="ghost-btn" type="button">Hủy</button>
    </div>
  `;

  // chèn dưới form đăng nhập
  const authForm = elements.authForm;
  if (authForm?.parentNode) {
    authForm.parentNode.insertBefore(row, elements.authMessage);
    authForm.parentNode.insertBefore(form, elements.authMessage);
  }

  elements.forgotPasswordBtn = btn;
  elements.forgotPasswordForm = form;
  elements.forgotEmailInput = form.querySelector('#forgotEmailInput');
  elements.sendResetBtn = form.querySelector('#sendResetBtn');
  elements.cancelResetBtn = form.querySelector('#cancelResetBtn');
}

function ensureAccountPasswordUI() {
  const accountView = elements.accountView;
  if (!accountView) return;

  if (document.getElementById('changePasswordCard')) {
    elements.accountMessage = document.getElementById('accountMessage');
    return;
  }

  // Nếu container chưa được cấu hình dạng lưới, ta nhóm nội dung tài khoản lại thành 1 card
  if (!accountView.dataset.cardified) {
    accountView.dataset.cardified = 'true';
    accountView.style.display = 'grid';
    accountView.style.gap = '22px';

    const profileCard = document.createElement('div');
    profileCard.className = 'panel dashboard-card';
    while (accountView.firstChild) {
      profileCard.appendChild(accountView.firstChild);
    }
    accountView.appendChild(profileCard);
  }

  const toggleContainer = document.createElement('div');
  toggleContainer.style.textAlign = 'center';
  
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'ghost-btn';
  toggleBtn.type = 'button';
  toggleBtn.textContent = 'Đổi mật khẩu';
  toggleContainer.appendChild(toggleBtn);

  accountView.appendChild(toggleContainer);

  const passCard = document.createElement('div');
  passCard.id = 'changePasswordCard';
  passCard.className = 'panel dashboard-card';
  passCard.hidden = true;
  passCard.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
      <h2 style="margin: 0;">Đổi mật khẩu</h2>
      <button id="cancelChangePasswordBtn" class="ghost-btn" type="button" style="min-height: 32px; padding: 4px 12px;">Đóng</button>
    </div>
    <p class="muted-text" style="margin-bottom: 16px;">Tạo mật khẩu mới cho tài khoản của bạn. Mật khẩu tối thiểu 6 ký tự.</p>
    <p id="accountMessage" class="status-text" aria-live="polite"></p>
    <div id="changePasswordForm" class="auth-form">
      <label for="oldPasswordAccount">Mật khẩu cũ</label>
      <input id="oldPasswordAccount" type="password" placeholder="••••••••" />

      <label for="newPasswordAccount">Mật khẩu mới</label>
      <input id="newPasswordAccount" type="password" placeholder="••••••••" />

      <label for="confirmPasswordAccount">Nhập lại mật khẩu mới</label>
      <input id="confirmPasswordAccount" type="password" placeholder="••••••••" />

      <div id="changePasswordCaptcha" class="captcha-slot" hidden></div>

      <button id="changePasswordBtn" class="primary-btn" type="button">Lưu thay đổi</button>
    </div>
  `;

  accountView.appendChild(passCard);
  elements.accountMessage = passCard.querySelector('#accountMessage');

  toggleBtn.addEventListener('click', () => {
    toggleContainer.hidden = true;
    passCard.hidden = false;
    showCaptcha('changePasswordCaptcha');
  });

  const cancelBtn = passCard.querySelector('#cancelChangePasswordBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      passCard.hidden = true;
      toggleContainer.hidden = false;
      const a = document.getElementById('newPasswordAccount');
      const b = document.getElementById('confirmPasswordAccount');
      const c = document.getElementById('oldPasswordAccount');
      if (a) a.value = '';
      if (b) b.value = '';
      if (c) c.value = '';
      if (elements.accountMessage) elements.accountMessage.textContent = '';
    });
  }
}



function toggleForgotPassword() {
  if (!elements.forgotPasswordForm) return;
  const willShow = elements.forgotPasswordForm.hidden;
  elements.forgotPasswordForm.hidden = !willShow;
  if (willShow && elements.forgotEmailInput) {
    elements.forgotEmailInput.value = elements.emailInput?.value?.trim() || '';
    elements.forgotEmailInput.focus();
  }
  if (willShow) showCaptcha('forgotCaptcha');
}

function cancelForgotPassword() {
  if (!elements.forgotPasswordForm) return;
  elements.forgotPasswordForm.hidden = true;
}

async function sendResetEmail() {
  if (configError) {
    setStatus(configError, 'error');
    return;
  }

  const email = (elements.forgotEmailInput?.value || elements.emailInput?.value || '').trim();
  if (!email) {
    setStatus('Vui lòng nhập email.', 'error');
    return;
  }

  const captchaToken = readCaptchaToken('forgotCaptcha', setStatus);
  if (captchaToken === null) return;

  if (elements.sendResetBtn) elements.sendResetBtn.disabled = true;
  try {
        const recoveryUrl = new URL(
      './reset-password.html',
      window.location.href
    ).href;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: recoveryUrl,
      ...(captchaToken ? { captchaToken } : {}),
    });
    if (error) throw error;

    setStatus('Đã gửi email đặt lại mật khẩu. Hãy mở email mới nhất và nhấn liên kết để tạo mật khẩu mới.', 'success');
    cancelForgotPassword();
  } catch (error) {
    console.error(error);
    setStatus(
      isCaptchaError(error)
        ? CAPTCHA_FAILED_MESSAGE
        : (error.message || 'Không thể gửi email đặt lại mật khẩu.'),
      'error'
    );
  } finally {
    resetCaptcha('forgotCaptcha');
    if (elements.sendResetBtn) elements.sendResetBtn.disabled = false;
  }
}

function showPasswordRecoveryModal() {
  if (document.getElementById('passwordRecoveryModal')) return;

  const backdrop = document.createElement('div');
  backdrop.id = 'passwordRecoveryModal';
  backdrop.className = 'modal-backdrop';

  const card = document.createElement('div');
  card.className = 'modal-card';
  card.innerHTML = `
    <h3>Đặt lại mật khẩu</h3>
    <p class="muted-text">Nhập mật khẩu mới để hoàn tất.</p>

    <div class="auth-form">
      <label for="recoveryNewPassword">Mật khẩu mới</label>
      <input
        id="recoveryNewPassword"
        type="password"
        placeholder="••••••••"
        autocomplete="new-password"
      />

      <label for="recoveryConfirmPassword">Nhập lại mật khẩu mới</label>
      <input
        id="recoveryConfirmPassword"
        type="password"
        placeholder="••••••••"
        autocomplete="new-password"
      />

      <div class="inline-actions">
        <button id="recoverySaveBtn" class="primary-btn" type="button">
          Lưu mật khẩu
        </button>
        <button id="recoveryCancelBtn" class="ghost-btn" type="button">
          Để sau
        </button>
      </div>

      <p id="recoveryMessage" class="status-text" aria-live="polite"></p>
    </div>
  `;

  backdrop.appendChild(card);
  document.body.appendChild(backdrop);

  const saveBtn = card.querySelector('#recoverySaveBtn');
  const cancelBtn = card.querySelector('#recoveryCancelBtn');
  const messageEl = card.querySelector('#recoveryMessage');
  const newPasswordInput = card.querySelector('#recoveryNewPassword');
  const confirmPasswordInput = card.querySelector('#recoveryConfirmPassword');

  const setRecoveryMessage = (message, variant = 'info') => {
    if (!messageEl) return;
    messageEl.textContent = message || '';
    messageEl.className = `status-text ${variant}`;
  };

  const cleanRecoveryUrl = () => {
    window.history.replaceState(
      {},
      document.title,
      window.location.pathname
    );
  };

  const close = () => {
    backdrop.remove();
  };

  window.setTimeout(() => {
    newPasswordInput?.focus();
  }, 0);

  cancelBtn?.addEventListener('click', async () => {
    cancelBtn.disabled = true;

    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (error) {
      console.warn('[Password recovery] Không thể đăng xuất phiên khôi phục:', error);
    }

    cleanRecoveryUrl();
    close();
    updateUserUI(null);
    setView('auth');
    setStatus(
      'Bạn chưa đổi mật khẩu. Có thể yêu cầu gửi lại email khi cần.',
      'info'
    );
  });

  saveBtn?.addEventListener('click', async () => {
    if (configError) {
      setRecoveryMessage(configError, 'error');
      return;
    }

    const p1 = (newPasswordInput?.value || '').trim();
    const p2 = (confirmPasswordInput?.value || '').trim();

    if (p1.length < 6) {
      setRecoveryMessage('Mật khẩu tối thiểu 6 ký tự.', 'error');
      newPasswordInput?.focus();
      return;
    }

    if (p1 !== p2) {
      setRecoveryMessage('Mật khẩu nhập lại không khớp.', 'error');
      confirmPasswordInput?.focus();
      return;
    }

    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    setRecoveryMessage('Đang cập nhật mật khẩu...', 'info');

    try {
      const { error } = await supabase.auth.updateUser({
        password: p1,
      });

      if (error) throw error;

      cleanRecoveryUrl();

      // Chỉ đăng xuất phiên khôi phục trên thiết bị hiện tại.
      await supabase.auth.signOut({ scope: 'local' });

      close();
      updateUserUI(null);
      setView('auth');
      setStatus(
        'Đã đổi mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.',
        'success'
      );
    } catch (error) {
      console.error('[Password recovery] Không thể đổi mật khẩu:', error);
      setRecoveryMessage(
        error?.message || 'Không thể đổi mật khẩu. Vui lòng yêu cầu email mới.',
        'error'
      );
      saveBtn.disabled = false;
      cancelBtn.disabled = false;
    }
  });
}

async function changePasswordFromAccount() {
  if (configError) {
    setAccountStatus(configError, 'error');
    return;
  }

  const old = (document.getElementById('oldPasswordAccount')?.value || '').trim();
  const p1 = (document.getElementById('newPasswordAccount')?.value || '').trim();
  const p2 = (document.getElementById('confirmPasswordAccount')?.value || '').trim();

  if (!old) {
    setAccountStatus('Vui lòng nhập mật khẩu cũ.', 'error');
    return;
  }
  if (p1.length < 6) {
    setAccountStatus('Mật khẩu tối thiểu 6 ký tự.', 'error');
    return;
  }
  if (p1 !== p2) {
    setAccountStatus('Mật khẩu nhập lại không khớp.', 'error');
    return;
  }

  // Bước kiểm tra mật khẩu cũ dùng signInWithPassword, nên cũng phải qua captcha
  const captchaToken = readCaptchaToken('changePasswordCaptcha', setAccountStatus);
  if (captchaToken === null) return;

  setAccountStatus('Đang xác thực...', 'info');

  try {
    // Xác thực mật khẩu cũ bằng cách thử đăng nhập lại với chính email đang dùng
    const { data: userData } = await supabase.auth.getUser();
    const email = userData?.user?.email;
    if (!email) throw new Error('Không tìm thấy thông tin phiên đăng nhập.');

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: old,
      ...(captchaToken ? { options: { captchaToken } } : {}),
    });
    resetCaptcha('changePasswordCaptcha');
    if (signInError) {
      throw new Error(isCaptchaError(signInError) ? CAPTCHA_FAILED_MESSAGE : 'Mật khẩu cũ không chính xác.');
    }

    // Nếu thành công, tiến hành lưu mật khẩu mới
    const { error } = await supabase.auth.updateUser({ password: p1 });
    if (error) throw error;

    setAccountStatus('Đã đổi mật khẩu.', 'success');
    const a = document.getElementById('newPasswordAccount');
    const b = document.getElementById('confirmPasswordAccount');
    const c = document.getElementById('oldPasswordAccount');
    if (a) a.value = '';
    if (b) b.value = '';
    if (c) c.value = '';
  } catch (error) {
    console.error(error);
    resetCaptcha('changePasswordCaptcha');
    setAccountStatus(error.message || 'Không thể đổi mật khẩu.', 'error');
  }
}


function setTempButtonLabel(button, label, timeoutMs = 2000) {
  if (!button) return;
  const original = button.dataset.originalLabel || button.textContent || '';
  if (!button.dataset.originalLabel) button.dataset.originalLabel = original;
  button.textContent = label;
  window.setTimeout(() => {
    if (button.textContent === label) {
      button.textContent = button.dataset.originalLabel || original;
    }
  }, timeoutMs);
}



function showSection(sectionName) {
  const resolved = sectionName || 'none';
  elements.authSection.hidden = resolved !== 'auth';
  elements.dashboardSection.hidden = resolved !== 'dashboard';
  elements.quizSection.hidden = resolved !== 'quiz';
  if (resolved === 'auth') showCaptcha('authCaptcha');

  if (elements.sidebar) {
    elements.sidebar.hidden = false; // Luôn hiện thanh menu
  }

  if (elements.mobileMenu) {
    elements.mobileMenu.hidden = false; // Luôn hiện thanh menu mobile
  }

  if (elements.pauseBtn) {
    elements.pauseBtn.hidden = resolved !== 'quiz';
  }

  if (elements.timerBadge) {
    elements.timerBadge.hidden = resolved !== 'quiz';
  }

  if (elements.mobileMenuToggle) {
    elements.mobileMenuToggle.hidden = false; // Luôn hiện nút menu
  }
}

function setDashboardContainerMode(mode) {
  if (!elements.dashboardSection) return;

  const isHome = mode === 'home';
  const isAccount = mode === 'account';

  if (isHome || isAccount) {
    // Home và Account cần tách thành các card riêng -> bỏ panel ở container cha
    elements.dashboardSection.classList.remove('panel');
    elements.dashboardSection.style.background = 'transparent';
    elements.dashboardSection.style.border = 'none';
    elements.dashboardSection.style.boxShadow = 'none';
    elements.dashboardSection.style.padding = '0';
  } else {
    // Các view khác (Lịch sử/BXH) vẫn dùng panel như cũ
    elements.dashboardSection.classList.add('panel');
    elements.dashboardSection.style.background = '';
    elements.dashboardSection.style.border = '';
    elements.dashboardSection.style.boxShadow = '';
    elements.dashboardSection.style.padding = '';
  }
}


function setView(viewKey) {
  const isAuthed = !elements.userBadge.hidden;
  const requiresAuth = ['home', 'account', 'history', 'leaderboard', 'classes', 'tenses', 'chinese'].includes(viewKey);

  let targetView = viewKey;
  if (requiresAuth && !isAuthed) {
    targetView = 'auth'; // Chuyển hướng người dùng chưa đăng nhập về màn hình auth
  }

  currentView = targetView;

  // Update active state in sidebar
  document.querySelectorAll('.sidebar-item[data-nav]').forEach(item => {
    item.classList.toggle('active', item.dataset.nav === targetView);
  });
  // Also handle user badge for 'account' view
  if (elements.userBadge) {
    elements.userBadge.classList.toggle('active', targetView === 'account');
  }

  // reset: hide everything first
  if (elements.homeView) elements.homeView.hidden = true;
  if (elements.accountView) elements.accountView.hidden = true;
  if (elements.historyCard) elements.historyCard.hidden = true;
  if (elements.leaderboardCard) elements.leaderboardCard.hidden = true;
  if (elements.classCard) elements.classCard.hidden = true;
  if (elements.tensesView) elements.tensesView.hidden = true;
  if (elements.chineseView) elements.chineseView.hidden = true;
  if (elements.aboutCard) elements.aboutCard.hidden = true;
  if (elements.appInfoCard) elements.appInfoCard.hidden = true;
  if (elements.feedbackSection) elements.feedbackSection.hidden = true;

  if (elements.editNameForm) elements.editNameForm.hidden = true;

  switch (targetView) {
    case 'home':
      setDashboardContainerMode('home');
      showSection('dashboard');
      if (elements.homeView) elements.homeView.hidden = false;
      loadSubjects(); // New: Load subjects for home view
      if (confirmedSubjectSlug) {
        loadLessons();
      }
      syncPausedQuizButtons();
      break;


    case 'account':
      setDashboardContainerMode('account');
      showSection('dashboard');
      if (elements.accountView) elements.accountView.hidden = false;
      break;
    case 'history':
      setDashboardContainerMode('default');
      showSection('dashboard');
      if (elements.historyCard) elements.historyCard.hidden = false;
      loadHistory();
      updateRetryWrongButton();
      break;
    case 'leaderboard':
      setDashboardContainerMode('default');
      showSection('dashboard');
      if (elements.leaderboardCard) elements.leaderboardCard.hidden = false;
      loadLeaderboard();
      break;
    case 'classes':
      setDashboardContainerMode('default');
      showSection('dashboard');
      if (elements.classCard) elements.classCard.hidden = false;
      // Nếu đã được yêu cầu mở sẵn màn "tham gia lớp" kèm mã mời (từ link
      // ?join=CODE) thì giữ nguyên, không reset về danh sách lớp.
      if (classState.screen === 'join' && classState.joinCodePrefill) {
        renderClassScreen();
      } else {
        classState.screen = 'list';
        classSetMessage('');
        loadMyClasses();
      }
      break;
    case 'tenses':
      setDashboardContainerMode('default');
      showSection('none');
      if (elements.tensesView) elements.tensesView.hidden = false;
      openTenses();
      break;
    case 'chinese':
      setDashboardContainerMode('default');
      showSection('none');
      if (elements.chineseView) elements.chineseView.hidden = false;
      openChinese();
      break;
    case 'author':
      setDashboardContainerMode('default');
      showSection('none');
      if (elements.aboutCard) elements.aboutCard.hidden = false;
      break;
    case 'feedback':
      setDashboardContainerMode('default');
      showSection('none');
      if (elements.feedbackSection) elements.feedbackSection.hidden = false;
      break;
    case 'aboutApp':
      setDashboardContainerMode('default');
      showSection('none');
      if (elements.appInfoCard) elements.appInfoCard.hidden = false;
      break;
    case 'auth':
    default:
      setDashboardContainerMode('default');
      showSection('auth');
      break;
  }
}



// Mục "12 thì tiếng Anh": module tenses/ chỉ được tải khi người dùng mở mục
// này lần đầu (không làm chậm lúc vào app). Tiến độ học lưu theo từng tài
// khoản nên truyền currentUserId; đổi tài khoản thì module tự dựng lại.
// Nhớ tăng ?v= bên dưới mỗi khi sửa file trong thư mục tenses/.
const TENSES_MODULE_URL = './tenses/tenses.js?v=20260930-3';
let tensesModulePromise = null;

async function openTenses() {
  const { tensesHost, tensesNav, tensesView } = elements;
  if (!tensesHost || !tensesNav) return;
  try {
    if (!tensesModulePromise) tensesModulePromise = import(TENSES_MODULE_URL);
    const mod = await tensesModulePromise;
    await mod.mountTenses(tensesHost, tensesNav, {
      userId: currentUserId,
      scrollAnchor: tensesView,
    });
  } catch (error) {
    console.error('[tenses] Không tải được mục 12 thì:', error);
    tensesModulePromise = null; // cho phép thử lại ở lần bấm sau
    if (!tensesHost.shadowRoot) {
      tensesHost.innerHTML =
        '<p class="status-text error">Không tải được mục 12 thì tiếng Anh. Kiểm tra kết nối mạng rồi bấm lại vào mục này trên menu.</p>';
    }
  }
}

// Mục "Tiếng Trung YCT" (học từ vựng bằng thẻ, thư mục chinese/): nạp lười
// giống mục 12 thì. Tiến độ từng thẻ lưu theo tài khoản (currentUserId).
// Nhớ tăng ?v= bên dưới mỗi khi sửa chinese.js / chinese-data.js / chinese.css.
const CHINESE_MODULE_URL = './chinese/chinese.js?v=20261003-1';
let chineseModulePromise = null;

async function openChinese() {
  const { chineseHost, chineseNav, chineseView } = elements;
  if (!chineseHost || !chineseNav) return;
  try {
    if (!chineseModulePromise) chineseModulePromise = import(CHINESE_MODULE_URL);
    const mod = await chineseModulePromise;
    await mod.mountChinese(chineseHost, chineseNav, {
      userId: currentUserId,
      scrollAnchor: chineseView,
    });
  } catch (error) {
    console.error('[chinese] Không tải được mục Tiếng Trung YCT:', error);
    chineseModulePromise = null; // cho phép thử lại ở lần bấm sau
    if (!chineseHost.shadowRoot) {
      chineseHost.innerHTML =
        '<p class="status-text error">Không tải được mục Tiếng Trung YCT. Kiểm tra kết nối mạng rồi bấm lại vào mục này trên menu.</p>';
    }
  }
}

function setSidebarCollapsed(collapsed) {
  if (!elements.sidebar) return;
  elements.sidebar.classList.toggle('is-collapsed', Boolean(collapsed));
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0'); // For app.js's getSidebarCollapsed
  localStorage.setItem('sidebarCollapsed', collapsed ? 'true' : 'false'); // For ui-final-fix.js
  // cập nhật biểu tượng mũi tên
  updateHomeCaret();
}

function updateHomeCaret() {
  const caret = document.querySelector('#sidebarToggle .sidebar-caret');
  const label = document.querySelector('#sidebarToggle .sidebar-label');
  const toggle = document.getElementById('sidebarToggle');
  if (!elements.sidebar) return;

  const collapsed = elements.sidebar.classList.contains('is-collapsed');

  // Khi sidebar đang mở: caret hướng vào trong (‹) để gợi ý "thu gọn".
  // Khi sidebar đang thu gọn: caret hướng ra ngoài (›) để gợi ý "mở rộng".
  if (caret) caret.textContent = collapsed ? '›' : '‹';
  if (label) label.textContent = collapsed ? 'Mở rộng menu' : 'Thu gọn menu';
  if (toggle) toggle.title = collapsed ? 'Mở rộng menu' : 'Thu gọn menu';
}

function getSidebarCollapsed() {
  const raw = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
  if (raw === null) return null;
  return raw === '1';
}

function isQuizVisible() {
  return !elements.quizSection.hidden;
}

function scrollToTarget(targetEl) {
  if (!targetEl) return;
  targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function navigateFromSidebar(navKey) {
  const isAuthed = !elements.userBadge.hidden;

    if (isQuizVisible() && questions.length) {
    // Không hiện hộp thoại trình duyệt: tự lưu bài và chuyển trang bình thường
    pauseQuiz();
  }


  setView(navKey);

  // scroll after view is visible
  if (navKey === 'home') {
    scrollToTarget(isAuthed ? elements.dashboardSection : elements.authSection);
  } else if (navKey === 'account') {
    scrollToTarget(isAuthed ? elements.accountView : elements.authSection);
  } else if (navKey === 'history') {
    scrollToTarget(isAuthed ? elements.historyCard : elements.authSection);
  } else if (navKey === 'leaderboard') {
    scrollToTarget(isAuthed ? elements.leaderboardCard : elements.authSection);
  } else if (navKey === 'classes') {
    scrollToTarget(isAuthed ? elements.classCard : elements.authSection);
  } else if (navKey === 'tenses') {
    scrollToTarget(isAuthed ? elements.tensesView : elements.authSection);
  } else if (navKey === 'chinese') {
    scrollToTarget(isAuthed ? elements.chineseView : elements.authSection);
  } else if (navKey === 'author') {
    scrollToTarget(elements.aboutCard);
  } else if (navKey === 'feedback') {
    scrollToTarget(elements.feedbackSection);
  } else if (navKey === 'aboutApp') {
    scrollToTarget(elements.appInfoCard);
  }
}


function setAuthMode(mode) {

  authMode = mode;
  if (elements.forgotPasswordBtn) {
    elements.forgotPasswordBtn.hidden = mode !== 'login';
  }
  if (elements.forgotPasswordForm) {
    elements.forgotPasswordForm.hidden = true;
  }

  elements.modeChips.forEach((chip) => chip.classList.toggle('active', chip.dataset.authMode === mode));
  elements.authSubmitBtn.textContent = mode === 'register' ? 'Đăng ký' : 'Đăng nhập';

  const isRegister = mode === 'register';
  if (elements.fullNameInput && elements.fullNameLabel) {
    elements.fullNameInput.hidden = !isRegister;
    elements.fullNameLabel.hidden = !isRegister;
    elements.fullNameInput.required = isRegister;
    if (!isRegister) elements.fullNameInput.value = '';
  }

  elements.confirmPasswordInput.hidden = !isRegister;
  elements.confirmPasswordLabel.hidden = !isRegister;

  const confirmToggleBtn = document.querySelector('[data-password-toggle="confirmPasswordInput"]');
  if (confirmToggleBtn) confirmToggleBtn.hidden = !isRegister;

  if (!isRegister) {
    elements.confirmPasswordInput.value = '';
    elements.confirmPasswordInput.type = 'password';
    if (confirmToggleBtn) {
      confirmToggleBtn.setAttribute('aria-pressed', 'false');
      confirmToggleBtn.setAttribute('aria-label', 'Hiện mật khẩu nhập lại');
    }
  }
}


function updateUserUI(session) {
  const user = session?.user;
  currentUserId = user?.id || null;

  if (user) {
    elements.userBadge.hidden = false;
    if (elements.mobileUserBadge) elements.mobileUserBadge.hidden = false;
    elements.userEmail.textContent = 'Đang tải...';
    if (elements.mobileUserEmail) elements.mobileUserEmail.textContent = 'Đang tải...';
    elements.logoutBtn.hidden = false;
    if (elements.mobileLogoutBtn) elements.mobileLogoutBtn.hidden = false;

    document.querySelectorAll('.sidebar-item[data-nav="auth"]').forEach(btn => btn.hidden = true);
  } else {
    elements.userBadge.hidden = true;
    if (elements.mobileUserBadge) elements.mobileUserBadge.hidden = true;
    elements.logoutBtn.hidden = true;
    if (elements.mobileLogoutBtn) elements.mobileLogoutBtn.hidden = true;

    document.querySelectorAll('.sidebar-item[data-nav="auth"]').forEach(btn => btn.hidden = false);
  }
}


async function ensureProfileForSession(session) {
  if (configError) return;
  const user = session?.user;
  if (!user) return;

  try {
    const { data: existing, error } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;

    const existingName = (existing?.full_name || '').trim();
    const displayName = existingName || user.email || 'Người dùng';

    elements.userEmail.textContent = displayName;
    // New: Update mobile user email
    if (elements.mobileUserEmail) elements.mobileUserEmail.textContent = displayName;
    if (elements.accountName) elements.accountName.textContent = displayName;
    if (elements.accountEmail) elements.accountEmail.textContent = user.email || '';

    if (elements.newNameInput) {
      elements.newNameInput.value = existingName || '';
    }
  } catch (error) {
    console.warn('Không thể tải profiles:', error);
    const fallback = session?.user?.email || 'Người dùng';
    elements.userEmail.textContent = fallback;
    if (elements.accountName) elements.accountName.textContent = fallback;
    // New: Update mobile user email
    if (elements.mobileUserEmail) elements.mobileUserEmail.textContent = fallback;
    if (elements.accountEmail) elements.accountEmail.textContent = session?.user?.email || '';
    if (elements.newNameInput) elements.newNameInput.value = '';
  }
}



async function loadLessons() {
  if (!elements.lessonSelect) return;
  if (configError) return;

  lessonsLoading = true;
  lessonsError = '';

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session?.user) {
      questionLessons = [];
      elements.lessonSelect.innerHTML = '';
      lessonsLoading = false;
      return;
    }

    const { data, error } = await supabase.rpc('get_lessons', { p_subject_slug: confirmedSubjectSlug }); // Updated RPC call
    if (error) {
      console.error('[loadLessons] rpc error:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
            lessonsError = error.message || 'Không thể tải danh sách bài/phần.';
      questionLessons = [];
      elements.lessonSelect.innerHTML = '<option value="all">Tất cả bài/phần</option>';
      elements.lessonSelect.value = 'all';
      selectedLesson = 'all';
      setStatus('Không thể tải danh sách bài/phần: ' + lessonsError, 'error');
      return;

    }

    questionLessons = Array.isArray(data) ? data : [];

    const current = elements.lessonSelect.value || selectedLesson || 'all';

    const options = [
      { value: 'all', label: 'Tất cả bài/phần' },
      ...questionLessons.map((row) => ({
        value: row.lesson,
        label: `${row.lesson} (${row.question_count} câu)`,
      })),
    ];

    elements.lessonSelect.innerHTML = options
      .map((opt) => `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</option>`)
      .join('');

    if (options.some((o) => o.value === current)) {
      elements.lessonSelect.value = current;
    } else {
      elements.lessonSelect.value = 'all';
    }

    selectedLesson = elements.lessonSelect.value || 'all';
  } catch (error) {
    console.error('[loadLessons] unexpected error:', {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    });
        lessonsError = error?.message || 'Không thể tải danh sách bài/phần.';
    questionLessons = [];
    elements.lessonSelect.innerHTML = '<option value="all">Tất cả bài/phần</option>';
    elements.lessonSelect.value = 'all';
    selectedLesson = 'all';
    setStatus('Không thể tải danh sách bài/phần: ' + lessonsError, 'error');

  
  } finally {
    lessonsLoading = false;
  }
}

function ensureMobileMenuUI() {
  const frame = document.querySelector('.app-frame');
  const content = document.querySelector('.app-content');
  if (!frame || !content) return;

  

  // Create once
  if (elements.mobileMenu) { // Check elements.mobileMenu instead of document.getElementById
    elements.mobileMenu = document.getElementById('mobileMenu');
    elements.mobileMenuToggle = document.getElementById('mobileMenuToggle');
    elements.mobileMenuPanel = document.getElementById('mobileMenuPanel');
    return;
  }

  const wrap = document.createElement('div');
  wrap.id = 'mobileMenu';
  wrap.className = 'mobile-menu';

  const toggle = document.createElement('button');
  toggle.id = 'mobileMenuToggle';
  toggle.className = 'mobile-menu-toggle sidebar-item';
  toggle.type = 'button'; // New: Ensure button type
  toggle.innerHTML = '<span class="sidebar-icon">☰</span><span class="sidebar-label">Menu</span><span class="sidebar-caret" aria-hidden="true">▼</span>';

  const panel = document.createElement('div');
  panel.id = 'mobileMenuPanel';
  panel.className = 'mobile-menu-panel';

 const items = Array.from(document.querySelectorAll('.sidebar-item[data-nav]'))
  .filter((btn) => {
    const nav = btn.dataset.nav || '';
    const label = btn.querySelector('.sidebar-label')?.textContent?.trim() || '';

    return (
      nav &&
      nav !== 'account' &&
      nav !== 'auth' &&
      btn.id !== 'sidebarToggle' &&
      btn.id !== 'mobileMenuToggle' &&
      !btn.classList.contains('sidebar-toggle') &&
      !label.includes('Mở rộng menu') &&
      !label.includes('Thu gọn menu')
    );
  });

  items.forEach((src) => {
    const btn = document.createElement('button');
    btn.className = 'sidebar-item';
    btn.type = 'button';
    btn.dataset.nav = src.dataset.nav || '';
    btn.title = src.title || '';

    // Dùng innerHTML (không phải textContent) để giữ được icon dạng SVG
    // như "Lớp học", "12 thì tiếng Anh". Nội dung lấy từ markup tĩnh của sidebar.
    const icon = src.querySelector('.sidebar-icon')?.innerHTML || '';
    const label = src.querySelector('.sidebar-label')?.textContent || '';
    btn.innerHTML = `<span class="sidebar-icon">${icon}</span><span class="sidebar-label">${label}</span>`;

    btn.addEventListener('click', () => {
      navigateFromSidebar(btn.dataset.nav);
      // close after navigate
      wrap.classList.remove('open');
      const caret = toggle.querySelector('.sidebar-caret');
      if (caret) caret.textContent = '▼';
    });

    panel.appendChild(btn);
  });

  // Add separator and footer items
  const footerContainer = document.createElement('div');
  footerContainer.className = 'sidebar-footer'; // Use same class for potential styling
  footerContainer.style.marginTop = '10px';
  footerContainer.style.paddingTop = '10px';
  footerContainer.style.borderTop = '1px solid var(--line)';

  // User badge for mobile
  const userBadgeMobile = document.createElement('button');
  userBadgeMobile.className = 'sidebar-item';
  userBadgeMobile.type = 'button';
  userBadgeMobile.title = 'Tài khoản';
  userBadgeMobile.innerHTML = `<span class="sidebar-icon">👤</span><span class="sidebar-label" id="mobileUserEmail"></span>`;
  userBadgeMobile.hidden = true;
  userBadgeMobile.addEventListener('click', () => {
    navigateFromSidebar('account');
    wrap.classList.remove('open'); // Close menu on nav
    const caret = toggle.querySelector('.sidebar-caret');
    if (caret) caret.textContent = '▼';
  });

  // Logout button for mobile
  const logoutBtnMobile = document.createElement('button');
  logoutBtnMobile.className = 'sidebar-item';
  logoutBtnMobile.type = 'button';
  logoutBtnMobile.title = 'Đăng xuất';
  logoutBtnMobile.innerHTML = `<span class="sidebar-icon">⎋</span><span class="sidebar-label">Đăng xuất</span>`;
  logoutBtnMobile.hidden = true;
  logoutBtnMobile.addEventListener('click', handleLogout);

  footerContainer.appendChild(userBadgeMobile);
  footerContainer.appendChild(logoutBtnMobile);
  panel.appendChild(footerContainer);
  // Xóa nút thu gọn/mở rộng sidebar desktop nếu bị copy nhầm vào mobile menu
Array.from(panel.querySelectorAll('.sidebar-item')).forEach((btn) => {
  const label = btn.querySelector('.sidebar-label')?.textContent?.trim() || '';

  if (
    btn.id === 'sidebarToggle' ||
    btn.classList.contains('sidebar-toggle') ||
    label.includes('Mở rộng menu') ||
    label.includes('Thu gọn menu')
  ) {
    btn.remove();
  }
});

  toggle.addEventListener('click', () => {
    wrap.classList.toggle('open');
    const caret = toggle.querySelector('.sidebar-caret');
    if (caret) caret.textContent = wrap.classList.contains('open') ? '▲' : '▼';
  });

  wrap.appendChild(toggle);
  wrap.appendChild(panel); // Panel is inside the wrap
const appShell = document.querySelector('.app-shell');
const appFrame = document.querySelector('.app-frame');

if (appShell && appFrame) {
  appShell.insertBefore(wrap, appFrame);
} else if (appShell) {
  appShell.prepend(wrap);
}
  elements.mobileMenu = wrap;
  elements.mobileMenuToggle = toggle;
  elements.mobileMenuPanel = panel;
  elements.mobileUserBadge = userBadgeMobile;
  elements.mobileUserEmail = userBadgeMobile.querySelector('#mobileUserEmail');
  elements.mobileLogoutBtn = logoutBtnMobile;
}

function setupHomeViewLayout() {
  if (!elements.homeView) return;

  elements.homeView.innerHTML = ''; // Clear existing content
  elements.homeView.className = 'home-content-grid'; // Apply grid for home view

  // Subject Selection Card (main content)
  const subjectSelectionCard = document.createElement('div');
  subjectSelectionCard.className = 'panel hero-card';
  subjectSelectionCard.innerHTML = `
      <h2 class="subject-page-title">Môn học</h2>
      <p class="muted-text">Chọn môn học bạn muốn ôn tập hoặc thi thử.</p>
      <div class="subject-grid-final"></div>
      <div class="action-button-row">
          <button id="confirmSubjectBtn" class="primary-btn" type="button" disabled>Xác nhận chọn môn</button>
      </div>
  `;
  elements.homeView.appendChild(subjectSelectionCard);
  elements.subjectSelectionCard = subjectSelectionCard;
  elements.subjectGrid = subjectSelectionCard.querySelector('.subject-grid-final');
  elements.confirmSubjectBtn = subjectSelectionCard.querySelector('#confirmSubjectBtn');

  // Quiz Start Card
  const quizStartCard = document.createElement('div');
  quizStartCard.className = 'panel hero-card';
  quizStartCard.hidden = true; // Ẩn mặc định khi chưa xác nhận môn học
  quizStartCard.innerHTML = `
      <div class="section-header" style="margin-bottom: 16px;">
        <div>
          <p class="eyebrow">LÀM BÀI</p>
          <h2 id="selectedSubjectTitle">Bắt đầu ôn tập</h2>
        </div>
        <button id="changeSubjectBtn" class="ghost-btn" type="button">Đổi môn</button>
      </div>
      <p class="muted-text">Chọn bài/phần và chế độ để bắt đầu.</p>
      <div class="lesson-filter">
          <label for="lessonSelect">Bài / Phần</label>
          <select id="lessonSelect"></select>
      </div>
      <div class="action-button-row">
          <button id="practiceStartBtn" class="primary-btn" type="button">Bắt đầu luyện tập</button>
          <button id="practiceContinueBtn" class="ghost-btn" type="button" hidden>Tiếp tục</button>
      </div>
      <div class="mode-grid-exam">
          <button class="mode-card" data-mode="30" data-time="20" type="button">
              <strong>30 câu</strong>
              <span>20 phút</span>
          </button>
          <button class="mode-card" data-mode="70" data-time="60" type="button">
              <strong>70 câu</strong>
              <span>60 phút</span>
          </button>
      </div>
      <div class="action-button-row">
          <button id="examStartBtn" class="primary-btn" type="button">Bắt đầu thi thử</button>
          <button id="examContinueBtn" class="ghost-btn" type="button" hidden>Tiếp tục</button>
      </div>
  `;
  elements.homeView.appendChild(quizStartCard);
  elements.quizStartCard = quizStartCard;
  elements.selectedSubjectTitle = quizStartCard.querySelector('#selectedSubjectTitle');
  elements.changeSubjectBtn = quizStartCard.querySelector('#changeSubjectBtn');
  elements.lessonSelect = quizStartCard.querySelector('#lessonSelect');
  elements.practiceStartBtn = quizStartCard.querySelector('#practiceStartBtn');
  elements.practiceContinueBtn = quizStartCard.querySelector('#practiceContinueBtn');
  elements.modeCards = quizStartCard.querySelectorAll('.mode-card'); // These are for exam modes
  elements.examStartBtn = quizStartCard.querySelector('#examStartBtn');
  elements.examContinueBtn = quizStartCard.querySelector('#examContinueBtn');


 
// Announcement Card
const announcementCard = document.createElement('div');
announcementCard.className = 'panel info-card announcement-card';

announcementCard.innerHTML = `
  <h2>Thông báo từ nhà phát triển</h2>

  <p
    class="muted-text"
    style="
      display: block;
      width: 100%;
      margin: 0;
      text-align: justify;
      text-align-last: left;
      line-height: 1.7;
      word-spacing: normal;
    "
  >
    ${APP_NAME} Chúc mọi người học tốt và thi tốt. Nếu phát hiện sai đáp án hay vấn đề gì, các bạn có thể 
    gửi phản hồi về cho nhà phát triển thông qua email. Xin cảm ơn.
  </p>
`;

elements.homeView.appendChild(announcementCard);
elements.announcementCard = announcementCard;



  // Review Card
const reviewCard = document.createElement('div');
reviewCard.className = 'panel info-card review-section';

reviewCard.innerHTML = `
  <h2>Đánh giá từ người học</h2>

  <div class="review-grid">
    <article class="review-item">
      <p class="review-content">
        “Giao diện dễ nhìn, thao tác chọn môn nhanh và thuận tiện.”
      </p>
      <p class="review-student">
        Sinh viên đến từ Khoa Công nghệ Thông tin
      </p>
    </article>

    <article class="review-item">
      <p class="review-content">
        “Ứng dụng phù hợp để ôn tập và kiểm tra kiến thức trước kỳ thi.”
      </p>
      <p class="review-student">
        Sinh viên đến từ Khoa Điện – Điện tử
      </p>
    </article>

    <article class="review-item">
      <p class="review-content">
        “Mong ứng dụng tiếp tục bổ sung thêm nhiều môn học trong thời gian tới.”
      </p>
      <p class="review-student">
        Sinh viên đến từ Khoa Kinh tế
      </p>
    </article>
  </div>
`;

elements.homeView.appendChild(reviewCard);
elements.reviewCard = reviewCard;
  loadSubjects(); // Load and render subjects
  syncPausedQuizButtons(); // Update continue buttons
}

// Hiển thị tên môn học dạng IN HOA (chỉ đổi ở giao diện, không sửa dữ liệu trong DB)
function toUpperSubjects(list) {
    return (list || []).map((s) => ({ ...s, name: String(s.name || '').toLocaleUpperCase('vi-VN') }));
}

// New: Load subjects from Supabase
async function loadSubjects() {
    if (configError) {
        availableSubjects = toUpperSubjects(FALLBACK_SUBJECTS);
        renderSubjectCards();
        updateHomeCardsVisibility();
        return;
    }
    try {
        const { data, error } = await supabase.rpc('get_subjects');
        if (error) {
            console.error('Error fetching subjects:', error);
            availableSubjects = FALLBACK_SUBJECTS;
        } else {
            availableSubjects = data.length > 0 ? data : FALLBACK_SUBJECTS;
        }
    } catch (e) {
        console.error('Unexpected error fetching subjects:', e);
        availableSubjects = FALLBACK_SUBJECTS;
    }
    availableSubjects = toUpperSubjects(availableSubjects);
    renderSubjectCards();
    updateHomeCardsVisibility();
}

// New: Render subject cards
function renderSubjectCards() {
    if (!elements.subjectGrid) return;
    elements.subjectGrid.innerHTML = ''; // Clear existing cards

    availableSubjects.forEach(subject => {
        const card = document.createElement('button');
        card.className = `subject-card-final ${subject.slug === selectedSubjectSlug ? 'active is-selected' : ''}`;
        card.type = 'button';
        card.dataset.slug = subject.slug;
        card.innerHTML = `
            <span class="subject-name-final">${escapeHtml(subject.name)}</span>
        `;
        card.addEventListener('click', () => {
            selectedSubjectSlug = subject.slug;
            localStorage.setItem('selectedSubjectSlug', selectedSubjectSlug);
            renderSubjectCards(); // Re-render to update selection
            if (elements.confirmSubjectBtn) elements.confirmSubjectBtn.disabled = false;
            loadLessons(); // Reload lessons for the new subject
            setStatus(`Đã chọn môn: ${subject.name}`, 'info');
        });
        elements.subjectGrid.appendChild(card);
    });
}

function updateHomeCardsVisibility() {
  if (elements.subjectSelectionCard) {
    elements.subjectSelectionCard.hidden = Boolean(confirmedSubjectSlug);
  }
  if (elements.quizStartCard) {
    elements.quizStartCard.hidden = !confirmedSubjectSlug;
  }
  if (elements.announcementCard) {
    elements.announcementCard.hidden = Boolean(confirmedSubjectSlug);
  }
  if (elements.reviewCard) {
    elements.reviewCard.hidden = Boolean(confirmedSubjectSlug);
  }

  if (confirmedSubjectSlug && elements.selectedSubjectTitle) {
    const subject = availableSubjects.find(s => s.slug === confirmedSubjectSlug);
    if (subject) {
      elements.selectedSubjectTitle.textContent = `Ôn tập: ${subject.name}`;
    }
  }
}


  async function saveNewName() {
  if (configError) {
    setStatus(configError, 'error');
    return;
  }

  const fullName = (elements.newNameInput?.value || '').trim();
  console.log('[saveNewName] input fullName:', fullName);
  if (!fullName) {
    setStatus('Vui lòng nhập họ tên.', 'error');
    return;
  }

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      console.error('[saveNewName] getUser error:', userError);
      setStatus('Bạn cần đăng nhập lại.', 'error');
      return;
    }
    const user = userData.user;
    console.log('[saveNewName] current user id:', user.id);

    const payload = { id: user.id, user_id: user.id, full_name: fullName };
    console.log('[saveNewName] payload:', payload);

    const { data, error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) {
      console.error('[saveNewName] upsert error:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        payloadDataSent: payload,
      });
      setStatus('Không thể lưu họ tên: ' + (error.message || 'Lỗi không xác định'), 'error');
      return;
    }

    console.log('[saveNewName] upsert success:', data);

    const newName = (data?.full_name || '').trim();
    // Cập nhật UI ngay, không cần reload
    if (elements.accountName) elements.accountName.textContent = newName || user.email || '';
    elements.userEmail.textContent = newName || user.email || '';
    // New: Update mobile user email
    if (elements.mobileUserEmail) elements.mobileUserEmail.textContent = newName || user.email || '';

    if (elements.editNameForm) elements.editNameForm.hidden = true;
    if (elements.editNameBtn) elements.editNameBtn.textContent = 'Đổi tên';
    if (elements.newNameInput) elements.newNameInput.value = newName;

    setStatus('Đã lưu họ tên.', 'success');

    await loadLeaderboard();
  } catch (error) {
    console.error('[saveNewName] error caught:', {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    });
    setStatus(error?.message || 'Không thể đổi tên.', 'error');
  }
}


function openEditName() {
  if (elements.editNameForm?.hidden) {
    // mở form và đổi nút thành Lưu
    if (elements.newNameInput && elements.accountName) {
      elements.newNameInput.value = elements.accountName.textContent || '';
    }
    elements.editNameForm.hidden = false;
    if (elements.editNameBtn) elements.editNameBtn.textContent = 'Lưu';
    elements.newNameInput?.focus();
  } else {
    // form đang mở -> bấm lại nút Đổi tên sẽ thực hiện lưu luôn
    saveNewName();
  }
}


function cancelEditName() {
  if (elements.editNameForm) elements.editNameForm.hidden = true;
  if (elements.editNameBtn) elements.editNameBtn.textContent = 'Đổi tên';
}


function sendFeedbackEmail() {
  const content = elements.feedbackInput?.value?.trim() || '';

  if (!content) {
    alert('Vui lòng nhập nội dung góp ý.');
    elements.feedbackInput?.focus();
    return;
  }

  const to = 'tp058235@gmail.com';
  const subject = 'Góp ý về ứng dụng Quiz App';

  const userLine = !elements.userBadge.hidden
    ? `Tài khoản: ${elements.userEmail.textContent || ''}`
    : 'Tài khoản: (chưa đăng nhập)';

  const body = `${userLine}\n\nNội dung góp ý:\n${content}`;

  // Mở Gmail với email, tiêu đề, nội dung đã điền sẵn
  const gmailUrl =
    `https://mail.google.com/mail/?view=cm&fs=1` +
    `&to=${encodeURIComponent(to)}` +
    `&su=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(body)}`;

  // Dự phòng nếu trình duyệt chặn mở tab mới
  const mailtoUrl =
    `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  const newWindow = window.open(gmailUrl, '_blank');

  if (!newWindow) {
    window.location.href = mailtoUrl;
  }
}


async function checkSession() {
  if (configError) {
    setStatus(configError, 'error');
    return;
  }

  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) throw error;

    updateUserUI(session);

    if (!session?.user) {
      setView('auth');
      return;
    }

    // Liên kết đặt lại mật khẩu tạo một phiên đăng nhập tạm thời.
    // Không được đưa người dùng vào trang chủ trước khi họ đặt mật khẩu mới.
    if (isPasswordRecoveryUrl()) {
      openPasswordRecovery(session);
      return;
    }

    await ensureProfileForSession(session);
    updateRetryWrongButton();
    await Promise.all([
      loadHistory(),
      loadLeaderboard(),
      loadLessons(),
    ]);

    setView('home');
  } catch (error) {
    console.error('[checkSession] Không thể kiểm tra phiên:', error);
    setStatus(
      'Không thể kiểm tra phiên đăng nhập. Vui lòng thử lại.',
      'error'
    );
  }
}


async function handleAuthSubmit(event) {
  event.preventDefault();

  if (configError) {
    setStatus(configError, 'error');
    return;
  }

  const email = elements.emailInput.value.trim();
  const password = elements.passwordInput.value.trim();

  if (!email || !password) {
    setStatus('Vui lòng nhập email và mật khẩu.', 'error');
    return;
  }

  const captchaToken = readCaptchaToken('authCaptcha', setStatus);
  if (captchaToken === null) return;
  let captchaUsed = false;

  elements.authSubmitBtn.disabled = true;
  setStatus('Đang xử lý...', 'info');

  try {
    if (authMode === 'register') {
      const fullName = elements.fullNameInput?.value?.trim() || '';
      const confirmPassword = elements.confirmPasswordInput.value.trim();

      if (!fullName) {
        setStatus('Vui lòng nhập họ và tên.', 'error');
        return;
      }

      if (!password || !confirmPassword) {
        setStatus('Vui lòng nhập đầy đủ mật khẩu và xác nhận mật khẩu.', 'error');
        return;
      }
      if (password !== confirmPassword) {
        setStatus('Mật khẩu nhập lại không khớp.', 'error');
        return;
      }

      captchaUsed = true;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
          ...(captchaToken ? { captchaToken } : {}),
        },
      });
      if (error) throw error;

      setStatus('Đăng ký thành công. Có thể kiểm tra email xác nhận trong mục thư rác của bạn nếu không thấy.', 'success');

            if (data?.session) {
        updateUserUI(data.session);
        await ensureProfileForSession(data.session);
        updateRetryWrongButton();
        await Promise.all([loadHistory(), loadLeaderboard()]);
        setView('home');
      }

    } else {
      captchaUsed = true;
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
        ...(captchaToken ? { options: { captchaToken } } : {}),
      });
      if (error) throw error;
            updateUserUI(data.session);
      await ensureProfileForSession(data.session);
      updateRetryWrongButton();
      await Promise.all([loadHistory(), loadLeaderboard()]);
      setView('home');
      setStatus('Đăng nhập thành công.', 'success');

    }
  } catch (error) {
    console.error(error);
    let errorMsg = error.message || 'Đăng nhập hoặc đăng ký thất bại.';
    if (isCaptchaError(error)) {
      errorMsg = CAPTCHA_FAILED_MESSAGE;
    } else if (error.message === 'Invalid login credentials' || error.status === 400) {
      errorMsg = 'Email hoặc mật khẩu không chính xác.';
    }
    if (error.message === 'Email not confirmed') {
      errorMsg = 'Email chưa được xác nhận. Vui lòng kiểm tra hộp thư đến (hoặc thư rác) để xác nhận tài khoản.';
    }
    setStatus(errorMsg, 'error');
  } finally {
    // Token captcha chỉ dùng 1 lần -> lấy token mới cho lần bấm tiếp theo
    if (captchaUsed) resetCaptcha('authCaptcha');
    elements.authSubmitBtn.disabled = false;
  }
}


async function handleLogout() {
  if (configError) {
    setStatus(configError, 'error');
    return;
  }

  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
        updateUserUI(null);
        clearQuizState();
        setView('auth');
        showSection('auth');
        if (elements.sidebar) elements.sidebar.hidden = true;
        setStatus('Đã đăng xuất.', 'success');


  } catch (error) {
    console.error(error);
    setStatus('Không thể đăng xuất. Vui lòng thử lại.', 'error');
  }
}

function clearQuizState() {
  questions = [];
  currentQuestionIndex = 0;
  selectedAnswers = [];
  answeredState = [];
  currentMode = null;
  quizMode = null;
  questionCount = 0;
  durationMinutes = 0;
  totalDurationSeconds = 0;
  isPaused = false;
  stopTimer();

  // Không xóa bài tạm ở đây. Bài tạm đã được tách theo tài khoản + môn,
  // nên đăng xuất hoặc đổi màn hình không làm mất bài của môn khác.
}

function getDraftStorageKey(
  subjectSlug = confirmedSubjectSlug,
  userId = currentUserId
) {
  const safeUserId = String(userId || '').trim();
  const safeSubjectSlug = String(subjectSlug || '').trim();

  if (!safeUserId || !safeSubjectSlug) return null;
  return `${QUIZ_DRAFT_PREFIX}:${safeUserId}:${safeSubjectSlug}`;
}

function saveDraft() {
  const subjectSlug = String(confirmedSubjectSlug || '').trim();
  const storageKey = getDraftStorageKey(subjectSlug, currentUserId);

  // Chỉ lưu khi đã đăng nhập và đã xác nhận đúng môn.
  if (!storageKey || !questions.length) return;

  const draft = {
    user_id: currentUserId,
    subject_slug: subjectSlug,
    questions,
    currentQuestionIndex,
    answers: selectedAnswers,
    startedAt: quizStartTime,
    remainingSeconds: totalDurationSeconds,
    totalQuestions: questionCount,
    durationMinutes,
    paused: Boolean(isPaused),
    quizMode,
    selectedLesson,
    quizStarted: true,
    savedAt: new Date().toISOString(),
  };

  localStorage.setItem(storageKey, JSON.stringify(draft));
}

function loadDraft(
  subjectSlug = confirmedSubjectSlug,
  userId = currentUserId
) {
  const storageKey = getDraftStorageKey(subjectSlug, userId);
  if (!storageKey) return null;

  try {
    const draft = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!draft) return null;

    // Chặn tuyệt đối việc dùng bài của tài khoản hoặc môn khác.
    if (draft.user_id !== userId) return null;
    if (draft.subject_slug !== subjectSlug) return null;

    return draft;
  } catch (error) {
    console.warn('[loadDraft] Dữ liệu bài tạm không hợp lệ:', error);
    return null;
  }
}

function clearDraft(
  subjectSlug = confirmedSubjectSlug,
  userId = currentUserId
) {
  const storageKey = getDraftStorageKey(subjectSlug, userId);
  if (storageKey) localStorage.removeItem(storageKey);
}

function getPausedQuizDraft(
  subjectSlug = confirmedSubjectSlug,
  userId = currentUserId
) {
  const draft = loadDraft(subjectSlug, userId);
  if (!draft?.quizStarted) return null;
  if (!Array.isArray(draft.questions) || !draft.questions.length) return null;
  if (draft.user_id !== userId || draft.subject_slug !== subjectSlug) return null;
  return draft;
}

function resolveDraftMode(draft) {
  if (!draft) return null;
  if (draft.quizMode) return draft.quizMode;

  const minutes = Number(draft.durationMinutes || 0);
  if (!minutes) return 'practice';

  const total = Number(draft.totalQuestions || draft.questions?.length || 0);
  return total >= 70 ? 'exam_70' : 'exam_30';
}

function syncPausedQuizButtons() {
  pausedQuizDraft = getPausedQuizDraft(confirmedSubjectSlug, currentUserId);
  const mode = resolveDraftMode(pausedQuizDraft);

  if (elements.practiceContinueBtn) elements.practiceContinueBtn.hidden = true;
  if (elements.examContinueBtn) elements.examContinueBtn.hidden = true;

  // reset labels về mặc định
  if (elements.practiceStartBtn?.dataset?.originalLabel) {
    elements.practiceStartBtn.textContent = elements.practiceStartBtn.dataset.originalLabel;
  }
  if (elements.examStartBtn?.dataset?.originalLabel) {
    elements.examStartBtn.textContent = elements.examStartBtn.dataset.originalLabel;
  }

  if (mode === 'practice') {
    if (elements.practiceContinueBtn) elements.practiceContinueBtn.hidden = false;
    if (elements.practiceStartBtn) elements.practiceStartBtn.textContent = 'Bài luyện tập mới';
  } else if (mode === 'exam_30' || mode === 'exam_70') {
    if (elements.examContinueBtn) elements.examContinueBtn.hidden = false;
    if (elements.examStartBtn) elements.examStartBtn.textContent = 'Bài thi thử mới';
  }
}


function confirmDiscardPausedQuizIfAny() {
  const existing = getPausedQuizDraft(confirmedSubjectSlug, currentUserId);
  if (!existing) return true;

    // Không hiện hộp thoại trình duyệt: tự xóa bài cũ khi bắt đầu bài mới
  clearDraft();
  pausedQuizDraft = null;
  syncPausedQuizButtons();
  setStatus('Đã xóa bài làm cũ để bắt đầu bài mới.', 'info');
  return true;

}

function continuePausedQuiz() {
  const activeSubjectSlug = String(confirmedSubjectSlug || '').trim();
  const draft = getPausedQuizDraft(activeSubjectSlug, currentUserId);

  if (!draft) {
    syncPausedQuizButtons();
    setStatus('Không có bài làm tạm dừng của môn này để tiếp tục.', 'info');
    return;
  }

  if (
    draft.user_id !== currentUserId ||
    draft.subject_slug !== activeSubjectSlug
  ) {
    syncPausedQuizButtons();
    setStatus('Bài đang lưu không thuộc môn hiện tại.', 'error');
    return;
  }

  // Giữ nguyên đúng môn của bài đang tiếp tục, không tự chuyển sang môn khác.
  selectedSubjectSlug = draft.subject_slug;
  confirmedSubjectSlug = draft.subject_slug;

  const mode = resolveDraftMode(draft);
  quizMode = mode;
  selectedLesson = draft.selectedLesson || 'all';

  questions = draft.questions || [];
  currentQuestionIndex = Number(draft.currentQuestionIndex || 0);
  selectedAnswers = Array.isArray(draft.answers) ? draft.answers : [];
  answeredState = selectedAnswers.map((answer) => answer !== null && answer !== undefined);

  questionCount = Number(draft.totalQuestions || questions.length || 0);
  durationMinutes = Number(draft.durationMinutes || 0);
  totalDurationSeconds = Number(
    draft.remainingSeconds ?? (durationMinutes ? durationMinutes * 60 : 0)
  );

  quizStartTime = Number(draft.startedAt || Date.now());

  // Tiếp tục: mở khóa tương tác
  isPaused = false;

  showSection('quiz');
  if (elements.aboutCard) elements.aboutCard.hidden = true;

  if (mode === 'practice') {
    stopTimer();
    if (elements.timerBadge) elements.timerBadge.hidden = true;
    if (elements.pauseBtn) elements.pauseBtn.hidden = true;

    const lessonText = selectedLesson === 'all' ? 'Tất cả bài/phần' : selectedLesson;
    elements.quizTitle.textContent = `Luyện tập (${lessonText})`;
  } else {
    if (elements.timerBadge) elements.timerBadge.hidden = false;
    if (elements.pauseBtn) {
      elements.pauseBtn.hidden = false;
      elements.pauseBtn.textContent = 'Tạm dừng';
    }

    elements.quizTitle.textContent = `Thi thử ${questionCount} câu / ${durationMinutes} phút`;
    updateTimerDisplay();
    startTimer();
  }

  elements.quizStatus.textContent = 'Đã tiếp tục bài làm. Chọn đáp án để xem kết quả ngay lập tức.';

  renderQuestion();
  saveDraft();
}


function loadLastWrong() {
  try {
    return JSON.parse(localStorage.getItem(LAST_WRONG_KEY) || 'null');
  } catch (error) {
    return null;
  }
}

function saveLastWrong(payload) {
  localStorage.setItem(LAST_WRONG_KEY, JSON.stringify(payload));
  updateRetryWrongButton();
}

function updateRetryWrongButton() {
  if (!elements.retryWrongBtn) return;
  const data = loadLastWrong();
  const ids = data?.ids;
  elements.retryWrongBtn.hidden = !(Array.isArray(ids) && ids.length);
}

async function startRetryWrongQuiz() {
  if (configError) {
    setStatus(configError, 'error');
    return;
  }

  // reset mode để không ảnh hưởng mode lưu lịch sử
  quizMode = null;


  const saved = loadLastWrong();
  const ids = saved?.ids;
  if (!Array.isArray(ids) || !ids.length) {
    setStatus('Chưa có dữ liệu câu sai để làm lại.', 'error');
    return;
  }

  isLoading = true;
  loadError = '';
  clearDraft();

  elements.quizStatus.textContent = 'Đang tải câu sai...';
  elements.quizCard.innerHTML = '<p class="muted-text">Đang tải câu sai...</p>';
  elements.nextQuestionBtn.hidden = true;
  elements.submitQuizBtn.hidden = true;
  showSection('quiz');
  elements.aboutCard.hidden = true;

  try {
    const { data, error } = await supabase.from('questions').select('*').in('id', ids);
    if (error) throw error;

    const fetched = Array.isArray(data) ? data : [];
    if (!fetched.length) {
      throw new Error('Không tìm thấy danh sách câu sai.');
    }

    const idOrder = new Map(ids.map((id, index) => [id, index]));
    const ordered = fetched.slice().sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));

    questions = ordered;
    currentQuestionIndex = 0;
    selectedAnswers = new Array(questions.length).fill(null);
    answeredState = new Array(questions.length).fill(false);
    quizStartTime = Date.now();

    questionCount = questions.length;
    const prevTotal = Number(saved?.totalQuestions || questionCount);
    const prevMinutes = Number(saved?.durationMinutes || 20);
    durationMinutes = Math.max(1, Math.ceil(prevMinutes * (questionCount / Math.max(1, prevTotal))));
    totalDurationSeconds = durationMinutes * 60;

    isPaused = false;
    if (elements.pauseBtn) {
      elements.pauseBtn.hidden = false;
      elements.pauseBtn.textContent = 'Tạm dừng';
    }

    elements.quizTitle.textContent = `Làm lại ${questionCount} câu sai`;
    elements.quizStatus.textContent = 'Chọn đáp án để xem kết quả ngay lập tức.';
    startTimer();
    renderQuestion();
    saveDraft();
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Không thể tải câu sai.', 'error');
    showSection('dashboard');
  } finally {
    isLoading = false;
  }
}


function resetQuizForNewStart() {
  // Reset runtime state
  questions = [];
  currentQuestionIndex = 0;
  selectedAnswers = [];
  answeredState = [];
  quizStartTime = 0;

  questionCount = 0;
  durationMinutes = 0;
  totalDurationSeconds = 0;

  isPaused = false;
  loadError = '';

  stopTimer();
  clearDraft();

  // Reset UI state
  if (elements.nextQuestionBtn) elements.nextQuestionBtn.hidden = true;
  if (elements.submitQuizBtn) elements.submitQuizBtn.hidden = true;
  if (elements.quizStatus) elements.quizStatus.textContent = '';
  if (elements.quizCard) elements.quizCard.innerHTML = '';
}

async function startPractice() {
  if (configError) {
    setStatus(configError, 'error');
    return;
  }

  if (!confirmedSubjectSlug) {
      setStatus('Vui lòng chọn môn học trước khi bắt đầu luyện tập.', 'error');
      isLoading = false;
      return;
  }



  if (!confirmDiscardPausedQuizIfAny()) {
    isLoading = false;
    return;
  }


  quizMode = 'practice';
  currentMode = 'quiz';
  isLoading = true;

  resetQuizForNewStart();

  selectedLesson = elements.lessonSelect?.value || selectedLesson || 'all';

  elements.quizStatus.textContent = 'Đang tải câu hỏi...';
  elements.quizCard.innerHTML = '<p class="muted-text">Đang tải câu hỏi...</p>';

  showSection('quiz');
  if (elements.aboutCard) elements.aboutCard.hidden = true;

  // practice: không hiện timer/pause
  if (elements.timerBadge) elements.timerBadge.hidden = true;
  if (elements.pauseBtn) elements.pauseBtn.hidden = true;


  try {
    const { data, error } = await supabase.rpc('get_random_questions_by_lesson', {
      p_limit: 999,
      p_lesson: selectedLesson || 'all', // Keep existing lesson filter
      p_subject_slug: confirmedSubjectSlug, // New: Filter by selected subject
    });

    if (error) {
      console.error('[startPractice] rpc error:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      loadError = error.message || 'Không lấy được câu hỏi từ Supabase.';
      setStatus(loadError, 'error');
      showSection('dashboard');
      return;
    }

    if (!Array.isArray(data) || data.length === 0) {
      loadError = 'Môn học này hiện chưa có câu hỏi. Vui lòng chọn môn khác (như Chính Trị, Cơ Sở Dữ Liệu) hoặc thêm dữ liệu vào Supabase.';
      setStatus(loadError, 'error');
      showSection('dashboard');
      return;
    }

    questions = data;
    questionCount = questions.length;
    durationMinutes = 0;
    totalDurationSeconds = 0;

    currentQuestionIndex = 0;
    selectedAnswers = new Array(questions.length).fill(null);
    answeredState = new Array(questions.length).fill(false);
    quizStartTime = Date.now();

    const lessonText = selectedLesson === 'all' ? 'Tất cả bài/phần' : selectedLesson;
    elements.quizTitle.textContent = `Luyện tập (${lessonText})`;
    elements.quizStatus.textContent = 'Chọn đáp án để xem kết quả ngay lập tức.';

    renderQuestion();
    saveDraft();
  } catch (error) {
    console.error('[startPractice] unexpected error:', {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    });
    setStatus(error?.message || 'Có lỗi xảy ra khi bắt đầu luyện tập.', 'error');
    showSection('dashboard');
  } finally {
    isLoading = false;
  }
}

async function startExam(totalQuestions) {
  if (configError) {
    setStatus(configError, 'error');
    return;
  }

  if (!confirmedSubjectSlug) {
      setStatus('Vui lòng chọn môn học trước khi bắt đầu thi thử.', 'error');
      isLoading = false;
      return;
  }


  if (!confirmDiscardPausedQuizIfAny()) {
    isLoading = false;
    return;
  }


  const minutes = totalQuestions === 70 ? 60 : 20;
  quizMode = totalQuestions === 70 ? 'exam_70' : 'exam_30';

  currentMode = 'quiz';
  isLoading = true;

  resetQuizForNewStart();

  // set timer theo mode
  questionCount = totalQuestions;
  durationMinutes = minutes;
  totalDurationSeconds = durationMinutes * 60;

  elements.quizStatus.textContent = 'Đang tải câu hỏi...';
  elements.quizCard.innerHTML = '<p class="muted-text">Đang tải câu hỏi...</p>';

  showSection('quiz');
  if (elements.aboutCard) elements.aboutCard.hidden = true;

  // exam: hiện timer/pause
  if (elements.timerBadge) elements.timerBadge.hidden = false;


  try {
    const { data, error } = await supabase.rpc('get_random_questions_by_lesson', {
      p_limit: totalQuestions,
      p_lesson: 'all', // For exams, usually all lessons
      p_subject_slug: confirmedSubjectSlug, // New: Filter by selected subject
    });

    if (error) {
      console.error('[startExam] rpc error:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      loadError = error.message || 'Không lấy được câu hỏi từ Supabase.';
      elements.quizStatus.textContent = loadError;
      elements.quizCard.innerHTML = `<p class="muted-text">${escapeHtml(loadError)}</p>`;
      setStatus(loadError, 'error');
      showSection('dashboard');
      return;
    }

    if (!Array.isArray(data) || data.length === 0) {
      loadError = 'Môn học này hiện chưa có câu hỏi. Vui lòng chọn môn khác (như Chính Trị, Cơ Sở Dữ Liệu) hoặc thêm dữ liệu vào Supabase.';
      elements.quizStatus.textContent = loadError;
      elements.quizCard.innerHTML = `<p class="muted-text">${escapeHtml(loadError)}</p>`;
      setStatus(loadError, 'error');
      showSection('dashboard');
      return;
    }

    questions = data;

    if (questions.length < totalQuestions) {
      elements.quizStatus.textContent = `Hiện chỉ có ${questions.length} câu trong ngân hàng câu hỏi.`;
    } else {
      elements.quizStatus.textContent = 'Chọn đáp án để xem kết quả ngay lập tức.';
    }

    currentQuestionIndex = 0;
    selectedAnswers = new Array(questions.length).fill(null);
    answeredState = new Array(questions.length).fill(false);
    quizStartTime = Date.now();

    // cập nhật lại tổng câu theo dữ liệu thực tế
    questionCount = questions.length;

    elements.quizTitle.textContent = `Thi thử ${questionCount} câu / ${minutes} phút`;


    if (elements.pauseBtn) {
      elements.pauseBtn.hidden = false;
      elements.pauseBtn.textContent = 'Tạm dừng';
    }

    updateTimerDisplay();
    startTimer();
    renderQuestion();
    saveDraft();
  } catch (error) {
    console.error('[startExam] unexpected error:', {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    });
    loadError = error?.message || 'Có lỗi xảy ra khi bắt đầu bài làm.';
    setStatus(loadError, 'error');
    showSection('dashboard');
  } finally {
    isLoading = false;
  }
}

// Backward compatible: keep existing callers (if any)


function setupQuizNavigationButtons() {
  const actions = document.querySelector('#quizSection .quiz-actions');
  if (!actions) return;

  let prevBtn = document.getElementById('prevQuestionBtn');
  if (!prevBtn) {
    prevBtn = document.createElement('button');
    prevBtn.id = 'prevQuestionBtn';
    prevBtn.className = 'ghost-btn';
    prevBtn.type = 'button';
    prevBtn.textContent = 'Quay lại';
    actions.prepend(prevBtn);
  }

  elements.prevQuestionBtn = prevBtn;
}

function updateNavigationButtons() {
  if (!questions.length) return;

    const atFirst = currentQuestionIndex <= 0;
  const atLast = currentQuestionIndex >= questions.length - 1;
  const isAnswered = Boolean(answeredState[currentQuestionIndex]);
  const locked = isInteractionLocked();

    if (elements.prevQuestionBtn) {
    elements.prevQuestionBtn.disabled = locked || atFirst;
    elements.prevQuestionBtn.hidden = atFirst;
  }


  if (elements.nextQuestionBtn) {
    elements.nextQuestionBtn.hidden = false;
    elements.nextQuestionBtn.textContent = atLast ? 'Nộp bài' : 'Câu tiếp theo';
    // Chỉ cho đi tiếp khi đã trả lời câu hiện tại
    elements.nextQuestionBtn.disabled = locked || !isAnswered;
  }


  // Giữ nút submit cũ nhưng ẩn đi (dùng nút "Câu tiếp theo" đổi thành "Nộp bài" ở câu cuối)
  if (elements.submitQuizBtn) {
    elements.submitQuizBtn.hidden = true;
  }
}

function goToPrevQuestion() {
  if (isInteractionLocked()) return;
  if (currentQuestionIndex <= 0) return;


  currentQuestionIndex -= 1;
  saveDraft();
  renderQuestion();
}


function startTimer() {
  if (isPaused) return;
  stopTimer();
  updateTimerDisplay();
  timerId = window.setInterval(() => {
    totalDurationSeconds -= 1;
    if (totalDurationSeconds <= 0) {
      totalDurationSeconds = 0;
      updateTimerDisplay();
      saveDraft();
      stopTimer();
      submitQuiz();
      return;
    }
    updateTimerDisplay();
    saveDraft();
  }, 1000);
}


function updateTimerDisplay() {
  const minutes = String(Math.floor(totalDurationSeconds / 60)).padStart(2, '0');
  const seconds = String(totalDurationSeconds % 60).padStart(2, '0');
  elements.timerBadge.textContent = `${minutes}:${seconds}`;
}

function stopTimer() {
  if (timerId) {
    window.clearInterval(timerId);
    timerId = null;
  }
}

// Câu hỏi 3 đáp án (A-C) lưu option_d = '' -> không vẽ nút rỗng.
function hasOptionText(text) {
  return String(text ?? '').trim() !== '';
}

function renderQuestion() {
    const question = questions[currentQuestionIndex];
  if (!question) return;

  const locked = isInteractionLocked();


  const options = [
    { key: 'A', text: question.option_a },
    { key: 'B', text: question.option_b },
    { key: 'C', text: question.option_c },
    { key: 'D', text: question.option_d },
  ].filter((option) => hasOptionText(option.text));

  elements.quizCard.innerHTML = `
    <p class="question-index">Câu ${currentQuestionIndex + 1}/${questions.length}</p>
    <p class="question-text">${escapeHtml(question.question_text || 'Câu hỏi không có nội dung.')}</p>
    <div class="option-list">
      ${options.map((option) => {
        const selected = selectedAnswers[currentQuestionIndex] === option.key;
        const correct = option.key === question.correct_answer;
                const isAnswered = answeredState[currentQuestionIndex];
        const isDisabled = isAnswered || locked;

        const classes = ['option-btn'];
        if (isAnswered) {
          if (correct) classes.push('correct');
          if (selected && !correct) classes.push('wrong');
          if (selected) classes.push('selected');
        } else if (selected) {
          classes.push('selected');
        }
        return `
          <button class="${classes.join(' ')}" data-choice="${option.key}" ${isDisabled ? 'disabled' : ''}>
            <span class="option-label">${escapeHtml(option.key)}. ${escapeHtml(option.text)}</span>
            ${isAnswered && correct ? '<strong>Đáp án đúng</strong>' : ''}
          </button>`;
      }).join('')}
    </div>
    ${answeredState[currentQuestionIndex] ? `
  <div class="feedback ${
    selectedAnswers[currentQuestionIndex] === question.correct_answer
      ? 'correct'
      : 'incorrect'
  }">
    <div class="feedback-result">
      ${
        selectedAnswers[currentQuestionIndex] === question.correct_answer
          ? 'Chính xác! Bạn đã chọn đáp án đúng.'
          : `Sai rồi. Đáp án đúng là ${escapeHtml(question.correct_answer)}: ${
              escapeHtml(question[
                'option_' + String(question.correct_answer || '').toLowerCase()
              ])
            }.`
      }
    </div>

    ${
      question.explanation
        ? `
          <div class="answer-explanation">
            <strong>Giải thích:</strong>
            <span>${escapeHtml(question.explanation)}</span>
          </div>
        `
        : ''
    }
  </div>
` : ''}
  `;

  const optionButtons = elements.quizCard.querySelectorAll('.option-btn');
  optionButtons.forEach((button) => {
    button.addEventListener('click', () => handleAnswerChoice(button.dataset.choice));
  });

    updateNavigationButtons();
}



function handleAnswerChoice(choice) {
  if (isInteractionLocked()) return;
  if (answeredState[currentQuestionIndex]) return;



  selectedAnswers[currentQuestionIndex] = choice;
  answeredState[currentQuestionIndex] = true;

  const currentQuestion = questions[currentQuestionIndex];
  elements.quizStatus.textContent = choice === currentQuestion?.correct_answer ? 'Chính xác!' : 'Sai rồi!';
  saveDraft();
  renderQuestion();
  if (currentQuestionIndex === questions.length - 1) {
    elements.submitQuizBtn.hidden = false;
  } else {
    elements.nextQuestionBtn.hidden = false;
  }
}

function goToNextQuestion() {
  if (isInteractionLocked()) return;
  if (!questions.length) return;


  const atLast = currentQuestionIndex >= questions.length - 1;
  if (atLast) {
    submitQuiz();
    return;
  }

  currentQuestionIndex += 1;
  elements.quizStatus.textContent = 'Chọn đáp án để xem kết quả ngay lập tức.';
  saveDraft();
  renderQuestion();
}


async function submitQuiz() {
  if (configError) {
    setStatus(configError, 'error');
    return;
  }

  if (!questions.length) return;
  if (!confirmedSubjectSlug) {
    setStatus('Không xác định được môn học của bài làm.', 'error');
    return;
  }

  isPaused = false;
  stopTimer();

  const totalQuestions = questions.length;
  const correctCount = selectedAnswers.filter(
    (answer, index) => answer === questions[index]?.correct_answer
  ).length;
  const wrongCount = totalQuestions - correctCount;
  const scorePercent = Math.round((correctCount / totalQuestions) * 100);
  const durationSeconds = Math.max(
    1,
    Math.floor((Date.now() - quizStartTime) / 1000)
  );

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const user = userData?.user;

    if (userError || !user) {
      throw new Error('Bạn cần đăng nhập để nộp bài.');
    }

    const subject = availableSubjects.find(
      (item) => item.slug === confirmedSubjectSlug
    );

    const payload = {
      user_id: user.id,
      mode: quizMode || `${totalQuestions} câu / ${durationMinutes} phút`,
      total_questions: totalQuestions,
      correct_count: correctCount,
      wrong_count: wrongCount,
      score_percent: scorePercent,
      score_points: correctCount,
      duration_seconds: durationSeconds,
      subject_slug: confirmedSubjectSlug,
    };

    // Chỉ gửi subject_id khi đây là UUID thật lấy từ Supabase.
    // ID dự phòng như "chinh-tri-id" sẽ làm INSERT thất bại.
    if (isValidUuid(subject?.id)) {
      payload.subject_id = subject.id;
    }

    const { error: insertError } = await supabase
      .from('quiz_attempts')
      .insert(payload);

    if (insertError) throw insertError;

    const wrongIds = questions
      .filter(
        (question, index) =>
          selectedAnswers[index] !== question?.correct_answer
      )
      .map((question) => question.id)
      .filter((id) => id !== null && id !== undefined);

    saveLastWrong({
      ids: wrongIds,
      totalQuestions,
      durationMinutes,
      subjectSlug: confirmedSubjectSlug,
      createdAt: new Date().toISOString(),
    });

    elements.quizStatus.textContent =
      `Hoàn thành! Bạn đúng ${correctCount}/${totalQuestions} câu (${scorePercent}%).`;

    setStatus('Nộp bài thành công. Kết quả đã được lưu.', 'success');

    clearDraft();
    pausedQuizDraft = null;
    syncPausedQuizButtons();
    quizMode = null;

    // Tải tuần tự để chắc chắn bảng xếp hạng nhận dữ liệu vừa lưu.
    await loadHistory();
    await loadLeaderboard();
    setView('history');
  } catch (error) {
    console.error('[submitQuiz] Không thể lưu kết quả:', {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    });

    setStatus(
      error?.message || 'Không thể lưu kết quả làm bài.',
      'error'
    );
  }
}

async function loadHistory() {
  if (configError) {
    elements.historyTableBody.innerHTML = '<tr><td colspan="7">Cấu hình Supabase chưa hợp lệ. Vui lòng cập nhật VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY.</td></tr>';
    return;
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session?.user) {
      elements.historyTableBody.innerHTML = '<tr><td colspan="7">Bạn cần đăng nhập để xem lịch sử.</td></tr>';
      return;
    }

    const { data, error } = await supabase
      .from('quiz_attempts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!data?.length) {
      elements.historyTableBody.innerHTML = '<tr><td colspan="7">Chưa có dữ liệu lịch sử nào.</td></tr>';
      return;
    }

    elements.historyTableBody.innerHTML = data
      .map((item) => {
        const createdAt = new Date(item.created_at).toLocaleString('vi-VN');
        const duration = `${Math.floor(item.duration_seconds / 60)} phút ${item.duration_seconds % 60}s`;
        return `
          <tr>
            <td>${escapeHtml(createdAt)}</td>
            <td>${escapeHtml(item.mode)}</td>
            <td>${escapeHtml(item.total_questions)}</td>
            <td>${escapeHtml(item.correct_count ?? item.correct_answers ?? 0)}</td>
            <td>${escapeHtml(item.wrong_count ?? item.wrong_answers ?? 0)}</td>
            <td>${escapeHtml(item.score_percent)}%</td>
            <td>${escapeHtml(duration)}</td>
          </tr>`;
      })
      .join('');
  } catch (error) {
    console.error(error);
    elements.historyTableBody.innerHTML = '<tr><td colspan="7">Không thể tải lịch sử. Vui lòng kiểm tra kết nối Supabase.</td></tr>';
  }
}

function pauseQuiz() {
  if (!questions.length) return;
  if (isPaused) return;
  isPaused = true;
  stopTimer();
  if (elements.pauseBtn) elements.pauseBtn.textContent = 'Tiếp tục';
  elements.quizStatus.textContent = 'Đã tạm dừng. Nhấn "Tiếp tục" để làm tiếp.';
  saveDraft();
  renderQuestion();
}

function resumeQuiz() {
  if (!questions.length) return;
  if (!isPaused) return;
  isPaused = false;
  if (elements.pauseBtn) elements.pauseBtn.textContent = 'Tạm dừng';
  elements.quizStatus.textContent = 'Chọn đáp án để xem kết quả ngay lập tức.';
  startTimer();
  saveDraft();
  renderQuestion();
}

function togglePause() {
  if (isPaused) {
    resumeQuiz();
  } else {
    pauseQuiz();
  }
}

async function loadLeaderboard() {
  if (!elements.leaderboardTableBody) return;

  if (configError) {
    elements.leaderboardTableBody.innerHTML =
      '<tr><td colspan="4">Cấu hình Supabase chưa hợp lệ.</td></tr>';
    return;
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession();

    if (!sessionData?.session?.user) {
      elements.leaderboardTableBody.innerHTML =
        '<tr><td colspan="4">Bạn cần đăng nhập để xem bảng xếp hạng.</td></tr>';
      return;
    }

    const subjectSlug =
      confirmedSubjectSlug || selectedSubjectSlug || null;

    const { data, error } = await supabase.rpc('get_leaderboard', {
      p_limit: 50,
      p_subject_slug: subjectSlug,
    });

    if (error) {
      console.error('[loadLeaderboard] RPC error:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });

      elements.leaderboardTableBody.innerHTML =
        `<tr><td colspan="4">Không thể tải bảng xếp hạng: ${
          escapeHtml(error.message || 'Lỗi không xác định')
        }</td></tr>`;
      return;
    }

    if (!Array.isArray(data) || data.length === 0) {
      leaderboardData = [];
      elements.leaderboardTableBody.innerHTML =
        '<tr><td colspan="4">Chưa có dữ liệu xếp hạng.</td></tr>';
      return;
    }

    leaderboardData = data;
    elements.leaderboardTableBody.innerHTML = data
      .map((item, index) => {
        const score = Number(item.best_score);
        const scoreText = Number.isFinite(score)
          ? `${Math.round(score)} điểm`
          : '-';

        return `
          <tr>
            <td>${escapeHtml(item.rank ?? index + 1)}</td>
            <td>${escapeHtml(item.full_name ?? 'Không tên')}</td>
            <td>${escapeHtml(scoreText)}</td>
            <td>${escapeHtml(item.attempts ?? 0)}</td>
          </tr>`;
      })
      .join('');
  } catch (error) {
    console.error('[loadLeaderboard] Unexpected error:', {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    });

    elements.leaderboardTableBody.innerHTML =
      `<tr><td colspan="4">Không thể tải bảng xếp hạng: ${
        escapeHtml(error?.message || 'Lỗi không xác định')
      }</td></tr>`;
  }
}



// =============================================================================
// LỚP HỌC (KIỂM TRA THEO LỚP) - Phase 1 MVP
// Toàn bộ UI được render động vào elements.classContent, điều hướng nội bộ
// qua classState.screen. Sự kiện click dùng event delegation (wireClassEvents)
// gắn 1 lần lên elements.classContent, không cần re-attach sau mỗi lần render.
// =============================================================================

const classState = {
  screen: 'list', // list | create | join | detail | members | createQuiz | takeQuiz | review | quizResults
  classes: [],
  classId: null,
  classDetail: null,
  quizzes: [],
  quizId: null,
  members: [],
  lessonsForQuiz: [],
  attemptId: null,
  takeQuizQuestions: [],
  takeQuizAnswers: {},
  takeQuizIndex: 0,
  takeQuizDeadline: null,
  takeQuizTimerId: null,
  takeQuizTitle: '',
  reviewData: [],
  reviewSummary: null,
  quizLeaderboard: [],
  quizLeaderboardTitle: '',
  joinCodePrefill: '',
  loading: false,
  message: '',
  messageVariant: 'info',
};

function classSetMessage(message, variant = 'info') {
  classState.message = message || '';
  classState.messageVariant = variant;
}

function classMessageHtml() {
  if (!classState.message) return '';
  return `<p class="status-text ${escapeHtml(classState.messageVariant)}" aria-live="polite">${escapeHtml(classState.message)}</p>`;
}

function formatClassDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '';
  }
}

function classStatusLabel(status) {
  switch (status) {
    case 'submitted': return 'Đã nộp';
    case 'in_progress': return 'Đang làm dở';
    default: return 'Chưa làm';
  }
}

async function renderClassScreen() {
  if (!elements.classContent) return;
  switch (classState.screen) {
    case 'create': return renderClassCreateForm();
    case 'join': return renderClassJoinForm();
    case 'detail': return renderClassDetailScreen();
    case 'members': return renderClassMembersScreen();
    case 'createQuiz': return renderCreateQuizForm();
    case 'takeQuiz': return renderTakeQuizScreen();
    case 'review': return renderReviewScreen();
    case 'quizResults': return renderQuizLeaderboardScreen();
    case 'list':
    default:
      return renderClassListScreen();
  }
}

// ---------- 1. Danh sách lớp -------------------------------------------------

async function loadMyClasses() {
  if (configError || !currentUserId) return;
  classState.loading = true;
  renderClassListScreen();
  try {
    const { data, error } = await supabase.rpc('get_my_classes');
    if (error) throw error;
    classState.classes = data || [];
  } catch (err) {
    classSetMessage(err.message || 'Không tải được danh sách lớp.', 'error');
    classState.classes = [];
  } finally {
    classState.loading = false;
    renderClassListScreen();
  }
}

function renderClassListScreen() {
  if (!elements.classContent) return;
  const rows = classState.classes;

  elements.classContent.innerHTML = `
    <div class="section-header">
      <div>
        <p class="eyebrow">Lớp học</p>
        <h3>Kiểm tra theo lớp</h3>
      </div>
      <div class="inline-actions">
        <button class="ghost-btn" type="button" data-class-action="show-join">Tham gia lớp</button>
        <button class="primary-btn" type="button" data-class-action="show-create">+ Tạo lớp</button>
      </div>
    </div>
    ${classMessageHtml()}
    ${classState.loading ? '<p class="muted-text">Đang tải...</p>' : ''}
    ${!classState.loading && rows.length === 0 ? '<p class="muted-text">Bạn chưa tham gia lớp nào. Tạo lớp mới hoặc nhập mã lớp để tham gia.</p>' : ''}
    <div class="table-wrap">
      ${rows.length > 0 ? `
        <table>
          <thead>
            <tr>
              <th>Tên lớp</th>
              <th>Môn</th>
              <th>Vai trò</th>
              <th>Thành viên</th>
              <th>Bài KT</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((c) => `
              <tr>
                <td>${escapeHtml(c.name)}</td>
                <td>${escapeHtml(c.subject_slug || '-')}</td>
                <td>${c.role === 'admin' ? 'Quản trị' : 'Thành viên'}</td>
                <td>${Number(c.member_count || 0)}</td>
                <td>${Number(c.quiz_count || 0)}</td>
                <td><button class="ghost-btn" type="button" data-class-action="open-class" data-class-id="${escapeHtml(c.class_id)}">Mở lớp</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : ''}
    </div>
  `;
}

function renderClassCreateForm() {
  const subjectOptions = availableSubjects.map((s) => `<option value="${escapeHtml(s.slug)}">${escapeHtml(s.name)}</option>`).join('');
  elements.classContent.innerHTML = `
    <div class="section-header">
      <div>
        <p class="eyebrow">Lớp học</p>
        <h3>Tạo lớp mới</h3>
      </div>
      <button class="ghost-btn" type="button" data-class-action="back-list">← Quay lại</button>
    </div>
    ${classMessageHtml()}
    <form class="auth-form" data-class-form="create">
      <label for="classNameInput">Tên lớp</label>
      <input id="classNameInput" name="name" type="text" placeholder="VD: Lớp Mạng máy tính A1" required />

      <label for="classDescInput">Mô tả (không bắt buộc)</label>
      <input id="classDescInput" name="description" type="text" placeholder="VD: Lớp thực hành học kỳ 1" />

      <label for="classSubjectInput">Môn học (không bắt buộc)</label>
      <select id="classSubjectInput" name="subject_slug">
        <option value="">-- Không gắn môn cụ thể --</option>
        ${subjectOptions}
      </select>

      <button class="primary-btn" type="submit" ${classState.loading ? 'disabled' : ''}>Tạo lớp</button>
    </form>
  `;
}

function renderClassJoinForm() {
  const prefill = classState.joinCodePrefill || '';
  elements.classContent.innerHTML = `
    <div class="section-header">
      <div>
        <p class="eyebrow">Lớp học</p>
        <h3>Tham gia lớp bằng mã</h3>
      </div>
      <button class="ghost-btn" type="button" data-class-action="back-list">← Quay lại</button>
    </div>
    ${classMessageHtml()}
    <form class="auth-form" data-class-form="join">
      <label for="classCodeInput">Mã lớp (6 ký tự do giáo viên cung cấp)</label>
      <input id="classCodeInput" name="code" type="text" placeholder="VD: A1B2C3" maxlength="8" style="text-transform:uppercase" value="${escapeHtml(prefill)}" required />
      <button class="primary-btn" type="submit" ${classState.loading ? 'disabled' : ''}>Tham gia</button>
    </form>
  `;
  classState.joinCodePrefill = '';
}

async function handleCreateClassSubmit(form) {
  const name = form.querySelector('#classNameInput')?.value?.trim();
  const description = form.querySelector('#classDescInput')?.value?.trim();
  const subjectSlug = form.querySelector('#classSubjectInput')?.value?.trim();
  if (!name) {
    classSetMessage('Vui lòng nhập tên lớp.', 'error');
    renderClassCreateForm();
    return;
  }
  classState.loading = true;
  classSetMessage('');
  renderClassCreateForm();
  try {
    const { data, error } = await supabase.rpc('create_class', {
      p_name: name,
      p_description: description || null,
      p_subject_slug: subjectSlug || null,
    });
    if (error) throw error;
    classSetMessage(`Đã tạo lớp thành công! Mã lớp: ${data.class_code}`, 'success');
    await loadMyClasses();
    await openClassDetail(data.id);
  } catch (err) {
    classSetMessage(err.message || 'Không tạo được lớp.', 'error');
    classState.loading = false;
    renderClassCreateForm();
  }
}

async function handleJoinClassSubmit(form) {
  const code = form.querySelector('#classCodeInput')?.value?.trim();
  if (!code) {
    classSetMessage('Vui lòng nhập mã lớp.', 'error');
    renderClassJoinForm();
    return;
  }
  classState.loading = true;
  classSetMessage('');
  renderClassJoinForm();
  try {
    const { data, error } = await supabase.rpc('join_class_by_code', { p_code: code });
    if (error) throw error;
    classSetMessage(`Đã tham gia lớp "${data.name}".`, 'success');
    await loadMyClasses();
    await openClassDetail(data.id);
  } catch (err) {
    classSetMessage(err.message || 'Không tham gia được lớp. Kiểm tra lại mã lớp.', 'error');
    classState.loading = false;
    renderClassJoinForm();
  }
}

// ---------- 2. Chi tiết lớp ---------------------------------------------------

async function openClassDetail(classId) {
  classState.classId = classId;
  classState.screen = 'detail';
  classState.loading = true;
  classSetMessage('');
  renderClassDetailScreen();
  try {
    const [{ data: detail, error: detailError }, { data: quizzes, error: quizError }] = await Promise.all([
      supabase.rpc('get_class_detail', { p_class_id: classId }),
      supabase.rpc('get_class_quizzes', { p_class_id: classId }),
    ]);
    if (detailError) throw detailError;
    if (quizError) throw quizError;
    classState.classDetail = Array.isArray(detail) ? detail[0] : detail;
    classState.quizzes = quizzes || [];
  } catch (err) {
    classSetMessage(err.message || 'Không tải được thông tin lớp.', 'error');
  } finally {
    classState.loading = false;
    renderClassDetailScreen();
  }
}

function renderClassDetailScreen() {
  const d = classState.classDetail;
  if (!d && classState.loading) {
    elements.classContent.innerHTML = `<p class="muted-text">Đang tải...</p>`;
    return;
  }
  if (!d) {
    elements.classContent.innerHTML = `${classMessageHtml()}<button class="ghost-btn" type="button" data-class-action="back-list">← Quay lại danh sách lớp</button>`;
    return;
  }
  const isAdmin = d.my_role === 'admin';
  const joinUrl = `${window.location.origin}${window.location.pathname}?join=${encodeURIComponent(d.class_code)}`;

  elements.classContent.innerHTML = `
    <div class="section-header">
      <div>
        <p class="eyebrow">Lớp học</p>
        <h3>${escapeHtml(d.name)}</h3>
      </div>
      <button class="ghost-btn" type="button" data-class-action="back-list">← Danh sách lớp</button>
    </div>
    ${classMessageHtml()}
    <div class="about-card" style="margin-bottom:16px;">
      ${d.description ? `<p class="muted-text">${escapeHtml(d.description)}</p>` : ''}
      <p class="muted-text"><strong>Mã lớp:</strong> ${escapeHtml(d.class_code)} &nbsp;|&nbsp; <strong>Thành viên:</strong> ${Number(d.member_count || 0)} &nbsp;|&nbsp; <strong>Vai trò của bạn:</strong> ${isAdmin ? 'Quản trị' : 'Thành viên'}</p>
      ${isAdmin ? `<p class="muted-text">Chia sẻ mã <strong>${escapeHtml(d.class_code)}</strong> hoặc link sau để mời thành viên:<br/><code style="word-break:break-all;">${escapeHtml(joinUrl)}</code></p>` : ''}
      <div class="inline-actions">
        ${isAdmin ? `<button class="ghost-btn" type="button" data-class-action="open-members">Quản lý thành viên</button>` : ''}
        ${isAdmin ? `<button class="primary-btn" type="button" data-class-action="show-create-quiz">+ Tạo bài kiểm tra</button>` : ''}
        ${!isAdmin ? `<button class="ghost-btn" type="button" data-class-action="leave-class">Rời lớp</button>` : ''}
      </div>
    </div>

    <div class="section-header">
      <div><p class="eyebrow">Bài kiểm tra</p></div>
    </div>
    <div class="table-wrap">
      ${classState.quizzes.length === 0 ? '<p class="muted-text">Lớp chưa có bài kiểm tra nào.</p>' : `
        <table>
          <thead>
            <tr>
              <th>Tên bài</th>
              <th>Số câu</th>
              <th>Thời gian</th>
              ${isAdmin ? '<th>Đã nộp</th>' : '<th>Trạng thái</th>'}
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${classState.quizzes.map((q) => `
              <tr>
                <td>${escapeHtml(q.title)}</td>
                <td>${Number(q.question_count || 0)}</td>
                <td>${q.time_limit_minutes ? escapeHtml(String(q.time_limit_minutes)) + ' phút' : 'Không giới hạn'}</td>
                ${isAdmin
                  ? `<td>${Number(q.submitted_count || 0)}/${Number(q.total_members || 0)}</td>`
                  : `<td>${escapeHtml(classStatusLabel(q.my_status))}${q.my_best_percent != null ? ' - ' + Number(q.my_best_percent) + '%' : ''}</td>`
                }
                <td class="inline-actions">
                  ${isAdmin ? `<button class="ghost-btn" type="button" data-class-action="view-results" data-quiz-id="${escapeHtml(q.quiz_id)}" data-quiz-title="${escapeHtml(q.title)}">Kết quả</button>` : ''}
                  ${isAdmin ? `<button class="ghost-btn" type="button" data-class-action="delete-quiz" data-quiz-id="${escapeHtml(q.quiz_id)}">Xoá</button>` : ''}
                  ${!isAdmin && q.my_status !== 'submitted' ? `<button class="primary-btn" type="button" data-class-action="take-quiz" data-quiz-id="${escapeHtml(q.quiz_id)}" data-quiz-title="${escapeHtml(q.title)}">${q.my_status === 'in_progress' ? 'Tiếp tục làm' : 'Làm bài'}</button>` : ''}
                  ${!isAdmin && q.my_status === 'submitted' ? '<span class="muted-text">Đã nộp bài</span>' : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>
  `;
}

async function handleLeaveClass() {
  if (!classState.classId) return;
  if (!window.confirm('Bạn có chắc muốn rời lớp này?')) return;
  try {
    const { error } = await supabase.rpc('leave_class', { p_class_id: classState.classId });
    if (error) throw error;
    classState.screen = 'list';
    classSetMessage('Đã rời lớp.', 'success');
    await loadMyClasses();
  } catch (err) {
    classSetMessage(err.message || 'Không rời được lớp.', 'error');
    renderClassDetailScreen();
  }
}

// ---------- 3. Quản lý thành viên (admin) ------------------------------------

async function openClassMembers() {
  classState.screen = 'members';
  classState.loading = true;
  renderClassMembersScreen();
  try {
    const { data, error } = await supabase.rpc('get_class_members', { p_class_id: classState.classId });
    if (error) throw error;
    classState.members = data || [];
  } catch (err) {
    classSetMessage(err.message || 'Không tải được danh sách thành viên.', 'error');
  } finally {
    classState.loading = false;
    renderClassMembersScreen();
  }
}

function renderClassMembersScreen() {
  const d = classState.classDetail;
  elements.classContent.innerHTML = `
    <div class="section-header">
      <div>
        <p class="eyebrow">Lớp học</p>
        <h3>Thành viên - ${escapeHtml(d?.name || '')}</h3>
      </div>
      <button class="ghost-btn" type="button" data-class-action="back-detail">← Quay lại lớp</button>
    </div>
    ${classMessageHtml()}
    ${classState.loading ? '<p class="muted-text">Đang tải...</p>' : ''}
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Tên</th><th>Email</th><th>Vai trò</th><th>Tham gia</th><th></th></tr>
        </thead>
        <tbody>
          ${classState.members.map((m) => `
            <tr>
              <td>${escapeHtml(m.full_name)}</td>
              <td>${escapeHtml(m.email || '')}</td>
              <td>${m.role === 'admin' ? 'Quản trị' : 'Thành viên'}</td>
              <td>${formatClassDate(m.joined_at)}</td>
              <td class="inline-actions">
                ${m.user_id !== d?.owner_id ? `
                  <button class="ghost-btn" type="button" data-class-action="toggle-role" data-user-id="${escapeHtml(m.user_id)}" data-current-role="${escapeHtml(m.role)}">${m.role === 'admin' ? 'Hạ xuống thành viên' : 'Nâng làm quản trị'}</button>
                  <button class="ghost-btn" type="button" data-class-action="remove-member" data-user-id="${escapeHtml(m.user_id)}">Xoá</button>
                ` : '<span class="muted-text">Chủ lớp</span>'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function handleToggleMemberRole(userId, currentRole) {
  const newRole = currentRole === 'admin' ? 'member' : 'admin';
  try {
    const { error } = await supabase.rpc('update_class_member_role', {
      p_class_id: classState.classId, p_user_id: userId, p_role: newRole,
    });
    if (error) throw error;
    await openClassMembers();
  } catch (err) {
    classSetMessage(err.message || 'Không đổi được vai trò.', 'error');
    renderClassMembersScreen();
  }
}

async function handleRemoveMember(userId) {
  if (!window.confirm('Xoá thành viên này khỏi lớp?')) return;
  try {
    const { error } = await supabase.rpc('remove_class_member', {
      p_class_id: classState.classId, p_user_id: userId,
    });
    if (error) throw error;
    await openClassMembers();
  } catch (err) {
    classSetMessage(err.message || 'Không xoá được thành viên.', 'error');
    renderClassMembersScreen();
  }
}

// ---------- 4. Tạo bài kiểm tra (admin) ---------------------------------------

async function showCreateQuizForm() {
  classState.screen = 'createQuiz';
  classState.lessonsForQuiz = [];
  renderCreateQuizForm();
  const subjectSlug = classState.classDetail?.subject_slug;
  if (subjectSlug) {
    try {
      const { data } = await supabase.rpc('get_lessons', { p_subject_slug: subjectSlug });
      classState.lessonsForQuiz = data || [];
    } catch {
      classState.lessonsForQuiz = [];
    }
    renderCreateQuizForm();
  }
}

function renderCreateQuizForm() {
  const d = classState.classDetail;
  const subjectOptions = availableSubjects.map((s) =>
    `<option value="${escapeHtml(s.slug)}" ${s.slug === d?.subject_slug ? 'selected' : ''}>${escapeHtml(s.name)}</option>`
  ).join('');
  const lessonOptions = classState.lessonsForQuiz.map((l) =>
    `<option value="${escapeHtml(l.lesson)}">${escapeHtml(l.lesson)} (${Number(l.question_count)} câu)</option>`
  ).join('');

  elements.classContent.innerHTML = `
    <div class="section-header">
      <div>
        <p class="eyebrow">Lớp học</p>
        <h3>Tạo bài kiểm tra</h3>
      </div>
      <button class="ghost-btn" type="button" data-class-action="back-detail">← Quay lại lớp</button>
    </div>
    ${classMessageHtml()}
    <form class="auth-form" data-class-form="createQuiz">
      <label for="quizTitleInput">Tên bài kiểm tra</label>
      <input id="quizTitleInput" name="title" type="text" placeholder="VD: Kiểm tra 15 phút - Bài 1" required />

      <label for="quizDescInput">Mô tả (không bắt buộc)</label>
      <input id="quizDescInput" name="description" type="text" />

      <label for="quizSubjectInput">Môn học</label>
      <select id="quizSubjectInput" name="subject_slug" data-class-onchange="quiz-subject">
        <option value="">-- Chọn môn --</option>
        ${subjectOptions}
      </select>

      <label for="quizLessonInput">Bài / phần (không bắt buộc)</label>
      <select id="quizLessonInput" name="lesson">
        <option value="">-- Tất cả các bài --</option>
        ${lessonOptions}
      </select>

      <label for="quizCountInput">Số câu hỏi</label>
      <input id="quizCountInput" name="question_count" type="number" min="1" max="200" value="10" required />

      <label for="quizTimeInput">Thời gian làm bài (phút, để trống = không giới hạn)</label>
      <input id="quizTimeInput" name="time_limit_minutes" type="number" min="1" max="300" />

      <label for="quizAttemptsInput">Số lượt làm bài tối đa</label>
      <input id="quizAttemptsInput" name="max_attempts" type="number" min="1" max="10" value="1" required />

      <button class="primary-btn" type="submit" ${classState.loading ? 'disabled' : ''}>Tạo bài kiểm tra</button>
    </form>
  `;
}

async function handleCreateQuizSubjectChange(select) {
  const subjectSlug = select.value;
  if (!subjectSlug) {
    classState.lessonsForQuiz = [];
    renderCreateQuizForm();
    return;
  }
  try {
    const { data } = await supabase.rpc('get_lessons', { p_subject_slug: subjectSlug });
    classState.lessonsForQuiz = data || [];
  } catch {
    classState.lessonsForQuiz = [];
  }
  renderCreateQuizForm();
}

async function handleCreateQuizSubmit(form) {
  const title = form.querySelector('#quizTitleInput')?.value?.trim();
  const description = form.querySelector('#quizDescInput')?.value?.trim();
  const subjectSlug = form.querySelector('#quizSubjectInput')?.value?.trim();
  const lesson = form.querySelector('#quizLessonInput')?.value?.trim();
  const count = parseInt(form.querySelector('#quizCountInput')?.value, 10) || 10;
  const timeLimitRaw = form.querySelector('#quizTimeInput')?.value?.trim();
  const timeLimit = timeLimitRaw ? parseInt(timeLimitRaw, 10) : null;
  const maxAttempts = parseInt(form.querySelector('#quizAttemptsInput')?.value, 10) || 1;

  if (!title) {
    classSetMessage('Vui lòng nhập tên bài kiểm tra.', 'error');
    renderCreateQuizForm();
    return;
  }

  classState.loading = true;
  classSetMessage('');
  renderCreateQuizForm();
  try {
    const { data, error } = await supabase.rpc('create_class_quiz', {
      p_class_id: classState.classId,
      p_title: title,
      p_description: description || null,
      p_subject_slug: subjectSlug || null,
      p_lesson: lesson || null,
      p_question_count: count,
      p_time_limit_minutes: timeLimit,
      p_max_attempts: maxAttempts,
      p_start_at: null,
      p_end_at: null,
    });
    if (error) throw error;
    classSetMessage(`Đã tạo bài kiểm tra "${data.title}" với ${data.question_count} câu hỏi.`, 'success');
    classState.loading = false;
    await openClassDetail(classState.classId);
  } catch (err) {
    classSetMessage(err.message || 'Không tạo được bài kiểm tra.', 'error');
    classState.loading = false;
    renderCreateQuizForm();
  }
}

async function handleDeleteQuiz(quizId) {
  if (!window.confirm('Xoá bài kiểm tra này? Toàn bộ bài làm liên quan sẽ bị xoá.')) return;
  try {
    const { error } = await supabase.rpc('delete_class_quiz', { p_quiz_id: quizId });
    if (error) throw error;
    await openClassDetail(classState.classId);
  } catch (err) {
    classSetMessage(err.message || 'Không xoá được bài kiểm tra.', 'error');
    renderClassDetailScreen();
  }
}

// ---------- 5. Làm bài kiểm tra (học sinh) ------------------------------------

async function openTakeQuiz(quizId, quizTitle) {
  classState.screen = 'takeQuiz';
  classState.quizId = quizId;
  classState.takeQuizTitle = quizTitle || '';
  classState.takeQuizIndex = 0;
  classState.takeQuizAnswers = {};
  classSetMessage('');
  elements.classContent.innerHTML = `<p class="muted-text">Đang tải câu hỏi...</p>`;
  try {
    const { data, error } = await supabase.rpc('start_class_quiz_attempt', { p_class_quiz_id: quizId });
    if (error) throw error;
    if (!data || !data.length) throw new Error('Bài kiểm tra không có câu hỏi.');
    classState.attemptId = data[0].attempt_id;
    classState.takeQuizQuestions = data;

    // Hạn nộp do SERVER tính (deadline_at = sớm hơn giữa started_at + số phút
    // và giờ đóng bài end_at). Server cũng trả server_now để bù lệch đồng hồ
    // của máy học sinh. Server tự từ chối đáp án nộp quá hạn + 2 phút ân hạn.
    const { deadline_at: deadlineAt, server_now: serverNow } = data[0];
    const timeLimitMinutes = data[0].time_limit_minutes;
    const startedAt = data[0].started_at;
    let deadline = null;
    if (deadlineAt) {
      const clockOffset = serverNow ? new Date(serverNow).getTime() - Date.now() : 0;
      deadline = new Date(deadlineAt).getTime() - clockOffset;
    } else if (timeLimitMinutes && startedAt && deadlineAt === undefined) {
      // Dự phòng khi server chưa có cột deadline_at (phiên bản RPC cũ).
      deadline = new Date(startedAt).getTime() + timeLimitMinutes * 60 * 1000;
    }
    if (deadline) {
      classState.takeQuizDeadline = deadline;
      if (classState.takeQuizDeadline <= Date.now()) {
        // Hết giờ ngay khi mở lại (đã quá hạn từ trước) -> nộp bài luôn.
        stopClassQuizTimer();
        renderTakeQuizScreen();
        await submitTakeQuiz(true);
        return;
      }
      startClassQuizTimer();
    } else {
      classState.takeQuizDeadline = null;
    }
    renderTakeQuizScreen();
  } catch (err) {
    classState.screen = 'detail';
    classSetMessage(err.message || 'Không bắt đầu được bài kiểm tra.', 'error');
    renderClassDetailScreen();
  }
}

function startClassQuizTimer() {
  stopClassQuizTimer();
  classState.takeQuizTimerId = setInterval(() => {
    if (!classState.takeQuizDeadline) return;
    const remainMs = classState.takeQuizDeadline - Date.now();
    if (remainMs <= 0) {
      stopClassQuizTimer();
      submitTakeQuiz(true);
      return;
    }
    const badge = document.getElementById('classQuizTimer');
    if (badge) {
      const totalSec = Math.floor(remainMs / 1000);
      const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
      const ss = String(totalSec % 60).padStart(2, '0');
      badge.textContent = `${mm}:${ss}`;
    }
  }, 1000);
}

function stopClassQuizTimer() {
  if (classState.takeQuizTimerId) {
    clearInterval(classState.takeQuizTimerId);
    classState.takeQuizTimerId = null;
  }
}

function renderTakeQuizScreen() {
  const questions = classState.takeQuizQuestions;
  const idx = classState.takeQuizIndex;
  const q = questions[idx];
  if (!q) return;

  const options = [
    { key: 'A', text: q.option_a },
    { key: 'B', text: q.option_b },
    { key: 'C', text: q.option_c },
    { key: 'D', text: q.option_d },
  ].filter((opt) => hasOptionText(opt.text));
  const selected = classState.takeQuizAnswers[q.question_id];
  const answeredCount = Object.keys(classState.takeQuizAnswers).length;
  const isLast = idx === questions.length - 1;

  elements.classContent.innerHTML = `
    <div class="quiz-header">
      <div>
        <p class="eyebrow">Đang làm bài kiểm tra lớp</p>
        <h3>${escapeHtml(classState.takeQuizTitle)}</h3>
      </div>
      ${classState.takeQuizDeadline ? `<div class="timer-badge" id="classQuizTimer">--:--</div>` : ''}
    </div>
    <p class="muted-text">Đã trả lời ${answeredCount}/${questions.length} câu. Đáp án chỉ hiện sau khi bạn nộp bài.</p>
    <div class="quiz-card">
      <p class="question-index">Câu ${idx + 1}/${questions.length}</p>
      <p class="question-text">${escapeHtml(q.question_text || '')}</p>
      <div class="option-list">
        ${options.map((opt) => `
          <button class="option-btn ${selected === opt.key ? 'selected' : ''}" type="button" data-class-action="select-answer" data-key="${opt.key}">
            <span class="option-label">${opt.key}. ${escapeHtml(opt.text || '')}</span>
          </button>
        `).join('')}
      </div>
    </div>
    <div class="quiz-actions">
      <button class="ghost-btn" type="button" data-class-action="quiz-prev" ${idx === 0 ? 'disabled' : ''}>Câu trước</button>
      ${!isLast ? `<button class="primary-btn" type="button" data-class-action="quiz-next">Câu tiếp theo</button>` : ''}
      ${isLast ? `<button class="primary-btn" type="button" data-class-action="quiz-submit">Nộp bài</button>` : ''}
    </div>
  `;
  if (classState.takeQuizDeadline) startClassQuizTimer();
}

function handleSelectAnswer(key) {
  const q = classState.takeQuizQuestions[classState.takeQuizIndex];
  if (!q) return;
  classState.takeQuizAnswers[q.question_id] = key;
  renderTakeQuizScreen();
}

function handleQuizPrev() {
  if (classState.takeQuizIndex > 0) {
    classState.takeQuizIndex -= 1;
    renderTakeQuizScreen();
  }
}

function handleQuizNext() {
  if (classState.takeQuizIndex < classState.takeQuizQuestions.length - 1) {
    classState.takeQuizIndex += 1;
    renderTakeQuizScreen();
  }
}

async function submitTakeQuiz(auto = false) {
  stopClassQuizTimer();
  const unanswered = classState.takeQuizQuestions.length - Object.keys(classState.takeQuizAnswers).length;
  if (!auto && unanswered > 0) {
    const ok = window.confirm(`Bạn còn ${unanswered} câu chưa trả lời. Vẫn nộp bài?`);
    if (!ok) return;
  }
  const answers = classState.takeQuizQuestions.map((q) => ({
    question_id: q.question_id,
    selected_answer: classState.takeQuizAnswers[q.question_id] || null,
  }));

  elements.classContent.innerHTML = `<p class="muted-text">Đang chấm điểm...</p>`;
  try {
    const { data, error } = await supabase.rpc('submit_class_quiz_attempt', {
      p_attempt_id: classState.attemptId,
      p_answers: answers,
    });
    if (error) throw error;
    classState.reviewData = data || [];
    const correct = classState.reviewData.filter((r) => r.is_correct).length;
    classState.reviewSummary = {
      correct,
      total: classState.reviewData.length,
      timedOut: Boolean(classState.reviewData[0] && classState.reviewData[0].timed_out),
    };
    classState.screen = 'review';
    renderReviewScreen();
  } catch (err) {
    classState.screen = 'detail';
    classSetMessage(err.message || 'Không nộp được bài.', 'error');
    await openClassDetail(classState.classId);
  }
}

function renderReviewScreen() {
  const s = classState.reviewSummary;
  const percent = s && s.total > 0 ? Math.round((s.correct / s.total) * 1000) / 10 : 0;
  elements.classContent.innerHTML = `
    <div class="section-header">
      <div>
        <p class="eyebrow">Kết quả</p>
        <h3>${escapeHtml(classState.takeQuizTitle)}</h3>
      </div>
      <button class="primary-btn" type="button" data-class-action="back-detail">Xong</button>
    </div>
    <div class="about-card" style="margin-bottom:16px;">
      <p><strong>Điểm: ${s ? s.correct : 0}/${s ? s.total : 0} (${percent}%)</strong></p>
      ${s && s.timedOut ? '<p class="muted-text">Bài được nộp sau hạn chót nên đáp án không được tính.</p>' : ''}
    </div>
    ${classState.reviewData.map((r) => `
      <div class="quiz-card" style="margin-bottom:12px;">
        <p class="question-index">Câu ${Number(r.question_order)}</p>
        <p class="question-text">${escapeHtml(r.question_text || '')}</p>
        <div class="option-list">
          ${['A', 'B', 'C', 'D'].filter((key) => hasOptionText(r['option_' + key.toLowerCase()])).map((key) => {
            const text = r['option_' + key.toLowerCase()];
            const isCorrect = key === r.correct_answer;
            const isSelected = key === r.selected_answer;
            const classes = ['option-btn'];
            if (isCorrect) classes.push('correct');
            if (isSelected && !isCorrect) classes.push('wrong');
            return `<div class="${classes.join(' ')}"><span class="option-label">${key}. ${escapeHtml(text || '')}</span>${isCorrect ? '<strong>Đáp án đúng</strong>' : ''}</div>`;
          }).join('')}
        </div>
        <div class="feedback ${r.is_correct ? 'correct' : 'incorrect'}">
          <div class="feedback-result">${r.selected_answer ? (r.is_correct ? 'Bạn trả lời đúng.' : `Bạn chọn ${escapeHtml(r.selected_answer)}, đáp án đúng là ${escapeHtml(r.correct_answer)}.`) : `Bạn chưa trả lời câu này. Đáp án đúng là ${escapeHtml(r.correct_answer)}.`}</div>
          ${r.explanation ? `<div class="answer-explanation"><strong>Giải thích:</strong> <span>${escapeHtml(r.explanation)}</span></div>` : ''}
        </div>
      </div>
    `).join('')}
  `;
}

// ---------- 6. Bảng tổng kết (admin) ------------------------------------------

async function openQuizLeaderboard(quizId, quizTitle) {
  classState.screen = 'quizResults';
  classState.quizLeaderboardTitle = quizTitle || '';
  classState.loading = true;
  renderQuizLeaderboardScreen();
  try {
    const { data, error } = await supabase.rpc('get_class_quiz_leaderboard', { p_class_quiz_id: quizId });
    if (error) throw error;
    classState.quizLeaderboard = data || [];
  } catch (err) {
    classSetMessage(err.message || 'Không tải được kết quả.', 'error');
  } finally {
    classState.loading = false;
    renderQuizLeaderboardScreen();
  }
}

function renderQuizLeaderboardScreen() {
  const rows = classState.quizLeaderboard;
  const submitted = rows.filter((r) => r.status === 'submitted');
  const avg = submitted.length
    ? Math.round((submitted.reduce((sum, r) => sum + Number(r.percent || 0), 0) / submitted.length) * 10) / 10
    : 0;

  elements.classContent.innerHTML = `
    <div class="section-header">
      <div>
        <p class="eyebrow">Kết quả</p>
        <h3>${escapeHtml(classState.quizLeaderboardTitle)}</h3>
      </div>
      <button class="ghost-btn" type="button" data-class-action="back-detail">← Quay lại lớp</button>
    </div>
    ${classMessageHtml()}
    <div class="about-card" style="margin-bottom:16px;">
      <p class="muted-text">Đã nộp: ${submitted.length}/${rows.length} &nbsp;|&nbsp; Điểm trung bình: ${avg}%</p>
    </div>
    ${classState.loading ? '<p class="muted-text">Đang tải...</p>' : ''}
    <div class="table-wrap">
      <table>
        <thead><tr><th>Tên</th><th>Trạng thái</th><th>Đúng/Tổng</th><th>Điểm %</th><th>Nộp lúc</th></tr></thead>
        <tbody>
          ${rows.map((r) => `
            <tr>
              <td>${escapeHtml(r.full_name)}</td>
              <td>${escapeHtml(classStatusLabel(r.status))}</td>
              <td>${r.correct_count != null ? `${Number(r.correct_count)}/${Number(r.total_count)}` : '-'}</td>
              <td>${r.percent != null ? Number(r.percent) + '%' : '-'}</td>
              <td>${formatClassDate(r.submitted_at)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ---------- 7. Event delegation ----------------------------------------------

function wireClassEvents() {
  if (!elements.classContent) return;

  elements.classContent.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-class-action]');
    if (!btn) return;
    const action = btn.dataset.classAction;

    switch (action) {
      case 'show-create':
        classState.screen = 'create';
        classSetMessage('');
        renderClassScreen();
        break;
      case 'show-join':
        classState.screen = 'join';
        classSetMessage('');
        renderClassScreen();
        break;
      case 'back-list':
        classState.screen = 'list';
        classSetMessage('');
        renderClassListScreen();
        break;
      case 'back-detail':
        classSetMessage('');
        stopClassQuizTimer();
        if (classState.classId) {
          openClassDetail(classState.classId); // Tải lại dữ liệu mới nhất (điểm, trạng thái nộp bài...)
        } else {
          classState.screen = 'list';
          loadMyClasses();
        }
        break;
      case 'open-class':
        openClassDetail(btn.dataset.classId);
        break;
      case 'open-members':
        openClassMembers();
        break;
      case 'show-create-quiz':
        showCreateQuizForm();
        break;
      case 'toggle-role':
        handleToggleMemberRole(btn.dataset.userId, btn.dataset.currentRole);
        break;
      case 'remove-member':
        handleRemoveMember(btn.dataset.userId);
        break;
      case 'delete-quiz':
        handleDeleteQuiz(btn.dataset.quizId);
        break;
      case 'view-results':
        openQuizLeaderboard(btn.dataset.quizId, btn.dataset.quizTitle);
        break;
      case 'take-quiz':
        openTakeQuiz(btn.dataset.quizId, btn.dataset.quizTitle);
        break;
      case 'select-answer':
        handleSelectAnswer(btn.dataset.key);
        break;
      case 'quiz-prev':
        handleQuizPrev();
        break;
      case 'quiz-next':
        handleQuizNext();
        break;
      case 'quiz-submit':
        submitTakeQuiz(false);
        break;
      case 'leave-class':
        handleLeaveClass();
        break;
      default:
        break;
    }
  });

  elements.classContent.addEventListener('change', (e) => {
    const select = e.target.closest('[data-class-onchange="quiz-subject"]');
    if (select) handleCreateQuizSubjectChange(select);
  });

  elements.classContent.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-class-form]');
    if (!form) return;
    e.preventDefault();
    const type = form.dataset.classForm;
    if (type === 'create') handleCreateClassSubmit(form);
    else if (type === 'join') handleJoinClassSubmit(form);
    else if (type === 'createQuiz') handleCreateQuizSubmit(form);
  });
}

function wireEvents() {
  // Xóa nút "Tài khoản" khỏi menu chính (chỉ dùng ô user ở cuối sidebar để vào trang Tài khoản)
  const accountNavBtn = document.querySelector('.sidebar-item[data-nav="account"]');
  // New: If mobile menu toggle is in header, remove it from sidebar
  if (elements.mobileMenuToggle && elements.mobileMenuToggle.parentNode === elements.sidebar) {
    elements.mobileMenuToggle.remove();
  }

  if (accountNavBtn) accountNavBtn.remove();

  // toggle button to collapse/expand sidebar
  if (elements.sidebarToggle) {
    elements.sidebarToggle.addEventListener('click', () => {
      if (!elements.sidebar) return;
      const collapsed = elements.sidebar.classList.contains('is-collapsed');
      setSidebarCollapsed(!collapsed);
    });
  }


    if (elements.sidebarItems?.length) {
    elements.sidebarItems.forEach((item) => {
      item.addEventListener('click', (e) => {
        const nav = item.dataset.nav;
        if (!nav) return;
        navigateFromSidebar(nav);
      });
    });
  }

  // Ô tên người dùng (cuối sidebar) -> mở trang Tài khoản
  if (elements.userBadge) {
    elements.userBadge.addEventListener('click', () => navigateFromSidebar('account'));
    elements.userBadge.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigateFromSidebar('account');
      }
    });
    elements.userBadge.tabIndex = 0;
    elements.userBadge.setAttribute('role', 'button');
  }


  elements.modeChips.forEach((chip) => {
    chip.addEventListener('click', () => setAuthMode(chip.dataset.authMode));
  });

  // Nút "hiện/ẩn mật khẩu" (icon con mắt) - cho phép xem rõ ký tự đã gõ
  // trước khi bấm đăng nhập, tránh trường hợp autofill/gõ nhầm mà không
  // để ý (đặc biệt hay gặp trên điện thoại).
  document.querySelectorAll('.password-toggle-btn[data-password-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetInput = document.getElementById(btn.dataset.passwordToggle);
      if (!targetInput) return;
      const willShow = targetInput.type === 'password';
      targetInput.type = willShow ? 'text' : 'password';
      btn.setAttribute('aria-pressed', String(willShow));
      btn.setAttribute(
        'aria-label',
        willShow
          ? (btn.dataset.passwordToggle === 'confirmPasswordInput' ? 'Ẩn mật khẩu nhập lại' : 'Ẩn mật khẩu')
          : (btn.dataset.passwordToggle === 'confirmPasswordInput' ? 'Hiện mật khẩu nhập lại' : 'Hiện mật khẩu')
      );
      targetInput.focus({ preventScroll: true });
    });
  });

  elements.authForm.addEventListener('submit', handleAuthSubmit);

  if (elements.forgotPasswordBtn) {
    elements.forgotPasswordBtn.addEventListener('click', toggleForgotPassword);
  }
  if (elements.cancelResetBtn) {
    elements.cancelResetBtn.addEventListener('click', cancelForgotPassword);
  }
  if (elements.sendResetBtn) {
    elements.sendResetBtn.addEventListener('click', sendResetEmail);
  }

  const changePasswordBtn = document.getElementById('changePasswordBtn');
  if (changePasswordBtn) {
    changePasswordBtn.addEventListener('click', changePasswordFromAccount);
  }


    if (elements.lessonSelect) {
      elements.lessonSelect.addEventListener('change', () => {
        selectedLesson = elements.lessonSelect.value || 'all';
      });
    }

    if (elements.practiceStartBtn) {
        elements.practiceStartBtn.addEventListener('click', async () => {
          if (isLoading) return;
          elements.practiceStartBtn.disabled = true;
          try {
            await startPractice();
          } finally {
            elements.practiceStartBtn.disabled = false;
          }
        });
      }

    if (elements.practiceContinueBtn) {
      elements.practiceContinueBtn.addEventListener('click', continuePausedQuiz);
    }


  if (elements.editNameBtn) {
    elements.editNameBtn.addEventListener('click', openEditName);
  }
  if (elements.cancelNameBtn) {
    elements.cancelNameBtn.addEventListener('click', cancelEditName);
  }
    if (elements.saveNameBtn) {
    elements.saveNameBtn.addEventListener('click', saveNewName);
  }
  if (elements.newNameInput) {
    elements.newNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveNewName();
      }
    });
  }


  if (elements.sendFeedbackBtn) {
    elements.sendFeedbackBtn.addEventListener('click', sendFeedbackEmail);
  }

  elements.logoutBtn.addEventListener('click', handleLogout);
  elements.refreshHistoryBtn.addEventListener('click', loadHistory);
  if (elements.refreshLeaderboardBtn) {
    elements.refreshLeaderboardBtn.addEventListener('click', loadLeaderboard);
  }
  if (elements.retryWrongBtn) {
    elements.retryWrongBtn.addEventListener('click', startRetryWrongQuiz);
  }
    if (elements.pauseBtn) {
    elements.pauseBtn.addEventListener('click', togglePause);
  }

  if (elements.prevQuestionBtn) {
    elements.prevQuestionBtn.addEventListener('click', goToPrevQuestion);
  }

    elements.nextQuestionBtn.addEventListener('click', goToNextQuestion);
  elements.submitQuizBtn.addEventListener('click', submitQuiz);

  // THI THỬ: chọn 30/70 chỉ cập nhật state, không bắt đầu làm bài
  elements.modeCards.forEach((button) => {
    button.addEventListener('click', () => {
      const mode = String(button.dataset.mode || '30');
      selectedExamType = mode === '70' ? 'exam_70' : 'exam_30';

      elements.modeCards.forEach((btn) => {
        btn.classList.toggle('selected', btn === button);
      });
    });
  });

    // THI THỬ: nút bắt đầu
  if (elements.examStartBtn) {
    elements.examStartBtn.addEventListener('click', async () => {
      if (isLoading) return;

            if (!selectedExamType) {
        setTempButtonLabel(elements.examStartBtn, 'Vui lòng chọn đề thi thử');
        return;
      }


      const total = selectedExamType === 'exam_70' ? 70 : 30;
      elements.examStartBtn.disabled = true;
      try {
        await startExam(total);
      } finally {
        elements.examStartBtn.disabled = false;
      }
    });
  }

  if (elements.changeSubjectBtn) {
    elements.changeSubjectBtn.addEventListener('click', () => {
      // Chỉ bỏ xác nhận môn trên giao diện; không xóa bài tạm của môn cũ.
      confirmedSubjectSlug = null;
      pausedQuizDraft = null;
      syncPausedQuizButtons();
      updateHomeCardsVisibility();

      if (elements.confirmSubjectBtn) {
        elements.confirmSubjectBtn.disabled = !selectedSubjectSlug;
      }
    });
  }

  if (elements.confirmSubjectBtn) {
    elements.confirmSubjectBtn.addEventListener('click', () => {
      if (selectedSubjectSlug) {
        confirmedSubjectSlug = selectedSubjectSlug;
        selectedLesson = 'all';

        updateHomeCardsVisibility();
        loadLessons();

        // Chỉ tìm bài tạm đúng tài khoản và đúng môn vừa xác nhận.
        syncPausedQuizButtons();

        const subject = availableSubjects.find(
          (item) => item.slug === confirmedSubjectSlug
        );
        if (subject) setStatus(`Đã chọn môn: ${subject.name}`, 'info');
      }
    });
  }

  if (elements.examContinueBtn) {
    elements.examContinueBtn.addEventListener('click', continuePausedQuiz);
  }



}


function handleAutoSaveAndPause() {
  if (!questions.length) return;
  isPaused = true;
  stopTimer();
  saveDraft();
}

window.addEventListener('pagehide', handleAutoSaveAndPause);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    handleAutoSaveAndPause();
  }
});


function isPasswordRecoveryUrl() {
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(
    window.location.hash.replace(/^#/, '')
  );

  return (
    searchParams.get('recovery') === '1' ||
    hashParams.get('type') === 'recovery'
  );
}

function openPasswordRecovery(session) {
  if (!session?.user) return;

  updateUserUI(session);

  // Không cho app chuyển thẳng vào trang chủ
  setView('auth');

  window.setTimeout(() => {
    showPasswordRecoveryModal();
  }, 0);
}

(async function init() {
  // Dòng phiên bản: căn giữa theo toàn bộ trang (không theo cột phải)
  ensureVersionFooterPlacement();

  if (configError) {
    setStatus(configError, 'error');
  }

  // Luôn xác định trạng thái thanh bên theo kích thước cửa sổ hiện tại khi tải, không phải giá trị đã lưu.
  // Điều này ngăn trạng thái "thu gọn" từ phiên di động làm hỏng bố cục trên máy tính để bàn.
  // Người dùng vẫn có thể chuyển đổi thanh bên theo cách thủ công trong phiên.
  setSidebarCollapsed(window.matchMedia('(max-width: 768px)').matches);

    // mặc định: Trang chủ bị ẩn, chỉ hiện sau khi bấm menu hoặc sau khi đăng nhập
  setView('auth');

    // Tách layout Luyện tập / Thi thử (chỉ DOM client-side, không đổi HTML gốc)
  setupHomeViewLayout();

    // Mobile menu on small screens
    ensureMobileMenuUI();

    ensureForgotPasswordUI();
    ensureAccountPasswordUI();



  // Thêm nút điều hướng câu hỏi trong màn hình làm bài
  setupQuizNavigationButtons();

  wireEvents();
  wireClassEvents();


  setAuthMode('login');
  showCaptcha('authCaptcha');
updateHomeCaret();

if (!configError) {
  supabase.auth.onAuthStateChange((event, session) => {
    console.log('[Auth event]', event);

    const isRecoveryFlow =
      event === 'PASSWORD_RECOVERY' ||
      (isPasswordRecoveryUrl() && Boolean(session?.user));

    if (isRecoveryFlow) {
      openPasswordRecovery(session);
      return;
    }

    // Phiên ban đầu đã được checkSession xử lý
    if (event === 'INITIAL_SESSION') {
      return;
    }

    updateUserUI(session);

    if (session?.user) {
      ensureProfileForSession(session);
      updateRetryWrongButton();

      Promise.all([
        loadHistory(),
        loadLeaderboard(),
        loadLessons(),
      ]);

      setView('home');
    } else {
      clearQuizState();
      setView('auth');
    }
  });
}

await checkSession();

// Link mời vào lớp dạng ...?join=MACODE: nếu đã đăng nhập, tự mở sẵn form
// tham gia lớp kèm mã (điền sẵn, không tự động nộp - vẫn cần người dùng
// bấm "Tham gia" để xác nhận).
try {
  const joinCode = new URLSearchParams(window.location.search).get('join');
  if (joinCode && currentUserId) {
    classState.joinCodePrefill = joinCode.toUpperCase();
    classState.screen = 'join';
    navigateFromSidebar('classes');
    window.history.replaceState({}, '', window.location.pathname);
  }
} catch {
  // bỏ qua nếu trình duyệt không hỗ trợ URLSearchParams
}

/*
 * Dự phòng trường hợp PASSWORD_RECOVERY xuất hiện
 * trước khi listener được đăng ký.
 */
if (!configError && isPasswordRecoveryUrl()) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  openPasswordRecovery(session);
}

  // Xóa khóa lưu kiểu cũ dùng chung cho mọi môn.
  // Từ phiên bản này, mỗi tài khoản + môn có một khóa riêng.
  localStorage.removeItem(LEGACY_QUIZ_DRAFT_KEY);

    // Nếu có bài làm đang lưu, chỉ hiển thị nút "Tiếp tục" ở màn hình Home.
  // Không tự động nhảy vào màn hình làm bài.
  pausedQuizDraft = getPausedQuizDraft(confirmedSubjectSlug, currentUserId);
  syncPausedQuizButtons();


  if (configError) {
    return;
  }

    


})();

// Service Worker chỉ chạy khi đưa web lên hosting.
// Khi chạy Live Server thì tự gỡ bản cũ để không báo lỗi.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    const isLocalhost =
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === 'localhost';

    if (isLocalhost) {
      try {
        const registrations =
          await navigator.serviceWorker.getRegistrations();

        await Promise.all(
          registrations.map((registration) =>
            registration.unregister()
          )
        );

        const cacheNames = await caches.keys();

        await Promise.all(
          cacheNames.map((cacheName) =>
            caches.delete(cacheName)
          )
        );

        console.log('Service Worker đã được tắt trên Live Server.');
      } catch (error) {
        console.warn('Không thể dọn Service Worker cũ:', error);
      }

      return;
    }

    try {
      await navigator.serviceWorker.register('./sw.js');
      console.log('Service Worker đã đăng ký thành công.');
    } catch (error) {
      console.error('Không thể đăng ký Service Worker:', error);
    }
  });
}