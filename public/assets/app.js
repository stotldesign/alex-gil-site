// alex-gil.com — live view counts + video page
(function () {
  "use strict";

  var SETTINGS = {
    avgMinutesWatched: 12,              // used only for the "years of watching" joke
    allMonths: 11, // the shuffled "All" view only shows videos from this many recent months
    pageSize: 12,  // phones show 8 (see below)
    heroSeconds: 3,
    creditsShown: 4,                    // channels named in the "edited for" line
    featureSeconds: 9,                  // featured video rotates through each channel's most-viewed edit
    marqueeSpeed: 18,                   // channel row drift speed, pixels per second
    tickSeconds: 2                      // how often the view counter steps up (by however many real views came in)
  };
  if (window.matchMedia && matchMedia("(max-width: 600px)").matches) SETTINGS.pageSize = 8;

  // ---- data: live from /api/videos, falls back to the saved snapshot ----
  // Raw response: { updated, total, rate (views per second), videos: [...] }
  function fetchRaw(bust) {
    return fetch("/api/videos" + (bust ? "?t=" + Date.now() : ""))
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  var rawPromise;
  function getRaw() {
    if (!rawPromise) {
      rawPromise = fetchRaw(false)
        .catch(function () { return fetch("/data/videos.json").then(function (r) { return r.json(); }); })
        .catch(function () { return { videos: [] }; });
    }
    return rawPromise;
  }
  function getData() {
    return getRaw().then(function (d) {
      var v = (d && d.videos) || [];
      v.sort(function (a, b) { return b.views - a.views; });
      return v;
    });
  }

  // ---- helpers ----
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function total(v) { return v.reduce(function (s, x) { return s + x.views; }, 0); }
  function compact(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "K";
    return String(n);
  }
  function ago(v) {
    if (!v.published) return v.ago || "";
    var d = (Date.now() - new Date(v.published).getTime()) / 864e5;
    if (d < 1) return "today";
    if (d < 14) return Math.floor(d) + "d ago";
    if (d < 60) return Math.floor(d / 7) + "w ago";
    if (d < 365) return Math.floor(d / 30.4) + "mo ago";
    return Math.floor(d / 365) + "y ago";
  }
  function meta(v) { return v.channel + " · " + compact(v.views) + " views · " + ago(v); }
  // YouTube doesn't make a maxres thumbnail for every video; when it's missing it serves a
  // tiny 120x90 gray placeholder (sometimes with a 404). Step down until a real one loads.
  function thumb(v, big) {
    var t = el("div", "thumb");
    var img = el("img");
    var sizes = big ? ["maxresdefault", "sddefault", "hqdefault", "mqdefault"] : ["mqdefault", "hqdefault"];
    var i = 0;
    function next() {
      if (i >= sizes.length) { img.remove(); return; } // keep the plain tile, no broken icon
      img.src = "https://i.ytimg.com/vi/" + v.id + "/" + sizes[i++] + ".jpg";
    }
    img.alt = "";
    img.loading = big ? "eager" : "lazy";
    img.onerror = next;
    img.onload = function () { if (img.naturalWidth <= 120) next(); };
    next();
    t.appendChild(img);
    t.appendChild(el("span", "len", v.len));
    return t;
  }

  // Odometer-style number: each digit is a column 0–9 that slides to its value.
  // Screen readers get the plain number; reduced-motion users get instant changes (via CSS).
  function rollingNumber(node) {
    var cols = [], current = "";
    function build(s) {
      node.textContent = "";
      cols = [];
      var vis = el("span");
      vis.setAttribute("aria-hidden", "true");
      for (var i = 0; i < s.length; i++) {
        if (!/\d/.test(s[i])) { vis.appendChild(el("span", "roll-sep", s[i])); cols.push(null); continue; }
        var cell = el("span", "roll-cell");
        var col = el("span", "roll-col");
        for (var k = 0; k < 10; k++) col.appendChild(el("span", null, String(k)));
        col.style.transition = "none";
        col.style.transform = "translateY(-" + s[i] + "0%)";
        cell.appendChild(col);
        vis.appendChild(cell);
        cols.push(col);
      }
      node.appendChild(vis);
      var sr = el("span", "sr-only", s);
      node.appendChild(sr);
      void node.offsetWidth; // apply start positions before enabling transitions
      cols.forEach(function (c) { if (c) c.style.transition = ""; });
    }
    return function (s, instant) {
      if (s === current) return;
      if (instant || s.length !== current.length) build(s); // instant: jump straight there, no rolling
      else {
        for (var i = 0; i < s.length; i++) if (cols[i]) cols[i].style.transform = "translateY(-" + s[i] + "0%)";
        node.lastChild.textContent = s;
      }
      current = s;
    };
  }

  // "edited for" line: the 4 biggest channels by subscribers, each with its small YouTube
  // profile picture, then "+N more" linking to the Video page.
  // stretch the names so the line runs to the end of the rule above it
  function fitCredits(node) {
    var names = node.querySelector(".credit-names");
    if (!names) return;
    names.style.fontSize = "";
    var base = parseFloat(getComputedStyle(names).fontSize), w = node.clientWidth;
    if (getComputedStyle(names).whiteSpace !== "nowrap") return; // narrow screens wrap instead
    var size = base;
    for (var k = 0; k < 3; k++) { size = size * w / names.getBoundingClientRect().width; size = Math.max(base, Math.min(16, size)); names.style.fontSize = size + "px"; }
    while (names.getBoundingClientRect().width > w && size > base) { size -= 0.1; names.style.fontSize = size + "px"; }
  }

  function creditItem(c) {
    var item = el(c.url ? "a" : "span", "credit");
    if (c.url) { item.href = c.url; item.target = "_blank"; item.rel = "noopener"; }
    if (c.avatar) {
      var img = el("img", "credit__pic");
      img.src = c.avatar;
      img.alt = "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.onerror = function () { img.remove(); };
      item.appendChild(img);
    }
    item.appendChild(document.createTextNode(c.name));
    return item;
  }
  function creditDot() {
    var dot = el("span", "credit__sep");
    dot.setAttribute("aria-hidden", "true");
    return dot;
  }

  var phoneQuery = window.matchMedia ? matchMedia("(max-width: 600px)") : { matches: false };

  function renderCredits(node, d) {
    var list = (d.channels || []).slice();
    if (!list.length) {
      // snapshot fallback: no subscriber data, rank by views on Alex's edits instead
      var by = {};
      (d.videos || []).forEach(function (x) { by[x.channel] = (by[x.channel] || 0) + x.views; });
      list = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; }).map(function (n) { return { name: n }; });
    }
    var brands = d.brands || [];
    if (!list.length && !brands.length) return;
    node.textContent = "";
    var more = el("a", "credit credit--more", "+ more");
    more.href = "/video/";

    if (phoneQuery.matches) {
      // phones: one line, every name rolling past on a loop, "+ more" pinned at the end
      node.classList.add("credit-roll");
      node.appendChild(el("span", "credit-roll__label", "edited for:"));
      var view = el("div", "credit-roll__view"), track = el("div", "credit-roll__track");
      var all = brands.concat(list);
      for (var copy = 0; copy < 2; copy++) {
        var set = el("span", "credit-roll__set");
        if (copy) set.setAttribute("aria-hidden", "true");
        all.forEach(function (c) { set.appendChild(creditItem(c)); set.appendChild(creditDot()); });
        track.appendChild(set);
      }
      view.appendChild(track);
      node.appendChild(view);
      node.appendChild(more);
      requestAnimationFrame(function () {
        var w = track.firstChild.getBoundingClientRect().width;
        track.style.animationDuration = Math.max(12, w / 28) + "s"; // about 28px a second
      });
    } else {
      node.classList.remove("credit-roll");
      // desktop: brands first, then the biggest channels by subscribers, then "+ more"
      var shown = brands.concat(list).slice(0, SETTINGS.creditsShown);
      var names = el("span", "credit-names");
      names.appendChild(document.createTextNode("edited for: "));
      node.appendChild(names);
      shown.forEach(function (c, i) {
        // the dot is glued to the name before it, so if the line wraps it stays with that name
        var group = el("span", "credit-group");
        group.appendChild(creditItem(c));
        if (i < shown.length - 1) group.appendChild(creditDot());
        names.appendChild(group);
        names.appendChild(document.createTextNode(" "));
      });
      fitCredits(node);
      if (brands.length + list.length > shown.length) {
        node.appendChild(document.createTextNode(" ")); // a place "+ more" can wrap if it doesn't fit
        node.appendChild(more);
      }
    }
    if (!renderCredits.bound) {
      renderCredits.bound = true;
      window.addEventListener("resize", function () { if (!phoneQuery.matches) fitCredits(node); });
      if (phoneQuery.addEventListener) phoneQuery.addEventListener("change", function () { renderCredits(node, d); });
    }
  }

  // ---- homepage ----
  function initHero() {
    var hero = $("[data-hero]");
    if (!hero) return;
    var imgs = hero.querySelectorAll(":scope > img");
    if (imgs.length < 2) return;
    var i = 0;
    setInterval(function () {
      imgs[i].classList.remove("is-on");
      i = (i + 1) % imgs.length;
      imgs[i].classList.add("is-on");
    }, SETTINGS.heroSeconds * 1000);
  }

  function initHome() {
    var num = $("[data-views]");
    if (!num) return;
    var unitsBtn = $("[data-units]");
    var unitsText = $("[data-units-text]");
    var unit = 0;
    var t = Number(num.textContent.replace(/\D/g, "")) || 0;

    // Tap "views ↻" to cycle through these. All worked out from the real total.
    var firstUpload = 0; // filled in from the playlist: date of the oldest edit
    function units() {
      var years = Math.round((t * SETTINGS.avgMinutesWatched) / 525960);
      var list = [
        "views on videos I've edited",
        "≈ " + years.toLocaleString("en-US") + " years of people watching",
        "≈ " + Math.round(t / 70000).toLocaleString("en-US") + " sold-out SoFi Stadiums"
      ];
      return list;
    }
    var roll = rollingNumber(num);
    function paint(instant) {
      roll(t.toLocaleString("en-US"), instant);
      unitsText.textContent = units()[unit];
    }
    function reveal() { num.classList.remove("is-loading"); }
    unitsBtn.addEventListener("click", function () { unit = (unit + 1) % units().length; paint(); });
    // The number stays hidden until the live total arrives, then appears already correct
    // (no counting up from an old number). If loading takes too long, show what we have.
    setTimeout(reveal, 4000);

    // Ticking: the API gives `shown` + `showRate`, which climb toward the real total. A big jump
    // in real views is spread out (fast climb for a few hours) instead of leaping. Never shows more
    // than the real total, never counts backwards, and re-checks every minute.
    var shown = t, showRate = 0, real = t, realRate = 0, at = Date.now(), started = false;
    function target() {
      var el = (Date.now() - at) / 1000;
      return Math.floor(Math.min(shown + showRate * el, real + realRate * el));
    }
    function apply(d) {
      if (!d || !d.videos || !d.videos.length) return;
      real = d.total || total(d.videos);
      realRate = d.rate > 0 ? d.rate : 0;
      shown = d.shown != null ? d.shown : real;
      showRate = d.showRate > 0 ? d.showRate : realRate;
      at = d.updated && d.source === "live" ? Math.max(Date.parse(d.updated), Date.now() - 600000) : Date.now();
      var goal = target();
      var first = !started;
      if (first || t > goal + 500) t = goal; // first load, or stale number far ahead: snap to it
      started = true;
      paint(first);
      if (first) requestAnimationFrame(reveal);
    }
    setInterval(function () {
      var next = target();
      if (next > t) { t = next; paint(); }
    }, SETTINGS.tickSeconds * 1000);
    setInterval(function () { fetchRaw(true).then(apply).catch(function () {}); }, 60000);

    getRaw().then(function (d) {
      var v = (d && d.videos) || [];
      if (!v.length) return;
      v.forEach(function (x) { var p = Date.parse(x.published); if (p && (!firstUpload || p < firstUpload)) firstUpload = p; });
      apply(d);
      var count = $("[data-count]");
      if (count) count.textContent = v.length + " edits →";
      var credit = $("[data-edited-for]");
      if (credit) renderCredits(credit, d);
    });
  }

  // ---- video page ----
  function initVideos() {
    var root = $("[data-videos]");
    if (!root) return;
    var state = { sel: null, filter: "All", limit: SETTINGS.pageSize, playing: false, auto: true };
    var all = [], highlights = [];
    var feature = el("div", "feature");
    var pills = el("div", "pills");
    var grid = el("div", "grid");
    var more = el("div", "more");

    // All: shuffled once per visit. A channel: newest to oldest.
    var shuffled = [];
    function currentList() {
      if (state.filter === "All") return shuffled;
      return all.filter(inFilter).sort(function (a, b) {
        return (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0);
      });
    }
    function inFilter(v) {
      if (state.filter === "All") return true;
      return v.channel === state.filter;
    }

    function renderFeature() {
      var v = state.sel;
      feature.textContent = "";
      var media = el("div", "feature__media");
      if (state.playing) {
        var f = el("iframe");
        f.src = "https://www.youtube-nocookie.com/embed/" + v.id + "?autoplay=1&rel=0";
        f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
        f.allowFullscreen = true;
        f.title = v.title;
        media.appendChild(f);
      } else {
        var t = thumb(v, true);
        var play = el("button", "play", "▶ Play · " + v.len);
        play.type = "button";
        var start = function () { state.playing = true; state.auto = false; renderFeature(); };
        play.addEventListener("click", start);
        t.addEventListener("click", start);
        t.appendChild(play);
        media.appendChild(t);
      }
      var info = el("div", "feature__info");
      info.appendChild(el("h1", "feature__title", v.title));
      info.appendChild(el("span", "mono", meta(v)));
      var row = el("div", "feature__row");
      var next = el("button", "pill", "Up next ›");
      next.type = "button";
      next.addEventListener("click", function () {
        state.auto = false;
        nextHighlight();
      });
      var yt = el("a", "mono", "Watch on YouTube ↗");
      yt.href = "https://www.youtube.com/watch?v=" + v.id;
      yt.target = "_blank";
      yt.rel = "noopener";
      row.appendChild(next);
      row.appendChild(yt);
      info.appendChild(row);
      feature.appendChild(media);
      feature.appendChild(info);
    }

    function nextHighlight() {
      var i = highlights.indexOf(state.sel);
      state.sel = highlights[(i + 1) % highlights.length];
      state.playing = false;
      renderFeature();
    }
    setInterval(function () {
      if (state.auto && !state.playing && !document.hidden && highlights.length > 1) nextHighlight();
    }, SETTINGS.featureSeconds * 1000);

    // "All" stays put; the channel names loop past it endlessly (pauses on hover).
    function renderPills() {
      pills.textContent = "";
      var by = {};
      all.forEach(function (v) { by[v.channel] = (by[v.channel] || 0) + v.views; });
      var names = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; });
      function pill(n, copy) {
        var b = el("button", "pill", n);
        b.type = "button";
        b.setAttribute("aria-pressed", String(state.filter === n));
        if (copy) { b.tabIndex = -1; b.setAttribute("aria-hidden", "true"); }
        b.addEventListener("click", function () {
          state.filter = n;
          state.limit = SETTINGS.pageSize;
          renderPills();
          renderGrid();
        });
        return b;
      }
      pills.appendChild(pill("All"));
      var viewport = el("div", "marquee");
      var track = el("div", "marquee__track");
      var setA = el("div", "marquee__set"), setB = el("div", "marquee__set");
      names.forEach(function (n) { setA.appendChild(pill(n)); setB.appendChild(pill(n, true)); });
      track.appendChild(setA);
      track.appendChild(setB);
      viewport.appendChild(track);
      pills.appendChild(viewport);
      var keepAt = marquee.el ? marquee.pos : 0;
      marquee.el = viewport;
      marquee.set = setA;
      marquee.pos = keepAt;
      viewport.scrollLeft = keepAt;
      bindMarquee(viewport);
    }

    // Channel row: drifts on its own and loops forever, but people can also swipe, trackpad-scroll
    // or drag it. Any touch, drag, scroll or hover pauses the drift; it resumes 2s after.
    var marquee = { el: null, set: null, pos: 0, pausedUntil: 0, hover: false, last: 0 };
    var reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    function wrap() {
      var w = marquee.set.offsetWidth;
      if (w > 0) {
        while (marquee.pos >= w) marquee.pos -= w;
        while (marquee.pos < 0) marquee.pos += w;
      }
    }
    function frame(now) {
      var dt = marquee.last ? (now - marquee.last) / 1000 : 0;
      marquee.last = now;
      var m = marquee;
      if (m.el && !reduceMotion && !m.hover && now > m.pausedUntil && !document.hidden) {
        m.pos += SETTINGS.marqueeSpeed * Math.min(dt, 0.1);
        wrap();
        m.el.scrollLeft = m.pos;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    function bindMarquee(vp) {
      function pause() { marquee.pausedUntil = performance.now() + 2000; }
      vp.addEventListener("scroll", function () {
        if (Math.abs(vp.scrollLeft - marquee.pos) <= 2) return; // our own drift
        marquee.pos = vp.scrollLeft; // someone scrolled it
        wrap();
        if (Math.abs(vp.scrollLeft - marquee.pos) > 2) vp.scrollLeft = marquee.pos;
        pause();
      }, { passive: true });
      vp.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") marquee.hover = true; });
      vp.addEventListener("pointerleave", function () { marquee.hover = false; pause(); });
      vp.addEventListener("touchstart", pause, { passive: true });
      vp.addEventListener("wheel", pause, { passive: true });
      // mouse drag to scroll; a drag doesn't count as a click on a channel
      var drag = null;
      vp.addEventListener("pointerdown", function (e) {
        if (e.pointerType !== "mouse") return;
        drag = { x: e.clientX, start: vp.scrollLeft, moved: false };
      });
      window.addEventListener("pointermove", function (e) {
        if (!drag) return;
        var dx = e.clientX - drag.x;
        if (Math.abs(dx) > 4) drag.moved = true;
        if (drag.moved) { vp.scrollLeft = drag.start - dx; pause(); }
      });
      window.addEventListener("pointerup", function () {
        if (drag && drag.moved) {
          vp.addEventListener("click", function stop(ev) { ev.stopPropagation(); ev.preventDefault(); }, { capture: true, once: true });
        }
        drag = null;
      });
    }

    function renderGrid() {
      grid.textContent = "";
      more.textContent = "";
      var list = currentList();
      list.slice(0, state.limit).forEach(function (v) {
        var c = el("button", "card");
        c.type = "button";
        c.appendChild(thumb(v, false));
        c.appendChild(el("span", "card__title", v.title));
        c.appendChild(el("span", "mono dim", meta(v)));
        c.addEventListener("click", function () {
          state.sel = v;
          state.auto = false;
          state.playing = false;
          renderFeature();
          feature.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        grid.appendChild(c);
      });
      if (list.length > state.limit) {
        var b = el("button", "pill", "Show more (" + (list.length - state.limit) + ")");
        b.type = "button";
        b.addEventListener("click", function () { state.limit += SETTINGS.pageSize; renderGrid(); });
        more.appendChild(b);
      }
    }

    getData().then(function (v) {
      root.textContent = "";
      if (!v.length) {
        var a = el("a", "mono", "See every edit on YouTube ↗");
        a.href = "https://www.youtube.com/playlist?list=PLUp31RSSTci0";
        root.appendChild(a);
        return;
      }
      all = v;
      var cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - SETTINGS.allMonths);
      shuffled = v.filter(function (x) {
        var t = Date.parse(x.published);
        if (!t) { // offline snapshot only has "3mo ago" style ages
          var m = /^(\d+)\s*(d|w|mo|y)/.exec(x.ago || "");
          if (!m) return false;
          t = Date.now() - m[1] * { d: 1, w: 7, mo: 30.44, y: 365.25 }[m[2]] * 864e5;
        }
        return t >= cutoff.getTime();
      });
      if (shuffled.length < 6) shuffled = v.slice(); // safety net if the playlist ever goes quiet
      for (var i = shuffled.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1)), tmp = shuffled[i];
        shuffled[i] = shuffled[j]; shuffled[j] = tmp;
      }
      var best = {};
      all.forEach(function (x) { if (!best[x.channel] || x.views > best[x.channel].views) best[x.channel] = x; });
      highlights = Object.keys(best).map(function (k) { return best[k]; }).sort(function (a, b) { return b.views - a.views; });
      state.sel = highlights[Math.floor(Math.random() * highlights.length)];
      root.appendChild(feature);
      root.appendChild(pills);
      root.appendChild(grid);
      root.appendChild(more);
      renderFeature();
      renderPills();
      renderGrid();
    });
  }

  // About: swaps the photo for a short bio in the same box, so the page doesn't jump around.
  function initAbout() {
    var btn = $("[data-about-toggle]"), panel = $("[data-about]"), icon = $("[data-about-icon]");
    if (!btn || !panel) return;
    var hero = panel.parentNode, busy = false;
    var phone = window.matchMedia ? matchMedia("(max-width: 600px)") : { matches: false };
    btn.addEventListener("click", function () {
      var open = panel.hidden;
      btn.setAttribute("aria-expanded", String(open));
      icon.textContent = open ? "×" : "+";
      if (!phone.matches) { panel.hidden = !open; return; } // desktop: unchanged
      // phones: the box grows and shrinks smoothly instead of snapping
      if (busy) return;
      busy = true;
      var from = hero.offsetHeight;
      panel.hidden = !open;
      var to = hero.offsetHeight;
      if (!open) { panel.hidden = false; panel.classList.add("is-closing"); }
      hero.style.height = from + "px";
      void hero.offsetHeight;
      hero.style.transition = "height .35s cubic-bezier(.4,0,.2,1)";
      hero.style.height = to + "px";
      setTimeout(function () {
        if (!open) { panel.hidden = true; panel.classList.remove("is-closing"); }
        hero.style.transition = hero.style.height = "";
        busy = false;
      }, 370);
    });
  }

  initAbout();
  initHero();
  initHome();
  initVideos();
})();
