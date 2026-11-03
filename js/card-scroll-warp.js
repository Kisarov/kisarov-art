(() => {
  'use strict';

  const projects = document.querySelector('.projects');
  if (!projects) return;

  const covers = [...projects.querySelectorAll('.card .card__image')]
    .map(box => ({ box, image: box.querySelector('img'), opacity: box.style.opacity }))
    .filter(cover => cover.image);
  if (!covers.length) return;

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const canvas = document.createElement('canvas');
  const output = canvas.getContext('2d');
  const buffer = document.createElement('canvas').getContext('2d');
  if (!output || !buffer?.roundRect) return;

  canvas.className = 'card-scroll-warp';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:1';
  canvas.hidden = true;
  projects.append(canvas);

  let frame = 0;
  let previousTime = 0;
  let previousScroll = window.scrollY;
  let strength = 0;

  function reset() {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
    previousScroll = window.scrollY;
    strength = 0;
    canvas.hidden = true;
    for (const { box, opacity } of covers) box.style.opacity = opacity;
  }

  function drawCover({ box, image }, viewHeight, scale, ripple) {
    const rect = box.getBoundingClientRect();
    if (!image.complete || !image.naturalWidth || !rect.width || !rect.height
        || rect.bottom <= 0 || rect.top >= viewHeight) return false;

    const width = Math.max(1, Math.round(rect.width * scale));
    const height = Math.max(1, Math.round(rect.height * scale));
    if (buffer.canvas.width !== width) buffer.canvas.width = width;
    if (buffer.canvas.height !== height) buffer.canvas.height = height;

    const style = getComputedStyle(box);
    const border = parseFloat(style.borderTopWidth);
    const radius = parseFloat(style.borderTopLeftRadius);
    const imageRect = image.getBoundingClientRect();

    buffer.setTransform(width / rect.width, 0, 0, height / rect.height, 0, 0);
    buffer.clearRect(0, 0, rect.width, rect.height);
    buffer.save();
    buffer.beginPath();
    buffer.roundRect(
      border, border, rect.width - 2 * border, rect.height - 2 * border,
      Math.max(0, radius - border)
    );
    buffer.clip();
    buffer.drawImage(
      image, imageRect.left - rect.left, imageRect.top - rect.top,
      imageRect.width, imageRect.height
    );
    buffer.restore();

    if (border) {
      buffer.beginPath();
      buffer.roundRect(
        border / 2, border / 2, rect.width - border, rect.height - border,
        Math.max(0, radius - border / 2)
      );
      buffer.lineWidth = border;
      buffer.strokeStyle = style.borderTopColor;
      buffer.stroke();
    }

    const center = canvas.width / 2;
    const top = Math.round(rect.top * scale);
    const end = Math.min(height, canvas.height - top);
    const step = Math.max(1, Math.round(2 * scale));

    for (let y = Math.max(0, -top); y < end; y += step) {
      const rows = Math.min(step, end - y);
      const screenY = (top + y + rows / 2) / canvas.height;
      const compression = 1 - ripple * (1 - Math.sin(Math.PI * screenY));
      const x = center + (rect.left * scale - center) / compression;
      output.drawImage(buffer.canvas, 0, y, width, rows,
        x, top + y, width / compression, rows);
    }

    return true;
  }

  function render(time) {
    const viewHeight = Math.max(1, window.innerHeight);
    const elapsed = previousTime ? time - previousTime : 1000 / 60;
    const distance = Math.abs(window.scrollY - previousScroll) / viewHeight;

    previousTime = time;
    previousScroll = window.scrollY;
    strength = Math.min(1, (strength + distance) * Math.exp(-elapsed / 100));
    if (strength < 0.002) {
      reset();
      return;
    }

    const scale = Math.min(1.5, window.devicePixelRatio || 1);
    const width = Math.round(document.documentElement.clientWidth * scale);
    const height = Math.round(viewHeight * scale);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    canvas.hidden = false;
    output.clearRect(0, 0, width, height);
    const ripple = Math.min(0.15, strength * 0.5);
    for (const cover of covers) {
      cover.box.style.opacity = drawCover(cover, viewHeight, scale, ripple)
        ? '0'
        : cover.opacity;
    }

    frame = requestAnimationFrame(render);
  }

  window.addEventListener('scroll', () => {
    if (!frame && !motion.matches) frame = requestAnimationFrame(render);
  }, { passive: true });

  window.addEventListener('resize', reset, { passive: true });
  document.addEventListener('visibilitychange', reset);
  motion.addEventListener('change', reset);
})();
