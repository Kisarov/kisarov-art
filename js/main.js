(() => {
  'use strict';

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const letterTiming = { duration: 500, easing: 'cubic-bezier(0.333333, 1, 0.666667, 1)' };
  const enterOffset = 200;
  const leave = [
    { transform: 'translateY(0)', opacity: 1 },
    { transform: 'translateY(-10px)', opacity: 0 }
  ];
  const enter = [
    { transform: 'translateY(10px)', opacity: 0 },
    { transform: 'translateY(0)', opacity: 1 }
  ];

  for (const button of document.querySelectorAll('.button')) {
    const text = button.textContent.trim();
    if (!text) continue;

    const label = document.createElement('span');
    label.className = 'button__label';
    label.setAttribute('aria-hidden', 'true');

    for (const part of text.split(/(\s+)/u)) {
      if (!part.trim()) {
        label.append(part);
        continue;
      }

      const word = document.createElement('span');
      word.className = 'button__word';
      for (const character of part) {
        const letter = document.createElement('span');
        letter.className = 'button__char';
        letter.textContent = character;
        word.append(letter);
      }
      label.append(word);
    }

    const ink = document.createElement('span');
    ink.className = 'button__ink';
    ink.append(label.cloneNode(true));
    if (!button.hasAttribute('aria-label')) button.setAttribute('aria-label', text);
    button.replaceChildren(label, ink);

    const letters = [...button.querySelectorAll('.button__char')];
    const letterCount = letters.length / 2;
    let animations = [];

    function stopRoll() {
      for (const animation of animations) animation.cancel();
      animations = [];
    }

    function playRoll() {
      if (motion.matches) return;
      stopRoll();
      const rollDelay = Number(getComputedStyle(button).getPropertyValue('--button-roll-delay-ms')) || 0;
      animations = letters.flatMap((letter, index) => {
        const delay = rollDelay + (index % letterCount) * 20;
        return [
          letter.animate(leave, { ...letterTiming, delay, endDelay: enterOffset - letterTiming.duration }),
          letter.animate(enter, { ...letterTiming, duration: 250, delay: delay + enterOffset })
        ];
      });
    }

    button.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'touch') playRoll();
    });
    button.addEventListener('focus', () => {
      if (button.matches(':focus-visible')) playRoll();
    });
    motion.addEventListener('change', stopRoll);
  }

  const heroContent = document.querySelector('.hero__content');
  if (!heroContent || new URLSearchParams(location.search).has('static')) return;

  const finePointer = matchMedia('(pointer: fine)');
  const layers = [...heroContent.querySelectorAll('[data-depth]')].map(element => ({
    element,
    distance: 18 * Number(element.dataset.depth)
  }));
  const target = { x: 0, y: 0 };
  const position = { x: 0, y: 0 };
  let parallaxFrame = 0;

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
    if (event.pointerType !== 'mouse' || motion.matches || !finePointer.matches) return;
    target.x = event.clientX / window.innerWidth * 2 - 1;
    target.y = event.clientY / window.innerHeight * 2 - 1;
    scheduleParallax();
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', resetParallax);
  window.addEventListener('blur', resetParallax);
  motion.addEventListener('change', stopParallax);
  finePointer.addEventListener('change', stopParallax);
})();
