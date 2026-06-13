# PAT Test PWA

A fast, offline-first portable appliance testing app. Records pass/fail decisions on-site, with full offline support, autocomplete from session history, sticky locations, asset prefixing, Quick Pick and Smart Quick Pick item buttons, Multi Pick sequences, flexible clients & sites, search, filters, bulk edit, JSON backup/restore, dark mode, and CSV export/import.

**Live:** https://exnno.github.io/pat-test-app/
**Current version:** V29 · cache `pat-v29`

## Key features

- **Single-item entry** — one appliance at a time, sticky location field, 9 Quick Pick type buttons, optional asset-number prefix, cross-session autocomplete, copy-last-result.
- **Smart Quick Pick** — learns which item types you test at each location and reorders the Quick Pick buttons accordingly (opt-in). Matching is by shared whole words (an exact location match counts more than a word-overlap one), with a swap-in floor and staple protection so your everyday buttons aren't displaced by a one-off (V27).
- **Multi Pick** — pre-set sequences of item types for repetitive runs.
- **Clients & Sites** — a session can be tied to a client, a site, or both (at least one). Sites can exist without a client ("Unassigned") and be assigned to a client later, or moved between clients. Managed under Settings → Clients.
- **Sessions** — search, filter, lock, bulk edit/export, duplicate-protection on import.
- **CSV export/import** — customisable columns (incl. a separate, optional Client column), single-session import with round-trip support.
- **Backup/restore** — full JSON backup (human-readable), versioned (`backupVersion` 5).
- **Offline-first** — service-worker cached; all data in `localStorage` on the device only.

## Stack

Vanilla HTML / CSS / JS — no frameworks, no build step, no external dependencies. Service-worker cached for full offline use. State lives in `localStorage` (session data is key-shortened/compressed at the storage boundary since v14; backups stay human-readable).

## Files

The app logic was split out of the old single `app.js` into single-concern script files during the V21/V22 refactor. V25 added `dispatch.js` for delegated CLICK handling; V28 (E3-tail) finished the job by moving every stateful input/change handler into `dispatch.js` too, leaving only four focus-sensitive fields directly bound. V29 removed the last two no-op binder shells left over from that migration. They share one global scope and load in a fixed order (see `MAP.md` for what lives where).

**Load order (defined in `index.html`):**

`config.js` -> `state.js` -> `utils.js` -> `storage.js` -> `clients.js` -> `sqp.js` -> `multipick.js` -> `feedback.js` -> `csv.js` -> `backup.js` -> `session.js` -> `render-core.js` -> `render-settings.js` -> `events.js` -> `dispatch.js` -> `boot.js`

- `index.html` — shell; lists the scripts in load order
- `config.js` — constants & defaults, incl. `APP_VERSION`, all storage-key names, and `DEFAULT_CSV_COLUMNS`
- `state.js` — the global `state` object
- `utils.js` — pure stateless helpers
- `storage.js` — persistence boundary: codec, `load()`, `save()`/`saveSessions()`/`saveSettings()`, storage stats
- `clients.js` — Clients & Sites data model (incl. orphan/unassigned sites and assign/move) and Settings->Clients actions
- `sqp.js` — Smart Quick Pick (learned location->type ordering)
- `multipick.js` — Multi Pick sequences
- `feedback.js` — toasts + haptic/flash/sound feedback
- `csv.js` — CSV build/export (incl. the Client/Site column split) and import
- `backup.js` — JSON backup/restore
- `session.js` — sessions, items, and most app logic
- `render-core.js` — main screens (Sessions, Entry, Overview, Edit) + the New Session form and welcome modal
- `render-settings.js` — Settings sub-pages, calculator, About changelog
- `events.js` — direct binding for the four focus-sensitive fields only (`bindFocusFields`) + suggestion re-renders
- `dispatch.js` — delegated click + input + change handling and the three action registries (clicks V25, input/change V28)
- `boot.js` — startup; runs a boot integrity self-check, then `load()`/`render()`. **Runs on load and must load last**
- `styles.css` — themed via CSS variables; light, dark, and system theme
- `sw.js` — service worker; caches the app shell. Its `ASSETS` list must include all scripts in load order. Bump `CACHE_VERSION` on every release.
- `manifest.webmanifest` — PWA manifest
- `icon-192.png`, `icon-512.png` — app icons
- `LICENSE.txt` — proprietary license; all rights reserved
- `MAP.md` — code map: where each function lives
- `PAThandoff_vN.md` — per-release handoff notes (amended in place for hotfixes)

## Deployment

GitHub Pages, auto-deploys on commit to `main`. Edit via the GitHub web UI for quick iterations — **upload file contents, not the folder.**

## Releasing

1. **Always bump `CACHE_VERSION` in `sw.js`** when any file changes (`pat-vN`; hotfix `pat-vN-1`). This is the step that must never be skipped — a stale cache serves old/broken files.
2. **Always bump `APP_VERSION` in `config.js`** for the user-visible version label.
3. If scripts are added/removed, update both the `<script>` tags in `index.html` and the `ASSETS` list in `sw.js` (keep load order; `boot.js` stays last).
4. Roll the About changelog in `render-settings.js` (most recent 3 versions). For feature releases, roll the welcome modal (new `pat:vNNwelcome` key); skip it for pure structural/refactor releases.
5. If the storage schema changes, bump `backupVersion` in `backup.js` and confirm older backups still restore.
6. Replace the changed files via the GitHub web UI and commit each.
7. Wait ~1 min for Pages to redeploy, then verify in incognito before testing the installed PWA.
8. On a phone, fully close the PWA from the app switcher and reopen once or twice to force the service-worker refresh. The app also shows an "Update available" banner when it detects a new version — tap Refresh to activate.
9. **Run the release's post-commit test checklist** (every release ships with one in its handoff) to confirm the new features/fixes actually work on the live app — not just that the deploy landed.

### Hotfixes

A hotfix (e.g. `v25.1`, `v25.2`) bumps the cache to `pat-vNN-1` and **amends the existing handoff doc** for that version to record what changed, why, and which files were touched — so the handoff stays the accurate current-state record.

(c) 2026 Peter Birchley. All rights reserved.
