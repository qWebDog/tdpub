(() => {
  'use strict';
  const settings = () => window.TO_DUBLIN_INQUIRY || {};
  function respondentUrl() {
    try {
      const url = new URL(settings().formUrl || '');
      if (url.protocol !== 'https:' || url.hostname !== 'forms.yandex.ru' ||
          url.port || url.username || url.password ||
          !/^\/(?:u|cloud)\/[a-zA-Z0-9_-]{8,80}\/?$/.test(url.pathname)) return '';
      url.search = ''; url.hash = '';
      return url.href;
    } catch (_) { return ''; }
  }
  function isTestMode() {
    return settings().testModeEnabled === true &&
      new URLSearchParams(window.location?.search || '').get('inquiry-test') === '1';
  }
  function isAvailable() {
    return Boolean(respondentUrl()) && (settings().enabled === true || isTestMode());
  }
  function buildUrl(context = {}, embedded = true) {
    if (!isAvailable()) return '';
    const config = settings();
    if (!Object.prototype.hasOwnProperty.call(config.purposeOptions || {}, context.purpose)) return '';
    const purpose = context.purpose;
    if (!/^answer_[a-z_]+_\d+$/.test(config.purposeField || '') ||
        !/^answer_long_text_\d+$/.test(config.configurationField || '') ||
        !/^\d+$/.test(config.purposeOptions?.[purpose] || '')) return '';
    const url = new URL(respondentUrl());
    if (embedded) url.searchParams.set('iframe', '1');
    url.searchParams.set('theme', 'dark');
    url.searchParams.set(config.purposeField, config.purposeOptions[purpose]);
    // Only the public topic and the explicitly attached quote are prefilled.
    // Name, contact, message, date and consent are entered in Yandex itself.
    if (purpose === 'event' && typeof context.configuration === 'string' && context.configuration.trim()) {
      url.searchParams.set(config.configurationField, context.configuration.trim());
    }
    return url.href.length <= 32000 ? url.href : '';
  }
  function bindResize(frame) {
    if (!frame || !respondentUrl()) return;
    const origin = new URL(respondentUrl()).origin;
    window.addEventListener('message', event => {
      if (event.origin !== origin || event.source !== frame.contentWindow) return;
      let data;
      try { data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; }
      catch (_) { return; }
      if (!data || typeof data !== 'object') return;
      const height = Number(data['iframe-height']);
      if (!Number.isFinite(height) || height < 300 || height > 6000) return;
      frame.style.height = Math.ceil(height) + 'px';
      // Loading and resizing are never interpreted as successful submission.
    });
  }
  window.ToDublinYandexRequest = Object.freeze({isTestMode,isAvailable,buildUrl,bindResize});
})();
