(() => {
  'use strict';

  const dialog = document.querySelector('#about');
  const video = document.querySelector('#aboutVideo');
  const placeholder = document.querySelector('#aboutVideoPlaceholder');
  const manual = document.querySelector('#aboutVideoManual');
  const playButton = document.querySelector('#aboutVideoPlay');
  if (!dialog || !video || !placeholder || !manual || !playButton) return;

  let active = false;
  let session = 0;
  let playRequest = 0;
  let probe = null;
  let attached = false;
  let ready = false;
  let attempted = false;
  let pendingPlay = false;
  let blocked = false;
  let resumeAfterVisibility = false;

  const canPlay = () => active && dialog.open && !document.hidden && attached && ready;

  function render() {
    video.hidden = !ready;
    placeholder.hidden = ready;
    manual.hidden = !(ready && blocked && canPlay());
  }

  function pause() {
    try { video.pause(); } catch (_) { /* Media may not be initialized yet. */ }
  }

  function attemptPlay(fromButton = false) {
    if (!canPlay() || pendingPlay || (!fromButton && attempted)) return;
    attempted = true;
    pendingPlay = true;
    blocked = false;
    render();
    const currentSession = session;
    const request = ++playRequest;

    const settled = error => {
      if (currentSession !== session || request !== playRequest) return;
      pendingPlay = false;
      if (!canPlay()) {
        pause();
        return;
      }
      blocked = Boolean(error);
      render();
    };

    try {
      Promise.resolve(video.play()).then(() => settled(false), () => settled(true));
    } catch (_) {
      settled(true);
    }
  }

  function clearSource() {
    attached = false;
    ready = false;
    attempted = false;
    pendingPlay = false;
    blocked = false;
    resumeAfterVisibility = false;
    playRequest += 1;
    pause();
    video.removeAttribute('src');
    video.preload = 'none';
    video.load();
    render();
  }

  function isVideoResponse(response) {
    const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    return response.ok && (type.startsWith('video/') || type === 'application/octet-stream');
  }

  async function sourceExists(source, signal) {
    let response = await fetch(source, { method: 'HEAD', cache: 'no-store', signal });
    if (response.status === 405 || response.status === 501) {
      response = await fetch(source, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
        cache: 'no-store',
        signal
      });
      const valid = isVideoResponse(response);
      try { await response.body?.cancel(); } catch (_) { /* The probe never consumes a video. */ }
      return valid;
    }
    return isVideoResponse(response);
  }

  async function loadSource() {
    const source = video.dataset.src;
    if (!source || probe || attached) return;
    const currentSession = session;
    const controller = new AbortController();
    probe = controller;
    try {
      const exists = await sourceExists(source, controller.signal);
      if (!exists || controller.signal.aborted || currentSession !== session || !active || !dialog.open) return;
      attached = true;
      video.src = source;
      video.preload = 'auto';
      video.load();
      ready = video.readyState >= 2;
      render();
      attemptPlay();
    } catch (_) {
      // An absent or unavailable local file keeps the quiet placeholder.
    } finally {
      if (probe === controller) probe = null;
    }
  }

  function syncDialog() {
    if (active === dialog.open) return;
    active = dialog.open;
    session += 1;
    playRequest += 1;
    attempted = false;
    pendingPlay = false;
    blocked = false;
    resumeAfterVisibility = false;
    if (active) {
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.loop = true;
      ready = attached && video.readyState >= 2;
      render();
      if (attached) attemptPlay();
      else void loadSource();
    } else {
      probe?.abort();
      probe = null;
      pause();
      if (video.readyState >= 1) {
        try { video.currentTime = 0; } catch (_) { /* Some streams cannot seek yet. */ }
      }
      render();
    }
  }

  function onReady() {
    if (!attached) return;
    ready = true;
    render();
    attemptPlay();
  }

  video.addEventListener('loadeddata', onReady);
  video.addEventListener('canplay', onReady);
  video.addEventListener('play', () => {
    if (!canPlay()) {
      pause();
      return;
    }
    attempted = true;
    blocked = false;
    render();
  });
  video.addEventListener('pause', () => {
    if (!canPlay()) return;
    // A pause through native controls should survive a tab switch.
    resumeAfterVisibility = false;
    pendingPlay = false;
    playRequest += 1;
  });
  video.addEventListener('error', () => {
    if (attached) clearSource();
  });
  playButton.addEventListener('click', () => {
    if (ready) attemptPlay(true);
  });
  dialog.addEventListener('close', syncDialog);
  new MutationObserver(syncDialog).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      resumeAfterVisibility = active && dialog.open && attached && ready && (!video.paused || pendingPlay);
      playRequest += 1;
      pendingPlay = false;
      pause();
      render();
    } else if (active && dialog.open && ready) {
      if (resumeAfterVisibility || !attempted) {
        attempted = false;
        attemptPlay();
      }
      resumeAfterVisibility = false;
    }
    render();
  });
  render();
  syncDialog();
})();
