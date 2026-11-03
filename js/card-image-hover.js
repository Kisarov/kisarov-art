(() => {
  'use strict';

  const hoverDuration = 500;
  const hoverSegments = 24;
  const hoverShader = `
    uniform float u_cardHover;
    uniform vec2 u_viewport;
    const float CARD_DENT = 0.1;
    const float CAMERA_SLOPE = 2.0 * tan(radians(53.4) * 0.5);

    float sheetDome(vec2 uv) {
      vec2 q = uv * 2.0 - 1.0;
      return (1.0 - q.x * q.x) * (1.0 - q.y * q.y);
    }
  `;

  const vertexMain = `
    if (u_cardHover > 0.0001) {
      vec2 cardUv = vec2(clamp(position.x, 0.0, 1.0), position.y);
      float padding = min(position.x, 0.0) * u_domPadding.x
                    + max(position.x - 1.0, 0.0) * u_domPadding.y;
      vec3 basePos = vec3(cardUv * u_domWH - u_domPivot + vec2(padding, 0.0), 0.0);
      v_uv = vec2(cardUv.x + padding / u_domWH.x, 1.0 - cardUv.y);
      float depth = u_cardHover * CARD_DENT * u_domWH.y * sheetDome(cardUv);
      vec3 screenPos = getScreenPosition(basePos);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(screenPos, 1.0);
      gl_Position.w += depth * CAMERA_SLOPE / u_viewport.y;
      return;
    }
  `;

  const fragmentShader = `${hoverShader}
    uniform vec2 u_domXY;
    uniform vec2 u_domPivot;
    uniform vec3 u_position;
    uniform vec4 u_quaternion;

    vec2 cardHoverMaskUv(vec2 baseUv, vec2 screenUv, float rippleOffset) {
      if (u_cardHover <= 0.0001) return baseUv;
      vec2 offset = vec2(screenUv.x, 1.0 - screenUv.y) * u_viewport
                  - u_domXY - u_domPivot - u_position.xy;
      float sine = 2.0 * u_quaternion.z * u_quaternion.w;
      float cosine = 1.0 - 2.0 * u_quaternion.z * u_quaternion.z;
      vec2 local = vec2(cosine * offset.x + sine * offset.y, -sine * offset.x + cosine * offset.y);
      return vec2(0.5 + local.x / u_domWH.x - rippleOffset, 0.5 - local.y / u_domWH.y);
    }

    const vec3 LIGHT_DIR = normalize(vec3(-0.4, 0.5, 1.0));
    const float LIGHT_GLOSS = 48.0;
    const float LIGHT_SPEC = 0.35;
    const float LIGHT_DIFF = 0.12;

    vec3 sheetLit(vec3 color, vec3 normal, vec3 view) {
      float diffuse = dot(normal, LIGHT_DIR) * 0.5 + 0.5;
      color *= 1.0 - LIGHT_DIFF * (1.0 - diffuse);
      vec3 halfway = normalize(LIGHT_DIR + view);
      return color + pow(max(dot(normal, halfway), 0.0), LIGHT_GLOSS) * LIGHT_SPEC;
    }

    vec3 shadeCardHover(vec3 color, vec2 uv, vec2 screenUv) {
      uv = clamp(uv, 0.0, 1.0);
      vec2 q = uv * 2.0 - 1.0;
      float amount = u_cardHover * CARD_DENT;
      float dzdx = 4.0 * amount * u_domWH.y * q.x * (1.0 - q.y * q.y) / u_domWH.x;
      float dzdy = 4.0 * amount * q.y * (1.0 - q.x * q.x);
      vec3 normal = normalize(vec3(-dzdx, -dzdy, 1.0));
      vec3 view = normalize(vec3((0.5 - screenUv) * u_viewport / u_viewport.y, 1.0 / CAMERA_SLOPE));
      float depth = clamp(amount * u_domWH.y * sheetDome(uv) / (u_viewport.x * 0.2), 0.0, 1.0);
      vec3 shaded = mix(color, vec3(0.059), 0.8 * depth);
      return color + sheetLit(shaded, normal, view) - sheetLit(color, vec3(0.0, 0.0, 1.0), view);
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
      fragmentColor: 'if (u_cardHover > 0.0001) color = shadeCardHover(color, v_uv, screenUv);',
      vertices: vertexData,
      init(context, program) {
        gl = context;
        amountUniform = gl.getUniformLocation(program, 'u_cardHover');
        viewportUniform = gl.getUniformLocation(program, 'u_viewport');
      },
      resize(width, height) {
        gl.uniform2f(viewportUniform, width, height);
      },
      reset() {
        tweens = new WeakMap();
      },
      draw(cover, time) {
        const tween = tweens.get(cover);
        const amount = amountAt(tween, time);
        gl.uniform1f(amountUniform, amount);
        if (amount > 0.0001) gl.drawArrays(gl.TRIANGLES, 6, vertexData.length / 2 - 6);
        else gl.drawArrays(gl.TRIANGLES, 0, 6);
        return Boolean(tween && time < tween.start + hoverDuration);
      }
    };
  };
})();
