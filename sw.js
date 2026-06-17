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
//
// v11: backup-reminder banner on Sessions list (7-day trigger, 24h snooze),
// CSV Columns settings page (reorder/hide/rename, header-name-based import),
// extended bulk-edit menu (location/type/notes/delete), tester + calibration
// fields on User Settings, CSV results now Passed/Failed (UI unchanged),
// one-time "what's new in V11" welcome modal.
//
// v12: tester + calibration info now flow through to CSV exports (four new
// columns, default-hidden, picked up automatically by the CSV Columns page).
// Calibration-due chip on User Settings + subtitle on the settings hub when
// cal date is overdue or within 30 days. Search-jump from the Sessions list
// now flashes the matched item briefly on arrival. Page-level scroll killed
// on the entry/test screen — content sized to fit the viewport. Item-type
// autocomplete sorts descriptions already used in the current session to the
// top of the suggestion list. New "what's new in V12" welcome modal.
//
// v12.1: rolled back the no-scroll change from v12. The 100dvh + overflow:
// hidden combo caused the PASS / FAIL row to get pushed off-screen when the
// notes textarea + on-screen keyboard were up, with no recovery via scroll.
// Reverted to v11 scroll behaviour on the entry screen. All other v12
// features (tester+cal in CSV, cal-due chip, search-jump highlight,
// session-first autocomplete, welcome modal) are unchanged.
//
// v13: location is now a required field on every item. Test instrument
// split into Manufacturer + Model on User Settings; CSV combines them as
// a single "Test Instrument" column. Locked sessions stable-sort below
// unlocked ones on the Sessions list regardless of which sort is picked.
// App no longer auto-resumes a locked session on relaunch — drops to
// Sessions list instead. Stronger "Are you sure?" confirm on item delete.
// New "what's new in V13" welcome modal.
//
// v14: sessions now stored compressed (key-shortening codec) for a smaller
// localStorage footprint — legacy v13 data migrates transparently on first
// save. Per-session CSV export tracking with ✓ / ✓✎ badges on the Sessions
// list, an unexported-count nudge, and a reopen warning on already-exported
// sessions. Backup & Restore can clear exported sessions older than a
// configurable age (default 12 months). New "what's new in V14" welcome modal.
//
// v15: the unexported-count nudge is now a tappable button that bulk-exports
// every not-yet-cleanly-exported session in one share/download action.
// Sessions list gains Status + Lock filters beside Sort (persisted). Cal-due
// chip + subtitle read "Due today" on the due date. Page scrollbar hidden
// visually (scroll still works). New "what's new in V15" welcome modal.
//
// v16: Multi Pick — a global, optional feature that logs a preset ordered list
// of item types as PASS in one tap. Up to 6 named multi-picks, configured on a
// new Settings → Multi Pick page with a show/hide toggle (off by default). New
// full-width entry-screen button + bottom sheet, transient "Added N items"
// toast, multiPick added to backup/restore. New "what's new in V16" welcome
// modal. About changelog rolled (V16/V15/V14).
//
// v16.1: HOTFIX. The v16 entry screen crashed (blank screen, couldn't open a
// session) whenever the Multi Pick button was enabled — the button markup read
// `isLocked` before its `const` was initialised (temporal dead zone), and that
// branch only ran when the toggle was on. Moved the Multi Pick block below the
// `isLocked` declaration. Added a boot-level safety net so a render error can
// never brick the app to a blank screen again. Cache bumped to pat-v16-1 so the
// fix actually reaches installed PWAs (a same-key cache would have kept serving
// the broken app.js). Welcome key left at pat:v16welcome (hotfix follows the
// release immediately — no second modal).
//
// v17: Action feedback rework + item timestamps. iOS 26.5 patched the <input
// switch> haptic trick the app used, so newer iPhones had no in-app vibration.
// v17 confirms actions through three channels: haptic (unchanged, where it
// still works), an always-on visual button flash, and an opt-in Web Audio tone
// (distinct per pass/fail/copy, off by default). Plus optional item timestamps:
// stamp the time each item is first logged, shown in the overview and available
// as a new default-hidden CSV column — off by default, no backfill of old
// items. New "what's new in V17" welcome modal (key pat:v17welcome). About
// changelog rolled (V17/V16/V15). New storage keys: pat:soundfx, pat:timestamps.
//
// v17.1: HOTFIX for the visual flash. v17 added the flash class to the tapped
// button, but the click handlers re-render #app immediately (saveItem/render),
// destroying the button before the CSS animation could play — so no flash was
// ever visible. Reworked the flash into a body-level overlay (like the toast)
// that's positioned over the button and survives the re-render.
//
// v17.2: the v17.1 overlay still didn't show on iOS Safari — a box-shadow +
// CSS-variable @keyframes animation on a freshly inserted fixed node silently
// failed to start on WebKit. Reworked again: the overlay's colour, geometry and
// transition are now all set INLINE in JS, with a forced reflow + next-frame
// opacity/transform flip (a plain fade+scale, which WebKit renders reliably).
// Confirmed the haptic/sound/timestamp features were unaffected throughout.
// Cache bumped to pat-v17-2 so the fix reaches devices already on v17 / v17.1.
//
// v18: Smart Quick Pick (opt-in entry-screen quick-pick reordering by location).
// No new asset files; app.js + styles.css changed, so cache bumped to pat-v18.
//
// v18.1: Smart Quick Pick now SWAPS location-specific item types into the row
// (filling up to all 9 slots, learned-first then preset-fill) instead of only
// reordering the fixed preset. app.js-only change; cache bumped to pat-v18-1.
//
// v19: Clients & Sites — a proper client→site data model with a management page
// (Settings → Clients) and a two-field New Session form. Plus an entry-screen
// efficiency change: pass/copy logging now does a partial DOM refresh instead of
// a full re-render. app.js + styles.css changed; cache bumped to pat-v19.
//
// v20: fixes + polish — New Session Client/Site pickers rebuilt as tappable
// lists (the iOS <datalist> never worked); Smart Quick Pick row is now both
// positionally stable (preset buttons keep their place) and frozen per location
// (no more reshuffling mid-logging); a "Rebuild from my sessions" button on the
// Clients page. app.js + styles.css changed; cache bumped to pat-v20.
//
// v21: structural refactor — app.js split into modules (config.js, state.js,
// utils.js, storage.js + the remaining app.js). No behaviour, visual, storage
// or feature change. The four new files are added to the cache list below and
// loaded in order from index.html (config → state → utils → storage → app).
// Cache bumped to pat-v21 so installed PWAs pull the new file set; a stale
// cache would serve the old single app.js with no matching index.html scripts.
//
// v22: refactor part 2 — the remaining app.js is split into eleven more files
// (clients, sqp, multipick, feedback, csv, backup, session, render-core,
// render-settings, events, boot) and app.js is DELETED. Still no behaviour,
// visual, storage, codec or backup change. The ASSETS list below now lists all
// fifteen scripts in load order and NO LONGER includes app.js. Cache bumped to
// pat-v22 — a stale cache would 404 the new files (or serve the now-removed
// app.js) and blank the app. The boot.js crash fallback guards the failure mode.
// v26: Clients & Sites flexibility — a session needs only ONE of client/site;
// orphan sites allowed (Unassigned group) and assignable to clients later; CSV
// Client/Site column split (Client hidden by default = identical exports until
// enabled); CSV share no longer attaches a text note; boot integrity self-check
// added. No new asset files (only existing scripts + styles changed), so the
// ASSETS list is unchanged. Cache bumped to pat-v26 so installed PWAs pull the
// updated files; a stale cache would serve the old build.
// v30: PDF Reports feature. New Report Settings page + top-level Reports hub +
// "Produce Report" on the Overview, all gated by a master switch (default OFF).
// First third-party code in the app: vendored jsPDF + jspdf-autotable (MIT) for
// PDF generation — added to the ASSETS list below so reports work fully offline
// once cached. New app file report.js; config/state/storage/backup/render-*/
// dispatch/session/styles/index changed. Cache bumped to pat-v30 so installed
// PWAs pull the new file set; a stale cache would 404 the new scripts and blank
// the app (the boot.js crash fallback still guards that failure mode).
// v30.1 (hotfix): fixed a spacing bug on the report where a long detail label
// ("Recommended retest") overlapped its value — the value is now placed after
// the label's measured width instead of a fixed offset, and the label was
// shortened. report.js only; cache bumped to pat-v30-1 so the fix reaches
// devices already on v30 (cache-first would otherwise keep serving old report.js).
// v31: Export/Import Setup + named report files. New app file setup.js (config-
// only setup bundle export/import) added to the ASSETS list below. config/state/
// storage/session/report/render-settings/render-core/dispatch/index/styles
// changed; backupVersion unchanged (5). Cache bumped to pat-v31 so installed
// PWAs pull the new file set; a stale cache would 404 setup.js and blank the app
// (the boot.js crash fallback still guards that failure mode).
// v36: certificate numbers (opt-in, assigned once per session, reused) + job
// notes (per-session, printed on the report) + report templates (named full
// reportSettings snapshots, apply/save/rename/delete). New session fields
// (notes, certNo) ride inside `sessions`; new settings (cert fields,
// reportTemplates collection) are additive — all validated on load/restore.
// NO codec change and NO backupVersion bump (all additive, missing-field
// tolerant, per the V30 precedent); old backups restore clean, new backups carry
// the new fields. No new app files. Cache bumped to pat-v36 so installed PWAs
// pull the changed config/state/storage/session/report/backup/setup/render-core/
// render-settings/dispatch/styles set.
// v37: small UI fixes from user feedback — entry-screen back control now uses the
// standard ‹ chevron (was a folder icon), and the session-overview header is
// decluttered: Share + Report stay as header icons, while Select items + Session
// settings become two clearly-labelled text buttons in a row beneath (the ☑/✎
// icons were too similar). Pure UI — no data/codec/settings change, backupVersion
// unchanged (5), no welcome modal (fix-grade, not a feature). No new app files.
// Cache bumped to pat-v37 so installed PWAs pull the changed render-core/
// render-settings/config/styles set.
// v37.1: hotfix — dedicated Copy CSV action (csv.js/dispatch.js/render-core.js);
// cache bumped to pat-v37-1.
// v38: multi-page PDF preview. The report preview used to show only page 1 in an
// iframe on iOS; it now renders every page to stacked canvases via PDF.js
// (Mozilla, Apache-2.0). NEW app file pdfpreview.js (the loader/renderer) is
// precached here. The two heavy PDF.js library files (pdfjs.min.js +
// pdfjs.worker.min.js, ~1.5 MB) are DELIBERATELY NOT in this ASSETS list — they
// are vendored in the repo but fetched lazily from our own origin on the FIRST
// preview, at which point THIS fetch handler auto-caches them (same-origin,
// status 200) into Cache Storage. That keeps startup light and keeps the ~1.5 MB
// in Cache Storage (hundreds of MB on iOS), entirely separate from the ~5 MB
// localStorage data budget. After a cache bump they re-download once (the user is
// already online pulling the new app version). No codec/backup change;
// backupVersion unchanged (5). Cache bumped to pat-v39.
const CACHE_VERSION = 'pat-v43';
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
  './csv.js',
  './backup.js',
  './session.js',
  './setup.js',
  './tour.js',
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
