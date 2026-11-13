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
  const fontStylesheet = document.querySelector('link[data-page-fonts]');
  const geometryPath = document.currentScript.dataset.heroGeometry;
  const loadGeometry = geometryPath && !matchMedia('(width < 768px)').matches;
  const otherTasks = Number(Boolean(fontStylesheet)) + Number(Boolean(loadGeometry));
  let scriptsDone = 0;
  let otherDone = 0;
  let shown = 0;
  let target = 0;
  let startValue = 0;
  let startTime = 0;
  let frame = 0;
  let progress;

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

  function animate(time) {
    frame = 0;
    const elapsed = Math.min(1, Math.max(0, (time - startTime) / 350));
    shown = startValue + (target - startValue) * (1 - (1 - elapsed) ** 3);
    const percent = elapsed === 1 ? target : Math.min(99, Math.floor(shown));
    if (progress && progress.getAttribute('aria-valuenow') !== String(percent)) {
      progress.textContent = `${percent}%`;
      progress.setAttribute('aria-valuenow', percent);
    }
    if (elapsed < 1) {
      frame = requestAnimationFrame(animate);
    } else if (target === 100) {
      setTimeout(() => finish(progress?.parentElement), 150);
    }
  }

  function updateProgress() {
    progress ??= document.querySelector('.page-loader__progress');
    if (!progress && document.readyState === 'loading') return;

    const total = document.querySelectorAll(scriptSelector).length + otherTasks;
    const next = total ? Math.floor((scriptsDone + otherDone) / total * 100) : 100;
    if (next <= target) return;
    target = next;
    startValue = shown;
    startTime = performance.now();
    if (!frame) frame = requestAnimationFrame(animate);
  }

  function onScriptComplete(event) {
    if (!event.target.matches?.(scriptSelector)) return;
    scriptsDone += 1;
    updateProgress();
  }

  function onScriptsReady() {
    document.removeEventListener('load', onScriptComplete, true);
    document.removeEventListener('error', onScriptComplete, true);
    scriptsDone = document.querySelectorAll(scriptSelector).length;
    updateProgress();
  }

  function track(promise) {
    promise.then(() => {
      otherDone += 1;
      updateProgress();
    });
  }

  async function loadFonts() {
    if (fontStylesheet.media !== 'all' && !fontStylesheet.hasAttribute('data-font-error')) {
      await new Promise(resolve => {
        fontStylesheet.addEventListener('load', resolve, { once: true });
        fontStylesheet.addEventListener('error', resolve, { once: true });
      });
    }
    if (!fontStylesheet.sheet) return;

    await Promise.allSettled(fontStylesheet.dataset.pageFonts.split(',').map(font =>
      document.fonts.load(font, 'Aa Яя')
    ));
  }

  if (fontStylesheet) track(loadFonts());
  if (loadGeometry) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    window.portfolioHeroGeometry = fetch(new URL(geometryPath, document.baseURI), { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error(`Hero cube geometry: HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .catch(error => {
        console.warn('Hero cube:', error);
        return null;
      })
      .finally(() => clearTimeout(timeout));
    track(window.portfolioHeroGeometry);
  }

  document.addEventListener('load', onScriptComplete, true);
  document.addEventListener('error', onScriptComplete, true);
  document.addEventListener('DOMContentLoaded', onScriptsReady, { once: true });
})();
