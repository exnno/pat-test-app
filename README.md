# PAT Test PWA

A fast, offline-first portable appliance testing app. Records pass/fail decisions on-site, with full offline support, autocomplete from session history, sticky locations, asset prefixing, Quick Pick and Smart Quick Pick item buttons, Multi Pick sequences, clients & sites, search, filters, bulk edit, JSON backup/restore, dark mode, and CSV export/import.

**Live:** https://exnno.github.io/pat-test-app/
**Current version:** V23 · cache `pat-v23`

## Stack

Vanilla HTML / CSS / JS — no frameworks, no build step, no external dependencies. Service-worker cached for full offline use. State lives in `localStorage` (session data is key-shortened/compressed at the storage boundary since v14; backups stay human-readable).

## Files

The app logic was split out of the old single `app.js` into 15 single-concern script files during the V21/V22 refactor. They share one global scope and load in a fixed order (see `MAP.md` for what lives where).

**Load order (defined in `index.html`):**

`config.js` -> `state.js` -> `utils.js` -> `storage.js` -> `clients.js` -> `sqp.js` -> `multipick.js` -> `feedback.js` -> `csv.js` -> `backup.js` -> `session.js` -> `render-core.js` -> `render-settings.js` -> `events.js` -> `boot.js`

- `index.html` — shell; lists the 15 scripts in load order
- `config.js` — constants & defaults, incl. `APP_VERSION` and all storage-key names
- `state.js` — the global `state` object
- `utils.js` — pure stateless helpers
- `storage.js` — persistence boundary: codec, `load()`, `save()`/`saveSessions()`/`saveSettings()`, storage stats
- `clients.js` — Clients & Sites data model and Settings->Clients actions
- `sqp.js` — Smart Quick Pick (learned location->type ordering)
- `multipick.js` — Multi Pick sequences
- `feedback.js` — toasts + haptic/flash/sound feedback
- `csv.js` — CSV build/export and import
- `backup.js` — JSON backup/restore
- `session.js` — sessions, items, and most app logic
- `render-core.js` — main screens (Sessions, Entry, Overview, Edit)
- `render-settings.js` — Settings sub-pages, calculator, About changelog
- `events.js` — event binding
- `boot.js` — startup; **runs on load and must load last**
- `styles.css` — themed via CSS variables; light, dark, and system theme
- `sw.js` — service worker; caches the app shell. Its `ASSETS` list must include all 15 scripts in load order. Bump `CACHE_VERSION` on every release.
- `manifest.webmanifest` — PWA manifest
- `icon192.png`, `icon512.png` — app icons
- `LICENSE.txt` — proprietary license; all rights reserved
- `MAP.md` — code map: where each function lives
- `PAThandoff_vN.md` — per-release handoff notes

## Deployment

GitHub Pages, auto-deploys on commit to `main`. Edit via the GitHub web UI for quick iterations — **upload file contents, not the folder.**

## Releasing

1. **Always bump `CACHE_VERSION` in `sw.js`** when any file changes (`pat-vN`; hotfix `pat-vN-1`). This is the step that must never be skipped — a stale cache serves old/broken files.
2. **Always bump `APP_VERSION` in `config.js`** for the user-visible version label.
3. If scripts are added/removed, update both the `<script>` tags in `index.html` and the `ASSETS` list in `sw.js` (keep load order; `boot.js` stays last).
4. Roll the About changelog in `render-settings.js` (most recent 3 versions).
5. Replace the changed files via the GitHub web UI and commit each.
6. Wait ~1 min for Pages to redeploy, then verify in incognito before testing the installed PWA.
7. On a phone, fully close the PWA from the app switcher and reopen once or twice to force the service-worker refresh. The app also shows an "Update available" banner when it detects a new version — tap Refresh to activate.

(c) 2026 Peter Birchley. All rights reserved.
