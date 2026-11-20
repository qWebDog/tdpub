(() => {
  'use strict';
  const root = document.getElementById('gallery');
  const dialog = document.getElementById('galleryLightbox');
  if (!root || !dialog) return;
  let links = [...root.querySelectorAll('[data-gallery-photo]')];
  const photo = dialog.querySelector('#galleryPhoto');
  const caption = dialog.querySelector('#galleryCaption');
  const count = dialog.querySelector('#galleryPosition');
  const loading = dialog.querySelector('#galleryLoading');
  const previous = dialog.querySelector('[data-gallery-previous]');
  const next = dialog.querySelector('[data-gallery-next]');
  const close = dialog.querySelector('[data-gallery-close]');
  const viewport = dialog.querySelector('.td-gallery-viewport');
  let index = 0;
  let trigger = null;
  let gesture = null;
  function renderContent(content) {
    const api = window.ToDublinContent;
    let items;
    try { items = api.validate(content).gallery.items; }
    catch (_) { return; }
    const activeFile = links[index]?.dataset.file;
    const fragment = document.createDocumentFragment();
    items.forEach((item, i) => {
      const link = document.createElement('a');
      link.className = 'td-gallery-tile cursor-interaction';
      link.href = 'media/gallery/photos/' + encodeURIComponent(item.file);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.dataset.galleryPhoto = '';
      link.dataset.file = item.file;
      link.dataset.caption = item.alt || item.caption || 'Мобильный паб to Dublin';
      link.hidden = i > 2;
      link.setAttribute('aria-label', 'Открыть фото: ' + (item.alt || item.caption || 'to Dublin'));
      link.setAttribute('aria-haspopup', 'dialog');
      link.setAttribute('aria-controls', 'galleryLightbox');
      const figure = document.createElement('figure');
      const image = document.createElement('img');
      image.src = link.href;
      image.alt = item.alt || item.caption || 'Мобильный паб to Dublin';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.width = 1200;
      image.height = 800;
      const indicator = document.createElement('span');
      indicator.className = 'td-gallery-indicator';
      indicator.setAttribute('aria-hidden', 'true');
      const symbol = document.createElement('span');
      symbol.className = 'td-gallery-open';
      symbol.setAttribute('aria-hidden', 'true');
      symbol.textContent = '+';
      indicator.append(symbol);
      figure.append(image, indicator);
      link.append(figure);
      fragment.append(link);
    });
    root.querySelector('.td-gallery-grid').replaceChildren(fragment);
    links = [...root.querySelectorAll('[data-gallery-photo]')];
    root.hidden = items.length === 0;
    root.dataset.galleryCount = String(Math.min(items.length, 3));
    root.dataset.galleryState = 'configured';
    root.querySelector('.td-gallery-preview-note')?.remove();
    document.querySelectorAll('a[href="#gallery"]').forEach(link => { link.hidden = root.hidden; });
    if (dialog.open) {
      const active = links.findIndex(link => link.dataset.file === activeFile);
      if (active < 0) dialog.close();
      else { trigger = links[Math.min(active, 2)]; show(active); }
    }
    document.dispatchEvent(new CustomEvent('to-dublin:gallery-ready'));
  }
  function show(value) {
    index = (value + links.length) % links.length;
    const link = links[index];
    const thumb = link.querySelector('img');
    caption.textContent = link.dataset.caption || thumb?.alt || '';
    count.textContent = 'Фото ' + (index + 1) + ' из ' + links.length;
    photo.alt = thumb?.alt || caption.textContent;
    loading.textContent = 'Загружаем фотографию…';
    loading.hidden = false;
    photo.src = link.href;
    if (photo.complete && photo.naturalWidth) loading.hidden = true;
    previous.disabled = next.disabled = links.length < 2;
  }
  root.addEventListener('click', event => {
    if (event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const link = event.target.closest?.('[data-gallery-photo]');
    const i = links.indexOf(link);
    if (i < 0 || typeof dialog.showModal !== 'function') return;
    if (document.querySelector('dialog[open]')) return;
    event.preventDefault();
    trigger = link;
    show(i);
    dialog.showModal();
    close.focus({preventScroll:true});
  });
  previous.addEventListener('click', () => show(index - 1));
  next.addEventListener('click', () => show(index + 1));
  close.addEventListener('click', () => dialog.close());
  photo.addEventListener('load', () => { loading.hidden = true; });
  photo.addEventListener('error', () => {
    loading.textContent = 'Не удалось загрузить фото. Попробуйте другой кадр.';
    loading.hidden = false;
  });
  dialog.addEventListener('close', () => {
    gesture = null;
    trigger?.focus({preventScroll:true});
    photo.removeAttribute('src');
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      show(index + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  viewport.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    gesture = event.isPrimary ? {id:event.pointerId,x:event.clientX,y:event.clientY} : null;
  }, {passive:true});
  viewport.addEventListener('pointercancel', () => { gesture = null; }, {passive:true});
  viewport.addEventListener('pointerup', event => {
    const start = gesture;
    gesture = null;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.4) show(index + (dx < 0 ? 1 : -1));
  }, {passive:true});
  if (window.ToDublinContent) {
    document.addEventListener('to-dublin:content-ready', event => renderContent(event.detail?.content));
    renderContent(window.ToDublinContent.current);
  }
})();
