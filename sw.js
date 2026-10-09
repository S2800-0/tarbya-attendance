const CACHE = "tarbya-attendance-v3";
const FILES = ["./", "index.html", "manifest.webmanifest", "icon.svg", "logo.png", "icon-192.png", "icon-512.png",
  "vendor/qrcode.js", "vendor/jsQR.js", "vendor/fflate.js",
  "fonts/plex-arabic-400.woff2", "fonts/plex-arabic-500.woff2", "fonts/plex-arabic-600.woff2", "fonts/plex-arabic-700.woff2",
  "fonts/plex-latin-400.woff2", "fonts/plex-latin-600.woff2", "fonts/plex-mono-500.woff2"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("index.html")))
  );
});
