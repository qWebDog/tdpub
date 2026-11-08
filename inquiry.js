(() => {
  'use strict';

  const dialog = document.querySelector('#inquiry');
  const form = document.querySelector('#inquiryForm');
  if (!dialog || !form) return;

  if (window.ToDublinYandexForm?.isConfigured()) {
    window.ToDublinYandexForm.attach(dialog);
    return;
  }

  const title = document.querySelector('#inquiryTitle');
  const intro = document.querySelector('#inquiryIntro');
  const progress = document.querySelector('#inquiryProgress');
  const stepLabel = document.querySelector('#inquiryStepLabel');
  const result = document.querySelector('#inquiryResult');
  const summary = document.querySelector('#inquirySummary');
  const telegramLink = document.querySelector('#inquiryTelegramLink');
  const copyButton = document.querySelector('#inquiryCopy');
  const status = document.querySelector('#inquiryStatus');
  const content = document.querySelector('#inquiryBody');
  const submitButton = document.querySelector('#inquirySubmit');
  const deliveryNote = document.querySelector('#inquiryDeliveryNote');
  const legacyActions = document.querySelector('#inquiryLegacyActions');
  const onsiteActions = document.querySelector('#inquiryOnsiteActions');
  const doneButton = document.querySelector('#inquiryDone');
  const leads = window.ToDublinLeads;
  const onsite = Boolean(leads?.isConfigured?.());
  const steps = [...form.querySelectorAll('[data-inquiry-step]')];
  const indicators = [...dialog.querySelectorAll('[data-step-indicator]')];
  if (!title || !intro || !result || !summary || !telegramLink || !copyButton || !status || steps.length !== 2) return;

  const recipient = 'qwebdog';
  const eventLabels = {
    private: 'Частный праздник',
    corporate: 'Корпоратив',
    festival: 'Фестиваль',
    other: 'Другое событие'
  };
  const fieldsByStep = {
    1: ['eventType', 'city', 'eventDate'],
    2: ['name', 'contact', 'comment']
  };
  const touched = new Set();
  let step = 1;
  let showingResult = false;
  let opener = null;
  let leadMessage = '';
  let sending = false;
  let requestId = '';
  let requestSnapshot = '';
  if (onsite) {
    if (submitButton) submitButton.textContent = 'Отправить заявку';
    if (deliveryNote) deliveryNote.textContent = 'Заявка отправится прямо с сайта. Свяжемся с вами по указанному контакту.';
    telegramLink.hidden = true;
    if (legacyActions) legacyActions.hidden = true;
    document.querySelectorAll('[data-inquiry-delivery-copy]').forEach(node => {
      node.textContent = 'Заполните форму на сайте и нажмите «Отправить заявку». Мы получим детали вашего события и свяжемся с вами по указанному контакту.';
    });
  }

  function fields(name) {
    return [...form.querySelectorAll('[name="' + name + '"]')];
  }

  function field(name) {
    return fields(name)[0] || null;
  }

  function value(name) {
    return (field(name)?.value || '').trim();
  }

  function localISO(date = new Date()) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function updateDateMinimum() {
    const input = field('eventDate');
    if (input) input.min = localISO();
  }

  function normalText(text) {
    return text.trim().replace(/\s+/g, ' ');
  }

  function selectedEvent() {
    return form.querySelector('[name="eventType"]:checked')?.value || '';
  }

  function validContact(text) {
    if (/^\+?[\d\s().-]+$/.test(text)) {
      const length = text.replace(/\D/g, '').length;
      return length >= 7 && length <= 15;
    }
    if (/^@[a-z][a-z0-9_]{4,31}$/i.test(text)) return true;
    return /^(?:https?:\/\/)?t\.me\/[a-z][a-z0-9_]{4,31}\/?$/i.test(text);
  }

  function validationMessage(name) {
    const text = value(name);
    switch (name) {
      case 'eventType':
        return Object.prototype.hasOwnProperty.call(eventLabels, selectedEvent()) ? '' : 'Выберите формат события.';
      case 'city': {
        const length = [...normalText(text)].length;
        if (length < 2) return 'Укажите город или площадку.';
        return length <= 100 ? '' : 'Укажите место короче — до 100 символов.';
      }
      case 'eventDate': {
        if (field(name)?.validity?.badInput) return 'Укажите дату полностью.';
        if (!text) return '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return 'Укажите корректную дату.';
        const date = new Date(text + 'T12:00:00');
        if (Number.isNaN(date.getTime()) || localISO(date) !== text) return 'Укажите корректную дату.';
        return text >= localISO() ? '' : 'Выберите сегодняшнюю или будущую дату.';
      }
      case 'name': {
        const length = [...normalText(text)].length;
        if (length < 2) return 'Подскажите, как к вам обращаться.';
        return length <= 80 ? '' : 'Укажите имя короче — до 80 символов.';
      }
      case 'contact':
        if (!text) return 'Оставьте телефон или Telegram для связи.';
        return text.length <= 100 && validContact(text) ? '' : 'Укажите телефон или Telegram в формате @username.';
      case 'comment':
        return [...text].length <= 1000 ? '' : 'Сократите комментарий до 1000 символов.';
      default:
        return '';
    }
  }

  function showError(name, message) {
    const error = form.querySelector('[data-error-for="' + name + '"]');
    if (error) {
      error.textContent = message;
      error.hidden = !message;
    }
    fields(name).forEach(input => {
      input.setAttribute('aria-invalid', message ? 'true' : 'false');
      if (error?.id) {
        const descriptions = new Set((input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
        descriptions.add(error.id);
        input.setAttribute('aria-describedby', [...descriptions].join(' '));
      }
    });
  }

  function validate(names, focusInvalid = true) {
    let firstInvalid = '';
    names.forEach(name => {
      touched.add(name);
      const message = validationMessage(name);
      showError(name, message);
      if (message && !firstInvalid) firstInvalid = name;
    });
    if (firstInvalid && focusInvalid) {
      const input = fields(firstInvalid).find(item => !item.disabled);
      input?.focus({ preventScroll: false });
    }
    return !firstInvalid;
  }

  function focusLater(callback) {
    const run = () => {
      if (dialog.open) callback();
    };
    if (window.requestAnimationFrame) window.requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  function focusStep() {
    const active = steps.find(item => Number(item.dataset.inquiryStep) === step);
    const input = step === 1
      ? form.querySelector('[name="eventType"]:checked') || field('eventType') || field('city')
      : field('name');
    if (active && !active.hidden) input?.focus({ preventScroll: true });
  }

  function showStep(nextStep, shouldFocus = true) {
    step = nextStep;
    showingResult = false;
    result.hidden = true;
    form.hidden = false;
    if (progress) progress.hidden = false;
    if (stepLabel) stepLabel.textContent = 'Шаг ' + step + ' из 2';
    steps.forEach(item => {
      const active = Number(item.dataset.inquiryStep) === step;
      item.hidden = !active;
      item.disabled = !active;
    });
    indicators.forEach(item => {
      const number = Number(item.dataset.stepIndicator);
      item.classList.toggle('is-current', number === step);
      item.classList.toggle('is-complete', number < step);
      if (number === step) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
    title.textContent = step === 1 ? 'Где встречаемся?' : 'Давайте познакомимся';
    intro.textContent = step === 1
      ? 'Расскажите о событии. Мы поможем с остальным.'
      : 'Оставьте контакт — обсудим детали и подберём формат.';
    status.textContent = '';
    if (content) content.scrollTop = 0;
    if (shouldFocus) focusLater(focusStep);
  }

  function advance() {
    updateDateMinimum();
    if (validate(fieldsByStep[1])) showStep(2);
  }

  function composeMessage() {
    const date = value('eventDate');
    const dateText = date
      ? new Date(date + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'Пока не определились';
    const lines = [
      onsite ? 'Ваша заявка в to Dublin' : 'Хочу пригласить to Dublin!',
      '',
      'Событие: ' + eventLabels[selectedEvent()],
      'Город / площадка: ' + normalText(value('city')),
      'Дата: ' + dateText,
      '',
      'Имя: ' + normalText(value('name')),
      'Контакт: ' + value('contact')
    ];
    if (value('comment')) lines.push('', 'Комментарий:', value('comment'));
    return lines.join('\n');
  }

  function prepareDraft() {
    if (!validate(fieldsByStep[1], false)) {
      showStep(1, false);
      validate(fieldsByStep[1]);
      return;
    }
    if (!validate(fieldsByStep[2])) return;
    leadMessage = composeMessage();
    const href = 'https://t.me/' + recipient + '?text=' + encodeURIComponent(leadMessage);
    telegramLink.href = href;
    telegramLink.target = '_blank';
    telegramLink.rel = 'noopener noreferrer';
    summary.textContent = leadMessage;
    showingResult = true;
    form.hidden = true;
    result.hidden = false;
    if (progress) progress.hidden = true;
    title.textContent = 'Заявка готова';
    intro.textContent = 'Продолжим в Telegram. В чате останется нажать «Отправить».';
    status.textContent = 'Если чат не открылся, нажмите «Открыть Telegram».';
    if (content) content.scrollTop = 0;
    focusLater(() => telegramLink.focus({ preventScroll: true }));
    try {
      // This prepares a draft. The visitor confirms sending inside Telegram.
      window.open(href, '_blank', 'noopener,noreferrer');
    } catch (_) {
      // The visible link also works when the browser suppresses a new window.
    }
  }

  function setSending(busy) {
    sending = busy;
    form.setAttribute('aria-busy', String(busy));
    steps.forEach(item => { item.disabled = busy || Number(item.dataset.inquiryStep) !== step; });
    const back = document.querySelector('#inquiryBack');
    if (back) back.disabled = busy;
    if (submitButton) {
      submitButton.disabled = busy;
      submitButton.classList.toggle('is-sending', busy);
      submitButton.textContent = busy ? 'Отправляем…' : 'Отправить заявку';
    }
    if (busy) {
      status.setAttribute('role', 'status');
      status.classList.toggle('is-error', false);
      status.textContent = 'Отправляем заявку…';
    }
  }

  async function sendOnsite() {
    if (sending || showingResult) return;
    if (!validate(fieldsByStep[1], false)) { showStep(1, false); validate(fieldsByStep[1]); return; }
    if (!validate(fieldsByStep[2])) return;
    const payload = {
      eventType: selectedEvent(), city: normalText(value('city')), eventDate: value('eventDate'),
      name: normalText(value('name')), contact: value('contact'), comment: value('comment'), company: value('website')
    };
    const snapshot = JSON.stringify(payload);
    const message = composeMessage();
    try {
      if (snapshot !== requestSnapshot || !requestId) { requestId = leads.createRequestId(); requestSnapshot = snapshot; }
      payload.requestId = requestId;
      setSending(true);
      const receipt = await leads.submit(payload);
      if (!/^[a-f0-9]{32}$/.test(receipt?.id || '')) throw new Error('confirmation_invalid');
      leadMessage = message;
      showingResult = true;
      summary.textContent = message;
      form.hidden = true; result.hidden = false;
      if (progress) progress.hidden = true;
      if (onsiteActions) onsiteActions.hidden = false;
      title.textContent = 'Заявка отправлена';
      intro.textContent = 'Спасибо! Свяжемся с вами по указанному контакту и обсудим детали.';
      status.textContent = '';
      if (content) content.scrollTop = 0;
      focusLater(() => (doneButton || title).focus({ preventScroll: true }));
    } catch (error) {
      const messages = {
        confirmation_timeout: 'Подтверждение не получено. Попробуйте ещё раз — данные в форме сохранены.',
        rate_limited: 'Вы уже отправили несколько заявок. Попробуйте немного позже.',
        validation: 'Проверьте данные заявки и попробуйте отправить её ещё раз.',
        busy: 'Сервис сейчас занят. Попробуйте отправить заявку ещё раз.',
        request_conflict: 'Попробуйте отправить заявку ещё раз.'
      };
      if (error.code === 'request_conflict') { requestId = ''; requestSnapshot = ''; }
      status.setAttribute('role', 'alert');
      status.classList.toggle('is-error', true);
      status.textContent = messages[error.code] || 'Не удалось получить подтверждение отправки. Данные сохранены в форме — попробуйте ещё раз.';
    } finally { setSending(false); }
  }

  function openDialog(event) {
    event.preventDefault();
    opener = event.currentTarget;
    updateDateMinimum();
    document.querySelectorAll('dialog[open]').forEach(other => {
      if (other !== dialog) other.close();
    });
    if (!dialog.open) dialog.showModal();
    focusLater(() => {
      if (sending) title.focus({ preventScroll: true });
      else if (showingResult) (onsite ? doneButton || title : telegramLink).focus({ preventScroll: true });
      else focusStep();
    });
  }

  document.querySelectorAll('[data-open-inquiry]').forEach(button => button.addEventListener('click', openDialog));
  dialog.querySelectorAll('[data-close-inquiry]').forEach(button => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    const parentDialog = opener?.closest?.('dialog');
    const target = opener?.isConnected !== false && (!parentDialog || parentDialog.open)
      ? opener
      : document.querySelector('[data-open-inquiry]');
    target?.focus({ preventScroll: true });
  });
  document.querySelector('#inquiryNext')?.addEventListener('click', advance);
  document.querySelector('#inquiryBack')?.addEventListener('click', () => { if (!sending) showStep(1); });
  document.querySelector('#inquiryEdit')?.addEventListener('click', () => showStep(2));
  doneButton?.addEventListener('click', () => dialog.close());
  document.querySelector('#inquiryNew')?.addEventListener('click', () => {
    if (sending) return;
    form.reset(); touched.clear(); requestId = ''; requestSnapshot = ''; leadMessage = '';
    Object.values(fieldsByStep).flat().forEach(name => showError(name, ''));
    if (onsiteActions) onsiteActions.hidden = true;
    updateDateMinimum(); showStep(1);
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (showingResult || sending) return;
    if (step === 1) advance();
    else if (onsite) return sendOnsite();
    else prepareDraft();
  });
  form.addEventListener('input', event => {
    const name = event.target.name;
    if (touched.has(name)) showError(name, validationMessage(name));
  });
  form.addEventListener('change', event => {
    const name = event.target.name;
    if (touched.has(name)) showError(name, validationMessage(name));
  });

  function legacyCopy(text) {
    const previous = document.activeElement;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.readOnly = true;
    textarea.tabIndex = -1;
    textarea.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    dialog.appendChild(textarea);
    try {
      textarea.focus({ preventScroll: true });
      textarea.select();
      textarea.setSelectionRange(0, text.length);
      if (!document.execCommand('copy')) throw new Error('Copy unavailable');
    } finally {
      textarea.remove();
      previous?.focus({ preventScroll: true });
    }
  }

  copyButton.addEventListener('click', async () => {
    if (!showingResult || !leadMessage || copyButton.disabled) return;
    const text = leadMessage;
    copyButton.disabled = true;
    try {
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(text);
      } catch (_) {
        legacyCopy(text);
      }
      if (showingResult && leadMessage === text) status.textContent = 'Текст заявки скопирован.';
    } catch (_) {
      if (showingResult && leadMessage === text) status.textContent = 'Не удалось скопировать. Выделите текст заявки и скопируйте его вручную.';
    } finally {
      copyButton.disabled = false;
    }
  });

  updateDateMinimum();
  showStep(1, false);
})();
