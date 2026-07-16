const CACHE = "murmur-v8";
const ASSETS = ["./", "./index.html", "./styles.css?v=8", "./app.js?v=8", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (response.ok && new URL(request.url).origin === location.origin) cache.put(request, response.clone());
      return response;
    } catch {
      return caches.match(request) || caches.match("./") || caches.match("./index.html");
    }
  })());
});
