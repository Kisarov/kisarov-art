(() => {
  'use strict';

  window.setupCardImageBlur = (covers, canHover) => {
    let activeBox = null;
    let x = 0;
    let y = 0;

    function hide() {
      activeBox?.classList.remove('is-card-blurred');
      activeBox = null;
    }

    function positionBlur() {
      if (!activeBox) return;
      const rect = activeBox.getBoundingClientRect();
      if (!canHover() || x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
        hide();
        return;
      }
      activeBox.style.setProperty('--card-blur-x', `${x - rect.left - activeBox.clientLeft}px`);
      activeBox.style.setProperty('--card-blur-y', `${y - rect.top - activeBox.clientTop}px`);
      activeBox.classList.add('is-card-blurred');
    }

    for (const { box } of covers) {
      box.classList.add('has-card-blur');
      const track = event => {
        if (event.pointerType !== 'mouse' || !canHover()) return;
        if (activeBox !== box) hide();
        activeBox = box;
        x = event.clientX;
        y = event.clientY;
        positionBlur();
      };
      const leave = event => {
        if (event.pointerType === 'mouse' && activeBox === box) hide();
      };
      box.addEventListener('pointerenter', track, { passive: true });
      box.addEventListener('pointermove', track, { passive: true });
      box.addEventListener('pointerleave', leave, { passive: true });
      box.addEventListener('pointercancel', leave, { passive: true });
    }
    window.addEventListener('scroll', positionBlur, { passive: true });
    window.addEventListener('blur', hide);
  };

  window.createCardImageHover = (covers, schedule, canHover) => {
    let hover = null;

    function progress(time) {
      const duration = hover.target ? 350 : 250;
      return Math.min(1, Math.max(0, (time - hover.start) / duration));
    }

    function amountAt(progress) {
      return hover.target + (hover.from - hover.target) * (1 - progress) ** 3;
    }

    function fadeTo(target) {
      if (hover.target === target) return;
      const time = performance.now();
      hover.from = amountAt(progress(time));
      hover.target = target;
      hover.start = time;
    }

    for (const cover of covers) {
      const track = event => {
        if (event.pointerType !== 'mouse' || !canHover()) return;
        if (hover?.cover !== cover) {
          hover = { cover, from: 0, target: 1, start: performance.now() };
        } else {
          fadeTo(1);
        }
        hover.x = event.clientX;
        hover.y = event.clientY;
        schedule();
      };
      const leave = event => {
        if (event.pointerType !== 'mouse' || hover?.cover !== cover) return;
        fadeTo(0);
        schedule();
      };
      cover.box.addEventListener('pointerenter', track, { passive: true });
      cover.box.addEventListener('pointermove', track, { passive: true });
      cover.box.addEventListener('pointerleave', leave, { passive: true });
      cover.box.addEventListener('pointercancel', leave, { passive: true });
    }

    return {
      reset() {
        hover = null;
      },
      update(time) {
        if (!hover) return null;
        const blend = progress(time);
        hover.amount = amountAt(blend);
        hover.animating = blend < 1;
        if (!hover.animating && !hover.target) hover = null;
        return hover;
      }
    };
  };
})();
