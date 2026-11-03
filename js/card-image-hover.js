(() => {
  'use strict';

  const hoverDuration = 500;
  const hoverSegments = 24;
  const cameraDistance = 41.18;
  const cameraSlope = 2 * Math.tan(53.4 * Math.PI / 360);
  const hoverShader = `
    uniform vec2 u_viewport;
    uniform vec2 u_res;
    varying vec3 vFlat;
    const float CAMERA_DISTANCE = 41.18;
    const float CAMERA_SLOPE = 2.0 * tan(radians(53.4) * 0.5);

uniform float u_leanA; 
uniform float u_leanW; 
float leanRamp(float s) {
	s = clamp(s, -1.0, 1.0);
	return s * (1.5 - 0.5 * s * s);
}
float leanSlope(float s) {
	s = min(abs(s), 1.0);
	return 1.5 * (1.0 - s * s);
}
vec4 lean(vec4 w, float k) {
	if (u_leanW > 0.001 && k > 0.001) {
		w.z += u_leanA * leanRamp(w.x / u_leanW) * k;
	}
	return w;
}
const float SHEET_PI = 3.141592653589793;
const float SHEET_BANK = -0.16;
const float SHEET_DIAG = 0.03;
const float SHEET_WAVE = 0.0;
const float SHEET_WAVE_F = 0.8;
const float SHEET_WAVE_PH = 0.35;
const float SHEET_REAR_Y = 0.1;
const float SHEET_REAR_Z = 0.2;
const float SHEET_VTWIST = 1.8;
uniform float u_sheetW; 
uniform float u_sheetD; 
uniform float u_sheetT; 
uniform float u_sheetC; 
uniform float u_sheetP; 
uniform float u_sheetV; 
uniform float u_hover;  
uniform float u_dent;   
const float SHEET_TAIL = 1.0;
const float SHEET_SHIFT = -0.2;
float sheetQ(float wx) {
	return wx / max(u_sheetW, 0.0001) * u_sheetT + SHEET_SHIFT;
}
float sheetShape(float q) {
	return mix(1.0 - q * q, sin(SHEET_PI * q), u_sheetC) * exp(-SHEET_TAIL * q * q);
}
float sheetShapeSlope(float q) {
	float g = exp(-SHEET_TAIL * q * q);
	float bowl = -2.0 * q * (1.0 + SHEET_TAIL * (1.0 - q * q));
	float ess = SHEET_PI * cos(SHEET_PI * q) - 2.0 * SHEET_TAIL * q * sin(SHEET_PI * q);
	return mix(bowl, ess, u_sheetC) * g;
}
float sheetZ(float wx) {
	return -u_sheetD * sheetShape(sheetQ(wx));
}
float sheetRoll(float wx) {
	if (u_sheetW < 0.001) return 0.0;
	return SHEET_BANK * sheetShapeSlope(sheetQ(wx)) / SHEET_PI * u_sheetC * u_sheetP;
}
vec4 sheetWind(vec4 w) {
	float a = sheetRoll(w.x);
	if (u_sheetV > 0.001 && u_sheetW > 0.001 && u_sheetP > 0.001) {
		float qe = w.x / u_sheetW;
		a += SHEET_VTWIST * u_sheetV * smoothstep(0.3, 0.9, abs(qe)) * sign(qe) * u_sheetP;
	}
	if (abs(a) < 0.0001) return w;
	float s = sin(a);
	float c = cos(a);
	return vec4(w.x, w.y * c - w.z * s, w.y * s + w.z * c, w.w);
}
vec4 sheet(vec4 w) {
	w = sheetWind(w);
	w.z += sheetZ(w.x) * u_sheetP;
	if (u_sheetW > 0.001) {
		float qw = w.x / u_sheetW;
		w.y += SHEET_DIAG * w.x * u_sheetP;
		w.y += SHEET_WAVE * u_sheetW *
			sin(SHEET_PI * (qw * SHEET_WAVE_F + SHEET_WAVE_PH)) * u_sheetP;
		if (u_sheetV > 0.001) {
			float m = 1.0 - smoothstep(-1.0, 0.3, qw);
			w.y += SHEET_REAR_Y * u_sheetW * u_sheetV * m * u_sheetP;
			w.z += SHEET_REAR_Z * u_sheetW * u_sheetV * m * u_sheetP;
		}
	}
	return w;
}
float sheetDome(vec2 uv) {
	vec2 q = uv * 2.0 - 1.0;
	return (1.0 - q.x * q.x) * (1.0 - q.y * q.y);
}
float sheetShade(float wx, vec2 uv, float resY) {
	if (u_sheetD < 0.001) return 0.0;
	float d = u_sheetW > 0.001 && u_sheetP > 0.001
		? clamp((u_sheetD - sheetZ(wx)) / (2.0 * u_sheetD), 0.0, 1.0) * u_sheetP
		: 0.0;
	if (u_hover > 0.0001) {
		d += (u_hover * u_dent * resY * sheetDome(uv)) / (2.0 * u_sheetD);
	}
	return clamp(d, 0.0, 1.0);
}
float sheetOffset(float wx, vec2 uv, float resY) {
	float z = 0.0;
	if (u_sheetW > 0.001 && u_sheetP > 0.001 && u_sheetD > 0.001) z += sheetZ(wx) * u_sheetP;
	if (u_leanW > 0.001) z += u_leanA * leanRamp(wx / u_leanW) * u_sheetP;
	if (u_hover > 0.0001) z -= u_hover * u_dent * resY * sheetDome(uv);
	return z;
}
vec3 sheetNormal(float wx, vec2 uv, vec2 res) {
	float dzdx = 0.0;
	float dzdy = 0.0;
	if (u_sheetW > 0.001 && u_sheetP > 0.001 && u_sheetD > 0.001) {
		dzdx += -u_sheetD * sheetShapeSlope(sheetQ(wx)) * u_sheetT / u_sheetW * u_sheetP;
	}
	if (u_leanW > 0.001) {
		dzdx += (u_leanA / u_leanW) * leanSlope(wx / u_leanW) * u_sheetP;
	}
	if (u_hover > 0.0001) {
		vec2 q = uv * 2.0 - 1.0;
		float a = u_hover * u_dent;
		dzdx += 4.0 * a * res.y * q.x * (1.0 - q.y * q.y) / max(res.x, 0.0001);
		dzdy += 4.0 * a * q.y * (1.0 - q.x * q.x);
	}
	vec3 n = normalize(vec3(-dzdx, -dzdy, 1.0));
	float a = sheetRoll(wx);
	if (abs(a) > 0.0001) {
		float s = sin(a);
		float c = cos(a);
		n = vec3(n.x, n.y * c - n.z * s, n.y * s + n.z * c);
	}
	return n;
}
  `;

  const vertexMain = `
    if (u_hover > 0.0001) {
      vec2 cardUv = vec2(clamp(position.x, 0.0, 1.0), position.y);
      float padding = min(position.x, 0.0) * u_domPadding.x
                    + max(position.x - 1.0, 0.0) * u_domPadding.y;
      vec3 basePos = vec3(cardUv * u_domWH - u_domPivot + vec2(padding, 0.0), 0.0);
      v_uv = vec2(cardUv.x + padding / u_domWH.x, 1.0 - cardUv.y);
      float depth = u_hover * u_dent * u_res.y * sheetDome(cardUv);
      vec3 screenPos = getScreenPosition(basePos);
      vFlat = (screenPos + vec3(-u_viewport.x * 0.5, u_viewport.y * 0.5, 0.0))
            * (CAMERA_SLOPE * CAMERA_DISTANCE / u_viewport.y);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(screenPos, 1.0);
      gl_Position.w += depth / CAMERA_DISTANCE;
      return;
    }
    vFlat = (getScreenPosition(getBasePosition(position))
          + vec3(-u_viewport.x * 0.5, u_viewport.y * 0.5, 0.0))
          * (CAMERA_SLOPE * CAMERA_DISTANCE / u_viewport.y);
  `;

  const fragmentShader = `${hoverShader}
    uniform vec2 u_domXY;
    uniform vec2 u_domPivot;
    uniform vec3 u_position;
    uniform vec4 u_quaternion;

    vec2 cardHoverMaskUv(vec2 baseUv, vec2 screenUv, float rippleOffset) {
      if (u_hover <= 0.0001) return baseUv;
      vec2 offset = vec2(screenUv.x, 1.0 - screenUv.y) * u_viewport
                  - u_domXY - u_domPivot - u_position.xy;
      float sine = 2.0 * u_quaternion.z * u_quaternion.w;
      float cosine = 1.0 - 2.0 * u_quaternion.z * u_quaternion.z;
      vec2 local = vec2(cosine * offset.x + sine * offset.y, -sine * offset.x + cosine * offset.y);
      return vec2(0.5 + local.x / u_domWH.x - rippleOffset, 0.5 - local.y / u_domWH.y);
    }

    uniform vec3 cameraPosition;
    uniform float u_shade;
    uniform float u_shadeS;


const vec3 LIGHT_DIR = normalize(vec3(-0.4, 0.5, 1.0));
const float LIGHT_GLOSS = 48.0;
const float LIGHT_SPEC = 0.35;
const float LIGHT_DIFF = 0.12;
vec3 sheetLit(vec3 col, vec3 n, vec3 v, float amt) {
	if (amt < 0.001) return col;
	float d = dot(n, LIGHT_DIR) * 0.5 + 0.5;
	col *= 1.0 - LIGHT_DIFF * amt * (1.0 - d);
	vec3 h = normalize(LIGHT_DIR + v);
	return col + pow(max(dot(n, h), 0.0), LIGHT_GLOSS) * LIGHT_SPEC * amt;
}

    vec3 applyCardLighting(vec3 color, vec2 vUv) {
      vec4 tex = vec4(color, 1.0);
      if (u_shade > 0.001) {
		float depth = sheetShade(vFlat.x, vUv, u_res.y);
		tex.rgb = mix(tex.rgb, vec3(0.059), u_shade * 0.8 * pow(depth, u_shadeS));
		vec3 p = vFlat + vec3(0.0, 0.0, sheetOffset(vFlat.x, vUv, u_res.y));
		tex.rgb = sheetLit(
			tex.rgb,
			sheetNormal(vFlat.x, vUv, u_res),
			normalize(cameraPosition - p),
			u_shade
		);
	}
      return tex.rgb;
    }

  `;

  const vertices = [0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1];
  for (let row = 0; row < hoverSegments; row++) {
    const top = row / hoverSegments;
    const bottom = (row + 1) / hoverSegments;
    for (let column = -1; column <= hoverSegments; column++) {
      const left = column < 0 ? -1 : column / hoverSegments;
      const right = column === hoverSegments ? 2 : (column + 1) / hoverSegments;
      vertices.push(left, top, right, top, left, bottom, left, bottom, right, top, right, bottom);
    }
  }
  const vertexData = new Float32Array(vertices);

  function amountAt(tween, time) {
    if (!tween) return 0;
    const progress = Math.max(0, Math.min(1, (time - tween.start) / hoverDuration));
    const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
    return tween.from + (tween.to - tween.from) * eased;
  }

  window.createCardImageHover = (covers, schedule, canHover) => {
    let tweens = new WeakMap();
    let gl;
    let amountUniform;
    let viewportUniform;
    let surfaceUniform;
    let sheetWidthUniform;
    let sheetDepthUniform;
    let worldScale = 1;

    for (const cover of covers) {
      const setHover = (event, to) => {
        if (event.pointerType !== 'mouse' || !canHover()) return;
        const start = performance.now();
        tweens.set(cover, { from: amountAt(tweens.get(cover), start), to, start });
        schedule();
      };
      cover.box.addEventListener('pointerenter', event => setHover(event, 1));
      cover.box.addEventListener('pointerleave', event => setHover(event, 0));
    }

    return {
      vertexShader: hoverShader,
      vertexMain,
      fragmentShader,
      maskUv: 'cardHoverMaskUv(baseUv, screenUv, rippleOffset)',
      fragmentColor: 'color = applyCardLighting(color, v_uv);',
      vertices: vertexData,
      init(context, program) {
        gl = context;
        amountUniform = gl.getUniformLocation(program, 'u_hover');
        viewportUniform = gl.getUniformLocation(program, 'u_viewport');
        surfaceUniform = gl.getUniformLocation(program, 'u_res');
        sheetWidthUniform = gl.getUniformLocation(program, 'u_sheetW');
        sheetDepthUniform = gl.getUniformLocation(program, 'u_sheetD');
        gl.uniform1f(gl.getUniformLocation(program, 'u_dent'), 0.1);
        gl.uniform1f(gl.getUniformLocation(program, 'u_shade'), 1);
        gl.uniform1f(gl.getUniformLocation(program, 'u_shadeS'), 1);
        gl.uniform1f(gl.getUniformLocation(program, 'u_sheetT'), 1.15);
        gl.uniform1f(gl.getUniformLocation(program, 'u_sheetC'), 1);
        gl.uniform1f(gl.getUniformLocation(program, 'u_sheetP'), 0);
        gl.uniform1f(gl.getUniformLocation(program, 'u_sheetV'), 0);
        gl.uniform1f(gl.getUniformLocation(program, 'u_leanA'), 0);
        gl.uniform1f(gl.getUniformLocation(program, 'u_leanW'), 0);
        gl.uniform3f(gl.getUniformLocation(program, 'cameraPosition'), 0, 0, cameraDistance);
      },
      resize(width, height) {
        worldScale = cameraSlope * cameraDistance / height;
        gl.uniform2f(viewportUniform, width, height);
        gl.uniform1f(sheetWidthUniform, width * worldScale * 0.5);
        gl.uniform1f(sheetDepthUniform, width * worldScale * 0.5 * 0.2);
      },
      reset() {
        tweens = new WeakMap();
      },
      draw(cover, time) {
        const tween = tweens.get(cover);
        const amount = amountAt(tween, time);
        gl.uniform1f(amountUniform, amount);
        gl.uniform2f(surfaceUniform, Math.ceil(cover.rect.width) * worldScale, Math.ceil(cover.rect.height) * worldScale);
        if (amount > 0.0001) gl.drawArrays(gl.TRIANGLES, 6, vertexData.length / 2 - 6);
        else gl.drawArrays(gl.TRIANGLES, 0, 6);
        return Boolean(tween && time < tween.start + hoverDuration);
      }
    };
  };
})();
