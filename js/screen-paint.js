(() => {
  'use strict';
  if (!document.querySelector('.page') || document.getElementById('screen-paint-overlay')) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');

  class ScreenPaint {
    constructor() {
      this.canvas = document.createElement('canvas');
      this.canvas.id = 'screen-paint-overlay';
      this.canvas.setAttribute('aria-hidden', 'true');
      this.canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none';
      this.context = this.canvas.getContext('2d');
      if (!this.context) return;
      document.body.style.isolation = 'isolate';
      document.body.append(this.canvas);
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
      this.width = Math.min(320, Math.max(128, Math.round(innerWidth / 4)));
      this.height = Math.max(48, Math.round(this.width * innerHeight / innerWidth));
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      this.color = this.context.createImageData(this.width, this.height);
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
        const radius = Math.min(90, 42 + distance * 2) * this.width / innerWidth;
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
          this.field[index] = Math.max(-4, Math.min(4, this.field[index] + dx * weight * 0.45));
          this.field[index + 1] = Math.max(-4, Math.min(4, this.field[index + 1] + dy * weight * 0.45));
          this.field[index + 2] = Math.min(1, this.field[index + 2] + weight * 0.24);
        }
      }
    }
    update(time) {
      if (time - this.lastMoveTime > 1000) { this.clear(); return; }
      const dt = Math.min(2, Math.max(0.25, this.previousTime ? (time - this.previousTime) / 16.67 : 1));
      this.previousTime = time;
      const velocityDecay = Math.pow(0.96, dt);
      const colorDecay = Math.pow(0.981, dt);
      const fade = Math.max(0, 1 - Math.max(0, time - this.lastMoveTime - 250) / 750);
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
      this.color.data.fill(0);
      for (let pixel = 0; pixel < this.width * this.height; pixel++) {
        const source = pixel * 3, target = pixel * 4;
        const density = this.field[source + 2];
        const gx = ((this.field[source + 3 + 2] || 0) - (this.field[source - 3 + 2] || 0)) * 0.5;
        const gy = ((this.field[source + this.width * 3 + 2] || 0) - (this.field[source - this.width * 3 + 2] || 0)) * 0.5;
        const edge = Math.exp(-(((density - 0.16) / 0.065) ** 2));
        const rim = Math.exp(-(((density - 0.105) / 0.018) ** 2));
        const phase = density * 23 + (gx - gy) * 12;
        const light = Math.max(-1, Math.min(1, (gx - gy) * 9));
        const coverage = Math.min(1, Math.max(0, (density - 0.035) / 0.12));
        this.color.data[target] = 233 + Math.sin(phase) * (9 + edge * 17) + light * 14 + rim * 22;
        this.color.data[target + 1] = 237 + Math.sin(phase + 2.1) * (7 + edge * 13) + light * 14 + rim * 22;
        this.color.data[target + 2] = 249 + Math.sin(phase + 4.2) * (4 + edge * 9) + light * 8 + rim * 12;
        this.color.data[target + 3] = coverage * (48 + edge * 78 + rim * 85) * fade * fade;
      }
      this.context.putImageData(this.color, 0, 0);
      this.frame = requestAnimationFrame(nextTime => this.update(nextTime));
    }
  }
  new ScreenPaint();
})();
