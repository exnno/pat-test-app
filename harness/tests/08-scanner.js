/* Standing test — HID barcode scanner (v65 feature, v67 repair)
   (c) 2026 Peter Birchley. All rights reserved.

   WHY THIS FILE EXISTS. v65 shipped scanner support written against spec sheets
   and never tested against a device. The first real scanner (NETUM C750, BT HID,
   iOS) failed completely, and it failed SILENTLY — the app rejected every burst
   and did nothing, which the engineer experienced as three unrelated faults. Not
   one assertion in the suite would have caught it, because nothing drove the
   keydown path at all.

   Everything here therefore drives handleScannerKeydown() with synthetic events
   rather than calling the delivery functions directly. Calling applyScan() would
   prove the delivery works and say nothing about whether a burst is ever
   RECOGNISED, which is the part that was broken.

   TIME IS FAKED. The burst logic reads Date.now() at every character, so a
   controllable clock is the only way to test the speed threshold — the whole
   safety mechanism — at all. See withClock(). */

'use strict';

const t = require('../assert');
const { freshApp, populated, withSession, withItem, confirmSheet, tick } = require('../fixture');

/* ⚠ THE FIRST DRAFT OF THIS FILE WAS VACUOUS AND LOOKED LIKE AN APP BUG.
   _scanTarget() declines while any full-screen interruption is up — the welcome
   panel, the first-run wizard, the migration prompt — because a scan would
   write into a field the engineer cannot see. A fixture app has NEITHER flag
   set, so every burst was refused and thirteen groups went red against correct
   code. Clearing them is what puts an app in the state a real engineer is in
   when they pull the trigger. This is the "test data never reaches the branch"
   shape from harness/README.md, and it is why a red assertion is inspected
   before any app code is touched. */
function readyToScan(app) {
  const st = app.state();
  st.welcomeSeen = true;
  st.onboardedV33Seen = true;
  st.migrationPrompt = { show: false };
  return app;
}

/* Replace Date.now INSIDE the vm context with a clock the test advances by
   hand. Returns { at, advance }. Patched after the app has loaded and after any
   fixture building, so nothing that stamps a real timestamp sees the fake one. */
function withClock(app, start = 1000) {
  app.run('globalThis.__scanClockValue = ' + start + '; Date.now = function () { return globalThis.__scanClockValue; };');
  return {
    set(ms) { app.run('globalThis.__scanClockValue = ' + ms + ';'); },
    advance(ms) { app.run('globalThis.__scanClockValue += ' + ms + ';'); },
  };
}

/* Feed one keydown through the REAL handler. */
function key(app, k, extra = {}) {
  const e = {
    key: k,
    repeat: false,
    ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() {},
    ...extra,
  };
  app.fn('handleScannerKeydown')(e);
  return e;
}

/* Type a whole barcode at a fixed inter-character gap, then (optionally) send
   the terminator. Returns the terminator event so a test can inspect
   defaultPrevented. */
function burst(app, clock, text, gapMs, opts = {}) {
  const chars = String(text).split('');
  chars.forEach((c, i) => {
    if (i > 0) clock.advance(gapMs);
    key(app, c);
  });
  if (opts.terminator === false) return null;
  clock.advance(gapMs);
  return key(app, opts.terminator || 'Enter');
}

/* An app sitting on the scanner settings page, which is where the test box and
   the diagnostic log live. */
function onScannerPage(opts = {}) {
  const app = readyToScan(freshApp(opts));
  const st = app.state();
  st.view = 'settingsScanner';
  app.doc.register('scanner-test', 'input');
  return app;
}

/* An app sitting on the entry screen of a real job, with #f-asset present.
   Built through render() so the id is registered exactly as it is in the app. */
function onEntryScreen(opts = {}) {
  const app = readyToScan(populated(opts));
  const st = app.state();
  st.view = 'entry';
  app.fn('render')();
  return app;
}

module.exports = async function run() {

  /* ------------------------------------------------------------------
     The v67 repair itself
     ------------------------------------------------------------------ */

  t.group('08a — a scan is recognised and lands in the asset box', () => {
    // The baseline. If this ever goes red the feature is dead again, which is
    // the state v67 was written to fix and which nothing previously detected.
    const app = onEntryScreen();
    const clock = withClock(app);
    burst(app, clock, 'PAT004821', 10);
    t.eq(app.doc.getElementById('f-asset').value, 'PAT004821', 'the scanned text reached the field');
    t.eq(app.state().form.assetNo, 'PAT004821', 'and the form state, not just the DOM');
    t.ok(app.state().scanFilledAsset, 'the scanned-asset flag is set (drives the blank next box)');
  });

  t.group('08b — a Shift keydown does not destroy the burst it belongs to', () => {
    // THE v65 BUG. A scanner sending uppercase emits a Shift keydown of its own,
    // and v65 treated any non-single-character key as "burst over" and cleared
    // the buffer. A barcode with capitals part-way through killed its own scan.
    //
    // ⚠ The assertion is on the EXACT text, not on "a scan happened". A version
    // that skipped Shift but dropped a character would still produce a scan —
    // a SHORT asset number, which is worse than none, and a laxer assertion
    // would have called that a pass.
    const app = onEntryScreen();
    const clock = withClock(app);
    key(app, 'a');
    clock.advance(10);
    key(app, 'Shift', { shiftKey: true });   // no time passes for a modifier
    key(app, 'B', { shiftKey: true });
    clock.advance(10);
    key(app, 'C', { shiftKey: true });
    clock.advance(10);
    key(app, 'Shift', { shiftKey: true });
    key(app, 'd');
    clock.advance(10);
    key(app, 'Enter');
    t.eq(app.doc.getElementById('f-asset').value, 'aBCd', 'every character survived the modifiers');
  });

  t.group('08c — a real non-character key still ends the burst', () => {
    // The other side of 08b, and the more important one. It is tempting to
    // "fix" 08b by skipping every unreadable key, but a key that DID produce a
    // character would then be left out of the buffer and the asset box would be
    // overwritten with a plausible-looking short number. Only keys known to
    // produce nothing may be skipped; everything else must drop the burst.
    const app = onEntryScreen();
    const before = app.doc.getElementById('f-asset').value;
    const clock = withClock(app);
    key(app, 'P'); clock.advance(8);
    key(app, 'A'); clock.advance(8);
    key(app, 'Backspace');                   // not a modifier — ends the burst
    key(app, 'T'); clock.advance(8);
    key(app, 'Enter');
    t.eq(app.doc.getElementById('f-asset').value, before, 'the interrupted burst was not delivered');
  });

  t.group('08d — the speed preset actually decides the outcome', () => {
    // Two-sided on purpose. Asserting only that a slow burst is rejected would
    // pass against a build that rejects everything — which is exactly the
    // failure mode this release exists to remove. The SAME burst must be
    // refused under one preset and accepted under another, which can only be
    // true if scanMaxGapMs() is being read.
    const strict = onEntryScreen();
    strict.state().scanSpeed = 'strict';                 // 40ms
    const beforeStrict = strict.doc.getElementById('f-asset').value;
    const c1 = withClock(strict);
    burst(strict, c1, 'PAT004821', 55);
    t.eq(strict.doc.getElementById('f-asset').value, beforeStrict,
      'a 55ms burst is refused at the strict 40ms limit');

    const relaxed = onEntryScreen();
    relaxed.state().scanSpeed = 'relaxed';               // 90ms
    const c2 = withClock(relaxed);
    burst(relaxed, c2, 'PAT004821', 55);
    t.eq(relaxed.doc.getElementById('f-asset').value, 'PAT004821',
      'the identical burst is accepted at the relaxed 90ms limit');
  });

  t.group('08e — the default limit is 60ms, not the old 40ms', () => {
    // The number itself, pinned. 40 was a guess from a spec sheet and it broke
    // the first real device; if someone quietly restores it, this says so.
    const app = freshApp();
    t.eq(app.fn('scanMaxGapMs')(), 60, 'a fresh install resolves to 60ms');
    t.eq(app.run('SCAN_GAP_PRESETS.strict'), 40, 'strict is still the old value');
    t.eq(app.run('SCAN_GAP_PRESETS.relaxed'), 90, 'relaxed is the loosest offered');
  });

  t.group('08f — an unrecognised speed preset falls back rather than rejecting everything', () => {
    // An undefined threshold makes every comparison false, so a corrupted or
    // renamed preset would silently kill scanning for good — the same class of
    // invisible failure, arriving by a different door.
    const app = onEntryScreen();
    app.state().scanSpeed = 'nonsense-value';
    t.eq(app.fn('scanMaxGapMs')(), 60, 'resolves to the default, not undefined');
    const clock = withClock(app);
    burst(app, clock, 'PAT004821', 20);
    t.eq(app.doc.getElementById('f-asset').value, 'PAT004821', 'and scanning still works');
  });

  t.group('08g — a second terminator (CR+LF) is swallowed, not acted on', () => {
    // The C750 has a one-barcode shortcut for CR+LF, so two Enters is a real
    // setup. v65 armed the swallow window only on the silence-timer path, so
    // the second Enter escaped onto whatever was underneath.
    const app = onEntryScreen();
    const clock = withClock(app);
    const first = burst(app, clock, 'PAT004821', 10);
    t.ok(first.defaultPrevented, 'the terminator that committed the scan was swallowed');
    clock.advance(5);
    const second = key(app, 'Enter');
    t.ok(second.defaultPrevented, 'the straggler Enter was swallowed too');
    t.eq(app.doc.getElementById('f-asset').value, 'PAT004821', 'and it changed nothing');
  });

  t.group('08h — an Enter well after a scan is NOT swallowed', () => {
    // The other side of 08g. A swallow window that never closes would eat the
    // engineer's own Enter presses for the rest of the session.
    const app = onEntryScreen();
    const clock = withClock(app);
    burst(app, clock, 'PAT004821', 10);
    clock.advance(5000);
    const later = key(app, 'Enter');
    t.notOk(later.defaultPrevented, 'an unrelated Enter passes through');
  });

  /* ------------------------------------------------------------------
     Diagnostics — the thing that made the failure invisible
     ------------------------------------------------------------------ */

  t.group('08i — the test page records rejected bursts, with the reason', () => {
    // ⚠ 80ms, not 200. A gap above SCAN_END_MS (120) is treated as the START OF
    // A NEW BURST, not a slow one — so a 200ms burst arrives as a series of
    // one-character bursts and is rejected as "too short". Correct app
    // behaviour, wrong test data, and it read as an app bug on the first run.
    // The speed test can only be exercised between the limit and SCAN_END_MS.
    const app = onScannerPage();
    const clock = withClock(app);
    burst(app, clock, 'PAT004821', 80);           // over the 60ms limit, under 120
    const log = app.state().scannerTestLog;
    t.eq(log.length, 1, 'the rejected burst was recorded');
    t.eq(log[0].ok, false, 'and marked as rejected');
    t.includes(log[0].why, 'too slow', 'the reason names the speed test');
    t.includes(log[0].why, '80', 'and quotes the gap actually measured');
    t.eq(log[0].len, 9, 'with the character count');
  });

  t.group('08i2 — a burst broken by a long pause is reported as too short', () => {
    // The other rejection reason, and the one a human typing produces. Worth
    // pinning because the two reasons send the engineer to different places:
    // "too slow" means change the speed setting, "too short" means the
    // characters are not arriving as one burst at all.
    const app = onScannerPage();
    const clock = withClock(app);
    burst(app, clock, 'PAT004821', 400);
    const log = app.state().scannerTestLog;
    t.eq(log[0].ok, false, 'rejected');
    t.includes(log[0].why, 'too short', 'reported as too short, not too slow');
  });

  t.group('08j — an accepted burst is recorded once, not twice', () => {
    // _scanLogBurst() took ownership of the log in v67 and _scanIntoTest() had
    // to stop writing it. Both writing would double every accepted scan.
    const app = onScannerPage();
    const clock = withClock(app);
    burst(app, clock, 'PAT004821', 10);
    const log = app.state().scannerTestLog;
    t.eq(log.length, 1, 'exactly one entry');
    t.eq(log[0].ok, true, 'marked accepted');
    t.eq(app.doc.getElementById('scanner-test').value, 'PAT004821', 'and the test box still filled');
  });

  t.group('08k — the entry screen does NOT log rejected bursts', () => {
    // Deliberate scope limit: on the entry screen a human typing an asset
    // number produces a rejected burst at every pause, and logging globally
    // would bury the one entry that matters under the engineer's own thumbs.
    const app = onEntryScreen();
    const clock = withClock(app);
    burst(app, clock, 'PAT004821', 200);
    t.eq(app.state().scannerTestLog.length, 0, 'nothing was logged from the entry screen');
  });

  t.group('08l — the log is capped', () => {
    const app = onScannerPage();
    const clock = withClock(app);
    for (let i = 0; i < 12; i++) {
      clock.advance(500);
      burst(app, clock, 'PAT00482' + i, 10);
    }
    t.eq(app.state().scannerTestLog.length, app.run('SCANNER_TEST_LOG_MAX'),
      'the log stops at SCANNER_TEST_LOG_MAX');
  });

  /* ------------------------------------------------------------------
     Paired mode
     ------------------------------------------------------------------ */

  t.group('08m — paired mode is opt-in and off by default (rule 9)', () => {
    // It sits one line below a `!== '0'` read in storage.js, which is precisely
    // the neighbour-copying hazard rule 9 describes. A polarity slip here would
    // put the cursor in the asset box for every engineer who has never seen a
    // barcode scanner.
    t.eq(freshApp().state().scannerPaired, false, 'a fresh install is not paired');
    t.eq(freshApp({ localStorage: { 'pat:engineer': 'Pete', 'pat:sessions': '[]' } }).state().scannerPaired,
      false, 'nor is an upgrading user');
    t.eq(freshApp({ localStorage: { 'pat:scannerPaired': '1' } }).state().scannerPaired,
      true, 'an explicit 1 turns it on');
  });

  t.group('08n — paired mode focuses AND selects the asset box', () => {
    // Selecting is the belt-and-braces half: if a burst is somehow still not
    // recognised, the characters type in by hand and the existing value is
    // replaced rather than appended to. That is the difference between a wrong
    // asset number on a certificate and a right one.
    const app = onEntryScreen({ localStorage: { 'pat:scannerPaired': '1' } });
    const el = app.doc.getElementById('f-asset');
    t.eq(app.doc.activeElement, el, 'the asset box took focus after render');
    t.ok(el.wasSelected, 'and its contents were selected');
  });

  t.group('08o — paired mode OFF leaves focus alone', () => {
    const app = onEntryScreen();
    t.notEq(app.doc.activeElement, app.doc.getElementById('f-asset'),
      'nothing was focused with paired mode off');
  });

  t.group('08p — focus is restored after a log, not just on first render', () => {
    // "The scan after a PASS goes nowhere" was this exact path:
    // refreshEntryAfterLog() rewrites #app.innerHTML and drops the cursor.
    const app = onEntryScreen({ localStorage: { 'pat:scannerPaired': '1' } });
    app.doc.activeElement = null;
    app.fn('refreshEntryAfterLog')();
    t.eq(app.doc.activeElement, app.doc.getElementById('f-asset'),
      'the asset box has the cursor again after a log');
  });

  t.group('08q — paired mode declines when a scan would be declined', () => {
    // focusAssetForScan() routes through the real _scanTarget(), so every
    // bail-out the scanner honours (locked job, open sheet, wizard) is honoured
    // here too. A locked job stands in for the set.
    const app = onEntryScreen({ localStorage: { 'pat:scannerPaired': '1' } });
    app.fn('activeSession')().locked = true;
    app.doc.activeElement = null;
    app.fn('render')();
    t.notEq(app.doc.activeElement, app.doc.getElementById('f-asset'),
      'a locked job does not get the cursor');
  });

  t.group('08r — keyboard suppression appears only in paired mode', () => {
    const off = onEntryScreen();
    const offHTML = off.fn('renderEntry')();
    t.excludes(offHTML, 'inputmode="none"', 'no keyboard suppression when not paired');

    const on = onEntryScreen({ localStorage: { 'pat:scannerPaired': '1' } });
    const onHTML = on.fn('renderEntry')();
    t.includes(onHTML, 'inputmode="none"', 'suppressed in paired mode');
  });

  t.group('08s — the v67 keyboard escape hatch is GONE and stays gone', () => {
    // v68 removed the ⌨ button. It could not raise the keyboard in the case
    // people actually hit (scanner connected — iOS suppresses system-wide), so
    // it taught the engineer the app was broken. These assertions exist to stop
    // it being reintroduced by a well-meaning future release; the working
    // answers are the scanner's own trigger shortcut and the paired toggle.
    const on = onEntryScreen({ localStorage: { 'pat:scannerPaired': '1' } });
    const onHTML = on.fn('renderEntry')();
    t.excludes(onHTML, 'scan-keyboard', 'no keyboard button in paired mode');
    t.excludes(onHTML, 'asset-kbd-btn', 'and no button styling hook');
    t.excludes(onHTML, 'asset-input-wrap', 'and no wrapper left behind');

    // The transient it drove must be gone from the state shape too — a dead
    // flag nothing clears is exactly how MAP rule 4 bugs get planted.
    t.eq('scanKeyboardOn' in on.state(), false, 'scanKeyboardOn removed from state');

    // And the suppression must NOT be liftable by setting the old flag: if a
    // future edit reads it again, this goes red.
    on.state().scanKeyboardOn = true;
    t.includes(on.fn('renderEntry')(), 'inputmode="none"',
      'setting the old flag no longer lifts the suppression');
  });

  /* ------------------------------------------------------------------
     Persistence
     ------------------------------------------------------------------ */

  await t.group('08t — the new settings survive save, load and a backup round-trip', async () => {
    const app = populated();
    app.state().scannerPaired = true;
    app.state().scanSpeed = 'relaxed';
    app.fn('save')();
    t.eq(app.storage.getItem('pat:scannerPaired'), '1', 'paired mode persisted');
    t.eq(app.storage.getItem('pat:scanSpeed'), 'relaxed', 'the preset persisted');

    // buildBackup() returns an OBJECT, not a JSON string.
    const backup = app.fn('buildBackup')();
    t.eq(backup.scannerPaired, true, 'paired mode is in the backup');
    t.eq(backup.scanSpeed, 'relaxed', 'so is the preset');
    t.eq(backup.backupVersion, 5, 'and it did NOT spend a backupVersion bump');

    // Through the REAL restore path — file in, confirm sheet, apply — because
    // that is the only route a backup ever takes in the field.
    const fresh = freshApp();
    const file = new fresh.sandbox.File([JSON.stringify(backup)], 'patgo-backup.json', { type: 'application/json' });
    fresh.fn('restoreBackupFromFile')(file);
    await tick(5);
    t.ok(confirmSheet(fresh, 'yes'), 'restore raised the confirm sheet');
    await tick(5);
    t.eq(fresh.state().scannerPaired, true, 'paired mode restored');
    t.eq(fresh.state().scanSpeed, 'relaxed', 'the preset restored');
  });

  await t.group('08u — a garbage preset in a backup is refused, not adopted', async () => {
    // A backup is an untrusted input. An unrecognised preset would resolve to
    // an undefined threshold and quietly kill every scan on the restored device.
    const app = populated();
    const good = app.fn('buildBackup')();
    good.scanSpeed = 'wide-open';
    const file = new app.sandbox.File([JSON.stringify(good)], 'b.json', { type: 'application/json' });
    app.fn('restoreBackupFromFile')(file);
    await tick(5);
    confirmSheet(app, 'yes');
    await tick(5);
    t.eq(app.state().scanSpeed, 'normal', 'the default was kept, not the garbage');
  });

  await t.group('08v — a pre-v67 backup restores with the safe defaults', async () => {
    const app = populated();
    const old = app.fn('buildBackup')();
    delete old.scannerPaired;
    delete old.scanSpeed;
    app.state().scannerPaired = true;
    const file = new app.sandbox.File([JSON.stringify(old)], 'b.json', { type: 'application/json' });
    app.fn('restoreBackupFromFile')(file);
    await tick(5);
    confirmSheet(app, 'yes');
    await tick(5);
    t.eq(app.state().scannerPaired, true,
      'an absent key says nothing, so the loaded value is left alone');
  });
  /* ------------------------------------------------------------------
     v67.1 — WIRING. Read this before adding anything to this file.

     Every group below drives handleScannerKeydown() DIRECTLY. That proved the
     burst logic was correct and said nothing at all about whether the handler
     was attached to anything — and it was not. initScanner() was never called
     from boot.js in V65, V66 or V67, so the listener never existed and not one
     scan was ever detected in a shipped build. 24 green groups, a dead feature.

     A test that calls the function tests the function. Only a test that
     dispatches through the same surface the browser uses tests the wiring.
     ------------------------------------------------------------------ */

  t.group('08w — the keydown listener is actually bound at boot', () => {
    // ⚠ Dispatches on document. Does NOT call handleScannerKeydown. That
    // distinction is the entire point of this group; do not "simplify" it.
    const app = onEntryScreen();
    const clock = withClock(app);
    'PAT004821'.split('').forEach((c, i) => {
      if (i > 0) clock.advance(10);
      app.doc.dispatchEvent({
        type: 'keydown', key: c, repeat: false,
        ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
        defaultPrevented: false, preventDefault() { this.defaultPrevented = true; },
        stopPropagation() {},
      });
    });
    clock.advance(10);
    app.doc.dispatchEvent({
      type: 'keydown', key: 'Enter', repeat: false,
      ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
      defaultPrevented: false, preventDefault() { this.defaultPrevented = true; },
      stopPropagation() {},
    });
    t.eq(app.doc.getElementById('f-asset').value, 'PAT004821',
      'a real keydown on document reached the scanner — the listener exists');
  });

  t.group('08x — a burst ended by an unexpected key is reported, not dropped silently', () => {
    // v67.1. The last silent rejection path, and the one a misconfigured
    // scanner suffix hits. Before this it discarded the burst and said nothing,
    // which is the exact failure shape v67 existed to remove.
    const app = onScannerPage();
    const clock = withClock(app);
    'PAT004821'.split('').forEach((c, i) => { if (i > 0) clock.advance(10); key(app, c); });
    clock.advance(10);
    key(app, 'F5');                       // not a terminator, not a modifier
    const log = app.state().scannerTestLog;
    t.eq(log.length, 1, 'the discarded burst was recorded');
    t.eq(log[0].ok, false, 'as a rejection');
    t.includes(log[0].why, 'unexpected key', 'naming the cause');
    t.includes(log[0].why, 'F5', 'and the key itself, so it can be looked up');
  });

};
