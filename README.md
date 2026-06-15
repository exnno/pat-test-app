# PAT Test PWA

A fast, offline-first portable appliance testing app. Records pass/fail decisions on-site, with full offline support, autocomplete from session history, sticky locations, asset prefixing, Quick Pick and Smart Quick Pick item buttons, Multi Pick sequences, flexible clients & sites, search, filters, bulk edit, JSON backup/restore, dark mode, CSV export/import, and branded PDF report generation.

**Live:** https://exnno.github.io/pat-test-app/
**Current version:** V34 · cache `pat-v34`

## Key features

- **Single-item entry** — one appliance at a time, sticky location field, 9 Quick Pick type buttons, optional asset-number prefix, cross-session autocomplete, copy-last-result.
- **Smart Quick Pick** — learns which item types you test at each location and reorders the Quick Pick buttons accordingly (opt-in). Matching is by shared whole words (an exact location match counts more than a word-overlap one), with a swap-in floor and staple protection so your everyday buttons aren't displaced by a one-off (V27).
- **Multi Pick** — pre-set sequences of item types for repetitive runs.
- **Clients & Sites** — a session can be tied to a client, a site, or both (at least one). Sites can exist without a client ("Unassigned") and be assigned to a client later, or moved between clients. Managed under Settings → Clients.
- **Sessions** — search, filter, lock, bulk edit/export, duplicate-protection on import.
- **CSV export/import** — customisable columns (incl. a separate, optional Client column), single-session import with round-trip support.
- **PDF reports (V30)** — turn any session into a branded *Portable Appliance Test Report*: company name/address/logo header, appliance register (Asset ID / Description / Location / Result, plus an automatic Notes column when present), tested/passed/failed totals, optional test-instrument, calibration and recommended-retest details, and an editable declaration + signature line. Configured under Settings → Report Settings behind a master switch that is **off by default** (so a freshly set-up device can't generate an unconfigured report); when on, a Reports button appears on the Sessions screen and the session Overview. Generated on-device, fully offline, and shared via the OS share sheet.
- **Backup/restore** — full JSON backup (human-readable), versioned (`backupVersion` 5; report settings are included additively).
- **Export/Import Setup (V31)** — share your *configuration* (Quick Pick presets, fail reasons, descriptions, report settings incl. logo, CSV columns, tester/calibration details, and app preferences) as a small self-describing `pat-setup` file, so a second device or a new engineer can be set up to match in seconds. Found on Settings → Data → Export / Import Setup (its own page since V33). Export uses progressive disclosure (one-tap "Share setup", or open "Choose what to include" to leave sections out) and the bundle carries a user-given name. Import **replaces only the settings it carries and never touches sessions, clients or sites** — and a separate file kind means a full backup can't be imported as a setup (or vice versa). Built to be reused later as "team admin pushes a setup to all engineers" in the planned cloud product.
- **Custom report file names (V31)** — set how report PDFs are named under Settings → Report Settings, using tappable tokens (`{site}`, `{client}`, `{date}`, `{engineer}`) that fill in per session; the default reproduces the original `PAT_Report_<site>_<date>` naming, and any single report can be renamed in the preview before sharing.
- **Settings home + search (V32)** — Settings is a two-level structure: a hub of six categories (User & Calibration, Testing Setup, Reports & Output, App & Display, Data, Help) each opening a sub-list of pages, with a search box at the top that flattens to any matching page (matches titles plus plain-language aliases, e.g. "logo", "earth", "dark"). Back navigation is level-aware (page → its category → hub). Purely presentational — every setting is functionally where it was. Empty screens (Sessions, Overview, Clients, Reports) now show a guiding empty state pointing to the next step.
- **Report signature (V34)** — add your signature to PDF reports by drawing it on screen (finger or stylus) or uploading a PNG/JPEG image, under Settings → Report Settings → Signature. Once set it prints on the declaration line of every report; you can place it left or right of the declaration, and replace or remove it any time. Stored on-device as part of the report settings (so it round-trips through both backups and the Export/Import Setup bundle), and the plain signing line still prints if no signature is set.
- **First-run setup wizard (V33)** — on a genuinely new install, a short three-step walkthrough (intro → import a setup file *or* start fresh → optional engineer name & calibration date) helps get the device ready, which makes kitting out a new engineer's phone quick. It's skippable at every step, shows only on a blank install (existing users see a normal "what's new" note instead, never the wizard), and can be re-run any time from Settings → Help → "Run first-time setup again".
- **Offline-first** — service-worker cached; all data in `localStorage` on the device only.

## Stack

Vanilla HTML / CSS / JS — no frameworks, no build step. Service-worker cached for full offline use. State lives in `localStorage` (session data is key-shortened/compressed at the storage boundary since v14; backups stay human-readable).

**Third-party code:** from V30, the app bundles two MIT-licensed libraries — **jsPDF** and **jsPDF-AutoTable** — for client-side PDF generation. They are vendored as minified UMD files (`jspdf.umd.min.js`, `jspdf.plugin.autotable.min.js`), served from the app's own origin and service-worker cached so reports work fully offline. This is the only third-party code in the app; see `THIRD-PARTY-LICENSES.txt`. MIT permits commercial/subscription use with no royalty. (Prior to V30 the app had no external dependencies at all.)

## Files

The app logic was split out of the old single `app.js` into single-concern script files during the V21/V22 refactor. V25 added `dispatch.js` for delegated CLICK handling; V28 (E3-tail) finished the job by moving every stateful input/change handler into `dispatch.js` too, leaving only four focus-sensitive fields directly bound. V29 removed the last two no-op binder shells left over from that migration. They share one global scope and load in a fixed order (see `MAP.md` for what lives where).

**Load order (defined in `index.html`):**

`config.js` -> `state.js` -> `utils.js` -> `storage.js` -> `clients.js` -> `sqp.js` -> `multipick.js` -> `feedback.js` -> `csv.js` -> `backup.js` -> `session.js` -> `setup.js` -> `jspdf.umd.min.js` -> `jspdf.plugin.autotable.min.js` -> `report.js` -> `render-core.js` -> `render-settings.js` -> `events.js` -> `dispatch.js` -> `boot.js`

- `index.html` — shell; lists the scripts in load order
- `config.js` — constants & defaults, incl. `APP_VERSION`, all storage-key names, `DEFAULT_CSV_COLUMNS`, and the report-settings defaults factory
- `state.js` — the global `state` object (incl. `reportSettings`)
- `utils.js` — pure stateless helpers
- `storage.js` — persistence boundary: codec, `load()`, `save()`/`saveSessions()`/`saveSettings()`, report-settings load/save/validate, storage stats
- `clients.js` — Clients & Sites data model (incl. orphan/unassigned sites and assign/move) and Settings->Clients actions
- `sqp.js` — Smart Quick Pick (learned location->type ordering)
- `multipick.js` — Multi Pick sequences
- `feedback.js` — toasts + haptic/flash/sound feedback
- `csv.js` — CSV build/export (incl. the Client/Site column split) and import
- `backup.js` — JSON backup/restore (incl. report settings)
- `session.js` — sessions, items, most app logic, and report-settings save/logo handling
- `jspdf.umd.min.js`, `jspdf.plugin.autotable.min.js` — vendored MIT PDF libraries (V30)
- `report.js` — PDF report builder, preview modal, and share (V30; V31 adds configurable filenames)
- `setup.js` — Export/Import Setup: config-only shareable bundle build/share/import (V31)
- `render-core.js` — main screens (Sessions, Entry, Overview, Edit), the New Session form, the Reports hub, and the welcome modal
- `render-settings.js` — Settings sub-pages (incl. Report Settings), calculator, About changelog
- `events.js` — direct binding for the four focus-sensitive fields only (`bindFocusFields`) + suggestion re-renders
- `dispatch.js` — delegated click + input + change handling and the three action registries (clicks V25, input/change V28, report actions V30, setup + filename actions V31)
- `boot.js` — startup; runs a boot integrity self-check, then `load()`/`render()`. **Runs on load and must load last**
- `styles.css` — themed via CSS variables; light, dark, and system theme
- `sw.js` — service worker; caches the app shell. Its `ASSETS` list must include all scripts (incl. the two PDF libs + `report.js`) in load order. Bump `CACHE_VERSION` on every release.
- `manifest.webmanifest` — PWA manifest
- `THIRD-PARTY-LICENSES.txt` — MIT notices for the bundled PDF libraries (V30)
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
