(() => {
  'use strict';

  const root = document.documentElement;
  try {
    root.dataset.theme = localStorage.getItem('portfolio-theme') === 'dark' ? 'dark' : 'light';
  } catch {
    root.dataset.theme = 'light';
  }

  if (new URLSearchParams(location.search).has('static')) return;

  const visitKey = 'portfolio-loader-complete';
  try {
    if (sessionStorage.getItem(visitKey)) return;
  } catch {
    const siteUrl = new URL('../', document.currentScript.src).href;
    const navigation = performance.getEntriesByType('navigation')[0];
    if (navigation?.type === 'reload' || navigation?.type === 'back_forward' || document.referrer.startsWith(siteUrl)) return;
  }

  root.dataset.pageLoading = '';
  const scriptSelector = 'script[src][defer]';
  let completed = 0;

  function finish(loader) {
    try { sessionStorage.setItem(visitKey, '1'); } catch {}

    const spiral = loader?.querySelector('.page-loader__spiral path');
    if (spiral?.getAnimations && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      loader.classList.add('page-loader--revealing');
      Promise.allSettled(spiral.getAnimations().map(animation => animation.finished))
        .then(() => loader.remove());
    } else {
      loader?.remove();
    }

    delete root.dataset.pageLoading;
    document.dispatchEvent(new Event('page-loader:complete'));
  }

  function complete() {
    document.removeEventListener('load', updateProgress, true);
    document.removeEventListener('error', updateProgress, true);
    document.removeEventListener('DOMContentLoaded', complete);

    const progress = document.querySelector('.page-loader__progress');
    showProgress(progress, 100);
    setTimeout(() => finish(progress?.parentElement), 150);
  }

  function showProgress(progress, percent) {
    if (!progress) return;
    progress.textContent = `${percent}%`;
    progress.setAttribute('aria-valuenow', percent);
  }

  function updateProgress(event) {
    if (!event.target.matches?.(scriptSelector)) return;

    const total = document.querySelectorAll(scriptSelector).length;
    completed += 1;
    if (completed === total) {
      complete();
      return;
    }

    showProgress(document.querySelector('.page-loader__progress'), Math.floor(completed / total * 100));
  }

  document.addEventListener('load', updateProgress, true);
  document.addEventListener('error', updateProgress, true);
  document.addEventListener('DOMContentLoaded', complete, { once: true });
})();
