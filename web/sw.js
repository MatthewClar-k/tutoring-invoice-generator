// Network-first service worker: online, always serve the latest deploy (and
// refresh the cache); offline, fall back to the cached copy.
const CACHE = "tutoring-invoices-v1";
const FILES = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "invoice.js",
  "render.js",
  "vendor/jspdf.umd.min.js",
  "manifest.webmanifest",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) =>
        hit || (e.request.mode === "navigate" ? caches.match("index.html") : Response.error()))),
  );
});
