(() => {
  'use strict';
  const storageKey = 'todublin:cookie-notice:v1';
  const cookieName = 'todublin_cookie_notice';
  const lifetime = 180 * 24 * 60 * 60 * 1000;
  if (!document.body || document.getElementById('cookieNotice')) return;
  function valid(value) {
    const timestamp = Number(value);
    const age = Date.now() - timestamp;
    return Number.isFinite(timestamp) && timestamp > 0 && age >= 0 && age < lifetime;
  }
  function remembered() {
    try { if (valid(localStorage.getItem(storageKey))) return true; } catch (_) { /* Storage may be disabled. */ }
    try {
      const entry = document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith(cookieName + '='));
      return Boolean(entry && valid(decodeURIComponent(entry.slice(cookieName.length + 1))));
    } catch (_) { return false; }
  }
  if (remembered()) return;
  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }
  const notice = node('section', 'cookie-notice');
  notice.id = 'cookieNotice';
  notice.setAttribute('role', 'region');
  notice.setAttribute('aria-labelledby', 'cookieNoticeTitle');
  const title = node('h2', 'cookie-notice-title', 'Файлы cookie');
  title.id = 'cookieNoticeTitle';
  notice.appendChild(title);
  notice.appendChild(node('p', 'cookie-notice-copy', 'Cookie помогают запомнить ваш выбор. Аналитические и рекламные cookie мы не используем.'));
  const details = node('p', 'cookie-notice-details', 'Сохраняем только отметку о закрытии уведомления на 180 дней — в cookie и локальном хранилище браузера.');
  details.id = 'cookieNoticeDetails';
  details.hidden = true;
  notice.appendChild(details);
  const actions = node('div', 'cookie-notice-actions');
  const accept = node('button', 'primary-button cookie-notice-accept', 'Понятно');
  accept.type = 'button';
  const more = node('button', 'quiet-button cookie-notice-more', 'Подробнее');
  more.type = 'button';
  more.setAttribute('aria-expanded', 'false');
  more.setAttribute('aria-controls', details.id);
  actions.appendChild(accept);
  actions.appendChild(more);
  notice.appendChild(actions);
  document.body.appendChild(notice);
  function dismiss() {
    const restoreFocus = notice.contains(document.activeElement);
    notice.hidden = true;
    if (restoreFocus) document.querySelector('.service-menu-toggle, .about-link')?.focus({ preventScroll: true });
  }
  accept.addEventListener('click', () => {
    const value = String(Date.now());
    try { localStorage.setItem(storageKey, value); } catch (_) { /* The cookie is a fallback. */ }
    try {
      document.cookie = cookieName + '=' + value + '; Max-Age=' + lifetime / 1000 + '; Path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
    } catch (_) { /* Closing still works when the browser blocks persistence. */ }
    dismiss();
  });
  more.addEventListener('click', () => {
    details.hidden = !details.hidden;
    more.setAttribute('aria-expanded', String(!details.hidden));
    more.textContent = details.hidden ? 'Подробнее' : 'Скрыть подробности';
  });
  window.addEventListener('storage', event => {
    if (event.key === storageKey && valid(event.newValue)) dismiss();
  });
})();
