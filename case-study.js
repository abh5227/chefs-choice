// The case study's one script.
// - Every [data-go] button (a margin note or a feature button) shows one feature's caption and view.
// - A feature with an app view opens the demo on its sample recipe: in the frame on a wide screen,
//   and as a link on a phone. The caption names the sample (data-sample, an index into the build's
//   slug list) and the part of the page to point at (data-sel).
// - The frame is the same origin as the page, so the frame's window is asked to scroll to that part,
//   by the demo's own landing (stub.js, window.__demoLand), which the phone link uses as well. The
//   app has no anchors inside a recipe page, so this is the only way to point at one. It needs the
//   demo served from this page's origin, and the class names in data-sel to stay what the app calls
//   them. On another origin the app simply opens at its top.
// - Every press re-applies its feature, the one already selected included: the frame goes back to
//   that recipe and that part, wherever the visitor has taken it since.
// - On a phone the link carries the part as ?at=<selector> (and &all for data-all), which the
//   demo's stub.js reads to land there. The frame's "Open on its own page" follows whatever recipe the frame is showing.
// - On the drawing, each margin note sits level with its part of the page, with a line drawn to it
//   that crosses no text, since a line through words is how the app marks a cook's edit.
//   The notes are for mouse and touch. They are out of the tab order and hidden from screen
//   readers, and the feature buttons are the path for both.
// - The chosen feature is kept in the address as ?feature=<key>, so Back from a phone link, which
//   reloads this page, opens the feature the visitor left.
// - The top bar's section links mark the section in view with aria-current="location".
(function () {
  "use strict";
  var slugs = JSON.parse(document.getElementById("cs-slugs").textContent);
  var frame = document.querySelector(".cs-aw-frame");
  var WIDE = 800, TALL = 680;   // the app is drawn at 800 px, above every breakpoint it has, and scaled to fit
  var media = function (q) { return window.matchMedia(q).matches; };
  var phone = function () { return media("(max-width: 600px)"); };
  var narrow = function () { return media("(max-width: 1080px)"); };
  var reduce = function () { return media("(prefers-reduced-motion: reduce)"); };
  var current = null, ticket = 0;

  function route(slug) { return "#/recipe/" + encodeURIComponent(slug); }

  function appSpec(key) {
    var cap = document.querySelector('.cs-cap .cs-sc[data-show="' + key + '"]');
    if (!cap || !cap.hasAttribute("data-sample")) return null;
    return { slug: slugs[Number(cap.getAttribute("data-sample"))], sel: cap.getAttribute("data-sel"),
             all: cap.hasAttribute("data-all") };
  }

  function fit() {
    if (!frame) return;
    var w = frame.parentElement.clientWidth;
    if (!phone() && w > 0 && w < WIDE) {
      var k = w / WIDE;
      frame.style.width = WIDE + "px"; frame.style.height = (TALL / k) + "px"; frame.style.transform = "scale(" + k + ")";
    } else { frame.style.width = ""; frame.style.height = ""; frame.style.transform = ""; }
  }

  // The frame lands by the demo's own landing, so the frame and a phone link land the same way. A
  // new press stops the landing before it, so the two never pull the frame in turn.
  var landing = null;
  function pointAt(spec, mine) {
    var tries = 0;
    if (landing) { try { landing(); } catch (e) { /* its page has gone */ } landing = null; }
    (function look() {
      if (mine !== ticket) return;
      // On another origin, which a file:// page is to its frame in some browsers, reading the
      // frame's window throws. The app then opens at its top, and the press goes on.
      var win = null, ready = false;
      try { win = frame.contentWindow; ready = !!win && typeof win.__demoLand === "function"; } catch (e) { return; }
      if (ready) {
        landing = win.__demoLand({ slug: spec.slug, sel: spec.sel, all: spec.all });
        return;
      }
      if (tries++ < 80) setTimeout(look, 100);
    })();
  }

  // "Open on its own page" names the recipe the frame shows now, so a visitor who went back to All
  // recipes inside the frame opens All recipes.
  function followFrame() {
    var hash = "";
    try { hash = frame.contentWindow.location.hash; } catch (e) { return; }
    var a = document.querySelector('[data-open="frame"]');
    if (a && hash) a.setAttribute("href", "demo/index.html" + hash);
  }
  if (frame) frame.addEventListener("load", function () {
    try { frame.contentWindow.addEventListener("hashchange", followFrame); } catch (e) { /* another origin */ }
    followFrame();
  });

  // A press that changes the frame's recipe replaces the frame's entry rather than adding one, so
  // Back never moves the frame away from the feature the caption still names. The first load goes
  // by src, from the frame's empty first page, which adds no entry either.
  function open(spec) {
    var mine = ++ticket;
    if (!frame || phone()) return;
    var here = "";
    try { here = frame.contentWindow.location.pathname; } catch (e) { /* not loaded yet */ }
    if (/\/demo\/(index\.html)?$/.test(here)) {
      var loc = frame.contentWindow.location;
      if (loc.hash !== route(spec.slug)) loc.replace(loc.href.split("#")[0] + route(spec.slug));
    } else {
      frame.src = "demo/index.html" + route(spec.slug);
    }
    pointAt(spec, mine);
  }

  // A query, not a hash, so it never meets #recipe, #inside or #learned, and replaceState, so a
  // press adds no step to Back.
  var FEATURE = "feature";
  function known(key) {
    return Array.prototype.some.call(document.querySelectorAll("[data-go]"), function (b) { return b.getAttribute("data-go") === key; });
  }
  function remember(key) {
    try {
      var u = new URL(location.href);
      if (u.searchParams.get(FEATURE) === key) return;
      u.searchParams.set(FEATURE, key);
      history.replaceState(history.state, "", u.href);
    } catch (e) { /* an address this page cannot rewrite */ }
  }
  function remembered() {
    var key = null;
    try { key = new URL(location.href).searchParams.get(FEATURE); } catch (e) { /* no URL here */ }
    return key && known(key) ? key : null;
  }
  function asked() {
    try { return new URL(location.href).searchParams.has(FEATURE); } catch (e) { return false; }
  }

  function show(key, scroll) {
    var spec = appSpec(key);
    document.querySelectorAll(".cs-sc").forEach(function (el) {
      var k = el.getAttribute("data-show");
      el.hidden = !(k === key || (k === "app" && spec));
    });
    document.querySelectorAll("[data-go]").forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-go") === key ? "true" : "false");
    });
    document.querySelectorAll('[data-open="phone"]').forEach(function (a) {
      a.setAttribute("href", "demo/index.html" + (spec ? "?at=" + encodeURIComponent(spec.sel) + (spec.all ? "&all" : "") + route(spec.slug) : ""));
    });
    document.querySelectorAll('[data-open="frame"]').forEach(function (a) {
      a.setAttribute("href", "demo/index.html" + (spec ? route(spec.slug) : ""));
    });
    document.querySelectorAll(".cs-dr-lines g").forEach(function (g) { g.classList.toggle("cs-on", g.getAttribute("data-k") === key); });
    if (spec) open(spec);
    current = key;
    fit();
    if (scroll) {
      var inside = document.getElementById("inside");
      if (inside && inside.getBoundingClientRect().top > window.innerHeight * 0.55) {
        inside.scrollIntoView({ behavior: reduce() ? "auto" : "smooth", block: "start" });
        return true;
      }
    }
    return false;
  }

  // The drawing. The page is laid out at 960 px and scaled to the sheet, and cut off below the
  // lowest marked part. Each note goes in the margin on its part's side, level with it, pushed down
  // only as far as it takes to clear the note above.
  var dr = document.querySelector("[data-cs-drawing]");
  var PHONE_TALL = 600;   // px: on a phone the drawing stops here, under the same fade
  // A note's end is its part's TEXT where the part holds text, measured with a Range, so a byline
  // whose box runs the full width beside the Hero is met at its last word, not at the box's edge.
  // Each line of text then takes in the padding and border of every element around it, up to the
  // part, each kept inside that element's own box. A pill such as the step note's NOTE marker is
  // met at its edge, not at its letters, and every dot sits DOT px off the box it marks. A control
  // with a visible edge is met at that edge on the sides a line reaches, the left and the right.
  // The scale's round buttons have no padding, and their letters sit in the middle of a 42 px ring.
  // `k` is the drawing's scale, since a computed padding is in the page's px and a rect in the
  // screen's.
  var CONTROL = "button, input, select, [role=button]";
  function seen(c) { return !!c && c !== "transparent" && !/[,/]\s*0\)$/.test(c); }
  function edged(el, cs) {
    if (!el.matches(CONTROL)) return false;
    if (seen(cs.backgroundColor) || (cs.backgroundImage && cs.backgroundImage !== "none")) return true;
    return ["Left", "Right", "Top", "Bottom"].some(function (s) {
      return parseFloat(cs["border" + s + "Width"]) > 0 && cs["border" + s + "Style"] !== "none" && seen(cs["border" + s + "Color"]);
    });
  }
  function partRect(t, k) {
    var box = t.getBoundingClientRect();
    if (!t.textContent.trim() || !document.createRange || !document.createTreeWalker) return box;
    var range = document.createRange();
    if (!range.getClientRects) return box;     // jsdom's Range has none, and every browser's has
    var px = function (v) { return parseFloat(v) || 0; };
    var u = null;
    var walk = document.createTreeWalker(t, NodeFilter.SHOW_TEXT, null);
    for (var n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!/\S/.test(n.nodeValue)) continue;
      range.selectNodeContents(n);
      var rs = range.getClientRects();
      for (var i = 0; i < rs.length; i++) {
        if (!(rs[i].width > 0 && rs[i].height > 0)) continue;
        var e = { left: rs[i].left, top: rs[i].top, right: rs[i].right, bottom: rs[i].bottom };
        for (var el = n.parentElement; el; el = el.parentElement) {
          var cs = window.getComputedStyle(el), eb = el.getBoundingClientRect();
          e.left = Math.min(e.left, Math.max(eb.left, e.left - (px(cs.paddingLeft) + px(cs.borderLeftWidth)) * k));
          e.right = Math.max(e.right, Math.min(eb.right, e.right + (px(cs.paddingRight) + px(cs.borderRightWidth)) * k));
          e.top = Math.min(e.top, Math.max(eb.top, e.top - (px(cs.paddingTop) + px(cs.borderTopWidth)) * k));
          e.bottom = Math.max(e.bottom, Math.min(eb.bottom, e.bottom + (px(cs.paddingBottom) + px(cs.borderBottomWidth)) * k));
          if (edged(el, cs)) { e.left = Math.min(e.left, eb.left); e.right = Math.max(e.right, eb.right); }
          if (el === t) break;
        }
        u = u ? { left: Math.min(u.left, e.left), top: Math.min(u.top, e.top), right: Math.max(u.right, e.right),
                  bottom: Math.max(u.bottom, e.bottom) } : e;
      }
    }
    if (!u) return box;
    u.width = u.right - u.left; u.height = u.bottom - u.top;
    return u;
  }
  // The header's "+ " hangs in the margin above 1020 px, by its own width, so "and" lines up with
  // the print above it and the + keeps an ordinary space after it.
  var ink = document.querySelector(".cs-hx-ink"), plus = ink && ink.querySelector(".cs-hx-plus");
  function hang() {
    if (!plus) return;
    var w = plus.offsetWidth;
    ink.style.textIndent = !media("(max-width: 1020px)") && w > 0 ? -w + "px" : "";
  }

  // Every word in the drawing, as the box of each line of text it sets. jsdom's Range has no
  // client rects, so there it is empty and every route counts as clear.
  function textBoxes(root) {
    var out = [];
    if (!document.createRange || !document.createTreeWalker) return out;
    var range = document.createRange();
    if (!range.getClientRects) return out;
    var walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    for (var t = walk.nextNode(); t; t = walk.nextNode()) {
      if (!/\S/.test(t.nodeValue)) continue;
      range.selectNodeContents(t);
      var rs = range.getClientRects();
      for (var i = 0; i < rs.length; i++) if (rs[i].width > 0 && rs[i].height > 0) out.push(rs[i]);
    }
    return out;
  }
  var PAD = 3, DOT = 5;   // px: a line keeps PAD clear of any word, and its end dot sits DOT from its part
  function clear(boxes, y, x0, x1) {
    var lo = Math.min(x0, x1), hi = Math.max(x0, x1);
    return boxes.every(function (b) {
      return b.bottom + PAD <= y || b.top - PAD >= y || b.right + PAD <= lo || b.left - PAD >= hi;
    });
  }
  // How a line reaches its part. It leaves its note level, bends only in the strip between the
  // sheet's edge and the first word on that side (inL, inR), and meets the part along a level run
  // that crosses no text. The part's own side, by its center, is tried first, then the other, each
  // at the part's middle and then every 2 px above and below it inside the part. A part no route
  // reaches clear gets the old straight route and data-crosses="text" on its line.
  function reach(r, boxes, edge) {
    var mid = r.top + r.height / 2, ys = [mid];
    for (var dy = 2; dy < r.height / 2 - PAD; dy += 2) ys.push(mid - dy, mid + dy);
    var first = (r.left + r.width / 2) < edge.mid ? "l" : "r";
    var route = function (side, y) {
      var tx = side === "l" ? r.left - DOT : r.right + DOT;
      return { side: side, y: y, tx: tx, ex: side === "l" ? Math.min(edge.inL, tx) : Math.max(edge.inR, tx) };
    };
    var sides = [first, first === "l" ? "r" : "l"];
    for (var i = 0; i < sides.length; i++) {
      for (var j = 0; j < ys.length; j++) {
        var go = route(sides[i], ys[j]);
        if (clear(boxes, go.y, go.ex, go.tx)) { go.clear = true; return go; }
      }
    }
    var old = route(first, mid);
    old.clear = false;
    return old;
  }

  function layout() {
    hang();
    if (!dr) return;
    var sheet = dr.querySelector(".cs-dr-sheet"), art = dr.querySelector(".cs-dr-art"), svg = dr.querySelector(".cs-dr-lines");
    var k = sheet.clientWidth / 960;
    art.style.transform = "scale(" + k + ")";
    var notes = Array.prototype.slice.call(dr.querySelectorAll(".cs-callout"));
    var a = art.getBoundingClientRect(), d = dr.getBoundingClientRect();
    var spots = notes.map(function (n) {
      var t = art.querySelector(n.getAttribute("data-target"));
      return { n: n, r: t ? partRect(t, k) : null };
    });
    var low = 0;
    spots.forEach(function (p) { if (p.r) low = Math.max(low, (p.r.bottom - a.top) / k); });
    // The fade covers the sheet's last px, so the sheet ends a fade's height and a little more below
    // the lowest part, and that part stays clear of it. `low` is measured from the drawing's top,
    // which sits below the sheet's top, so that gap is added too.
    var fade = dr.querySelector(".cs-dr-fade");
    var above = a.top - sheet.getBoundingClientRect().top;
    var tall = Math.round(above + low * k + (fade && fade.offsetHeight ? fade.offsetHeight : 90) + 12);
    sheet.style.height = (phone() ? Math.min(tall, PHONE_TALL) : tall) + "px";
    svg.innerHTML = "";
    if (narrow()) return;
    var s = sheet.getBoundingClientRect();
    var gutter = s.left - d.left - 30;
    var boxes = textBoxes(art);
    var inL = s.left + 8, inR = s.right - 8;
    if (boxes.length) {
      inL = (s.left + Math.min.apply(null, boxes.map(function (b) { return b.left; }))) / 2;
      inR = (s.right + Math.max.apply(null, boxes.map(function (b) { return b.right; }))) / 2;
    }
    var edge = { mid: s.left + s.width / 2, inL: inL, inR: inR };
    var sides = { l: [], r: [] };
    spots.forEach(function (p) {
      if (!p.r) { p.n.classList.remove("cs-placed"); return; }
      p.go = reach(p.r, boxes, edge);
      p.side = p.go.side;
      p.ty = p.go.y - d.top;
      p.n.classList.toggle("cs-side-r", p.side === "r");
      p.n.style.width = gutter + "px";
      p.n.style.left = (p.side === "l" ? 0 : (s.right - d.left + 30)) + "px";
      sides[p.side].push(p);
    });
    ["l", "r"].forEach(function (side) {
      var floor = -Infinity;
      sides[side].sort(function (x, y) { return x.ty - y.ty; }).forEach(function (p) {
        var h = p.n.offsetHeight, top = Math.max(p.ty - h / 2, floor + 10);
        p.n.style.top = top + "px";
        p.n.classList.add("cs-placed");
        floor = top + h;
        var ny = top + h / 2;
        var nx = side === "l" ? gutter + 4 : s.right - d.left + 26;
        var tx = p.go.tx - d.left, ex = p.go.ex - d.left;
        var bend = (ex - nx) * 0.45;
        var g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("data-k", p.n.getAttribute("data-go"));
        if (!p.go.clear) g.setAttribute("data-crosses", "text");
        if (p.n.getAttribute("aria-pressed") === "true") g.classList.add("cs-on");
        var line = "M" + nx + " " + ny + " C" + (nx + bend) + " " + ny + " " + (ex - bend) + " " + p.ty + " " + ex + " " + p.ty +
          " L" + tx + " " + p.ty;
        g.innerHTML = '<path class="cs-edge" d="' + line + '"/><path class="cs-gold" d="' + line + '"/>' +
          '<circle cx="' + tx + '" cy="' + p.ty + '" r="3.5"/>';
        svg.appendChild(g);
      });
    });
  }

  // After a feature button or a margin note, focus moves to its caption's heading, where the page
  // scrolled, so the next Tab goes on from there. A note is hidden from screen readers, so focus
  // must not stay on it.
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-go]");
    if (!b) return;
    var key = b.getAttribute("data-go");
    var scrolled = show(key, true);
    remember(key);
    var h = document.querySelector('.cs-cap .cs-sc[data-show="' + key + '"] h3');
    if (h) h.focus({ preventScroll: scrolled });
  });
  // A phone turned on its side crosses into the frame's layout with no page load, and the frame
  // then loads the current feature.
  var pending = 0, wasPhone = phone();
  window.addEventListener("resize", function () {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(function () {
      layout(); fit();
      var now = phone();
      if (wasPhone && !now && current) { var spec = appSpec(current); if (spec) open(spec); }
      wasPhone = now;
    });
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  window.addEventListener("load", layout);
  if (dr) dr.querySelectorAll(".cs-dr-art img").forEach(function (im) { im.addEventListener("load", layout); });
  layout();
  // A key the page does not know opens Your changes, and the address then says so.
  var start = remembered();
  show(start || "edits", false);
  if (!start && asked()) remember("edits");

  // The top bar's section links. The section in view is the last one whose top has reached the bar's
  // bottom edge, with 16 px to spare for the 8 px a section's scroll-margin leaves when its link is
  // pressed. On a phone the bar scrolls away, and the line is then the window's top. Scrolled to the
  // end of the page, it is the last section, whose top may never reach the bar. Above the first
  // section, in the title, none is marked.
  var sectionLinks = Array.prototype.slice.call(document.querySelectorAll('.cs-links a[href^="#"]'));
  var bar = document.querySelector(".cs-top");
  var marking = 0;
  function markSection() {
    var line = Math.max(bar ? bar.getBoundingClientRect().bottom : 0, 0) + 16, here = null;
    sectionLinks.forEach(function (a) {
      var s = document.getElementById(a.getAttribute("href").slice(1));
      if (s && s.getBoundingClientRect().top <= line) here = a;
    });
    var root = document.documentElement, most = root.scrollHeight - root.clientHeight;
    if (most > 0 && window.scrollY >= most - 2) here = sectionLinks[sectionLinks.length - 1];
    sectionLinks.forEach(function (a) {
      if (a === here) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current");
    });
  }
  window.addEventListener("scroll", function () {
    cancelAnimationFrame(marking);
    marking = requestAnimationFrame(markSection);
  }, { passive: true });
  window.addEventListener("resize", markSection);
  window.addEventListener("load", markSection);
  markSection();
})();
