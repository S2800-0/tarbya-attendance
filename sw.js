// Bump on every release so phones pick up the new files.
const CACHE = "tarbya-attendance-v4";
const FILES = ["/", "/index.html", "/styles.css", "/manifest.webmanifest", "/icon.svg", "/logo.png", "/icon-192.png", "/icon-512.png",
  "/js/app.js", "/js/nid.js", "/js/db.js", "/js/xlsx.js",
  "/vendor/qrcode.js", "/vendor/jsQR.js", "/vendor/fflate.js",
  "/fonts/plex-arabic-400.woff2", "/fonts/plex-arabic-500.woff2", "/fonts/plex-arabic-600.woff2", "/fonts/plex-arabic-700.woff2",
  "/fonts/plex-latin-400.woff2", "/fonts/plex-latin-600.woff2"];

self.addEventListener("install", (e) => {
  // No skipWaiting here: the page shows "update available" and the user chooses when to reload.
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(FILES.map((f) => c.add(f).catch(() => {})))));
});
self.addEventListener("message", (e) => { if (e.data === "skipWaiting") self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first (fresh when online), cache when offline.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("/index.html")))
  );
});
