(() => {
  'use strict';

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const letterTiming = { duration: 500, easing: 'cubic-bezier(0.333333, 1, 0.666667, 1)' };
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
          letter.animate(leave, { ...letterTiming, delay }),
          letter.animate(enter, { ...letterTiming, delay: delay + 200 })
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
})();
