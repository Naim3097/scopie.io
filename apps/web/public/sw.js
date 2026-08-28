// Scopie service worker — minimal by design.
// A video feed should NOT cache media (HLS segments are streamed, not stored).
// This SW exists to make the app installable; offline caching of the app
// shell can be added deliberately later.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(
    // Sweep any caches an earlier worker generation may have left behind —
    // this SW itself never caches, so anything found is dead storage.
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  ),
);
