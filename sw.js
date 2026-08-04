// Service worker — caches app shell for full offline use.
// (c) 2026 Peter Birchley. All rights reserved.
// Bump CACHE_VERSION when you change app files to force update.
//
// Per-version history lives in the PAThandoff_vNN.md docs, not here (v50: the
// v7–v39 changelog comment trail that had accumulated in this header was removed
// as part of the V50 cleanup — it duplicated the handoffs and drifted out of date).
//
// THE ONE RULE: bump CACHE_VERSION on every release (and update ASSETS below only
// when app files are added or removed). The cache key is what pulls a new build
// onto already-installed PWAs; shipping without bumping it strands users on the
// old version served from cache.
const CACHE_VERSION = 'pat-v62-1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './config.js',
  './state.js',
  './utils.js',
  './storage.js',
  './clients.js',
  './sqp.js',
  './multipick.js',
  './feedback.js',
  './bugreport.js',
  './photos.js',
  './csv.js',
  './backup.js',
  './session.js',
  './setup.js',
  './tour.js',
  // v51: jsPDF + autotable stay PRECACHED but are no longer in index.html's
  // <script> chain — report.js injects them lazily on first report (from this
  // cache, so reports work offline from first install). See loadReportEngine().
  './jspdf.umd.min.js',
  './jspdf.plugin.autotable.min.js',
  './report.js',
  './pdfpreview.js',
  './render-core.js',
  './render-settings.js',
  './events.js',
  './dispatch.js',
  './boot.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(ASSETS))
    // v61.2: the temporary install-time skipWaiting() used to recover from the
    // v61 deadlock has been REMOVED, deliberately. It has to go: with it in
    // place, every future update activates immediately, and the controllerchange
    // listener in boot.js reloads the page — so an engineer mid-job would have
    // the app reload under them. The update banner exists precisely so THEY
    // choose the moment. Waiting is the correct behaviour.
    //
    // What makes waiting safe again is the v61.2 boot.js: registerServiceWorker()
    // is now reachable even when load() throws, so a page can always register,
    // always receive the update, and always post SKIP_WAITING. The deadlock that
    // made the recovery necessary can no longer form.
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// App posts {type: 'SKIP_WAITING'} when the user taps the update banner.
// We then activate, which fires controllerchange in the page → page reloads.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(resp => {
        // Cache same-origin successful GETs as we go
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const copy = resp.clone();
          caches.open(CACHE_VERSION).then(c => c.put(event.request, copy));
        }
        return resp;
      }).catch(() => cached);
    })
  );
});
