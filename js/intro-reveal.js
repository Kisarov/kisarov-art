(() => {
  'use strict';

  const hero = document.querySelector('.hero');
  const heading = hero?.querySelector('.hero__name');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  if (!heading || !hero.animate || motion.matches || new URLSearchParams(location.search).has('static')) return;

  const visibility = hero.style.visibility;
  const links = hero.querySelector('.hero__links');
  const contentGroups = document.querySelectorAll('[data-reveal-delay]');
  const titleVariants = [...heading.querySelectorAll('.hero__title-variant')];
  const headings = [heading, ...document.querySelectorAll('.card .card__title')]
    .filter(element => element.querySelector('.weight-hover-letter'));
  const animationsByElement = new Map();
  let titleIndex = 0;
  let titleTimer;
  let headingVisible = false;
  let started = false;
  let observer;

  function revealContent(group) {
    const element = group.firstElementChild;
    if (element.dataset.introReveal !== 'waiting') return;
    const animation = element.animate([
      { opacity: 0, transform: 'translateY(1rem)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], {
      duration: 1200,
      delay: Number(group.dataset.revealDelay),
      easing: 'cubic-bezier(0.77, 0, 0.175, 1)',
      fill: 'backwards'
    });
    element.dataset.introReveal = 'playing';
    animationsByElement.set(element, [animation]);
    animation.onfinish = () => {
      if (animationsByElement.get(element)?.[0] === animation) clearReveal(element);
    };
  }

  function clearReveal(element) {
    for (const animation of animationsByElement.get(element) || []) animation.cancel();
    animationsByElement.delete(element);
    delete element.dataset.introReveal;
  }

  function showTitle(index) {
    if (index === titleIndex) return;
    titleVariants[titleIndex].removeAttribute('data-current');
    titleIndex = index;
    titleVariants[index].setAttribute('data-current', '');
    heading.setAttribute('aria-label', titleVariants[index].textContent.trim());
  }

  function resetReveal(element) {
    if (element.dataset.introReveal === 'waiting') return;
    if (element === heading) {
      clearTimeout(titleTimer);
      showTitle(0);
    }
    clearReveal(element);
    element.dataset.introReveal = 'waiting';
  }

  function revealHeading(element, leaving = false) {
    if (!leaving && element.dataset.introReveal !== 'waiting') return;
    element.dataset.introReveal = 'playing';
    const variant = element === heading ? titleVariants[titleIndex] || element : element;
    const letters = [...variant.querySelectorAll('.weight-hover-letter')].filter(letter => letter.textContent.trim());
    const rest = { transform: 'translate3d(0, 0em, 0) rotate(0deg)' };
    const keyframes = leaving
      ? [rest, { transform: 'translate3d(0, -1.4em, 0) rotate(-10deg)' }]
      : [{ transform: 'translate3d(0, 1.4em, 0) rotate(10deg)' }, rest];
    const startTime = document.timeline?.currentTime;
    const animations = letters.map((letter, index) => letter.animate(keyframes, {
      duration: leaving ? 380 : 1000 / 1.5,
      delay: leaving ? index * 12 : index * 1000 / 30,
      easing: leaving ? 'cubic-bezier(0.4, 0, 1, 1)' : 'cubic-bezier(0.35, 0, 0, 1)',
      fill: 'both'
    }));
    if (startTime != null) {
      for (const animation of animations) animation.startTime = startTime;
    }
    animationsByElement.set(element, animations);
    Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
      if (animationsByElement.get(element) !== animations) return;
      clearReveal(element);
      if (element !== heading || titleVariants.length < 2) return;
      if (leaving) {
        showTitle((titleIndex + 1) % titleVariants.length);
        heading.dataset.introReveal = 'waiting';
        revealHeading(heading);
      } else {
        titleTimer = setTimeout(() => {
          if (headingVisible && !document.hidden) revealHeading(heading, true);
        }, 3500);
      }
    });
  }

  function updateReveals(entries) {
    for (const { target, isIntersecting } of entries) {
      if (target.hasAttribute('data-reveal-delay')) {
        if (isIntersecting) revealContent(target);
        else resetReveal(target.firstElementChild);
      } else {
        if (target === heading) headingVisible = isIntersecting;
        if (isIntersecting && (target !== heading || !document.hidden)) revealHeading(target);
        else resetReveal(target);
      }
    }
  }

  function updateTitleVisibility() {
    if (document.hidden) resetReveal(heading);
    else if (headingVisible) revealHeading(heading);
  }

  function showFocusedLinks() {
    clearReveal(links);
  }

  function stop() {
    started = true;
    observer?.disconnect();
    clearTimeout(titleTimer);
    showTitle(0);
    for (const element of headings) clearReveal(element);
    for (const group of contentGroups) clearReveal(group.firstElementChild);
    hero.style.visibility = visibility;
    links?.removeEventListener('focusin', showFocusedLinks);
    motion.removeEventListener('change', stop);
    document.removeEventListener('visibilitychange', updateTitleVisibility);
  }

  hero.style.visibility = 'hidden';
  motion.addEventListener('change', stop);
  const pageReady = 'pageLoading' in document.documentElement.dataset
    ? new Promise(resolve => document.addEventListener('page-loader:complete', resolve, { once: true }))
    : Promise.resolve();
  let fontTimeout;
  const fontLimit = new Promise(resolve => { fontTimeout = setTimeout(resolve, 500); });
  const fontsReady = Promise.race([document.fonts.ready, fontLimit]).finally(() => clearTimeout(fontTimeout));
  Promise.all([pageReady, fontsReady]).then(() => {
    if (started) return;
    started = true;
    document.querySelector('.site-nav')?.classList.add('site-nav--entering');
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(updateReveals);
      if (headings.includes(heading)) document.addEventListener('visibilitychange', updateTitleVisibility);
      for (const element of headings) {
        resetReveal(element);
        observer.observe(element);
      }
    }
    for (const group of contentGroups) {
      resetReveal(group.firstElementChild);
      if (observer) observer.observe(group);
      else revealContent(group);
    }
    hero.style.visibility = visibility;
    links?.addEventListener('focusin', showFocusedLinks);
  }).catch(stop);
})();
