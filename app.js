(() => {
  'use strict';

  const phases = [
    { id: 'morning', time: '07:00', name: 'Раннее утро', note: 'Мягкий свет. Новый день.' },
    { id: 'day', time: '13:00', name: 'Солнечный день', note: 'Ясное небо. Встречи без спешки.' },
    { id: 'sunset', time: '19:30', name: 'Золотой закат', note: 'Тёплый свет. Долгие разговоры.' },
    { id: 'night', time: '23:00', name: 'Тёплая ночь', note: 'Огни гирлянд. Своя компания.' }
  ];
  const experience = document.querySelector('#experience');
  if (!experience) return;
  const scenes = [...document.querySelectorAll('.time-scene')];
  const buttons = [...document.querySelectorAll('.time-button')];
  const name = document.querySelector('#phaseName');
  const note = document.querySelector('#phaseNote');
  const count = document.querySelector('#sceneCount');
  const progress = document.querySelector('#sceneProgress');
  const inquiry = document.querySelector('#inquiry');
  const lightbox = document.querySelector('#lightbox');
  const navigation = document.querySelector('#serviceMenu');
  const canvas = document.querySelector('#ambient');
  const context = canvas?.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(pointer: fine)');
  const media = window.ToDublinMedia;
  const duration = 5000;
  let index = Math.max(0, phases.findIndex(phase => phase.id === document.body.dataset.phase));
  let elapsed = 0;
  let frame = 0;
  let lastFrame = 0;
  let ambientTime = 0;
  let width = 1;
  let height = 1;
  let particles = [];
  let heroVisible = true;
  let pageReady = document.readyState === 'complete';
  let phaseRequest = 0;
  let pendingPhase = null;

  const isInteractive = target => Boolean(target?.closest?.('button, a, input, textarea, select, summary, [contenteditable], dialog'));
  const modalOpen = () => Boolean(lightbox?.open || inquiry?.open || navigation?.open);
  const canRun = () => heroVisible && !reduce.matches && !document.hidden && !modalOpen();
  const random = (min, max) => min + Math.random() * (max - min);

  function warmNextScene() {
    if (!media || !pageReady || !canRun()) return;
    requestAnimationFrame(() => {
      const warm = () => {
        if (canRun()) media.ensureScene(scenes[(index + 1) % scenes.length], 'low');
      };
      if (window.requestIdleCallback) window.requestIdleCallback(warm, { timeout: 1000 });
      else setTimeout(warm, 150);
    });
  }

  function makeParticles() {
    const small = width < 700;
    const type = phases[index].id;
    const number = { morning: 12, day: 8, sunset: 18, night: 22 }[type];
    particles = Array.from({ length: Math.round(number * (small ? .6 : 1)) }, () => ({
      x: random(.03, .97) * width,
      y: (type === 'night' ? random(.74, .98) : type === 'sunset' ? random(.63, .99) : random(.12, .91)) * height,
      radius: type === 'night' ? random(.8, 1.6) : random(.5, 1.2),
      speed: random(.8, 2),
      phase: random(0, Math.PI * 2),
      drift: random(-.6, .6)
    }));
  }

  function drawAmbient(delta) {
    if (!context) return;
    context.clearRect(0, 0, width, height);
    if (reduce.matches) return;
    const type = phases[index].id;
    for (const particle of particles) {
      context.save();
      const shimmer = .5 + Math.sin(ambientTime * .8 + particle.phase) * .5;
      const isNight = type === 'night';
      context.globalAlpha = isNight ? .12 + shimmer * .58 : type === 'day' ? .035 + shimmer * .065 : .06 + shimmer * .15;
      context.fillStyle = isNight ? '#ffe8a0' : type === 'sunset' ? '#fbdc91' : '#fff8e1';
      if (isNight) {
        context.shadowColor = '#e6cb71';
        context.shadowBlur = 9;
      } else {
        particle.y -= particle.speed * delta;
        particle.x += particle.drift * delta;
        if (particle.y < -10) particle.y = height + 10;
        if (particle.x < -10) particle.x = width + 10;
        if (particle.x > width + 10) particle.x = -10;
      }
      context.beginPath();
      context.arc(
        particle.x + Math.sin(ambientTime * .25 + particle.phase) * (isNight ? 13 : 5),
        particle.y + Math.sin(ambientTime * .18 + particle.phase) * (isNight ? 10 : 3),
        particle.radius, 0, Math.PI * 2
      );
      context.fill();
      context.restore();
    }
  }

  function resizeAmbient() {
    const bounds = experience.getBoundingClientRect();
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    if (canvas && context) {
      const ratio = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    makeParticles();
    drawAmbient(0);
  }

  function updateProgress() {
    progress?.style.setProperty('--progress', String(Math.min(elapsed / duration, 1)));
  }

  function syncLoop() {
    if (canRun()) {
      if (!frame) {
        lastFrame = 0;
        frame = requestAnimationFrame(tick);
      }
    } else if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
      lastFrame = 0;
    }
  }

  function renderPhase(next) {
    index = (next + phases.length) % phases.length;
    const phase = phases[index];
    document.body.dataset.phase = phase.id;
    scenes.forEach(scene => {
      const selected = scene.dataset.scene === phase.id;
      scene.classList.toggle('is-active', selected);
      scene.setAttribute('aria-hidden', String(!selected));
    });
    buttons.forEach(button => {
      const selected = button.dataset.phase === phase.id;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    if (name) name.textContent = phase.name;
    if (note) note.textContent = phase.note;
    if (count) count.textContent = phase.time;
    elapsed = 0;
    updateProgress();
    makeParticles();
    drawAmbient(0);
  }

  function changePhase(next, priority = 'high') {
    const target = (next + phases.length) % phases.length;
    const request = ++phaseRequest;
    if (!media) { renderPhase(target); return; }
    pendingPhase = target;
    media.ensureScene(scenes[target], priority).then(ready => {
      if (request !== phaseRequest) return;
      pendingPhase = null;
      if (ready) { renderPhase(target); warmNextScene(); }
      else {
        // Keep the previous scene rather than crossfading to an empty image.
        elapsed = 0; updateProgress();
        if (note) note.textContent = 'Сцена не загрузилась. Попробуйте выбрать её ещё раз.';
      }
    });
  }

  function tick(timestamp) {
    frame = 0;
    if (!canRun()) return;
    const delta = lastFrame ? Math.min((timestamp - lastFrame) / 1000, .1) : 0;
    lastFrame = timestamp;
    ambientTime += delta;
    elapsed += delta * 1000;
    if (elapsed >= duration && pendingPhase === null) changePhase(index + 1, 'low');
    drawAmbient(delta);
    updateProgress();
    frame = requestAnimationFrame(tick);
  }

  function renderMotionPreference() {
    document.body.classList.toggle('is-paused', reduce.matches);
    syncLoop();
  }

  buttons.forEach(button => button.addEventListener('click', () => {
    const next = phases.findIndex(phase => phase.id === button.dataset.phase);
    if (next !== -1) changePhase(next);
  }));

  // Vertical input always scrolls the document. Horizontal keys are scoped to the hero.
  experience.addEventListener('keydown', event => {
    if (modalOpen() || isInteractive(event.target) || event.altKey || event.ctrlKey || event.metaKey) return;
    const direction = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (direction) {
      event.preventDefault();
      changePhase(index + direction);
    }
  });

  function openDialog(dialog) {
    if (!dialog || dialog.open) return;
    dialog.showModal();
    syncLoop();
  }
  document.querySelector('#zoom')?.addEventListener('click', () => {
    const phase = phases[index];
    const image = document.querySelector('#zoomImage');
    const source = document.querySelector('#zoomSource');
    const sceneFile = `courtyard-${phase.id}-busy`;
    if (source) source.srcset = `${sceneFile}-mobile.webp?v=${phase.id === 'night' ? 'night-party-4' : 'four-barrels-2'}`;
    if (image) {
      image.src = `${sceneFile}.webp?v=four-barrels-2`;
      image.alt = `Мобильный паб со столиками-бочками, обогревателями и гостями — ${phase.name.toLowerCase()}`;
    }
    openDialog(lightbox);
  });
  document.querySelector('#closeZoom')?.addEventListener('click', () => lightbox?.close());
  [lightbox, inquiry].filter(Boolean).forEach(dialog => {
    dialog.addEventListener('close', syncLoop);
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
  });

  [lightbox, inquiry, navigation].filter(Boolean).forEach(dialog => {
    if (typeof MutationObserver !== 'undefined') new MutationObserver(syncLoop).observe(dialog, { attributes: true, attributeFilter: ['open'] });
    dialog.addEventListener('toggle', syncLoop);
    dialog.addEventListener('close', syncLoop);
  });

  function syncVisibility() {
    const bounds = experience.getBoundingClientRect();
    heroVisible = bounds.bottom > 0 && bounds.top < window.innerHeight;
    syncLoop();
    if (heroVisible) warmNextScene();
  }
  if (typeof IntersectionObserver !== 'undefined') {
    new IntersectionObserver(entries => {
      heroVisible = entries.some(entry => entry.target === experience && entry.isIntersecting);
      syncLoop();
      if (heroVisible) warmNextScene();
    }, { threshold: 0 }).observe(experience);
  } else {
    window.addEventListener('scroll', syncVisibility, { passive: true });
  }

  experience.addEventListener('pointermove', event => {
    if (!finePointer.matches || reduce.matches || modalOpen() || event.pointerType === 'touch') return;
    const bounds = experience.getBoundingClientRect();
    experience.style.setProperty('--look-x', `${((event.clientX - bounds.left) / bounds.width - .5) * 10}px`);
    experience.style.setProperty('--look-y', `${((event.clientY - bounds.top) / bounds.height - .5) * 8}px`);
  }, { passive: true });
  function resetLook() {
    experience.style.setProperty('--look-x', '0px');
    experience.style.setProperty('--look-y', '0px');
  }
  experience.addEventListener('pointerleave', resetLook, { passive: true });
  document.addEventListener('visibilitychange', () => { syncLoop(); warmNextScene(); });
  window.addEventListener('load', () => { pageReady = true; warmNextScene(); }, { once: true });
  window.addEventListener('resize', resizeAmbient, { passive: true });
  reduce.addEventListener('change', () => {
    resetLook();
    drawAmbient(0);
    renderMotionPreference();
  });

  resizeAmbient();
  syncVisibility();
  renderPhase(index);
  renderMotionPreference();
  if (pageReady) warmNextScene();
})();
