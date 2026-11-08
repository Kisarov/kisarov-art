(() => {
  'use strict';

  for (const link of document.querySelectorAll('.hero__link--primary')) {
    const text = link.textContent.trim();
    if (!text) continue;

    const label = document.createElement('span');
    label.className = 'hero__link-label';
    label.setAttribute('aria-hidden', 'true');
    let index = 0;

    for (const part of text.split(/(\s+)/u)) {
      if (!part.trim()) {
        label.append(part);
        continue;
      }

      const word = document.createElement('span');
      word.className = 'hero__link-word';
      for (const character of part) {
        const mask = document.createElement('span');
        mask.className = 'hero__link-char-mask';
        const letter = document.createElement('span');
        letter.className = 'hero__link-char';
        letter.textContent = character;
        letter.style.setProperty('--hero-link-char-index', String(index++));
        mask.append(letter);
        word.append(mask);
      }
      label.append(word);
    }

    const ink = document.createElement('span');
    ink.className = 'hero__link-ink';
    ink.append(label.cloneNode(true));
    if (!link.hasAttribute('aria-label')) link.setAttribute('aria-label', text);
    link.replaceChildren(label, ink);
  }
})();
