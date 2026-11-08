(() => {
  'use strict';
  function formUrl() {
    try {
      const url = new URL(window.TO_DUBLIN_INQUIRY?.formUrl || '');
      if (url.protocol !== 'https:' || url.hostname !== 'forms.yandex.ru' || url.port || url.username || url.password || !/^\/(u|cloud)\/[a-zA-Z0-9_-]{8,80}\/?$/.test(url.pathname)) return '';
      url.search = ''; url.hash = '';
      return url.href;
    } catch (_) { return ''; }
  }
  const isConfigured = () => window.TO_DUBLIN_INQUIRY?.enabled === true && Boolean(formUrl());
  function attach(dialog) {
    if (!isConfigured() || dialog.dataset.yandexAttached) return;
    const body = document.getElementById('inquiryBody');
    if (!body) return;
    dialog.dataset.yandexAttached = 'true';
    dialog.classList.add('is-yandex-form');
    [...body.children].forEach(node => { node.hidden = true; });
    function node(tag, className, text) {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (text) element.textContent = text;
      return element;
    }
    const panel = node('section', 'inquiry-embedded');
    const title = node('h2', 'inquiry-embedded-title', 'Пригласить to Dublin');
    title.id = 'yandexInquiryTitle'; title.tabIndex = -1;
    dialog.setAttribute('aria-labelledby', title.id);
    panel.appendChild(title);
    panel.appendChild(node('p', 'inquiry-embedded-intro', 'Расскажите о событии. Свяжемся с вами и обсудим детали.'));
    const frame = node('iframe', 'inquiry-embedded-frame');
    frame.title = 'Заявка на мероприятие to Dublin — Яндекс Формы';
    frame.referrerPolicy = 'no-referrer';
    const status = node('p', 'inquiry-embedded-status', 'Загружаем форму…');
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    frame.addEventListener('load', () => {
      // Loading an iframe is never evidence that a lead has been submitted.
      status.textContent = ''; status.hidden = true;
    });
    panel.appendChild(frame); panel.appendChild(status);
    const separate = node('a', 'inquiry-embedded-separate', 'Открыть форму отдельно');
    separate.href = formUrl(); separate.target = '_blank'; separate.rel = 'noopener noreferrer';
    panel.appendChild(separate);
    const documents = node('nav', 'legal-links');
    documents.setAttribute('aria-label', 'Документы для заявки');
    [['privacy.html', 'Политика данных'], ['terms.html', 'Соглашение'], ['consent.html', 'Согласие']].forEach(([href, text]) => {
      const link = node('a', '', text); link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; documents.appendChild(link);
    });
    panel.appendChild(documents); body.appendChild(panel);
    document.querySelectorAll('[data-inquiry-delivery-copy]').forEach(element => {
      element.textContent = 'Заполните форму в окне «Пригласить паб» и отправьте её. Подтверждение появится в самой форме. Мы получим заявку и свяжемся с вами по указанному контакту.';
    });
    let loaded = false, opener = null;
    function open(event) {
      event.preventDefault(); opener = event.currentTarget;
      document.querySelectorAll('dialog[open]').forEach(other => { if (other !== dialog) other.close(); });
      if (!loaded) {
        const url = new URL(formUrl()); url.searchParams.set('iframe', '1'); url.searchParams.set('theme', 'dark');
        frame.src = url.href; loaded = true;
      }
      if (!dialog.open) dialog.showModal();
      title.focus({ preventScroll: true });
    }
    document.querySelectorAll('[data-open-inquiry]').forEach(button => button.addEventListener('click', open));
    dialog.querySelectorAll('[data-close-inquiry]').forEach(button => button.addEventListener('click', () => dialog.close()));
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
    dialog.addEventListener('close', () => {
      const parent = opener?.closest?.('dialog');
      const target = opener?.isConnected !== false && (!parent || parent.open) ? opener : document.querySelector('[data-open-inquiry]');
      target?.focus({ preventScroll: true });
    });
  }
  window.ToDublinYandexForm = Object.freeze({ isConfigured, attach });
})();
