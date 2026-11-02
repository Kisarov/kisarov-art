(() => {
  'use strict';
  const page = document.querySelector('.page');
  if (!page || document.getElementById('screen-paint-overlay')) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const ns = 'http://www.w3.org/2000/svg';

  class ScreenPaintDistortion {
    constructor() {
      this.originalFilter = page.style.filter;
      this.svg = document.createElementNS(ns, 'svg');
      this.svg.setAttribute('aria-hidden', 'true');
      this.svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
      this.svg.innerHTML = '<defs><filter id="screen-paint-displacement" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB"><feFlood flood-color="rgb(128,128,128)" result="neutral"/><feImage result="movement" preserveAspectRatio="none"/><feComposite in="movement" in2="neutral" operator="over" result="map"/><feDisplacementMap in="SourceGraphic" in2="map" scale="28" xChannelSelector="R" yChannelSelector="G"/></filter></defs>';
      document.body.append(this.svg);
      this.image = this.svg.querySelector('feImage');
      this.active = false;
    }
    update(canvas) {
      const rect = page.getBoundingClientRect();
      this.image.setAttribute('x', String(-rect.left));
      this.image.setAttribute('y', String(-rect.top));
      this.image.setAttribute('width', String(innerWidth));
      this.image.setAttribute('height', String(innerHeight));
      this.image.setAttribute('href', canvas.toDataURL());
      if (!this.active) {
        page.style.filter = `${this.originalFilter === 'none' ? '' : this.originalFilter} url(#screen-paint-displacement)`.trim();
        this.active = true;
      }
    }
    clear() {
      page.style.filter = this.originalFilter;
      this.active = false;
    }
  }

  class ScreenPaint {
    constructor() {
      this.canvas = document.createElement('canvas');
      this.canvas.id = 'screen-paint-overlay';
      this.canvas.setAttribute('aria-hidden', 'true');
      this.canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:50;pointer-events:none;mix-blend-mode:multiply';
      this.context = this.canvas.getContext('2d');
      this.map = document.createElement('canvas');
      this.mapContext = this.map.getContext('2d');
      if (!this.context || !this.mapContext) return;
      document.body.append(this.canvas);
      this.distortion = new ScreenPaintDistortion();
      this.frame = 0;
      this.previousTime = 0;
      this.pointer = null;
      this.resize();
      window.addEventListener('pointermove', event => this.move(event), { passive: true });
      window.addEventListener('resize', () => this.resize(), { passive: true });
      window.addEventListener('scroll', () => this.clear(), { passive: true });
      document.addEventListener('pointerleave', () => { this.pointer = null; });
      window.addEventListener('blur', () => this.clear());
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
      motion.addEventListener('change', () => this.clear());
      finePointer.addEventListener('change', () => this.clear());
    }
    resize() {
      this.clear();
      this.width = Math.min(192, Math.max(96, Math.round(innerWidth / 7)));
      this.height = Math.max(48, Math.round(this.width * innerHeight / innerWidth));
      this.canvas.width = this.map.width = this.width;
      this.canvas.height = this.map.height = this.height;
      this.color = this.context.createImageData(this.width, this.height);
      this.displacement = this.mapContext.createImageData(this.width, this.height);
      this.field = new Float32Array(this.width * this.height * 3);
      this.next = new Float32Array(this.field.length);
    }
    clear() {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.previousTime = 0;
      this.pointer = null;
      this.field?.fill(0);
      this.next?.fill(0);
      this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.distortion.clear();
    }
    move(event) {
      if (event.pointerType !== 'mouse' || motion.matches || !finePointer.matches || document.hidden) return;
      this.lastMoveTime = performance.now();
      const x = event.clientX / innerWidth * this.width;
      const y = event.clientY / innerHeight * this.height;
      if (this.pointer) {
        const dx = x - this.pointer.x;
        const dy = y - this.pointer.y;
        const distance = Math.hypot(dx, dy);
        const steps = Math.max(1, Math.ceil(distance / 2));
        const radius = Math.min(8, 3 + distance * 0.13);
        for (let step = 1; step <= steps; step++) {
          this.splat(this.pointer.x + dx * step / steps, this.pointer.y + dy * step / steps,
            Math.max(-3, Math.min(3, dx * 0.18)), Math.max(-3, Math.min(3, dy * 0.18)), radius);
        }
        if (distance > 0.01 && !this.frame) this.frame = requestAnimationFrame(time => this.update(time));
      }
      this.pointer = { x, y };
    }
    splat(x, y, dx, dy, radius) {
      for (let py = Math.max(1, Math.floor(y - radius * 2)); py < Math.min(this.height - 1, y + radius * 2); py++) {
        for (let px = Math.max(1, Math.floor(x - radius * 2)); px < Math.min(this.width - 1, x + radius * 2); px++) {
          const weight = Math.exp(-((px - x) ** 2 + (py - y) ** 2) / (radius * radius * 0.5));
          const index = (py * this.width + px) * 3;
          this.field[index] += dx * weight * 0.45;
          this.field[index + 1] += dy * weight * 0.45;
          this.field[index + 2] = Math.min(1, this.field[index + 2] + weight * 0.24);
        }
      }
    }
    update(time) {
      if (time - this.lastMoveTime > 2400) { this.clear(); return; }
      const dt = Math.min(2, Math.max(0.25, this.previousTime ? (time - this.previousTime) / 16.67 : 1));
      this.previousTime = time;
      const velocityDecay = Math.pow(0.96, dt);
      const colorDecay = Math.pow(0.955, dt);
      let energy = 0;
      this.next.fill(0);
      for (let y = 1; y < this.height - 1; y++) {
        for (let x = 1; x < this.width - 1; x++) {
          const index = (y * this.width + x) * 3;
          const bx = Math.max(0, Math.min(this.width - 1.001, x - this.field[index] * dt));
          const by = Math.max(0, Math.min(this.height - 1.001, y - this.field[index + 1] * dt));
          const ix = Math.floor(bx), iy = Math.floor(by);
          const fx = bx - ix, fy = by - iy;
          const source = (iy * this.width + ix) * 3;
          for (let channel = 0; channel < 3; channel++) {
            const value = this.field[source + channel] * (1 - fx) * (1 - fy)
              + this.field[source + 3 + channel] * fx * (1 - fy)
              + this.field[source + this.width * 3 + channel] * (1 - fx) * fy
              + this.field[source + this.width * 3 + 3 + channel] * fx * fy;
            const neighbors = (this.field[index - 3 + channel] + this.field[index + 3 + channel]
              + this.field[index - this.width * 3 + channel] + this.field[index + this.width * 3 + channel]) * 0.25;
            this.next[index + channel] = (value * 0.92 + neighbors * 0.08) * (channel === 2 ? colorDecay : velocityDecay);
          }
          this.next[index] += Math.cos(y * 0.32 + time * 0.0007) * this.next[index + 2] * 0.045 * dt;
          this.next[index + 1] += Math.sin(x * 0.28 - time * 0.0006) * this.next[index + 2] * 0.045 * dt;
          energy = Math.max(energy, this.next[index + 2]);
        }
      }
      [this.field, this.next] = [this.next, this.field];
      if (energy < 0.008) { this.clear(); return; }
      for (let pixel = 0; pixel < this.width * this.height; pixel++) {
        const source = pixel * 3, target = pixel * 4;
        const density = this.field[source + 2];
        const phase = this.field[source] * 1.8 + this.field[source + 1] * 1.2 + density * 3;
        this.color.data[target] = 95 + 85 * Math.sin(phase);
        this.color.data[target + 1] = 70 + 50 * Math.sin(phase + 2);
        this.color.data[target + 2] = 235;
        this.color.data[target + 3] = Math.min(145, density * 165);
        this.displacement.data[target] = Math.max(0, Math.min(255, 128 + this.field[source] * density * 65));
        this.displacement.data[target + 1] = Math.max(0, Math.min(255, 128 + this.field[source + 1] * density * 65));
        this.displacement.data[target + 2] = 128;
        this.displacement.data[target + 3] = 255;
      }
      this.context.putImageData(this.color, 0, 0);
      this.mapContext.putImageData(this.displacement, 0, 0);
      this.distortion.update(this.map);
      this.frame = requestAnimationFrame(nextTime => this.update(nextTime));
    }
  }
  new ScreenPaint();
})();
