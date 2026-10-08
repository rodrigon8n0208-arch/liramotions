/* ============================================================
   liramotions — partículas em fluxo
   Rastros de luz verde que seguem um campo de vento suave.
   - reagem ao cursor/toque (empurram e giram em volta)
   - aceleram e sobem junto com o scroll
   - orbitam a chamada de contato quando ela está na tela
   A quantidade se ajusta ao tamanho da tela e cai sozinha em
   aparelhos que não aguentam 60 fps.
   ============================================================ */
(() => {
  const canvas = document.getElementById("particles");
  if (!canvas || !canvas.getContext) return;

  const ctx = canvas.getContext("2d");
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  const PALETTE = [
    [46, 229, 157],  // esmeralda
    [166, 247, 208], // menta
    [24, 190, 120],  // verde médio
    [214, 255, 236], // quase branco
  ];

  // main.js escreve aqui: { x, y, rx, ry, strength }
  const api = (window.liraParticles = { attractor: null, burst });

  let W = 0;
  let H = 0;
  let streaks = [];
  let dust = [];
  let trailLen = 24;
  let quality = 1;
  let running = false;
  let rafId = 0;
  let t = 0;
  let last = 0;
  let lastScroll = window.scrollY;
  let scrollVel = 0;
  let slowFrames = 0;
  let frameCount = 0;

  const pointer = { x: -9999, y: -9999, active: false };

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // Brilhos pré-renderizados: bem mais baratos que shadowBlur
  const sprites = PALETTE.map(([r, g, b]) => {
    const size = 64;
    const s = document.createElement("canvas");
    s.width = s.height = size;
    const c = s.getContext("2d");
    const grd = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, `rgba(${r},${g},${b},1)`);
    grd.addColorStop(0.22, `rgba(${r},${g},${b},0.5)`);
    grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
    c.fillStyle = grd;
    c.fillRect(0, 0, size, size);
    return s;
  });

  /* ---------- criação ---------- */

  function makeStreak(p = {}) {
    p.x = rand(-20, W + 20);
    p.y = rand(-20, H + 20);
    p.vx = 0;
    p.vy = 0;
    p.z = rand(0.35, 1); // profundidade: mais perto = mais rápido e mais forte
    p.speed = rand(0.85, 1.9) * (0.55 + p.z * 0.6);
    p.width = rand(0.7, 1.7) * p.z;
    p.color = (Math.random() * PALETTE.length) | 0;
    p.glow = Math.random() < 0.35;
    p.life = 0;
    p.maxLife = rand(280, 640);
    p.hist = [];
    return p;
  }

  function makeDust(p = {}) {
    p.x = rand(0, W);
    p.y = rand(0, H);
    p.z = rand(0.15, 1);
    p.bokeh = Math.random() < 0.07;
    p.r = p.bokeh ? rand(16, 40) : rand(0.6, 1.6) * (0.5 + p.z);
    p.a = p.bokeh ? rand(0.035, 0.08) : rand(0.12, 0.45);
    p.tw = rand(0.6, 2.2);
    p.ph = rand(0, Math.PI * 2);
    p.color = (Math.random() * PALETTE.length) | 0;
    p.drift = rand(-0.12, 0.12);
    return p;
  }

  function populate() {
    const area = W * H;
    const small = W < 700;
    const nStreaks = Math.round(clamp(area / (small ? 6500 : 9000), 40, 170) * quality);
    const nDust = Math.round(clamp(area / 13000, 30, 110) * quality);
    trailLen = small ? 16 : 24;

    while (streaks.length < nStreaks) streaks.push(makeStreak());
    streaks.length = nStreaks;
    while (dust.length < nDust) dust.push(makeDust());
    dust.length = nDust;
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // No celular, a barra de endereço muda só a altura: não recria tudo
    const widthChanged = w !== W;
    W = w;
    H = h;
    const dpr = Math.min(window.devicePixelRatio || 1, W < 700 ? 1.5 : 1.75);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (widthChanged) populate();
    if (!running) drawStatic();
  }

  /* ---------- campo de vento ---------- */

  function flow(x, y) {
    const s = 0.0017;
    const tt = t * 0.0035;
    return (
      Math.sin(x * s + tt) * 1.1 +
      Math.cos(y * s * 1.25 - tt * 0.8) * 1.1 +
      Math.sin((x + y) * s * 0.55 + tt * 0.5) * 0.9
    );
  }

  /* ---------- atualização ---------- */

  function updateStreak(p, dt, ease) {
    // direção base: sobe na diagonal, com redemoinhos do campo
    const a = -0.8 + flow(p.x, p.y) * 0.7;
    let tx = Math.cos(a) * p.speed;
    let ty = Math.sin(a) * p.speed;

    // scroll: o conteúdo sobe e as partículas acompanham (parallax)
    ty -= scrollVel * 0.24 * p.z;

    // cursor: empurra e gira em volta do ponteiro
    if (pointer.active) {
      const dx = p.x - pointer.x;
      const dy = p.y - pointer.y;
      const d2 = dx * dx + dy * dy;
      const R = 160;
      if (d2 < R * R) {
        const d = Math.sqrt(d2) || 1;
        const f = 1 - d / R;
        tx += (dx / d) * f * 3 + (-dy / d) * f * 2.4;
        ty += (dy / d) * f * 3 + (dx / d) * f * 2.4;
      }
    }

    // contato: órbita elíptica em volta do bloco de texto
    const at = api.attractor;
    if (at && at.strength > 0.01) {
      const dx = at.x - p.x;
      const dy = at.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = dx / at.rx;
      const ny = dy / at.ry;
      const ring = clamp(Math.sqrt(nx * nx + ny * ny) - 1, -1, 1.5);
      const s = at.strength;
      tx = tx * (1 - s * 0.6) + (dx / d) * ring * s * 2.2 - (dy / d) * s * 2.4;
      ty = ty * (1 - s * 0.6) + (dy / d) * ring * s * 2.2 + (dx / d) * s * 2.4;
    }

    p.vx += (tx - p.vx) * ease;
    p.vy += (ty - p.vy) * ease;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life += dt;

    p.hist.push(p.x, p.y);
    if (p.hist.length > trailLen * 2) p.hist.splice(0, 2);

    // saiu da tela: volta pelo lado oposto, sem riscar a tela inteira
    const m = 40;
    if (p.x < -m || p.x > W + m || p.y < -m || p.y > H + m) {
      if (p.y < -m) { p.y = H + m * 0.5; p.x = rand(0, W); }
      else if (p.y > H + m) { p.y = -m * 0.5; p.x = rand(0, W); }
      else if (p.x < -m) { p.x = W + m * 0.5; }
      else { p.x = -m * 0.5; }
      p.hist.length = 0;
    }

    if (p.life > p.maxLife) makeStreak(p);
  }

  /* ---------- desenho ---------- */

  function drawStreak(p) {
    const h = p.hist;
    const n = h.length;
    if (n < 6) return;

    const fadeIn = Math.min(1, p.life / 50);
    const fadeOut = Math.min(1, (p.maxLife - p.life) / 70);
    const alpha = fadeIn * fadeOut * (0.22 + 0.5 * p.z);
    if (alpha <= 0.01) return;

    const [r, g, b] = PALETTE[p.color];
    const grd = ctx.createLinearGradient(h[0], h[1], h[n - 2], h[n - 1]);
    grd.addColorStop(0, `rgba(${r},${g},${b},0)`);
    grd.addColorStop(1, `rgba(${r},${g},${b},${alpha.toFixed(3)})`);

    ctx.strokeStyle = grd;
    ctx.lineWidth = p.width;
    ctx.beginPath();
    ctx.moveTo(h[0], h[1]);
    for (let i = 2; i < n; i += 2) ctx.lineTo(h[i], h[i + 1]);
    ctx.stroke();

    if (p.glow) {
      const s = 8 + p.z * 14;
      ctx.globalAlpha = Math.min(1, alpha * 1.4);
      ctx.drawImage(sprites[p.color], p.x - s / 2, p.y - s / 2, s, s);
      ctx.globalAlpha = 1;
    }
  }

  function drawDust(p, scrollY, twinkle) {
    // cada camada anda numa velocidade diferente com o scroll
    const span = H + 100;
    const y = (((p.y - scrollY * p.z * 0.22) % span) + span) % span - 50;
    const a = twinkle ? p.a * (0.55 + 0.45 * Math.sin(t * 0.02 * p.tw + p.ph)) : p.a;
    const s = p.bokeh ? p.r * 2 : p.r * 5;
    ctx.globalAlpha = a;
    ctx.drawImage(sprites[p.color], p.x - s / 2, y - s / 2, s, s);
  }

  function drawStatic() {
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    const sy = window.scrollY;
    for (const p of dust) drawDust(p, sy, false);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  function frame(now) {
    rafId = requestAnimationFrame(frame);

    const dt = clamp((now - last) / 16.667, 0.25, 3);
    last = now;
    t += dt;

    const sy = window.scrollY;
    const raw = clamp((sy - lastScroll) / dt, -90, 90);
    lastScroll = sy;
    scrollVel += (raw - scrollVel) * 0.2;

    const ease = 1 - Math.pow(1 - 0.075, dt);

    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";

    for (const p of dust) {
      p.x += p.drift * dt;
      if (p.x < -50) p.x = W + 50;
      else if (p.x > W + 50) p.x = -50;
      drawDust(p, sy, true);
    }
    ctx.globalAlpha = 1;

    for (const p of streaks) {
      updateStreak(p, dt, ease);
      drawStreak(p);
    }

    ctx.globalCompositeOperation = "source-over";

    // Qualidade adaptativa: se muitos quadros passam de ~35 ms, reduz
    frameCount++;
    if (dt > 1.9) slowFrames++;
    if (frameCount >= 150) {
      if (slowFrames > 60 && quality > 0.4) {
        quality *= 0.7;
        populate();
      }
      frameCount = 0;
      slowFrames = 0;
    }
  }

  function start() {
    if (running || motionQuery.matches || document.hidden) return;
    running = true;
    last = performance.now();
    lastScroll = window.scrollY;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  /* Impulso: espalha as partículas a partir de um ponto (clique/toque) */
  function burst(x, y, power = 1) {
    if (!running) return;
    const R = 240;
    for (const p of streaks) {
      const dx = p.x - x;
      const dy = p.y - y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d < R) {
        const f = (1 - d / R) * 12 * power;
        p.vx += (dx / d) * f;
        p.vy += (dy / d) * f;
      }
    }
  }

  /* ---------- eventos ---------- */

  let resizeRaf = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(resize);
  });

  window.addEventListener("pointermove", (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
  }, { passive: true });

  window.addEventListener("pointerdown", (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
    burst(e.clientX, e.clientY, e.pointerType === "mouse" ? 0.6 : 0.9);
  }, { passive: true });

  window.addEventListener("touchmove", (e) => {
    const touch = e.touches[0];
    if (!touch) return;
    pointer.x = touch.clientX;
    pointer.y = touch.clientY;
    pointer.active = true;
  }, { passive: true });

  const release = (e) => {
    if (!e || e.pointerType !== "mouse") pointer.active = false;
  };
  window.addEventListener("pointerup", release, { passive: true });
  window.addEventListener("pointercancel", release, { passive: true });
  window.addEventListener("touchend", () => { pointer.active = false; }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => { pointer.active = false; });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });

  const onMotionChange = () => {
    if (motionQuery.matches) {
      stop();
      drawStatic();
    } else {
      start();
    }
  };
  if (motionQuery.addEventListener) motionQuery.addEventListener("change", onMotionChange);
  else if (motionQuery.addListener) motionQuery.addListener(onMotionChange);

  // Com movimento reduzido, o fundo fica parado mas acompanha o scroll
  window.addEventListener("scroll", () => {
    if (!running) drawStatic();
  }, { passive: true });

  resize();
  start();
})();
