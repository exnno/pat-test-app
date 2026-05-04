# PAT Test PWA

A fast, offline Progressive Web App for PAT testing.

## Files
- `index.html` — main page
- `styles.css` — styling
- `app.js` — application logic
- `sw.js` — service worker (offline caching)
- `manifest.webmanifest` — install metadata
- `icon-192.png`, `icon-512.png` — app icons

## How it works
- All data is stored on the device (`localStorage`). Nothing is sent anywhere.
- The service worker caches every file on first visit, so the app then runs with no internet.
- "Add to Home Screen" on a phone makes it open like a native app.

## Hosting
Upload the whole folder to any static host (GitHub Pages, Netlify, Cloudflare Pages, etc.).
The site **must** be served over HTTPS for the service worker (and offline mode) to work.
Once installed, the phone has its own copy and works with no signal.

## Updates
When you change any file, increment `CACHE_VERSION` in `sw.js` so phones pick up the new version on next launch.
