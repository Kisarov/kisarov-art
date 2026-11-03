(() => {
  'use strict';

  const vertexShader = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position;
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}
  `;

  const trailShader = `
uniform sampler2D u_prev;
uniform vec2 u_texel;
uniform float u_decay;
uniform float u_diff;
uniform vec2 u_pos;
uniform float u_amp;
uniform float u_rad;
uniform float u_aspect;
varying vec2 vUv;
void main() {
	float c = texture2D(u_prev, vUv).r;
	float n = texture2D(u_prev, vUv + vec2(u_texel.x, 0.0)).r
		+ texture2D(u_prev, vUv - vec2(u_texel.x, 0.0)).r
		+ texture2D(u_prev, vUv + vec2(0.0, u_texel.y)).r
		+ texture2D(u_prev, vUv - vec2(0.0, u_texel.y)).r;
	float h = mix(c, n * 0.25, u_diff) * u_decay;
	vec2 d = vUv - u_pos;
	vec2 q = vec2(d.x, d.y / u_aspect);
	h += u_amp * exp(-dot(q, q) / (u_rad * u_rad));
	gl_FragColor = vec4(min(h, 1.5), 0.0, 0.0, 1.0);
}
  `;

  const postShader = `
uniform sampler2D u_scene;
uniform vec2 u_aspect;
uniform float u_ballA;
uniform float u_ballWarp;
uniform float u_ballShade;
uniform vec2 u_ballEdge;
uniform sampler2D u_trail;
uniform vec2 u_trailTexel;
varying vec2 vUv;
void main() {
  vec4 page = texture2D(u_scene, vUv);
  if (u_ballA > 0.001) {
		vec2 e = u_trailTexel * 1.5;
		vec2 g = vec2(
			texture2D(u_trail, vUv + vec2(e.x, 0.0)).r - texture2D(u_trail, vUv - vec2(e.x, 0.0)).r,
			texture2D(u_trail, vUv + vec2(0.0, e.y)).r - texture2D(u_trail, vUv - vec2(0.0, e.y)).r
		);
		vec2 pw = vec2(vUv.x - 0.5, (vUv.y - 0.5) / u_aspect.x);
		float edge = 1.0 - smoothstep(u_ballEdge.x, u_ballEdge.y, length(pw));
		vec2 off = g * u_ballWarp * u_ballA * edge;
		vec2 buv = clamp(vUv + off, 0.0, 1.0);
		float m = smoothstep(0.0, 0.002, length(off));
		vec4 sampleColor = texture2D(u_scene, buv);
		vec3 warped = sampleColor.rgb / max(sampleColor.a, 0.0001);
		float shade = dot(-g, normalize(vec2(-0.3, 1.0))) * u_ballShade * u_ballA * edge;
		float lum = dot(warped, vec3(0.2126, 0.7152, 0.0722));
		float head = 1.0 - smoothstep(0.7, 0.95, lum);
		warped *= 1.0 + clamp(shade, -0.5, 0.5) * head;
		page = mix(page, vec4(warped * sampleColor.a, sampleColor.a), m);
	}
  gl_FragColor = page;
}
  `;

  const trailWidth = 256;
  const dissipation = 4;
  const diffusion = 40;
  const radius = 0.04;
  const tensionStart = 0.025;
  const tensionRange = 0.08;
  const warp = -0.045;
  const shade = -1.2;

  const packedHeight = `
float heightAt(sampler2D field, vec2 uv) {
  return dot(texture2D(field, uv).rg, vec2(1.5, 1.5 / 255.0));
}
vec4 packHeight(float height) {
  float scaled = height / 1.5;
  float fine = fract(scaled * 255.0);
  return vec4(scaled - fine / 255.0, fine, 0.0, 1.0);
}
  `;

  function packedShader(source) {
    return packedHeight + source
      .replace(/texture2D\((u_prev|u_trail), ((?:[^()\n]|\([^()\n]*\))+)\)\.r/g, 'heightAt($1, $2)')
      .replace('vec4(min(h, 1.5), 0.0, 0.0, 1.0)', 'packHeight(min(h, 1.5))');
  }

  function compile(gl, fragment, names) {
    const program = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, vertexShader], [gl.FRAGMENT_SHADER, 'precision highp float;\n' + fragment]]) {
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
    gl.bindAttribLocation(program, 0, 'position');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(message);
    }
    return { program, uniforms: Object.fromEntries(names.map(name => [name, gl.getUniformLocation(program, name)])) };
  }

  function target(gl, width, height, type) {
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) {
      gl.deleteTexture(texture);
      gl.deleteFramebuffer(framebuffer);
      return null;
    }
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    for (const name of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, name, gl.LINEAR);
    for (const name of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, name, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, type, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!complete) {
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      return null;
    }
    return { texture, framebuffer, width, height };
  }

  window.createCardImageHover = (covers, schedule, canHover) => {
    let gl;
    let cardProgram;
    let paint;
    let composite;
    let ready = false;
    let useHalfFloat;
    let trail = [];
    let scene;
    let fresh = false;
    let side = 0;
    let drawing = false;
    let pointer = null;
    let energy = 0;
    let presence = { from: 0, to: 0, start: 0 };

    function amountAt(time) {
      const progress = Math.max(0, Math.min(1, (time - presence.start) / (presence.to ? 350 : 250)));
      return presence.from + (presence.to - presence.from) * (1 - Math.pow(1 - progress, 3));
    }

    function show(to) {
      if (presence.to === to) return;
      const start = performance.now();
      presence = { from: amountAt(start), to, start };
    }

    for (const { box } of covers) {
      box.addEventListener('pointermove', event => {
        if (event.pointerType !== 'mouse' || !ready || !canHover()) return;
        const { clientX: x, clientY: y } = event;
        if (!pointer) pointer = { x, y, smoothX: x, smoothY: y };
        pointer.x = x;
        pointer.y = y;
        show(1);
        schedule();
      }, { passive: true });
      box.addEventListener('pointerleave', event => {
        if (event.pointerType !== 'mouse' || !pointer) return;
        pointer = null;
        show(0);
        schedule();
      });
    }

    function release(buffer) {
      if (!buffer) return;
      gl.deleteFramebuffer(buffer.framebuffer);
      gl.deleteTexture(buffer.texture);
    }

    function preparePaint(packed) {
      if (paint) gl.deleteProgram(paint.program);
      if (composite) gl.deleteProgram(composite.program);
      paint = compile(gl, packed ? packedShader(trailShader) : trailShader,
        ['u_prev', 'u_texel', 'u_decay', 'u_diff', 'u_pos', 'u_amp', 'u_rad', 'u_aspect']);
      composite = compile(gl, packed ? packedShader(postShader) : postShader,
        ['u_scene', 'u_aspect', 'u_ballA', 'u_ballWarp', 'u_ballShade', 'u_ballEdge', 'u_trail', 'u_trailTexel']);
    }

    function makeBuffers(width, height, rows) {
      if (!scene || scene.width !== width || scene.height !== height) {
        release(scene);
        scene = target(gl, width, height, gl.UNSIGNED_BYTE);
      }
      if (trail[0]?.height !== rows) {
        trail.forEach(release);
        const type = useHalfFloat || gl.UNSIGNED_BYTE;
        trail = [target(gl, trailWidth, rows, type), target(gl, trailWidth, rows, type)];
        if (useHalfFloat && trail.some(buffer => !buffer)) {
          trail.forEach(release);
          useHalfFloat = null;
          preparePaint(true);
          trail = [target(gl, trailWidth, rows, gl.UNSIGNED_BYTE), target(gl, trailWidth, rows, gl.UNSIGNED_BYTE)];
        }
        fresh = false;
      }
      return Boolean(scene && trail.every(Boolean));
    }

    function restore() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.useProgram(cardProgram);
      gl.enable(gl.BLEND);
      gl.activeTexture(gl.TEXTURE0);
    }

    return {
      init(context, program) {
        gl = context;
        cardProgram = program;
        ready = false;
        paint = composite = scene = null;
        trail = [];
        fresh = drawing = false;
        const half = gl.getExtension('OES_texture_half_float');
        useHalfFloat = half && gl.getExtension('OES_texture_half_float_linear') &&
          gl.getExtension('EXT_color_buffer_half_float') && half.HALF_FLOAT_OES;
        try {
          preparePaint(!useHalfFloat);
          ready = true;
        } catch (error) {
          console.warn('Card image hover:', error);
        }
      },
      reset() {
        pointer = null;
        presence = { from: 0, to: 0, start: 0 };
        energy = 0;
        fresh = drawing = false;
      },
      begin(time, dt, width, height, pixelWidth, pixelHeight) {
        if (!ready) return false;
        const amount = amountAt(time);
        energy *= Math.exp(-dissipation * dt);
        let amplitude = 0;
        let settling = false;
        if (pointer) {
          const follow = 1 - Math.exp(-7 * dt);
          pointer.smoothX += (pointer.x - pointer.smoothX) * follow;
          pointer.smoothY += (pointer.y - pointer.smoothY) * follow;
          const distance = Math.hypot(pointer.x - pointer.smoothX, pointer.y - pointer.smoothY);
          settling = distance > 0.25;
          if (amount > 0.001) {
            const tension = Math.tanh(Math.max(0, distance / width - tensionStart) / tensionRange);
            amplitude = tension * tension;
          }
        }
        energy = Math.max(energy, amplitude);
        if (energy <= 0.004) {
          fresh = false;
          return settling;
        }
        const rows = Math.max(1, Math.round(trailWidth * height / width));
        try {
          if (!makeBuffers(pixelWidth, pixelHeight, rows)) throw new Error('Unable to allocate hover buffers');
        } catch (error) {
          ready = false;
          restore();
          console.warn('Card image hover:', error);
          return false;
        }
        gl.disable(gl.BLEND);
        if (!fresh) {
          for (const buffer of trail) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, buffer.framebuffer);
            gl.clear(gl.COLOR_BUFFER_BIT);
          }
          fresh = true;
        }
        gl.useProgram(paint.program);
        const u = paint.uniforms;
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, trail[side].texture);
        gl.uniform1i(u.u_prev, 3);
        gl.uniform2f(u.u_texel, 1 / trailWidth, 1 / rows);
        gl.uniform1f(u.u_decay, Math.exp(-dissipation * dt));
        gl.uniform1f(u.u_diff, 1 - Math.exp(-diffusion * dt));
        gl.uniform2f(u.u_pos, pointer ? pointer.x / width : 0, pointer ? 1 - pointer.y / height : 0);
        gl.uniform1f(u.u_amp, amplitude);
        gl.uniform1f(u.u_rad, radius);
        gl.uniform1f(u.u_aspect, width / height);
        side = 1 - side;
        gl.bindFramebuffer(gl.FRAMEBUFFER, trail[side].framebuffer);
        gl.viewport(0, 0, trailWidth, rows);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        restore();
        if (amount > 0.001) {
          drawing = true;
          gl.bindFramebuffer(gl.FRAMEBUFFER, scene.framebuffer);
          gl.useProgram(composite.program);
          gl.uniform2f(composite.uniforms.u_aspect, width / height, 1);
          gl.uniform1f(composite.uniforms.u_ballA, amount);
          gl.useProgram(cardProgram);
        }
        return true;
      },
      end() {
        if (!drawing) return;
        drawing = false;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.disable(gl.BLEND);
        gl.useProgram(composite.program);
        const u = composite.uniforms;
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, scene.texture);
        gl.uniform1i(u.u_scene, 3);
        gl.activeTexture(gl.TEXTURE4);
        gl.bindTexture(gl.TEXTURE_2D, trail[side].texture);
        gl.uniform1i(u.u_trail, 4);
        gl.uniform2f(u.u_trailTexel, 1 / trailWidth, 1 / trail[side].height);
        gl.uniform1f(u.u_ballWarp, warp);
        gl.uniform1f(u.u_ballShade, shade);
        gl.uniform2f(u.u_ballEdge, 0.22, 0.5);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        restore();
      }
    };
  };
})();
