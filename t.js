/* Medición propia de Highway: visitas, clics y formularios de las landings.
   No guarda lo que la persona escribe: solo qué página vio, qué botón tocó y si envió un formulario. */
(function () {
  if (window.__htaT) return;
  window.__htaT = 1;
  var ENDPOINT = "https://hta-eventos-dashboard.vercel.app/api/t";
  var DAY = 864e5;

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function readJSON(k) { try { return JSON.parse(lsGet(k) || "null"); } catch (e) { return null; } }
  function randomId() {
    var a = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }

  // Identificador propio de la persona (no depende de IP ni de Framer).
  var vid = lsGet("hta_vid");
  if (!vid) {
    var m = document.cookie.match(/(?:^|;\s*)hta_vid=([a-f0-9]{32})/);
    vid = m ? m[1] : randomId();
    lsSet("hta_vid", vid);
  }
  document.cookie = "hta_vid=" + vid + "; path=/; max-age=" + 180 * 86400 + "; samesite=lax; secure";

  // Guarda la versión del experimento (hta_e/hta_v) y el anuncio (utm_*) para las páginas siguientes.
  function capture(search) {
    var p = new URLSearchParams(search || location.search), src = {}, has = false;
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(function (k) {
      if (p.get(k)) { src[k] = p.get(k).slice(0, 100); has = true; }
    });
    if (has) lsSet("hta_src", JSON.stringify(src));
    var v = p.get("hta_v"), e = p.get("hta_e");
    if (e && (v === "A" || v === "B")) lsSet("hta_exp", JSON.stringify({ e: e.slice(0, 40), v: v, t: Date.now() }));
  }

  // Versión que sirvió Framer en esta carga (routeId del HTML). Solo vale para la página con la que se entró.
  var entryPath = location.pathname;
  function pageId() {
    if (location.pathname !== entryPath) return null;
    try {
      var el = document.getElementById("main");
      var j = el && JSON.parse(el.getAttribute("data-framer-hydrate-v2") || "{}");
      return j && typeof j.routeId === "string" ? j.routeId.slice(0, 20) : null;
    } catch (e) { return null; }
  }

  function currentPath() { try { return decodeURIComponent(location.pathname); } catch (e) { return location.pathname; } }
  function device() { return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "mobile" : "desktop"; }

  function send(type, extra) {
    var x = readJSON("hta_exp");
    var ev = {
      vid: vid, type: type, path: currentPath(),
      search: location.search.slice(0, 1000), ref: (document.referrer || "").slice(0, 300),
      device: device(), src: readJSON("hta_src") || {}, page_id: pageId(),
    };
    if (x && Date.now() - x.t < 30 * DAY) { ev.exp = x.e; ev.arm = x.v; }
    for (var k in extra) ev[k] = extra[k];
    var body = JSON.stringify(ev);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain" }))) return;
    } catch (e) {}
    try { fetch(ENDPOINT, { method: "POST", body: body, keepalive: true, mode: "no-cors", headers: { "Content-Type": "text/plain" } }); } catch (e) {}
  }

  // Primera visita: usa la URL original guardada por el bloque inline del <head>, por si Framer la cambió.
  var first = window.__htaFirst;
  capture(first && first.search);
  var lastPath = "";
  function pageview(extra) {
    capture();
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    send("pageview", extra || {});
  }

  // Framer cambia de página sin recargar: también contamos esas visitas.
  ["pushState", "replaceState"].forEach(function (fn) {
    var orig = history[fn];
    history[fn] = function () { var r = orig.apply(this, arguments); setTimeout(pageview, 0); return r; };
  });
  window.addEventListener("popstate", function () { setTimeout(pageview, 0); });

  document.addEventListener("click", function (e) {
    var el = e.target && e.target.closest ? e.target.closest("a,button,[role=button],input[type=submit]") : null;
    if (!el) return;
    var label = (el.innerText || el.value || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 120);
    send("click", { label: label, href: (el.getAttribute("href") || "").slice(0, 300) });
  }, true);

  document.addEventListener("submit", function (e) {
    var f = e.target;
    send("form_submit", { label: (f && (f.getAttribute("name") || f.id)) || "form" });
  }, true);

  pageview(first && first.search ? { search: first.search.slice(0, 1000) } : {});
})();
