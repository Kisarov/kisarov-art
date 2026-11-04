(() => {
  'use strict';

  const hero = document.querySelector('.hero');
  const heading = hero?.querySelector('.hero__name');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  if (!heading || !hero.animate || motion.matches || new URLSearchParams(location.search).has('static')) return;

  const duration = 1200;
  const stagger = 120;
  const easing = 'cubic-bezier(0.77, 0, 0.175, 1)';
  const visibility = hero.style.visibility;
  const animations = [];
  let layer;
  let finished = false;

  function finish() {
    if (finished) return;
    finished = true;
    hero.style.visibility = visibility;
    for (const animation of animations) animation.cancel();
    layer?.remove();
    motion.removeEventListener('change', finish);
    window.removeEventListener('resize', finish);
    hero.removeEventListener('focusin', finish);
    document.fonts.removeEventListener('loadingdone', finish);
  }

  function reveal(element, delay) {
    if (!element) return;
    animations.push(element.animate([
      { opacity: 0, transform: 'translateY(1rem)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], { duration, delay, easing, fill: 'backwards' }));
  }

  function revealHeading() {
    const words = [...heading.querySelectorAll('.weight-hover-word')].filter(word => word.textContent.trim());
    if (!words.length) {
      const text = document.createElement('span');
      text.append(...heading.childNodes);
      heading.append(text);
      words.push(text);
    }

    const bounds = heading.getBoundingClientRect();
    const bleed = parseFloat(getComputedStyle(heading).fontSize) * 0.15;
    const lines = [];
    for (const word of words) {
      const rect = word.getBoundingClientRect();
      const line = lines.at(-1);
      if (!line || Math.abs(rect.top - line.top) > 1) {
        lines.push({ top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, words: [word] });
      } else {
        line.left = Math.min(line.left, rect.left);
        line.right = Math.max(line.right, rect.right);
        line.bottom = Math.max(line.bottom, rect.bottom);
        line.words.push(word);
      }
    }

    layer = document.createElement('span');
    layer.className = 'hero__intro-layer';
    layer.setAttribute('aria-hidden', 'true');
    heading.append(layer);
    for (const [index, line] of lines.entries()) {
      const strip = document.createElement('span');
      strip.className = 'hero__intro-strip';
      Object.assign(strip.style, {
        left: `${line.left - bounds.left - bleed}px`,
        top: `${line.top - bounds.top - bleed}px`,
        width: `${line.right - line.left + 2 * bleed}px`,
        height: `${line.bottom - line.top + 2 * bleed}px`
      });
      layer.append(strip);
      const delay = (index + 1) * stagger;
      animations.push(strip.animate([
        { clipPath: 'inset(0 100% 0 0)', offset: 0, easing },
        { clipPath: 'inset(0)', offset: 0.45, easing },
        { clipPath: 'inset(0 0 0 100%)', offset: 1 }
      ], { duration, delay, fill: 'both' }));
      for (const word of line.words) {
        animations.push(word.animate([
          { opacity: 0, offset: 0 },
          { opacity: 0, offset: 0.45, easing },
          { opacity: 1, offset: 0.46 },
          { opacity: 1, offset: 1 }
        ], { duration, delay, fill: 'backwards' }));
      }
    }
  }

  hero.style.visibility = 'hidden';
  motion.addEventListener('change', finish);
  hero.addEventListener('focusin', finish, { once: true });
  let fontTimeout;
  const fontLimit = new Promise(resolve => { fontTimeout = setTimeout(resolve, 500); });
  Promise.race([document.fonts.ready, fontLimit]).then(() => {
    clearTimeout(fontTimeout);
    if (finished) return;
    revealHeading();
    reveal(hero.querySelector('.hero__bio'), 0);
    reveal(hero.querySelector('.hero__skills'), stagger);
    reveal(hero.querySelector('.hero__avatar'), 3 * stagger);
    reveal(hero.querySelector('.hero__links'), 3 * stagger);
    hero.style.visibility = visibility;
    window.addEventListener('resize', finish, { passive: true });
    document.fonts.addEventListener('loadingdone', finish, { once: true });
    Promise.allSettled(animations.map(animation => animation.finished)).then(finish);
  }).catch(finish);
})();
