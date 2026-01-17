/* =========================================================
   main.js — TiDev
   - Âncoras com rolagem suave
   - Parallax simples do BG YouTube
   - YouTube IFrame API (autoplay/mute/loop)
   - Hotspot (easter-egg) para portal admin (PIN)
   ========================================================= */

/* ---------------------------
   CONFIGURAÇÕES
---------------------------- */
const YT_VIDEO_ID = "Hgg7M3kSqyE"; // ID do vídeo de fundo
const PARALLAX_MAX_SHIFT = -12; // deslocamento máx. em % (negativo = sobe)
const HOTSPOT_ID = "admin-brand-hotspot";
const REDUCE_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------------------------
   ÂNCORAS — rolagem suave
---------------------------- */
document.addEventListener("click", function (ev) {
  var a = ev.target.closest("a[href^='#']");
  if (!a) return;

  var id = a.getAttribute("href").slice(1);
  if (!id) return;

  var el = document.getElementById(id);
  if (!el) return;

  ev.preventDefault();
  // scroll suave até a seção (honra scroll-padding-top do CSS)
  el.scrollIntoView({ behavior: REDUCE_MOTION ? "auto" : "smooth", block: "start" });

  // foco para acessibilidade após scroll
  setTimeout(function () {
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
  }, 350);
});

/* ---------------------------
   HASH LOAD - jump without smooth scroll
---------------------------- */
(function () {
  if (!window.location.hash) return;
  if (REDUCE_MOTION) return;

  var root = document.documentElement;
  var prevBehavior = root.style.scrollBehavior;
  var prevSnap = root.style.scrollSnapType;

  root.style.scrollBehavior = "auto";
  root.style.scrollSnapType = "none";

  window.requestAnimationFrame(function () {
    var id = window.location.hash.slice(1);
    var el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "auto", block: "start" });
    root.style.scrollBehavior = prevBehavior;
    root.style.scrollSnapType = prevSnap;
  });
})();

/* ---------------------------
   MENU MOBILE
---------------------------- */
(function () {
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  if (!toggle || !nav) return;

  function setOpen(open) {
    document.body.classList.toggle("nav-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  toggle.addEventListener("click", function () {
    var isOpen = document.body.classList.contains("nav-open");
    setOpen(!isOpen);
  });

  nav.addEventListener("click", function (ev) {
    if (ev.target.closest("a")) setOpen(false);
  });

  document.addEventListener("click", function (ev) {
    if (!document.body.classList.contains("nav-open")) return;
    if (nav.contains(ev.target) || toggle.contains(ev.target)) return;
    setOpen(false);
  });

  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") setOpen(false);
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth > 900) setOpen(false);
  });
})();

/* ---------------------------
   PARALLAX do BG YouTube
---------------------------- */
(function () {
  var ytWrap = document.getElementById("yt-bg");
  var hero = document.querySelector(".hero");
  if (!ytWrap || !hero) return;
  if (REDUCE_MOTION) return;

  var ticking = false;
  function onScrollOrResize() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      var rect = hero.getBoundingClientRect();
      var viewportH = Math.max(window.innerHeight || 0, 1);
      var scrolled = Math.min(Math.max(-rect.top, 0), viewportH);
      var progress = scrolled / viewportH; // 0..1
      var translate = PARALLAX_MAX_SHIFT * progress; // até -12%
      ytWrap.style.transform = "translateY(" + translate + "%)";
      ticking = false;
    });
  }

  document.addEventListener("scroll", onScrollOrResize, { passive: true });
  window.addEventListener("resize", onScrollOrResize);
  onScrollOrResize(); // primeira passada
})();

/* ---------------------------
   YouTube IFrame API
---------------------------- */
(function () {
  var player = null;
  var apiLoaded = false;

  function ensureAPI(cb) {
    if (window.YT && window.YT.Player) return cb();
    if (apiLoaded) return; // já pendente

    apiLoaded = true;
    var s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onload = function () {
      // alguns navegadores disparam onload antes de YT estar pronto;
      // a função global onYouTubeIframeAPIReady será chamada quando realmente estiver.
    };
    document.head.appendChild(s);

    // define (ou reaponta) o callback global
    var oldCb = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () {
      if (typeof oldCb === "function")
        try {
          oldCb();
        } catch (_) {}
      cb();
    };
  }

  function createPlayer() {
    var el = document.getElementById("yt-iframe");
    if (!el || !window.YT || !window.YT.Player) return;

    player = new YT.Player("yt-iframe", {
      videoId: YT_VIDEO_ID,
      playerVars: {
        autoplay: 1,
        mute: 1,
        controls: 0,
        rel: 0,
        iv_load_policy: 3,
        modestbranding: 1,
        playsinline: 1,
        loop: 1,
        playlist: YT_VIDEO_ID, // necessário para loop
        start: 2, // começa 2s (tira “respiração” inicial)
        fs: 0,
        showinfo: 0,
        disablekb: 1,
        origin: window.location.origin,
      },
      events: {
        onReady: function (e) {
          // Autoplay só funciona mutado em vários navegadores
          try {
            e.target.mute();
          } catch (_) {}
          try {
            e.target.playVideo();
          } catch (_) {}
        },
        onStateChange: function (e) {
          // Reforça loop em casos esporádicos
          if (e.data === YT.PlayerState.ENDED) {
            try {
              e.target.playVideo();
            } catch (_) {}
          }
        },
      },
    });
  }

  // Pausa quando a aba fica oculta (economiza CPU/GPU)
  document.addEventListener("visibilitychange", function () {
    if (!player) return;
    try {
      if (document.hidden) player.pauseVideo();
      else player.playVideo();
    } catch (_) {}
  });

  ensureAPI(createPlayer);
})();

/* ---------------------------
   REVEAL AO ROLAR
---------------------------- */
(function () {
  var items = document.querySelectorAll(".reveal");
  if (!items.length) return;

  if (REDUCE_MOTION || !("IntersectionObserver" in window)) {
    items.forEach(function (el) { el.classList.add("is-visible"); });
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -10% 0px" });

  items.forEach(function (el) { observer.observe(el); });
})();

/* ---------------------------
   Porta Admin — PIN (easter-egg)
   3 cliques rápidos no hotspot
---------------------------- */
// ===== Hotspot Admin (3 cliques rápidos) =====
(function () {
  var HOTSPOT_ID = "admin-brand-hotspot"; // <- id do span invisível no rodapé
  var el = document.getElementById(HOTSPOT_ID);
  if (!el) return;

  // torna a área clicável sem aparecer visualmente
  el.style.display = "inline-block";
  el.style.width = "24px";
  el.style.height = "24px";
  el.style.verticalAlign = "middle";
  el.style.cursor = "default"; // não denuncia que é clicável

  var clicks = 0;
  var timer = null;

  el.addEventListener("click", function () {
    clicks++;
    clearTimeout(timer);
    timer = setTimeout(function () {
      clicks = 0;
    }, 450); // janela de 450ms

    if (clicks >= 3) {
      clicks = 0;
      var pin = window.prompt("PIN admin:");
      if (!pin) return;

      fetch("/admin/door", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pin }),
      })
        .then(function (r) {
          return r.ok ? r.json() : Promise.reject();
        })
        .then(function (j) {
          if (j && j.ok) {
            window.location.href = "/admin/leads";
          } else {
            window.alert("PIN inválido.");
          }
        })
        .catch(function () {
          window.alert("Erro ao validar PIN.");
        });
    }
  });

  // Fallback: se existir #admin-door (botão fixo invisível), delega o clique
  var btn = document.getElementById("admin-door");
  if (btn)
    btn.addEventListener("click", function () {
      el.click();
    });
})();

// ===== Fade progressivo da dica "role para ver mais" =====
(function () {
  var tip = document.querySelector(".scroll-indicator");
  var hero = document.querySelector(".hero");
  if (!tip || !hero) return;
  if (REDUCE_MOTION) return;

  function onScroll() {
    // posição atual do hero no viewport
    var rect = hero.getBoundingClientRect();
    var vh = Math.max(window.innerHeight || 0, 1);

    // quanto do hero já foi "varrido" (0..vh)
    var scrolled = Math.min(Math.max(-rect.top, 0), vh);

    // queremos sumir por completo por volta de ~60% do hero
    var progress = scrolled / (vh * 0.6);
    var t = Math.max(0, Math.min(1, progress)); // clamp 0..1

    // opacidade decresce, leve deslize pra baixo
    var opacity = 1 - t;
    var translateY = 6 * t; // até 6px pra baixo

    tip.style.opacity = opacity.toFixed(3);
    tip.style.transform = "translate(-50%, " + translateY + "px)";
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll(); // inicial
})();
