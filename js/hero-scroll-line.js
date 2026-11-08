(() => {
  'use strict';

  const hero = document.querySelector('.hero');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  if (!hero || motion.matches || new URLSearchParams(location.search).has('static')) return;

  const compact = matchMedia('(max-width: 480px)');

  const initialScroll = window.scrollY;
  const modelUrl = new URL('../img/system/line_reel.buf', document.currentScript.src);
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false });
  if (!gl || !gl.getExtension('OES_standard_derivatives')) return;

  canvas.className = 'hero-scroll-line';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:-1';
  canvas.hidden = true;

  const vertexHeader = `precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
`;
  const fragmentHeader = `#extension GL_OES_standard_derivatives : enable
precision highp float;
`;

  const lineVertex = vertexHeader + `#define GLSLIFY 1
attribute vec3 CP;attribute float Cd;varying float v_cd;varying float v_lineRatio;varying float v_s;uniform float u_scrollY;uniform vec2 u_viewportResolution;uniform vec2 u_aspect;uniform vec2 u_margin;uniform float u_radius;void main(){vec3 pos=vec3(CP.xy+position.xy*u_radius,0.0);gl_Position=projectionMatrix*modelViewMatrix*vec4(pos,1.0);v_cd=Cd;v_lineRatio=position.z;v_s=CP.z;}`;

  const lineFragment = fragmentHeader + `#define GLSLIFY 1
varying float v_cd;varying float v_lineRatio;varying float v_s;uniform float u_showRatio;uniform float u_hideRatio;uniform vec3 u_colorBg;uniform vec3 u_color0;uniform vec3 u_color1;uniform float u_aoThreshold;float linearStep(float edge0,float edge1,float x){return clamp((x-edge0)/(edge1-edge0),0.0,1.0);}vec3 hsv2rgb(in vec3 c){vec3 rgb=clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);rgb=rgb*rgb*(3.0-2.0*rgb);return c.z*mix(vec3(1.0),rgb,c.y);}vec3 rgb2hsv(vec3 c){vec4 K=vec4(0.0,-1.0/3.0,2.0/3.0,-1.0);vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));float d=q.x-min(q.w,q.y);float e=1.0e-10;return vec3(abs(q.z+(q.w-q.y)/(6.0*d+e)),d/(q.x+e),q.x);}vec3 lerpHSV(in vec3 a,in vec3 b,in float x){float hue=(mod(mod((b.x-a.x),1.)+1.5,1.)-0.5)*x+a.x;return vec3(hue,mix(a.yz,b.yz,x));}void main(){float ao=0.9+0.1*v_cd;float aoRatio=linearStep(u_aoThreshold-0.02,u_aoThreshold+0.02,u_showRatio);if(step(u_showRatio,v_lineRatio)>0.5)discard;float mixRatio=1.0-pow(1.0-clamp(v_lineRatio,0.0,1.0),2.0);gl_FragColor.rgb=hsv2rgb(lerpHSV(rgb2hsv(u_color1),rgb2hsv(u_color0),mixRatio));gl_FragColor.rgb*=min(1.0,ao+1.0-aoRatio);float alpha=abs(v_s-.5);gl_FragColor.a=linearStep(0.5,0.5-fwidth(alpha),alpha);}`;

  const endVertex = vertexHeader + `#define GLSLIFY 1
uniform vec3 u_color0;uniform vec3 u_color1;uniform float u_mixRatio;uniform float u_ao;vec3 hsv2rgb(in vec3 c){vec3 rgb=clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);rgb=rgb*rgb*(3.0-2.0*rgb);return c.z*mix(vec3(1.0),rgb,c.y);}vec3 rgb2hsv(vec3 c){vec4 K=vec4(0.0,-1.0/3.0,2.0/3.0,-1.0);vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));float d=q.x-min(q.w,q.y);float e=1.0e-10;return vec3(abs(q.z+(q.w-q.y)/(6.0*d+e)),d/(q.x+e),q.x);}vec3 lerpHSV(in vec3 a,in vec3 b,in float x){float hue=(mod(mod((b.x-a.x),1.)+1.5,1.)-0.5)*x+a.x;return vec3(hue,mix(a.yz,b.yz,x));}varying vec3 v_color;varying vec2 v_uv;void main(){v_color=u_ao*hsv2rgb(lerpHSV(rgb2hsv(u_color1),rgb2hsv(u_color0),u_mixRatio));v_uv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;

  const endFragment = fragmentHeader + `#define GLSLIFY 1
varying vec3 v_color;varying vec2 v_uv;void main(){float d=length(v_uv-.5)*2.;gl_FragColor.rgb=v_color;gl_FragColor.a=smoothstep(1.,1.-fwidth(d),d);}`;

  const color0 = readPaletteColor('--color-scroll-line-end').rgba.slice(0, 3);
  const color1 = readPaletteColor('--color-scroll-line-start').rgba.slice(0, 3);
  const aoThreshold = 0.555;
  const marginX = -0.05;
  const clamp = value => Math.max(0, Math.min(1, value));
  const lerp = (from, to, ratio) => from + (to - from) * ratio;
  const projection = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, -1, 1, 0, 1]);
  const model = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  let geometry;
  let line;
  let end;
  let ready = false;
  let frame = 0;

  function decode(buffer) {
    const length = new DataView(buffer).getUint32(0, true);
    const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, length)));
    const storage = { Int16Array, Uint16Array, Uint8Array };
    const attributes = {};
    let offset = 4 + length;
    for (const { id, needsPack, storageType, componentSize, packedComponents } of header.attributes) {
      const count = id === 'indices' ? header.indexCount : header.vertexCount;
      const packed = new storage[storageType](buffer, offset, count * componentSize);
      offset += packed.byteLength;
      if (!needsPack) {
        attributes[id] = packed;
        continue;
      }
      const levels = 2 ** (packed.BYTES_PER_ELEMENT * 8);
      const bias = storageType.startsWith('Int') ? levels / 2 : 0;
      attributes[id] = Float32Array.from(packed, (value, index) => {
        const { from, delta } = packedComponents[index % componentSize];
        return (value + bias) / levels * delta + from;
      });
    }
    return attributes;
  }

  function makeProgram(vertex, fragment, attributes, uniforms) {
    const program = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(program, shader);
      gl.deleteShader(shader);
    }
    attributes.forEach((name, index) => gl.bindAttribLocation(program, index, name));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const locations = Object.fromEntries([
      'projectionMatrix', 'modelViewMatrix', 'u_color0', 'u_color1', ...uniforms
    ].map(name => [name, gl.getUniformLocation(program, name)]));
    gl.uniform3fv(locations.u_color0, color0);
    gl.uniform3fv(locations.u_color1, color1);
    return { program, locations };
  }

  function upload(data, target = gl.ARRAY_BUFFER) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(target, buffer);
    gl.bufferData(target, data, gl.STATIC_DRAW);
    return buffer;
  }

  function initialize() {
    try {
      gl.getExtension('OES_standard_derivatives');
      line = makeProgram(lineVertex, lineFragment, ['position', 'CP', 'Cd'], ['u_showRatio', 'u_radius', 'u_aoThreshold']);
      gl.uniform1f(line.locations.u_aoThreshold, aoThreshold);
      line.attributes = [upload(geometry.position), upload(geometry.CP), upload(geometry.Cd)];
      line.indices = upload(geometry.indices, gl.ELEMENT_ARRAY_BUFFER);
      end = makeProgram(endVertex, endFragment, ['position', 'uv'], ['u_mixRatio', 'u_ao']);
      end.attributes = [
        upload(new Float32Array([-1,-1,0, 1,-1,0, -1,1,0, -1,1,0, 1,-1,0, 1,1,0])),
        upload(new Float32Array([0,0, 1,0, 0,1, 0,1, 1,0, 1,1]))
      ];
      gl.clearColor(0, 0, 0, 0);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      ready = true;
      schedule();
    } catch (error) {
      canvas.hidden = true;
      console.warn('Hero scroll line:', error);
    }
  }

  function use(pass, sizes, scale, x, y) {
    gl.useProgram(pass.program);
    model[0] = model[5] = scale;
    model[12] = x;
    model[13] = y;
    gl.uniformMatrix4fv(pass.locations.projectionMatrix, false, projection);
    gl.uniformMatrix4fv(pass.locations.modelViewMatrix, false, model);
    pass.attributes.forEach((buffer, index) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(index);
      gl.vertexAttribPointer(index, sizes[index], gl.FLOAT, false, 0, 0);
    });
  }

  function firstVisibleProgress(radius) {
    const { CP, position } = geometry;
    const visibleX = -marginX - radius;
    let next = 3;
    while (next < CP.length - 3 && CP[next] < visibleX) next += 3;
    const previous = next - 3;
    const fraction = clamp((visibleX - CP[previous]) / (CP[next] - CP[previous]));
    const visibleRatio = lerp(position[previous + 2], position[next + 2], fraction);
    return Math.sqrt(visibleRatio / 2);
  }

  function draw() {
    frame = 0;
    if (!ready || motion.matches || document.hidden) { canvas.hidden = true; return; }
    const width = document.documentElement.clientWidth;
    const height = window.innerHeight;
    const top = hero.getBoundingClientRect().top;
    const size = Math.hypot(width, height);
    const anchorY = top + (compact.matches ? 204 : 228);
    const originX = marginX * size;
    const originY = anchorY + geometry.CP[1] * size;
    const scroll = window.scrollY - initialScroll;
    if (!width || !height || scroll <= 0 || originY - 0.718671 * size >= height || originY + 0.0141946 * size <= 0) {
      canvas.hidden = true;
      return;
    }

    const radius = 0.008 * lerp(2, 1, clamp((width - 540) / (1920 - 540)));
    const firstVisible = firstVisibleProgress(radius);
    const scrollProgress = clamp(scroll / (1.3 * height));
    if (scrollProgress < firstVisible / 2) {
      canvas.hidden = true;
      return;
    }
    const progress = lerp(firstVisible / (2 - firstVisible), 1, scrollProgress);
    const show = progress < 0.5 ? 2 * progress * progress : 1 - 2 * (1 - progress) ** 2;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    canvas.hidden = false;
    gl.viewport(0, 0, pixelWidth, pixelHeight);
    gl.clear(gl.COLOR_BUFFER_BIT);
    projection[0] = 2 / width;
    projection[5] = 2 / height;

    use(line, [3, 3, 1], size, originX, -originY);
    gl.uniform1f(line.locations.u_showRatio, show);
    gl.uniform1f(line.locations.u_radius, radius);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, line.indices);
    gl.drawElements(gl.TRIANGLES, geometry.indices.length, gl.UNSIGNED_SHORT, 0);

    const { position, CP, Cd } = geometry;
    let current = 0;
    while (current + 1 < Cd.length && position[(current + 1) * 3 + 2] <= show) current++;
    const next = Math.min(current + 1, Cd.length - 1);
    const ratio = next === current ? 0 : (show - position[current * 3 + 2]) / (position[next * 3 + 2] - position[current * 3 + 2]);
    const x = lerp(CP[current * 3], CP[next * 3], ratio);
    const y = lerp(CP[current * 3 + 1], CP[next * 3 + 1], ratio);
    const ao = 0.9 + 0.1 * lerp(Cd[current], Cd[next], ratio);
    const mix = 1 - (1 - clamp(lerp(position[current * 3 + 2], position[next * 3 + 2], ratio))) ** 2;
    use(end, [3, 2], radius * size, originX + x * size, -originY + y * size);
    gl.disableVertexAttribArray(2);
    gl.uniform1f(end.locations.u_ao, Math.min(1, ao + 1 - clamp((show - aoThreshold + 0.02) / 0.04)));
    gl.uniform1f(end.locations.u_mixRatio, mix);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function schedule() {
    if (ready && !frame) frame = requestAnimationFrame(draw);
  }

  fetch(modelUrl).then(response => {
    if (!response.ok) throw new Error(`Line geometry: HTTP ${response.status}`);
    return response.arrayBuffer();
  }).then(buffer => {
    geometry = decode(buffer);
    document.body.style.isolation = 'isolate';
    document.body.append(canvas);
    initialize();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    document.addEventListener('visibilitychange', schedule);
    motion.addEventListener('change', schedule);
    new ResizeObserver(schedule).observe(hero);
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      ready = false;
      canvas.hidden = true;
      cancelAnimationFrame(frame);
      frame = 0;
    });
    canvas.addEventListener('webglcontextrestored', initialize);
  }).catch(error => console.warn('Hero scroll line:', error));
})();
