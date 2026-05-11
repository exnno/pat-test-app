// Service worker — caches app shell for full offline use.
// Bump CACHE_VERSION when you change app files to force update.
//
// v7: removed self.skipWaiting() from install. New SW now sits in 'waiting' state
// until the app explicitly tells it to activate. The app shows an "Update available"
// banner; tapping Refresh sends a SKIP_WAITING message and the page reloads.
//
// v8: cache bump for fixes (date field height, defensive DOM hygiene against
// orphaned modal backdrops causing the "taps do nothing" bug) plus new features
// (lock-session toggle, working resistance calculator, About changelog).
//
// v8-1: hotfix for the actual root cause of "taps do nothing". The bug wasn't
// orphaned overlays — it was [data-theme] selector colliding with the data-theme
// attribute applied to <html> by applyTheme(). Renamed button attribute to
// data-set-theme. See app.js bindEvents() comment for detail.
//
// v8-2: v8-1 unstuck the System button but Light/Dark still broke fields on
// iOS PWA. Hypothesis: WebKit in PWA mode disrupts form-input focus when a
// data-* attribute is present on <html>. Replaced data-theme on <html> with
// classes (.theme-force-light / .theme-force-dark). Same effect on CSS, no
// data-* attribute on the root element. Confirmed fix by Peter on iOS PWA.
//
// v9: new defaults (items, fails, descriptions), Quick Pick presets, reset
// buttons on each settings sub-page, haptic on fail-modal commits, backup
// includes presets.
//
// v10: CSV import (strict, single-session), Web Share API for CSV export
// with iOS share-glyph icon, sessions list search bar (matches site/engineer/
// date/name and asset/location/item/notes within items, jumps to first item
// match), session-scoped location autofill mirroring item-type autocomplete,
// unsaved-textarea-edit guard on preset switch.
const CACHE_VERSION = 'pat-v10';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(ASSETS))
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
