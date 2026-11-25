(() => {
  'use strict';

  const root = document.documentElement;
  if (!root.dataset.theme) {
    try {
      root.dataset.theme = localStorage.getItem('portfolio-theme') === 'dark' ? 'dark' : 'light';
    } catch {
      root.dataset.theme = 'light';
    }
  }

  function setupMarqueeHover() {
    const items = document.querySelectorAll('.marquee-group li');
    if (!items.length) return;

    const canAnimate = matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
    const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    for (const item of items) {
      const text = item.textContent.trim();
      const label = document.createElement('span');
      label.className = 'marquee__accessible-label';
      label.textContent = text;

      const visual = document.createElement('span');
      visual.className = 'marquee__text';
      visual.setAttribute('aria-hidden', 'true');

      const letters = [];
      for (const part of text.split(/(\s+)/u)) {
        if (!part.trim()) {
          visual.append(part);
          continue;
        }

        const word = Array.from(part);
        const offset = letters.length;
        const step = word.length / (word.length * 2 - 1);
        word.forEach((character, index) => {
          const element = document.createElement('span');
          element.className = 'marquee__letter';
          element.textContent = character;
          visual.append(element);
          letters.push({
            element,
            start: offset + index * step,
            end: offset + (word.length + index) * step
          });
        });
      }
      item.replaceChildren(label, visual);

      let frame;
      item.addEventListener('pointerenter', event => {
        if (event.pointerType !== 'mouse' || !canAnimate.matches) return;
        cancelAnimationFrame(frame);
        const startedAt = performance.now();
        let previousTick = -1;

        function draw(now) {
          const elapsed = now - startedAt;
          const progress = canAnimate.matches ? Math.min(elapsed / 750, 1) : 1;
          const position = (1 - (1 - progress) ** 3) * letters.length;
          const tick = Math.floor(elapsed / 50);

          for (const { element, start, end } of letters) {
            if (progress < 1 && position > start && position < end) {
              if (tick !== previousTick || !element.dataset.scramble) {
                element.dataset.scramble = glyphs[Math.floor(Math.random() * glyphs.length)];
              }
            } else if (element.dataset.scramble) {
              delete element.dataset.scramble;
            }
          }

          previousTick = tick;
          if (progress < 1) frame = requestAnimationFrame(draw);
        }

        frame = requestAnimationFrame(draw);
      });
    }
  }

  function setupButtonFill(button, ink) {
    if (!ink.animate || !CSS.supports('mask-position', '50% 50%')) return;

    button.dataset.fillMotion = '';
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let animation;
    let active = false;

    function updateFill() {
      const hovered = button.matches(':hover, :focus-visible');
      if (hovered === active) return;

      const from = getComputedStyle(ink).maskPosition;
      animation?.cancel();
      active = hovered;
      const next = ink.animate({ maskPosition: [from, active ? '50% 50%' : '50% 100%'] }, {
        duration: motion.matches ? 0 : active ? 800 : 400,
        easing: active ? 'cubic-bezier(0.16, 1, 0.3, 1)' : 'ease-out',
        fill: 'forwards'
      });
      animation = next;

      if (!active) {
        next.onfinish = () => {
          if (animation !== next) return;
          next.cancel();
          animation = undefined;
        };
      }
    }

    for (const event of ['pointerenter', 'pointerleave', 'focus', 'blur']) {
      button.addEventListener(event, updateFill);
    }
    motion.addEventListener('change', () => { if (motion.matches) animation?.finish(); });
    updateFill();
  }

  function initialize() {
    const nav = document.querySelector('.site-nav');
    if (nav) {
      const updateNav = () => nav.classList.toggle('scrolled', window.scrollY > 60);
      updateNav();
      window.addEventListener('scroll', updateNav, { passive: true });
      window.addEventListener('pageshow', updateNav);
    }

    function renderButton(button, text) {
      if (!text) return;

      const label = document.createElement('span');
      label.className = 'button__label';
      label.setAttribute('aria-hidden', 'true');
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
          mask.dataset.char = character;
          mask.style.setProperty('--button-char-index', String(index++));
          const letter = document.createElement('span');
          letter.className = 'button__char';
          letter.textContent = character;
          mask.append(letter);
          word.append(mask);
        }
        label.append(word);
      }

      if (!button.hasAttribute('aria-label')) button.setAttribute('aria-label', text);
      button.replaceChildren(label);
      if (button.matches('.primary, .secondary')) {
        const ink = document.createElement('span');
        ink.className = 'button__ink';
        ink.append(label.cloneNode(true));
        button.append(ink);
        setupButtonFill(button, ink);
      }
    }

    for (const button of document.querySelectorAll('.button')) {
      renderButton(button, button.textContent.trim());
    }

    setupMarqueeHover();

    const themeButton = document.querySelector('.theme-btn');
    function updateTheme(theme) {
      const changed = root.dataset.theme !== theme;
      root.dataset.theme = theme;
      themeButton?.setAttribute('aria-label', theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему');
      if (changed) window.dispatchEvent(new Event('themechange'));
    }
    updateTheme(root.dataset.theme);
    themeButton?.addEventListener('click', () => {
      updateTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
      try { localStorage.setItem('portfolio-theme', root.dataset.theme); } catch {}
    });
    window.addEventListener('storage', event => {
      if (event.key === 'portfolio-theme' || event.key === null) {
        updateTheme(event.newValue === 'dark' ? 'dark' : 'light');
      }
    });
    window.addEventListener('pageshow', event => {
      if (!event.persisted) return;
      try { updateTheme(localStorage.getItem('portfolio-theme') === 'dark' ? 'dark' : 'light'); } catch {}
    });

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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
