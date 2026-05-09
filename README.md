# PAT Test PWA

A fast, offline-first portable appliance testing app. Records pass/fail decisions on-site, with full offline support, autocomplete from session history, sticky locations, asset prefixing, search, fails-only filter, bulk edit, JSON backup/restore, dark mode, and CSV export.

**Live:** https://exnno.github.io/pat-test-app/

## Stack

Vanilla HTML / CSS / JS — no frameworks, no build step. Service-worker cached for full offline use. State lives in `localStorage`.

## Files

- `index.html` — shell
- `app.js` — all app logic
- `styles.css` — themed via CSS variables; supports light, dark, and system theme
- `sw.js` — service worker (bump `CACHE_VERSION` on every release)
- `manifest.webmanifest` — PWA manifest
- `icon-192.png`, `icon-512.png` — app icons
- `LICENSE.txt` — proprietary license; all rights reserved

## Deployment

GitHub Pages, auto-deploys on commit to `main`. Edit via the GitHub web UI for quick iterations.

## Releasing

1. **Always bump `CACHE_VERSION` in `sw.js`** when any file changes.
2. **Always bump `APP_VERSION` in `app.js`** for the user-visible version label.
3. Replace files via the GitHub web UI and commit.
4. The app shows an "Update available" banner inside the PWA when it detects the new version — tap Refresh to activate.

© 2026 Peter Birchley. All rights reserved.
