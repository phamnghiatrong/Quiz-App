/* sw.js (đặt ở thư mục gốc, đăng ký từ app.js bằng './sw.js')
   Service worker tối giản cho PWA.
   - Chỉ cache asset cùng origin.
   - Không can thiệp request cross-origin (Supabase/CDN) để tránh ảnh hưởng Auth.
   - Ưu tiên lấy dữ liệu mới khi online (network-first cho navigation).
*/

const CACHE_NAME = 'quiz-app-v3';

// Chỉ liệt kê file CÓ THẬT. Đường dẫn tương đối để chạy đúng cả khi mở
// bằng Live Server lẫn khi deploy lên Vercel.
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './style-final-fix.css',
  './app.js',
  './config.js',
  './manifest.webmanifest',
  './public/favicon.png',
  './public/2.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // Cache từng file riêng: một file lỗi sẽ không làm hỏng cả bước cài đặt
      // (cache.addAll() thất bại toàn bộ nếu chỉ một request trả về 404).
      await Promise.all(
        APP_SHELL.map((url) =>
          cache.add(url).catch((error) => {
            console.warn('[SW] Bỏ qua file không cache được:', url, error);
          })
        )
      );

      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      ),
      self.clients.claim(),
    ])
  );
});

function isSameOrigin(request) {
  try {
    return new URL(request.url).origin === self.location.origin;
  } catch {
    return false;
  }
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(request);
    // Cache lại HTML cho offline (chỉ khi cùng origin)
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    // Fallback cho navigation offline
    if (request.mode === 'navigate') {
      const cachedIndex = await cache.match('./index.html');
      if (cachedIndex) return cachedIndex;
    }

    throw new Error('Network error and no cache.');
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached || (await fetchPromise);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Chỉ xử lý GET
  if (request.method !== 'GET') return;

  // Không can thiệp request khác origin (Supabase Auth/API, CDN, ...)
  if (!isSameOrigin(request)) return;

  const url = new URL(request.url);

  // Không bao giờ cache chính service worker (để bản mới được nhận ngay).
  if (url.pathname.endsWith('/sw.js')) return;

  // Trang đặt lại mật khẩu luôn phải lấy bản mới (link chứa token dùng 1 lần).
  if (url.pathname.includes('reset-password')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Network-first cho navigation để luôn ưu tiên nội dung mới khi online
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Không cache cứng dữ liệu động kiểu API (nếu sau này có).
  // Quy ước: mọi endpoint dưới /api sẽ luôn network-first.
  if (url.pathname.startsWith('/api')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Static assets: stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request));
});
