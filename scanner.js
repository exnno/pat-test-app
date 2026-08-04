/*
 * PATGo — scanner.js
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 * v65: HID ("keyboard wedge") barcode scanner support.
 *
 * THE WHOLE IDEA, in one paragraph. A HID barcode scanner is not a camera and
 * not an API — it pairs with the phone as a Bluetooth KEYBOARD, and when you
 * pull the trigger it TYPES the barcode, usually followed by Enter. So there is
 * no "scan" button to press and no permission to grant. All this file does is
 * listen to the keyboard at document level, notice when a burst of keystrokes
 * arrives far too fast to have come from a human thumb, and put the result in
 * the right box. Nothing else in the app knows a scanner exists.
 *
 * WHY THE TIMING TEST IS THE WHOLE SAFETY MECHANISM. We cannot ask the browser
 * "was that a scanner?" — a wedge scanner is indistinguishable from a keyboard
 * by design. What we CAN measure is speed: a scanner emits characters roughly
 * 5–20ms apart, while even a very fast typist sits around 80–150ms. So the rule
 * is: every gap in the burst must be under SCAN_MAX_CHAR_GAP_MS, and the burst
 * must be at least SCAN_MIN_LENGTH characters. One slow gap means a human
 * paused, and the buffer is discarded rather than treated as a scan. This is
 * what stops someone hand-typing an asset number and pressing return on the
 * on-screen keyboard from being treated as a scan.
 *
 * ⚠ WE DO NOT preventDefault THE CHARACTER KEYS — ONLY THE TERMINATOR.
 * That is deliberate, and it is the reason this can't break normal typing. At
 * the moment each character arrives we do not yet know whether the burst will
 * turn out to be a scan, so swallowing it would be a guess. Instead the
 * characters are allowed to land wherever they were going AND copied into our
 * buffer in parallel. Only once the terminator arrives (or the burst falls
 * silent) do we judge it — and if it was a scan we overwrite the target field
 * with the buffered text WHOLESALE, which cleans up whatever the characters did
 * on their way past. If it wasn't a scan we have done precisely nothing.
 *
 * ⚠ OVERWRITE, NEVER APPEND. The asset box is pre-filled with the next number
 * when a scan arrives, so writing the buffer over the field (rather than into
 * it) is the entire point — otherwise every scan would read '0042PAT-004821'.
 *
 * WHERE SCANS ARE ACCEPTED (decision 2B): the entry screen (→ asset number),
 * the Sessions list (→ the search box, so scanning an old label pulls up that
 * asset's history), and the Barcode Scanner settings page (→ the test box).
 * Anywhere else, and while any sheet or modal is open, a scan is ignored.
 *
 * KNOWN LIMIT, ACCEPTED AT SPEC TIME: if the cursor is sitting in some OTHER
 * text field (Location, Item type, Notes, a settings box), we bail out entirely
 * and let the characters type into that field as they normally would. Hijacking
 * a field the engineer had deliberately focused would be worse than the
 * occasional barcode landing in the Location box, which is visible and one
 * clear-and-retype to fix.
 */

// ---------------------------------------------------------------------------
// Burst buffer. Module-level `let` rather than state, because none of it is
// data — it is the last ~100ms of keyboard, and it must never be persisted,
// backed up, or survive a render.
// ---------------------------------------------------------------------------
let _scanChars = [];            // characters collected so far in this burst
let _scanGapMax = 0;            // the LARGEST gap seen between them (ms)
let _scanLastTs = 0;            // when the previous character arrived
let _scanTimer = null;          // silence timer (for scanners with no suffix)
let _scanSwallowEnterUntil = 0; // see _scanTimeoutCommit
let _scannerBound = false;      // initScanner is idempotent

function _scanReset() {
  _scanChars = [];
  _scanGapMax = 0;
  _scanLastTs = 0;
  if (_scanTimer) { clearTimeout(_scanTimer); _scanTimer = null; }
}

// Does the buffer look like something a machine typed? Length AND speed both
// have to pass — see the header note on why speed is the safety mechanism.
// SCAN_MAX_LENGTH exists only to reject a runaway (a stuck key, a paste), not
// because long barcodes are suspicious.
function _scanLooksLikeScan() {
  const n = _scanChars.length;
  if (n < SCAN_MIN_LENGTH || n > SCAN_MAX_LENGTH) return false;
  return _scanGapMax <= SCAN_MAX_CHAR_GAP_MS;
}

// ---------------------------------------------------------------------------
// Where would a scan go right now? Returns {kind, el} or null. Null means "not
// interested" — the buffer is dropped and the keystroke is left completely
// alone.
// ---------------------------------------------------------------------------
function _scanTarget() {
  if (!state.scannerEnabled) return null;

  // Any full-screen interruption wins. A scan while the welcome panel, the
  // first-run wizard or the migration prompt is up would write into a field the
  // engineer cannot even see.
  if (!state.welcomeSeen) return null;
  if (!state.onboardedV33Seen) return null;
  if (state.migrationPrompt && state.migrationPrompt.show) return null;

  let el = null;
  let kind = '';

  if (state.view === 'entry') {
    // Every sheet that can cover the entry screen. #f-asset is still in the DOM
    // underneath all of them, which is exactly why this list has to be here.
    if (state.failModalOpen || state.readingsSheetOpen || state.multiPickSheetOpen ||
        state.presetSheetOpen || state.photoStripOpen) return null;
    const sess = activeSession();
    if (!sess || sess.locked) return null;   // a locked job takes no new numbers
    el = document.getElementById('f-asset');
    kind = 'asset';
  } else if (state.view === 'sessions') {
    // The search box is hidden when there is nothing worth searching; then
    // there is simply nowhere to put a scan, and we do nothing.
    el = document.getElementById('sessions-search');
    kind = 'search';
  } else if (state.view === 'settingsScanner') {
    el = document.getElementById('scanner-test');
    kind = 'test';
  }
  if (!el) return null;

  // The focus rule (see the KNOWN LIMIT note in the header). Focus in our own
  // target is fine — we still take over, so behaviour is identical whether or
  // not the engineer happened to tap the box first.
  const ae = document.activeElement;
  if (ae && ae !== el) {
    const tag = ae.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ae.isContentEditable) {
      return null;
    }
  }
  return { kind: kind, el: el };
}

// ---------------------------------------------------------------------------
// The listener. Capture phase on document, bound ONCE at boot — same lifecycle
// as initDelegation / initSheetDragGuard / initSuggestionClickSwallow, so it
// survives every innerHTML rewrite and never needs rebinding after a render.
// ---------------------------------------------------------------------------
function handleScannerKeydown(e) {
  if (!e) return;
  // Auto-repeat from a held key produces machine-speed timings and would sail
  // through the speed test. It is the one non-scanner source of a fast burst,
  // so it is excluded explicitly.
  if (e.repeat) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const ctx = _scanTarget();
  if (!ctx) { _scanReset(); return; }

  const key = e.key;
  const now = Date.now();

  // --- Terminator. Most scanners send Enter; some are configured for Tab. ---
  if (key === 'Enter' || key === 'Tab') {
    const isScan = _scanLooksLikeScan();
    const text = _scanChars.join('');
    _scanReset();
    if (isScan) {
      // Swallow the terminator so it can't do anything else on the way past.
      // preventDefault only — NOT stopPropagation, because other Enter handlers
      // (the name sheet in feedback.js) live in contexts we have already
      // declined above, and blocking them here would be a bug waiting to happen.
      e.preventDefault();
      applyScan(ctx, text);
    } else if (now < _scanSwallowEnterUntil) {
      // A scan already committed on the silence timer and the terminator has
      // only just caught up. Eat it rather than let it act on an empty buffer.
      e.preventDefault();
    }
    _scanSwallowEnterUntil = 0;
    return;
  }

  // --- Ordinary characters. Anything that isn't a single printable character
  // (arrows, F-keys, Escape, Backspace…) ends the burst: a scanner emits only
  // the barcode. ---
  if (typeof key !== 'string' || key.length !== 1) { _scanReset(); return; }

  if (_scanChars.length) {
    const gap = now - _scanLastTs;
    if (gap > SCAN_END_MS) {
      // Long enough that this is the start of something new, not a continuation.
      _scanChars = [];
      _scanGapMax = 0;
    } else if (gap > _scanGapMax) {
      _scanGapMax = gap;
    }
  }
  _scanChars.push(key);
  _scanLastTs = now;

  if (_scanTimer) clearTimeout(_scanTimer);
  _scanTimer = setTimeout(_scanTimeoutCommit, SCAN_END_MS);
}

// Fallback for a scanner configured with NO suffix at all: the burst simply
// stops. If what we have passes the same speed test, treat the silence as the
// terminator. The swallow window then eats a late Enter, so a scanner that is
// merely slow to send its suffix can't double-fire.
function _scanTimeoutCommit() {
  _scanTimer = null;
  const isScan = _scanLooksLikeScan();
  const text = _scanChars.join('');
  _scanChars = [];
  _scanGapMax = 0;
  _scanLastTs = 0;
  if (!isScan) return;
  const ctx = _scanTarget();
  if (!ctx) return;
  _scanSwallowEnterUntil = Date.now() + 250;
  applyScan(ctx, text);
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------
function applyScan(ctx, raw) {
  const text = String(raw == null ? '' : raw).trim();
  if (!text || !ctx || !ctx.el) return;
  try {
    if (ctx.kind === 'asset') _scanIntoAsset(ctx.el, text);
    else if (ctx.kind === 'search') _scanIntoSearch(ctx.el, text);
    else if (ctx.kind === 'test') _scanIntoTest(ctx.el, text);
  } catch (err) {
    // A scan must never be able to take the app down. Worst case the number
    // doesn't appear and the engineer types it, exactly as before v65.
    console.error('Scan handling failed (non-fatal).', err);
  }
}

// Entry screen. TARGETED DOM WRITE, not render() — the v60.1 rule. A render
// here would tear down and rebuild the entry screen on every single scan, and
// if the engineer had tapped into the asset box first it would take their
// cursor with it.
function _scanIntoAsset(el, text) {
  const sess = activeSession();
  if (!sess) return;
  state.form.assetNo = text;
  // Decision 6B lives on this flag: it records that the number in the box came
  // off a label rather than out of the counter, so that once this item is logged
  // the NEXT box can be left empty instead of offering barcode + 1.
  state.scanFilledAsset = true;
  el.value = text;
  _scanFlash(el);

  // Decision 4B: check for a clash NOW rather than at save. Scan time is when
  // the engineer is still stood at the appliance and can look at the label
  // again; at save time they have already moved on.
  const dup = findDuplicateAssetIndex(sess, text, state.cursor);
  if (dup !== -1) {
    showToast('Asset ' + text + ' is already on item ' + (dup + 1) + ' of this job');
  }
}

// Sessions list (decision 2B). Feeds the ordinary search, which means the v61
// cross-session asset history card offers itself for free when the scanned
// number matches an asset tested on several jobs.
function _scanIntoSearch(el, text) {
  state.sessionsSearchQuery = text;
  el.value = text;
  _scanFlash(el);
  if (typeof refreshSessionsListAreaOnly === 'function') refreshSessionsListAreaOnly();
}

// The settings test box — the answer to "is my scanner actually working?".
// Shows the raw text, how many characters arrived, and when, so a scanner that
// is adding a prefix or dropping the last digit is visible rather than
// mysterious.
function _scanIntoTest(el, text) {
  el.value = text;
  _scanFlash(el);
  if (!Array.isArray(state.scannerTestLog)) state.scannerTestLog = [];
  state.scannerTestLog.unshift({ text: text, len: text.length, at: _scanClock() });
  state.scannerTestLog = state.scannerTestLog.slice(0, SCANNER_TEST_LOG_MAX);
  const log = document.getElementById('scanner-test-log');
  if (log) log.innerHTML = renderScannerTestLogHTML();
}

function _scanClock() {
  const d = new Date();
  const p = (n) => (n < 10 ? '0' + n : String(n));
  return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

// The test log markup. Lives here rather than in render-settings.js because the
// data is this file's, and _scanIntoTest repaints it directly without a render.
function renderScannerTestLogHTML() {
  const rows = Array.isArray(state.scannerTestLog) ? state.scannerTestLog : [];
  if (!rows.length) {
    return '<p class="muted">Nothing scanned yet. Pull the trigger on your scanner with this page open — what it sends will appear here.</p>';
  }
  return rows.map(r => `
    <div class="scanner-log-row">
      <span class="scanner-log-text">${escapeHTML(r.text)}</span>
      <span class="scanner-log-meta">${r.len} char${r.len === 1 ? '' : 's'} · ${escapeHTML(r.at)}</span>
    </div>
  `).join('');
}

// A brief glow so a scan is visibly acknowledged even if the box is scrolled
// off the top of the screen. Deliberately not a toast: fifty toasts on a fifty
// item job would be noise, and the scanner has its own beeper anyway. Toasts
// are reserved for the things that need reading (a duplicate).
function _scanFlash(el) {
  if (!el || !el.classList) return;
  el.classList.remove('scan-flash');
  void el.offsetWidth;   // forced reflow — restarts the animation on a re-scan
  el.classList.add('scan-flash');
  setTimeout(() => { try { el.classList.remove('scan-flash'); } catch (e) {} }, 700);
}

// ---------------------------------------------------------------------------
// Bound ONCE from boot.js, typeof-guarded and wrapped there, so a missing or
// broken scanner.js can never stop the app starting — the same posture as
// bugreport.js and photos.js.
// ---------------------------------------------------------------------------
function initScanner() {
  if (_scannerBound) return;
  _scannerBound = true;
  document.addEventListener('keydown', handleScannerKeydown, true);
}
