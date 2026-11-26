(async () => {
  'use strict';

  const element = document.querySelector('.hero__cube');
  if (!element) return;
  const geometryUrl = new URL('../img/system/hero-cube.buf', document.currentScript.src);
  const narrowScreen = matchMedia('(max-width: 768px)');
  if (narrowScreen.matches) {
    await new Promise(resolve => narrowScreen.addEventListener('change', resolve, { once: true }));
  }
  let geometry;
  if (window.portfolioHeroGeometry) {
    geometry = await window.portfolioHeroGeometry;
    if (!geometry) return;
  } else {
    const response = await fetch(geometryUrl);
    if (!response.ok) throw new Error(`Hero cube geometry: HTTP ${response.status}`);
    geometry = await response.arrayBuffer();
  }
  const [COUNT, vertexCount] = new Uint32Array(geometry, 0, 2);
  const positions = new Float32Array(geometry, 8, COUNT * 3);
  const normals = new Float32Array(geometry, 8 + positions.byteLength, positions.length);
  const vertices = new Float32Array(geometry, 8 + positions.byteLength + normals.byteLength, vertexCount * 3);
  const indices = new Uint16Array(geometry, 8 + positions.byteLength + normals.byteLength + vertices.byteLength);
  let pointColor = readPaletteColor('--color-cube-particles');
  const staticPreview = new URLSearchParams(location.search).has('static');
  const AURA_COUNT = 220;
  const HOLD_TIME = 5;
  const SCATTER_SCALE = 1.5;
  const SCATTER_TIME = 0.65;
  const ASSEMBLY_TIME = 1.8;
  const EDGE_BAND = 0.16;

  let shapeRadius = 0;
  for (let i = 0; i < vertices.length; i += 3) {
    shapeRadius = Math.max(shapeRadius, Math.hypot(vertices[i], vertices[i + 1], vertices[i + 2]));
  }

  function createShape(triangles) {
    const mesh = new Float32Array(triangles.length * 9);
    const faces = new Uint16Array(triangles.length * 3);
    const points = new Float32Array(COUNT * 3);
    const directions = new Float32Array(points.length);
    const radius = Math.max(...triangles.flat().map(point => Math.hypot(...point)));
    const scale = 0.85 * shapeRadius / radius;
    const edges = new Map();

    triangles.forEach(([a, b, c], index) => {
      const u = b.map((value, axis) => value - a[axis]);
      const v = c.map((value, axis) => value - a[axis]);
      const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const size = Math.hypot(...normal);
      const winding = normal.reduce((dot, value, axis) => dot + value * a[axis], 0) < 0 ? -1 : 1;
      const direction = normal.map(value => winding * value / size);
      const start = 3 * index;
      mesh.set([a, b, c].flat().map(value => value * scale), 3 * start);
      faces.set([start, start + (winding === 1 ? 1 : 2), start + (winding === 1 ? 2 : 1)], start);

      for (const [from, to, inside] of [[a, b, c], [b, c, a], [c, a, b]]) {
        const key = [from.join(','), to.join(',')].sort().join('|');
        if (!edges.has(key)) edges.set(key, []);
        edges.get(key).push({ from, to, inside, direction });
      }
    });

    const bands = [];
    let length = 0;
    for (const sides of edges.values()) {
      const first = sides[0];
      // Стыки треугольников на одной плоскости не являются рёбрами фигуры.
      if (sides.length > 1 && sides.every(side => side.direction.every((value, axis) =>
        Math.abs(value - first.direction[axis]) < 1e-6))) continue;
      const edgeLength = Math.hypot(...first.from.map((value, axis) => value - first.to[axis]));
      for (const side of sides) {
        length += edgeLength;
        bands.push({ ...side, end: length });
      }
    }

    let bandIndex = 0;
    for (let i = 0; i < COUNT; i++) {
      const location = (i + 0.5) * length / COUNT;
      while (location > bands[bandIndex].end) bandIndex++;
      const { from, to, inside, direction } = bands[bandIndex];
      const along = Math.random();
      const inset = EDGE_BAND * Math.random() ** 2;
      for (let axis = 0; axis < 3; axis++) {
        const edge = from[axis] + (to[axis] - from[axis]) * along;
        points[i * 3 + axis] = (edge + (inside[axis] - edge) * inset) * scale;
      }
      directions.set(direction, 3 * i);
    }
    return { positions: points, normals: directions, vertices: mesh, indices: faces };
  }

  function crossTriangles() {
    const cells = [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const triangles = [];
    for (const cell of cells) {
      for (let axis = 0; axis < 3; axis++) {
        for (const side of [-1, 1]) {
          const neighbor = cell.slice();
          neighbor[axis] += side;
          if (cells.some(other => other.every((value, coordinate) => value === neighbor[coordinate]))) continue;
          const [a, b, c, d] = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
            const point = cell.slice();
            point[axis] += side * 0.5;
            point[(axis + 1) % 3] += u * 0.5;
            point[(axis + 2) % 3] += v * 0.5;
            return point;
          });
          triangles.push([a, b, c], [a, c, d]);
        }
      }
    }
    return triangles;
  }

  function icosahedronTriangles() {
    const ratio = (1 + Math.sqrt(5)) / 2;
    const corners = [];
    for (const a of [-1, 1]) {
      for (const b of [-ratio, ratio]) corners.push([0, a, b], [a, b, 0], [b, 0, a]);
    }
    const neighbors = (a, b) => Math.abs(a.reduce((sum, value, axis) => sum + (value - b[axis]) ** 2, 0) - 4) < 1e-6;
    const triangles = [];
    for (let a = 0; a < corners.length; a++) {
      for (let b = a + 1; b < corners.length; b++) {
        if (!neighbors(corners[a], corners[b])) continue;
        for (let c = b + 1; c < corners.length; c++) {
          if (neighbors(corners[a], corners[c]) && neighbors(corners[b], corners[c])) {
            triangles.push([corners[a], corners[b], corners[c]]);
          }
        }
      }
    }
    return triangles;
  }

  const shapes = [{ positions, normals, vertices, indices }, createShape(crossTriangles()), createShape(icosahedronTriangles())];

  // Local coordinates inside one of four overlapping clouds, plus a motion delay.
  const scatterSamples = new Float32Array(COUNT * 3);
  for (let i = 0; i < scatterSamples.length; i += 3) {
    const angle = Math.random() * 2 * Math.PI;
    const radius = Math.sqrt(1 - Math.cbrt(Math.random()));
    scatterSamples[i] = Math.cos(angle) * radius;
    scatterSamples[i + 1] = Math.sin(angle) * radius;
    scatterSamples[i + 2] = Math.random() * 0.22;
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
        layout(location=3) in vec3 scatterSample;
        uniform vec4 cloud[4];
        uniform float progress;
        uniform int phase; // 0 = holding, 1 = scattering, 2 = assembling
        ${transform}
        uniform sampler2D surfaceDepth;
        uniform vec2 pixelScale;
        uniform float pointSize;
        uniform float spread;
        uniform bool aura;
        out float visible;
        void main() {
          if (aura) {
            gl_Position = vec4(position.xy * pixelScale + vec2(-1.0, 1.0), 0.0, 1.0);
            gl_PointSize = position.z;
            visible = 1.0;
            return;
          }
          vec4 rest = project(position);
          float depth = texture(surfaceDepth, rest.xy * 0.5 + 0.5).r;
          visible = mix(step(rest.z * 0.5 + 0.5, depth + 0.006), 1.0, spread);
          gl_Position = rest;
          if (phase != 2) gl_Position.xy += offset * pixelScale;
          if (phase != 0) {
            vec4 lobe = cloud[gl_VertexID % 4];
            mat2 axes = mat2(lobe.zw, vec2(-lobe.w, lobe.z) * 0.72);
            vec2 target = (lobe.xy + axes * scatterSample.xy) * scale;
            float t = clamp((progress - scatterSample.z) / (1.0 - scatterSample.z), 0.0, 1.0);
            float back = 1.0 - t;
            float amount = phase == 1 ? t * t : back * back * back;
            gl_Position.xy = mix(gl_Position.xy, target, amount);
          }
          float light = max(dot(rotation * normal, normalize(vec3(-0.45, 0.75, 0.6))), 0.0);
          gl_PointSize = pointSize * (1.3 + 1.3 * (1.0 - light));
        }`, `#version 300 es
        precision highp float;
        in float visible;
        uniform vec4 pointColor;
        out vec4 color;
        void main() {
          if (visible <= 0.0) discard;
          float radius = length(gl_PointCoord - 0.5);
          float alpha = 1.0 - smoothstep(0.5 - fwidth(radius), 0.5, radius);
          if (alpha <= 0.0) discard;
          color = vec4(pointColor.rgb, pointColor.a * alpha * visible);
        }`);
      this.offsetBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.offsetBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, COUNT * 2 * Float32Array.BYTES_PER_ELEMENT, gl.DYNAMIC_DRAW);
      const scatterBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, scatterBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, scatterSamples, gl.STATIC_DRAW);
      this.shapeArrays = shapes.map(shape => {
        const mesh = gl.createVertexArray();
        gl.bindVertexArray(mesh);
        this.attribute(0, shape.vertices, 3);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, shape.indices, gl.STATIC_DRAW);

        const points = gl.createVertexArray();
        gl.bindVertexArray(points);
        this.attribute(0, shape.positions, 3);
        this.attribute(1, shape.normals, 3);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.offsetBuffer);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, scatterBuffer);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 0, 0);
        return { mesh, points };
      });
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
      gl.useProgram(this.pointProgram);
      gl.uniform4fv(this.uniform(this.pointProgram, 'pointColor'), pointColor.rgba);
    }

    setCloud(cloud) {
      this.gl.useProgram(this.pointProgram);
      this.gl.uniform4fv(this.uniform(this.pointProgram, 'cloud[0]'), cloud);
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
      const arrays = this.shapeArrays[cube.shapeIndex];
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
        gl.bindVertexArray(arrays.mesh);
        gl.drawElements(gl.TRIANGLES, cube.shape.indices.length, gl.UNSIGNED_SHORT, 0);
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
      gl.uniform1f(this.uniform(this.pointProgram, 'spread'), cube.spread);
      const phase = cube.formation === 'holding' ? 0 : cube.formation === 'scattering' ? 1 : 2;
      gl.uniform1i(this.uniform(this.pointProgram, 'phase'), phase);
      if (phase) gl.uniform1f(this.uniform(this.pointProgram, 'progress'), cube.formationProgress);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
      gl.uniform1i(this.uniform(this.pointProgram, 'surfaceDepth'), 0);
      gl.bindVertexArray(arrays.points);
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
      this.mesh = new Float32Array(Math.max(...shapes.map(shape => shape.vertices.length)));
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
      const { vertices, indices } = cube.shape;
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
      this.ctx.fillStyle = pointColor.css;
      const hidden = cube.spread > 0 && cube.spread < 1 ? new Path2D() : null;
      this.ctx.beginPath();
      for (let i = 0; i < COUNT; i++) {
        const restX = cube.projected[i * 2];
        const restY = cube.projected[i * 2 + 1];
        const x = Math.floor(restX * this.depthScale);
        const y = Math.floor(restY * this.depthScale);
        const visible = x >= 0 && y >= 0 && x < this.depthWidth && y < this.depthHeight &&
          cube.depth[i] >= this.depth[y * this.depthWidth + x] - 0.048;
        const path = visible || cube.spread === 1 ? this.ctx : hidden;
        if (!path) continue;
        const px = restX + cube.offsets[i * 2];
        const py = restY + cube.offsets[i * 2 + 1];
        const radius = cube.radii[i];
        path.moveTo(px + radius, py);
        path.arc(px, py, radius, 0, Math.PI * 2);
      }
      this.ctx.fill();
      if (hidden) {
        this.ctx.globalAlpha = cube.spread;
        this.ctx.fill(hidden);
        this.ctx.globalAlpha = 1;
      }
    }
  }

  class TunnelCube {
    constructor(element) {
      this.element = element;
      this.canvas = element.querySelector('canvas');
      this.motion = matchMedia('(prefers-reduced-motion: reduce)');
      this.shapeIndex = 0;
      this.formation = 'holding';
      this.formationTime = 0;
      this.spread = 0;
      this.matrix = new Float32Array(9);
      this.offsets = new Float32Array(COUNT * 2);
      this.cloud = new Float32Array(16);
      this.velocity = new Float32Array(COUNT * 2);
      this.projected = new Float32Array(COUNT * 2);
      this.depth = new Float32Array(COUNT);
      this.radii = new Float32Array(COUNT);
      this.ease = Float32Array.from({ length: COUNT }, () => 0.04 + 0.04 * Math.random());
      this.targetEase = Float32Array.from({ length: COUNT }, () => 0.2 + 0.2 * Math.random());
      this.friction = Float32Array.from({ length: COUNT }, () => 0.8 + 0.15 * Math.random());
      this.mouse = { x: -1000, y: -1000, active: false, timeout: 0 };
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
      window.addEventListener('themechange', () => {
        pointColor = readPaletteColor('--color-cube-particles');
        const renderer = this.renderer;
        if (renderer.gl) {
          renderer.gl.useProgram(renderer.pointProgram);
          renderer.gl.uniform4fv(renderer.uniform(renderer.pointProgram, 'pointColor'), pointColor.rgba);
        }
        if (this.width && this.height) this.draw(false);
      });
      element.parentElement.addEventListener('pointermove', event => this.move(event), { passive: true });
      element.parentElement.addEventListener('pointerleave', () => this.release());
      element.parentElement.addEventListener('pointercancel', () => this.release());
      window.addEventListener('blur', () => this.release());
      this.motion.addEventListener('change', () => {
        this.release();
        if (this.motion.matches) {
          this.formation = 'holding';
          this.formationTime = this.spread = 0;
          this.offsets.fill(0);
          this.velocity.fill(0);
          for (const point of this.aura) point.x = point.y = point.vx = point.vy = 0;
          this.hasOffsets = false;
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
      if ('pageLoading' in document.documentElement.dataset) {
        document.addEventListener('page-loader:complete', () => this.sync(), { once: true });
      }
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

    get shape() {
      return shapes[this.shapeIndex];
    }

    get formationProgress() {
      return this.formationTime / (this.formation === 'scattering' ? SCATTER_TIME : ASSEMBLY_TIME);
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        this.release();
        return;
      }
      const dpr = Math.min(devicePixelRatio || 1, 2, 2048 / Math.max(rect.width, rect.height));
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
        if (!staticPreview && !this.motion.matches) {
          this.formation = 'assembling';
          this.prepareScatter();
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
      if (this.formation !== 'holding') this.placeParticles();
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
      const { positions, normals } = this.shape;
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
      if (narrowScreen.matches || staticPreview || this.motion.matches || event.pointerType === 'touch') return;
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
      this.sync();
    }

    pointerOnShape() {
      const x = (this.mouse.x - this.width / 2) / this.scale;
      const y = (this.height / 2 - this.mouse.y) / this.scale;
      if (x * x + y * y > shapeRadius * shapeRadius) return false;

      // Проверяем проекцию граней, включая участки между частицами.
      const m = this.matrix;
      const { vertices, indices } = this.shape;
      for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i] * 3;
        const b = indices[i + 1] * 3;
        const c = indices[i + 2] * 3;
        const ax = m[0] * vertices[a] + m[3] * vertices[a + 1] + m[6] * vertices[a + 2] - x;
        const bx = m[0] * vertices[b] + m[3] * vertices[b + 1] + m[6] * vertices[b + 2] - x;
        const cx = m[0] * vertices[c] + m[3] * vertices[c + 1] + m[6] * vertices[c + 2] - x;
        if (Math.min(ax, bx, cx) > 0 || Math.max(ax, bx, cx) < 0) continue;
        const ay = m[1] * vertices[a] + m[4] * vertices[a + 1] + m[7] * vertices[a + 2] - y;
        const by = m[1] * vertices[b] + m[4] * vertices[b + 1] + m[7] * vertices[b + 2] - y;
        const cy = m[1] * vertices[c] + m[4] * vertices[c + 1] + m[7] * vertices[c + 2] - y;
        const ab = ax * by - ay * bx;
        const bc = bx * cy - by * cx;
        const ca = cx * ay - cy * ax;
        const area = ab + bc + ca;
        if (area !== 0 && ab * area >= 0 && bc * area >= 0 && ca * area >= 0) return true;
      }
      return false;
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
      ctx.fillStyle = pointColor.css;
      ctx.beginPath();
      for (const point of this.aura) {
        const radius = point.size;
        ctx.moveTo(point.baseX + point.x + radius, point.baseY + point.y);
        ctx.arc(point.baseX + point.x, point.baseY + point.y, radius, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    physics() {
      this.hasOffsets = false;
      const radius = Math.sqrt(3000 / this.dpr) * 3;
      if (this.formation === 'holding') {
        if (this.mouse.active && this.projectedDirty) this.project();
        for (let i = 0; i < COUNT; i++) {
          const index = i * 2;
          if (this.mouse.active) {
            const dx = this.mouse.x - this.projected[index] - this.offsets[index];
            const dy = this.mouse.y - this.projected[index + 1] - this.offsets[index + 1];
            const squared = dx * dx + dy * dy;
            if (squared > 0 && squared < radius * radius) {
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
      }
      for (const point of this.aura) {
        if (this.mouse.active) {
          const dx = this.mouse.x - point.baseX - point.x;
          const dy = this.mouse.y - point.baseY - point.y;
          const squared = dx * dx + dy * dy;
          if (squared > 0 && squared < radius * radius) {
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
    }

    prepareScatter() {
      const rotation = Math.random() * 2 * Math.PI;
      for (let i = 0; i < 4; i++) {
        const angle = rotation + (i + Math.random() * 0.65) * Math.PI / 2;
        const distance = (0.35 + Math.random() * 0.45) * SCATTER_SCALE;
        const tilt = angle + Math.random() - 0.5;
        const radius = (1.2 + Math.random() * 0.38) * SCATTER_SCALE;
        this.cloud.set([Math.cos(angle) * distance, Math.sin(angle) * distance,
          Math.cos(tilt) * radius, Math.sin(tilt) * radius], i * 4);
      }
      this.velocity.fill(0);
      if (this.renderer.gl) {
        this.renderer.setCloud(this.cloud);
        return;
      }
      this.scatterStart ??= new Float32Array(this.offsets.length);
      this.scatterPoints ??= new Float32Array(this.offsets.length);
      for (let i = 0; i < COUNT; i++) {
        const lobe = (i % 4) * 4;
        const x = scatterSamples[i * 3], y = scatterSamples[i * 3 + 1] * 0.72;
        const a = this.cloud[lobe + 2], b = this.cloud[lobe + 3];
        this.scatterPoints[i * 2] = this.cloud[lobe] + a * x - b * y;
        this.scatterPoints[i * 2 + 1] = this.cloud[lobe + 1] + b * x + a * y;
        this.scatterStart[i * 2] = this.offsets[i * 2] / this.scale;
        this.scatterStart[i * 2 + 1] = this.offsets[i * 2 + 1] / this.scale;
      }
    }

    placeParticles() {
      const scattering = this.formation === 'scattering';
      const progress = this.formationProgress;
      this.spread = scattering ? progress ** 2 : (1 - progress) ** 3;
      if (this.renderer.gl) return;
      if (this.projectedDirty) this.project();
      for (let i = 0; i < COUNT; i++) {
        const index = i * 2;
        const delay = scatterSamples[i * 3 + 2];
        const time = Math.max(0, (progress - delay) / (1 - delay));
        const spread = scattering ? time ** 2 : (1 - time) ** 3;
        const startWeight = scattering ? (1 - spread) * this.scale : 0;
        this.offsets[index] = (this.width / 2 + this.scatterPoints[index] * this.scale - this.projected[index]) * spread + this.scatterStart[index] * startWeight;
        this.offsets[index + 1] = (this.height / 2 - this.scatterPoints[index + 1] * this.scale - this.projected[index + 1]) * spread + this.scatterStart[index + 1] * startWeight;
      }
    }

    advanceFormation(delta) {
      if (this.formation === 'holding' && this.mouse.active && this.pointerOnShape()) return false;
      this.formationTime += delta;
      if (this.formation === 'holding') {
        if (this.formationTime < HOLD_TIME) return false;
        this.formation = 'scattering';
        this.formationTime = 0;
        this.prepareScatter();
      } else if (this.formation === 'scattering' && this.formationTime >= SCATTER_TIME) {
        this.shapeIndex = (this.shapeIndex + 1) % shapes.length;
        this.formation = 'assembling';
        this.formationTime = 0;
        this.modelDirty = this.projectedDirty = true;
      } else if (this.formation === 'assembling' && this.formationTime >= ASSEMBLY_TIME) {
        this.formation = 'holding';
        this.formationTime = this.spread = 0;
        this.offsets.fill(0);
        return true;
      }
      this.placeParticles();
      return false;
    }

    sync() {
      if ('pageLoading' in document.documentElement.dataset ||
          narrowScreen.matches || staticPreview || this.motion.matches || document.hidden || !this.visible) {
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
      let changed = this.advanceFormation(delta);
      this.accumulator += Math.min(delta, 0.05);
      while (this.accumulator >= 1 / 60 - 1e-8) {
        if (this.mouse.active || this.hasOffsets) {
          this.physics();
          if (this.formation === 'holding') changed = true;
        }
        this.accumulator -= 1 / 60;
      }
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
