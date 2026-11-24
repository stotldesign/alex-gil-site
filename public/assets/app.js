// alex-gil.com — live view counts + video page
(function () {
  "use strict";

  var SETTINGS = {
    avgMinutesWatched: 12,              // used only for the "years of watching" joke
    pageSize: 12,
    heroSeconds: 3,
    creditsShown: 4,                    // channels named in the "edited for" line
    tickSeconds: 2                      // how often the view counter steps up (by however many real views came in)
  };

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
  function thumb(v, big) {
    var t = el("div", "thumb");
    var img = el("img");
    img.alt = "";
    img.loading = big ? "eager" : "lazy";
    img.src = "https://i.ytimg.com/vi/" + v.id + "/" + (big ? "maxresdefault" : "mqdefault") + ".jpg";
    img.onerror = function () {
      if (big && img.src.indexOf("hqdefault") < 0) { img.src = "https://i.ytimg.com/vi/" + v.id + "/hqdefault.jpg"; return; }
      img.remove(); // leave the plain halftone tile instead of a broken-image icon
    };
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
    return function (s) {
      if (s === current) return;
      if (s.length !== current.length) build(s);
      else {
        for (var i = 0; i < s.length; i++) if (cols[i]) cols[i].style.transform = "translateY(-" + s[i] + "0%)";
        node.lastChild.textContent = s;
      }
      current = s;
    };
  }

  // "edited for" line: the 4 biggest channels by subscribers, each with its small YouTube
  // profile picture, then "+N more" linking to the Video page.
  function renderCredits(node, d) {
    var list = (d.channels || []).slice();
    if (!list.length) {
      // snapshot fallback: no subscriber data, rank by views on Alex's edits instead
      var by = {};
      (d.videos || []).forEach(function (x) { by[x.channel] = (by[x.channel] || 0) + x.views; });
      list = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; }).map(function (n) { return { name: n }; });
    }
    if (!list.length) return;
    var show = SETTINGS.creditsShown;
    node.textContent = "";
    node.appendChild(document.createTextNode("edited for: "));
    list.slice(0, show).forEach(function (c, i) {
      if (i) node.appendChild(el("span", "credit__sep", "·"));
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
      node.appendChild(item);
    });
    if (list.length > show) {
      node.appendChild(el("span", "credit__sep", "·"));
      var more = el("a", "credit credit--more", "+ more");
      more.href = "/video/";
      node.appendChild(more);
    }
  }

  // ---- homepage ----
  function initHero() {
    var hero = $("[data-hero]");
    if (!hero) return;
    var imgs = hero.querySelectorAll("img");
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

    function units() {
      var years = Math.round((t * SETTINGS.avgMinutesWatched) / 525960);
      return [
        "",
        "≈ " + years.toLocaleString("en-US") + " years of people watching",
        "every Angeleno, " + (t / 3800000).toFixed(1) + " times over"
      ];
    }
    var roll = rollingNumber(num);
    function paint() {
      roll(t.toLocaleString("en-US"));
      unitsText.textContent = units()[unit];
    }
    unitsBtn.addEventListener("click", function () { unit = (unit + 1) % 3; paint(); });
    paint();

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
      if (!started || t > goal + 500) t = goal; // first load, or stale number far ahead: snap to it
      started = true;
      paint();
    }
    setInterval(function () {
      var next = target();
      if (next > t) { t = next; paint(); }
    }, SETTINGS.tickSeconds * 1000);
    setInterval(function () { fetchRaw(true).then(apply).catch(function () {}); }, 60000);

    getRaw().then(function (d) {
      var v = (d && d.videos) || [];
      if (!v.length) return;
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
    var state = { sel: null, filter: "All", limit: SETTINGS.pageSize, playing: false };
    var all = [];
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
        var start = function () { state.playing = true; renderFeature(); };
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
        var l = currentList();
        state.sel = l[(l.indexOf(state.sel) + 1) % l.length];
        state.playing = false;
        renderFeature();
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

    function renderPills() {
      pills.textContent = "";
      var by = {};
      all.forEach(function (v) { by[v.channel] = (by[v.channel] || 0) + v.views; });
      var names = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; });
      ["All"].concat(names).forEach(function (n) {
        var b = el("button", "pill", n);
        b.type = "button";
        b.setAttribute("aria-pressed", String(state.filter === n));
        b.addEventListener("click", function () {
          state.filter = n;
          state.limit = SETTINGS.pageSize;
          renderPills();
          renderGrid();
        });
        pills.appendChild(b);
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
      shuffled = v.slice();
      for (var i = shuffled.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1)), tmp = shuffled[i];
        shuffled[i] = shuffled[j]; shuffled[j] = tmp;
      }
      state.sel = shuffled[0];
      root.appendChild(feature);
      root.appendChild(pills);
      root.appendChild(grid);
      root.appendChild(more);
      renderFeature();
      renderPills();
      renderGrid();
    });
  }

  initHero();
  initHome();
  initVideos();
})();
