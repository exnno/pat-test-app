/*!
 * PATGo PWA
 * v22 (June 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 */

// ============== PATGo PWA — v22 — Boot ==============
// Service-worker register/update + theme apply + crash-fallback boot block.
// RUNS ON LOAD. Must be the LAST script in index.html.

// ---------- Service worker + update detection (v7) ----------
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      // Check if a worker is already waiting from a previous tab/load.
      if (reg.waiting && navigator.serviceWorker.controller) {
        showUpdateBanner(reg.waiting);
      }
      // Watch for new workers becoming installed.
      reg.addEventListener('updatefound', () => {
        const installingWorker = reg.installing;
        if (!installingWorker) return;
        installingWorker.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // A new SW is installed AND there was already a controller — i.e. an update.
            showUpdateBanner(installingWorker);
          }
        });
      });
    }).catch(err => console.log('SW reg failed:', err));

    // When the active SW changes (after we tell it to skipWaiting), reload to use it.
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  });
}

function showUpdateBanner(worker) {
  state.updateAvailable = true;
  state.pendingWorker = worker;
  document.body.classList.add('has-update-banner');
  render();
}

function applyUpdate() {
  if (state.pendingWorker) {
    state.pendingWorker.postMessage({ type: 'SKIP_WAITING' });
    // Page will reload via controllerchange listener.
  } else {
    window.location.reload();
  }
}

function dismissUpdateBanner() {
  state.updateAvailable = false;
  document.body.classList.remove('has-update-banner');
  render();
}
// ---------- Boot ----------
// v26 (Q8): boot integrity self-check. The v26-era data-loss bug was caused by
// two script files both being live for a short window during the refactor, each
// declaring the same global `const`s — a duplicate-const SyntaxError kills a
// whole file, leaving the app half-initialised, after which a save() could
// persist empty defaults over good data. This guard verifies the critical
// pieces all loaded before we touch storage. If anything essential is missing,
// we DO NOT run load()/save() (which is what overwrote data); we show a safe
// reload prompt instead. Cheap insurance against that whole class of bug.
function bootIntegrityOK() {
  const requiredFns = [
    'load', 'save', 'render', 'applyTheme', 'initDelegation', 'loadFormForCursor',
    'loadMultiPickConfig', 'loadClients', 'loadSites', 'composeSiteSnapshot'
  ];
  for (const name of requiredFns) {
    if (typeof window[name] !== 'function') {
      // Top-level `function` declarations attach to window; a missing one means
      // that script file failed to execute (the exact failure we guard against).
      console.error('Boot integrity check failed: missing', name);
      return false;
    }
  }
  if (typeof state === 'undefined' || !state) {
    console.error('Boot integrity check failed: state missing');
    return false;
  }
  return true;
}

// v60 (decision 10A): arm the in-memory error catcher BEFORE anything else boot
// does, so a throw inside load()/render() below is captured and can be carried by
// a bug report. Wrapped in its own try/catch and guarded on the function existing:
// if bugreport.js failed to load, boot must still run normally. This records
// nothing to storage and cannot affect a save.
try {
  if (typeof initErrorCapture === 'function') initErrorCapture();
} catch (e) {
  console.error('Error capture failed to arm (non-fatal).', e);
}

// v60 (decision 11A): a self-contained report link for the two crash screens
// below. DELIBERATELY DUPLICATES a little of bugreport.js rather than calling it:
// these screens are shown precisely when the app has failed to load, so they must
// not depend on any other file having parsed. Everything here is inline string
// building plus navigator.userAgent -- no app globals beyond an optional read of
// APP_VERSION, itself typeof-guarded.
function _crashReportLink(context) {
  try {
    var ver = (typeof APP_VERSION !== 'undefined') ? APP_VERSION : 'unknown';
    var ua = (typeof navigator !== 'undefined') ? navigator.userAgent : 'unknown';
    var body = 'The app would not start.\n\n'
      + 'WHAT HAPPENED: ' + context + '\n\n'
      + '--- DIAGNOSTICS (automatic) ---\n'
      + 'APP: ' + ver + '\n'
      + 'SENT: ' + new Date().toISOString() + '\n'
      + 'DEVICE: ' + ua + '\n'
      + 'ERRORS: ' + context + '\n'
      + '--- END ---';
    var href = 'mailto:hello@patgo.co.uk'
      + '?subject=' + encodeURIComponent('[PATGo BUG P1] ' + ver + ' - app will not start')
      + '&body=' + encodeURIComponent(body);
    return '<p style="margin:16px 0 0"><a href="' + href + '" style="color:#2563eb;font-weight:600">Email a report about this</a></p>';
  } catch (e) {
    return '';
  }
}

if (!bootIntegrityOK()) {
  const appEl = document.getElementById('app');
  if (appEl) {
    appEl.innerHTML =
      '<div style="padding:24px;font-family:system-ui,-apple-system,sans-serif;color:#111;line-height:1.5">' +
      '<h2 style="margin:0 0 8px">Update needed</h2>' +
      '<p style="margin:0 0 16px">The app didn\'t load completely. Your saved data is safe and untouched. Tap Reload to finish updating.</p>' +
      '<button onclick="location.reload()" style="padding:12px 18px;font-size:16px;font-weight:700;background:#2563eb;color:#fff;border:none;border-radius:10px">Reload</button>' +
      _crashReportLink('The app did not load completely (boot integrity check failed).') +
      '</div>';
  }
  // Deliberately stop here — do NOT call load()/render()/save() with a partial build.
} else {
load();
applyTheme(state.theme);
// v25 (E3): attach the single delegated click listener to #app once, before the
// first render. It survives every innerHTML rewrite (it's on #app, not its
// children), so clickable controls wired via data-action never need re-binding.
initDelegation();
// v57: attach the bottom-sheet scroll-drag guard once, same lifecycle as the
// delegated click listener. It listens on the document in the capture phase, so
// it works for every sheet regardless of when that sheet was painted.
initSheetDragGuard();
// v57.1: arm the one-shot ghost-click swallow used by the suggestion dropdowns.
// Document-level capture listener, same once-at-boot lifecycle as the others.
initSuggestionClickSwallow();
// v16.1: boot-level safety net. A throw inside render() (e.g. a screen-specific
// bug like the v16 entry-screen TDZ error) used to leave #app permanently
// blank — and because the service worker serves the cached build, a plain
// reload didn't clear it. Now, if the initial render fails, we drop the
// active-session pointer and fall back to the Sessions list; if even that
// fails, we show a minimal reload prompt. The app can no longer get stuck on a
// blank screen, whatever future bug might slip through.
try {
  loadFormForCursor();
  render();
} catch (e) {
  console.error('Initial render failed; falling back to Sessions list.', e);
  try {
    state.activeId = null;
    state.view = 'sessions';
    state.multiPickSheetOpen = false;
    state.failModalOpen = false;
    render();
  } catch (e2) {
    console.error('Sessions fallback also failed.', e2);
    const appEl = document.getElementById('app');
    if (appEl) {
      appEl.innerHTML =
        '<div style="padding:24px;font-family:system-ui,-apple-system,sans-serif;color:#111;line-height:1.5">' +
        '<h2 style="margin:0 0 8px">Something went wrong</h2>' +
        '<p style="margin:0 0 16px">The app hit an error while loading. Your saved data is safe. Tap Reload to try again.</p>' +
        '<button onclick="location.reload()" style="padding:12px 18px;font-size:16px;font-weight:700;background:#2563eb;color:#fff;border:none;border-radius:10px">Reload</button>' +
        _crashReportLink('The app hit an error while loading: ' + ((e2 && e2.message) ? e2.message : 'unknown error')) +
        '</div>';
    }
  }
}
}
registerServiceWorker();
