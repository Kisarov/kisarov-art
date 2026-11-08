(async () => {
  'use strict';

  const element = document.querySelector('.hero__cube');
  if (!element) return;
  const response = await fetch(new URL('../img/system/hero-cube.buf', document.currentScript.src));
  if (!response.ok) throw new Error(`Hero cube geometry: HTTP ${response.status}`);
  const geometry = await response.arrayBuffer();
  const [COUNT, vertexCount] = new Uint32Array(geometry, 0, 2);
  const positions = new Float32Array(geometry, 8, COUNT * 3);
  const normals = new Float32Array(geometry, 8 + positions.byteLength, positions.length);
  const vertices = new Float32Array(geometry, 8 + positions.byteLength + normals.byteLength, vertexCount * 3);
  const indices = new Uint16Array(geometry, 8 + positions.byteLength + normals.byteLength + vertices.byteLength);
  const staticPreview = new URLSearchParams(location.search).has('static');
  const AURA_COUNT = 220;
  const BEAT_GAP = 0.5;
  const BEAT_LENGTH = 0.56;
  const BEAT_RISE = 0.09;
  const BEAT_STAGGER = 0.18;
  const FIRST_BEAT_DISTANCE = 0.375;
  const SECOND_BEAT_DISTANCE = 0.25;
  const PULSE_LENGTH = BEAT_GAP + BEAT_LENGTH + BEAT_STAGGER;
  const pulseTraits = new Float32Array(COUNT * 2);
  for (let i = 0; i < pulseTraits.length; i += 2) {
    pulseTraits[i] = 0.35 + 0.9 * Math.random();
    pulseTraits[i + 1] = BEAT_STAGGER * Math.random();
  }

  function beat(age) {
    if (age <= 0 || age >= BEAT_LENGTH) return 0;
    const phase = age < BEAT_RISE ? age / BEAT_RISE : (BEAT_LENGTH - age) / (BEAT_LENGTH - BEAT_RISE);
    return phase * phase * (3 - 2 * phase);
  }

  function pointPulse(index, age, fade) {
    if (!fade) return 0;
    age -= pulseTraits[index + 1];
    return (FIRST_BEAT_DISTANCE * beat(age) + SECOND_BEAT_DISTANCE * beat(age - BEAT_GAP)) * pulseTraits[index] * fade;
  }

  class GLRenderer {
    constructor(canvas) {
      this.gl = canvas.getContext('webgl2', { alpha: true, antialias: false, depth: false });
      if (!this.gl) throw new Error('WebGL unavailable');
      const gl = this.gl;
      const transform = `uniform mat3 rotation; uniform vec2 scale; vec4 project(vec3 value) {
        vec3 p = rotation * value; return vec4(p.xy * scale, -p.z / 4.0, 1.0);
      }`;
      this.meshProgram = this.program(`#version 300 es
        layout(location=0) in vec3 position; ${transform}
        void main() { gl_Position = project(position); }`, `#version 300 es
        precision highp float; void main() {}`);
      this.pointProgram = this.program(`#version 300 es
        precision highp float;
        layout(location=0) in vec3 position;
        layout(location=1) in vec3 normal;
        layout(location=2) in vec2 offset;
        layout(location=3) in vec2 pulseTraits;
        ${transform}
        uniform sampler2D surfaceDepth;
        uniform vec2 pixelScale;
        uniform float pointSize;
        uniform vec2 pulse;
        uniform bool aura;
        out float visible;
        float beat(float age) {
          float phase = min(age / ${BEAT_RISE}, (${BEAT_LENGTH} - age) / (${BEAT_LENGTH} - ${BEAT_RISE}));
          return smoothstep(0.0, 1.0, phase);
        }
        void main() {
          if (aura) {
            gl_Position = vec4(position.xy * pixelScale + vec2(-1.0, 1.0), 0.0, 1.0);
            gl_PointSize = position.z;
            visible = 1.0;
            return;
          }
          vec4 rest = project(position);
          float depth = texture(surfaceDepth, rest.xy * 0.5 + 0.5).r;
          visible = step(rest.z * 0.5 + 0.5, depth + 0.006);
          float expansion = 0.0;
          if (pulse.y > 0.0) {
            float age = pulse.x - pulseTraits.y;
            expansion = (${FIRST_BEAT_DISTANCE} * beat(age) + ${SECOND_BEAT_DISTANCE} * beat(age - ${BEAT_GAP})) * pulseTraits.x * pulse.y;
          }
          gl_Position = vec4(rest.xy * (1.0 + expansion) + offset * pixelScale, rest.zw);
          float light = max(dot(rotation * normal, normalize(vec3(-0.45, 0.75, 0.6))), 0.0);
          gl_PointSize = pointSize * (1.3 + 1.3 * (1.0 - light));
        }`, `#version 300 es
        precision highp float;
        in float visible;
        out vec4 color;
        void main() {
          if (visible < 0.5) discard;
          float radius = length(gl_PointCoord - 0.5);
          float alpha = 1.0 - smoothstep(0.5 - fwidth(radius), 0.5, radius);
          if (alpha <= 0.0) discard;
          color = vec4(vec3(196.0/255.0), alpha);
        }`);
      this.meshArray = gl.createVertexArray();
      gl.bindVertexArray(this.meshArray);
      this.attribute(0, vertices, 3);
      const elementBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elementBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
      this.pointArray = gl.createVertexArray();
      gl.bindVertexArray(this.pointArray);
      this.attribute(0, positions, 3);
      this.attribute(1, normals, 3);
      this.offsetBuffer = this.attribute(2, new Float32Array(COUNT * 2), 2, gl.DYNAMIC_DRAW);
      this.attribute(3, pulseTraits, 2);
      this.auraData = new Float32Array(AURA_COUNT * 3);
      this.auraArray = gl.createVertexArray();
      gl.bindVertexArray(this.auraArray);
      this.auraBuffer = this.attribute(0, this.auraData, 3, gl.DYNAMIC_DRAW);
      this.depthTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.framebuffer = gl.createFramebuffer();
      this.uniforms = new Map();
    }

    program(vertexSource, fragmentSource) {
      const gl = this.gl;
      const program = gl.createProgram();
      for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]]) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
        gl.attachShader(program, shader);
        gl.deleteShader(shader);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      return program;
    }

    attribute(location, values, size, usage = this.gl.STATIC_DRAW) {
      const gl = this.gl;
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, values, usage);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
      return buffer;
    }

    uniform(program, name) {
      if (!this.uniforms.has(program)) this.uniforms.set(program, new Map());
      const values = this.uniforms.get(program);
      if (!values.has(name)) values.set(name, this.gl.getUniformLocation(program, name));
      return values.get(name);
    }

    resize(cube) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
      const ratio = Math.min(1, 640 / Math.max(cube.canvas.width, cube.canvas.height));
      this.depthWidth = Math.max(1, Math.round(cube.canvas.width * ratio));
      this.depthHeight = Math.max(1, Math.round(cube.canvas.height * ratio));
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, this.depthWidth, this.depthHeight, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.depthTexture, 0);
      gl.drawBuffers([gl.NONE]);
      gl.readBuffer(gl.NONE);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Depth framebuffer unavailable');
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    draw(cube, modelChanged, offsetsChanged) {
      const gl = this.gl;
      if (modelChanged) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.viewport(0, 0, this.depthWidth, this.depthHeight);
        gl.enable(gl.CULL_FACE);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.meshProgram);
        gl.uniformMatrix3fv(this.uniform(this.meshProgram, 'rotation'), false, cube.matrix);
        gl.uniform2f(this.uniform(this.meshProgram, 'scale'), 2 * cube.scale / cube.width, 2 * cube.scale / cube.height);
        gl.bindVertexArray(this.meshArray);
        gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
        gl.disable(gl.CULL_FACE);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      gl.viewport(0, 0, cube.canvas.width, cube.canvas.height);
      gl.disable(gl.DEPTH_TEST);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this.pointProgram);
      gl.uniform1i(this.uniform(this.pointProgram, 'aura'), 0);
      gl.uniformMatrix3fv(this.uniform(this.pointProgram, 'rotation'), false, cube.matrix);
      gl.uniform2f(this.uniform(this.pointProgram, 'scale'), 2 * cube.scale / cube.width, 2 * cube.scale / cube.height);
      gl.uniform2f(this.uniform(this.pointProgram, 'pixelScale'), 2 / cube.width, -2 / cube.height);
      gl.uniform1f(this.uniform(this.pointProgram, 'pointSize'), cube.dpr);
      gl.uniform2f(this.uniform(this.pointProgram, 'pulse'), cube.pulseFrame, cube.pulseFade);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
      gl.uniform1i(this.uniform(this.pointProgram, 'surfaceDepth'), 0);
      gl.bindVertexArray(this.pointArray);
      if (offsetsChanged) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.offsetBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, cube.offsets);
      }
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.POINTS, 0, COUNT);
      for (let i = 0; i < cube.aura.length; i++) {
        const point = cube.aura[i];
        this.auraData[i * 3] = point.baseX + point.x;
        this.auraData[i * 3 + 1] = point.baseY + point.y;
        this.auraData[i * 3 + 2] = point.size * 2 * cube.dpr;
      }
      gl.uniform1i(this.uniform(this.pointProgram, 'aura'), 1);
      gl.bindVertexArray(this.auraArray);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.auraBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.auraData);
      gl.drawArrays(gl.POINTS, 0, AURA_COUNT);
    }
  }

  class CanvasRenderer {
    constructor(canvas) {
      this.ctx = canvas.getContext('2d');
      if (!this.ctx) throw new Error('Canvas unavailable');
      this.mesh = new Float32Array(vertices.length);
    }

    resize(cube) {
      this.ctx.setTransform(cube.dpr, 0, 0, cube.dpr, 0, 0);
      this.depthWidth = 288;
      this.depthHeight = Math.ceil(cube.height / cube.width * this.depthWidth);
      this.depthScale = this.depthWidth / cube.width;
      this.depth = new Float32Array(this.depthWidth * this.depthHeight);
    }

    triangle(a, b, c) {
      const points = this.mesh;
      const ax = points[a], ay = points[a + 1];
      const bx = points[b], by = points[b + 1];
      const cx = points[c], cy = points[c + 1];
      const area = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (area >= -1e-6) return;
      const left = Math.max(0, Math.ceil(Math.min(ax, bx, cx) - 0.5));
      const right = Math.min(this.depthWidth - 1, Math.floor(Math.max(ax, bx, cx) - 0.5));
      const top = Math.max(0, Math.ceil(Math.min(ay, by, cy) - 0.5));
      const bottom = Math.min(this.depthHeight - 1, Math.floor(Math.max(ay, by, cy) - 0.5));
      for (let y = top; y <= bottom; y++) {
        for (let x = left; x <= right; x++) {
          const u = ((by - cy) * (x + 0.5 - cx) + (cx - bx) * (y + 0.5 - cy)) / area;
          const v = ((cy - ay) * (x + 0.5 - cx) + (ax - cx) * (y + 0.5 - cy)) / area;
          if (u < 0 || v < 0 || u + v > 1) continue;
          const z = u * points[a + 2] + v * points[b + 2] + (1 - u - v) * points[c + 2];
          const offset = y * this.depthWidth + x;
          if (z > this.depth[offset]) this.depth[offset] = z;
        }
      }
    }

    draw(cube, modelChanged) {
      const m = cube.matrix;
      if (modelChanged) {
        this.depth.fill(-Infinity);
        for (let i = 0; i < vertices.length; i += 3) {
          const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2];
          this.mesh[i] = (cube.width / 2 + (m[0] * x + m[3] * y + m[6] * z) * cube.scale) * this.depthScale;
          this.mesh[i + 1] = (cube.height / 2 - (m[1] * x + m[4] * y + m[7] * z) * cube.scale) * this.depthScale;
          this.mesh[i + 2] = m[2] * x + m[5] * y + m[8] * z;
        }
        for (let i = 0; i < indices.length; i += 3) this.triangle(indices[i] * 3, indices[i + 1] * 3, indices[i + 2] * 3);
      }
      if (cube.projectedDirty) cube.project();
      this.ctx.clearRect(0, 0, cube.width, cube.height);
      this.ctx.fillStyle = '#c4c4c4';
      this.ctx.beginPath();
      for (let i = 0; i < COUNT; i++) {
        const restX = cube.projected[i * 2];
        const restY = cube.projected[i * 2 + 1];
        const x = Math.floor(restX * this.depthScale);
        const y = Math.floor(restY * this.depthScale);
        if (x < 0 || y < 0 || x >= this.depthWidth || y >= this.depthHeight) continue;
        if (cube.depth[i] < this.depth[y * this.depthWidth + x] - 0.048) continue;
        const pulse = pointPulse(i * 2, cube.pulseFrame, cube.pulseFade);
        const px = restX + (restX - cube.width / 2) * pulse + cube.offsets[i * 2];
        const py = restY + (restY - cube.height / 2) * pulse + cube.offsets[i * 2 + 1];
        const radius = cube.radii[i];
        this.ctx.moveTo(px + radius, py);
        this.ctx.arc(px, py, radius, 0, Math.PI * 2);
      }
      this.ctx.fill();
    }
  }

  class TunnelCube {
    constructor(element) {
      this.element = element;
      this.canvas = element.querySelector('canvas');
      this.motion = matchMedia('(prefers-reduced-motion: reduce)');
      this.matrix = new Float32Array(9);
      this.offsets = new Float32Array(COUNT * 2);
      this.velocity = new Float32Array(COUNT * 2);
      this.projected = new Float32Array(COUNT * 2);
      this.depth = new Float32Array(COUNT);
      this.radii = new Float32Array(COUNT);
      this.ease = Float32Array.from({ length: COUNT }, () => 0.04 + 0.04 * Math.random());
      this.targetEase = Float32Array.from({ length: COUNT }, () => 0.2 + 0.2 * Math.random());
      this.friction = Float32Array.from({ length: COUNT }, () => 0.8 + 0.15 * Math.random());
      this.mouse = { x: -1000, y: -1000, active: false, repelling: false, timeout: 0 };
      this.pulseAge = null;
      this.pulseFrame = 0;
      this.pulseFade = 0;
      this.auraTime = 0;
      this.aura = Array.from({ length: AURA_COUNT }, () => ({
        phase: Math.random() * Math.PI * 2,
        drift: Math.random() * Math.PI * 2,
        radius: 1.55 + Math.random() * 0.6,
        speed: (0.07 + Math.random() * 0.2) * (Math.random() < 0.5 ? -1 : 1),
        size: 1.3 + Math.random() * 0.5,
        baseX: 0, baseY: 0,
        x: 0, y: 0, vx: 0, vy: 0,
        ease: 0.035 + Math.random() * 0.035,
        friction: 0.8 + Math.random() * 0.15
      }));
      this.angleX = 0.37;
      this.angleY = -0.55;
      this.frame = 0;
      this.previousTime = 0;
      this.accumulator = 0;
      this.visible = true;
      this.hasOffsets = false;
      this.assembling = false;
      this.modelDirty = true;
      this.projectedDirty = true;
      this.tick = this.tick.bind(this);
      try {
        this.renderer = new GLRenderer(this.canvas);
      } catch (error) {
        const replacement = this.canvas.cloneNode();
        this.canvas.replaceWith(replacement);
        this.canvas = replacement;
        this.renderer = new CanvasRenderer(this.canvas);
      }
      element.addEventListener('pointermove', event => this.move(event), { passive: true });
      element.addEventListener('pointerleave', () => this.release());
      element.addEventListener('pointercancel', () => this.release());
      window.addEventListener('blur', () => this.release());
      this.motion.addEventListener('change', () => {
        this.release();
        if (this.motion.matches) {
          this.offsets.fill(0);
          this.velocity.fill(0);
          for (const point of this.aura) point.x = point.y = point.vx = point.vy = 0;
          this.pulseAge = null;
          this.pulseFade = 0;
          this.hasOffsets = false;
          this.assembling = false;
          this.draw(true);
        }
        this.sync();
      });
      document.addEventListener('visibilitychange', () => document.hidden ? this.release() : this.sync());
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(element);
      this.intersectionObserver = new IntersectionObserver(entries => {
        this.visible = entries[0].isIntersecting;
        this.sync();
      });
      this.intersectionObserver.observe(element);
      window.addEventListener('pagehide', event => {
        if (event.persisted) return;
        clearTimeout(this.mouse.timeout);
        this.stop();
        this.resizeObserver.disconnect();
        this.intersectionObserver.disconnect();
      });
      window.addEventListener('pageshow', () => this.sync());
      this.resize();
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      if (rect.width === this.width && rect.height === this.height && dpr === this.dpr) return;
      const previousScale = this.scale;
      this.width = rect.width;
      this.height = rect.height;
      this.dpr = dpr;
      this.scale = Math.min(this.width, this.height) * 0.21;
      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);
      this.renderer.resize(this);
      this.modelDirty = this.projectedDirty = true;
      this.updateMatrix();
      if (!previousScale) {
        this.assembling = !staticPreview && !this.motion.matches;
        if (this.assembling) {
          this.project();
          for (let i = 0; i < COUNT; i++) {
            this.offsets[i * 2] = Math.random() * this.width - this.projected[i * 2];
            this.offsets[i * 2 + 1] = Math.random() * this.height - this.projected[i * 2 + 1];
          }
          this.hasOffsets = true;
        }
      } else {
        for (let i = 0; i < this.offsets.length; i++) {
          this.offsets[i] *= this.scale / previousScale;
          this.velocity[i] *= this.scale / previousScale;
        }
        for (const point of this.aura) {
          point.x *= this.scale / previousScale;
          point.y *= this.scale / previousScale;
          point.vx *= this.scale / previousScale;
          point.vy *= this.scale / previousScale;
        }
      }
      this.updateAura();
      this.draw(true);
      this.sync();
    }

    updateMatrix() {
      const sx = Math.sin(this.angleX), cx = Math.cos(this.angleX);
      const sy = Math.sin(this.angleY), cy = Math.cos(this.angleY);
      this.matrix.set([cy, sx * sy, -cx * sy, 0, cx, sx, sy, -sx * cy, cx * cy]);
      this.modelDirty = this.projectedDirty = true;
    }

    project() {
      const m = this.matrix;
      const lightLength = Math.hypot(-0.45, 0.75, 0.6);
      const lx = (m[0] * -0.45 + m[1] * 0.75 + m[2] * 0.6) / lightLength;
      const ly = (m[3] * -0.45 + m[4] * 0.75 + m[5] * 0.6) / lightLength;
      const lz = (m[6] * -0.45 + m[7] * 0.75 + m[8] * 0.6) / lightLength;
      for (let i = 0; i < COUNT; i++) {
        const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
        this.projected[i * 2] = this.width / 2 + (m[0] * x + m[3] * y + m[6] * z) * this.scale;
        this.projected[i * 2 + 1] = this.height / 2 - (m[1] * x + m[4] * y + m[7] * z) * this.scale;
        if (this.renderer.gl) continue;
        this.depth[i] = m[2] * x + m[5] * y + m[8] * z;
        const nx = normals[i * 3], ny = normals[i * 3 + 1], nz = normals[i * 3 + 2];
        const light = Math.max(0, nx * lx + ny * ly + nz * lz);
        this.radii[i] = 0.65 + 0.65 * (1 - light);
      }
      this.projectedDirty = false;
    }

    move(event) {
      if (staticPreview || this.motion.matches || event.pointerType === 'touch') return;
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = event.clientX - rect.left;
      this.mouse.y = event.clientY - rect.top;
      this.mouse.active = true;
      clearTimeout(this.mouse.timeout);
      this.mouse.timeout = setTimeout(() => this.release(), 100);
      this.sync();
    }

    release() {
      clearTimeout(this.mouse.timeout);
      this.mouse.timeout = 0;
      this.mouse.active = false;
      this.mouse.repelling = false;
      this.sync();
    }

    updateAura() {
      for (const point of this.aura) {
        const angle = point.phase + this.auraTime * point.speed;
        const radius = point.radius + 0.13 * Math.sin(this.auraTime * 0.81 + point.drift) + 0.07 * Math.sin(this.auraTime * 1.37 + point.phase);
        point.baseX = this.width / 2 + (Math.cos(angle) * radius + 0.1 * Math.sin(this.auraTime * 0.73 + point.drift)) * this.scale;
        point.baseY = this.height / 2 + (Math.sin(angle) * radius * 0.83 + 0.12 * Math.sin(this.auraTime * 0.93 + point.phase)) * this.scale;
      }
    }

    drawAura() {
      const ctx = this.renderer.ctx;
      ctx.fillStyle = '#c4c4c4';
      ctx.beginPath();
      for (const point of this.aura) {
        const radius = point.size;
        ctx.moveTo(point.baseX + point.x + radius, point.baseY + point.y);
        ctx.arc(point.baseX + point.x, point.baseY + point.y, radius, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    physics() {
      if (this.mouse.active && this.projectedDirty) this.project();
      this.hasOffsets = false;
      let repelling = false;
      const radius = Math.sqrt(3000 / this.dpr) * 3;
      for (let i = 0; i < COUNT; i++) {
        const index = i * 2;
        if (this.mouse.active) {
          const x = this.projected[index], y = this.projected[index + 1];
          const pulse = pointPulse(index, this.pulseFrame, this.pulseFade);
          const dx = this.mouse.x - x - (x - this.width / 2) * pulse - this.offsets[index];
          const dy = this.mouse.y - y - (y - this.height / 2) * pulse - this.offsets[index + 1];
          const squared = dx * dx + dy * dy;
          if (squared > 0 && squared < radius * radius) {
            repelling = true;
            this.ease[i] = this.targetEase[i];
            const length = Math.sqrt(squared);
            const force = -(radius - length) / radius * 150 / this.dpr * (0.5 + Math.random());
            this.velocity[index] += dx / length * force + (Math.random() - 0.5) / this.dpr;
            this.velocity[index + 1] += dy / length * force + (Math.random() - 0.5) / this.dpr;
          }
        }
        this.velocity[index] *= this.friction[i];
        this.velocity[index + 1] *= this.friction[i];
        this.offsets[index] += this.velocity[index] - this.offsets[index] * this.ease[i];
        this.offsets[index + 1] += this.velocity[index + 1] - this.offsets[index + 1] * this.ease[i];
        if (Math.abs(this.offsets[index]) + Math.abs(this.offsets[index + 1]) + Math.abs(this.velocity[index]) + Math.abs(this.velocity[index + 1]) > 0.03) {
          this.hasOffsets = true;
        } else {
          this.offsets[index] = this.offsets[index + 1] = 0;
          this.velocity[index] = this.velocity[index + 1] = 0;
        }
      }
      if (this.assembling && !this.hasOffsets) {
        this.assembling = false;
      }
      for (const point of this.aura) {
        if (this.mouse.active) {
          const dx = this.mouse.x - point.baseX - point.x;
          const dy = this.mouse.y - point.baseY - point.y;
          const squared = dx * dx + dy * dy;
          if (squared > 0 && squared < radius * radius) {
            repelling = true;
            const length = Math.sqrt(squared);
            const force = -(radius - length) / radius * 150 / this.dpr * (0.5 + Math.random());
            point.vx += dx / length * force + (Math.random() - 0.5) / this.dpr;
            point.vy += dy / length * force + (Math.random() - 0.5) / this.dpr;
          }
        }
        point.vx *= point.friction;
        point.vy *= point.friction;
        point.x += point.vx - point.x * point.ease;
        point.y += point.vy - point.y * point.ease;
        if (Math.abs(point.x) + Math.abs(point.y) + Math.abs(point.vx) + Math.abs(point.vy) > 0.03) this.hasOffsets = true;
        else point.x = point.y = point.vx = point.vy = 0;
      }
      return repelling;
    }

    updatePulse(delta) {
      if (this.mouse.repelling) {
        this.pulseAge = null;
      } else if (!this.assembling) {
        if (this.pulseAge === null || this.pulseAge >= PULSE_LENGTH) {
          this.pulseAge = -(2.5 + Math.random());
        } else {
          this.pulseAge += delta;
        }
      }
      if (this.pulseAge !== null && this.pulseAge >= 0) {
        this.pulseFrame = this.pulseAge;
        this.pulseFade = this.pulseAge < PULSE_LENGTH ? 1 : 0;
      } else if (this.pulseFade > 0) {
        this.pulseFade *= Math.exp(-18 * delta);
        if (this.pulseFade < 0.001) this.pulseFade = 0;
      }
    }

    sync() {
      if (staticPreview || this.motion.matches || document.hidden || !this.visible) {
        this.stop();
      } else if (!this.frame) {
        this.previousTime = 0;
        this.accumulator = 0;
        this.frame = requestAnimationFrame(this.tick);
      }
    }

    stop() {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.previousTime = 0;
      this.accumulator = 0;
    }

    tick(time) {
      this.frame = 0;
      const delta = this.previousTime ? (time - this.previousTime) / 1000 : 1 / 60;
      this.previousTime = time;
      this.auraTime += delta;
      this.angleX = (this.angleX + delta * 0.075) % (Math.PI * 2);
      this.angleY = (this.angleY + delta * 0.13) % (Math.PI * 2);
      this.updateMatrix();
      this.updateAura();
      let changed = false;
      let repelling = false;
      this.accumulator += Math.min(delta, 0.05);
      while (this.accumulator >= 1 / 60 - 1e-8) {
        if (this.mouse.active || this.hasOffsets) {
          repelling = this.physics() || repelling;
          changed = true;
        }
        this.accumulator -= 1 / 60;
      }
      if (changed) this.mouse.repelling = repelling;
      this.updatePulse(delta);
      this.draw(changed);
      this.frame = requestAnimationFrame(this.tick);
    }

    draw(offsetsChanged) {
      this.renderer.draw(this, this.modelDirty, offsetsChanged);
      if (this.renderer.ctx) this.drawAura();
      this.modelDirty = false;
    }
  }

  new TunnelCube(element);
})().catch(error => console.warn('Hero cube:', error));
