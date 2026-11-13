(async () => {
  'use strict';

  const projects = document.querySelector('.projects');
  if (!projects) return;
  const covers = [...projects.querySelectorAll('.card__image')].map((box, index) => ({
    box, card: box.closest('.card'), image: box.querySelector('img'), index,
    opacity: box.style.opacity, showTime: 0, zoom: 1, zoomVelocity: 0, zoomTarget: 1, imageScale: 1
  })).filter(cover => cover.image);
  if (!covers.length) return;

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const narrowScreen = matchMedia('(max-width: 768px)');
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

  const cardHover = window.createCardImageHover?.(covers, schedule, canRun);

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
precision highp float;
#define PARALLAX_SAMPLES 12
#define BLUR_SAMPLES 6
#define GLSLIFY 1
uniform sampler2D u_texture;uniform sampler2D u_depthTexture;uniform vec3 u_colorBg;uniform float u_showRatio;uniform float u_activeRatio;uniform vec2 u_textureSize;uniform vec2 u_domWH;uniform vec2 u_shiftXY;uniform vec3 u_focusPos;uniform float u_time;uniform float u_zoomRatio;uniform float u_imageScale;uniform float u_dofRangeOffset;uniform float u_saturation;uniform float u_brightness;uniform float u_borderRatio;uniform float u_rippleStrength;uniform vec2 u_resolution;uniform float u_globalRadius;varying vec2 v_uv;
#define GLSLIFY 1
uniform sampler2D u_blueNoiseTexture;uniform vec2 u_blueNoiseTexelSize;uniform vec2 u_blueNoiseCoordOffset;vec3 getBlueNoise(vec2 coord){return texture2D(u_blueNoiseTexture,coord*u_blueNoiseTexelSize+u_blueNoiseCoordOffset).rgb;}vec3 getStaticBlueNoise(vec2 coord){return texture2D(u_blueNoiseTexture,coord*u_blueNoiseTexelSize).rgb;}
float linearStep(float edge0,float edge1,float x){return clamp((x-edge0)/(edge1-edge0),0.0,1.0);}float sdRoundedBox(in vec2 p,in vec2 b,in float r){vec2 q=abs(p)-b+r;return min(max(q.x,q.y),0.0)+length(max(q,0.0))-r;}float getRoundedCornerMask(vec2 uv,vec2 size,float radius,float ratio){vec2 halfSize=size*0.5;float maxDist=length(halfSize);float minSize=min(halfSize.x,halfSize.y);float maxSize=max(halfSize.x,halfSize.y);float t=ratio*maxDist;radius=mix(minSize*linearStep(0.,minSize,t),radius,linearStep(maxSize,maxDist,t));halfSize=min(halfSize,vec2(t));float d=sdRoundedBox((uv-.5)*u_domWH,halfSize,radius);return smoothstep(0.,0.-fwidth(d),d);}void main(){vec2 screenUv=gl_FragCoord.xy/u_resolution;vec2 baseUv=v_uv;baseUv.x-=(screenUv.x-0.5)*(1.-sin((screenUv.y)*3.141592))*u_rippleStrength;float radiusRatio=1.;float imageAlpha=getRoundedCornerMask(baseUv,u_domWH*mix(0.7,1.,u_showRatio),u_globalRadius,radiusRatio);if(imageAlpha<=0.)discard;vec3 noise=getBlueNoise(gl_FragCoord.xy+vec2(5.,28.));vec2 toUvSpace=1./(u_textureSize*max(u_domWH.x/u_textureSize.x,u_domWH.y/u_textureSize.y));float borderThickenss=(u_domWH.y*0.08+5.)*u_borderRatio-5.;vec2 uv=baseUv-.5;uv*=u_domWH*mix(0.75,1.,u_showRatio);uv*=mix(0.975,1.,u_zoomRatio);float zMultiplier=u_domWH.y*(.15+u_activeRatio*15.);vec3 pos=vec3(uv,-zMultiplier);float cameraDepth=u_domWH.y*mix(10.,5.,u_zoomRatio);vec3 rayOri=vec3(u_focusPos.xy,cameraDepth);float dist=length(pos-rayOri);vec3 rayDir=(pos-rayOri)/dist;float skipDist=cameraDepth/-rayDir.z;dist-=skipDist;float stepDist=dist/float(PARALLAX_SAMPLES);vec3 rayStep=rayDir*stepDist;vec3 rayPos=rayOri+rayDir*(skipDist+stepDist*noise.x);for(int i=0;i<PARALLAX_SAMPLES;i++){float currZ=-texture2D(u_depthTexture,rayPos.xy*toUvSpace+.5).r*zMultiplier;if(currZ>rayPos.z){break;}rayPos+=rayStep;dist+=stepDist;}uv=rayPos.xy;uv*=toUvSpace/u_imageScale;uv+=u_shiftXY*0.015;float depth=texture2D(u_depthTexture,uv+.5).r;vec3 color=vec3(0.0);float PI=3.1415926;float blurriness=mix(0.0,0.01,u_zoomRatio)*linearStep(0.0,0.5,abs(depth-u_focusPos.z)+u_dofRangeOffset);float angle=PI*2.*noise.y;float textureAspectInv=u_textureSize.y/u_textureSize.x;float numSampleInv=1./float(BLUR_SAMPLES);if(blurriness==0.){color=texture2D(u_texture,uv+.5).rgb;}else{for(int i=0;i<BLUR_SAMPLES;i++){float fI=float(i);float r=sqrt((fI+0.5)*numSampleInv)*blurriness;angle+=10.16640738;vec2 uvOffset=r*vec2(cos(angle)*textureAspectInv,sin(angle));vec4 image=texture2D(u_texture,uv+uvOffset+.5);color+=image.rgb;}color*=numSampleInv;}float luma=dot(color,vec3(0.299,0.587,0.114));color=mix(vec3(luma),color,1.0+u_saturation);color+=u_brightness;float fogThickness=0.75;color=mix(color,u_colorBg,linearStep(0.0,fogThickness,u_activeRatio*(1.+fogThickness*2.)-fogThickness-(1.0-depth)));gl_FragColor=vec4(color,imageAlpha);}`;

  let program;
  let uniforms;
  let frame = 0;
  let enabled = false;
  let previousTime = 0;
  let measureStyle = true;
  const scroll = {
    pixel: window.scrollY, target: window.scrollY, native: window.scrollY,
    strength: 0, wheel: false, velocity: 0, drag: null, delta: 0, history: []
  };
  const noise = new Image();

  function texture(image, unit, repeat = false) {
    const result = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, result);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, repeat ? gl.NEAREST : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, repeat ? gl.NEAREST : gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    if (image) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA,
      gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
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
        'u_texture', 'u_depthTexture', 'u_textureSize', 'u_showRatio', 'u_zoomRatio', 'u_imageScale',
        'u_rippleStrength', 'u_globalRadius', 'u_focusPos', 'u_blueNoiseTexture',
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
      gl.uniform3f(uniforms.u_focusPos, 0, 0, -1);
      gl.uniform1i(uniforms.u_texture, 0);
      gl.uniform1i(uniforms.u_depthTexture, 1);
      gl.uniform1i(uniforms.u_blueNoiseTexture, 2);
      gl.uniform2f(uniforms.u_blueNoiseTexelSize, 1 / 128, 1 / 128);
      texture(null, 1);
      texture(noise, 2);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      for (const cover of covers) { cover.texture = null; cover.source = ''; }
      enabled = true;
      measureStyle = true;
      schedule();
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
    measureStyle = true;
    canvas.hidden = true;
    cardHover?.reset();
    scroll.pixel = scroll.target = scroll.native = window.scrollY;
    scroll.strength = scroll.velocity = scroll.delta = 0;
    scroll.wheel = false;
    scroll.drag = null;
    scroll.history.length = 0;
    for (const cover of covers) cover.box.style.opacity = cover.opacity;
  }

  function canRun() {
    return enabled && !motion.matches && !narrowScreen.matches;
  }

  function schedule() {
    if (!frame && canRun() && !document.hidden) frame = requestAnimationFrame(render);
  }

  function clampScroll(value) {
    return Math.max(0, Math.min(value, document.documentElement.scrollHeight - window.innerHeight));
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

  function updateScroll(dt, time) {
    const previous = scroll.pixel;
    if (Math.abs(window.scrollY - scroll.native) > 1) {
      scroll.pixel = scroll.target = window.scrollY;
      scroll.wheel = false;
      scroll.velocity = 0;
    }
    if (scroll.drag) {
      scroll.history.push({ time, deltaTime: dt, deltaPixel: scroll.delta });
      while (scroll.history.length && time - scroll.history[0].time > .1) scroll.history.shift();
      scroll.pixel += scroll.delta;
      scroll.target = scroll.pixel;
      scroll.delta = 0;
    } else if (scroll.wheel) {
      scroll.target = clampScroll(scroll.target);
      const distance = scroll.target - scroll.pixel;
      scroll.pixel += distance * (1 - Math.exp(-12 * dt));
      if (Math.abs(distance) < .1) { scroll.pixel = scroll.target; scroll.wheel = false; }
    } else {
      if (scroll.history.length) {
        let sum = 0;
        let weight = 0;
        for (const sample of scroll.history) {
          const contribution = sample.deltaTime * (scroll.history.length === 1 ? 1 : (sample.time - scroll.history[0].time) / .1);
          sum += sample.deltaPixel / sample.deltaTime * contribution;
          weight += contribution;
        }
        scroll.velocity = weight ? sum / weight : 0;
        scroll.history.length = 0;
      }
      const friction = 2.1 + (1.9 - 2.1) * Math.min(1, Math.abs(scroll.velocity / window.innerHeight / 5));
      scroll.velocity += -friction * scroll.velocity * dt;
      scroll.pixel += scroll.velocity * dt;
      if (Math.abs(scroll.velocity) < .1) scroll.velocity = 0;
      scroll.target = scroll.pixel;
    }
    scroll.pixel = clampScroll(scroll.pixel);
    if (scroll.pixel === 0 || scroll.pixel === clampScroll(Infinity)) scroll.velocity = 0;
    if (Math.abs(scroll.pixel - window.scrollY) > .01) window.scrollTo({ top: scroll.pixel, behavior: 'instant' });
    scroll.native = window.scrollY;
    scroll.strength += Math.abs((scroll.pixel - previous) / window.innerHeight);
    scroll.strength += (0 - scroll.strength) * (1 - Math.exp(-10 * dt));
    scroll.strength = Math.min(scroll.strength, 1);
  }

  function render(time) {
    frame = 0;
    if (!canRun() || document.hidden) return;
    const dt = previousTime ? Math.max(.0001, Math.min((time - previousTime) / 1000, .05)) : 1 / 60;
    previousTime = time;
    updateScroll(dt, time / 1000);
    const width = document.documentElement.clientWidth;
    const height = window.innerHeight;
    for (const cover of covers) {
      cover.range = cover.card.getBoundingClientRect();
      cover.rect = cover.box.getBoundingClientRect();
      if (cover.range.top >= height || cover.range.bottom <= 0) cover.showTime = 0;
      else cover.showTime += dt;
    }
    if (!covers.some(({ rect }) => rect.top < height && rect.bottom > 0 && rect.width && rect.height)) {
      canvas.hidden = true;
      cardHover?.reset();
      if (scroll.wheel || scroll.drag || scroll.velocity !== 0 || scroll.strength > .00001) schedule();
      else previousTime = 0;
      return;
    }
    const scale = Math.min(window.devicePixelRatio || 1, 1.5);
    if (canvas.width !== Math.round(width * scale) || canvas.height !== Math.round(height * scale)) {
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      measureStyle = true;
    }
    const hoverAnimating = cardHover?.begin(time, dt, width, height, canvas.width, canvas.height);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(uniforms.u_resolution, canvas.width, canvas.height);
    if (measureStyle) {
      gl.uniformMatrix4fv(uniforms.projectionMatrix, false,
        new Float32Array([2 / width, 0, 0, 0, 0, 2 / height, 0, 0, 0, 0, -1, 0, -1, 1, 0, 1]));
    }
    const ripple = Math.min(.15, scroll.strength * .5);
    gl.uniform1f(uniforms.u_rippleStrength, ripple);
    gl.uniform2f(uniforms.u_blueNoiseCoordOffset, Math.random(), Math.random());
    let animating = hoverAnimating || scroll.wheel || scroll.drag || scroll.velocity !== 0 || scroll.strength > .00001;
    for (const cover of covers) {
      if (measureStyle) cover.radius = parseFloat(getComputedStyle(cover.box).borderTopLeftRadius) || 0;
      if (measureStyle || cover.imageScaling || cover.measureImageScale) {
        const transform = getComputedStyle(cover.image).transform;
        cover.imageScale = transform === 'none' ? 1 : new DOMMatrixReadOnly(transform).a;
        cover.measureImageScale = false;
      }
    }
    measureStyle = false;
    for (const cover of covers) {
      const { range, rect } = cover;
      if (range.top >= height || range.bottom <= 0) {
        cover.box.style.opacity = cover.opacity;
        continue;
      }
      if (rect.top >= height || rect.bottom <= 0 || !rect.width || !rect.height ||
          !cover.image.complete || !cover.image.naturalWidth || cover.failed) {
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
      const reveal = expoOut(cover.showTime / 2);
      const rotation = (1 - reveal) * (cover.index % 2 - .5) * .1;
      gl.uniform3f(uniforms.u_position, (1 - reveal) * (cover.index % 2 - .5) * -width * .1, 0, 0);
      gl.uniform4f(uniforms.u_quaternion, 0, 0, Math.sin(rotation / 2), Math.cos(rotation / 2));
      gl.uniform2f(uniforms.u_domXY, rect.left, rect.top + scroll.native - scroll.pixel);
      gl.uniform2f(uniforms.u_domWH, Math.ceil(rect.width), Math.ceil(rect.height));
      gl.uniform2f(uniforms.u_domPivot, Math.ceil(rect.width) * .5, Math.ceil(rect.height) * .5);
      const padding = Math.ceil(rect.width * ripple * .5) + 2;
      gl.uniform4f(uniforms.u_domPadding, cover.index % 2 ? 0 : padding, cover.index % 2 ? padding : 0, 0, 0);
      gl.uniform2f(uniforms.u_textureSize, cover.image.naturalWidth, cover.image.naturalHeight);
      gl.uniform1f(uniforms.u_globalRadius, cover.radius);
      gl.uniform1f(uniforms.u_showRatio, expoOut(cover.showTime / 1.5));
      gl.uniform1f(uniforms.u_zoomRatio, cover.zoom);
      gl.uniform1f(uniforms.u_imageScale, cover.imageScale);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      cover.box.style.opacity = '0';
      updateZoom(cover, dt);
      animating ||= cover.imageScaling || cover.showTime < 2 || Math.abs(cover.zoom) > .00001 || Math.abs(cover.zoomVelocity) > .00001;
    }
    cardHover?.end();
    canvas.hidden = false;
    if (animating) schedule();
    else previousTime = 0;
  }

  function canHandle(event) {
    if (!canRun() || event.defaultPrevented || event.ctrlKey || event.metaKey) return false;
    for (let element = event.target; element && element !== document.body; element = element.parentElement) {
      if (element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName)) return false;
      if (element.scrollHeight > element.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(element).overflowY)) return false;
    }
    return true;
  }

  window.addEventListener('wheel', event => {
    if (!canHandle(event) || !event.cancelable || event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    event.preventDefault();
    if (!scroll.wheel) scroll.pixel = scroll.target = scroll.native = window.scrollY;
    scroll.target = clampScroll(scroll.target + Math.max(-200, Math.min(200,
      event.deltaY * (event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 800 : 1))));
    scroll.wheel = true;
    scroll.velocity = 0;
    scroll.history.length = 0;
    schedule();
  }, { passive: false });

  window.addEventListener('keydown', event => {
    if (!canHandle(event)) return;
    const amount = { ArrowUp: -100, ArrowDown: 100, PageUp: -window.innerHeight, PageDown: window.innerHeight }[event.key];
    if (amount === undefined) return;
    event.preventDefault();
    scroll.target = clampScroll(scroll.pixel + amount);
    scroll.wheel = true;
    scroll.velocity = 0;
    schedule();
  });

  window.addEventListener('touchstart', event => {
    if (!canHandle(event) || event.touches.length !== 1) { scroll.drag = null; return; }
    scroll.pixel = scroll.target = window.scrollY;
    scroll.wheel = false;
    scroll.velocity = scroll.delta = 0;
    scroll.history.length = 0;
    scroll.drag = { x: event.touches[0].clientX, y: event.touches[0].clientY, vertical: null };
  }, { passive: true });
  window.addEventListener('touchmove', event => {
    if (!scroll.drag || event.touches.length !== 1 || !event.cancelable) { scroll.drag = null; return; }
    const x = event.touches[0].clientX;
    const y = event.touches[0].clientY;
    if (scroll.drag.vertical === null) scroll.drag.vertical = Math.abs(y - scroll.drag.y) >= Math.abs(x - scroll.drag.x);
    if (!scroll.drag.vertical) { scroll.drag = null; return; }
    event.preventDefault();
    scroll.delta += scroll.drag.y - y;
    scroll.drag.y = y;
    schedule();
  }, { passive: false });
  window.addEventListener('touchend', () => {
    if (scroll.drag && scroll.delta) {
      scroll.pixel = clampScroll(scroll.pixel + scroll.delta);
      window.scrollTo({ top: scroll.pixel, behavior: 'instant' });
      scroll.native = window.scrollY;
      scroll.delta = 0;
    }
    scroll.drag = null;
    schedule();
  }, { passive: true });
  window.addEventListener('touchcancel', () => { scroll.drag = null; scroll.history.length = 0; scroll.delta = 0; }, { passive: true });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', () => { measureStyle = true; schedule(); }, { passive: true });
  window.addEventListener('pageshow', () => { stop(); schedule(); });
  document.addEventListener('visibilitychange', () => { stop(); schedule(); });
  motion.addEventListener('change', () => { stop(); schedule(); });
  narrowScreen.addEventListener('change', () => { stop(); schedule(); });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); enabled = false; stop(); });
  canvas.addEventListener('webglcontextrestored', init);
  new ResizeObserver(() => { measureStyle = true; schedule(); }).observe(projects);
  for (const cover of covers) {
    cover.image.addEventListener('load', () => { cover.failed = false; schedule(); });
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
  noise.onload = init;
  noise.onerror = () => { stop(); enabled = false; };
  noise.src = BLUE_NOISE;
})().catch(error => console.warn('Card scroll warp:', error));
