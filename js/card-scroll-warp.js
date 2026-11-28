(async () => {
  'use strict';

  const projects = document.querySelector('.projects');
  if (!projects) return;
  const covers = [...projects.querySelectorAll('.card__image')].map((box, index) => ({
    box, card: box.closest('.card'), image: box.querySelector('img'), index,
    opacity: box.style.opacity, imageScale: 1
  })).filter(cover => cover.image);
  if (!covers.length) return;

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const narrowScreen = matchMedia('(max-width: 768px)');
  // Изгиб, масштаб, наклон и смещение обложек при появлении.
  const ENABLE_CARD_SCROLL_WARP = false;
  const ENABLE_CARD_IMAGE_HOVER = true;
  if (!ENABLE_CARD_SCROLL_WARP && !ENABLE_CARD_IMAGE_HOVER) return;
  const BLUE_NOISE = new URL('../img/blue-noise.png', document.currentScript.src).href;
  while (narrowScreen.matches) {
    await new Promise(resolve => narrowScreen.addEventListener('change', resolve, { once: true }));
  }

  const canvas = document.createElement('canvas');
  canvas.className = 'card-scroll-warp';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:1';
  canvas.hidden = true;
  document.body.append(canvas);

  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false });
  if (!gl || !gl.getExtension('OES_standard_derivatives')) { canvas.remove(); return; }

  const cardHover = ENABLE_CARD_IMAGE_HOVER ? window.createCardImageHover?.(covers, schedule, canRun) : null;

  const vertexShader = `precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
#define GLSLIFY 1
#define GLSLIFY 1
uniform vec3 u_position;uniform vec4 u_quaternion;uniform vec3 u_scale;uniform vec2 u_domXY;uniform vec2 u_domWH;uniform vec2 u_domPivot;uniform vec4 u_domPadding;vec3 qrotate(vec4 q,vec3 v){return v+2.*cross(q.xyz,cross(q.xyz,v)+q.w*v);}vec3 getBasePosition(in vec3 pos){vec3 basePos=vec3((pos.xy)*u_domWH-u_domPivot,pos.z);basePos.xy+=mix(-u_domPadding.xz,u_domPadding.yw,pos.xy);return basePos;}vec3 getScreenPosition(in vec3 basePos){vec3 screenPos=qrotate(u_quaternion,basePos*u_scale)+vec3(u_domPivot.xy,0.);screenPos=(screenPos+vec3(u_domXY.xy,0.)+u_position)*vec3(1.,-1.,1.);return screenPos;}vec2 padUv(in vec2 uv){vec2 paddedUv=uv+mix(-u_domPadding.xz,u_domPadding.yw,uv)/u_domWH;paddedUv.y=1.-paddedUv.y;return paddedUv;}
varying vec2 v_uv;void main(){vec3 basePos=getBasePosition(position);vec3 screenPos=getScreenPosition(basePos);gl_Position=projectionMatrix*modelViewMatrix*vec4(screenPos,1.0);v_uv=padUv(uv);}`;

  const fragmentShader = `#extension GL_OES_standard_derivatives : enable
#define ENABLE_SCROLL_WARP ${ENABLE_CARD_SCROLL_WARP ? 1 : 0}
precision highp float;
#define BLUR_SAMPLES 6
uniform sampler2D u_texture;
uniform sampler2D u_blueNoiseTexture;
uniform vec2 u_textureSize;
uniform vec2 u_domWH;
uniform vec2 u_resolution;
uniform vec2 u_blueNoiseTexelSize;
uniform vec2 u_blueNoiseCoordOffset;
uniform float u_showRatio;
uniform float u_zoomRatio;
uniform float u_imageScale;
uniform float u_rippleStrength;
uniform float u_globalRadius;
varying vec2 v_uv;

float roundedBoxDistance(vec2 point, vec2 halfSize, float radius) {
  vec2 q = abs(point) - halfSize + radius;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - radius;
}

void main() {
  vec2 baseUv = v_uv;
  #if ENABLE_SCROLL_WARP
  if (u_rippleStrength > 0.0) {
    vec2 screenUv = gl_FragCoord.xy / u_resolution;
    baseUv.x -= (screenUv.x - 0.5) * (1.0 - sin(screenUv.y * 3.141592)) * u_rippleStrength;
  }
  #endif
  vec2 point = (baseUv - 0.5) * u_domWH;
  vec2 halfSize = u_domWH * 0.5;
  #if ENABLE_SCROLL_WARP
  halfSize *= mix(0.7, 1.0, u_showRatio);
  #endif
  float edge = roundedBoxDistance(point, halfSize, u_globalRadius);
  float alpha = 1.0 - smoothstep(-max(fwidth(edge), 0.0001), 0.0, edge);
  if (alpha <= 0.0) discard;

  vec2 fit = u_textureSize * max(u_domWH.x / u_textureSize.x, u_domWH.y / u_textureSize.y);
  #if ENABLE_SCROLL_WARP
  // Preserve the framing of the flat cover across the entrance zoom.
  float framing = mix(10.0, 5.0, u_zoomRatio);
  float zoom = mix(0.75, 1.0, u_showRatio) * mix(0.975, 1.0, u_zoomRatio) * framing / (framing + 0.15);
  vec2 uv = 0.5 + point * zoom / (fit * u_imageScale);
  float blur = 0.01 * u_zoomRatio;
  if (blur == 0.0) {
    gl_FragColor = vec4(texture2D(u_texture, uv).rgb, alpha);
    return;
  }

  vec2 noiseUv = (gl_FragCoord.xy + vec2(5.0, 28.0)) * u_blueNoiseTexelSize + u_blueNoiseCoordOffset;
  float angle = 6.2831852 * texture2D(u_blueNoiseTexture, noiseUv).g;
  float aspectInv = u_textureSize.y / u_textureSize.x;
  vec3 color = vec3(0.0);
  for (int i = 0; i < BLUR_SAMPLES; i++) {
    float radius = sqrt((float(i) + 0.5) / float(BLUR_SAMPLES)) * blur;
    angle += 10.16640738;
    vec2 offset = radius * vec2(cos(angle) * aspectInv, sin(angle));
    color += texture2D(u_texture, uv + offset).rgb;
  }
  gl_FragColor = vec4(color / float(BLUR_SAMPLES), alpha);
  #else
  vec2 uv = 0.5 + point / (fit * u_imageScale);
  gl_FragColor = vec4(texture2D(u_texture, uv).rgb, alpha);
  #endif
}`;

  const MAX_CANVAS_PIXELS = 2560 * 1440;
  const noise = ENABLE_CARD_SCROLL_WARP ? new Image() : null;
  let program;
  let uniforms;
  let frame = 0;
  let enabled = false;
  let previousTime = 0;
  let layoutDirty = true;
  let width = 0;
  let height = 0;
  let previousScrollY = window.scrollY;
  let scrollStrength = 0;

  function texture(image, unit) {
    const result = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, result);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    return result;
  }

  function init() {
    try {
      program = gl.createProgram();
      for (const [type, source] of [[gl.VERTEX_SHADER, vertexShader], [gl.FRAGMENT_SHADER, fragmentShader]]) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
        gl.attachShader(program, shader);
        gl.deleteShader(shader);
      }
      gl.bindAttribLocation(program, 0, 'position');
      gl.bindAttribLocation(program, 1, 'uv');
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      cardHover?.init(gl, program);
      uniforms = Object.fromEntries([
        'projectionMatrix', 'modelViewMatrix', 'u_position', 'u_quaternion', 'u_scale',
        'u_domXY', 'u_domWH', 'u_domPivot', 'u_domPadding', 'u_resolution',
        'u_texture', 'u_textureSize', 'u_showRatio', 'u_zoomRatio', 'u_imageScale',
        'u_rippleStrength', 'u_globalRadius', 'u_blueNoiseTexture',
        'u_blueNoiseTexelSize', 'u_blueNoiseCoordOffset'
      ].map(name => [name, gl.getUniformLocation(program, name)]));
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
      gl.uniformMatrix4fv(uniforms.modelViewMatrix, false,
        new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
      gl.uniform3f(uniforms.u_scale, 1, 1, 1);
      gl.uniform1i(uniforms.u_texture, 0);
      if (ENABLE_CARD_SCROLL_WARP) {
        gl.uniform1i(uniforms.u_blueNoiseTexture, 1);
        gl.uniform2f(uniforms.u_blueNoiseTexelSize, 1 / noise.naturalWidth, 1 / noise.naturalHeight);
        texture(noise, 1);
      }
      gl.uniform3f(uniforms.u_position, 0, 0, 0);
      gl.uniform4f(uniforms.u_quaternion, 0, 0, 0, 1);
      gl.uniform4f(uniforms.u_domPadding, 0, 0, 0, 0);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      for (const cover of covers) {
        cover.texture = null;
        cover.source = '';
        if (ENABLE_CARD_SCROLL_WARP) {
          cover.showTime = 0;
          cover.zoom = cover.zoomTarget = 1;
          cover.zoomVelocity = 0;
        }
      }
      enabled = true;
      invalidateLayout();
    } catch (error) {
      stop();
      enabled = false;
      console.warn('Card scroll warp:', error);
    }
  }

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
    layoutDirty = true;
    canvas.hidden = true;
    cardHover?.reset();
    previousScrollY = window.scrollY;
    scrollStrength = 0;
    for (const cover of covers) cover.box.style.opacity = cover.opacity;
  }

  function canRun() {
    return enabled && !motion.matches && !narrowScreen.matches;
  }

  function schedule() {
    if (!frame && canRun() && !document.hidden) frame = requestAnimationFrame(render);
  }

  function invalidateLayout() {
    layoutDirty = true;
    schedule();
  }

  function measureLayout(scrollY) {
    layoutDirty = false;
    width = document.documentElement.clientWidth;
    height = window.innerHeight;
    if (!width || !height) return;

    // Cache document coordinates so scrolling only changes the viewport offset.
    for (const cover of covers) {
      const card = cover.card.getBoundingClientRect();
      const box = cover.box.getBoundingClientRect();
      cover.cardTop = card.top + scrollY;
      cover.cardBottom = card.bottom + scrollY;
      cover.top = box.top + scrollY;
      cover.left = box.left;
      cover.width = box.width;
      cover.height = box.height;
      cover.radius = parseFloat(getComputedStyle(cover.box).borderTopLeftRadius) || 0;
      cover.measureImageScale = true;
    }
    gl.uniformMatrix4fv(uniforms.projectionMatrix, false,
      new Float32Array([2 / width, 0, 0, 0, 0, 2 / height, 0, 0, 0, 0, -1, 0, -1, 1, 0, 1]));
  }

  function expoOut(value) {
    value = Math.max(0, Math.min(1, value));
    return value === 1 ? 1 : 1 - Math.pow(2, -10 * value);
  }

  function updateZoom(cover, dt) {
    const w = Math.PI * 2 * 2.2;
    let k1 = .7 / (Math.PI * 2.2);
    let k2 = 1 / (w * w);
    if (w * dt < .7) k2 = Math.max(k2, dt * dt / 2 + dt * k1 / 2, dt * k1);
    else {
      const decay = Math.exp(-.7 * w * dt);
      const stable = dt / (1 + decay * decay - 2 * decay * Math.cos(dt * w * Math.sqrt(1 - .7 * .7)));
      k1 = (1 - decay * decay) * stable;
      k2 = dt * stable;
    }
    cover.zoomVelocity += (3 * .7 / w * -cover.zoomTarget / dt - cover.zoom - k1 * cover.zoomVelocity) * dt / k2;
    cover.zoom += cover.zoomVelocity * dt;
    cover.zoomTarget = 0;
    if (Math.abs(cover.zoom) < .00001 && Math.abs(cover.zoomVelocity) < .00001) {
      cover.zoom = cover.zoomVelocity = 0;
    }
  }

  function render(time) {
    frame = 0;
    if (!canRun() || document.hidden) return;
    const dt = previousTime ? Math.max(.0001, Math.min((time - previousTime) / 1000, .05)) : 1 / 60;
    previousTime = time;
    const scrollY = window.scrollY;
    if (layoutDirty) measureLayout(scrollY);
    if (!width || !height) return;
    if (ENABLE_CARD_SCROLL_WARP) {
      scrollStrength = Math.min(1, (scrollStrength + Math.abs(scrollY - previousScrollY) / height) * Math.exp(-10 * dt));
      previousScrollY = scrollY;
    }
    const viewportBottom = scrollY + height;
    let hasVisibleCover = false;
    for (const cover of covers) {
      const cardVisible = cover.cardTop < viewportBottom && cover.cardBottom > scrollY;
      if (ENABLE_CARD_SCROLL_WARP) cover.showTime = cardVisible ? cover.showTime + dt : 0;
      cover.visible = cardVisible && cover.width > 0 && cover.height > 0 &&
        cover.top < viewportBottom && cover.top + cover.height > scrollY;
      if (cover.visible) hasVisibleCover = true;
      else cover.box.style.opacity = cover.opacity;
    }
    if (!hasVisibleCover) {
      canvas.hidden = true;
      cardHover?.reset();
      scrollStrength = 0;
      previousTime = 0;
      return;
    }

    const scale = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)));
    const pixelWidth = Math.max(1, Math.floor(width * scale));
    const pixelHeight = Math.max(1, Math.floor(height * scale));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    // Finish style reads before replacing the visible DOM covers.
    for (const cover of covers) {
      if (cover.visible && (cover.imageScaling || cover.measureImageScale)) {
        const transform = getComputedStyle(cover.image).transform;
        cover.imageScale = transform === 'none' ? 1 : new DOMMatrixReadOnly(transform).a;
        cover.measureImageScale = false;
      }
    }
    const hoverAnimating = cardHover?.begin(time, dt, width, height, pixelWidth, pixelHeight);
    gl.viewport(0, 0, pixelWidth, pixelHeight);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const ripple = ENABLE_CARD_SCROLL_WARP ? Math.min(.15, scrollStrength * .5) : 0;
    if (ENABLE_CARD_SCROLL_WARP) {
      gl.uniform2f(uniforms.u_resolution, pixelWidth, pixelHeight);
      gl.uniform1f(uniforms.u_rippleStrength, ripple);
      gl.uniform2f(uniforms.u_blueNoiseCoordOffset, Math.random(), Math.random());
    }
    let animating = hoverAnimating || (ENABLE_CARD_SCROLL_WARP && scrollStrength > .00001);
    for (const cover of covers) {
      if (!cover.visible) continue;
      if (!cover.image.complete || !cover.image.naturalWidth || cover.failed) {
        cover.box.style.opacity = cover.opacity;
        continue;
      }
      try {
        if (cover.source !== cover.image.currentSrc) {
          if (cover.texture) gl.deleteTexture(cover.texture);
          cover.texture = texture(cover.image, 0);
          cover.source = cover.image.currentSrc;
        }
      } catch (error) {
        cover.failed = true;
        cover.box.style.opacity = cover.opacity;
        console.warn('Card image cannot be uploaded to WebGL:', cover.source, error);
        continue;
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, cover.texture);
      if (ENABLE_CARD_SCROLL_WARP) {
        const reveal = expoOut(cover.showTime / 2);
        const rotation = (1 - reveal) * (cover.index % 2 - .5) * .1;
        gl.uniform3f(uniforms.u_position, (1 - reveal) * (cover.index % 2 - .5) * -width * .1, 0, 0);
        gl.uniform4f(uniforms.u_quaternion, 0, 0, Math.sin(rotation / 2), Math.cos(rotation / 2));
        const padding = Math.ceil(cover.width * ripple * .5) + 2;
        gl.uniform4f(uniforms.u_domPadding, cover.index % 2 ? 0 : padding, cover.index % 2 ? padding : 0, 0, 0);
        gl.uniform1f(uniforms.u_showRatio, expoOut(cover.showTime / 1.5));
        gl.uniform1f(uniforms.u_zoomRatio, cover.zoom);
      }
      gl.uniform2f(uniforms.u_domXY, cover.left, cover.top - scrollY);
      gl.uniform2f(uniforms.u_domWH, Math.ceil(cover.width), Math.ceil(cover.height));
      gl.uniform2f(uniforms.u_domPivot, Math.ceil(cover.width) * .5, Math.ceil(cover.height) * .5);
      gl.uniform2f(uniforms.u_textureSize, cover.image.naturalWidth, cover.image.naturalHeight);
      gl.uniform1f(uniforms.u_globalRadius, cover.radius);
      gl.uniform1f(uniforms.u_imageScale, cover.imageScale);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      cover.box.style.opacity = '0';
      if (ENABLE_CARD_SCROLL_WARP) {
        updateZoom(cover, dt);
        animating ||= cover.showTime < 2 || Math.abs(cover.zoom) > .00001 || Math.abs(cover.zoomVelocity) > .00001;
      }
      animating ||= cover.imageScaling;
    }
    cardHover?.end();
    canvas.hidden = false;
    if (animating) schedule();
    else previousTime = 0;
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', invalidateLayout, { passive: true });
  window.addEventListener('pageshow', () => { stop(); schedule(); });
  document.addEventListener('visibilitychange', () => { stop(); schedule(); });
  motion.addEventListener('change', () => { stop(); schedule(); });
  narrowScreen.addEventListener('change', () => { stop(); schedule(); });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); enabled = false; stop(); });
  canvas.addEventListener('webglcontextrestored', init);
  const resizeObserver = new ResizeObserver(invalidateLayout);
  resizeObserver.observe(document.body);
  resizeObserver.observe(projects);
  document.fonts?.addEventListener('loadingdone', invalidateLayout);
  for (const cover of covers) {
    resizeObserver.observe(cover.card);
    resizeObserver.observe(cover.box);
    cover.image.addEventListener('load', () => {
      cover.failed = false;
      invalidateLayout();
    });
    const syncImageScale = event => {
      if (event.propertyName !== 'transform') return;
      cover.imageScaling = event.type === 'transitionrun';
      cover.measureImageScale = true;
      schedule();
    };
    for (const type of ['transitionrun', 'transitionend', 'transitioncancel']) {
      cover.image.addEventListener(type, syncImageScale);
    }
  }
  if (ENABLE_CARD_SCROLL_WARP) {
    noise.onload = init;
    noise.onerror = () => { stop(); enabled = false; };
    noise.src = BLUE_NOISE;
  } else {
    init();
  }
})().catch(error => console.warn('Card scroll warp:', error));
