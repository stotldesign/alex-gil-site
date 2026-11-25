// alex-gil.com: Design (catalogue plates) and Photo (salon wall) pages.
// Images and sizes come from /data/work.json (made by work/fetch.py).
(function () {
  "use strict";

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function getWork() { return fetch("/data/work.json").then(function (r) { return r.json(); }); }

  // ---- full-size viewer, shared by both pages ----
  var box, boxImg, boxCap, boxList = [], boxAt = 0;
  function lightbox(list, at) {
    if (!box) {
      box = el("div", "lb");
      box.setAttribute("role", "dialog");
      box.setAttribute("aria-modal", "true");
      box.setAttribute("aria-label", "Full-size image");
      boxImg = el("img", "lb__img");
      boxCap = el("p", "lb__cap mono");
      var close = el("button", "lb__btn lb__close", "Close ×");
      var prev = el("button", "lb__btn lb__prev", "‹");
      var next = el("button", "lb__btn lb__next", "›");
      prev.setAttribute("aria-label", "Previous");
      next.setAttribute("aria-label", "Next");
      [close, prev, next].forEach(function (b) { b.type = "button"; });
      close.onclick = shut;
      prev.onclick = function () { show(boxAt - 1); };
      next.onclick = function () { show(boxAt + 1); };
      box.onclick = function (e) { if (e.target === box) shut(); };
      box.append(boxImg, boxCap, close, prev, next);
      document.body.appendChild(box);
      document.addEventListener("keydown", function (e) {
        if (!box.classList.contains("is-open")) return;
        if (e.key === "Escape") shut();
        if (e.key === "ArrowLeft") show(boxAt - 1);
        if (e.key === "ArrowRight") show(boxAt + 1);
      });
      var x0 = null;
      box.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
      box.addEventListener("touchend", function (e) {
        if (x0 == null) return;
        var dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 50) show(boxAt + (dx < 0 ? 1 : -1));
        x0 = null;
      });
    }
    boxList = list;
    show(at);
    box.classList.add("is-open");
    document.documentElement.style.overflow = "hidden";
    box.querySelector(".lb__close").focus();
  }
  function show(i) {
    boxAt = (i + boxList.length) % boxList.length;
    var it = boxList[boxAt];
    boxImg.src = it.src;                       // page size first, so something shows instantly
    var full = new Image();
    full.onload = function () { if (boxList[boxAt] === it) boxImg.src = it.full; };
    full.src = it.full;
    boxImg.alt = it.caption;
    boxCap.textContent = it.caption;
  }
  function shut() {
    box.classList.remove("is-open");
    document.documentElement.style.overflow = "";
  }

  // ---- Design: catalogue plates ----
  // Index of projects on the left (Pl. 01–07); one piece at a time on a plain plate.
  function initDesign(root, data) {
    var projects = data.design;
    var state = { p: 0, i: 0 };
    var m = /^#([\w-]+)(?:\/(\d+))?$/.exec(location.hash);
    if (m) projects.forEach(function (p, k) { if (p.slug === m[1]) { state.p = k; state.i = Math.max(0, (+m[2] || 1) - 1); } });

    root.textContent = "";
    var wrap = el("div", "cat");
    var index = el("nav", "cat__index");
    index.setAttribute("aria-label", "Projects");
    var plate = el("figure", "cat__plate");
    var stage = el("button", "cat__stage");
    stage.type = "button";
    stage.setAttribute("aria-label", "View full size");
    var img = el("img", "cat__img");
    stage.appendChild(img);
    var cap = el("figcaption", "cat__cap");
    var capL = el("span", "mono"), capR = el("span", "mono dim");
    cap.append(capL, capR);
    var nav = el("div", "cat__nav");
    var prev = el("button", "pill", "‹ Prev"), next = el("button", "pill", "Next ›");
    prev.type = next.type = "button";
    nav.append(prev, next);
    var strip = el("div", "cat__strip");
    cap.appendChild(nav); // prev/next sit on the caption line so the page fits without scrolling
    plate.append(stage, cap, strip);
    wrap.append(index, plate);
    root.appendChild(wrap);

    // fade the edge of a sideways-scrolling row while there's more to see that way (styled for phones only)
    function edges(sc) {
      function u() {
        sc.classList.toggle("fade-l", sc.scrollLeft > 2);
        sc.classList.toggle("fade-r", sc.scrollLeft + sc.clientWidth < sc.scrollWidth - 2);
      }
      sc.addEventListener("scroll", u, { passive: true });
      window.addEventListener("resize", u);
      sc.addEventListener("load", u, true); // thumbnails widen the row as they load
      if (window.ResizeObserver) new ResizeObserver(u).observe(sc);
      if (window.MutationObserver) new MutationObserver(function () { requestAnimationFrame(u); }).observe(sc, { childList: true });
      return u;
    }
    var fadeIndex = edges(index), fadeStrip = edges(strip);

    function caption(p, i) { return "Pl. " + pad(projects.indexOf(p) + 1) + "." + (i + 1) + " · " + p.title; }

    function renderIndex() {
      index.textContent = "";
      projects.forEach(function (p, k) {
        var b = el("button", "cat__entry");
        b.type = "button";
        b.setAttribute("aria-current", String(k === state.p));
        b.append(el("span", "mono dim", "Pl. " + pad(k + 1)), el("span", "cat__name", p.title), el("span", "mono dim", String(p.items.length)));
        b.onclick = function () { state.p = k; state.i = 0; render(); };
        index.appendChild(b);
      });
    }
    function renderPlate() {
      var p = projects[state.p], it = p.items[state.i];
      img.classList.remove("is-in");
      img.onload = function () { img.classList.add("is-in"); };
      img.src = it.src;
      img.alt = caption(p, state.i);
      img.style.aspectRatio = it.w + " / " + it.h;
      capL.textContent = caption(p, state.i);
      capR.textContent = (state.i + 1) + " / " + p.items.length;
      strip.textContent = "";
      p.items.forEach(function (x, j) {
        var t = el("button", "cat__thumb");
        t.type = "button";
        t.setAttribute("aria-label", caption(p, j));
        t.setAttribute("aria-current", String(j === state.i));
        var ti = el("img");
        ti.src = x.src;
        ti.alt = "";
        ti.loading = "lazy";
        t.appendChild(ti);
        t.onclick = function () { state.i = j; render(); };
        strip.appendChild(t);
      });
      var cur = strip.children[state.i];
      if (cur) strip.scrollLeft = cur.offsetLeft - strip.clientWidth / 2 + cur.offsetWidth / 2; // keep the page itself still
      history.replaceState(null, "", "#" + p.slug + "/" + (state.i + 1));
    }
    function render() {
      renderIndex(); renderPlate();
      // when the index is a sideways row (phones), keep the current project in view
      var cur = index.querySelector('[aria-current="true"]');
      if (cur && index.scrollWidth > index.clientWidth) {
        var x = cur.offsetLeft - index.offsetLeft, w = cur.offsetWidth;
        if (x < index.scrollLeft || x + w > index.scrollLeft + index.clientWidth) index.scrollLeft = Math.max(0, x - 24);
      }
      requestAnimationFrame(function () { fadeIndex(); fadeStrip(); });
    }
    function step(d) {
      var p = projects[state.p];
      state.i += d;
      if (state.i >= p.items.length) { state.p = (state.p + 1) % projects.length; state.i = 0; }
      if (state.i < 0) { state.p = (state.p - 1 + projects.length) % projects.length; state.i = projects[state.p].items.length - 1; }
      render();
    }
    prev.onclick = function () { step(-1); };
    next.onclick = function () { step(1); };
    stage.onclick = function () {
      var p = projects[state.p];
      lightbox(p.items.map(function (x, j) { return { src: x.src, full: x.full, caption: caption(p, j) }; }), state.i);
    };
    document.addEventListener("keydown", function (e) {
      if (box && box.classList.contains("is-open")) return;
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    });
    render();
  }

  // ---- Photo: salon wall ----
  // Each set is hung like a salon wall: mixed sizes on a shared centre line, with a wall label.
  function initPhoto(root, data) {
    var sets = data.photo;
    root.textContent = "";
    sets.forEach(function (s, k) {
      var room = el("section", "salon");
      room.setAttribute("aria-label", s.title);
      var label = el("div", "salon__label");
      label.append(el("span", "mono dim", pad(k + 1)), el("span", "salon__title", s.title), el("span", "mono dim", s.items.length + " photographs"));
      var wall = el("div", "salon__wall");
      var list = s.items.map(function (x, j) { return { src: x.src, full: x.full, caption: s.title + " · " + (j + 1) + " / " + s.items.length }; });
      s.items.forEach(function (x, j) {
        // sizes vary in a fixed pattern (not random) so the hang is the same on every visit
        var heights = [300, 210, 380, 250, 330, 190, 280];
        var h = heights[(j * 3 + k) % heights.length];
        var b = el("button", "salon__piece");
        b.type = "button";
        b.setAttribute("aria-label", "View " + list[j].caption + " full size");
        b.style.setProperty("--h", h + "px");
        b.style.setProperty("--ar", x.w / x.h);
        b.style.setProperty("--dy", [0, -18, 12, -6, 20, -14, 6][(j + k) % 7] + "px");
        var im = el("img");
        im.src = x.src;
        im.alt = list[j].caption;
        im.loading = "lazy";
        im.width = x.w;
        im.height = x.h;
        b.appendChild(im);
        b.onclick = function () { lightbox(list, j); };
        wall.appendChild(b);
      });
      room.append(label, wall);
      root.appendChild(room);
    });
  }

  var d = $("[data-design]"), p = $("[data-photo]");
  if (!d && !p) return;
  getWork().then(function (data) {
    if (d) initDesign(d, data);
    if (p) initPhoto(p, data);
  }).catch(function () {
    (d || p).innerHTML = '<p class="mono dim">Couldn’t load the work. Try refreshing.</p>';
  });
})();
