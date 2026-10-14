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
// V124 (1A 2A 3A 4A): friendlier updates. Before V124 the app looked for a new
// version only on a cold launch. An iPhone home-screen app is mostly brought
// back from the background, which never looked — hence "close it from the app
// switcher and reopen twice" after every release. Now it looks:
//   1A  on launch (register() does that), every time the app comes back to the
//       front (at most once a minute), and at least hourly while it is in use —
//       the hourly look rides the next touch, so an idle app runs no timer;
//   2A  and puts the update in BY ITSELF only at a safe moment: the Jobs list,
//       showing, nothing open, nothing typed, no push in flight, nobody touching
//       the screen for UPDATE_IDLE_MS. Anywhere else the banner shows and the
//       engineer chooses — v61.2's rule (never reload under someone mid-job,
//       see sw.js install) stands. × hides the banner; the update still goes in
//       at the next safe moment.
//   3A  the banner names the version, asked of the waiting worker (sw.js
//       GET_VERSION). An older worker never answers: the plain words stay.
//   4A  no switch — an exception to R30, like Move and Delete.
const UPDATE_CHECK_MS = 60 * 60 * 1000;   // 1A: at least hourly while in use
const UPDATE_RESUME_GAP_MS = 60 * 1000;   // a quick look away and back doesn't re-ask
const UPDATE_IDLE_MS = 3000;              // 2A: untouched this long before it reloads
let _updateReg = null;                    // the registration, once register() resolves
let _updateLastCheck = 0;                 // when the server was last asked
let _updateLastTouch = 0;                 // the last tap or key, anywhere
let _updateTimer = null;                  // the one pending safe-moment check
let _updateApplying = false;              // SKIP_WAITING sent; the reload is coming
let _updateHadController = false;         // V126: the page loaded under a worker (not a first visit)
let _updateAsked = false;                 // V126: we sent SKIP_WAITING (Refresh or the safe moment)
let _updateReloading = false;             // V126: the one reload is under way

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // V126 (1A): read once, now — whether this page loaded under a worker. A
  // first visit has none until the new worker's clients.claim() (sw.js).
  try { _updateHadController = !!navigator.serviceWorker.controller; } catch (e) { _updateHadController = false; }
  // V124: every tap or key counts as "someone is using it" (2A) and carries the
  // hourly look (1A). Capture phase, passive: nothing here may stop a tap.
  try {
    document.addEventListener('pointerdown', updateNoteTouch, true);
    document.addEventListener('keydown', updateNoteTouch, true);
    document.addEventListener('visibilitychange', updateOnResume);
  } catch (e) { /* no document events: launch still looks, the banner still works */ }
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      _updateReg = reg;
      _updateLastCheck = Date.now();   // register() has just looked
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

    // When the active SW changes, reload to use it — only when it REPLACED one
    // (V126 1A, updateOnControllerChange).
    navigator.serviceWorker.addEventListener('controllerchange', updateOnControllerChange);
  });
}

// V126 (1A): a worker taking over reloads the page only when it replaces one —
// the page loaded under a worker, or we asked for the update (SKIP_WAITING).
// On a first visit there is no worker; the new one's clients.claim() (sw.js
// activate) fires controllerchange as well, and reloading then threw away the
// setup wizard about a second in. Nothing is stale on a first visit: the page
// came from the network. An update put in from ANOTHER tab still reloads this
// one (it loaded under the old worker), so two tabs never run two versions.
function updateShouldReload() {
  return _updateHadController || _updateAsked;
}

function updateOnControllerChange() {
  if (_updateReloading || !updateShouldReload()) return false;
  _updateReloading = true;
  window.location.reload();
  return true;
}

// 3A: 'pat-v124' → 'V124', a hotfix 'pat-v124-1' → 'V124.1', anything else → ''.
function updateVersionLabel(key) {
  const m = /^pat-v(\d+)(?:-(\d+))?$/.exec(String(key || ''));
  if (!m) return '';
  return 'V' + m[1] + (m[2] ? '.' + m[2] : '');
}

// Ask the server for a newer sw.js. force: skip the once-a-minute limit.
// Offline, update() rejects — swallowed; the next look tries again.
function updateCheckNow(force) {
  const reg = _updateReg;
  if (!reg || typeof reg.update !== 'function') return false;
  const now = Date.now();
  if (!force && _updateLastCheck && now - _updateLastCheck < UPDATE_RESUME_GAP_MS) return false;   // 0 = never asked
  _updateLastCheck = now;
  try {
    const p = reg.update();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (e) { /* not fatal */ }
  return true;
}

// state, or null. ⚠ MAP D1: when config.js fails to parse, even `typeof state`
// throws (a TDZ binding) — these run from event listeners on a broken load too.
function _updateState() {
  try { return (typeof state === 'object' && state) ? state : null; } catch (e) { return null; }
}

// Every tap or key. The hourly look (1A) and the safe-moment wait (2A).
function updateNoteTouch() {
  const now = Date.now();
  _updateLastTouch = now;
  if (_updateLastCheck && now - _updateLastCheck >= UPDATE_CHECK_MS) updateCheckNow(true);
  const st = _updateState();
  if (st && st.updateAvailable) updateTryLater();
}

// The app comes back to the front (1A).
function updateOnResume() {
  try { if (document.visibilityState === 'hidden') return; } catch (e) { /* treat as showing */ }
  updateCheckNow(false);
  updateTryLater();
}

function _updateFieldHeld() {
  const ae = document.activeElement;
  if (!ae || ae === document.body || !ae.tagName) return false;
  const tag = String(ae.tagName).toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT' || ae.isContentEditable === true) return true;
  if (tag !== 'INPUT') return false;
  const type = String((ae.getAttribute && ae.getAttribute('type')) || ae.type || 'text').toLowerCase();
  return ['checkbox', 'radio', 'button', 'submit', 'reset', 'range'].indexOf(type) === -1;
}

// Anything open over the screen: a sheet, the fail sheet, the certificate
// preview, the welcome / setup / tour backdrop. One selector per call (the
// harness's stub DOM takes no selector lists).
function _updateSheetOpen() {
  for (const sel of ['.bulk-sheet', '.fail-sheet', '.report-preview-sheet', '.modal-backdrop']) {
    try { if (document.querySelector(sel)) return true; } catch (e) { /* keep looking */ }
  }
  return false;
}

// The New job form is OPEN by default on a phone with no jobs (storage.js), so
// "open" can't block — a brand-new user would never update. Typed-in can: any
// box holding something other than what it starts with. Read from the boxes
// (Engineer is only copied to state on Create) and from state (the rest is).
function _updateNewFormTyped() {
  const nf = state.newForm;
  if (!nf || !nf.show) return false;
  const eng = String(state.engineer || '').trim();
  const start = { 'nf-client': '', 'nf-site': '', 'nf-name': '', 'nf-prefix': '', 'nf-start': '1', 'nf-engineer': eng };
  for (const id of Object.keys(start)) {
    const el = document.getElementById(id);
    const v = el ? String(el.value == null ? '' : el.value).trim() : '';
    if (v && v !== start[id]) return true;
  }
  if (nf.name || nf.site || nf.clientId || nf.siteId || nf.prefix) return true;
  if (nf.startNo && String(nf.startNo).trim() !== '1') return true;
  if (nf.engineer && String(nf.engineer).trim() !== eng) return true;
  return false;
}

// 2A: the only moment the app reloads itself. Every condition is a reason a
// reload would lose something or surprise someone.
function updateSafeMoment() {
  if (!_updateState()) return false;
  if (!state.updateAvailable || !state.pendingWorker) return false;
  try { if (document.visibilityState === 'hidden') return false; } catch (e) { /* showing */ }
  if (state.view !== 'sessions') return false;                    // the Jobs list only
  if (_updateNewFormTyped()) return false;                        // a New job half filled in
  if (state.tourOpen) return false;
  if (state.saveFailure && !state.saveFailureDismissed) return false;
  if (state.searchQuery) return false;                            // a search typed
  const cj = state.cloudJobs;
  if (cj && (cj.selecting || cj.busy || cj.q)) return false;      // ticking, deleting, searching
  if (typeof _syncRunning !== 'undefined' && _syncRunning) return false;  // a push in flight
  if (_updateSheetOpen() || _updateFieldHeld()) return false;
  if (_updateLastTouch && Date.now() - _updateLastTouch < UPDATE_IDLE_MS) return false;   // 0 = never touched
  return true;
}

function updateTryApply() {
  if (_updateApplying || !updateSafeMoment()) return false;
  _updateApplying = true;
  applyUpdate();
  return true;
}

// Look again UPDATE_IDLE_MS after the latest touch, redraw or return to the
// front — one timer, pushed back by each. Not safe then → nothing until the next
// touch, redraw or return, so an idle app never polls.
function updateTryLater() {
  const st = _updateState();
  if (!st || !st.updateAvailable || _updateApplying) return;
  if (_updateTimer) clearTimeout(_updateTimer);
  _updateTimer = setTimeout(() => { _updateTimer = null; updateTryApply(); }, UPDATE_IDLE_MS);
}

// 3A: ask the waiting worker its version on a private port.
function updateAskVersion(worker) {
  if (!worker || typeof worker.postMessage !== 'function' || typeof MessageChannel !== 'function') return false;
  try {
    const ch = new MessageChannel();
    ch.port1.onmessage = (ev) => {
      const v = updateVersionLabel(ev && ev.data && ev.data.version);
      if (!v || state.pendingWorker !== worker) return;
      state.updateVersion = v;
      if (state.updateAvailable && !state.updateDismissed) updateRepaint();
    };
    worker.postMessage({ type: 'GET_VERSION' }, [ch.port2]);
    return true;
  } catch (e) { return false; }
}

// MAP rule 3: never redraw under a sheet or under the cursor — 1A now finds
// updates mid-job, where a redraw would drop the keyboard. The next redraw that
// happens anyway shows the banner.
function updateRepaint() {
  if (_updateSheetOpen() || _updateFieldHeld()) return false;
  render();
  return true;
}

function showUpdateBanner(worker) {
  state.updateAvailable = true;
  state.pendingWorker = worker;
  state.updateVersion = '';
  state.updateDismissed = false;
  document.body.classList.add('has-update-banner');
  updateAskVersion(worker);
  updateRepaint();
  updateTryLater();
}

function applyUpdate() {
  if (state.pendingWorker) {
    _updateAsked = true;   // V126: before the message — the takeover may follow at once
    state.pendingWorker.postMessage({ type: 'SKIP_WAITING' });
    // Page will reload via controllerchange listener (updateOnControllerChange).
  } else {
    window.location.reload();
  }
}

// V124: × hides the banner only. The update stays waiting and still goes in at
// the next safe moment (2A); updateAvailable stays true for that.
function dismissUpdateBanner() {
  state.updateDismissed = true;
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
  // v70: ONE PROBE PER SCRIPT FILE IS THE RULE HERE. This list is not "important
  // functions" — it is "did each file execute", and the two entries added in v70
  // (saveReportSettingsForm from settings-actions.js, wizardNextStep from
  // onboarding.js) earn their place only because they are the sole probes for
  // files that did not exist before. The V70 split made a new partial-deploy
  // shape possible: index.html can ship referencing a file that was never
  // uploaded, and without a probe that failure is silent until a user taps
  // something on a settings screen. Add a probe whenever a script file is added.
  const requiredFns = [
    'load', 'save', 'render', 'applyTheme', 'applyTextSize', 'initDelegation', 'loadFormForCursor',
    'loadMultiPickConfig', 'loadClients', 'loadSites', 'composeSiteSnapshot',
    'saveReportSettingsForm', 'wizardNextStep',
    // v72: sole probe for render-review.js (Overview / Edit Session / Retest
    // Reminders / Reports / photo markup, split out of render-core.js). Unlike
    // data.js this file DOES declare functions, so an ordinary requiredFns entry
    // is correct here — no constant probe needed. Without it, a deploy that
    // uploads index.html but not render-review.js boots looking healthy and dies
    // the first time anyone opens a session's Overview.
    'renderOverview',
    // v73: sole probe for render-help.js (About / Glossary / Contact / bug-sheet
    // markup / cloud stubs, split out of render-settings.js). Same reasoning as
    // renderOverview above — this file declares functions, so an ordinary entry
    // is correct. It also declares one const, GLOSSARY_GROUPS, which a
    // requiredFns entry could NOT see (see the data.js note below); the function
    // probe covers the file either way.
    'renderSettingsAbout',
    // V115: sole probe for icons.js. Every screen draws through icon(), so a
    // deploy missing this file must stop here, not blank the first render.
    'icon'
  ];
  for (const name of requiredFns) {
    if (typeof window[name] !== 'function') {
      // Top-level `function` declarations attach to window; a missing one means
      // that script file failed to execute (the exact failure we guard against).
      console.error('Boot integrity check failed: missing', name);
      return false;
    }
  }
  // v71: probe for data.js, the tables split out of config.js.
  //
  // ⚠ THIS CANNOT BE A `requiredFns` ENTRY. data.js declares NO FUNCTIONS AT
  // ALL — deliberately — so the loop above is structurally blind to it whatever
  // name you put in the list. Only a constant probe can see it. Putting the name
  // in requiredFns instead looks right in review and is worse than no check:
  // `typeof window['DEFAULT_ITEM_TYPES']` is never 'function', so the guard would
  // fail on every healthy boot.
  //
  // ⚠ IT MUST STAY ABOVE THE `state` CHECK, and that ordering is the whole value
  // of it. A missing data.js takes state.js's initialiser down with it (state.js
  // seeds itemTypes from DEFAULT_ITEM_TYPES at load), leaving `state` in the
  // temporal dead zone — so if the state check ran first it would THROW here
  // (D1's mechanism) and the console would blame state.js for a data.js problem.
  // Checked in this order, the guard returns false cleanly and names the file
  // that is actually missing.
  if (typeof DEFAULT_ITEM_TYPES === 'undefined') {
    console.error('Boot integrity check failed: DEFAULT_ITEM_TYPES missing — data.js did not load or did not parse (partial deploy or stale cache)');
    return false;
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
      '<button onclick="location.reload()" style="padding:12px 18px;font-size:1rem;font-weight:700;background:#2563eb;color:#fff;border:none;border-radius:10px">Reload</button>' +
      _crashReportLink('The app did not load completely (boot integrity check failed).') +
      '</div>';
  }
  // Deliberately stop here — do NOT call load()/render()/save() with a partial build.
} else {
// V106 (Stage 10 part 2): finish a "Reset this phone" the last page started.
// BEFORE load(), so load() reads the clean phone and nothing in memory can write
// the old data back. After the integrity check, so a half-loaded build never
// deletes anything. Optional (MAP rule 6): no reset.js, no wipe — the safe way.
try {
  if (typeof resetRunPending === 'function') resetRunPending();
} catch (e) {
  console.error('Reset could not finish at start-up (non-fatal).', e);
}
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
      '<button onclick="location.reload()" style="padding:12px 18px;font-size:1rem;font-weight:700;background:#2563eb;color:#fff;border:none;border-radius:10px">Reload</button>' +
      _crashReportLink('load() threw during boot: ' + (e && e.message ? e.message : 'unknown')) +
      '</div>';
  }
}
if (_bootLoadOK) {
applyTheme(state.theme);
applyTextSize(state.textSize);   // V121: before the first render, so nothing jumps
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
// v75: publish the on-screen keyboard's height to <html> so bottom sheets can lift
// clear of it. Same once-at-boot lifecycle as the three above. NOT typeof-guarded:
// events.js is not an optional subsystem (it also owns initDelegation, called two
// lines up), so a missing events.js has already taken the app down before here —
// a guard would only hide which line noticed. The function itself returns
// immediately when there is no visualViewport, so old iOS costs nothing.
initKeyboardInset();
// V87: close suggestion lists when the keyboard hides without a blur (Android) or
// on a tap outside them. Same once-at-boot lifecycle; events.js is not optional.
initSuggestionDismissGuards();
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

// v79: cloud sign-in state. AFTER load() and BEFORE the first render(), so the
// TEST strip is right on the very first paint. The synchronous part only reads
// localStorage; it makes no network request and does not load the library
// unless someone is already signed in (then a background session check runs,
// online only). Optional subsystem (MAP rule 6): typeof-guarded and wrapped —
// a broken cloud.js must never be the reason the app fails to start.
try {
  if (typeof cloudBoot === 'function') cloudBoot();
} catch (e) {
  console.error('Cloud sign-in state failed to load (non-fatal).', e);
}
// v80: sync (push only). AFTER cloudBoot, which decides whether anyone is signed
// in. Registers the reopen / back-online triggers and, if signed in and online,
// schedules one push a few seconds after the first paint — never during it. On a
// host with no cloud it does nothing at all. Optional subsystem, same wrapping.
try {
  if (typeof syncBoot === 'function') syncBoot();
} catch (e) {
  console.error('Sync failed to start (non-fatal).', e);
}

// V99: the app was reloaded while the engineer was in what3words adding a map
// pin — reopen that job on that item with the pin sheet open. BEFORE the first
// loadFormForCursor()/render() below, which build the form for state.cursor.
// typeof-guarded and wrapped: a stale note must never stop the app starting.
try {
  if (typeof mapPinResume === 'function') mapPinResume();
} catch (e) {
  console.error('Map pin resume failed (non-fatal).', e);
  try { localStorage.removeItem(MAP_PIN_OPEN_KEY); } catch (e2) { /* ignore */ }
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
        '<button onclick="location.reload()" style="padding:12px 18px;font-size:1rem;font-weight:700;background:#2563eb;color:#fff;border:none;border-radius:10px">Reload</button>' +
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
      // V101: re-label any photo whose item has moved to another job — heals a
      // store write that failed after a move (photos.js photosSettleJobs).
      if (loaded && typeof photosSettleJobs === 'function') photosSettleJobs();
    }).catch(() => {});
  }
} catch (e) {
  console.error('Photo index failed to load (non-fatal).', e);
}
// V87 (S12, 2C): ask the browser to keep this app's data when the phone runs short
// of space. Chrome and Safari decide silently from how much the app is used — no
// prompt. Only ASKED once the phone holds a real job (the example job doesn't
// count), so a first-time visitor on desktop Firefox isn't shown a permission
// prompt before they've done anything; before that it is only CHECKED, for the
// Backup page's status line. Async and fail-soft: nothing waits on it.
try {
  if (typeof checkStorageProtection === 'function') {
    const hasRealJob = state.sessions.some(s => !(s && s[DEMO_SESSION_FLAG]));
    checkStorageProtection(hasRealJob).catch(() => {});
  }
} catch (e) {
  console.error('Storage protection check failed (non-fatal).', e);
}
// V105 (S14, 2A): the day's snapshot. Inside the good-load block on purpose —
// a load that failed must never be kept as a snapshot. After the first render,
// async and fail-soft like the photo index: nothing waits on it, and a missing
// snapshots.js or a refused database changes nothing else (MAP rule 6).
try {
  if (typeof snapshotsBoot === 'function') snapshotsBoot();
} catch (e) {
  console.error('Daily snapshot failed to start (non-fatal).', e);
}
// V127: the plan (plan.js, optional — MAP rule 6). After the first render, on a
// good load only: what the phone already knows about the account's plan applies
// at once (offline too); then, signed in and online, a quiet fresh read. Fails
// open — a missing or broken plan.js never locks anyone.
try {
  if (typeof planBoot === 'function') planBoot().catch(() => {});
} catch (e) {
  console.error('Plan check failed to start (non-fatal).', e);
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
