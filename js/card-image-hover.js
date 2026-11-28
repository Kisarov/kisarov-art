(() => {
  'use strict';

  const RIPPLE_SIZE = 256;
  const RIPPLE_DURATION = 320;

  function createPointerRipple() {
    const canvas = document.createElement('canvas');
    canvas.className = 'card-pointer-ripple';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.width = canvas.style.height = `${RIPPLE_SIZE}px`;
    canvas.width = canvas.height = Math.round(RIPPLE_SIZE * Math.min(devicePixelRatio || 1, 1.5));
    canvas.hidden = true;
    const gl = canvas.getContext('webgl', { antialias: false, depth: false, premultipliedAlpha: false });
    if (!gl) return null;

    const program = gl.createProgram();
    const vertex = `
      attribute vec2 position;
      varying vec2 patch;
      void main() {
        patch = vec2(position.x, -position.y);
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;
    const fragment = `
      precision highp float;
      uniform sampler2D cover;
      uniform vec2 center;
      uniform vec2 size;
      uniform float halfSize;
      uniform vec2 direction;
      uniform float strength;
      uniform float age;
      varying vec2 patch;
      void main() {
        vec2 delta = patch * halfSize;
        float radius = length(delta);
        float ring = smoothstep(24.0, 48.0, radius) * (1.0 - smoothstep(74.0, 116.0, radius));
        float amount = ring * strength;
        if (amount < 0.002) discard;
        vec2 radial = delta / max(radius, 1.0);
        float alignment = dot(radial, direction);
        float wave = sin(radius * 0.105 - age * 19.0 + alignment * 1.6);
        vec2 ripple = (12.0 * wave * radial + 8.0 * direction) * amount;
        vec2 uv = (center + delta + ripple) / size;
        gl_FragColor = vec4(texture2D(cover, uv).rgb, amount);
      }
    `;
    for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(program, shader);
      gl.deleteShader(shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);

    const vertices = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.viewport(0, 0, canvas.width, canvas.height);
    const uniforms = Object.fromEntries(['cover', 'center', 'size', 'halfSize', 'direction', 'strength', 'age']
      .map(name => [name, gl.getUniformLocation(program, name)]));
    gl.uniform1i(uniforms.cover, 0);
    gl.uniform1f(uniforms.halfSize, RIPPLE_SIZE / 2);
    let sourceImage;
    let sourceUrl;

    return {
      canvas,
      draw(image, local, movement, age, strength) {
        if (!image.complete || !image.naturalWidth || gl.isContextLost()) return false;
        if (image !== sourceImage || image.currentSrc !== sourceUrl) {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
          sourceImage = image;
          sourceUrl = image.currentSrc;
        }
        gl.uniform2f(uniforms.center, local.x, local.y);
        gl.uniform2f(uniforms.size, local.width, local.height);
        gl.uniform2f(uniforms.direction, movement.x, movement.y);
        gl.uniform1f(uniforms.strength, strength);
        gl.uniform1f(uniforms.age, age / 1000);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        return true;
      }
    };
  }

  window.setupCardImageBlur = (covers, canHover) => {
    let activeBox = null;
    let x = 0;
    let y = 0;
    let local;
    let ripple;
    let movement;
    let frame = 0;
    let lastTime = 0;

    function stopRipple() {
      cancelAnimationFrame(frame);
      frame = 0;
      if (ripple) ripple.canvas.hidden = true;
    }

    function hide() {
      activeBox?.classList.remove('is-card-blurred');
      activeBox = null;
      stopRipple();
    }

    function positionBlur() {
      if (!activeBox) return;
      const rect = activeBox.getBoundingClientRect();
      if (!canHover() || x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
        hide();
        return;
      }
      local = {
        x: x - rect.left - activeBox.clientLeft,
        y: y - rect.top - activeBox.clientTop,
        width: rect.width - 2 * activeBox.clientLeft,
        height: rect.height - 2 * activeBox.clientTop
      };
      activeBox.style.setProperty('--card-blur-x', `${local.x}px`);
      activeBox.style.setProperty('--card-blur-y', `${local.y}px`);
      activeBox.classList.add('is-card-blurred');
    }

    function drawRipple(time) {
      frame = 0;
      const age = Math.max(0, time - movement.time);
      if (!activeBox || !canHover() || age >= RIPPLE_DURATION) {
        stopRipple();
        return;
      }
      try {
        if (ripple === undefined) ripple = createPointerRipple();
        if (!ripple) return;
        const image = activeBox.querySelector('img');
        const strength = movement.strength * (1 - age / RIPPLE_DURATION) ** 3;
        if (!ripple.draw(image, local, movement, age, strength)) {
          stopRipple();
          return;
        }
        if (ripple.canvas.parentElement !== activeBox) activeBox.append(ripple.canvas);
        ripple.canvas.hidden = false;
        frame = requestAnimationFrame(drawRipple);
      } catch (error) {
        stopRipple();
        ripple = null;
        console.warn('Card pointer ripple:', error);
      }
    }

    for (const { box } of covers) {
      box.classList.add('has-card-blur');
      const track = event => {
        if (event.pointerType !== 'mouse' || !canHover()) return;
        const time = performance.now();
        const movingWithinCover = activeBox === box && event.type === 'pointermove';
        const dx = event.clientX - x;
        const dy = event.clientY - y;
        const distance = Math.hypot(dx, dy);
        const speed = distance / Math.max(8, time - lastTime);
        if (activeBox !== box) hide();
        activeBox = box;
        x = event.clientX;
        y = event.clientY;
        lastTime = time;
        positionBlur();
        if (activeBox && movingWithinCover && distance >= 1 && ripple !== null) {
          movement = { x: dx / distance, y: dy / distance, strength: Math.min(1, 2 * speed), time };
          if (!frame) frame = requestAnimationFrame(drawRipple);
        }
      };
      const leave = event => {
        if (event.pointerType === 'mouse' && activeBox === box) hide();
      };
      box.addEventListener('pointerenter', track, { passive: true });
      box.addEventListener('pointermove', track, { passive: true });
      box.addEventListener('pointerleave', leave, { passive: true });
      box.addEventListener('pointercancel', leave, { passive: true });
    }
    window.addEventListener('scroll', () => {
      stopRipple();
      positionBlur();
    }, { passive: true });
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

  // При ручном подключении эффекта изгиба он сам выбирает режим размытия.
  if (document.querySelector('script[src="./js/card-scroll-warp.js"]')) return;
  const covers = [...document.querySelectorAll('.projects .card__image')]
    .filter(box => box.querySelector('img'))
    .map(box => ({ box }));
  if (!covers.length) return;

  const narrowScreen = matchMedia('(max-width: 768px)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  window.setupCardImageBlur(covers, () => !narrowScreen.matches && !reducedMotion.matches && !document.hidden);
})();
