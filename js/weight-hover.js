/* Адаптация эффекта weight-hover для заголовков портфолио.
 * Принцип эффекта: dovvstudio.com, изменение wght по расстоянию до мыши.
 * data-weight-rest — исходный вес (по умолчанию из CSS),
 * data-weight-near — вес рядом с курсором (200), data-radius — радиус (250 px).
 */
(() => {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = { x: -9999, y: -9999 };
  const headings = [];
  let frame = 0;
  let previousTime = 0;

  function animate(time) {
    const speed = 1 - Math.pow(0.9, Math.min(64, previousTime ? time - previousTime : 16.67) / 16.67);
    previousTime = time;
    let moving = false;

    for (const heading of headings) {
      const bounds = heading.element.getBoundingClientRect();
      const visible = bounds.bottom >= 0 && bounds.top <= innerHeight;
      for (const letter of heading.letters) {
        const influence = visible && !motion.matches
          ? Math.max(0, 1 - Math.hypot(
              pointer.x - bounds.left - letter.x,
              pointer.y - bounds.top - letter.y
            ) / heading.radius)
          : 0;
        const target = heading.rest + (heading.near - heading.rest) * influence * influence * (3 - 2 * influence);
        letter.weight += (target - letter.weight) * speed;
        if (Math.abs(target - letter.weight) < 0.5) letter.weight = target;
        else moving = true;
        letter.span.style.fontVariationSettings = `"wght" ${letter.weight.toFixed(1)}`;
      }
    }
    frame = moving ? requestAnimationFrame(animate) : 0;
    if (!moving) previousTime = 0;
  }

  function schedule() {
    if (!frame && headings.length) frame = requestAnimationFrame(animate);
  }

  function measure() {
    for (const heading of headings) {
      for (const letter of heading.letters) {
        letter.span.style.width = '';
        letter.span.style.fontVariationSettings = `"wght" ${heading.rest}`;
        letter.weight = heading.rest;
      }
      // Фиксируем ширины букв: изменение wght не перестраивает строки.
      const widths = heading.letters.map(letter => letter.span.getBoundingClientRect().width);
      heading.letters.forEach((letter, index) => { letter.span.style.width = `${widths[index]}px`; });
      const bounds = heading.element.getBoundingClientRect();
      for (const letter of heading.letters) {
        const rect = letter.span.getBoundingClientRect();
        letter.x = rect.left + rect.width / 2 - bounds.left;
        letter.y = rect.top + rect.height / 2 - bounds.top;
      }
    }
    schedule();
  }

  function start() {
    if (new URLSearchParams(location.search).has('static')) return;
    document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"], [data-weight-hover]').forEach(element => {
      if (!element.hasAttribute('aria-label')) {
        element.setAttribute('aria-label', element.textContent.trim().replace(/\s+/g, ' '));
      }
      const heading = {
        element,
        rest: Number(element.dataset.weightRest || getComputedStyle(element).fontWeight) || 600,
        near: Number(element.dataset.weightNear ?? 200),
        radius: Math.max(1, Number(element.dataset.radius) || 350),
        letters: []
      };
      // Сохраняем вложенную разметку, ссылки и явные переносы строк.
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        const fragment = document.createDocumentFragment();
        for (const token of node.textContent.split(/([\t\n\r ]+)/)) {
          if (!token) continue;
          if (/^[\t\n\r ]+$/.test(token)) {
            fragment.append(document.createTextNode(token));
            continue;
          }
          const word = document.createElement('span');
          word.className = 'weight-hover-word';
          word.setAttribute('aria-hidden', 'true');
          for (const character of token) {
            const span = document.createElement('span');
            span.className = 'weight-hover-letter';
            span.textContent = character;
            span.style.fontVariationSettings = `"wght" ${heading.rest}`;
            word.append(span);
            heading.letters.push({ span, weight: heading.rest, x: 0, y: 0 });
          }
          fragment.append(word);
        }
        node.replaceWith(fragment);
      }
      headings.push(heading);
    });
    measure();
    document.fonts.ready.then(measure);
    document.fonts.addEventListener('loadingdone', measure);
    window.addEventListener('resize', measure, { passive: true });
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('pointermove', event => {
      if (event.pointerType !== 'mouse' || motion.matches) return;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      schedule();
    }, { passive: true });
    const reset = () => { pointer.x = pointer.y = -9999; schedule(); };
    document.addEventListener('pointerleave', reset);
    window.addEventListener('blur', reset);
    motion.addEventListener('change', reset);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
