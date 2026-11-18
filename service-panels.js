(() => {
  'use strict';
  const main = document.querySelector('.service-main');
  const header = document.querySelector('.service-nav');
  if (!main || !header || document.body.classList.contains('service-flow-active')) return;
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
  const resumeVideos = new WeakSet();
  const videos = [...main.querySelectorAll('video')];
  videos.forEach(video => { if (video.autoplay && !reduced.matches) resumeVideos.add(video); });
  const modalOpen = () => Boolean(document.querySelector('dialog[open]'));
  const position = () => window.scrollY || root.scrollTop || 0;
  const viewport = () => window.innerHeight || root.clientHeight;
  const bottom = () => position() + viewport() >= (document.scrollingElement || root).scrollHeight - 4;
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
      index = active; updateActions();
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
  const revealItems = [...main.querySelectorAll('.service-intro > div, .service-video, .service-section > .service-eyebrow, .service-section > h2, .service-section > p:not(.service-eyebrow), .service-cards > article, .service-inclusions > div, .package-offer, .service-process > li, .service-faq > details, .service-final > h2, .service-final > p')];
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
    queueRender();
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
    syncVideo();
  }
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('close', syncDialogs); dialog.addEventListener('toggle', syncDialogs);
    if (typeof MutationObserver !== 'undefined') new MutationObserver(syncDialogs).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  });
  main.addEventListener('toggle', event => {
    const opened = event.target;
    if (opened.tagName === 'DETAILS' && opened.open) opened.closest('.service-faq')?.querySelectorAll('details').forEach(other => { if (other !== opened) other.open = false; });
    queueRender();
  }, true);
  main.addEventListener('focusin', event => {
    const item = event.target.closest?.('.service-reveal'); if (item) reveal(item);
  });
  window.addEventListener('scroll', queueRender, { passive: true });
  window.addEventListener('resize', measure, { passive: true });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(measure).observe(header);
  document.addEventListener('visibilitychange', syncVideo);
  window.addEventListener('hashchange', () => {
    const section = sectionForHash(location.hash); if (section) revealWithin(section); queueRender();
  });
  reduced.addEventListener?.('change', () => { if (reduced.matches) revealItems.forEach(reveal); });
  root.classList.add('has-service-flow');
  document.body.classList.add('service-flow-active');
  main.classList.add('service-flow'); main.tabIndex = -1;
  measure(); updateActions(); render();
  const initial = sectionForHash(location.hash);
  if (initial) requestAnimationFrame(() => { revealWithin(initial); initial.scrollIntoView({block:'start',behavior:'auto'}); queueRender(); });
  if (reduced.matches) videos.forEach(video => { video.autoplay = false; video.pause(); });
})();
