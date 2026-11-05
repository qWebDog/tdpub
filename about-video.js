(() => {
  'use strict';

  const dialog = document.querySelector('#about');
  const video = document.querySelector('#aboutVideo');
  const placeholder = document.querySelector('#aboutVideoPlaceholder');
  const manual = document.querySelector('#aboutVideoManual');
  const button = document.querySelector('#aboutVideoPlay');
  if (!dialog || !video || !placeholder || !manual || !button) return;

  const title = placeholder.querySelector('p');
  const detail = placeholder.querySelector('span');
  const idleTitle = title?.textContent || 'Видео о пабе';
  const idleDetail = detail?.textContent || 'Скоро здесь';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.style.cssText = 'margin:0;font-size:11px;line-height:1.4;text-align:center;color:#fff9ece6;max-width:30ch';
  manual.insertBefore(status, button);
  manual.style.alignContent = 'center';
  manual.style.gap = '8px';
  manual.style.padding = '12px';
  placeholder.setAttribute('role', 'status');

  let active = false;
  let session = 0;
  let request = 0;
  let probe = null;
  let timer = null;
  let attached = false;
  let ready = false;
  let pendingPlay = false;
  let attempted = false;
  let blocked = false;
  let failed = '';
  let slow = false;
  let loading = false;
  let userPaused = false;
  let resumeAfterVisibility = false;

  const visible = () => active && dialog.open && !document.hidden;

  function render() {
    // Render the media element while it loads: hidden/display:none can defer
    // media loading in Safari. The existing placeholder sits above it.
    video.hidden = !attached;
    const showManual = visible() && Boolean(failed || blocked || slow);
    manual.hidden = !showManual;
    placeholder.hidden = ready || showManual;
    if (title) title.textContent = loading ? 'Загрузка видео…' : idleTitle;
    if (detail) detail.textContent = loading ? 'Подождите немного' : idleDetail;
    status.textContent = failed || (blocked ? 'Нажмите, чтобы запустить видео' : 'Видео загружается дольше обычного');
    button.textContent = failed || slow ? 'Повторить загрузку' : 'Воспроизвести';
    button.setAttribute('aria-label', button.textContent);
  }

  function stopTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function pause() {
    try { video.pause(); } catch (_) { /* No media has been attached yet. */ }
  }

  function unload() {
    stopTimer();
    probe?.abort();
    probe = null;
    request += 1;
    attached = false;
    ready = false;
    pendingPlay = false;
    attempted = false;
    loading = false;
    slow = false;
    pause();
    video.removeAttribute('src');
    video.preload = 'none';
    video.load();
  }

  function fail(message) {
    failed = message;
    blocked = false;
    userPaused = false;
    resumeAfterVisibility = false;
    unload();
    render();
  }

  function mediaError() {
    const code = video.error?.code;
    if (code === 3 || code === 4) return 'Браузер не может воспроизвести этот файл';
    if (code === 1) return 'Загрузка видео прервана';
    return 'Не удалось загрузить видео';
  }

  function attemptPlay(fromButton = false) {
    if (!visible() || !attached || failed || pendingPlay || (!fromButton && (attempted || userPaused))) return;
    attempted = true;
    pendingPlay = true;
    blocked = false;
    userPaused = false;
    const currentSession = session;
    const currentRequest = ++request;
    render();

    const settled = error => {
      if (currentSession !== session || currentRequest !== request) return;
      pendingPlay = false;
      if (!visible() || !attached) {
        pause();
        return;
      }
      if (error) {
        if (video.error || error.name === 'NotSupportedError') {
          fail(mediaError());
          return;
        }
        if (error.name === 'AbortError') {
          attempted = false;
        } else {
          blocked = true;
          stopTimer();
        }
      }
      render();
    };
    try {
      Promise.resolve(video.play()).then(() => settled(null), settled);
    } catch (error) {
      settled(error);
    }
  }

  function attach(source) {
    if (!visible()) return;
    attached = true;
    ready = false;
    loading = true;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.loop = true;
    video.preload = 'auto';
    video.hidden = false;
    video.src = source;
    render();
    video.load();
    const currentSession = session;
    stopTimer();
    timer = setTimeout(() => {
      timer = null;
      if (currentSession === session && visible() && attached && !ready && !failed && !blocked) {
        slow = true;
        render();
      }
    }, 20000);
    // Do not wait for loadeddata/canplay to initiate playback. Native play()
    // initiates media loading and preserves the opening user gesture.
    attemptPlay();
  }

  function isVideoResponse(response) {
    const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    return response.ok && (type.startsWith('video/') || type === 'application/octet-stream');
  }

  async function localSourceExists(source, signal) {
    let response = await fetch(source, { method: 'HEAD', cache: 'no-store', signal });
    if (response.status === 405 || response.status === 501) {
      response = await fetch(source, { method: 'GET', headers: { Range: 'bytes=0-0' }, cache: 'no-store', signal });
      const valid = isVideoResponse(response);
      try { await response.body?.cancel(); } catch (_) { /* Never download the probe body. */ }
      return valid;
    }
    return isVideoResponse(response);
  }

  function startSource() {
    const source = (video.dataset.src || '').trim();
    if (!source || !visible()) {
      render();
      return;
    }
    loading = true;
    render();
    // Cross-origin <video> works without CORS; a fetch()/HEAD probe does not.
    // Attach external sources synchronously, without a preliminary request.
    if (/^(?:https?:|blob:|data:|\/\/)/i.test(source) || location.protocol === 'file:') {
      attach(source);
      return;
    }
    const currentSession = session;
    const controller = new AbortController();
    probe = controller;
    localSourceExists(source, controller.signal).then(exists => {
      if (currentSession !== session || controller.signal.aborted || !visible()) return;
      if (exists) attach(source);
      else if (video.dataset.videoRequired === 'true') fail('Видеофайл не найден');
      else {
        loading = false;
        render();
      }
    }, () => {
      if (currentSession !== session || controller.signal.aborted) return;
      if (video.dataset.videoRequired === 'true') fail('Не удалось загрузить видео');
      else {
        loading = false;
        render();
      }
    }).finally(() => {
      if (probe === controller) probe = null;
    });
  }

  function syncDialog() {
    if (active === dialog.open) return;
    active = dialog.open;
    session += 1;
    blocked = false;
    failed = '';
    userPaused = false;
    resumeAfterVisibility = false;
    unload();
    render();
    if (active) startSource();
  }

  function onReady() {
    if (!attached) return;
    ready = true;
    loading = false;
    slow = false;
    stopTimer();
    render();
    attemptPlay();
  }

  video.addEventListener('loadeddata', onReady);
  video.addEventListener('canplay', onReady);
  video.addEventListener('playing', () => {
    if (!visible() || !attached) {
      pause();
      return;
    }
    blocked = false;
    userPaused = false;
    onReady();
  });
  video.addEventListener('play', () => {
    if (!visible() || !attached) {
      pause();
      return;
    }
    userPaused = false;
    blocked = false;
    attempted = true;
    render();
  });
  video.addEventListener('pause', () => {
    if (!visible() || !attached || !ready || failed) return;
    userPaused = true;
    resumeAfterVisibility = false;
    pendingPlay = false;
    request += 1;
  });
  video.addEventListener('error', () => {
    if (attached) fail(mediaError());
  });
  button.addEventListener('click', () => {
    if (!visible()) return;
    if (failed || slow || !attached) {
      session += 1;
      failed = '';
      blocked = false;
      userPaused = false;
      unload();
      startSource();
    } else {
      attemptPlay(true);
    }
  });
  dialog.addEventListener('close', syncDialog);
  new MutationObserver(syncDialog).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      resumeAfterVisibility = active && attached && !userPaused && (!video.paused || pendingPlay);
      request += 1;
      pendingPlay = false;
      pause();
    } else if (active && dialog.open) {
      if (resumeAfterVisibility && attached) {
        attempted = false;
        attemptPlay();
      } else if (!attached && !failed && !probe) {
        startSource();
      }
      resumeAfterVisibility = false;
    }
    render();
  });
  render();
  syncDialog();
})();
