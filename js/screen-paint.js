(() => {
  'use strict';
  if (!document.querySelector('.page') || document.getElementById('screen-paint-overlay')) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const vertexShader = `
    attribute vec2 position;
    varying vec2 v_uv;
    void main() {
      v_uv = position * 0.5 + 0.5;
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `;
  const paintShader = `#define GLSLIFY 1
uniform sampler2D u_lowPaintTexture;uniform sampler2D u_prevPaintTexture;uniform vec2 u_paintTexelSize;uniform vec2 u_scrollOffset;uniform vec4 u_drawFrom;uniform vec4 u_drawTo;uniform float u_pushStrength;uniform vec3 u_dissipations;uniform vec2 u_vel;varying vec2 v_uv;vec2 sdSegment(in vec2 p,in vec2 a,in vec2 b){vec2 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/max(dot(ba,ba),0.000001),0.0,1.0);return vec2(length(pa-ba*h),h);}
#ifdef USE_NOISE
uniform float u_curlScale;uniform float u_curlStrength;vec2 hash(vec2 p){vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));p3+=dot(p3,p3.yzx+33.33);return fract((p3.xx+p3.yz)*p3.zy)*2.0-1.0;}vec3 noised(in vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*f*(f*(f*6.0-15.0)+10.0);vec2 du=30.0*f*f*(f*(f-2.0)+1.0);vec2 ga=hash(i+vec2(0.0,0.0));vec2 gb=hash(i+vec2(1.0,0.0));vec2 gc=hash(i+vec2(0.0,1.0));vec2 gd=hash(i+vec2(1.0,1.0));float va=dot(ga,f-vec2(0.0,0.0));float vb=dot(gb,f-vec2(1.0,0.0));float vc=dot(gc,f-vec2(0.0,1.0));float vd=dot(gd,f-vec2(1.0,1.0));return vec3(va+u.x*(vb-va)+u.y*(vc-va)+u.x*u.y*(va-vb-vc+vd),ga+u.x*(gb-ga)+u.y*(gc-ga)+u.x*u.y*(ga-gb-gc+gd)+du*(u.yx*(va-vb-vc+vd)+vec2(vb,vc)-va));}
#endif
void main(){vec2 res=sdSegment(gl_FragCoord.xy,u_drawFrom.xy,u_drawTo.xy);vec2 radiusWeight=mix(u_drawFrom.zw,u_drawTo.zw,res.y);float d=1.0-smoothstep(-0.01,radiusWeight.x,res.x);vec4 lowData=texture2D(u_lowPaintTexture,v_uv-u_scrollOffset);vec2 velInv=(0.5-lowData.xy)*u_pushStrength;
#ifdef USE_NOISE
vec3 noise3=noised(gl_FragCoord.xy*u_curlScale*(1.0-lowData.xy));vec2 noise=noised(gl_FragCoord.xy*u_curlScale*(2.0-lowData.xy*(0.5+noise3.x)+noise3.yz*0.1)).yz;velInv+=noise*(lowData.z+lowData.w)*u_curlStrength;
#endif
vec4 data=texture2D(u_prevPaintTexture,v_uv-u_scrollOffset+velInv*u_paintTexelSize);data.xy-=0.5;vec4 delta=(u_dissipations.xxyz-1.0)*data;vec2 newVel=u_vel*d;delta+=vec4(newVel,radiusWeight.yy*d);delta.zw=sign(delta.zw)*max(vec2(0.004),abs(delta.zw));data+=delta;data.xy+=0.5;gl_FragColor=clamp(data,vec4(0.0),vec4(1.0));}`;
  const blurShader = `#define GLSLIFY 1
uniform sampler2D u_texture;uniform vec2 u_delta;varying vec2 v_uv;void main(){vec4 color=texture2D(u_texture,v_uv)*0.1633;vec2 delta=u_delta;color+=texture2D(u_texture,v_uv-delta)*0.1531;color+=texture2D(u_texture,v_uv+delta)*0.1531;delta+=u_delta;color+=texture2D(u_texture,v_uv-delta)*0.12245;color+=texture2D(u_texture,v_uv+delta)*0.12245;delta+=u_delta;color+=texture2D(u_texture,v_uv-delta)*0.0918;color+=texture2D(u_texture,v_uv+delta)*0.0918;delta+=u_delta;color+=texture2D(u_texture,v_uv-delta)*0.051;color+=texture2D(u_texture,v_uv+delta)*0.051;gl_FragColor=color;}`;
  const copyShader = `
    uniform sampler2D u_texture;
    varying vec2 v_uv;
    void main() {
      gl_FragColor = texture2D(u_texture, v_uv);
    }
  `;
  const trailShader = `
    uniform sampler2D u_screenPaintTexture;
    uniform vec3 u_background;
    uniform float u_opacity;
    varying vec2 v_uv;
    void main() {
      vec4 data = texture2D(u_screenPaintTexture, v_uv);
      float weight = (data.z + data.w) * 0.5;
      vec2 vel = (0.5 - data.xy - 0.001) * 2.0 * weight;
      vec3 color = sin(vec3(vel.x + vel.y) * 40.0 + vec3(0.0, 2.0, 4.0) * 0.5)
        * smoothstep(0.4, -0.9, weight) * 1.25
        * max(abs(vel.x), abs(vel.y)) * 10.0;
      color = clamp(u_background + color, 0.0, 1.0) - u_background;
      float alpha = clamp(max(max(abs(color.r), abs(color.g)), abs(color.b)), 0.0, 1.0);
      vec3 ink = clamp(u_background + color / max(alpha, 0.00001), 0.0, 1.0);
      alpha *= u_opacity;
      gl_FragColor = vec4(ink * alpha, alpha);
    }
  `;

  class ScreenPaint {
    constructor() {
      this.canvas = document.createElement('canvas');
      this.canvas.id = 'screen-paint-overlay';
      this.canvas.setAttribute('aria-hidden', 'true');
      this.canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none';
      this.gl = this.canvas.getContext('webgl', {
        alpha: true, premultipliedAlpha: true, antialias: false,
        depth: false, stencil: false, powerPreference: 'low-power'
      });
      if (!this.gl) return;
      this.frame = 0;
      this.targets = [];
      this.available = false;
      this.initialize();
      document.body.style.isolation = 'isolate';
      document.body.append(this.canvas);
      window.addEventListener('pointermove', event => this.move(event), { passive: true });
      window.addEventListener('themechange', () => {
        this.background = readPaletteColor('--color-page-bg').rgba.slice(0, 3);
        this.clear(true);
      });
      window.addEventListener('resize', () => this.resize(), { passive: true });
      window.addEventListener('scroll', () => this.clear(), { passive: true });
      document.addEventListener('pointerleave', () => { this.pointer = null; });
      window.addEventListener('blur', () => this.clear());
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
      motion.addEventListener('change', () => this.clear());
      finePointer.addEventListener('change', () => this.clear());
      this.canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        cancelAnimationFrame(this.frame);
        this.frame = 0;
        this.available = false;
      });
      this.canvas.addEventListener('webglcontextrestored', () => {
        try { this.initialize(); }
        catch (error) { this.available = false; console.warn('ScreenPaint:', error); }
      });
    }

    initialize() {
      const gl = this.gl;
      this.available = false;
      this.targets = [];
      this.programs = {
        paint: this.program('#define USE_NOISE\n' + paintShader),
        blur: this.program(blurShader),
        copy: this.program(copyShader),
        trail: this.program(trailShader)
      };
      this.buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.disable(gl.DITHER);
      this.available = true;
      this.resize();
    }

    program(source) {
      const gl = this.gl;
      const program = gl.createProgram();
      for (const [type, code] of [[gl.VERTEX_SHADER, vertexShader], [gl.FRAGMENT_SHADER, source]]) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, 'precision highp float;\n' + code);
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
      const uniforms = {};
      for (let index = 0; index < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); index++) {
        const { name } = gl.getActiveUniform(program, index);
        uniforms[name] = gl.getUniformLocation(program, name);
      }
      return { program, uniforms };
    }

    target(width, height) {
      const gl = this.gl;
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(texture);
        throw new Error('Cannot create paint framebuffer');
      }
      const target = { texture, framebuffer, width, height };
      this.targets.push(target);
      return target;
    }

    resize() {
      if (!this.available) return;
      this.clear();
      const gl = this.gl;
      for (const target of this.targets) {
        gl.deleteFramebuffer(target.framebuffer);
        gl.deleteTexture(target.texture);
      }
      this.targets = [];
      const dpr = Math.min(1.5, devicePixelRatio || 1);
      this.canvas.width = Math.max(8, Math.round(innerWidth * dpr));
      this.canvas.height = Math.max(8, Math.round(innerHeight * dpr));
      this.current = this.target(this.canvas.width >> 2, this.canvas.height >> 2);
      this.previous = this.target(this.current.width, this.current.height);
      this.low = this.target(this.canvas.width >> 3, this.canvas.height >> 3);
      this.blurred = this.target(this.low.width, this.low.height);
      this.background = readPaletteColor('--color-page-bg').rgba.slice(0, 3);
      this.clear(true);
    }

    clear(force = false) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.pointer = null;
      this.previousTime = 0;
      this.accumulator = 0;
      this.draw = [0, 0, 0, 1];
      this.velocity = [0, 0];
      if (!this.available || (!force && this.cleared)) return;
      this.cleared = true;
      const gl = this.gl;
      for (const target of this.targets) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
        gl.clearColor(0.5, 0.5, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    move(event) {
      if (event.pointerType !== 'mouse' || !this.available || motion.matches || !finePointer.matches || document.hidden) return;
      if (this.pointer && this.pointer.x === event.clientX && this.pointer.y === event.clientY) return;
      if (!this.pointer) {
        this.draw = [event.clientX / innerWidth * this.current.width,
          (1 - event.clientY / innerHeight) * this.current.height, 0, 1];
        this.previousPointer = { x: event.clientX, y: event.clientY };
      }
      this.pointer = { x: event.clientX, y: event.clientY };
      this.lastMoveTime = performance.now();
      if (!this.frame) this.frame = requestAnimationFrame(time => this.update(time));
    }

    use(program, target) {
      const gl = this.gl;
      gl.useProgram(program.program);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
      gl.viewport(0, 0, target ? target.width : this.canvas.width, target ? target.height : this.canvas.height);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      return program.uniforms;
    }

    texture(uniform, target, unit = 0) {
      const gl = this.gl;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, target.texture);
      gl.uniform1i(uniform, unit);
    }

    simulate() {
      this.cleared = false;
      const gl = this.gl;
      [this.previous, this.current] = [this.current, this.previous];
      const pointer = this.pointer || this.previousPointer;
      const distance = Math.hypot(pointer.x - this.previousPointer.x, pointer.y - this.previousPointer.y);
      const from = this.draw;
      this.draw = [pointer.x / innerWidth * this.current.width,
        (1 - pointer.y / innerHeight) * this.current.height,
        Math.min(1, distance / 100) * Math.max(40, innerWidth / 20) / innerHeight * this.current.height, 1];
      this.velocity[0] = this.velocity[0] * 0.8 + (this.draw[0] - from[0]) / 60 * 0.8;
      this.velocity[1] = this.velocity[1] * 0.8 + (this.draw[1] - from[1]) / 60 * 0.8;
      this.previousPointer = { x: pointer.x, y: pointer.y };
      let uniforms = this.use(this.programs.paint, this.current);
      this.texture(uniforms.u_prevPaintTexture, this.previous);
      this.texture(uniforms.u_lowPaintTexture, this.low, 1);
      gl.uniform2f(uniforms.u_paintTexelSize, 1 / this.current.width, 1 / this.current.height);
      gl.uniform2f(uniforms.u_scrollOffset, 0, 0);
      gl.uniform4fv(uniforms.u_drawFrom, from);
      gl.uniform4fv(uniforms.u_drawTo, this.draw);
      gl.uniform2fv(uniforms.u_vel, this.velocity);
      gl.uniform1f(uniforms.u_pushStrength, 25);
      gl.uniform3f(uniforms.u_dissipations, 0.975, 0.95, 0.8);
      gl.uniform1f(uniforms.u_curlScale, 0.02);
      gl.uniform1f(uniforms.u_curlStrength, 3);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      uniforms = this.use(this.programs.copy, this.low);
      this.texture(uniforms.u_texture, this.current);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      uniforms = this.use(this.programs.blur, this.blurred);
      this.texture(uniforms.u_texture, this.low);
      gl.uniform2f(uniforms.u_delta, 2 / this.low.width, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      uniforms = this.use(this.programs.blur, this.low);
      this.texture(uniforms.u_texture, this.blurred);
      gl.uniform2f(uniforms.u_delta, 0, 2 / this.low.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    update(time) {
      if (!this.available) { this.frame = 0; return; }
      if (time - this.lastMoveTime >= 1000) { this.clear(); return; }
      this.accumulator += this.previousTime ? Math.min(50, time - this.previousTime) : 1000 / 60;
      this.previousTime = time;
      while (this.accumulator >= 1000 / 60) {
        this.simulate();
        this.accumulator -= 1000 / 60;
      }
      const uniforms = this.use(this.programs.trail, null);
      this.texture(uniforms.u_screenPaintTexture, this.current);
      this.gl.uniform3fv(uniforms.u_background, this.background);
      this.gl.uniform1f(uniforms.u_opacity, Math.pow(Math.max(0, 1 - Math.max(0, time - this.lastMoveTime - 250) / 750), 2));
      this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
      this.frame = requestAnimationFrame(nextTime => this.update(nextTime));
    }
  }

  try { new ScreenPaint(); }
  catch (error) { console.warn('ScreenPaint:', error); }
})();
