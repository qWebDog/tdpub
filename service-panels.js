(() => {
  'use strict';
  const main = document.querySelector('.service-main');
  const header = document.querySelector('.service-nav');
  if (!main || !header || document.querySelector('.service-pagination')) return;
  const sections = [...main.children].filter(node => node.tagName === 'SECTION');
  if (sections.length < 2) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;
  const hero = sections.find(section => section.id === 'experience');
  const menu = document.getElementById('serviceMenu');
  const menuToggle = document.getElementById('serviceMenuToggle');
  const menuLinks = menu ? [...menu.querySelectorAll('a[href^="#"]')] : [];
  const actionBar = document.querySelector('.service-bottom-actions');
  const invite = actionBar?.querySelector('.service-invite-button');
  const nav = document.createElement('nav');
  nav.className = 'service-pagination';
  nav.setAttribute('aria-label', 'Переход к следующему разделу');
  const cue = document.createElement('a');
  cue.className = 'service-scroll-cue';
  cue.hidden = true;
  const mark = document.createElement('span');
  mark.className = 'service-scroll-mark';
  mark.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.className = 'service-scroll-prompt';
  label.textContent = 'Листайте';
  label.setAttribute('aria-hidden', 'true');
  cue.appendChild(mark); cue.appendChild(label); nav.appendChild(cue);
  const notice = document.createElement('span');
  notice.className = 'service-end-notice';
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  notice.setAttribute('aria-atomic', 'true');
  notice.hidden = true;
  nav.appendChild(notice);
  (actionBar || document.body).appendChild(nav);
  const backTop = document.createElement('a');
  backTop.className = 'service-back-top';
  const topIcon = document.createElement('span');
  topIcon.className = 'service-back-top-icon';
  topIcon.setAttribute('aria-hidden', 'true');
  backTop.appendChild(topIcon);
  backTop.setAttribute('href', '#' + sections[0].id);
  backTop.setAttribute('aria-label', 'Вернуться к началу страницы');
  backTop.hidden = true;
  (actionBar || document.body).appendChild(backTop);
  let index = 0;
  let headerHeight = 0;
  let frame = null;
  let idleTimer = null;
  let noticeTimer = null;
  let touch = null;
  let lastBoundarySignal = -Infinity;
  const resumeVideos = new WeakSet();
  const videos = [...main.querySelectorAll('video')];
  videos.forEach(video => { if (video.autoplay && !reduced.matches) resumeVideos.add(video); });
  const modalOpen = () => Boolean(document.querySelector('dialog[open]'));
  const position = () => window.scrollY || root.scrollTop || 0;
  const viewport = () => window.innerHeight || root.clientHeight;
  const bottom = () => position() + viewport() >= (document.scrollingElement || root).scrollHeight - 4;
  const interactive = target => Boolean(target?.closest?.('a, button, input, textarea, select, summary, video, [contenteditable], dialog, .cookie-notice'));
  function hideCue() {
    if (idleTimer !== null) clearTimeout(idleTimer);
    idleTimer = null; cue.hidden = true;
  }
  function clearNotice() {
    if (noticeTimer !== null) clearTimeout(noticeTimer);
    noticeTimer = null; notice.hidden = true; notice.textContent = '';
  }
  function activity() {
    hideCue();
    if (document.hidden || modalOpen() || index === sections.length - 1) return;
    idleTimer = setTimeout(() => {
      idleTimer = null;
      if (!document.hidden && !modalOpen() && index < sections.length - 1) cue.hidden = false;
    }, 8000);
  }
  function endAttempt() {
    if (document.hidden || modalOpen() || !bottom()) return;
    const now = performance.now();
    const fresh = now - lastBoundarySignal > 600;
    lastBoundarySignal = now;
    if (!fresh) return;
    hideCue(); clearNotice();
    notice.textContent = 'Это последний блок'; notice.hidden = false;
    noticeTimer = setTimeout(clearNotice, 3500);
  }
  function syncVideo() {
    videos.forEach(video => {
      const bounds = video.getBoundingClientRect();
      const visible = bounds.bottom > headerHeight && bounds.top < viewport() - 104;
      const near = bounds.bottom > 0 && bounds.top < viewport() + 240;
      if (!document.hidden && !modalOpen() && near && (visible || position() > 0)) {
        window.ToDublinMedia?.ensureVideo(video);
      }
      if (document.hidden || modalOpen() || !visible) {
        if (!video.paused) resumeVideos.add(video);
        video.pause();
      } else if (resumeVideos.has(video) && !reduced.matches) {
        resumeVideos.delete(video);
        try { Promise.resolve(video.play()).catch(() => {}); } catch (_) { /* Native video controls remain available. */ }
      }
    });
  }
  function updateActions() {
    const last = index === sections.length - 1;
    if (invite) invite.hidden = last;
    if (last) { hideCue(); cue.removeAttribute('href'); cue.setAttribute('aria-disabled', 'true'); }
    else {
      cue.removeAttribute('aria-disabled');
      cue.setAttribute('href', '#' + sections[index + 1].id);
      cue.setAttribute('aria-label', 'Следующий раздел: ' + (sections[index + 1].querySelector('h1, h2')?.textContent || '').trim());
    }
    menuLinks.forEach(link => {
      if (link.getAttribute('href') === '#' + sections[index].id) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
  function render() {
    frame = null;
    backTop.hidden = position() < 400 || modalOpen();
    const anchor = headerHeight + Math.max(60, (viewport() - headerHeight - 104) * .4);
    let active = 0;
    sections.forEach((section, i) => { if (section.getBoundingClientRect().top <= anchor) active = i; });
    if (bottom()) active = sections.length - 1;
    if (hero) document.body.classList.toggle('is-information-visible', sections[active] !== hero);
    if (active !== index) {
      const focusedAction = actionBar?.contains(document.activeElement);
      index = active; clearNotice(); updateActions(); activity();
      if (focusedAction && document.activeElement?.closest?.('[hidden]')) main.focus({ preventScroll: true });
    }
    syncVideo();
  }
  function queueRender() { if (frame === null) frame = requestAnimationFrame(render); }
  function measure() {
    headerHeight = Math.ceil(header.getBoundingClientRect().height);
    root.style.setProperty('--service-nav-height', headerHeight + 'px');
    queueRender();
  }
  const revealItems = [...main.querySelectorAll('.service-intro > div, .service-video, .service-section > .service-eyebrow, .service-section > h2, .service-section > p:not(.service-eyebrow), .service-cards > article, .service-inclusions > div, .service-process > li, .service-faq > details, .service-final > h2, .service-final > p')];
  let revealObserver = null;
  function reveal(item) {
    item.classList.remove('is-pending'); item.classList.add('is-visible');
    revealObserver?.unobserve(item);
  }
  function revealWithin(section) { revealItems.forEach(item => { if (section.contains(item)) reveal(item); }); }
  if (!reduced.matches && typeof IntersectionObserver !== 'undefined') {
    try {
      revealObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => { if (entry.isIntersecting) reveal(entry.target); });
      }, { threshold: .05, rootMargin: '0px 0px 150px 0px' });
      revealItems.forEach(item => {
        item.classList.add('service-reveal', 'is-pending'); revealObserver.observe(item);
      });
    } catch (_) { revealItems.forEach(reveal); }
  }
  function sectionForHash(hash) {
    let target;
    try { target = document.getElementById(decodeURIComponent(hash.slice(1))); } catch (_) { return null; }
    return sections.find(section => section === target || section.contains(target)) || null;
  }
  function go(section) {
    revealWithin(section);
    section.scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'start' });
    const heading = section.querySelector('h1, h2');
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    try { if (location.hash !== '#' + section.id) history.pushState(history.state, '', '#' + section.id); } catch (_) { /* Local file previews may restrict history. */ }
    activity(); queueRender();
  }
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button > 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const link = event.target.closest?.('a[href^="#"]');
    if (!link) return;
    const fromMenu = menu?.open && menu.contains(link);
    if (modalOpen() && !fromMenu) return;
    const href = link.getAttribute('href');
    const section = href === '#serviceMain' ? sections[index] : sectionForHash(href);
    if (!section) return;
    event.preventDefault();
    if (fromMenu) menu.close();
    go(section);
  });
  if (menu && menuToggle) {
    menuToggle.addEventListener('click', () => {
      if (modalOpen()) return;
      menu.showModal();
      menuToggle.setAttribute('aria-expanded', 'true');
      menuToggle.setAttribute('aria-label', 'Закрыть навигацию');
      menuLinks.find(link => link.getAttribute('aria-current') === 'location')?.focus();
      syncDialogs();
    });
    menu.querySelector('.service-menu-close')?.addEventListener('click', () => menu.close());
    menu.addEventListener('close', () => {
      menuToggle.setAttribute('aria-expanded', 'false'); menuToggle.setAttribute('aria-label', 'Открыть навигацию');
    });
    menu.addEventListener('click', event => {
      if (event.target !== menu) return;
      const rect = menu.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) menu.close();
    });
  }
  function syncDialogs() {
    root.classList.toggle('service-modal-open', modalOpen());
    backTop.hidden = position() < 400 || modalOpen();
    if (modalOpen()) { hideCue(); clearNotice(); } else activity();
    syncVideo();
  }
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('close', syncDialogs); dialog.addEventListener('toggle', syncDialogs);
    if (typeof MutationObserver !== 'undefined') new MutationObserver(syncDialogs).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  });
  main.addEventListener('toggle', event => {
    const opened = event.target;
    if (opened.tagName === 'DETAILS' && opened.open) opened.closest('.service-faq')?.querySelectorAll('details').forEach(other => { if (other !== opened) other.open = false; });
    activity(); queueRender();
  }, true);
  main.addEventListener('focusin', event => {
    const item = event.target.closest?.('.service-reveal'); if (item) reveal(item);
  });
  window.addEventListener('scroll', () => { activity(); queueRender(); }, { passive: true });
  window.addEventListener('resize', measure, { passive: true });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(measure).observe(header);
  window.addEventListener('wheel', event => {
    if (!event.ctrlKey && !event.metaKey && !interactive(event.target) && event.deltaY > 0 && Math.abs(event.deltaY) >= Math.abs(event.deltaX)) endAttempt();
  }, { passive: true });
  window.addEventListener('touchstart', event => {
    touch = !modalOpen() && !interactive(event.target) && event.touches.length === 1 ? {x:event.touches[0].clientX,y:event.touches[0].clientY,atEnd:bottom()} : null;
  }, { passive: true });
  window.addEventListener('touchmove', event => { if (event.touches.length !== 1) touch = null; }, { passive: true });
  window.addEventListener('touchend', event => {
    const point = event.changedTouches[0];
    if (touch?.atEnd && point && point.clientY < touch.y - 48 && Math.abs(point.clientX - touch.x) < touch.y - point.clientY) endAttempt();
    touch = null;
  }, { passive: true });
  window.addEventListener('touchcancel', () => { touch = null; }, { passive: true });
  document.addEventListener('keydown', event => {
    if (!event.defaultPrevented && !interactive(event.target) && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.repeat && ['ArrowDown','ArrowRight','PageDown',' '].includes(event.key)) endAttempt();
  });
  ['pointerdown','keydown','wheel','touchstart'].forEach(type => document.addEventListener(type, event => {
    if (!cue.contains(event.target)) activity();
  }, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => { hideCue(); clearNotice(); syncVideo(); if (!document.hidden) activity(); });
  window.addEventListener('hashchange', () => {
    const section = sectionForHash(location.hash); if (section) revealWithin(section); queueRender();
  });
  reduced.addEventListener?.('change', () => { if (reduced.matches) revealItems.forEach(reveal); });
  root.classList.add('has-service-flow');
  document.body.classList.add('service-flow-active');
  main.classList.add('service-flow'); main.tabIndex = -1;
  measure(); updateActions(); render(); activity();
  const initial = sectionForHash(location.hash);
  if (initial) requestAnimationFrame(() => { revealWithin(initial); initial.scrollIntoView({block:'start',behavior:'auto'}); queueRender(); });
  if (reduced.matches) videos.forEach(video => { video.autoplay = false; video.pause(); });
})();
