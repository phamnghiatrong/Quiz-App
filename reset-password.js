import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
} from './config.js';

const loadingView = document.getElementById('loadingView');
const resetView = document.getElementById('resetView');
const errorView = document.getElementById('errorView');
const successView = document.getElementById('successView');

const loadingStatus = document.getElementById('loadingStatus');
const errorMessage = document.getElementById('errorMessage');
const resetForm = document.getElementById('resetForm');
const resetStatus = document.getElementById('resetStatus');
const savePasswordBtn = document.getElementById('savePasswordBtn');
const newPasswordInput = document.getElementById('newPassword');
const confirmPasswordInput = document.getElementById('confirmPassword');

const showOnly = (target) => {
  [loadingView, resetView, errorView, successView].forEach((view) => {
    if (view) view.hidden = view !== target;
  });
};

const setResetStatus = (message, variant = '') => {
  if (!resetStatus) return;
  resetStatus.textContent = message || '';
  resetStatus.className = `status ${variant}`.trim();
};

const cleanSensitiveUrl = () => {
  window.history.replaceState(
    {},
    document.title,
    window.location.pathname
  );
};

const getUrlError = () => {
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));

  return (
    search.get('error_description') ||
    hash.get('error_description') ||
    search.get('error') ||
    hash.get('error') ||
    ''
  );
};

const showError = (message) => {
  cleanSensitiveUrl();

  if (errorMessage) {
    errorMessage.textContent =
      message || 'Liên kết không hợp lệ hoặc đã hết hạn.';
  }

  showOnly(errorView);
};

const configIsInvalid =
  !String(SUPABASE_URL || '').trim() ||
  !String(SUPABASE_ANON_KEY || '').trim() ||
  String(SUPABASE_ANON_KEY).includes('service_role');

if (configIsInvalid) {
  showError('Cấu hình Supabase không hợp lệ.');
  throw new Error('Invalid Supabase configuration.');
}

const supabase = createClient(
  String(SUPABASE_URL).trim(),
  String(SUPABASE_ANON_KEY).trim(),
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage,
    },
  }
);

let recoveryReady = false;
let initializationFinished = false;

const openResetForm = (session) => {
  if (!session?.user || recoveryReady) return;

  recoveryReady = true;
  cleanSensitiveUrl();
  showOnly(resetView);

  window.setTimeout(() => {
    newPasswordInput?.focus();
  }, 0);
};

const authSubscription = supabase.auth.onAuthStateChange(
  (event, session) => {
    if (
      event === 'PASSWORD_RECOVERY' ||
      event === 'SIGNED_IN' ||
      event === 'INITIAL_SESSION'
    ) {
      openResetForm(session);
    }
  }
);

const initializeRecovery = async () => {
  const urlError = getUrlError();

  if (urlError) {
    showError(decodeURIComponent(urlError.replace(/\+/g, ' ')));
    return;
  }

  try {
    let {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) throw error;

    // Hỗ trợ cả trường hợp Supabase dùng PKCE và trả về ?code=...
    const code = new URLSearchParams(window.location.search).get('code');

    if (!session && code) {
      const exchangeResult =
        await supabase.auth.exchangeCodeForSession(code);

      if (exchangeResult.error) throw exchangeResult.error;
      session = exchangeResult.data.session;
    }

    if (session?.user) {
      openResetForm(session);
      return;
    }

    // detectSessionInUrl có thể cần thêm một nhịp trên trình duyệt điện thoại.
    await new Promise((resolve) => window.setTimeout(resolve, 1800));

    const retryResult = await supabase.auth.getSession();

    if (retryResult.error) throw retryResult.error;

    if (retryResult.data.session?.user) {
      openResetForm(retryResult.data.session);
      return;
    }

    showError(
      'Liên kết không hợp lệ, đã hết hạn hoặc URL chuyển hướng chưa được cho phép trong Supabase.'
    );
  } catch (error) {
    console.error('[Reset password] Initialization error:', error);
    showError(
      error?.message ||
        'Không thể xác thực liên kết đặt lại mật khẩu.'
    );
  } finally {
    initializationFinished = true;
  }
};

resetForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const password = String(newPasswordInput?.value || '').trim();
  const confirmPassword =
    String(confirmPasswordInput?.value || '').trim();

  if (password.length < 6) {
    setResetStatus('Mật khẩu tối thiểu 6 ký tự.', 'error');
    newPasswordInput?.focus();
    return;
  }

  if (password !== confirmPassword) {
    setResetStatus('Mật khẩu nhập lại không khớp.', 'error');
    confirmPasswordInput?.focus();
    return;
  }

  savePasswordBtn.disabled = true;
  setResetStatus('Đang lưu mật khẩu mới...');

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      throw new Error(
        'Phiên đặt lại mật khẩu đã hết hạn. Hãy yêu cầu email mới.'
      );
    }

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) throw error;

    await supabase.auth.signOut({ scope: 'local' });
    cleanSensitiveUrl();
    showOnly(successView);
  } catch (error) {
    console.error('[Reset password] Update error:', error);
    setResetStatus(
      error?.message || 'Không thể lưu mật khẩu mới.',
      'error'
    );
    savePasswordBtn.disabled = false;
  }
});

window.addEventListener('pagehide', () => {
  authSubscription?.data?.subscription?.unsubscribe?.();
});

initializeRecovery();

// Tránh để màn hình tải vô hạn nếu trình duyệt chặn xử lý URL.
window.setTimeout(() => {
  if (!recoveryReady && !initializationFinished) {
    if (loadingStatus) {
      loadingStatus.textContent =
        'Đang hoàn tất xác thực trên trình duyệt...';
    }
  }
}, 900);
