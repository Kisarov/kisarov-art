(() => {
  'use strict';

  const projects = document.querySelector('.projects');
  if (!projects) return;

  const covers = [...projects.querySelectorAll('.card .card__image')]
    .map(box => ({ box, image: box.querySelector('img'), opacity: box.style.opacity }))
    .filter(cover => cover.image);
  if (!covers.length) return;

  const motion = matchMedia('(prefers-reduced-motion: reduce)');

  let canvas = document.createElement('canvas');
  let webgl;
  try { webgl = createWebGLRenderer(canvas); }
  catch (error) { console.warn('Card scroll warp:', error); }
  if (!webgl) canvas = document.createElement('canvas');
  let output = webgl ? null : canvas.getContext('2d');
  if (!webgl && !output) return;

  canvas.className = 'card-scroll-warp';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:1';
  canvas.hidden = true;
  projects.append(canvas);

  if (webgl) {
    canvas.addEventListener('webglcontextlost', () => {
      reset();
      const fallback = canvas.cloneNode(false);
      output = fallback.getContext('2d');
      canvas.replaceWith(fallback);
      canvas = fallback;
      webgl = null;
    }, { once: true });
  }

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

  function drawCover(cover, viewHeight, scale, ripple) {
    const { box, image } = cover;
    const rect = box.getBoundingClientRect();
    if (!image.complete || !image.naturalWidth || !rect.width || !rect.height
        || rect.bottom <= 0 || rect.top >= viewHeight) return false;

    const width = Math.max(1, Math.round(rect.width * scale));
    const height = Math.max(1, Math.round(rect.height * scale));
    cover.buffer ??= document.createElement('canvas').getContext('2d');
    const buffer = cover.buffer;
    if (!buffer?.roundRect) return false;
    paintCover(cover, rect, width, height);

    const left = rect.left * scale;
    const top = Math.round(rect.top * scale);
    if (webgl) {
      webgl.draw(cover, left, top, ripple);
      return true;
    }

    const center = canvas.width / 2;
    const end = Math.min(height, canvas.height - top);
    const step = Math.max(1, Math.round(2 * scale));

    for (let y = Math.max(0, -top); y < end; y += step) {
      const rows = Math.min(step, end - y);
      const screenY = (top + y + rows / 2) / canvas.height;
      const compression = 1 - ripple * (1 - Math.sin(Math.PI * screenY));
      const x = center + (left - center) / compression;
      output.drawImage(buffer.canvas, 0, y, width, rows,
        x, top + y, width / compression, rows);
    }

    return true;
  }

  function paintCover(cover, rect, width, height) {
    const { box, image, buffer } = cover;
    const style = getComputedStyle(box);
    const border = parseFloat(style.borderTopWidth);
    const radius = parseFloat(style.borderTopLeftRadius);
    const imageRect = image.getBoundingClientRect();
    const imageX = imageRect.left - rect.left;
    const imageY = imageRect.top - rect.top;
    const snapshot = [image.currentSrc, width, height, rect.width, rect.height,
      border, radius, style.borderTopColor, imageX, imageY, imageRect.width, imageRect.height].join('|');
    if (cover.snapshot === snapshot) return;

    if (buffer.canvas.width !== width) buffer.canvas.width = width;
    if (buffer.canvas.height !== height) buffer.canvas.height = height;

    buffer.setTransform(width / rect.width, 0, 0, height / rect.height, 0, 0);
    buffer.clearRect(0, 0, rect.width, rect.height);
    buffer.save();
    buffer.beginPath();
    buffer.roundRect(
      border, border, rect.width - 2 * border, rect.height - 2 * border,
      Math.max(0, radius - border)
    );
    buffer.clip();
    buffer.drawImage(image, imageX, imageY, imageRect.width, imageRect.height);
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
    cover.snapshot = snapshot;
    cover.textureDirty = true;
  }

  function render(time) {
    if (!webgl && !output) { reset(); return; }
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
    if (webgl) webgl.clear();
    else output.clearRect(0, 0, width, height);
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

  function createWebGLRenderer(layer) {
    const gl = layer.getContext('webgl', { alpha: true, antialias: false, depth: false });
    if (!gl) return null;

    const program = gl.createProgram();
    const sources = [
      [gl.VERTEX_SHADER, `
        attribute vec2 a_position;
        void main() {
          gl_Position = vec4(a_position, 0.0, 1.0);
        }
      `],
      [gl.FRAGMENT_SHADER, `
        precision highp float;
        uniform vec2 u_viewport;
        uniform vec4 u_coverRect;
        uniform float u_ripple;
        uniform sampler2D u_cover;

        void main() {
          vec2 point = vec2(gl_FragCoord.x, u_viewport.y - gl_FragCoord.y);
          float screenY = point.y / u_viewport.y;
          float center = u_viewport.x * 0.5;
          point.x -= (point.x - center) * (1.0 - sin(3.14159265 * screenY)) * u_ripple;

          vec2 uv = (point - u_coverRect.xy) / u_coverRect.zw;
          if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) discard;
          gl_FragColor = texture2D(u_cover, uv);
        }
      `]
    ];

    for (const [type, source] of sources) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        gl.deleteProgram(program);
        throw new Error(message);
      }
      gl.attachShader(program, shader);
      gl.deleteShader(shader);
    }
    gl.bindAttribLocation(program, 0, 'a_position');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(message);
    }

    const viewport = gl.getUniformLocation(program, 'u_viewport');
    const coverRect = gl.getUniformLocation(program, 'u_coverRect');
    const rippleAmount = gl.getUniformLocation(program, 'u_ripple');

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    return {
      clear() {
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(viewport, layer.width, layer.height);
      },
      draw(cover, left, top, ripple) {
        const { width, height } = cover.buffer.canvas;
        const center = layer.width / 2;
        const right = left + width;
        const x = Math.max(0, Math.floor(Math.min(left, center + (left - center) / (1 - ripple))));
        const endX = Math.min(layer.width, Math.ceil(Math.max(right, center + (right - center) / (1 - ripple))));
        const y = Math.max(0, top);
        const endY = Math.min(layer.height, top + height);
        if (endX <= x || endY <= y) return;

        if (!cover.texture) {
          cover.texture = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, cover.texture);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        }
        gl.bindTexture(gl.TEXTURE_2D, cover.texture);
        if (cover.textureDirty) {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cover.buffer.canvas);
          cover.textureDirty = false;
        }

        gl.viewport(x, layer.height - endY, endX - x, endY - y);
        gl.uniform4f(coverRect, left, top, width, height);
        gl.uniform1f(rippleAmount, ripple);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    };
  }
})();
