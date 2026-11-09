(() => {
  'use strict';

  for (const button of document.querySelectorAll('.button')) {
    const text = button.textContent.trim();
    if (!text) continue;

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
})();
