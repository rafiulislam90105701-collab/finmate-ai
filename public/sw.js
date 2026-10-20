const CACHE = "finmate-shell-v4";
const SHELL = ["/", "/offline", "/icons/finmate-icon.svg", "/icons/finmate-icon-192.png", "/icons/finmate-icon-512.png", "/icons/finmate-maskable-192.png", "/icons/finmate-maskable-512.png", "/apple-touch-icon.png"];
self.addEventListener("install", (event) => event.waitUntil(Promise.all([caches.open(CACHE).then((cache) => cache.addAll(SHELL)), self.skipWaiting()])));
self.addEventListener("activate", (event) => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith("finmate-shell-") && key !== CACHE).map((key) => caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") { event.respondWith(fetch(request).catch(() => caches.match("/offline"))); return; }
  if (["script", "style"].includes(request.destination)) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }
  if (["image", "font"].includes(request.destination)) {
    event.respondWith(caches.open(CACHE).then((cache) => cache.match(request).then((hit) => hit || fetch(request).then((response) => {
      if (response.ok) void cache.put(request, response.clone());
      return response;
    }))));
  }
});
