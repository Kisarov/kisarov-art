(() => {
  'use strict';

  const hero = document.querySelector('.hero');
  const heading = hero?.querySelector('.hero__name');
  const loader = document.querySelector('.page-loader');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  if (!heading || !hero.animate || motion.matches || new URLSearchParams(location.search).has('static')) {
    loader?.remove();
    return;
  }

  const visibility = hero.style.visibility;
  const entrance = [];
  const letters = [...heading.querySelectorAll('.weight-hover-letter')].filter(letter => letter.textContent.trim());
  let headingAnimations = [];
  let heroVisible = false;
  let headingVisible = false;
  let headingRevealed = false;
  let started = false;
  let observer;

  function reveal(element, delay) {
    if (!element) return;
    entrance.push(element.animate([
      { opacity: 0, transform: 'translateY(1rem)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], {
      duration: 1200,
      delay,
      easing: 'cubic-bezier(0.77, 0, 0.175, 1)',
      fill: 'backwards'
    }));
  }

  function clearHeading() {
    for (const animation of headingAnimations) animation.cancel();
    headingAnimations = [];
    delete heading.dataset.introReveal;
  }

  function revealHeading() {
    headingRevealed = true;
    heading.dataset.introReveal = 'playing';
    const animations = letters.map((letter, index) => letter.animate([
      { transform: 'translate3d(0, 1em, 0) rotate(10deg)' },
      { transform: 'translate3d(0, 0em, 0) rotate(0deg)' }
    ], {
      duration: 1000 / 1.5,
      delay: index * 1000 / 30,
      easing: 'cubic-bezier(0.35, 0, 0, 1)',
      fill: 'backwards'
    }));
    headingAnimations = animations;
    Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
      if (headingAnimations === animations) clearHeading();
    });
  }

  function updateHeading(entries) {
    for (const entry of entries) {
      if (entry.target === hero) heroVisible = entry.isIntersecting;
      else headingVisible = entry.isIntersecting;
    }
    if (!heroVisible) {
      clearHeading();
      headingRevealed = false;
      heading.dataset.introReveal = 'waiting';
    } else if (headingVisible && !headingRevealed) {
      revealHeading();
    }
  }

  function finishEntrance() {
    hero.style.visibility = visibility;
    for (const animation of entrance) animation.cancel();
    entrance.length = 0;
    hero.removeEventListener('focusin', finishEntrance);
  }

  function stop() {
    started = true;
    loader?.remove();
    observer?.disconnect();
    clearHeading();
    finishEntrance();
    motion.removeEventListener('change', stop);
  }

  hero.style.visibility = 'hidden';
  motion.addEventListener('change', stop);
  let fontTimeout;
  const fontLimit = new Promise(resolve => { fontTimeout = setTimeout(resolve, 500); });
  Promise.race([document.fonts.ready, fontLimit]).then(async () => {
    clearTimeout(fontTimeout);
    if (loader && !started) await new Promise(resolve => setTimeout(resolve, 400));
    if (started) return;
    started = true;
    if (loader) {
      loader.querySelector('path').addEventListener('animationend', () => loader.remove(), { once: true });
      loader.classList.add('page-loader--revealing');
    }
    if (letters.length && 'IntersectionObserver' in window) {
      heading.dataset.introReveal = 'waiting';
      observer = new IntersectionObserver(updateHeading);
      observer.observe(hero);
      observer.observe(heading);
    }
    reveal(hero.querySelector('.hero__bio'), 0);
    reveal(hero.querySelector('.hero__skills'), 120);
    reveal(hero.querySelector('.hero__links'), 360);
    hero.style.visibility = visibility;
    hero.addEventListener('focusin', finishEntrance, { once: true });
    Promise.allSettled(entrance.map(animation => animation.finished)).then(finishEntrance);
  }).catch(stop);
})();
