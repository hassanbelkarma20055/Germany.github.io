// Offline support: the page, icons and fonts are kept on the phone after the first visit.
const CACHE = "german-words-ad2ab9a6f5a3";
const MEDIA = "german-words-media";          // sounds and speech fingerprints: kept across updates
const SPEECH = "speech-901cda5fb2.json";
const CORE = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE && key !== MEDIA).map((key) => caches.delete(key))))
      .then(() => caches.open(MEDIA))
      .then((media) => media.keys().then((reqs) => Promise.all(reqs
        .filter((r) => /speech-[0-9a-f]+\.json$/.test(r.url) && !r.url.endsWith(SPEECH)).map((r) => media.delete(r)))))
      .then(() => self.clients.claim())
  );
});

const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const font = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (url.origin !== location.origin && !font) return;
  if (/\.(mp4|pdf)$/.test(url.pathname)) return;

  if (url.origin === location.origin && (/\/audio\/[^/]+\.mp3$/.test(url.pathname) || /speech-[0-9a-f]+\.json$/.test(url.pathname))) {
    // a sound or the speech file: from the phone if it is there, else download once and keep it
    event.respondWith(caches.open(MEDIA).then((media) => media.match(request).then((hit) => hit || fetch(request).then((response) => {
      if (response.ok) media.put(request, response.clone());
      return response;
    }))));
    return;
  }

  if (request.mode === "navigate") {
    // Newest words when online; the saved copy when offline or the network is very slow. The download always
    // finishes in the background and is saved, so a slow phone still gets the new lesson on the next visit.
    const network = fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put("index.html", copy));
      }
      return response;
    });
    event.waitUntil(network.catch(() => {}));
    event.respondWith(
      Promise.race([network, timeout(12000)])
        .catch(() => caches.match("index.html").then((hit) => hit || network))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    }))
  );
});
