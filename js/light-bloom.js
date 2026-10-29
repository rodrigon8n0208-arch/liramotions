/* ============================================================
   Light Bloom — componente do Originkit (originkit: light-bloom)
   Portado do componente React para JS puro, porque este site não
   usa React nem build. Os shaders (VERT_SRC / FRAG_SRC), os valores
   padrão e a lógica de render/ponteiro são os mesmos do original;
   só o invólucro React (useRef/useEffect/JSX) virou uma função.

   Uso: createLightBloom(elementoPai, { ...mesmas props do React })
   ============================================================ */
(() => {
  const MAX_DPR = 2;

  const VERT_SRC = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

  const FRAG_SRC = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2  uRes;
uniform float uTime;
uniform int   uStyle;
uniform int   uDirection;
uniform vec3  uBg;
uniform vec3  uBase;
uniform vec3  uAccent;
uniform float uRise;
uniform float uSpread;
uniform float uOriginX;
uniform float uLift;
uniform float uShaftCount;
uniform float uShaftAmount;
uniform float uShaftDrift;
uniform float uGrain;
uniform float uVignette;

float h11(float x) { return fract(sin(x * 127.1) * 43758.5453123); }

float vn1(float x) {
    float i = floor(x);
    float f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(h11(i), h11(i + 1.0), f);
}

void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    float aspect = uRes.x / uRes.y;
    float t = uTime;

    float breathe = 1.0 + 0.06 * sin(t * 0.35);

    float depth = mix(0.05, 1.20, uSpread);
    vec2 lp;
    float acrossUv;
    float edgeCoord;
    if (uDirection == 1) {
        lp = vec2(uOriginX, 1.0 + depth);
        acrossUv = uv.x;
        edgeCoord = 1.0 - uv.y;
    } else if (uDirection == 2) {
        lp = vec2(-depth / aspect, uOriginX);
        acrossUv = uv.y;
        edgeCoord = uv.x;
    } else if (uDirection == 3) {
        lp = vec2(1.0 + depth / aspect, uOriginX);
        acrossUv = uv.y;
        edgeCoord = 1.0 - uv.x;
    } else {
        lp = vec2(uOriginX, -depth);
        acrossUv = uv.x;
        edgeCoord = uv.y;
    }
    vec2 q = vec2((uv.x - lp.x) * aspect, uv.y - lp.y);
    float d = length(q);

    float k = mix(9.0, 1.4, uRise) / breathe;

    float g = exp(-d * k) / max(exp(-depth * k), 1e-4);
    g = clamp(g, 0.0, 1.0);

    if (uStyle == 1) {
        float sx = acrossUv * uShaftCount;
        float dr = t * uShaftDrift;
        float s = vn1(sx + dr) * 0.6 + vn1(sx * 2.17 - dr * 0.8) * 0.4;

        float mask = smoothstep(0.0, 0.35, edgeCoord);
        g *= mix(1.0, 0.45 + 1.25 * s, uShaftAmount * mask);
    }

    g = clamp(g * (1.0 + uLift * 0.25), 0.0, 1.0);

    vec3 col = mix(uBg, uBase, smoothstep(0.0, 0.68, g));

    col = mix(col, uAccent, smoothstep(0.58, 0.99, g));

    vec2 vc = uv - 0.5;
    vc.x *= aspect;
    col *= 1.0 - uVignette * smoothstep(0.35, 0.95, length(vc));

    float rnd = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    col += (rnd - 0.5) * (uGrain * 0.06 + 1.5 / 255.0);

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

  function parseColor(input, fb) {
    if (!input) return fb;
    const str = String(input).trim();
    if (str.charAt(0) === "#") {
      let hex = str.slice(1);
      if (hex.length === 3 || hex.length === 4) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
      }
      if (hex.length >= 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return [r / 255, g / 255, b / 255];
      }
      return fb;
    }
    const m = str.match(/[\d.]+/g);
    if (m && m.length >= 3) {
      return [
        Math.min(255, parseFloat(m[0])) / 255,
        Math.min(255, parseFloat(m[1])) / 255,
        Math.min(255, parseFloat(m[2])) / 255,
      ];
    }
    return fb;
  }

  function num(v, fb) {
    return typeof v === "number" && isFinite(v) ? v : fb;
  }

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error("LightBloom shader:", gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  const D_LIGHT = { rise: 79, spread: 72 };
  const D_SHAFTS = { count: 17, amount: 70, drift: 79 };
  const D_FINISH = { grain: 12, vignette: 25 };

  // Equivalente ao componente React LightBloom(props)
  function createLightBloom(parent, props = {}) {
    const {
      style,
      variant = "shafts",
      direction = "bottom",
      background = "#000000",
      baseColor = "#6B2BF5",
      accentColor = "#EFE6FF",
      speed = 100,
      hover = 114,
      light,
      shafts,
      finish,
      width,
      height,
      pointerTarget, // adição: elemento que recebe o ponteiro (o original usa o próprio canvas)
      paused,        // adição: função que diz se deve pausar (fora da tela / movimento reduzido)
    } = props;

    const L = { ...D_LIGHT, ...(light || {}) };
    const S = { ...D_SHAFTS, ...(shafts || {}) };
    const F = { ...D_FINISH, ...(finish || {}) };

    // <div> + <canvas> do JSX original
    const root = document.createElement("div");
    Object.assign(root.style, {
      position: "relative",
      overflow: "hidden",
      background,
      minWidth: "1200px",
      minHeight: "800px",
      width: typeof width === "number" && width > 0 ? width + "px" : "100%",
      height: typeof height === "number" && height > 0 ? height + "px" : "100%",
      ...(style || {}),
    });
    const canvas = document.createElement("canvas");
    Object.assign(canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%", display: "block" });
    root.appendChild(canvas);
    parent.appendChild(root);

    const size = { w: num(width, 0), h: num(height, 0) };

    const v = {
      style: variant === "shafts" ? 1 : 0,
      direction: direction === "top" ? 1 : direction === "left" ? 2 : direction === "right" ? 3 : 0,
      bg: parseColor(background, [0, 0, 0]),
      base: parseColor(baseColor, [0.42, 0.17, 0.96]),
      accent: parseColor(accentColor, [0.94, 0.9, 1]),
      rise: num(L.rise, 79) / 100,
      spread: num(L.spread, 72) / 100,

      speed: num(speed, 50) / 50,
      hover: num(hover, 100) / 100,
      count: Math.max(1, num(S.count, 17)),
      amount: num(S.amount, 70) / 100,
      drift: num(S.drift, 79) / 100,
      grain: num(F.grain, 12) / 100,
      vignette: num(F.vignette, 25) / 100,
    };

    const ptr = { x: 0.5, target: 0.5, on: 0, onTarget: 0 };

    const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
    if (!gl) {
      console.error("LightBloom: WebGL unavailable");
      return null;
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    if (!prog) return null;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("LightBloom link:", gl.getProgramInfoLog(prog));
      return null;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const u = {
      res: gl.getUniformLocation(prog, "uRes"),
      time: gl.getUniformLocation(prog, "uTime"),
      style: gl.getUniformLocation(prog, "uStyle"),
      direction: gl.getUniformLocation(prog, "uDirection"),
      bg: gl.getUniformLocation(prog, "uBg"),
      base: gl.getUniformLocation(prog, "uBase"),
      accent: gl.getUniformLocation(prog, "uAccent"),
      rise: gl.getUniformLocation(prog, "uRise"),
      spread: gl.getUniformLocation(prog, "uSpread"),
      originX: gl.getUniformLocation(prog, "uOriginX"),
      lift: gl.getUniformLocation(prog, "uLift"),
      count: gl.getUniformLocation(prog, "uShaftCount"),
      amount: gl.getUniformLocation(prog, "uShaftAmount"),
      drift: gl.getUniformLocation(prog, "uShaftDrift"),
      grain: gl.getUniformLocation(prog, "uGrain"),
      vignette: gl.getUniformLocation(prog, "uVignette"),
    };

    let raf = 0;
    let last = performance.now();
    let clock = 0;

    const render = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // adição: não gasta GPU fora da tela (o original renderiza sempre)
      if (paused && paused()) {
        raf = requestAnimationFrame(render);
        return;
      }

      clock = (clock + dt * v.speed) % 3600;

      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const cw = size.w || canvas.clientWidth || 1200;
      const ch = size.h || canvas.clientHeight || 800;
      const bw = Math.max(1, Math.round(cw * dpr));
      const bh = Math.max(1, Math.round(ch * dpr));
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
        gl.viewport(0, 0, bw, bh);
      }

      const p = ptr;
      const kx = 1 - Math.exp(-8 * dt);
      const ko = 1 - Math.exp(-5 * dt);
      p.x += (p.target - p.x) * kx;
      p.on += (p.onTarget - p.on) * ko;

      const travel = Math.min(1, v.hover);
      const originX = 0.5 + (p.x - 0.5) * travel * p.on;

      gl.uniform2f(u.res, bw, bh);
      gl.uniform1f(u.time, clock);
      gl.uniform1i(u.style, v.style);
      gl.uniform1i(u.direction, v.direction);
      gl.uniform3f(u.bg, v.bg[0], v.bg[1], v.bg[2]);
      gl.uniform3f(u.base, v.base[0], v.base[1], v.base[2]);
      gl.uniform3f(u.accent, v.accent[0], v.accent[1], v.accent[2]);
      gl.uniform1f(u.rise, v.rise);
      gl.uniform1f(u.spread, v.spread);
      gl.uniform1f(u.originX, originX);
      gl.uniform1f(u.lift, v.hover * p.on);
      gl.uniform1f(u.count, v.count);
      gl.uniform1f(u.amount, v.amount);
      gl.uniform1f(u.drift, v.drift);
      gl.uniform1f(u.grain, v.grain);
      gl.uniform1f(u.vignette, v.vignette);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(render);
    };

    const target = pointerTarget || canvas;
    const onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      if (v.direction === 2 || v.direction === 3) {
        const h = canvas.offsetHeight || 1;
        const scale = r.height > 0 ? h / r.height : 1;
        ptr.target = Math.max(0, Math.min(1, 1 - ((e.clientY - r.top) * scale) / h));
      } else {
        const w = canvas.offsetWidth || 1;
        const scale = r.width > 0 ? w / r.width : 1;
        ptr.target = Math.max(0, Math.min(1, ((e.clientX - r.left) * scale) / w));
      }
    };
    const onEnter = () => { ptr.onTarget = 1; };
    const onLeave = () => { ptr.onTarget = 0; };

    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerenter", onEnter);
    target.addEventListener("pointerleave", onLeave);
    raf = requestAnimationFrame(render);

    return {
      root,
      canvas,
      destroy() {
        cancelAnimationFrame(raf);
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerenter", onEnter);
        target.removeEventListener("pointerleave", onLeave);
        root.remove();
      },
    };
  }

  window.createLightBloom = createLightBloom;

  /* ---------- Montagem no hero da liramotions ---------- */
  const mount = document.querySelector("[data-light-bloom]");
  if (!mount) return;

  const hero = mount.closest(".hero");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let heroVisible = true;
  if ("IntersectionObserver" in window && hero) {
    new IntersectionObserver(([entry]) => { heroVisible = entry.isIntersecting; }).observe(hero);
  }
  let drewOnce = false;

  const bloom = createLightBloom(mount, {
    variant: "shafts",
    direction: "bottom",
    background: "#030a07",
    baseColor: "#14a86e",
    accentColor: "#d2ffe9",
    speed: 100,
    hover: 114,
    light: { rise: 79, spread: 72 },
    shafts: { count: 17, amount: 70, drift: 79 },
    finish: { grain: 12, vignette: 25 },
    // o hero é responsivo: tira o tamanho mínimo de 1200×800 do original
    style: { position: "absolute", inset: "0", minWidth: "0", minHeight: "0" },
    pointerTarget: hero,
    paused: () => {
      if (document.hidden || !heroVisible) return true;
      if (reduceMotion) {
        if (drewOnce) return true;
        drewOnce = true;
      }
      return false;
    },
  });

  if (bloom) mount.classList.add("is-ready");
})();
