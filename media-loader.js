(() => {
  'use strict';
  const images = new WeakMap();
  const videos = new WeakSet();

  function ensureScene(scene, priority = 'low') {
    const img = scene?.querySelector('img');
    if (!img) return Promise.resolve(false);
    const previous = images.get(img);
    if (previous && (previous.state !== 'error' || priority !== 'high')) return previous.promise;
    const record = { state: 'loading', promise: null };
    images.set(img, record);
    record.promise = new Promise(resolve => {
      let finished = false;
      async function finish(success) {
        if (finished) return;
        finished = true;
        img.removeEventListener('load', loaded);
        img.removeEventListener('error', failed);
        if (success && typeof img.decode === 'function') {
          // A responsive image can change during decode; a loaded fallback remains usable.
          try { await img.decode(); } catch (_) { /* naturalWidth verifies the actual image. */ }
        }
        const ready = Boolean(success && img.naturalWidth > 0);
        record.state = ready ? 'ready' : 'error';
        resolve(ready);
      }
      const loaded = () => { finish(true); };
      const failed = () => { finish(false); };
      img.addEventListener('load', loaded);
      img.addEventListener('error', failed);
      img.fetchPriority = priority;
      // Set picture sources before src so mobile browsers choose the mobile file directly.
      scene.querySelectorAll('source[data-srcset]').forEach(source => {
        source.srcset = source.dataset.srcset;
      });
      if (img.dataset.src) img.src = img.dataset.src;
      // Empty deferred images can still report complete until the browser processes src.
      if (img.complete && img.naturalWidth > 0) finish(true);
      else if (img.complete && !img.dataset.src) finish(false);
    });
    return record.promise;
  }

  function ensureVideo(video) {
    if (!video || videos.has(video) || !video.dataset.src) return;
    videos.add(video);
    if (video.dataset.poster) video.poster = video.dataset.poster;
    video.src = video.dataset.src;
    video.load();
  }

  window.ToDublinMedia = Object.freeze({ ensureScene, ensureVideo });
})();
