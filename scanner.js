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
 * is: every gap in the burst must be under the gap limit currently in force
 * (scanMaxGapMs(), resolved from the chosen preset), and the burst must be at
 * least SCAN_MIN_LENGTH characters. One slow gap means a human paused, and the
 * buffer is discarded rather than treated as a scan. This is what stops someone
 * hand-typing an asset number and pressing return on the on-screen keyboard from
 * being treated as a scan.
 *
 * ⚠ THERE ARE TWO TIMING CEILINGS, NOT ONE, AND THEY ARE NOT INDEPENDENT.
 * scanMaxGapMs() judges whether the burst was fast enough. scanEndMs() decides
 * where one burst ENDS and the next begins. The second must always exceed the
 * first, or a burst restarts on every character and arrives at the length check
 * one character long — the "too slow" failure quietly becomes a "too short" one.
 * v74 made the second derive from the first so the invariant cannot be broken by
 * changing a preset. See the SCAN_END_PAD_MS note in config.js for the full
 * story; it cost a release to find.
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
 *
 * ---------------------------------------------------------------------------
 * v67 — WHAT THE FIRST REAL SCANNER TAUGHT US
 * ---------------------------------------------------------------------------
 * v65 was written against spec sheets. The first physical device (a NETUM C750,
 * Bluetooth HID, iOS) failed, and it failed in the most confusing way possible:
 * silently. Three separate-looking symptoms turned out to be ONE cause.
 *
 *   "I have to tap the box first."      Nothing focused → the raw characters
 *                                       had nowhere to land.
 *   "A re-scan appends instead of
 *    replacing."                        Raw characters typing into a focused
 *                                       box at the caret. The overwrite below
 *                                       never ran.
 *   "After PASS the next scan does
 *    nothing."                          Logging rebuilds the entry screen,
 *                                       which drops focus again.
 *
 * All three are what "the burst was rejected" looks like from outside. That is
 * the real lesson and it drove every change here:
 *
 * 1. A REJECTED BURST MUST NOT BE SILENT. The settings test page now logs
 *    rejected bursts too, with the character count, the slowest gap measured
 *    and the reason. A failing scanner and an unpaired scanner used to look
 *    identical; now they don't.
 *
 * 2. MODIFIER KEYS MUST NOT KILL THE BUFFER. A scanner sending an uppercase
 *    character emits a Shift keydown first. v65 treated any non-single-character
 *    key as "burst over" and cleared the buffer — so a barcode with capitals
 *    part-way through destroyed its own scan. True modifiers are now skipped
 *    without touching the buffer. Everything else still ends the burst, and
 *    deliberately so: dropping a character we could not read would produce a
 *    SHORT asset number that looks plausible and is wrong, which is far worse
 *    than no scan at all.
 *
 * 3. THE SPEED THRESHOLD IS TUNABLE. 40ms was a guess. The default is now 60ms
 *    and the engineer can pick strict/normal/relaxed on the settings page,
 *    because a device in someone's hand should not need a release to debug.
 *
 * 4. PAIRED MODE. Opt-in (state.scannerPaired). When on, the entry screen puts
 *    the cursor in the asset box by itself and keeps the on-screen keyboard out
 *    of the way with inputmode="none" — so a scan lands with no tap, before and
 *    after every log. See focusAssetForScan() at the foot of this file.
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
let _scanPoisonUntil = 0;       // v74 — see the note below
let _scannerBound = false;      // initScanner is idempotent

// ---------------------------------------------------------------------------
// v74 — THE POISON WINDOW. What it prevents, in one example.
//
// A scanner is part-way through typing PAT-004821 when one keystroke arrives as
// something we cannot read — a stray modifier the device emitted, a suffix key
// that is neither Enter nor Tab, a Bluetooth hiccup. The burst is correctly
// dropped: we do not know what that key was, so we cannot trust the buffer.
//
// The problem is what happens NEXT. The scanner does not know anything went
// wrong and keeps typing. Before v74 the remaining characters — say '4821' —
// formed a brand-new burst of their own: short, fast, above the three-character
// minimum, and entirely plausible as an asset number. It passed every test we
// had and was written into the asset box. A WRONG asset number, on a
// certificate, with nothing on screen to suggest anything had happened.
//
// So dropping the burst in progress is not enough. We must also refuse to
// collect ANYTHING until the keyboard has fallen silent for a full end-of-burst
// window — long enough that the tail of the poisoned scan has certainly
// finished arriving. The window SLIDES: every character that lands inside it
// pushes it out again, so a scanner that keeps typing keeps being ignored until
// it genuinely stops.
//
// ⚠ WHY ONLY THIS PATH ARMS IT. The other place a burst is discarded is the
// _scanTarget() bail, which fires on ordinary keystrokes many times a second
// whenever you are typing anywhere that is not a scan target. Arming there
// would blank a genuine scan for a fifth of a second after every field you
// leave, to guard against a case that cannot happen — nothing was collected, so
// there is no tail to protect against. Asymmetric on purpose, same as the
// modifier/reset asymmetry below.
// ---------------------------------------------------------------------------

// v67: keys that a keyboard emits WITHOUT producing a character. These pass
// through the burst without ending it and without being counted. The list is
// deliberately closed and short — see the ⚠ note at the reset in
// handleScannerKeydown for why anything not on it must still end the burst.
const SCAN_MODIFIER_KEYS = {
  Shift: 1, Control: 1, Alt: 1, Meta: 1, AltGraph: 1,
  CapsLock: 1, NumLock: 1, ScrollLock: 1, Symbol: 1, SymbolLock: 1,
};

function _scanReset() {
  _scanChars = [];
  _scanGapMax = 0;
  _scanLastTs = 0;
  if (_scanTimer) { clearTimeout(_scanTimer); _scanTimer = null; }
}

// v67: the chosen speed preset, resolved at judgement time rather than read
// once, so changing it on the settings page takes effect on the very next scan.
// Anything unrecognised falls back to the default — an undefined threshold here
// would make every comparison false and reject every burst forever, which is
// precisely the silent failure this release exists to remove.
function scanMaxGapMs() {
  const preset = SCAN_GAP_PRESETS[state.scanSpeed];
  return typeof preset === 'number' ? preset : SCAN_GAP_PRESETS[SCAN_SPEED_DEFAULT];
}

// v74: where one burst ends and the next begins, DERIVED from whichever preset
// is in force rather than declared as a number. This is the fix for the
// two-ceilings trap described in the file header and at SCAN_END_PAD_MS in
// config.js: the boundary must always sit above the gap limit, so it is defined
// as the gap limit plus a pad, floored.
//
// ⚠ Do not be tempted to inline this back into a constant "for speed". It is
// two arithmetic operations on a keystroke, and the constant is exactly what
// made a preset change silently counterproductive.
//
// It resolves fresh on every call for the same reason scanMaxGapMs() does —
// changing the setting takes effect on the very next scan, not the next reload.
function scanEndMs() {
  return Math.max(scanMaxGapMs() + SCAN_END_PAD_MS, SCAN_END_FLOOR_MS);
}

// v67: judge the buffer AND say why. v65 returned a bare boolean, which is what
// made a failing scanner indistinguishable from an absent one — there was
// nothing to show the engineer. The verdict object carries the numbers the
// settings test page prints.
//
// Length AND speed both have to pass — see the header note on why speed is the
// safety mechanism. SCAN_MAX_LENGTH exists only to reject a runaway (a stuck
// key, a paste), not because long barcodes are suspicious.
//
// Returns null when there is nothing to judge at all, which is different from a
// rejection and must not be logged as one.
function _scanVerdict() {
  const n = _scanChars.length;
  const gap = _scanGapMax;
  const limit = scanMaxGapMs();
  if (n === 0) return null;
  if (n < SCAN_MIN_LENGTH) {
    return { ok: false, n: n, gap: gap, limit: limit,
             why: 'too short — ' + n + ' character' + (n === 1 ? '' : 's') + ', minimum ' + SCAN_MIN_LENGTH };
  }
  if (n > SCAN_MAX_LENGTH) {
    return { ok: false, n: n, gap: gap, limit: limit,
             why: 'too long — ' + n + ' characters, maximum ' + SCAN_MAX_LENGTH };
  }
  if (gap > limit) {
    return { ok: false, n: n, gap: gap, limit: limit,
             why: 'too slow — ' + gap + 'ms between characters, limit ' + limit + 'ms' };
  }
  return { ok: true, n: n, gap: gap, limit: limit, why: '' };
}

// Kept for readability at the call sites that only need the yes/no.
function _scanLooksLikeScan() {
  const v = _scanVerdict();
  return !!(v && v.ok);
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
    const verdict = _scanVerdict();
    const text = _scanChars.join('');
    _scanReset();
    _scanLogBurst(ctx, text, verdict);
    if (verdict && verdict.ok) {
      // Swallow the terminator so it can't do anything else on the way past.
      // preventDefault only — NOT stopPropagation, because other Enter handlers
      // (the name sheet in feedback.js) live in contexts we have already
      // declined above, and blocking them here would be a bug waiting to happen.
      e.preventDefault();
      // v67: arm the window HERE too, not only on the silence-timer path. A
      // scanner set to CR+LF sends two Enters; without this the second one used
      // to escape and act on whatever was underneath.
      _scanSwallowEnterUntil = now + SCAN_DOUBLE_TERMINATOR_MS;
      applyScan(ctx, text);
    } else if (now < _scanSwallowEnterUntil) {
      // A scan already committed (silence timer, or the first half of a CR+LF)
      // and this terminator is the straggler. Eat it rather than let it act on
      // an empty buffer.
      e.preventDefault();
      _scanSwallowEnterUntil = 0;
    } else {
      _scanSwallowEnterUntil = 0;
    }
    return;
  }

  // --- Modifiers. v67. A scanner sending an uppercase character emits a Shift
  // keydown of its own first, and v65 fell through to the reset below and threw
  // the half-collected barcode away. These keys produce no character, so they
  // are skipped WITHOUT touching the buffer or the timing — they are not part of
  // the burst and they do not end it. ---
  if (SCAN_MODIFIER_KEYS[key]) return;

  // --- Ordinary characters. Anything that isn't a single printable character
  // (arrows, F-keys, Escape, Backspace…) ends the burst: a scanner emits only
  // the barcode.
  //
  // ⚠ THIS STAYS A RESET, NOT A SKIP. It is tempting to ignore unreadable keys
  // the way we now ignore modifiers, but the failure modes are not symmetrical.
  // Skipping a key that DID produce a character would leave that character out
  // of the buffer, and we would then overwrite the asset box with a SHORT
  // number — plausible-looking and wrong, on a certificate. Dropping the whole
  // burst is visible and harmless by comparison. Only keys that are known to
  // produce nothing may be skipped. ---
  if (typeof key !== 'string' || key.length !== 1) {
    // v67.1: log it before dropping it. This was the LAST silent path left, and
    // it is the one a misconfigured scanner is most likely to hit — a suffix
    // that is neither Enter nor Tab (F-keys, Escape, a keypad Enter reported
    // under another name) discards a perfectly good burst and, before this,
    // said nothing whatsoever. That directly contradicts the rule v67 was
    // written around: a mechanism that can reject must be able to say why.
    // Named separately from the speed and length reasons because it sends the
    // engineer somewhere different — to the scanner's suffix setting, not to
    // the app's.
    const v = _scanVerdict();
    if (v) {
      v.ok = false;
      v.why = 'ended by an unexpected key (' + key + ') — check the scanner\'s prefix/suffix setting';
      _scanLogBurst(ctx, _scanChars.join(''), v);
    }
    _scanReset();
    // v74: and refuse to start collecting again until the keyboard is quiet.
    // ⚠ ORDER MATTERS — this must come AFTER _scanReset(), which clears the
    // timer but deliberately does not touch the poison window (reset is called
    // from three other paths that must not arm it).
    _scanPoisonUntil = now + scanEndMs();
    return;
  }

  // v74: inside the poison window. Push it out and swallow nothing — the
  // characters still land wherever they were going, exactly as they do when we
  // are collecting. All we are refusing to do is BELIEVE them.
  if (now < _scanPoisonUntil) {
    _scanPoisonUntil = now + scanEndMs();
    return;
  }

  if (_scanChars.length) {
    const gap = now - _scanLastTs;
    if (gap > scanEndMs()) {
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
  _scanTimer = setTimeout(_scanTimeoutCommit, scanEndMs());
}

// Fallback for a scanner configured with NO suffix at all: the burst simply
// stops. If what we have passes the same speed test, treat the silence as the
// terminator. The swallow window then eats a late Enter, so a scanner that is
// merely slow to send its suffix can't double-fire.
function _scanTimeoutCommit() {
  _scanTimer = null;
  const verdict = _scanVerdict();
  const text = _scanChars.join('');
  _scanChars = [];
  _scanGapMax = 0;
  _scanLastTs = 0;
  // v67: the target is resolved BEFORE the accept/reject branch now, because a
  // rejected burst still has to be logged on the test page. v65 returned early
  // and that is exactly why a scanner failing the speed test looked identical
  // to one that was not connected.
  const ctx = _scanTarget();
  if (!ctx) return;
  _scanLogBurst(ctx, text, verdict);
  if (!verdict || !verdict.ok) return;
  _scanSwallowEnterUntil = Date.now() + SCAN_DOUBLE_TERMINATOR_MS;
  applyScan(ctx, text);
}

// ---------------------------------------------------------------------------
// v67 — the diagnostic log. ONLY on the settings test page (ctx.kind 'test').
//
// Why not everywhere: on the entry screen a human typing an asset number
// produces a rejected burst on every pause, so logging globally would fill the
// list with the engineer's own thumbs and bury the one entry that matters. The
// test page is the diagnostic surface and the page copy says so.
//
// Both the accepted and the rejected case land here, with the numbers, which is
// the whole point — "8 characters, slowest gap 74ms, limit 60ms" tells you to
// move the speed setting up one notch. Nothing else in the app could have told
// you that.
// ---------------------------------------------------------------------------
function _scanLogBurst(ctx, text, verdict) {
  if (!ctx || ctx.kind !== 'test' || !verdict) return;
  if (!Array.isArray(state.scannerTestLog)) state.scannerTestLog = [];
  state.scannerTestLog.unshift({
    text: String(text == null ? '' : text),
    len: verdict.n,
    gap: verdict.gap,
    ok: !!verdict.ok,
    why: verdict.why,
    at: _scanClock(),
  });
  state.scannerTestLog = state.scannerTestLog.slice(0, SCANNER_TEST_LOG_MAX);
  const log = document.getElementById('scanner-test-log');
  if (log) log.innerHTML = renderScannerTestLogHTML();
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
// v67: this no longer writes the log. _scanLogBurst() owns it and has already
// run by the time we get here — it must, because it also records the bursts
// that never reach this function at all. Writing in both places would double
// every accepted scan.
function _scanIntoTest(el, text) {
  el.value = text;
  _scanFlash(el);
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
    return '<p class="muted">Nothing scanned yet. Pull the trigger on your scanner with this page open — what it sends will appear here, whether or not the app accepted it.</p>';
  }
  return rows.map(r => {
    const ok = r.ok !== false;   // pre-v67 shaped rows (no flag) read as accepted
    const gap = (typeof r.gap === 'number' && r.gap > 0) ? ' · slowest gap ' + r.gap + 'ms' : '';
    // The reason line only appears on a rejection. On an accepted scan the
    // numbers alone are the reassurance, and a second line would be noise on
    // every single row.
    const reason = ok ? '' :
      `<span class="scanner-log-reason">Not treated as a scan: ${escapeHTML(r.why || 'burst rejected')}</span>`;
    return `
    <div class="scanner-log-row${ok ? '' : ' is-rejected'}">
      <span class="scanner-log-text">${escapeHTML(r.text)}</span>
      <span class="scanner-log-meta">${ok ? 'Accepted' : 'Rejected'} · ${r.len} char${r.len === 1 ? '' : 's'}${gap} · ${escapeHTML(r.at)}</span>
      ${reason}
    </div>
  `;
  }).join('');
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

// ---------------------------------------------------------------------------
// v67 — PAIRED MODE: put the cursor in the asset box so a scan needs no tap.
//
// Called by render() and refreshEntryAfterLog() (render-core.js), typeof-guarded
// at both call sites like every other optional subsystem (rule 6). It has to run
// after BOTH, because the two together are every path that rebuilds the entry
// screen — and "the scan after a PASS goes nowhere" was caused by exactly the
// second one dropping focus.
//
// ⚠ WHY THIS IS GATED ON state.scannerPaired AND NOT state.scannerEnabled.
// Scanning is on by default for everybody. Focusing a field by itself is only
// ever right when a hardware keyboard is attached; for the engineer with no
// scanner it would mean a focused box, and on some devices a keyboard, on every
// entry screen and after every log. It has to be opted into.
//
// ⚠ WHY select() AND NOT JUST focus(). Belt and braces. If a burst is somehow
// still not recognised as a scan, the characters type in by hand — and with the
// existing value selected the first one REPLACES it instead of appending. That
// is the difference between a wrong asset number on a certificate and a right
// one, on the exact failure this release is fixing.
//
// The on-screen keyboard is kept down by inputmode="none" on the field itself
// (render-core.js), not from here — iOS decides that at focus time from the
// attribute, so it must already be on the element.
// ---------------------------------------------------------------------------
function focusAssetForScan() {
  if (!state.scannerEnabled || !state.scannerPaired) return;
  if (state.view !== 'entry') return;
  // Reuse the real target resolver rather than re-deriving the rules: it
  // already declines a locked job, every sheet that can cover this screen, the
  // first-run wizard, and — importantly — a field the engineer has deliberately
  // focused themselves. If a scan would not be accepted right now, we have no
  // business moving the cursor either.
  let ctx = null;
  try { ctx = _scanTarget(); } catch (e) { return; }
  if (!ctx || ctx.kind !== 'asset' || !ctx.el) return;
  const el = ctx.el;
  try {
    // preventScroll matters: without it, focusing a field that sits above the
    // fold on a long entry screen jerks the page. Older engines ignore the
    // option object entirely, hence the fallback.
    if (document.activeElement !== el) el.focus({ preventScroll: true });
    el.select();
  } catch (err) {
    try { el.focus(); el.select(); } catch (e2) {}
  }
}
