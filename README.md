# PATGo PWA

A fast, offline-first portable appliance testing app (formerly "PAT Test"; renamed PATGo in V48, with the last internal code references swept in V60). Records pass/fail decisions on-site, with full offline support, autocomplete from session history, sticky locations, asset prefixing, Quick Pick and Smart Quick Pick item buttons, Multi Pick sequences, flexible clients & sites, search, filters, bulk edit, cross-session asset history, per-job testing time, photo evidence on fails, JSON backup/restore, dark mode, CSV export/import, and branded PDF report generation with an optional photographic evidence appendix.

**Live:** <https://exnno.github.io/pat-test-app/>
**Current version:** V66 · cache `pat-v66`

## What it does

Full capability and release list: **`FEATURES.md`** (one `##` section per entry).
Where code lives: **`MAP.md`**. Current state and recent decisions: the latest
**`PAThandoff_vNN.md`**. Planned work: **`BACKLOG.md`**.

## Stack

Vanilla HTML / CSS / JS — no frameworks, no build step. Service-worker cached for full offline use. State lives in `localStorage` (session data is key-shortened/compressed at the storage boundary since v14; backups stay human-readable).

**Third-party code:** from V30, the app bundles two MIT-licensed libraries — **jsPDF** and **jsPDF-AutoTable** — for client-side PDF generation. They are vendored as minified UMD files (`jspdf.umd.min.js`, `jspdf.plugin.autotable.min.js`), served from the app’s own origin and service-worker **precached** so reports work fully offline. From V51 they are no longer loaded in the startup `<script>` chain — they’re **injected on demand** on the first report (from the precache), so they no longer add to cold-start cost while still being instantly available offline. From V38 the app also bundles **PDF.js** (Mozilla, Apache-2.0) for the multi-page report preview, vendored as `pdfjs.min.js` + `pdfjs.worker.min.js`; unlike the jsPDF libraries these are **not** precached — they’re fetched lazily from the app’s own origin on the first preview and then service-worker cached. See `THIRD-PARTY-LICENSES.txt`. Both MIT and Apache-2.0 permit commercial/subscription use with no royalty. (Prior to V30 the app had no external dependencies at all.)

## Files

Vanilla scripts sharing one global scope, loaded in a fixed order with `boot.js`
last. No build step — every file is editable from the GitHub web UI.

**The authoritative file list, load order and cross-file coupling live in `MAP.md`.**
This section is deliberately not a second copy: two file lists drift apart, and the
one in `MAP.md` is the one the workflow reads.

## Deployment

GitHub Pages, auto-deploys on commit to `main`. Edit via the GitHub web UI for quick iterations — **upload file contents, not the folder.**

## Releasing

1. **Always bump `CACHE_VERSION` in `sw.js`** when any file changes (`pat-vN`; hotfix `pat-vN-1`). This is the step that must never be skipped — a stale cache serves old/broken files.
1. **Always bump `APP_VERSION` in `config.js`** for the user-visible version label.
1. If scripts are added/removed, update both the `<script>` tags in `index.html` and the `ASSETS` list in `sw.js` (keep load order; `boot.js` stays last).
1. Roll the About changelog in `render-settings.js` (most recent 3 versions). For feature releases, roll the welcome modal — **since V63 this is a one-line change to `WELCOME_VERSION` in `config.js` plus the new copy in `render-core.js`, and nothing else**; skip it entirely for pure structural/refactor releases (leave `WELCOME_VERSION` alone).
1. If the storage schema changes, bump `backupVersion` in `backup.js` and confirm older backups still restore.
1. Replace the changed files via the GitHub web UI and commit each.
1. Wait ~1 min for Pages to redeploy, then verify in incognito before testing the installed PWA.
1. On a phone, fully close the PWA from the app switcher and reopen once or twice to force the service-worker refresh. The app also shows an “Update available” banner when it detects a new version — tap Refresh to activate.
1. **Run the release’s post-commit test checklist** (every release ships with one in its handoff) to confirm the new features/fixes actually work on the live app — not just that the deploy landed.

### Hotfixes

A hotfix (e.g. `v25.1`, `v25.2`) bumps the cache to `pat-vNN-1` and **amends the existing handoff doc** for that version to record what changed, why, and which files were touched — so the handoff stays the accurate current-state record.

(c) 2026 Peter Birchley. All rights reserved.