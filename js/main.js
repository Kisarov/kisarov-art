(() => {
  'use strict';

  const nav = document.querySelector('.site-nav');
  if (nav) {
    const updateNav = () => nav.classList.toggle('scrolled', window.scrollY > 60);
    updateNav();
    window.addEventListener('scroll', updateNav, { passive: true });
    window.addEventListener('pageshow', updateNav);
  }

  for (const button of document.querySelectorAll('.button, .site-nav .theme-btn')) {
    const icon = button.querySelector('.t-icon');
    const text = (icon?.nextElementSibling || button).textContent.trim();
    if (!text) continue;

    const label = document.createElement('span');
    label.className = 'button__label';
    label.setAttribute('aria-hidden', 'true');
    if (icon) label.append(icon);
    let index = 0;

    for (const part of text.split(/(\s+)/u)) {
      if (!part.trim()) {
        label.append(part);
        continue;
      }

      const word = document.createElement('span');
      word.className = 'button__word';
      for (const character of part) {
        const mask = document.createElement('span');
        mask.className = 'button__char-mask';
        const letter = document.createElement('span');
        letter.className = 'button__char';
        letter.textContent = character;
        letter.style.setProperty('--button-char-index', String(index++));
        mask.append(letter);
        word.append(mask);
      }
      label.append(word);
    }

    const ink = document.createElement('span');
    ink.className = 'button__ink';
    ink.append(label.cloneNode(true));
    if (!button.hasAttribute('aria-label')) button.setAttribute('aria-label', text);
    button.replaceChildren(label, ink);
  }

  if (new URLSearchParams(location.search).has('static')) return;

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(pointer: fine)');

  function setupProjectCursor() {
    const cursor = document.querySelector('.project-cursor');
    if (!cursor) return;
    let cover;

    function hide() {
      cover?.classList.remove('has-project-cursor');
      cover = null;
      cursor.classList.remove('is-visible');
    }

    function move(event) {
      if (event.pointerType !== 'mouse' || !finePointer.matches || document.hidden) return;
      cursor.style.translate = `${event.clientX}px ${event.clientY}px`;
      if (cover !== event.currentTarget) {
        hide();
        cover = event.currentTarget;
        cover.classList.add('has-project-cursor');
        cursor.classList.add('is-visible');
      }
    }

    for (const image of document.querySelectorAll('.projects .card__image')) {
      image.addEventListener('pointerenter', move, { passive: true });
      image.addEventListener('pointermove', move, { passive: true });
      image.addEventListener('pointerleave', event => { if (cover === event.currentTarget) hide(); });
      image.addEventListener('pointercancel', hide);
    }
    window.addEventListener('blur', hide);
    document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); });
    finePointer.addEventListener('change', hide);
  }

  setupProjectCursor();

  const heroContent = document.querySelector('.hero__content');
  if (!heroContent) return;
  const layers = [...heroContent.querySelectorAll('[data-depth]')].map(element => ({
    element,
    distance: 18 * Number(element.dataset.depth)
  }));
  if (!layers.length) return;
  const target = { x: 0, y: 0 };
  const position = { x: 0, y: 0 };
  let parallaxFrame = 0;
  let heroVisible = false;

  function drawParallax() {
    parallaxFrame = 0;
    position.x += (target.x - position.x) * 0.08;
    position.y += (target.y - position.y) * 0.08;
    for (const { element, distance } of layers) {
      element.style.translate = `${(-position.x * distance).toFixed(2)}px ${(-position.y * distance).toFixed(2)}px`;
    }
    if (Math.abs(target.x - position.x) > 0.001 || Math.abs(target.y - position.y) > 0.001) {
      scheduleParallax();
    }
  }

  function scheduleParallax() {
    if (!heroVisible || document.hidden || motion.matches || !finePointer.matches) return;
    if (!parallaxFrame) parallaxFrame = requestAnimationFrame(drawParallax);
  }

  function resetParallax() {
    target.x = target.y = 0;
    scheduleParallax();
  }

  function stopParallax() {
    cancelAnimationFrame(parallaxFrame);
    parallaxFrame = 0;
    target.x = target.y = position.x = position.y = 0;
    for (const { element } of layers) element.style.translate = '';
  }

  window.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || !heroVisible || document.hidden || motion.matches || !finePointer.matches) return;
    target.x = event.clientX / window.innerWidth * 2 - 1;
    target.y = event.clientY / window.innerHeight * 2 - 1;
    scheduleParallax();
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', resetParallax);
  window.addEventListener('blur', resetParallax);
  motion.addEventListener('change', stopParallax);
  finePointer.addEventListener('change', stopParallax);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopParallax();
  });
  new IntersectionObserver(([entry]) => {
    heroVisible = entry.isIntersecting;
    if (!heroVisible) stopParallax();
  }).observe(heroContent.closest('.hero') || heroContent);
})();
