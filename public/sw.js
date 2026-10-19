const CACHE = "finmate-shell-v2";
const SHELL = ["/", "/offline", "/icons/finmate-icon.svg", "/icons/finmate-icon-192.png", "/icons/finmate-icon-512.png", "/icons/finmate-maskable-192.png", "/icons/finmate-maskable-512.png", "/apple-touch-icon.png"];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL))));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") { event.respondWith(fetch(request).catch(() => caches.match("/offline"))); return; }
  if (["script", "style", "image", "font"].includes(request.destination)) event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((response) => { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(request, copy)); return response; })));
});
