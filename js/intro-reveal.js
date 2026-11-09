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
  const headings = [heading, ...document.querySelectorAll('.card .card__title')]
    .filter(element => element.querySelector('.weight-hover-letter'));
  const headingAnimations = new Map();
  let heroVisible = false;
  let headingVisible = false;
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

  function clearHeading(element) {
    for (const animation of headingAnimations.get(element) || []) animation.cancel();
    headingAnimations.delete(element);
    delete element.dataset.introReveal;
  }

  function resetHeading(element) {
    if (element.dataset.introReveal === 'waiting') return;
    clearHeading(element);
    element.dataset.introReveal = 'waiting';
  }

  function revealHeading(element) {
    if (element.dataset.introReveal !== 'waiting') return;
    element.dataset.introReveal = 'playing';
    const letters = [...element.querySelectorAll('.weight-hover-letter')].filter(letter => letter.textContent.trim());
    const animations = letters.map((letter, index) => letter.animate([
      { transform: 'translate3d(0, 1em, 0) rotate(10deg)' },
      { transform: 'translate3d(0, 0em, 0) rotate(0deg)' }
    ], {
      duration: 1000 / 1.5,
      delay: index * 1000 / 30,
      easing: 'cubic-bezier(0.35, 0, 0, 1)',
      fill: 'backwards'
    }));
    headingAnimations.set(element, animations);
    Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
      if (headingAnimations.get(element) === animations) clearHeading(element);
    });
  }

  function updateHeadings(entries) {
    for (const { target, isIntersecting } of entries) {
      if (target === hero) heroVisible = isIntersecting;
      else if (target === heading) headingVisible = isIntersecting;
      else if (isIntersecting) revealHeading(target);
      else resetHeading(target);
    }
    if (!heroVisible && headings.includes(heading)) resetHeading(heading);
    else if (headingVisible) revealHeading(heading);
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
    for (const element of headings) clearHeading(element);
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
    document.querySelector('.site-nav')?.classList.add('site-nav--entering');
    if (loader) {
      loader.querySelector('path').addEventListener('animationend', () => loader.remove(), { once: true });
      loader.classList.add('page-loader--revealing');
    }
    if (headings.length && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver(updateHeadings);
      if (headings.includes(heading)) observer.observe(hero);
      for (const element of headings) {
        resetHeading(element);
        observer.observe(element);
      }
    }
    reveal(hero.querySelector('.hero__bio'), 0);
    reveal(hero.querySelector('.hero__skills'), 120);
    reveal(hero.querySelector('.hero__links'), 360);
    hero.style.visibility = visibility;
    hero.addEventListener('focusin', finishEntrance, { once: true });
    Promise.allSettled(entrance.map(animation => animation.finished)).then(finishEntrance);
  }).catch(stop);
})();
