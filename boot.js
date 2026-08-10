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
  // v61.2: ALSO CHECK CRITICAL CONSTANTS. Top-level `const` does NOT attach to
  // `window`, so the function loop above is structurally blind to a missing
  // constant — which is how the V61 white screen got past it.
  //
  // ✅ v63: THE OLD WARNING HERE IS GONE, AND THAT IS THE POINT OF THE RELEASE.
  // This check used to name a version-specific constant (`V62_WELCOME_KEY`) and
  // carried a warning to roll it every release. That made the guard itself a
  // SIXTH coupled file rather than a fix: if boot.js was the stale one, it
  // checked the previous release's name, passed happily, and load() threw anyway.
  //
  // `WELCOME_KEY` is now a fixed, derived name (config.js) that never changes
  // between releases. There is nothing to roll here, and nothing to forget.
  //
  // The check is KEPT because it still earns its place: it is now a cheap probe
  // for "did config.js parse at all", which is the remaining way constants can go
  // missing. Catching that here converts a silent white screen into the designed
  // recovery path, BEFORE any storage call is made.
  //
  // ⚠ v68 CORRECTION. This comment used to end "`typeof` on an undeclared
  // identifier is safe and never throws." That is true of an UNDECLARED
  // identifier and it is why this line is written with `typeof` — but it is NOT
  // true of the `state` check further up, and the distinction is the whole of
  // defect D1. `state` is DECLARED (`let state = {…}` in state.js). If config.js
  // fails to parse, that initialiser throws, `state` is left in the temporal
  // dead zone, and `typeof state` throws a ReferenceError rather than returning
  // 'undefined'. So this function CAN throw, and the caller below must not
  // assume otherwise. Do not reintroduce the old claim.
  if (typeof WELCOME_KEY === 'undefined') {
    console.error('Boot integrity check failed: WELCOME_KEY missing — config.js did not load or did not parse (partial deploy or stale cache)');
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

// v68 (D1): the guard call is WRAPPED. bootIntegrityOK() can itself throw — see
// the correction note inside it — and this `if` was unprotected, so the throw
// escaped, the recovery screen below never painted, and the user got a blank
// white screen with no message and no report link. That is the exact failure
// this whole block exists to prevent, arriving through the front door.
//
// A throw is treated as a FAILED check, never a passed one. Anything that stops
// the guard from completing is by definition a build we must not run load() on.
let _bootIntegrity = false;
try {
  _bootIntegrity = bootIntegrityOK();
} catch (e) {
  console.error('Boot integrity check threw — treating as failed.', e);
  _bootIntegrity = false;
}

if (!_bootIntegrity) {
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
// v61.2: load() is now INSIDE a try/catch. It never was, which is why a throw in
// here produced a blank screen with no message rather than the recovery prompt
// the app has had since v16.1 for render() failures.
let _bootLoadOK = true;
try {
  load();
} catch (e) {
  _bootLoadOK = false;
  console.error('load() failed during boot — not rendering, and NOT saving.', e);

  // ⚠ NEUTRALISE save() AND render() FOR THE REST OF THIS PAGE'S LIFE.
  //
  // This is the part that matters most, and it is not paranoia. A failed load()
  // leaves `state` holding its EMPTY DEFAULTS — no sessions, no clients, no
  // settings. Anything that subsequently calls save() would write those empties
  // straight over the user's real data. Anything that calls render() would paint
  // an empty but usable-looking app over the error message below, inviting the
  // user to start working in it — and the first log would save().
  //
  // The concrete route is not hypothetical: registerServiceWorker() runs after
  // this block (deliberately — see below), and when it finds an update it calls
  // showUpdateBanner(), which calls render(). So without this, a failed boot
  // could repaint itself into an empty app on its own.
  //
  // Replacing both with no-ops makes the empty state physically unwritable and
  // the error screen unpaintable-over. The page can do nothing except show the
  // message and reload.
  try { save = function () {}; } catch (e2) {}
  try { render = function () {}; } catch (e2) {}

  const failEl = document.getElementById('app');
  if (failEl) {
    failEl.innerHTML =
      '<div style="padding:24px;font-family:system-ui,-apple-system,sans-serif;color:#111;line-height:1.5">' +
      '<h2 style="margin:0 0 8px">Update needed</h2>' +
      '<p style="margin:0 0 16px">The app didn\'t finish updating, so it couldn\'t start. <strong>Your saved data is safe and untouched</strong> — nothing has been changed or overwritten. Tap Reload to finish updating. If it keeps happening, fully close the app from the app switcher and open it again.</p>' +
      '<button onclick="location.reload()" style="padding:12px 18px;font-size:16px;font-weight:700;background:#2563eb;color:#fff;border:none;border-radius:10px">Reload</button>' +
      _crashReportLink('load() threw during boot: ' + (e && e.message ? e.message : 'unknown')) +
      '</div>';
  }
}
if (_bootLoadOK) {
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
// v67.1: bind the HID barcode scanner's keydown listener. Same once-at-boot,
// document-capture lifecycle as the three above.
//
// ⚠ THIS LINE WAS MISSING FROM V65 THROUGH V67. scanner.js was written, loaded,
// cached and shipped, and handleScannerKeydown() was never attached to anything
// — so not one scan was ever detected, in any release. It presented as a series
// of unrelated-looking faults (had to tap the box first; a re-scan appended
// instead of replacing; the scan after a PASS did nothing; the settings test log
// stayed empty) and each one got diagnosed on its own merits, because the
// symptoms were all real. They were all this.
//
// typeof-guarded because scanner.js is an optional subsystem (MAP rule 6) — a
// missing or unparsed scanner.js must never stop the app booting. ⚠ But note
// what that guard cost here: an absent function and an unbound listener look
// identical at runtime, which is precisely why nothing complained for three
// releases. The harness now asserts the binding by dispatching a real keydown
// through document rather than by calling the handler, which is the only shape
// of test that could have caught it.
if (typeof initScanner === 'function') initScanner();

// v69 (D5): one-time apostrophe repair on stored locations and item types.
//
// Placement is deliberate on both sides. AFTER load(), because it rewrites the
// data load() just read — and it is inside the `else` branch of the integrity
// guard, so a half-loaded build never reaches it and never rewrites data it may
// have read incorrectly. BEFORE the first render(), so the very first screen the
// user sees is already correct rather than flickering from wrong to right.
//
// try/catch because this is a data rewrite running before the user can do
// anything: a throw here must not be the reason the app fails to start. The
// repair latches itself, so a failure is a job left undone, not a boot loop.
try {
  if (typeof runApostropheRepair === 'function') runApostropheRepair();
} catch (e) {
  console.error('Apostrophe repair failed; continuing with unrepaired data.', e);
}

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
// v62: build the in-memory photo count index from IndexedDB, then repaint so
// the Overview's photo chips appear. Deliberately placed AFTER the first
// render(), not before it:
//   - it is async, and the app must not wait on a database to show its first
//     screen. A cold start with a slow disk would otherwise stall behind it.
//   - photos are evidence, not core data. If IndexedDB is unavailable, blocked,
//     or throws, photoIndexLoad() resolves false, the counts stay at zero, the
//     photo UI simply doesn't appear, and everything else works exactly as
//     before. It is wrapped and guarded on typeof as well, so a missing or
//     failed photos.js can never stop the app starting — the same posture as
//     initErrorCapture() above.
try {
  if (typeof photoIndexLoad === 'function') {
    photoIndexLoad().then((loaded) => {
      // Only repaint if something was actually found. A user with no photos —
      // which is everyone on the day this ships — gets no second render at all.
      if (loaded && state.photoIndex && Object.keys(state.photoIndex).length) render();
    }).catch(() => {});
  }
} catch (e) {
  console.error('Photo index failed to load (non-fatal).', e);
}
}   // end if (_bootLoadOK)  — v61.2
}   // end else (boot integrity OK)
// registerServiceWorker() runs REGARDLESS of everything above, and MUST stay
// outside both blocks. It is the mechanism by which a broken cached build gets
// replaced. In v61 a throw in load() killed this line too, so the page could
// never register, never receive an update, and never message SKIP_WAITING — the
// new worker waited forever and the stale cache kept being served. The app was
// deadlocked and could not recover itself. Keeping this reachable on every path
// is what makes a bad release survivable without a one-off recovery deploy.
registerServiceWorker();
