/* captcha.js - Ô xác minh "Tôi không phải người máy" cho Đăng nhập / Đăng ký /
   Quên mật khẩu / Đổi mật khẩu.

   Vì sao không dùng Google reCAPTCHA:
   Trình duyệt gọi thẳng Supabase Auth bằng anon key công khai, nên captcha chỉ
   có tác dụng khi CHÍNH Supabase kiểm tra token ở phía server. Supabase Auth chỉ
   hỗ trợ sẵn Cloudflare Turnstile và hCaptcha. Gắn reCAPTCHA chỉ ở giao diện thì
   bot bỏ qua form, gọi API trực tiếp là vượt được.

   Cách bật:
   1. Tạo widget ở Cloudflare Turnstile (hoặc hCaptcha), khai báo tên miền của app.
   2. Dán Site Key vào CAPTCHA_SITE_KEY bên dưới, deploy.
   3. SAU KHI bản mới đã lên web: Supabase Dashboard > Authentication >
      Attack Protection (Bot and Abuse Protection) > Enable CAPTCHA protection,
      chọn đúng nhà cung cấp, dán Secret Key, Save.

   Để trống CAPTCHA_SITE_KEY = tắt captcha (app chạy như cũ).
   Site Key là khóa CÔNG KHAI, được phép để trong code. Secret Key thì KHÔNG
   bao giờ để vào đây - nó chỉ nằm trong Supabase Dashboard.

   Ghi chú: cấu hình này cố ý để trong file riêng thay vì config.js. Service
   worker phục vụ config.js theo kiểu stale-while-revalidate, nên lần mở đầu
   tiên sau khi deploy trình duyệt có thể nhận config.js CŨ; nếu app.js mới
   import một export chưa tồn tại trong bản cũ thì cả app sẽ lỗi trắng trang.
   File này được import kèm ?v=... nên luôn lấy bản mới cùng app.js. */

export const CAPTCHA_PROVIDER = 'turnstile'; // 'turnstile' hoặc 'hcaptcha'
export const CAPTCHA_SITE_KEY = '0x4AAAAAAFE8djYT32o_v0KN'; // Dán Site Key vào đây

const PROVIDERS = {
  turnstile: {
    src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__quizCaptchaOnload',
    globalName: 'turnstile',
  },
  hcaptcha: {
    src: 'https://js.hcaptcha.com/1/api.js?render=explicit&onload=__quizCaptchaOnload&hl=vi&recaptchacompat=off',
    globalName: 'hcaptcha',
  },
};

export const captchaEnabled = Boolean(CAPTCHA_SITE_KEY && PROVIDERS[CAPTCHA_PROVIDER]);

let apiPromise = null;

function loadCaptchaApi() {
  if (apiPromise) return apiPromise;

  const provider = PROVIDERS[CAPTCHA_PROVIDER];
  apiPromise = new Promise((resolve, reject) => {
    const existing = window[provider.globalName];
    if (existing && typeof existing.render === 'function') {
      resolve(existing);
      return;
    }

    const timer = setTimeout(() => reject(new Error('Hết thời gian tải ô xác minh.')), 20000);

    window.__quizCaptchaOnload = () => {
      clearTimeout(timer);
      resolve(window[provider.globalName]);
    };

    const script = document.createElement('script');
    script.src = provider.src;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      reject(new Error('Không tải được ô xác minh.'));
    };
    document.head.appendChild(script);
  }).catch((error) => {
    // Cho phép thử tải lại ở lần sau (ví dụ mạng chập chờn trên điện thoại)
    apiPromise = null;
    throw error;
  });

  return apiPromise;
}

/**
 * Tạo 1 ô captcha trong `container`. Ô chỉ được vẽ khi gọi ensure()
 * (vẽ lúc container đang hiển thị để widget đo đúng kích thước).
 */
export function createCaptcha(container) {
  let api = null;
  let widgetId = null;
  let token = '';
  let rendering = null;

  async function ensure() {
    if (!captchaEnabled || !container) return;
    if (widgetId !== null) return;
    if (rendering) return rendering;

    rendering = (async () => {
      container.hidden = false;
      container.textContent = '';
      try {
        api = await loadCaptchaApi();

        const options = {
          sitekey: CAPTCHA_SITE_KEY,
          theme: 'light',
          callback: (value) => {
            token = value || '';
          },
          'expired-callback': () => {
            token = '';
          },
          'error-callback': () => {
            token = '';
          },
        };

        // Điện thoại màn hẹp (vd. 320px) không đủ chỗ cho ô chuẩn ~300px -> dùng ô gọn
        const narrow = container.clientWidth > 0 && container.clientWidth < 304;
        if (CAPTCHA_PROVIDER === 'turnstile') {
          options.language = 'vi';
          options.size = narrow ? 'compact' : 'flexible'; // flexible: co giãn theo bề rộng form
        } else {
          options.size = narrow ? 'compact' : 'normal';
        }

        widgetId = api.render(container, options);
      } catch (error) {
        console.error('[captcha]', error);
        widgetId = null;
        container.textContent = 'Không tải được ô xác minh. Hãy kiểm tra mạng rồi tải lại trang.';
      } finally {
        rendering = null;
      }
    })();

    return rendering;
  }

  function getToken() {
    if (token) return token;
    if (api && widgetId !== null) {
      try {
        return api.getResponse(widgetId) || '';
      } catch {
        return '';
      }
    }
    return '';
  }

  // Token chỉ dùng được 1 lần: phải reset sau MỖI lần gọi Supabase Auth.
  function reset() {
    token = '';
    if (api && widgetId !== null) {
      try {
        api.reset(widgetId);
      } catch (error) {
        console.warn('[captcha] reset lỗi', error);
      }
    }
  }

  return { ensure, getToken, reset };
}

/** Lỗi do Supabase từ chối captcha (thiếu, hết hạn hoặc sai token). */
export function isCaptchaError(error) {
  if (!error) return false;
  if (error.code === 'captcha_failed') return true;
  return /captcha/i.test(error.message || '');
}

export const CAPTCHA_REQUIRED_MESSAGE =
  'Vui lòng tích vào ô xác minh "Tôi không phải người máy" trước khi tiếp tục.';
export const CAPTCHA_FAILED_MESSAGE =
  'Xác minh chống bot không thành công hoặc đã hết hạn. Vui lòng tích lại ô xác minh rồi thử lại.';
