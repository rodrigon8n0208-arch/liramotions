/* ============================================================
   liramotions — interações
   1. títulos em palavras     5. loop de scroll (hero, parallax,
   2. scroll suave (Lenis)       faixas, etapas, órbita)
   3. entrada do hero         6. luz nos cards
   4. revelação no scroll     7. player de vídeo
   ============================================================ */
(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const yearEl = $("[data-year]");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ---------- 1. Títulos divididos em palavras ---------- */

  // Percorre o título mantendo os elementos internos (ex.: <em class="accent">)
  // e embrulha cada palavra numa máscara. SVGs e [data-nosplit] passam intactos.
  function splitWords(el, startIndex = 0) {
    let index = startIndex;

    function walk(source, target) {
      Array.from(source.childNodes).forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          node.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) {
              target.appendChild(document.createTextNode(" "));
              return;
            }
            const outer = document.createElement("span");
            outer.className = "w";
            const inner = document.createElement("span");
            inner.className = "w__i";
            inner.textContent = part;
            inner.style.setProperty("--i", index++);
            outer.appendChild(inner);
            target.appendChild(outer);
          });
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.namespaceURI !== "http://www.w3.org/1999/xhtml" || node.hasAttribute("data-nosplit")) {
            target.appendChild(node);
            return;
          }
          const copy = node.cloneNode(false);
          walk(node, copy);
          copy.classList.add("is-split");
          target.appendChild(copy);
        }
      });
    }

    const frag = document.createDocumentFragment();
    walk(el, frag);
    el.textContent = "";
    el.appendChild(frag);
    el.classList.add("is-split");
    return index - startIndex;
  }

  const heroTitle = $(".hero__title");
  const heroParts = $$("[data-split]", heroTitle);
  let wordIndex = 0;
  heroParts.forEach((el) => {
    wordIndex += splitWords(el, wordIndex);
    el.style.setProperty("--base", "120ms");
  });
  heroTitle.classList.add("is-ready");

  const sectionTitles = $$("[data-split]").filter((el) => !heroTitle.contains(el));
  sectionTitles.forEach((el) => splitWords(el));

  /* ---------- 2. Scroll suave ---------- */

  let lenis = null;
  if (!reduceMotion && typeof window.Lenis === "function") {
    lenis = new window.Lenis({ lerp: 0.1, smoothWheel: true });
  }

  // Âncoras: o deslocamento da barra vem do scroll-margin-top no CSS
  document.addEventListener("click", (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const hash = link.getAttribute("href");
    if (hash.length < 2) return;
    const target = document.querySelector(hash);
    if (!target) return;
    e.preventDefault();

    // Fecha o menu do celular antes de rolar (ele trava o scroll)
    closeMenu(false);

    const toTop = hash === "#topo";
    if (lenis) {
      lenis.scrollTo(toTop ? 0 : target, { duration: 1.4 });
    } else if (toTop) {
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    } else {
      target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    }

    // Leva o foco junto, para quem navega pelo teclado
    if (!toTop) {
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    }
    history.replaceState(null, "", toTop ? location.pathname : hash);
  });

  /* ---------- 3. Entrada do hero ---------- */

  let introEnd = performance.now() + 1600;

  function playIntro() {
    document.body.classList.add("is-loaded");
    heroParts.forEach((el) => el.classList.add("is-in"));
    introEnd = performance.now() + (reduceMotion ? 0 : 1000);
  }

  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([fontsReady, wait(800)]).then(() => requestAnimationFrame(playIntro));

  /* ---------- 4. Revelação no scroll ---------- */

  function reveal(el, delay) {
    el.style.setProperty("--delay", `${delay}ms`);
    if (el.hasAttribute("data-split")) el.style.setProperty("--base", `${delay}ms`);
    el.classList.add("is-in");
    if (el.getAttribute("data-reveal") === "card") {
      // libera o hover (sombra) depois que a cortina terminar
      setTimeout(() => el.classList.add("is-done"), delay + 1400);
    }
  }

  const revealTargets = [...sectionTitles, ...$$("[data-reveal]")];

  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealTargets.forEach((el) => reveal(el, 0));
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => ({ el: entry.target, r: entry.boundingClientRect }))
          // em ordem de leitura: linha por linha, da esquerda para a direita
          .sort((a, b) => Math.round(a.r.top - b.r.top) || a.r.left - b.r.left);

        const hold = Math.max(0, introEnd - performance.now());
        visible.forEach(({ el }, i) => {
          io.unobserve(el);
          reveal(el, Math.round(hold + i * 90));
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );
    revealTargets.forEach((el) => io.observe(el));
  }

  /* ---------- Menu do celular ---------- */

  const topbar = $("[data-topbar]");
  const menu = $("[data-menu]");
  const menuToggle = $("[data-menu-toggle]");
  const pageRegions = [$("main"), $(".footer")].filter(Boolean);
  let menuOpen = false;

  function openMenu() {
    if (!menu || menuOpen) return;
    menuOpen = true;
    menu.classList.add("is-open");
    topbar.classList.add("is-menu-open");
    menuToggle.setAttribute("aria-expanded", "true");
    menuToggle.setAttribute("aria-label", "Fechar menu");
    // A página por trás fica fora do alcance do teclado e do leitor de tela
    pageRegions.forEach((el) => { el.inert = true; });
    document.documentElement.classList.add("is-locked");
    if (lenis) lenis.stop();
    const first = $(".menu__link", menu);
    if (first) first.focus({ preventScroll: true });
  }

  function closeMenu(restoreFocus = true) {
    if (!menu || !menuOpen) return;
    menuOpen = false;
    menu.classList.remove("is-open");
    topbar.classList.remove("is-menu-open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Abrir menu");
    pageRegions.forEach((el) => { el.inert = false; });
    document.documentElement.classList.remove("is-locked");
    if (lenis) lenis.start();
    if (restoreFocus) menuToggle.focus({ preventScroll: true });
  }

  if (menu && menuToggle) {
    menuToggle.addEventListener("click", () => (menuOpen ? closeMenu() : openMenu()));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && menuOpen) closeMenu();
    });
    // Se a janela crescer para o tamanho de computador, o menu fecha
    const desktopQuery = window.matchMedia("(min-width: 1080px)");
    const onDesktop = (e) => { if (e.matches) closeMenu(false); };
    if (desktopQuery.addEventListener) desktopQuery.addEventListener("change", onDesktop);
    else if (desktopQuery.addListener) desktopQuery.addListener(onDesktop);
  }

  /* ---------- Seção ativa no menu ---------- */

  if ("IntersectionObserver" in window) {
    // Destaca no menu a seção que está no meio da tela
    const navLinks = $$("[data-nav]");
    const sectionIO = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          navLinks.forEach((a) => {
            if (a.getAttribute("href") === `#${entry.target.id}`) a.setAttribute("aria-current", "true");
            else a.removeAttribute("aria-current");
          });
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    navLinks
      .map((a) => $(a.getAttribute("href")))
      .filter(Boolean)
      .forEach((section) => sectionIO.observe(section));
  }

  /* ---------- 5. Loop de scroll ---------- */

  const hero = $(".hero");
  const heroInner = $("[data-hero]");
  const parallaxEls = $$("[data-parallax]");
  const steps = $("[data-steps]");
  const stepItems = steps ? $$(".step", steps) : [];
  const horizontalQuery = window.matchMedia("(min-width: 860px)");

  let vh = window.innerHeight;
  let heroH = hero.offsetHeight;
  let lastY = window.scrollY;
  let velocity = 0;
  let direction = 1;
  let stepsGeo = null;

  // Faixas de texto: duplica a lista até cobrir a largura com folga
  const marquees = $$("[data-marquee]").map((el) => {
    const track = $(".marquee__track", el);
    const list = $(".marquee__list", track);
    const state = { el, track, list, offset: 0, width: 0, speed: parseFloat(el.dataset.speed) || 0.5, visible: true };

    state.fill = () => {
      $$(".is-clone", track).forEach((n) => n.remove());
      state.width = list.offsetWidth;
      const copies = Math.max(1, Math.ceil((el.offsetWidth * 2) / Math.max(1, state.width)));
      for (let i = 0; i < copies; i++) {
        const clone = list.cloneNode(true);
        clone.classList.add("is-clone");
        clone.setAttribute("aria-hidden", "true");
        track.appendChild(clone);
      }
    };
    state.fill();

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([entry]) => {
        state.visible = entry.isIntersecting;
      }).observe(el);
    }
    return state;
  });

  function measureSteps() {
    if (!steps) return;
    const nums = stepItems.map((li) => $(".step__num", li));
    const horizontal = horizontalQuery.matches;
    // offsetTop/Left ignoram o transform da revelação
    const centers = nums.map((num, i) => {
      const li = stepItems[i];
      return horizontal
        ? li.offsetLeft + num.offsetLeft + num.offsetWidth / 2
        : li.offsetTop + num.offsetTop + num.offsetHeight / 2;
    });
    const start = centers[0];
    const len = centers[centers.length - 1] - start;
    steps.style.setProperty("--ls", `${start}px`);
    steps.style.setProperty("--ll", `${len}px`);
    stepsGeo = { horizontal, centers, start, len };
  }

  function updateSteps() {
    if (!stepsGeo || !stepsGeo.len) return;
    const r = steps.getBoundingClientRect();
    let fill;
    if (stepsGeo.horizontal) {
      fill = clamp((vh * 0.82 - r.top) / (vh * 0.42), 0, 1) * stepsGeo.len;
    } else {
      fill = clamp(vh * 0.62 - (r.top + stepsGeo.start), 0, stepsGeo.len);
    }
    steps.style.setProperty("--p", (fill / stepsGeo.len).toFixed(4));
    stepItems.forEach((li, i) => {
      li.classList.toggle("is-active", fill >= stepsGeo.centers[i] - stepsGeo.start - 4);
    });
  }

  function updateHero(y) {
    if (reduceMotion || !heroInner) return;
    const p = clamp(y / (heroH * 0.85), 0, 1);
    if (p >= 1 && heroInner.dataset.done) return;
    heroInner.dataset.done = p >= 1 ? "1" : "";
    heroInner.style.transform = `translate3d(0, ${(p * 80).toFixed(1)}px, 0) scale(${(1 - p * 0.05).toFixed(4)})`;
    heroInner.style.opacity = (1 - p * 0.95).toFixed(3);
  }

  function updateParallax() {
    if (reduceMotion) return;
    for (const el of parallaxEls) {
      const r = el.parentElement.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) continue;
      const c = (r.top + r.height / 2 - vh / 2) / (vh / 2 + r.height / 2);
      el.style.transform = `translate3d(0, ${(c * 7).toFixed(2)}%, 0)`;
    }
  }

  function updateMarquees() {
    if (reduceMotion) return;
    const boost = 1 + Math.min(Math.abs(velocity) * 0.22, 9);
    for (const m of marquees) {
      if (!m.visible || !m.width) continue;
      m.offset += m.speed * boost * direction;
      m.offset = ((m.offset % m.width) + m.width) % m.width;
      m.track.style.transform = `translate3d(${(-m.offset).toFixed(2)}px, 0, 0)`;
    }
  }

  let isScrolled = false;
  let isFloatVisible = false;
  const waFloat = $("[data-wa-float]");

  function tick(time) {
    if (lenis) lenis.raf(time);

    const y = window.scrollY;
    const delta = y - lastY;
    lastY = y;
    velocity += (delta - velocity) * 0.15;
    if (Math.abs(delta) > 0.5) direction = delta > 0 ? 1 : -1;

    // A barra do topo ganha fundo de vidro assim que a página rola
    const scrolled = y > 24;
    if (topbar && scrolled !== isScrolled) {
      isScrolled = scrolled;
      topbar.classList.toggle("is-scrolled", scrolled);
    }

    // Botão fixo do WhatsApp aparece depois que o hero sai da tela
    const showFloat = y > heroH * 0.7;
    if (waFloat && showFloat !== isFloatVisible) {
      isFloatVisible = showFloat;
      waFloat.classList.toggle("is-visible", showFloat);
    }

    updateHero(y);
    updateParallax();
    updateMarquees();
    updateSteps();

    requestAnimationFrame(tick);
  }

  function onResize() {
    vh = window.innerHeight;
    heroH = hero.offsetHeight;
    measureSteps();
    marquees.forEach((m) => m.fill());
  }

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(onResize, 120);
  });

  // As fontes mudam a largura das faixas e a altura das etapas
  fontsReady.then(onResize);
  window.addEventListener("load", onResize);
  measureSteps();
  requestAnimationFrame(tick);

  /* ---------- 6. Luz que segue o cursor nos cards ---------- */

  if (finePointer) {
    $$(".work-card__media").forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${e.clientX - r.left}px`);
        card.style.setProperty("--my", `${e.clientY - r.top}px`);
      });
    });
  }

  /* ---------- 7. Player de vídeo ---------- */

  const dialog = $("#player");
  if (!dialog || typeof dialog.showModal !== "function") return;

  const box = $(".player__box", dialog);
  const media = $("[data-player-media]", dialog);
  const titleEl = $("[data-player-title]", dialog);
  const catEl = $("[data-player-cat]", dialog);
  let lastTrigger = null;
  let closing = false;

  const youtube = (id) => ({
    type: "iframe",
    src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1&modestbranding=1`,
  });

  // Google Drive: aceita /file/d/ID/view, open?id=ID, uc?id=ID e o link de download.
  // O arquivo precisa estar compartilhado como "Qualquer pessoa com o link".
  function getDriveId(url) {
    try {
      const u = new URL(url, location.href);
      if (!/(^|\.)drive\.google\.com$|^drive\.usercontent\.google\.com$|^docs\.google\.com$/.test(u.hostname)) return null;
      const m = u.pathname.match(/\/d\/([\w-]{10,})/);
      return m ? m[1] : u.searchParams.get("id");
    } catch (err) {
      return null;
    }
  }

  // Capa automática: data-poster="drive" usa a miniatura que o Drive gera
  $$('.work-card__media[data-poster="drive"]').forEach((btn) => {
    const id = getDriveId(btn.dataset.video || "");
    const img = $("img", btn);
    if (id && img) img.src = `https://drive.google.com/thumbnail?id=${id}&sz=w1280`;
  });

  // Aceita YouTube (inclusive Shorts), Vimeo, Google Drive ou arquivo de vídeo
  function toSource(url) {
    if (!url) return null;
    try {
      const u = new URL(url, location.href);
      const host = u.hostname.replace(/^(www|m)\./, "");
      const parts = u.pathname.split("/").filter(Boolean);

      if (host === "youtu.be" && parts[0]) return youtube(parts[0]);
      if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
        if (["shorts", "embed", "live"].includes(parts[0]) && parts[1]) return youtube(parts[1]);
        const v = u.searchParams.get("v");
        if (v) return youtube(v);
      }
      if (host.endsWith("vimeo.com")) {
        const id = parts.find((s) => /^\d+$/.test(s));
        if (id) return { type: "iframe", src: `https://player.vimeo.com/video/${id}?autoplay=1&title=0&byline=0&portrait=0&dnt=1` };
      }
      const driveId = getDriveId(url);
      if (driveId) return { type: "drive", id: driveId };
      if (/\.(mp4|webm|mov|m4v)$/i.test(u.pathname)) return { type: "video", src: u.href };
    } catch (err) {
      /* link inválido: cai na capa */
    }
    return null;
  }

  function openPlayer(trigger) {
    const title = $(".work-card__title", trigger).textContent.trim();
    const cat = $(".work-card__cat", trigger).textContent.trim();
    const img = $("img", trigger);
    const poster = img ? img.currentSrc || img.src : "";
    const source = toSource(trigger.dataset.video);

    box.classList.toggle("is-vertical", trigger.dataset.format !== "wide");
    titleEl.textContent = title;
    catEl.textContent = cat;
    media.textContent = "";

    media.classList.remove("is-loading");

    const addFrame = (src) => {
      media.textContent = "";
      media.classList.remove("is-loading");
      const frame = document.createElement("iframe");
      frame.src = src;
      frame.title = title;
      frame.allow = "autoplay; fullscreen; picture-in-picture; encrypted-media";
      media.appendChild(frame);
    };

    // Vídeo tocando no player do próprio site: começa sozinho ao abrir.
    // O clique no card conta como gesto da pessoa, então o som é liberado.
    const addVideo = (src, onFail) => {
      const video = document.createElement("video");
      video.src = src;
      video.poster = poster;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      video.preload = "auto";
      media.classList.add("is-loading");
      video.addEventListener("playing", () => media.classList.remove("is-loading"));
      video.addEventListener("waiting", () => media.classList.add("is-loading"));
      if (onFail) video.addEventListener("error", onFail, { once: true });
      media.appendChild(video);
      const p = video.play();
      // Se o navegador recusar som automático, toca sem som (a pessoa liga depois)
      if (p && p.catch) p.catch(() => { video.muted = true; video.play().catch(() => {}); });
    };

    if (source && source.type === "drive") {
      // O Drive não deixa tocar o arquivo direto em outro site, então usa o
      // player dele (que exige um toque no play). YouTube e .mp4 começam sozinhos.
      addFrame(`https://drive.google.com/file/d/${source.id}/preview`);
    } else if (source && source.type === "iframe") {
      addFrame(source.src);
    } else if (source && source.type === "video") {
      addVideo(source.src);
    } else {
      const cover = document.createElement("img");
      cover.src = poster;
      cover.alt = "";
      const soon = document.createElement("p");
      soon.className = "player__soon";
      soon.textContent = "Este vídeo estará disponível em breve.";
      media.append(cover, soon);
    }

    lastTrigger = trigger;
    closing = false;
    dialog.classList.remove("is-closing");
    dialog.showModal();
    document.documentElement.classList.add("is-locked");
    if (lenis) lenis.stop();
  }

  function closePlayer() {
    if (!dialog.open || closing) return;
    closing = true;
    dialog.classList.add("is-closing");
    setTimeout(() => {
      dialog.classList.remove("is-closing");
      dialog.close();
      closing = false;
    }, reduceMotion ? 0 : 220);
  }

  dialog.addEventListener("close", () => {
    media.textContent = ""; // para o vídeo
    document.documentElement.classList.remove("is-locked");
    if (lenis) lenis.start();
    if (lastTrigger) lastTrigger.focus({ preventScroll: true });
  });

  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    closePlayer();
  });

  // Clique fora da caixa fecha
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) closePlayer();
  });

  $("[data-player-close]", dialog).addEventListener("click", closePlayer);

  $$(".work-card__media").forEach((trigger) => {
    trigger.addEventListener("click", () => openPlayer(trigger));
  });
})();
