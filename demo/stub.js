// The demo's server, inside the page. A classic script that runs before the app's bundle, which
// takes window.fetch when it loads (static/app.js, `const fetch = hearingFetch(window.fetch...)`),
// so every request the app makes lands here.
//
// Three kinds of answer:
//   1. GETs replayed from window.__DEMO_RECORDED__, the answers the app's own server code gave the
//      visitor (portfolio/load.mjs, recordVisitor). The visitor owns none of the recipes and is not
//      an admin.
//   2. The cook log, held in memory, so a reload clears it. This is the only server code restated:
//      app.recipe_stats, and the routes POST /api/recipes/<id>/cooked (both forms), PATCH
//      /api/cooks/<id>, POST .../uncook and POST .../redo-cook, checked in the order app.py checks
//      them. A recipe's GET and the list carry the stats this log gives. tests/dom/portfolio.test.js
//      runs one script of visitor actions against the real routes and against this, and fails on
//      any difference in the answers.
//   3. Anything else: 404 with a message, which the app shows the way it shows any refusal.
// It sends no X-App-Commit header, so the app's reload bar never shows.
(function () {
  "use strict";
  const RECORDED = window.__DEMO_RECORDED__ || {};
  const RATING_STEPS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];       // app.RATING_STEPS
  const CAPTION_MAX = 60;                                              // app.COOK_PHOTO_CAPTION_MAX
  const COOK_SOURCES = ["app", "paprika-import", "rating-inferred", "demo-seed", "demo-2b"];   // app.COOK_SOURCES
  const UNMODELED = "this demo has no server, so it cannot do that";
  const cooks = [];             // {id, recipe_id, cooked_on, source, rating, caption}
  let nextId = 1;

  const pad = (n) => String(n).padStart(2, "0");
  // The server's two clocks: SQLite's date('now') is UTC (a cook with no date), and Python's
  // date.today() is local (the future-date check).
  const utcToday = () => { const d = new Date(); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
  const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const answer = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const parse = (key) => JSON.parse(RECORDED[key]);
  const recipeIds = Object.keys(RECORDED).map((k) => k.match(/^GET \/api\/recipes\/(.+)$/))
    .filter(Boolean).map((m) => decodeURIComponent(m[1]));

  // app.recipe_stats
  const newestFirst = (a, b) => (a.cooked_on < b.cooked_on ? 1 : a.cooked_on > b.cooked_on ? -1 : b.id - a.id);
  function stats(rid) {
    const mine = cooks.filter((c) => c.recipe_id === rid);
    const last = mine.slice().sort(newestFirst)[0];
    const rated = mine.filter((c) => c.rating != null);
    return {
      cook_count: mine.length,
      last_cooked: last ? last.cooked_on : null,
      last_cooked_provisional: !!(last && last.source !== "app"),
      rating: rated.length ? rated.reduce((s, c) => s + c.rating, 0) / rated.length : null,
      rated_cooks: rated.length,
      last_cook_id: last ? last.id : null,
    };
  }
  // app.clean_rating and app.clean_caption: [value, error]
  function cleanRating(raw) {
    if (raw == null) return [null, null];
    if (typeof raw !== "number") return [null, "rating must be a number"];
    if (!RATING_STEPS.includes(raw)) return [null, "rating must be a whole or half star from 0.5 to 5"];
    return [raw, null];
  }
  function cleanCaption(raw) {
    if (raw == null) return [null, null];
    if (typeof raw !== "string") return [null, "caption must be text"];
    const c = raw.trim() || null;
    if (c != null && c.length > CAPTION_MAX) return [null, `caption must be ${CAPTION_MAX} characters or fewer`];
    return [c, null];
  }
  // datetime.date.fromisoformat, for the YYYY-MM-DD form the page sends
  function realDate(raw) {
    if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const [y, m, d] = raw.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? raw : null;
  }
  const exists = (rid) => recipeIds.includes(rid);

  function logCook(rid, p) {                                // app.log_cook
    const date = p.date;
    if (date != null) {
      if (!realDate(date)) return answer({ error: "date must be a real date in YYYY-MM-DD form" }, 400);
      if (date > localToday()) return answer({ error: "cook date cannot be in the future" }, 400);
    }
    const [rating, rErr] = cleanRating(p.rating);
    if (rErr) return answer({ error: rErr }, 400);
    const [caption, cErr] = cleanCaption(p.caption);
    if (cErr) return answer({ error: cErr }, 400);
    if (!exists(rid)) return answer({ error: "recipe not found" }, 404);
    const c = { id: nextId++, recipe_id: rid, cooked_on: date || utcToday(), source: "app", rating, caption };
    cooks.push(c);
    return answer({ ...stats(rid), cook_log_id: c.id });
  }
  function undoCook(rid) {                                  // app.undo_cook
    if (!exists(rid)) return answer({ error: "recipe not found" }, 404);
    const last = cooks.filter((c) => c.recipe_id === rid).sort((a, b) => b.id - a.id)[0];
    let undone = null;
    if (last) {
      cooks.splice(cooks.indexOf(last), 1);
      undone = { cooked_on: last.cooked_on, source: last.source, cleared_rating: last.rating, caption: last.caption };
    }
    return answer({ ...stats(rid), undone });
  }
  function redoCook(rid, p) {                               // app.redo_cook
    const [rating, rErr] = cleanRating(p.rating);
    if (rErr) return answer({ error: rErr }, 400);
    const [caption, cErr] = cleanCaption(p.caption);
    if (cErr) return answer({ error: cErr }, 400);
    if (!p.cooked_on || !realDate(p.cooked_on)) return answer({ error: "cooked_on must be a real date in YYYY-MM-DD form" }, 400);
    if (p.cooked_on > localToday()) return answer({ error: "cook date cannot be in the future" }, 400);
    if (!COOK_SOURCES.includes(p.source)) return answer({ error: "unknown cook source" }, 400);
    if (!exists(rid)) return answer({ error: "recipe not found" }, 404);
    cooks.push({ id: nextId++, recipe_id: rid, cooked_on: p.cooked_on, source: p.source, rating, caption });
    return answer(stats(rid));
  }
  function editCook(id, p) {                                // app.edit_cook
    const c = cooks.find((x) => x.id === id);
    if (!c) return answer({ error: "cook not found" }, 404);
    const values = {};
    if ("rating" in p) {
      const [rating, err] = cleanRating(p.rating);
      if (err) return answer({ error: err }, 400);
      values.rating = rating;
    }
    if ("caption" in p) {
      const [caption, err] = cleanCaption(p.caption);
      if (err) return answer({ error: err }, 400);
      values.caption = caption;
    }
    if (!Object.keys(values).length) return answer({ error: "nothing to change — send a rating or a caption" }, 400);
    Object.assign(c, values);
    return answer({ ...stats(c.recipe_id), cook_log_id: c.id });
  }

  function route(method, path, p) {
    let m;
    if (method === "GET" && path === "/api/recipes") {
      return answer(parse("GET /api/recipes").map((r) => {
        const s = stats(r.id);
        const dates = cooks.filter((c) => c.recipe_id === r.id).map((c) => c.cooked_on).sort();
        return { ...r, cook_count: s.cook_count, rating: s.rating, rated_cooks: s.rated_cooks,
                 last_cooked: dates.length ? dates[dates.length - 1] : null };
      }));
    }
    if (method === "GET" && (m = path.match(/^\/api\/recipes\/([^/]+)$/)) && RECORDED[`GET ${path}`]) {
      return answer({ ...parse(`GET ${path}`), stats: stats(decodeURIComponent(m[1])) });
    }
    if (method === "GET" && RECORDED[`GET ${path}`]) return answer(parse(`GET ${path}`));
    if (method === "POST" && (m = path.match(/^\/api\/recipes\/([^/]+)\/cooked$/))) return logCook(decodeURIComponent(m[1]), p);
    if (method === "POST" && (m = path.match(/^\/api\/recipes\/([^/]+)\/uncook$/))) return undoCook(decodeURIComponent(m[1]));
    if (method === "POST" && (m = path.match(/^\/api\/recipes\/([^/]+)\/redo-cook$/))) return redoCook(decodeURIComponent(m[1]), p);
    if (method === "PATCH" && (m = path.match(/^\/api\/cooks\/(\d+)$/))) return editCook(Number(m[1]), p);
    return answer({ error: UNMODELED }, 404);
  }

  window.fetch = async function (input, opts) {
    const o = opts || {};
    const method = String(o.method || "GET").toUpperCase();
    const url = new URL(String(input), location.href);
    let p = {};
    if (typeof o.body === "string") { try { p = JSON.parse(o.body) || {}; } catch (_) { p = {}; } }
    return route(method, url.pathname, p);
  };
  window.__demoRoute = route;     // the test's door to the same routes, with no page around them
  if (!location.hash && recipeIds.length) location.replace("#/recipe/" + encodeURIComponent(recipeIds[0]));

  // THE LANDING. The app has no anchors inside a recipe page, so this layer scrolls to a part of
  // it. One function serves both callers: the case study's frame (case-study.js calls
  // window.__demoLand) and a phone link from the case study, which names the part with
  // ?at=<selector>, and &all when every match is the part.
  // - It scrolls as soon as the recipe has drawn and the part is there.
  // - Photos load after that, and each one above or inside the part moves it, so the scroll is
  //   made again as each image loads, and once more when the fonts are ready. It never waits for an
  //   image. A lazy one below the part may never load, and one that does only lengthens the page.
  // - It stops after LIMIT ms, or at a wheel, a click, a touch or a key, which it listens for from
  //   the start. It returns a function that stops it.
  // - A browser scrolls a wheel or a swipe before the page hears of it, so the input events alone
  //   come too late, and a photo can load in between and have the landing pull the page back. So
  //   once the landing has scrolled, any scroll it did not make stops it too, read as the window no
  //   longer being where it last put it, and it checks that again before every scroll it makes.
  //   Before its first scroll there is no such place to compare, so then only the input events
  //   stop it, and a drag on the scrollbar does not.
  // - While it runs, the browser's scroll anchoring is off. Anchoring moves the window itself when
  //   a photo above loads, which would read as the visitor's scroll. The landing makes that
  //   correction instead, and puts anchoring back when it stops.
  // A part up to half the window's height is centered, then lifted ROOM px, and never closer than
  // ROOM to the top, so what sits just above it (a recipe's title over Plan ahead's times) stays in
  // view. A taller part, such as the album, has its top ROOM px down.
  const ROOM = 56, LIMIT = 2000, USER = ["wheel", "touchstart", "pointerdown", "keydown"];
  function land(spec) {
    let stopped = false, timer = 0, last = null;
    const root = document.documentElement, anchoring = root.style.overflowAnchor || "";
    const stop = () => {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      USER.forEach((t) => window.removeEventListener(t, stop, true));
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("load", onLoad, true);
      root.style.overflowAnchor = anchoring;
    };
    // Someone else scrolled: the window is more than a pixel from where the landing last put it.
    const moved = () => last !== null && Math.abs(window.scrollY - last) > 1;
    const parts = () => {
      const stats = document.querySelector(".stats");
      if (!stats || stats.getAttribute("data-rid") !== spec.slug) return [];
      let els = [];
      try { els = Array.from(document.querySelectorAll(spec.sel)); } catch (_) { return []; }
      return spec.all ? els : els.slice(0, 1);
    };
    const place = () => {
      if (moved()) { stop(); return false; }
      const els = parts();
      if (!els.length) return false;
      let top = Infinity, bottom = -Infinity;
      for (const el of els) {
        const b = el.getBoundingClientRect();
        top = Math.min(top, b.top); bottom = Math.max(bottom, b.bottom);
      }
      const h = bottom - top, at = top + window.scrollY;
      const y = h > window.innerHeight / 2 ? at - ROOM : Math.min(at - window.innerHeight / 2 + h / 2 - ROOM, at - ROOM);
      window.scrollTo({ top: Math.max(0, y), behavior: "instant" });
      last = window.scrollY;
      return true;
    };
    function onScroll() { if (moved()) stop(); }
    function onLoad(e) { if (!stopped && last !== null && e.target && e.target.tagName === "IMG") place(); }
    USER.forEach((t) => window.addEventListener(t, stop, true));
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("load", onLoad, true);
    root.style.overflowAnchor = "none";
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!stopped && last !== null) place(); });
    let tries = 0;
    (function look() {
      if (stopped) return;
      if (!place()) {
        if (stopped) return;
        if (tries++ < 80) timer = setTimeout(look, 100); else stop();
        return;
      }
      timer = setTimeout(stop, LIMIT);
    })();
    return stop;
  }
  window.__demoLand = land;
  const query = typeof URLSearchParams === "function" && location.search ? new URLSearchParams(location.search) : null;
  const opened = /^#\/recipe\/([^/?#]+)$/.exec(location.hash || "");
  if (query && query.get("at") && opened && typeof document !== "undefined") {
    land({ slug: decodeURIComponent(opened[1]), sel: query.get("at"), all: query.has("all") });
  }
})();
