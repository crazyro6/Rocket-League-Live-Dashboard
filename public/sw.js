// Minimal service worker — exists so the app is installable as a PWA.
// It intentionally does NOT cache responses: this is a local tool whose proxy
// must be running anyway, and caching would risk serving a stale build.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {
  // No-op: let the browser handle every request normally (network passthrough).
})
