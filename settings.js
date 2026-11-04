/* settings.js - Mục Tùy chỉnh: giao diện, cỡ chữ, font.
   Phần đọc localStorage và áp dụng lên <html> nằm trong đoạn script đầu <head> của
   index.html (window.__quizSettings), vì phải chạy trước khi trang hiện để không nháy.
   File này chỉ lo phần giao diện của mục Tùy chỉnh và các thay đổi trong lúc đang chạy.

   Thêm tùy chọn mới: thêm một nhóm vào SETTINGS_GROUPS, rồi xử lý giá trị đó trong
   read() và apply() của đoạn script đầu <head>. */

const SETTINGS_GROUPS = [
  {
    key: 'theme',
    label: 'Giao diện',
    options: [
      { value: 'light', label: 'Sáng' },
      { value: 'dark', label: 'Tối' },
      { value: 'system', label: 'Theo hệ thống' },
    ],
  },
  {
    key: 'fontSize',
    label: 'Cỡ chữ',
    options: [
      { value: 'sm', label: 'Nhỏ' },
      { value: 'md', label: 'Vừa' },
      { value: 'lg', label: 'Lớn' },
    ],
  },
  {
    key: 'fontFamily',
    label: 'Font chữ',
    options: [
      { value: 'system', label: 'Font hệ thống' },
      { value: 'be-vietnam-pro', label: 'Be Vietnam Pro' },
      { value: 'inter', label: 'Inter' },
      { value: 'roboto', label: 'Roboto' },
    ],
  },
];

function renderSettingsPanel(container) {
  container.innerHTML = `
    <p class="eyebrow">Tùy chỉnh</p>
    <p class="muted-text">Thay đổi có hiệu lực ngay và được lưu trên thiết bị này.</p>
    <div class="settings-groups">
      ${SETTINGS_GROUPS.map((group) => `
        <fieldset class="settings-group">
          <legend>${group.label}</legend>
          <div class="settings-options">
            ${group.options.map((option) => `
              <label class="settings-option">
                <input type="radio" name="setting-${group.key}" value="${option.value}" data-setting="${group.key}" />
                <span>${option.label}</span>
              </label>
            `).join('')}
          </div>
        </fieldset>
      `).join('')}
    </div>
  `;
}

function syncSettingsPanel(container, settings) {
  container.querySelectorAll('[data-setting]').forEach((input) => {
    input.checked = settings[input.dataset.setting] === input.value;
  });
}

/**
 * @param {HTMLElement} container  khung #settingsCard
 * @param {{onApplied?: () => void}} options  onApplied chạy sau mỗi lần đổi (để menu đo lại độ rộng)
 */
export function initSettings(container, { onApplied } = {}) {
  const store = window.__quizSettings;
  let settings = store.read();

  const applyCurrent = () => {
    store.apply(settings);
    onApplied?.();
  };

  renderSettingsPanel(container);
  syncSettingsPanel(container, settings);

  container.addEventListener('change', (event) => {
    const input = event.target.closest('[data-setting]');
    if (!input) return;
    settings = { ...settings, [input.dataset.setting]: input.value };
    try {
      localStorage.setItem(store.KEY, JSON.stringify(settings));
    } catch {
      // Trình duyệt chặn localStorage: vẫn áp dụng cho lần mở này.
    }
    applyCurrent();
  });

  // "Theo hệ thống": đổi theo ngay khi hệ điều hành đổi sáng/tối.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (settings.theme === 'system') applyCurrent();
  });

  // Đổi ở tab khác của app thì tab này cũng theo.
  window.addEventListener('storage', (event) => {
    if (event.key !== store.KEY) return;
    settings = store.read();
    syncSettingsPanel(container, settings);
    applyCurrent();
  });
}
