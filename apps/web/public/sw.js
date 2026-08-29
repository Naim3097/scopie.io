// Scopie service worker — minimal by design.
// A video feed should NOT cache media (HLS segments are streamed, not
// stored), and pages stay network-first so deploys are never stale. The one
// cached asset is the offline page: an installed app cold-launched without a
// connection must land on a branded screen, not the browser's error page.
const SHELL_CACHE = "scopie-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((c) => c.add("/offline.html"))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) =>
  event.waitUntil(
    // Sweep caches from earlier worker generations; spare the live shell.
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  ),
);

self.addEventListener("fetch", (event) => {
  // Navigations only — every subresource stays untouched (network-first app).
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/offline.html")));
  }
});
