// Minimal service worker — exists only to satisfy browsers' installability
// requirement. Deliberately does NOT cache anything: this is a dynamic,
// per-user dashboard app, so caching API/Firestore-backed responses would
// serve stale or cross-account data.
//
// SW_VERSION exists purely so this file's bytes change whenever the
// caching behavior below changes — browsers only re-fetch/update a
// service worker when its script differs byte-for-byte from the one they
// already have installed. Bumping this string is what forces a browser
// stuck on an older (possibly actually-caching) version of this worker to
// pick up the current no-op one. See components/PwaRegister.jsx for the
// client-side half of this (registration.update() + auto-reload once the
// new worker takes over).
const SW_VERSION = "v2-no-cache";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    // Defense in depth: purge any Cache Storage entries a previous
    // version of this worker (or an earlier iteration of the app) may
    // have written, even though this version never writes any itself.
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", () => {
  // Network pass-through — no caching.
});
