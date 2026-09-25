#!/usr/bin/env node
/* PATGo test harness — mutation runner
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   Usage: node harness/mutate.js [substring-filter]

   Breaks the app one deliberate way at a time and confirms the suite goes RED.
   A green suite proves nothing on its own — V65 shipped two assertions that
   tested nothing and V66 shipped four, every one of them looking green.

   TWO RUNNER DEFECTS FOUND IN V66, both fixed here permanently. Do not
   reintroduce either:

   1. The old runner matched the SUBSTRING "0 failed", so a run reporting
      "10 failed" scored as a PASS. This one anchors on the full phrase.
   2. A mutation that silently failed to apply also scored as a PASS. Every
      mutation below asserts its anchor exists in the source before running, and
      aborts loudly if it does not. */

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execFileSync } = require('child_process');

const APP_DIR = path.resolve(__dirname, '..');

/* Each mutation: a named, minimal break, and the reason it must be caught.
   Add one whenever a release adds an assertion — that is the whole discipline. */
const MUTATIONS = [
  {
    name: 'M01 boot guard stops checking for missing functions',
    file: 'boot.js',
    from: "if (typeof window[name] !== 'function') {",
    to:   'if (false) {',
    why:  'the partial-deploy guard is the thing standing between a bad deploy and data loss',
  },
  {
    name: 'M02 boot guard stops probing config.js',
    file: 'boot.js',
    from: "if (typeof WELCOME_KEY === 'undefined') {",
    to:   'if (false) {',
    why:  'this probe is what catches config.js failing to parse (the V61 white screen)',
  },
  {
    name: 'M03 the session codec drops unknown keys',
    file: 'storage.js',
    from: 'function encodeWithMap(obj, map, isSession) {',
    to:   'function encodeWithMap(obj, map, isSession) { obj = JSON.parse(JSON.stringify(obj)); for (const k of Object.keys(obj)) if (!map[k]) delete obj[k];',
    why:  'additive fields ride through the codec — that is why backupVersion stays 5',
  },
  {
    name: 'M04 buildBackup emits short codec keys',
    file: 'backup.js',
    from: '    clients: state.clients,',
    to:   '    clients: (state.clients || []).map(c => ({ i: c.id, n: c.name })),',
    why:  'backups must stay human-readable long-key JSON',
  },
  {
    name: 'M05 restore skips the readings validator',
    file: 'backup.js',
    from: 'const clean = normaliseItemReadings(it.readings);',
    to:   'const clean = it.readings;',
    why:  'a corrupt or hand-edited backup must not poison structured fields',
  },
  {
    name: 'M06 restore ignores the archived stats bucket',
    file: 'backup.js',
    from: 'state.archivedStats = normaliseArchivedStats(data.archivedStats);',
    to:   'state.archivedStats = data.archivedStats;',
    why:  'garbage must collapse to a safe default, and a pre-v59 backup has no key at all',
  },
  {
    name: 'M07 instrument resolution falls back to the global mirror',
    file: 'instruments.js',
    from: '    const stamped = findInstrument(sess.instrumentId);\n    if (stamped) return stamped;',
    to:   '    const stamped = findInstrument(sess.instrumentId);\n    if (false) return stamped;',
    why:  'THIS IS THE V66 DEFECT — old jobs printing today\u2019s instrument',
  },
  {
    name: 'M08 deleting an instrument stops snapshotting it onto jobs',
    file: 'instruments.js',
    // v83: re-pointed — the freeze now lives in freezeInstrumentOntoJobs(),
    // shared by the local and the remote delete.
    from: '    if (s && s.instrumentId === id && !s.instrumentSnapshot) {',
    to:   '    if (false) {',
    why:  'without the snapshot those certificates silently fall back to today\u2019s instrument',
  },
  {
    name: 'M09 loadInstruments resurrects a deliberately emptied list',
    file: 'instruments.js',
    from: 'function loadInstruments() {',
    to:   'function loadInstruments() { localStorage.removeItem(INSTRUMENTS_KEY);',
    why:  'absence vs empty array — an emptied list must not re-seed from the legacy flat keys',
  },
  {
    name: 'M10 report.js reads the global mirror again',
    file: 'report.js',
    from: 'function buildReportDoc',
    to:   'function _reintroducedDefect() { return state.testerMake; }\nfunction buildReportDoc',
    why:  'the source guard is the ONLY cover for a path that cannot run headlessly',
  },
  {
    name: 'M11 csv.js reads the global mirror again',
    file: 'csv.js',
    from: 'function buildCSV(session) {',
    to:   'function buildCSV(session) { const _leak = state.calCertNo;',
    why:  'same defect at the export boundary, where it reaches the customer',
  },
  {
    name: 'M12 diagnostics start including site names',
    file: 'bugreport.js',
    from: "    ['JOBS', `${sessions.length} (${open} open, ${locked} locked)`],",
    to:   "    ['JOBS', `${sessions.length} (${open} open, ${locked} locked) ${sessions.map(s => s.site).join(',')}`],",
    why:  'THE PRIVACY RULE — a support email must never carry a customer\u2019s data',
  },
  {
    name: 'M13 captured errors get persisted to storage',
    file: 'bugreport.js',
    from: 'function recordBugError(kind, message, source, line) {',
    to:   "function recordBugError(kind, message, source, line) { try { localStorage.setItem('pat:lasterror', String(message)); } catch (e) {}",
    why:  'the error path must never touch the storage path or reach a backup',
  },
  {
    name: 'M14 a default-OFF flag flips to default-ON',
    file: 'storage.js',
    from: "  state.scannerEnabled = localStorage.getItem(SCANNER_KEY) !== '0';",
    to:   "  state.scannerEnabled = localStorage.getItem(SCANNER_KEY) === '1';",
    why:  'flag polarity — the wrong shape silently changes behaviour for every existing user',
  },
  {
    name: 'M15 showDuration adopts its neighbours\u2019 polarity',
    file: 'storage.js',
    from: '  out.showDuration    = stored.showDuration === true;',
    to:   '  out.showDuration    = stored.showDuration !== false;',
    why:  'this exact copy-the-neighbour mistake would add testing time to every existing user\u2019s certificates',
  },
  {
    name: 'M16 a job can be created with neither client nor site',
    file: 'session.js',
    from: '  if (!clientName && !siteName) {',
    to:   '  if (false) {',
    why:  'a nameless job is unusable and cannot produce a valid certificate',
  },
  {
    name: 'M17 CSV stops escaping cell values',
    file: 'csv.js',
    from: '    cols.map(c => csvEscape(csvCellValue(c.id, session, it))).join(\',\')',
    to:   '    cols.map(c => csvCellValue(c.id, session, it)).join(\',\')',
    why:  'unescaped commas and quotes silently corrupt the customer\u2019s spreadsheet',
  },
  {
    name: 'M18 parseStoredSessions rethrows instead of collapsing safely',
    file: 'storage.js',
    from: 'function parseStoredSessions(raw) {',
    to:   'function parseStoredSessions(raw) { if (!raw || raw[0] !== "[") throw new Error("boom");',
    why:  'a throw here is a white screen on a phone with no way back in',
  },
  {
    name: 'M19 duplicate asset numbers stop being detected',
    file: 'session.js',
    from: 'function findDuplicateAssetIndex(sess, assetNo, excludeCursor) {',
    to:   'function findDuplicateAssetIndex(sess, assetNo, excludeCursor) { return -1;',
    why:  'two items sharing an asset number corrupts the certificate',
  },
  {
    name: 'M20 deleting a job stops archiving its stats',
    file: 'session.js',
    from: 'function archiveSessionStats(sessions) {',
    to:   'function archiveSessionStats(sessions) { return;',
    why:  'the lifetime counter would go backwards every time Peter prunes',
  },

  /* ---- V67: barcode scanner. Every one of these is a break that SHIPPED in
     v65 and went undetected, or the same class of break arriving by a new
     door. The suite had no keydown coverage at all before this release. ---- */
  {
    name: 'M21 a modifier keydown wipes the burst again (the v65 bug)',
    file: 'scanner.js',
    from: '  if (SCAN_MODIFIER_KEYS[key]) return;',
    to:   '  if (false) return;',
    why:  'this is the exact break that made a barcode with capitals destroy its own scan',
  },
  {
    name: 'M22 unreadable keys are skipped instead of ending the burst',
    file: 'scanner.js',
    // ⚠ V74 re-pointed: the drop path now also arms the poison window, so the
    // anchor spans both. Removing only the reset would leave a half-mutated
    // build that tests nothing anyone would ever write.
    from: "    _scanReset();\n    // v74: and refuse to start collecting again until the keyboard is quiet.\n    // ⚠ ORDER MATTERS — this must come AFTER _scanReset(), which clears the\n    // timer but deliberately does not touch the poison window (reset is called\n    // from three other paths that must not arm it).\n    _scanPoisonUntil = now + scanEndMs();\n    return;",
    to:   "    return;",
    why:  'the tempting over-fix: it silently drops a character and delivers a SHORT asset number',
  },
  {
    name: 'M23 the speed preset is ignored and the old 40ms is hard-coded',
    file: 'scanner.js',
    from: '  return typeof preset === \'number\' ? preset : SCAN_GAP_PRESETS[SCAN_SPEED_DEFAULT];',
    to:   '  return 40;',
    why:  'the setting would look like it worked and change nothing — invisible from the UI',
  },
  {
    name: 'M24 an unknown speed preset resolves to undefined',
    file: 'scanner.js',
    from: '  const preset = SCAN_GAP_PRESETS[state.scanSpeed];',
    to:   '  const preset = SCAN_GAP_PRESETS[state.scanSpeed] || undefined; if (true) return preset;',
    why:  'every comparison against undefined is false, so scanning dies permanently and silently',
  },
  {
    name: 'M25 the double-terminator window is not armed on the terminator path',
    file: 'scanner.js',
    from: '      _scanSwallowEnterUntil = now + SCAN_DOUBLE_TERMINATOR_MS;',
    to:   '      _scanSwallowEnterUntil = 0;',
    why:  'a CR+LF scanner sends two Enters and the second used to escape (the v65 gap)',
  },
  {
    name: 'M26 rejected bursts stop being logged',
    file: 'scanner.js',
    from: "  if (!ctx || ctx.kind !== 'test' || !verdict) return;",
    to:   '  if (!ctx || true) return;',
    why:  'a failing scanner becomes indistinguishable from an absent one — the whole v67 diagnosis problem',
  },
  {
    name: 'M27 paired mode reads the default-ON polarity (rule 9)',
    file: 'storage.js',
    from: "  state.scannerPaired = localStorage.getItem(SCANNER_PAIRED_KEY) === '1';",
    to:   "  state.scannerPaired = localStorage.getItem(SCANNER_PAIRED_KEY) !== '0';",
    why:  'it sits one line below a !== \'0\' read; copying the neighbour focuses a field for every user',
  },
  {
    name: 'M28 paired mode focuses but does not select',
    file: 'scanner.js',
    from: '    if (document.activeElement !== el) el.focus({ preventScroll: true });\n    el.select();',
    to:   '    if (document.activeElement !== el) el.focus({ preventScroll: true });',
    why:  'without the selection an unrecognised scan APPENDS to the pre-filled number',
  },
  {
    name: 'M29 focus is not restored after a log',
    file: 'render-core.js',
    from: "  if (typeof focusAssetForScan === 'function') { try { focusAssetForScan(); } catch (e) {} }\n}\n// v20: New Session Client / Site autocomplete.",
    to:   '}\n// v20: New Session Client / Site autocomplete.',
    why:  '"the scan after a PASS goes nowhere" — the exact reported symptom',
  },
  {
    // v68: M30 used to mutate the ⌨ escape hatch, which no longer exists. It is
    // reused here for the removal itself — reintroducing the button must go red.
    name: 'M30 the removed keyboard button comes back',
    file: 'render-core.js',
    from: "    `${paired ? ' inputmode=\"none\"' : ''}>`;",
    to:   "    `${paired ? ' inputmode=\"none\"' : ''}>` + (paired ? '<button data-action=\"scan-keyboard\">K</button>' : '');",
    why:  'a control that cannot work in its main case teaches the engineer the app is broken',
  },
  {
    name: 'M31 a garbage speed preset in a backup is adopted',
    file: 'backup.js',
    from: '    if (Object.prototype.hasOwnProperty.call(SCAN_GAP_PRESETS, data.scanSpeed)) {',
    to:   "    if (typeof data.scanSpeed === 'string') {",
    why:  'a backup is untrusted input; an unrecognised preset kills scanning on the restored device',
  },

  /* ---- V67.1: the wiring. M32 is the single most important mutation in this
     file — it reproduces a bug that shipped in three consecutive releases and
     that 24 green assertions failed to notice, because they all called the
     handler instead of dispatching to it. ---- */
  {
    name: 'M32 the scanner listener is never bound (the V65–V67 bug)',
    file: 'boot.js',
    from: "if (typeof initScanner === 'function') initScanner();",
    to:   "if (false) initScanner();",
    why:  'exactly what shipped for three releases: scanner.js loaded, cached, and attached to nothing',
  },
  {
    name: 'M33 a burst ended by an unexpected key is dropped silently',
    file: 'scanner.js',
    from: '    const v = _scanVerdict();\n    if (v) {',
    to:   '    const v = null;\n    if (v) {',
    why:  'the last silent rejection path — a wrong scanner suffix would give no clue at all',
  },
  {
    name: 'M34 (D1) the boot integrity guard is called bare again',
    file: 'boot.js',
    from: 'let _bootIntegrity = false;\ntry {\n  _bootIntegrity = bootIntegrityOK();\n} catch (e) {\n  console.error(\'Boot integrity check threw — treating as failed.\', e);\n  _bootIntegrity = false;\n}\n\nif (!_bootIntegrity) {',
    to:   'if (!bootIntegrityOK()) {',
    why:  'the throw escapes and the user gets a blank white screen instead of the recovery prompt',
  },
  {
    name: 'M35 (D1) a throw is treated as a PASSED integrity check',
    file: 'boot.js',
    from: "  console.error('Boot integrity check threw — treating as failed.', e);\n  _bootIntegrity = false;",
    to:   "  console.error('Boot integrity check threw.', e);\n  _bootIntegrity = true;",
    why:  'boot falls through to load() instead of stopping at the guard; the v61.2 net happens to paint a near-identical screen, so ONLY the guard-specific wording distinguishes them',
  },
  {
    // ⚠ THE v68 BUG ITSELF. This is the mutation that would have caught the
    // release if it had existed. Reverting to an ASCII-only character class
    // leaves the app broken on every iPhone while reading as a correct fix.
    name: 'M40 (v68.1) titleCase only recognises the ASCII apostrophe',
    file: 'utils.js',
    from: "  return String(s || '').replace(/(['\\u2019\\u02BC]?)(\\w+)/g, (m, apo, word) =>",
    to:   "  return String(s || '').replace(/('?)(\\w+)/g, (m, apo, word) =>",
    why:  'iOS smart punctuation types U+2019, so the possessive breaks on the actual device while every ASCII test still passes',
  },
  {
    name: 'M41 (v68.1) the typed apostrophe is normalised to ASCII',
    file: 'utils.js',
    from: "      : apo + word.charAt(0).toUpperCase() + word.slice(1)",
    to:   "      : '\\u0027' + word.charAt(0).toUpperCase() + word.slice(1)",
    why:  'the certificate would show a character the engineer never typed',
  },
  {
    name: 'M36 (D2) titleCase goes back to capitalising after any apostrophe',
    file: 'utils.js',
    from: "  return String(s || '').replace(/(['\\u2019\\u02BC]?)(\\w+)/g, (m, apo, word) =>\n    (apo && word.length === 1)\n      ? m\n      : apo + word.charAt(0).toUpperCase() + word.slice(1)\n  );",
    to:   "  return String(s || '').replace(/\\b\\w/g, c => c.toUpperCase());",
    why:  "\"Bob's Office\" reaches certificates and CSV exports as \"Bob'S Office\"",
  },
  {
    name: 'M37 (D2) titleCase ignores apostrophes entirely',
    file: 'utils.js',
    from: '    (apo && word.length === 1)',
    to:   '    (apo)',
    why:  "over-correcting breaks real names — O'Brien would come out as O'brien",
  },
  {
    name: 'M38 (D3) the error scrub falls back to the raw message',
    file: 'bugreport.js',
    from: '    if (!complete) return _BUG_SCRUB_WITHHELD;',
    to:   '    if (!complete) return s;',
    why:  'the scrub becomes a passthrough on exactly the failure it was written for',
  },
  {
    name: 'M39 (D3) the error text bypasses the scrub on the way into the email',
    file: 'bugreport.js',
    from: '.map(e => `${e.kind}: ${_scrubCustomerData(e.message)}${e.where',
    to:   '.map(e => `${e.kind}: ${e.message}${e.where',
    why:  'a client or site name interpolated into an error reaches the support inbox verbatim',
  },

  // ---- v69 (D5): the one-time apostrophe data repair ----
  {
    name: 'M42 (D5) the repair lowercases after an apostrophe unconditionally',
    file: 'utils.js',
    from: "      word === word.toUpperCase()\n        ? m                                    // BOB'S — deliberate caps, untouched",
    to:   "      false\n        ? m",
    why:  "BOB'S OFFICE becomes BOB's OFFICE — the repair introduces a worse defect than the one it fixes, on a string the user typed deliberately",
  },
  {
    name: 'M43 (D5) the repair only recognises the ASCII apostrophe',
    file: 'utils.js',
    from: "    /([A-Za-z]+)(['\\u2019\\u02BC])([A-Z])(?![A-Za-z])/g,",
    to:   "    /([A-Za-z]+)(['])([A-Z])(?![A-Za-z])/g,",
    why:  'exactly the V68 failure repeated — iOS types U+2019, so the repair would do nothing on any real phone while the ASCII assertions stayed green',
  },
  {
    name: 'M44 (D5) the repair also rewrites multi-letter suffixes',
    file: 'utils.js',
    from: "([A-Z])(?![A-Za-z])/g,",
    to:   "([A-Z])/g,",
    why:  "O'Brien and D'Angelo would be rewritten to O'brien and D'angelo — real names damaged by a repair pass",
  },
  {
    name: 'M45 (D5) the run-once latch is never set',
    file: 'storage.js',
    from: '  localStorage.setItem(REPAIR_DONE_KEY, APP_VERSION);',
    to:   '  /* latch removed */',
    why:  'the repair re-runs on every boot, so it can be applied to data a user has since deliberately edited back',
  },
  {
    name: 'M46 (D5) no undo snapshot is recorded',
    file: 'storage.js',
    from: '      localStorage.setItem(REPAIR_UNDO_KEY, JSON.stringify(undo));',
    to:   '      /* snapshot removed */',
    why:  'the only way back from a data rewrite disappears, and the Settings button silently never appears',
  },
  {
    name: 'M47 (D5) the stale session encoding is written back over the repair',
    file: 'storage.js',
    from: '    if (touched) _invalidateSessionEncoding(sess);',
    to:   '    if (false) _invalidateSessionEncoding(sess);',
    why:  'THE TRAP THIS RELEASE ALMOST SHIPPED — serialiseSessions reuses a cached encoding when the items array reference and item COUNT are unchanged, which is exactly the case here, so the whole repair silently un-happens on the next reload',
  },
  {
    name: 'M48 (D5) presets are left out of the repair',
    file: 'storage.js',
    from: '  (state.itemPresets || []).forEach(p => {',
    to:   '  ([]).forEach(p => {',
    why:  'the quick-pick buttons keep the mangled labels, and every item logged from one writes the bad string back into fresh data',
  },
  {
    name: 'M49 (D5) the backup reminder is not tripped after a rewrite',
    file: 'storage.js',
    from: '    state.lastBackupAt = null;\n    localStorage.removeItem(LAST_BACKUP_KEY);',
    to:   '    /* nudge removed */',
    why:  'the on-device undo is the ONLY safety net left, and it dies with the browser data it lives in',
  },
  {
    name: 'M50 (D4) the delegated click handler stops catching action throws',
    file: 'dispatch.js',
    from: '  try {\n    fn(arg, el, e);\n    if (state.view !== viewBefore',
    to:   '  if (true) {\n    fn(arg, el, e);\n    if (state.view !== viewBefore',
    why:  'a throwing view renderer leaves state pointing at one screen while the previous screen is still on display, so the next tap runs the wrong actions',
  },
  {
    name: 'M51 (D4) the recovery leaves the view where the failed action put it',
    file: 'dispatch.js',
    from: "      state.view = 'sessions';\n      render();\n      if (typeof showToast === 'function') showToast('Something went wrong — back to your jobs');",
    to:   '      render();',
    why:  'recovering by re-rendering the very view that just threw either throws again or repaints the broken screen — state and screen still disagree',
  },
  {
    name: 'M52 (V70) an extracted function is lost on the way out of session.js',
    file: 'settings-actions.js',
    from: 'function saveReportSettingsForm(',
    to:   'function saveReportSettingsForm_LOST(',
    why:  'THE failure mode of a split: every file still parses, the load order is intact, nothing is duplicated — and the Save button on Report Settings throws on tap. Nothing before V70 caught this',
  },
  {
    name: 'M53 (V70) the wizard constant is left behind in the old file',
    file: 'onboarding.js',
    from: 'const WIZARD_LAST_STEP = 6;',
    to:   'const WIZARD_LAST_STEP = 5;',
    why:  'a top-level const does not attach to window, so a mis-moved constant is invisible to the boot guard — the exact shape of the V61 white screen',
  },
  {
    name: 'M54 (V70) a new file is referenced but never uploaded',
    file: 'boot.js',
    from: "    'saveReportSettingsForm', 'wizardNextStep'",
    to:   "    'saveReportSettingsForm'",
    why:  'one probe per script file is what turns a partial deploy into the designed recovery screen instead of a silent failure a user finds by tapping',
  },
  {
    name: 'M55 (V70) a split file drops out of the service-worker precache',
    file: 'sw.js',
    from: "  './onboarding.js',        // v70",
    to:   '  // dropped',
    why:  'a file in index.html but not in ASSETS loads online and 404s offline — the app would work in the office and break in the field, which is the worst possible failure shape for this app',
  },

  {
    name: 'M56 (V70.1) the click swallow stops disarming on a new pointerdown',
    file: 'events.js',
    from: "  document.addEventListener('pointerdown', () => { disarmClickSwallow(); }, true);",
    to:   '  // disarm removed',
    why:  'this is the V70.1 repair itself — without it a pick that produces no ghost click leaves the guard armed and eats the engineer\'s next PASS tap, which is the two-taps-of-Pass field report',
  },
  {
    name: 'M57 (V70.1) the swallow is disarmed by the tap that arms it',
    file: 'events.js',
    from: '    armClickSwallow();      // eat the trailing ghost click before it hits PASS/Notes',
    to:   '    armClickSwallow(); disarmClickSwallow();',
    why:  'inverting the disarm/arm order makes the guard cancel itself, so the ghost click reaches PASS again — the exact V57.1 bug, reintroduced silently',
  },
  {
    name: 'M58 (V70.1) the painter repaints an unchanged list',
    file: 'events.js',
    from: '  if (existing && currentHTML === html) return;          // unchanged — do not touch the DOM',
    to:   '  // identity skip removed',
    why:  'rebuilding the list on every keystroke destroys the row the finger is travelling towards, which is half of "I tapped it and it did not select"',
  },
  {
    name: 'M59 (V70.1) the shrink lands immediately again',
    file: 'events.js',
    from: '  if (onDefer && newRows < oldRows) {',
    to:   '  if (false) {',
    why:  'without hysteresis a narrowing list pulls the aimed-at row out from under the finger, and the tap falls through to the PASS button the dropdown was covering',
  },
  {
    name: 'M60 (V70.1) the location blur full-renders unconditionally',
    file: 'events.js',
    from: '        if (state.sqpEnabled && locationChanged) { invalidateSqpRow(); render(); }',
    to:   '        if (state.sqpEnabled) { invalidateSqpRow(); render(); }',
    why:  'a render() 150ms after blur rebuilds #app.innerHTML and destroys whatever is mid-tap — the second route to PASS needing two presses',
  },

  /* ---- V71: the config.js -> data.js split ---- */
  {
    name: 'M61 (V71) data.js loads after state.js instead of before it',
    file: 'index.html',
    from: '  <script src="data.js"></script>\n  <script src="state.js"></script>',
    to:   '  <script src="state.js"></script>\n  <script src="data.js"></script>',
    why:  'state.js seeds itemTypes/failReasons from DEFAULT_ITEM_TYPES in a TOP-LEVEL initialiser, so one line of load order is the difference between a working app and one that never starts. This is the single most likely way to break V71, and the least visible in review',
  },
  {
    name: 'M62 (V71) a moved table arrives empty',
    file: 'data.js',
    from: 'const DEFAULT_ITEM_TYPES = [',
    to:   'const DEFAULT_ITEM_TYPES = [].concat([]) || [',
    why:  'the binding still exists and the app still boots — an extraction that loses the CONTENTS passes every "is it defined" check. The length floors and sample members in 09g are the only things that see it',
  },
  {
    name: 'M63 (V71) the footer logo is truncated on the way across',
    file: 'data.js',
    from: "const PATGO_FOOTER_LOGO = 'data:image/png;base64,",
    to:   "const PATGO_FOOTER_LOGO = 'data:image/png;base64,TRUNCATED'; const _PATGO_FOOTER_LOGO_REST = 'x",
    why:  'a clipped 5 KB single-line base64 value is still a non-empty string that starts with the right prefix, and renders nothing in the PDF footer. Copy-paste truncation is exactly how this would happen',
  },
  {
    name: 'M64 (V71) the boot guard stops probing for data.js',
    file: 'boot.js',
    from: "  if (typeof DEFAULT_ITEM_TYPES === 'undefined') {",
    to:   '  if (false) {',
    why:  'without it a partial deploy that omits data.js falls through to the state check, which throws on a TDZ binding instead of returning false — the D1 mechanism, reached through a new door',
  },
  {
    name: 'M65 (V71) the data.js probe is moved below the state check',
    file: 'boot.js',
    from: "  if (typeof DEFAULT_ITEM_TYPES === 'undefined') {\n    console.error('Boot integrity check failed: DEFAULT_ITEM_TYPES missing",
    to:   "  if (typeof state === 'undefined' || !state) { return false; }\n  if (typeof DEFAULT_ITEM_TYPES === 'undefined') {\n    console.error('Boot integrity check failed: DEFAULT_ITEM_TYPES missing",
    why:  'ordering, not presence. The probe still exists and still reads correctly, but state.js is already dead by the time it runs, so the guard throws and the console names the wrong file',
  },
  {
    name: 'M66 (V71) config.js grows a top-level read of a data.js name',
    file: 'config.js',
    // ⚠ ANCHORED ON A VALUE THAT ROLLS EVERY RELEASE. Re-point it at the current
    // APP_VERSION each version, or the mutation ABORTS (defence 2) rather than
    // failing loudly. V72 is the first release that had to do this.
    from: "const APP_VERSION = 'V85';",
    to:   "const APP_VERSION = 'V85';\nconst _FIRST_TYPE = DEFAULT_ITEM_TYPES[0];",
    why:  'the dependency has to stay one way — config.js runs first, so a top-level read of anything in data.js is a ReferenceError at boot for every user. Reading the source cannot tell this from the same read inside a function body; running config.js alone can',
  },
  {
    name: 'M67 (V71) data.js drops out of the service-worker precache',
    file: 'sw.js',
    from: "  './data.js',",
    to:   '',
    why:  'the app would work for whoever deployed it and fail for every installed PWA on the next cold start, offline — the worst-shaped bug this project can ship',
  },
  {
    name: 'M68 (V71) a moved table is left behind in config.js as well',
    file: 'config.js',
    from: "const RETEST_UPCOMING_DAYS = 90;",
    to:   "const RETEST_UPCOMING_DAYS = 90;\nconst READING_CLASSES = ['I', 'II', 'III'];",
    why:  'a copy-not-move leaves a duplicate top-level const across two loaded files, which is a fatal SyntaxError that kills a whole file. This proves the existing duplicate-declaration scan actually covers the new file',
  },

  /* ---------- V72: the render-core.js -> render-review.js split ---------- */

  {
    name: 'M69 (V72) a moved screen is lost on the way out',
    file: 'render-review.js',
    from: 'function renderOverview() {',
    to:   'function renderOverview_LOST() {',
    why:  'the failure the whole 09 file exists for, in its V72 shape. Every file still parses, no const is duplicated, the load order is intact, every delegated action still resolves — and opening a session Overview throws ReferenceError on a phone. 09d cannot see it: the moved screens are reached through render(), not through the ACTIONS table',
  },
  {
    name: 'M70 (V72) render() loses its branch to a moved screen',
    file: 'render-core.js',
    from: "  else if (v === 'overview') html = renderOverview();",
    to:   '',
    why:  'presence, not reachability. renderOverview() still exists and still passes a lookup — the dispatcher just stopped calling it, so the screen paints the previous view or an empty shell with no error. This is what forces 09n to drive render() per view and to check a marker string rather than a length',
  },
  {
    name: 'M71 (V72) a moved screen bounces to the sessions list instead',
    file: 'render-review.js',
    from: "  if (!state.retestRemindersEnabled) { state.view = 'sessions'; return renderSessions(); }",
    to:   "  if (true) { state.view = 'sessions'; return renderSessions(); }",
    why:  "proves 09n's no-bounce assertion is not hollow. A bounced render still paints ~4 KB of perfectly valid sessions-list markup, so every length-based smoke check goes green on it — this is exactly how the first draft of 09n passed on a view it never reached",
  },
  {
    name: 'M72 (V72) the shared photo markup is copied, not moved',
    file: 'render-core.js',
    from: 'function refreshEntryAfterLog() {',
    to:   "function renderPhotoStripSheet() { return ''; }\n\nfunction refreshEntryAfterLog() {",
    why:  'the sneakier half of MAP rule 1. A duplicate top-level FUNCTION is legal and silent — last loaded wins — so render-core.js loading first means the real one in render-review.js quietly replaces this stub and nothing looks wrong. Reverse the load order and the photo strip silently empties',
  },
  {
    name: 'M73 (V72) the boot guard stops probing for render-review.js',
    file: 'boot.js',
    from: "    'renderOverview',",
    to:   '',
    why:  'one probe per script file is the rule. Without it, a deploy that commits index.html but never uploads render-review.js boots looking completely healthy and dies the first time anyone opens an Overview — the exact partial-deploy shape V70 made possible',
  },
  {
    name: 'M74 (V72) render-review.js drops out of the service-worker precache',
    file: 'sw.js',
    from: "  './render-review.js',",
    to:   '',
    why:  'works for whoever deployed it, fails for every installed PWA on the next cold start with no signal. Same shape as M67 — the new file has to be covered by the same check',
  },
  {
    name: 'M75 (V72) render() is made async in the file it stayed in',
    file: 'render-core.js',
    from: 'function render() {',
    to:   'async function render() {',
    why:  'MAP rule 2 had to survive a release that rewrote the file around render(). An async render() returns a promise instead of painting, so every caller that renders and then reads the DOM sees the old screen',
  },

  /* ---------- V73: the render-settings.js -> render-help.js split ---------- */

  {
    name: 'M76 (V73) a moved help screen is lost on the way out',
    file: 'render-help.js',
    from: 'function renderSettingsGlossary() {',
    to:   'function renderSettingsGlossary_LOST() {',
    why:  'the V73 shape of the standing failure. Everything parses, no const is duplicated, every delegated action resolves — and tapping Glossary throws ReferenceError on a phone. 09d is blind to it because these screens are reached through render(), not the ACTIONS table',
  },
  {
    name: 'M77 (V73) render() loses its branch to a moved help screen',
    file: 'render-core.js',
    from: "  else if (v === 'settingsContact') html = renderSettingsContact();",
    to:   '',
    why:  'presence, not reachability. renderSettingsContact() still exists and still passes a lookup — the dispatcher just stopped calling it, so the Contact page paints whatever the previous view left behind with no error anywhere. This is what forces 09s to drive render() per view and check a marker string',
  },
  {
    name: 'M78 (V73) a help screen paints an empty shell',
    file: 'render-help.js',
    from: 'function renderSettingsGlossary() {',
    to:   "function renderSettingsGlossary() {\n  return '<div class=\"screen\"><div class=\"info-card\"><h2>Glossary</h2></div></div>';",
    why:  "proves 09s's marker assertions are not hollow. The function exists, render() does not throw, state.view does not bounce, and the screen paints perfectly valid markup — it is just not the glossary. Presence, reachability and length checks all go green; only a string taken from inside the moved function's own output can see it",
  },
  {
    name: 'M79 (V73) the sub-header is copied across the seam, not called',
    file: 'render-help.js',
    from: 'function renderSettingsAbout() {',
    to:   "function renderSettingsSubHeader(title) { return ''; }\n\nfunction renderSettingsAbout() {",
    why:  'the same silent hazard as M72, in the direction V73 created. A duplicate top-level FUNCTION is legal and silent (MAP rule 1) — render-help.js loads last, so this stub quietly wins and every settings sub-header in the app empties at once, with nothing thrown',
  },
  {
    name: 'M80 (V73) the boot guard stops probing for render-help.js',
    file: 'boot.js',
    from: "    'renderSettingsAbout'\n  ];",
    to:   "  ];",
    why:  'one probe per script file. Without it a deploy that commits index.html but never uploads render-help.js boots looking healthy and dies the first time anyone opens About — which is also the page users are told to open to check the version',
  },
  {
    name: 'M81 (V73) render-help.js drops out of the service-worker precache',
    file: 'sw.js',
    from: "  './render-help.js',",
    to:   '',
    why:  'works for whoever deployed it, fails for every installed PWA on the next cold start with no signal. Same shape as M67 and M74',
  },
  {
    name: 'M82 (V73) the About changelog is appended to rather than rolled',
    file: 'render-help.js',
    // ⚠ ANCHORED ON THE OLDEST ENTRY, WHICH ROLLS EVERY RELEASE. Re-point it at
    // the current oldest each version, same maintenance as M66.
    from: '        <p><strong>V83.1</strong> &middot; September 2026</p>',
    to:   '        <p><strong>V83.1</strong> &middot; September 2026</p>\n        <p class="muted">Housekeeping only.</p>\n\n        <p><strong>V83</strong> &middot; September 2026</p>',
    why:  'the rolling 3-version changelog is a standing release rule that nothing enforced before V73. Appending rather than rolling grows the About page unboundedly and is the kind of thing that is only ever noticed months later',
  },

  {
    name: 'M83 (V74) the poison window is never armed after a dropped burst',
    file: 'scanner.js',
    from: "    _scanPoisonUntil = now + scanEndMs();\n    return;\n  }\n\n  // v74: inside the poison window.",
    to:   "    return;\n  }\n\n  // v74: inside the poison window.",
    why:  'restores the exact V73 defect: the tail of an interrupted scan forms a short, fast, plausible burst of its own and is written into the asset box. A WRONG asset number on a certificate, with nothing on screen to suggest it happened — the only fault in this file with a data-correctness consequence',
  },
  {
    name: 'M84 (V74) the poison window is set once instead of sliding',
    file: 'scanner.js',
    from: "  if (now < _scanPoisonUntil) {\n    _scanPoisonUntil = now + scanEndMs();\n    return;\n  }",
    to:   "  if (now < _scanPoisonUntil) {\n    return;\n  }",
    why:  'a fixed window expires while a long barcode is still arriving, so the last few characters form a burst after all. Same wrong-number bug, reachable with a longer label — and it passes the simple version of the test, which is why 08y2 types for 400ms',
  },
  {
    name: 'M85 (V74) the gap presets go back to the values that failed in the field',
    file: 'config.js',
    from: "const SCAN_GAP_PRESETS = { strict: 60, normal: 90, relaxed: 150 };",
    to:   "const SCAN_GAP_PRESETS = { strict: 40, normal: 60, relaxed: 90 };",
    why:  'the measured scanner emitted characters 100–115ms apart and was refused on every one of these settings, silently. A rejected burst looks identical to a scanner that is not connected — the engineer pulls the trigger and nothing happens at all',
  },
  {
    name: 'M86 (V74) the end-of-burst boundary goes back to a flat constant',
    file: 'scanner.js',
    from: "  return Math.max(scanMaxGapMs() + SCAN_END_PAD_MS, SCAN_END_FLOOR_MS);",
    to:   "  return SCAN_END_FLOOR_MS;",
    why:  'the two-ceilings trap, restored. A flat boundary silently caps how far any preset can be relaxed: past it the burst stops failing as too slow and starts failing as TOO SHORT, because the buffer restarts on every character. Raising a preset then makes things worse, and nothing in the code says so',
  },
  {
    name: 'M87 (V74) the silence timer keeps its own copy of the old flat boundary',
    file: 'scanner.js',
    from: "  _scanTimer = setTimeout(_scanTimeoutCommit, scanEndMs());",
    to:   "  _scanTimer = setTimeout(_scanTimeoutCommit, 120);",
    why:  'the half-fix. Deriving the boundary in the gap check but leaving the timer flat looks correct and quietly caps the no-suffix scanner at the old value — one of two call sites, which is exactly how the original bug survived',
  },
  {
    name: 'M88 (V74) an ordinary target bail arms the poison window too',
    file: 'scanner.js',
    from: "  const ctx = _scanTarget();\n  if (!ctx) { _scanReset(); return; }",
    to:   "  const ctx = _scanTarget();\n  if (!ctx) { _scanReset(); _scanPoisonUntil = Date.now() + 200; return; }",
    why:  'the over-correction. _scanTarget() declines many times a second during normal typing, so arming there blanks a genuine scan for a fifth of a second after every field the engineer leaves — trading a rare wrong number for frequent missing ones',
  },

  {
    name: 'M89 (V75) the keyboard inset is zeroed instead of removed',
    file: 'events.js',
    from: "    root.style.removeProperty('--kb-inset');",
    to:   "    root.style.setProperty('--kb-inset', '0px');",
    why:  'the plausible wrong fix, and the one that would have shipped. Every keyboard-UP test passes identically; what breaks is the keyboard-DOWN case, because a pinned 0px overrides the var() fallback instead of restoring it. Most of the app\'s life is spent with the keyboard down, so this is the state that matters most and the only one that shows it',
  },
  {
    name: 'M90 (V75) offsetTop is dropped from the inset measurement',
    file: 'events.js',
    from: "  const inset = Math.max(0, Math.round(window.innerHeight - (vv.height + vv.offsetTop)));",
    to:   "  const inset = Math.max(0, Math.round(window.innerHeight - vv.height));",
    why:  'the naive measurement. Correct whenever iOS has not shifted the view, wrong by exactly the shift amount when it has — so the sheet lands partly back under the keyboard on the one occasion the fix was needed, and reads as "it did not work" rather than as an arithmetic error',
  },
  {
    name: 'M91 (V75) only resize is bound, not scroll',
    file: 'events.js',
    from: "  vv.addEventListener('scroll', onChange);",
    to:   "  void 0;",
    why:  'the half-binding. iOS fires scroll, not resize, when it shifts the visual viewport to reveal a focused field — so the sheet is correctly sized but sitting in the wrong place, which is one of the two halves of the original bug left intact',
  },
  {
    name: 'M92 (V75) the wizard height floor is never released',
    file: 'events.js',
    from: "  root.style.setProperty('--sheet-min-release', '0px');",
    to:   "  void 0;",
    why:  'the sheet nobody re-checks. Everything else is a CAP, and a cap that is too generous merely fails to help; a FLOOR of 72vh actively forces the wizard taller than the space above the keyboard, so it overflows off its own top — the title vanishes upward and it presents as an entirely different fault',
  },
  {
    name: 'M93 (V75) the shell stops reading the inset',
    file: 'styles.css',
    from: "  bottom: var(--kb-inset, 0px);",
    to:   "  bottom: 0;",
    why:  'the disconnected half. The JS still publishes perfect values and nothing consumes them, so every behavioural assertion about the measurement stays green while no sheet moves at all. This is why the CSS seam is asserted separately from the mechanism',
  },
  {
    name: 'M94 (V75) the welcome list loses its scroller',
    file: 'render-core.js',
    from: 'class="welcome-list sheet-scroll"',
    to:   'class="welcome-list"',
    why:  'V74\'s actual shipped bug, restored. The shell has been capped with overflow:hidden since v57, so an unmarked list clips instead of scrolling and takes the Continue button with it — the modal announcing the release cannot be dismissed',
  },
  {
    name: 'M95 (V75) focusInSheet stops preventing the document scroll',
    file: 'utils.js',
    from: "    el.focus({ preventScroll: true });",
    to:   "    el.focus();",
    why:  'the helper reduced to a wrapper around the bug it exists to fix. Focus still lands, the form still works, and iOS still drags the fixed sheet around the screen on every open — the failure is invisible to anything that only checks the field got focus',
  },
  {
    name: 'M96 (V75) a bare focus() creeps back into a sheet',
    file: 'feedback.js',
    from: "    if (!v) { if (inp) focusInSheet(inp); return; }",
    to:   "    if (!v) { if (inp) { try { inp.focus(); } catch (e) {} } return; }",
    why:  'the regression shape this release is most exposed to. Five call sites were converted by hand; one reverting looks like tidy defensive code and reintroduces the jump on a single path, which is the hardest kind to notice in the field',
  },
  {
    name: 'M97 (V76) the wizard body loses the shared scroller',
    file: 'render-core.js',
    from: 'class="wizard-body sheet-scroll"',
    to:   'class="wizard-body"',
    why:  "V76's actual shipped defect, restored. With no scroller and .wizard-foot pinned, the shell's overflow:hidden clips the buttons — Continue, Back and Skip — off the bottom of the first screen a new install ever shows. The wizard still LOOKS right on a tall phone, which is why it survived from v33 to v76",
  },
  {
    name: 'M98 (V76) the shared scroller loses min-height:0',
    file: 'styles.css',
    from: '  flex: 1 1 auto;\n  min-height: 0;\n}\n/* v76: the other half',
    to:   '  flex: 1 1 auto;\n}\n/* v76: the other half',
    why:  'one property, every sheet. A flex child will not shrink below its content height without it, so nothing scrolls anywhere and every marked sheet clips instead — and the rule still reads as a scroller at a glance, which is exactly how it went unnoticed in .wizard-body',
  },
  {
    name: 'M99 (V76) a new hand-rolled scroller appears without min-height:0',
    file: 'styles.css',
    from: '.sheet-pin { flex-shrink: 0; }',
    to:   '.sheet-pin { flex-shrink: 0; }\n.some-new-sheet-body { overflow-y: auto; flex: 1 1 auto; -webkit-overflow-scrolling: touch; }',
    why:  'the FUTURE version of this release\'s bug, and the only mutation here that no per-site assertion can catch. A later release adds a sheet, gives its body a private scroller rule, and omits the one property — 12d has to notice a rule it has never been told about',
  },
  {
    name: 'M100 (V76) the fail-reason grid loses its scroller',
    file: 'render-core.js',
    from: 'class="fail-reasons-grid sheet-scroll"',
    to:   'class="fail-reasons-grid"',
    why:  'the most-used sheet on the entry screen, and its height belongs to the user — the reason list is editable in Settings. Unmarked, a long list pushes Other… and the camera button off the bottom, so the fails that need a photo are the ones that cannot get one',
  },
  {
    name: 'M101 (V76) the Other… button loses its pin',
    file: 'render-core.js',
    from: 'class="fail-other-btn sheet-pin"',
    to:   'class="fail-other-btn"',
    why:  'the half-fix, and the shape V75 shipped in .welcome-continue before it was generalised. The grid scrolls correctly and the escape hatch below it is compressed away instead — a user with a long custom reason list is left worse off than one with a short list',
  },
  {
    name: 'M102 (V76) the bulk-type grid loses its scroller',
    file: 'render-review.js',
    from: 'class="quick-grid sheet-scroll"',
    to:   'class="quick-grid"',
    why:  'the worst of the three growth cases: every item type in the preset AND a keyboard sheet, so it is fighting the reduced --sheet-max at the same time. The custom-type input and the Apply button are what get lost, which means the bulk edit cannot be completed at all',
  },
  {
    name: 'M103 (V76) the info sheet OK button loses its pin',
    file: 'feedback.js',
    from: 'class="btn-primary sheet-pin" id="info-sheet-ok"',
    to:   'class="btn-primary" id="info-sheet-ok"',
    why:  'this sheet is the app\'s error reporter and has NO timer by design — it must stay until acknowledged. An unpinned button under a long error message is a dialog that cannot be dismissed, on the exact path where the user is already being told something went wrong',
  },
  {
    name: 'M104 (V76) the pin is applied globally to a shared class instead',
    file: 'styles.css',
    from: '.btn-primary { width: 100%;',
    to:   '.btn-primary { flex-shrink: 0; width: 100%;',
    why:  'the tempting shortcut. It fixes every sheet at once and reaches every .btn-primary in the app, including ones in flex rows on screens nobody was testing — a layout change disguised as a sheet fix. 12g exists so the pin stays a per-site decision',
  },
  {
    name: 'M105 (V76) the scroller class is misspelled at one site',
    file: 'render-core.js',
    from: 'class="multipick-list sheet-scroll"',
    to:   'class="multipick-list sheet-scoll"',
    why:  'the failure that looks like success. A near-miss spelling matches no rule, so the sheet behaves exactly as it did before the fix, and a grep for the correct class simply finds one fewer than it should — nothing about the markup looks wrong',
  },

  {
    name: 'M106 (V77) the hold gesture is written but never bound to the grid',
    file: 'events.js',
    from: "  attachHoldGesture($('quick-grid'), QUICK_PICK_LONGPRESS_MS, () => {",
    to:   "  attachHoldGesture(null, QUICK_PICK_LONGPRESS_MS, () => {",
    why:  'THE V67 SHAPE, reproduced exactly. The helper is perfect, the callback is perfect, and nothing is attached to anything — which is how an unbound initScanner() survived three releases. Only a test that fires a real event at the real painted element can tell this from working code',
  },
  {
    name: 'M107 (V77) the hold fires on touch DOWN instead of after the threshold',
    file: 'events.js',
    from: "    pressTimer = setTimeout(() => {\n      pressTimer = null;\n      didHold = true;\n      onHold();\n    }, ms);",
    to:   "    didHold = true;\n    onHold();",
    why:  'a different feature wearing the same name. Every "does the sheet open" assertion still passes; what breaks is that touching a quick-pick button to SELECT an item type now opens the preset switcher instead. The gate assertion in 13a is the only thing between these two',
  },
  {
    name: 'M108 (V77) finger drift no longer aborts a pending hold',
    file: 'events.js',
    from: "    if (Math.abs(x - startX) > MOVE_SLOP || Math.abs(y - startY) > MOVE_SLOP) {",
    to:   '    if (false) {',
    why:  'scrolling the entry screen with a finger that happens to start on the grid now opens the preset sheet. Invisible in any test that presses and holds without moving, which is every test anyone writes first',
  },
  {
    name: 'M109 (V77) the tap that follows a fired hold is no longer swallowed',
    file: 'events.js',
    from: "    if (didHold) {\n      e.stopPropagation();\n      e.preventDefault();\n      didHold = false;\n    }",
    to:   '    if (false) {}',
    why:  'the v47 decision-2A behaviour, silently undone. Holding Copy-last would open the ×N sheet AND log a copy behind it; holding the grid would switch preset AND change the selected item type. Both leave the app in a state the user did not ask for and did not see happen',
  },
  {
    name: 'M110 (V77) the batch overwrites the item under the cursor instead of appending',
    file: 'session.js',
    // V79: re-pointed — V78 changed uid() to newId() here and this anchor
    // silently aborted for a release. Anchored on the loop head only now.
    from: "  for (let i = 0; i < total; i++) {\n    const item = {\n      id: newId(),",
    to:   "  if (state.cursor < sess.items.length) sess.items.length = state.cursor;\n  for (let i = 0; i < total; i++) {\n    const item = {\n      id: newId(),",
    why:  'THE DATA-LOSS MUTATION, and the reason repeatLastResult is modelled on multiPickFire rather than on copyLastResult. Copy-last overwrites at the cursor; a batch doing the same destroys every item after it. The count still goes up, so the toast reads correct',
  },
  {
    name: 'M111 (V77) the batch takes its asset number from the form',
    file: 'session.js',
    from: "      assetNo: nextAssetNo(sess),   // recomputed each push off the growing list\n      location: cleanLocation,\n      itemType: cleanType,\n      notes: last.notes || '',",
    to:   "      assetNo: state.form.assetNo.trim() || nextAssetNo(sess),\n      location: cleanLocation,\n      itemType: cleanType,\n      notes: last.notes || '',",
    why:  'copies the line out of copyLastResult, which is correct there and wrong here: with a scanned number in the box every copy in the batch gets the SAME asset number, and duplicate asset numbers on a certificate are a real-world defect nobody notices until the client does',
  },
  {
    name: 'M112 (V77) the batch blanks notes, the way copy-last does',
    file: 'session.js',
    from: "      notes: last.notes || '',",
    to:   "      notes: '',",
    why:  "a fail's REASON lives in the notes field (pickFailReason appends it there). Blanking it turns a batch of failures into a run of bare fails with no reason on the certificate — the one outcome this feature must not produce",
  },
  {
    name: 'M113 (V77) the count cap stops being applied',
    file: 'session.js',
    from: '  const total = Math.min(count, REPEAT_MAX_N);',
    to:   '  const total = count;',
    why:  'a mistyped 100 in the custom box buries the job in 100 rows, and there is no undo for a batch append. The cap is a damage limit, not a technical one',
  },
  {
    name: 'M114 (V77) the batch is logged without a location',
    file: 'session.js',
    from: "  const cleanLocation = normaliseLocation(state.form.location);\n  if (!cleanLocation) {",
    to:   "  const cleanLocation = normaliseLocation(state.form.location);\n  if (false) {",
    why:  'location has been mandatory per item since v13. N items with a blank location is N rows that fail the same validation every other path enforces, arriving all at once',
  },
  {
    name: 'M115 (V77) batch items are only timestamped when the setting is on',
    file: 'session.js',
    from: "    // v61: every item is stamped on first log, always. The setting gates EXPOSURE\n    // only (see config.js). Copy-last and saveItem both stamp unconditionally.\n    item.ts = new Date().toISOString();",
    to:   "    if (state.timestampsEnabled) item.ts = new Date().toISOString();",
    why:  'restores the exact defect V77 fixed in multipick.js. It reads as the obviously-correct thing (why stamp what is switched off?) and it permanently loses capture: turning the setting on later cannot recover a timestamp that was never written',
  },
  {
    name: 'M116 (V77) multiPickFire goes back to gating timestamp capture',
    file: 'multipick.js',
    from: '    item.ts = new Date().toISOString();',
    to:   '    if (state.timestampsEnabled) item.ts = new Date().toISOString();',
    why:  'the V77 fix itself, undone. This is the line that was missed when v61 changed the rule, and it survived six releases precisely because nothing asserted on the setting being OFF',
  },
  {
    name: 'M117 (V77) the preset-edit deep link leaves no return marker',
    file: 'dispatch.js',
    from: "    state.presetEditReturnView = 'entry';\n    setView('settingsItems');",
    to:   "    setView('settingsItems');",
    why:  'the reported V76 bug, restored. Back climbs into the Settings hierarchy the user never walked down. Nothing throws, nothing looks broken, and the user simply ends up somewhere else',
  },
  {
    name: 'M118 (V77) the return marker is set but never honoured',
    file: 'dispatch.js',
    from: "    if (state.presetEditReturnView && state.view === 'settingsItems') {",
    to:   '    if (false) {',
    why:  'the half-fix. State is written, threaded and cleared correctly, and the branch that reads it is dead — so every test that checks the marker gets SET still passes while the user-visible behaviour is unchanged',
  },
  {
    name: 'M119 (V77) the return marker survives navigating away',
    file: 'session.js',
    from: "  if (v !== 'settingsItems') state.presetEditReturnView = null;",
    to:   '',
    why:  'the staleness half, which is the one that is easy to leave out because it fixes nothing visible. Without it the marker stays armed after the user wanders off, and Back from an ordinarily-reached Quick Pick Items page later jumps them to the entry screen for no reason they can see',
  },
  {
    name: 'M120 (V77) the quick-pick buttons lose their selection suppression',
    file: 'styles.css',
    from: '.quick-btn { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }',
    to:   '.quick-btn { -webkit-touch-callout: none; }',
    why:  'the reported bug, restored, and restored in the shape that is hardest to see: the callout is still suppressed so the magnifier is gone, but the labels still highlight. Asserting on the rule EXISTING rather than on its three properties would miss this',
  },
  {
    name: 'M121 (V77) a fourth hold site hand-rolls the gesture',
    file: 'render-core.js',
    from: 'function renderEntry() {',
    to:   "function renderEntry() {\n  const _el = document.getElementById('pass-btn');\n  if (_el) { _el.ontouchstart = () => { setTimeout(() => {}, 800); }; }",
    why:  'THE ANTI-DECAY MUTATION. Nothing is broken and nothing behaves wrongly — a reasonable person adds a hold to one more control the direct way. That is precisely how the app reached three sheet-scroller implementations before V76, and 13n exists so the fourth one is refused rather than reviewed',
  },
  {
    name: 'M122 (V77) the ×N sheet keeps its flag but loses its markup',
    file: 'render-core.js',
    from: '      ${repeatSheet}\n',
    to:   '',
    why:  'the sheet opens in state and paints nothing. Every assertion driving repeatLastResult() directly still passes, and the gesture on the phone appears to do nothing at all — the same class of miss as a data-action with no handler',
  },
  {
    name: 'M123 (V78) deleting a job stops leaving a tombstone',
    file: 'session.js',
    from: "  if (going.length) recordTombstone('session', id);",
    to:   '',
    why:  'the whole point of the release. Nothing visible breaks — the job still deletes, every pre-V78 assertion still passes — and the failure only appears on a second device months later, when the deleted job comes back',
  },
  {
    name: 'M124 (V78) the client cascade marks the parent but not its sites',
    file: 'clients.js',
    from: "      state.sites.forEach(s => { if (s.clientId === clientId) recordTombstone('site', s.id); });",
    to:   '',
    why:  'THE PARTIAL-CASCADE MISS. deleteClient looks correct: a tombstone is written, the client and its sites both vanish locally. Only the children are unrecorded, so a sync resurrects the sites of a client that no longer exists — orphans with no parent to delete them again',
  },
  {
    name: 'M125 (V78) the ledger call moves to AFTER the filter',
    file: 'clients.js',
    from: "      recordTombstone('client', clientId);\n      state.sites.forEach(s => { if (s.clientId === clientId) recordTombstone('site', s.id); });\n      state.clients = state.clients.filter(c => c.id !== clientId);\n      state.sites = state.sites.filter(s => s.clientId !== clientId);",
    to:   "      state.clients = state.clients.filter(c => c.id !== clientId);\n      state.sites = state.sites.filter(s => s.clientId !== clientId);\n      recordTombstone('client', clientId);\n      state.sites.forEach(s => { if (s.clientId === clientId) recordTombstone('site', s.id); });",
    why:  'sweep-before-you-remove (cross-cutting rule 5), restored as a bug. The client tombstone is still written and looks right; the site sweep now iterates a list the filter has already emptied and silently marks nothing. 14h asserts on ORDER precisely because presence passes here',
  },
  {
    name: 'M126 (V78) the ledger call is hoisted out of the confirm callback',
    file: 'clients.js',
    from: "  openConfirmSheet({\n    title: 'Delete client?',",
    to:   "  recordTombstone('client', clientId);\n  openConfirmSheet({\n    title: 'Delete client?',",
    why:  'the tidying edit that looks like a simplification — pull the ledger call up beside the thing it describes, out of the callback. The client is now marked deleted the moment the SHEET OPENS, so pressing Cancel keeps it on this device and deletes it from every other one. 14d exists for exactly this and nothing else would catch it',
  },
  {
    name: 'M127 (V78) the ledger stops being persisted',
    file: 'storage.js',
    from: '  localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(normaliseTombstones(state.tombstones)));',
    to:   '',
    why:  'deletions survive in memory for exactly as long as the app stays open. Every in-session assertion passes; the record of what was deleted is gone by the next launch, which is the only moment it was ever needed',
  },
  {
    name: 'M128 (V78) the retention purge drops entries it cannot date',
    file: 'storage.js',
    from: '    return isNaN(ms) ? true : ms >= cutoff;',
    to:   '    return isNaN(ms) ? false : ms >= cutoff;',
    why:  'the ambiguous case flipped the wrong way. A tombstone with an unparseable timestamp is discarded rather than kept, and discarding a tombstone resurrects a deleted record — the exact failure the ledger exists to prevent. A one-word change with no visible symptom',
  },
  {
    name: 'M129 (V78) new records go back to the old short ids',
    file: 'clients.js',
    from: "  const client = { id: 'client_' + newId(), name: trimmed };",
    to:   "  const client = { id: 'client_' + uid(), name: trimmed };",
    why:  'a reasonable-looking revert. uid() is still defined and still works, so nothing breaks on one device — it reintroduces the collision window that only opens once two devices write into one database',
  },


  // ---- V79: cloud sign-in (tests/15-cloud.js) ----
  {
    name: 'M130 (V79) an unknown host falls back to the test project',
    file: 'config.js',
    from: "CLOUD_HOSTS[location.hostname]) || 'off';",
    to:   "CLOUD_HOSTS[location.hostname]) || 'test';",
    why:  'unknown = OFF is what stops a stray copy of the app (localhost, a preview URL, somebody else\'s mirror) from talking to a real database',
  },
  {
    name: 'M131 (V79) sign-in is allowed to create accounts',
    file: 'cloud.js',
    from: 'options: { shouldCreateUser: false }',
    to:   'options: { shouldCreateUser: true }',
    why:  'the test deploy is the public URL free users already have; anyone could create an account in the test project',
  },
  {
    name: 'M132 (V79) boot loads the library for a signed-out user',
    file: 'cloud.js',
    from: "if (!stored) { state.cloud.status = 'signed-out'; return; }",
    to:   "if (!stored) { state.cloud.status = 'signed-out'; cloudClient().catch(() => {}); return; }",
    why:  'spec decision 3: with nobody signed in the app must be exactly what it was — no library, no request',
  },
  {
    name: 'M133 (V79) boot checks the session even when offline',
    file: 'cloud.js',
    from: "  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;\n  cloudClient()",
    to:   "  cloudClient()",
    why:  'offline always: a signed-in phone with no signal must not start network work at boot',
  },
  {
    name: 'M134 (V79) a backup carries the session again',
    file: 'backup.js',
    from: '    // gone — restore ignores it in old backups (see restoreBackupFromFile).\n',
    to:   '    // gone — restore ignores it in old backups (see restoreBackupFromFile).\n    authUser: { session: localStorage.getItem(CLOUD_AUTH_STORAGE_KEY) },\n',
    why:  'a backup is a file engineers email around; a refresh token in it is a working login for anyone who reads it',
  },
  {
    name: 'M135 (V79) load() stops clearing the V43 mock key',
    file: 'storage.js',
    from: '  try { localStorage.removeItem(PAT_AUTH_KEY); } catch {}\n',
    to:   '',
    why:  'the leftover mock user/token must not linger where anything could mistake it for a sign-in',
  },
  {
    name: 'M136 (V79) async cloud results render over a focused field',
    file: 'cloud.js',
    from: "if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;",
    to:   "if (false) return;",
    why:  'MAP rule 3 — a render from a promise tears down the field being typed in and drops the keyboard',
  },
  {
    name: 'M137 (V79) a cloud dispatch handler loses its typeof guard',
    file: 'dispatch.js',
    from: "'cloud-sign-out':   () => { if (typeof cloudSignOut === 'function') cloudSignOut(); },",
    to:   "'cloud-sign-out':   () => { cloudSignOut(); },",
    why:  'MAP rule 6 — with cloud.js missing a tap must be a no-op, not a ReferenceError',
  },
  {
    name: 'M138 (V79) the TEST strip shows whenever the host is test',
    file: 'cloud.js',
    from: "&& state.cloud && state.cloud.status === 'signed-in';",
    to:   "&& state.cloud;",
    why:  'decision 3A: free users on the same URL who never sign in must never see a TEST strip',
  },
  {
    name: 'M139 (V79) sign-out relies on the library alone',
    file: 'cloud.js',
    from: '      doomed.forEach((k) => localStorage.removeItem(k));\n',
    to:   '',
    why:  'signing out offline (library never loaded) would silently leave the session in place',
  },
  {
    name: 'M140 (V79) cloudBoot is written but never called',
    file: 'boot.js',
    from: "  if (typeof cloudBoot === 'function') cloudBoot();\n",
    to:   '',
    why:  'the V65-V67 scanner lesson: an unbound subsystem and a missing one look identical at runtime',
  },
  {
    name: 'M141 (V79) supabase.umd.js dropped from the precache',
    file: 'sw.js',
    from: "  './supabase.umd.js',\n",
    to:   '',
    why:  'after an update a signed-in phone opened offline could not load the library',
  },

  // ---- V80: sync, push only (harness 16) --------------------------------------
  {
    name: 'M142 (V80) saveSessions stops telling sync about saves',
    file: 'storage.js',
    // v84: the same guarded line now also sits in saveReportSettings and
    // saveReportTemplates, which come first in the file — anchored on the
    // comment above the saveSessions copy so it breaks THIS one.
    from: "  // guarded and wrapped so a broken sync.js can never make a save fail.\n  if (typeof syncNoteSave === 'function') { try { syncNoteSave(); } catch (e) { console.error('Sync trigger failed (non-fatal).', e); } }\n",
    to:   "  // guarded and wrapped so a broken sync.js can never make a save fail.\n",
    why:  'the hot-path trigger: without it, jobs only go on reopen and nobody notices the gap',
  },
  {
    name: 'M143 (V80) the fingerprint comparison is dropped — every job, every push',
    file: 'sync.js',
    from: '      if (!force && !st.resend[id] && st.sent[id] === hash) continue;\n',
    to:   '',
    why:  'every save would re-upload every job the engineer has — a quota and battery drain that looks like it works',
  },
  {
    name: 'M144 (V80) the example job is sent',
    file: 'sync.js',
    from: "&& !s[flag]);",
    to:   ');',
    why:  'the demo job would appear in every engineer\u2019s cloud data',
  },
  {
    name: 'M145 (V80) a delete keeps the job\u2019s contents in the cloud',
    file: 'sync.js',
    from: "row: { id, user_id: uid, doc: {}, deleted: true, last_modified: at } });",
    to:   "row: { id, user_id: uid, doc: (state.sessions.find(x => String(x.id) === id) || { gone: id, site: 'ZZDELETEME' }), deleted: true, last_modified: at } });",
    why:  'decision 4A: delete means delete — the client data must not linger server-side',
  },
  {
    name: 'M146 (V80) deletes are sent for jobs the server never had',
    file: 'sync.js',
    from: '      if (!st.sent[id] && !st.gone[id] && !st.resend[id]) continue;  // server never had it\n',
    to:   '',
    why:  'empty deleted rows for jobs that were never uploaded — noise, and it leaks ids of deleted work',
  },
  {
    name: 'M147 (V80) a job that is live AND in the ledger is sent as deleted',
    file: 'sync.js',
    from: "      if (live.has(id)) continue;                    // restored since: it's live\n",
    to:   '',
    why:  'a restored job would be wiped from the cloud straight after being re-sent',
  },
  {
    name: 'M148 (V80) the hash is recomputed after the upload',
    file: 'sync.js',
    from: '            else { st.sent[w.id] = w.hash; delete st.gone[w.id]; sent++; }',
    to:   '            else { const cur = state.sessions.find(x => String(x.id) === w.id); st.sent[w.id] = cur ? syncHash(JSON.stringify(cur)) : w.hash; delete st.gone[w.id]; sent++; }',
    why:  'an edit made while a push is in flight would be marked sent and never reach the cloud',
  },
  {
    name: 'M149 (V80) sync state is used whoever it belongs to',
    file: 'sync.js',
    from: '  return (userId && st.userId === userId) ? st : _syncEmpty(userId);',
    to:   '  st.userId = userId; return st;',
    why:  'a second account on the same phone would believe the first account\u2019s jobs were already in ITS cloud',
  },
  {
    name: 'M150 (V80) an upload error is treated as success',
    file: 'sync.js',
    from: '          if (r && r.error) throw r.error;\n',
    to:   '',
    why:  'jobs the server refused would be marked sent and never retried',
  },
  {
    name: 'M151 (V80) clearing ignores whether the cloud has the latest version',
    file: 'sync.js',
    from: "    const ok = mine && s && st.sent[String(s.id)] === syncHash(_syncCanonical(s));",
    to:   '    const ok = true;',
    why:  'decision 5A: clearing an unsent edit while signed in destroys the only copy of it',
  },
  {
    name: 'M152 (V80) cleared jobs are not remembered',
    file: 'session.js',
    from: "        try { syncNotePruned(Array.from(ids)); } catch (e) { console.error('Cleared-jobs note failed (non-fatal).', e); }\n",
    to:   '',
    why:  'the V81 pull would download every cleared job straight back onto the phone',
  },
  {
    name: 'M153 (V80) restore replaces the cleared list instead of merging',
    file: 'sync.js',
    from: '  const list = _syncPrunedLoad();\n  const have = new Set(list.map(e => e.id));',
    to:   '  const list = [];\n  const have = new Set(list.map(e => e.id));',
    why:  'restoring an older backup would forget jobs cleared since, and the pull would bring them back',
  },
  {
    name: 'M154 (V80) the cleared list is left out of backups',
    file: 'backup.js',
    from: "    syncPruned: (typeof syncPrunedList === 'function') ? syncPrunedList() : undefined,\n",
    to:   '',
    why:  'a restore onto a new phone would lose the list and the pull would resurrect cleared jobs',
  },
  {
    name: 'M155 (V80) sign-in is not followed by a push',
    file: 'cloud.js',
    from: "          if (typeof syncPushSoon === 'function') { try { syncPushSoon(0, { pull: true }); } catch (e) { console.error(e); } }\n",
    to:   '',
    why:  'first sign-in on a phone would send nothing until the engineer happened to save or reopen',
  },
  {
    name: 'M156 (V80) syncBoot is written but never called',
    file: 'boot.js',
    from: "  if (typeof syncBoot === 'function') syncBoot();\n",
    to:   '',
    why:  'the V65-V67 lesson again: no reopen trigger, no boot push, and nothing looks broken',
  },
  {
    name: 'M157 (V80) the app-reopen listener does nothing',
    file: 'sync.js',
    from: "      if (document.visibilityState === 'hidden') return;\n      syncPushSoon(SYNC_RESUME_DELAY_MS, { pull: true });",
    to:   "      if (document.visibilityState === 'hidden') return;",
    why:  'reopening the app is the main moment a job reaches the cloud after a day offline',
  },
  {
    name: 'M158 (V80) the Sync page assumes sync.js loaded',
    file: 'render-help.js',
    from: "  } else if (typeof syncStatusSummary !== 'function') {",
    to:   '  } else if (false) {',
    why:  'a missing optional file would throw inside render() — MAP rule 6',
  },
  {
    name: 'M159 (V80) sync.js dropped from the precache',
    file: 'sw.js',
    from: "  './sync.js',           // v80\n",
    to:   '',
    why:  'after an update, a phone opened offline would run without sync until next online load',
  },
  {
    name: 'M160 (V80) offline push attempts the request anyway',
    file: 'sync.js',
    from: '  if (_syncOffline()) {\n    if (o.manual) {',
    to:   '  if (false) {\n    if (o.manual) {',
    why:  'every save with no signal would fire a doomed request and a confusing error',
  },
  /* ---- V81: pull ---------------------------------------------------------- */
  {
    name: 'M161 (V81) a pulled job is applied without setting its fingerprint',
    file: 'sync.js',
    from: "      state.sessions.unshift(doc);\n      st.sent[id] = hash;",
    to:   "      state.sessions.unshift(doc);",
    why:  'the job arrives and looks right, then the push in the same run sees no fingerprint, decides it is unsent work and sends it back. Harmless once; a loop the moment the other phone does the same. The §8 must-do, and invisible from the screen',
  },
  {
    name: 'M162 (V81) the pull ignores jobs cleared from this phone',
    file: 'sync.js',
    from: "    if (pruned.has(id)) return;",
    to:   "",
    why:  'every job ever cleared floods back on the next pull, which is exactly what V80 decision 5A promised would not happen. The cloud is an archive by design, so the rows are all still there to come back',
  },
  {
    name: 'M163 (V81.1) the pull rewrites the job that is open on screen',
    file: 'sync.js',
    from: "      if (!isOpen) return false;",
    to:   "      if (true) return false;",
    why:  'the items under the engineer\u2019s thumb change between one tap and the next, mid-job, with a keyboard open. Decision 3A defers applying, and this is the line that defers it \u2014 the kind of fault that only ever shows up on a real site',
  },
  {
    name: 'M164 (V81) the cursor advances even when a row was left undecided',
    file: 'sync.js',
    from: "    if (!blocked) st.pulledAt = high;",
    to:   "    st.pulledAt = high;",
    why:  'the mark steps over a row nobody looked at, so the change it carried is never offered again. Everything on screen looks correct \u2014 this is a silent permanent gap, not a visible failure',
  },
  {
    name: 'M165 (V81) a job changed in both places is applied rather than held',
    file: 'sync.js',
    from: "    if (st.sent[id] !== localHash) {\n      _syncHeldNote({ id, reason: 'both-changed', name,",
    to:   "    if (false) {\n      _syncHeldNote({ id, reason: 'both-changed', name,",
    why:  'the one failure this app cannot have. Unsent work on the phone is overwritten by the cloud copy with nothing asked and nothing said \u2014 decision 2A exists for this single line',
  },
  {
    name: 'M166 (V81) a remote delete skips the photo sweep',
    file: 'sync.js',
    from: "  archiveSessionStats(going);\n  photosDeleteForSessions([id]);",
    to:   "  archiveSessionStats(going);",
    why:  'the job goes, its photos stay in IndexedDB for ever with no owner and no way to reach them. The same orphaning deleteSession was written to avoid (MAP rule 5)',
  },
  {
    name: 'M167 (V81) a remote delete removes the job before the sweeps run',
    file: 'sync.js',
    from: "  const going = state.sessions.filter(s => s.id === id);\n  if (!going.length) return false;\n  archiveSessionStats(going);",
    to:   "  const going = state.sessions.filter(s => s.id === id);\n  if (!going.length) return false;\n  state.sessions = state.sessions.filter(s => s.id !== id);\n  archiveSessionStats(going);",
    why:  'ordering, not presence. All three sweeps still run and the job still disappears, so nothing looks wrong \u2014 but the cascades key off a list the id has already left. This is MAP rule 5 stated as a mutation',
  },
  {
    name: 'M168 (V81) the item-count guard is dropped',
    file: 'sync.js',
    from: "    if (doc.items.length < local.items.length) {",
    to:   "    if (false) {",
    why:  'a truncated or half-written cloud row replaces a longer local one without a word. Decision 3A is deliberately stricter than the fingerprint rule needs, precisely so that a bug on the other side of the wire cannot shorten a job here',
  },
  {
    name: 'M169 (V81) the incoming validator accepts anything',
    file: 'sync.js',
    from: "  if (!Array.isArray(doc.items)) return false;",
    to:   "",
    why:  'a row whose items are not an array is written into the sessions list, and the next render indexes it. A crash on the jobs screen for every job, recovered only by a reinstall \u2014 the app reads items unguarded in dozens of places',
  },
  {
    name: 'M170 (V81) an applied job is edited in place instead of replaced',
    file: 'sync.js',
    from: "  _invalidateSessionEncoding(oldSess);\n  state.sessions[i] = doc;",
    // v84: re-shaped. The V81 form swapped the items ARRAY, which the cache's
    // own reference check notices, so it re-encoded and the mutation survived
    // (found on the first full run since V83). This edits item CONTENTS in
    // place — same array, same count, same sig — which is the v69 defect.
    to:   "  doc.items.forEach((it, k) => { if (oldSess.items[k]) Object.assign(oldSess.items[k], it); });",
    why:  'the exact v69 defect, restored. Same array length, same session fields, so _sessionSig() sees no change and the STALE encoding is written back: the pulled change is on screen until the next reload and gone after it',
  },
  {
    name: 'M171 (V81.1) saving pushes without reading first',
    file: 'sync.js',
    from: "  syncPushSoon(SYNC_DEBOUNCE_MS, { pull: true });",
    to:   "  syncPushSoon(SYNC_DEBOUNCE_MS);",
    why:  'the V81 behaviour, restored. The other phone pushes, this phone edits, and its debounce fires before anything has pulled \u2014 so it overwrites work it never saw, with no open job involved and no question raised. Decision 2A exists for exactly this window',
  },
  {
    name: 'M172 (V81) the held list carries whatever it is given',
    file: 'sync.js',
    // v82: re-pointed — the normaliser now builds `entry` (with kind) before pushing it.
    from: "    const entry = {\n      id, kind, at, reason: e.reason,",
    to:   "    const entry = {\n      ...e, id, kind, at, reason: e.reason,",
    why:  'the whitelist is the only thing stopping a held row becoming a second store of the engineer\u2019s work. Drop it and any document a buggy or older build put there is carried straight back out, into the page and into the next write \u2014 in localStorage, against a decision that may sit for days',
  },
  {
    name: 'M173 (V81) the push sends a job that is waiting on a decision',
    file: 'sync.js',
    from: "      if (heldIds.has(id)) continue;\n      // \u26a0 v81.2:",
    to:   "      // \u26a0 v81.2:",
    why:  'the real bug 17k found during this release. The question is answered on the server, in this phone\u2019s favour, before anyone is asked \u2014 so choosing "use the cloud copy" fetches back what the push has just overwritten it with',
  },
  {
    name: 'M174 (V81) answering "keep this phone\u2019s copy" does not mark it for sending',
    file: 'sync.js',
    from: "    st.resend[sid] = true;\n    delete st.gone[sid];",
    to:   "    delete st.gone[sid];",
    why:  'the question disappears from the screen and nothing is sent: the local copy still hashes to what was last sent, so the push sees no work. The engineer is told the cloud now matches, and it does not',
  },
  {
    name: 'M175 (V81) the re-send marker is never cleared',
    file: 'sync.js',
    from: "            delete st.resend[w.id];",
    to:   "",
    why:  'one job is re-uploaded on every push for ever after, and on a long job that is hundreds of KB of mobile data a day. Nothing on screen is wrong, which is why only an assertion finds it',
  },
  {
    name: 'M176 (V81) a job decided in the phone\u2019s favour is re-raised by the next pull',
    file: 'sync.js',
    from: "    if (st.resend[id]) return;",
    to:   "",
    why:  'the deadlock this release nearly shipped: the pull re-asks a question it has been given the answer to, the push then skips the job for being held, and the job can never be sent again. Both halves individually look correct',
  },
  {
    name: 'M177 (V81) the Sync page leaves off the held-jobs card',
    file: 'render-help.js',
    from: "      ${renderSyncHeld(sy)}`;",
    to:   "      `;",
    why:  'the jobs are held safely and correctly, and nobody is ever asked. Sync quietly stops making progress because the cursor is waiting on a decision no screen offers',
  },
  {
    name: 'M178 (V81) signing in sends but does not read',
    file: 'cloud.js',
    from: "syncPushSoon(0, { pull: true })",
    to:   "syncPushSoon(0)",
    why:  'the one moment a second phone has everything to fetch \u2014 a fresh sign-in \u2014 fetches nothing, and stays empty until something else happens to trigger a run',
  },
  {
    name: 'M179 (V81) reopening the app sends but does not read',
    file: 'sync.js',
    from: "      syncPushSoon(SYNC_RESUME_DELAY_MS, { pull: true });",
    to:   "      syncPushSoon(SYNC_RESUME_DELAY_MS);",
    why:  'reopening is the trigger an engineer actually notices \u2014 it is how you check the other phone\u2019s work arrived. Push still works, so the failure is one-directional and easy to miss',
  },

  /* ---- V81.1: the two-phone overwrite ------------------------------------- */
  {
    name: 'M180 (V81.1) the open job is skipped before it is judged',
    file: 'sync.js',
    from: "    const isOpen = (id === state.activeId && state.view === 'entry');",
    to:   "    const isOpen = (id === state.activeId && state.view === 'entry');\n    if (isOpen) { blocked = true; return; }",
    why:  'the V81 bug Peter found on two real phones. Skipping the open job before anything is decided means it is never HELD \u2014 and an unheld job is one the push sends, unconditionally, over the other device\u2019s work. Deciding and applying are different things, and this collapses them back together',
  },
  {
    name: 'M181 (V81.1) a held job carries no notice on the job screen',
    file: 'render-core.js',
    from: "      ${syncWaitingBanner()}\n",
    to:   "",
    why:  'the job sits there looking ordinary and then changes, or vanishes, the moment the engineer leaves it. Nothing is lost — which is exactly why it needs saying, because a silent correct outcome is indistinguishable from a fault',
  },
  {
    name: 'M182 (V81.1) the waiting notice is never cleared',
    file: 'sync.js',
    from: "    state.sync.waiting = out.waiting || null;",
    to:   "    if (out.waiting) state.sync.waiting = out.waiting;",
    why:  'the notice sticks after the change has applied or the other device has undone it, so the job screen keeps promising something that already happened. Stale reassurance is worse than none — it trains the engineer to ignore the line',
  },
  {
    name: 'M183 (V81.1) a deferred delete is applied under the engineer anyway',
    file: 'sync.js',
    from: "        if (defer('delete')) return;\n",
    to:   "",
    why:  'the job the engineer is standing in disappears mid-entry, taking the item being typed with it. The one case where applying immediately is most tempting and least safe',
  },

  /* ---- V81.2: it has to reach the screen, and jsonb reorders keys --------- */
  {
    name: 'M184 (V81.2) the fingerprint is taken from the wire JSON, not the canonical form',
    file: 'sync.js',
    from: "      const hash = syncHash(_syncCanonical(s));",
    to:   "      const hash = syncHash(json);",
    why:  'the exact mistake V81.2 made on its first pass. The row is SENT as JSON.stringify and that is correct, but fingerprinting the same string makes every push disagree with every pull, for every job, for ever \u2014 because jsonb hands the keys back in another order',
  },
  {
    name: 'M185 (V81.2) canonical JSON sorts only the top level',
    file: 'sync.js',
    from: "  if (Array.isArray(v)) return '[' + v.map(_syncCanonical).join(',') + ']';",
    to:   "  if (Array.isArray(v)) return JSON.stringify(v);",
    why:  'items are objects inside an array, so the reordering that actually bites is nested. A top-level-only sort looks right in a unit test and fixes nothing in the field',
  },
  {
    name: 'M186 (V81.2) the hash marker never matches, so every job re-sends every run',
    file: 'sync.js',
    // v82: re-pointed — the object literal gained the `rec` block after hashV.
    from: "           pulledAt: null, lastPullAt: null, hashV: SYNC_HASH_V,",
    to:   "           pulledAt: null, lastPullAt: null, hashV: 0,",
    why:  'the stored marker can then never equal the current one, so every load throws away every fingerprint and every job is uploaded again on every single run \u2014 all day, on mobile data. The upgrade is meant to cost one round, not every round',
  },
  {
    name: 'M187 (V81.2) a pull changes things but never repaints the screen',
    file: 'sync.js',
    from: "    if (changed || waitingMoved) _syncRepaintApp();",
    to:   "",
    why:  'V81.1 as Peter found it. Everything works and almost nothing shows: a deleted job sits in the list, the waiting banner never appears, and the fix is to tap between jobs until a render happens. Correct state that never reaches the screen is indistinguishable from a broken app',
  },
  {
    name: 'M188 (V81.2) a repaint tears down a focused field',
    file: 'sync.js',
    from: "  if (!_syncSafeToRepaint()) { _syncRepaintWanted = true; return; }",
    to:   "",
    why:  'MAP rules 2/3. On iOS the keyboard goes down mid-entry and the half-typed asset number with it, at the exact moment an engineer is busiest. The reason pull results were confined to the Sync page for two releases',
  },
  {
    name: 'M189 (V81.2) an unsafe repaint is dropped rather than owed',
    file: 'sync.js',
    from: "  if (!_syncSafeToRepaint()) { _syncRepaintWanted = true; return; }",
    to:   "  if (!_syncSafeToRepaint()) { return; }",
    why:  'subtler than M188 and the same outcome as V81.1: type in a field while a pull lands and the update never appears at all, because nothing remembers that it was owed',
  },
  {
    name: 'M190 (V81.2) every screen change reads the cloud, unthrottled',
    file: 'sync.js',
    from: "  if (!released && now - _syncLastNavPull < SYNC_NAV_THROTTLE_MS) return;",
    to:   "",
    why:  'tapping between jobs becomes a request each, so the busiest engineer pays the most battery \u2014 the modem never gets back to idle. Everything still works, which is why only an assertion finds it',
  },
  {
    name: 'M191 (V81.2) the idle backstop runs in the background',
    file: 'sync.js',
    from: "  try { if (document.visibilityState === 'hidden') return; } catch { /* no document */ }",
    to:   "",
    why:  'the app keeps waking the radio all day from a pocket, for a screen nobody is looking at. The single worst thing a background timer can do to a phone that has to last a full day of testing',
  },
  {
    name: 'M192 (V81.2) a screen change is read as any tap at all',
    file: 'dispatch.js',
    from: "    if (state.view !== viewBefore && typeof syncNoteNav === 'function') {",
    to:   "    if (typeof syncNoteNav === 'function') {",
    why:  'every quick-pick tap and every toggle becomes a candidate read. The throttle hides most of it, which is exactly why it would never be noticed \u2014 it just quietly costs battery on the logging hot path',
  },

  /* ---- V81.3: leaving the job releases it -------------------------------- */
  {
    name: 'M193 (V81.3) "open" means the current job, not the job on screen',
    file: 'sync.js',
    from: "    const isOpen = (id === state.activeId && state.view === 'entry');",
    to:   "    const isOpen = (id === state.activeId);",
    why:  'V81.2 as Peter found it. activeId survives going back to the jobs list, so a change stays deferred for a job nobody is looking at, and releases only when some OTHER job is opened. It looks exactly like sync being slow',
  },
  {
    name: 'M194 (V81.3) leaving the waiting job is throttled like any other tap',
    file: 'sync.js',
    from: "  if (!released && now - _syncLastNavPull < SYNC_NAV_THROTTLE_MS) return;",
    to:   "  if (now - _syncLastNavPull < SYNC_NAV_THROTTLE_MS) return;",
    why:  'the engineer almost always leaves within 20s of arriving, and arriving was itself a read — so the throttle swallows the one read that would apply the change. Close-and-reopen appears to fix it, which is why it reads as flakiness rather than a bug',
  },

  /* ---- V81.4: Update now ------------------------------------------------- */
  {
    name: 'M195 (V81.4) the Update now allowance is never cleared',
    file: 'sync.js',
    from: "  const clear = (v) => { _syncAllowOpen = null; return v; };",
    to:   "  const clear = (v) => v;",
    why:  'one tap becomes a standing permission: every later change to that job lands while it is open, keyboard up and all. Decision 7A undone by a button meant to be a single exception',
  },
  {
    name: 'M196 (V81.4) the allowance applies deletes too',
    file: 'sync.js',
    from: "      if (kind === 'update' && _syncAllowOpen === id) return false;",
    to:   "      if (_syncAllowOpen === id) return false;",
    why:  'if the row turned into a delete between the tap and the read, the job the engineer is standing in vanishes from under them mid-screen. Narrow window, total outcome',
  },
  {
    name: 'M197 (V81.4) the waiting line has no button',
    file: 'render-core.js',
    from: "       + '<button class=\"link-btn\" data-action=\"sync-apply-waiting\"' + (busy ? ' disabled' : '')",
    to:   "       + '<span' + (busy ? '' : '')",
    why:  'the release shipped and did nothing visible. Everything underneath works; nobody can reach it',
  },
  /* ---- V82: clients and sites, and "What's different?" ------------------- */
  {
    name: 'M198 (V82) the record fingerprint hashes the stored object, not the projection',
    file: 'sync.js',
    from: "  if (kind === 'client') return { id: String(r.id), name: String(r.name || '').trim() };",
    to:   "  if (kind === 'client') return Object.assign({}, r);",
    why:  'loadClients() adds userId and lastModified on every reload, so a client nobody touched looks changed after a close and reopen: re-sent every time, and seen as a clash the moment the other phone renames it',
  },
  {
    name: 'M199 (V82) a held client is pushed anyway',
    file: 'sync.js',
    // v83: re-pointed past the new deferral check.
    from: "      if (held.has(id)) continue;\n      // v83: what the pull",
    to:   "      // v83: what the pull",
    why:  'rule 5: the push settles the question on the server, in this phone\u2019s favour, before anyone is asked',
  },
  {
    name: 'M200 (V82) a client changed on both phones is applied on a guess',
    file: 'sync.js',
    // v84: the line gained the starter-template takeIt; first match is decide()'s.
    from: "    if (!takeIt && rs.sent[id] !== localHash) { hold('both-changed', row.doc); return; }\n",
    to:   "",
    why:  'the rename made on this phone is silently replaced by the other phone\u2019s',
  },
  {
    name: 'M201 (V82) the held card shows only this phone\u2019s name',
    file: 'render-help.js',
    from: "`Name &mdash; this phone: ${nm(h.localName)} &middot; cloud: ${nm(h.cloudName)}`",
    to:   "`Name &mdash; this phone: ${nm(h.localName)}`",
    why:  'decision 7A and Peter\u2019s point 3: saying it is different without saying HOW is the thing this release fixes',
  },
  {
    name: 'M202 (V82) a remote client delete cascades to every site under it',
    file: 'sync.js',
    // v83: re-pointed — _syncApplyRecordDelete was rewritten for the new kinds.
    from: "  recordTombstone(kind, id);\n  const idx = list.indexOf(old);",
    to:   "  recordTombstone(kind, id);\n  if (kind === 'client') state.sites = (state.sites || []).filter(s => s.clientId !== id);\n  const idx = list.indexOf(old);",
    why:  'decision 4A: a site made on this phone is deleted on the strength of something the other phone never saw',
  },
  {
    name: 'M203 (V82) an orphaned site is never moved to Unassigned',
    file: 'sync.js',
    from: "      const moved = _syncTidyOrphanSites();",
    to:   "      const moved = 0;",
    why:  'the Clients page lists a site under its client or under Unassigned; one pointing at a missing client appears under neither and is lost to the engineer',
  },
  {
    name: 'M204 (V82) a remote record delete skips the ledger',
    file: 'sync.js',
    // v83: re-pointed, as M202.
    from: "  recordTombstone(kind, id);\n  const idx = list.indexOf(old);",
    to:   "  const idx = list.indexOf(old);",
    why:  'without a tombstone, a restore of an older backup brings the client back and nothing knows it was deleted',
  },
  {
    name: 'M205 (V82) orphaned sites are tidied on a run that held something',
    file: 'sync.js',
    from: "    if (!blocked) {\n      const moved = _syncTidyOrphanSites();\n      if (moved) { out.unassigned += moved; changed = true; }\n      rs.pulledAt = high;\n    }",
    to:   "    { const moved = _syncTidyOrphanSites(); if (moved) { out.unassigned += moved; changed = true; } }\n    if (!blocked) rs.pulledAt = high;",
    why:  'the missing client may be the very record waiting on a decision; answering \"bring it back\" would then find its sites already moved away',
  },
  {
    name: 'M206 (V82) a records failure fails the whole run',
    file: 'sync.js',
    from: "    .then(() => out, (e) => { out.error = e || new Error('records'); return out; });",
    to:   "    .then(() => out);",
    why:  'a problem with a convenience list stops the engineer\u2019s jobs syncing',
  },
  {
    name: 'M207 (V82) records are pushed after their read failed',
    file: 'sync.js',
    from: "  return _syncPullRecords(c, uid, st, out)\n    .then(() => _syncPushRecords(c, uid, st, out))",
    to:   "  return _syncPullRecords(c, uid, st, out).catch(() => {})\n    .then(() => _syncPushRecords(c, uid, st, out))",
    why:  'rule 4: a push may only ever follow a pull. Without the look first, the push overwrites work it never saw',
  },
  {
    name: 'M208 (V82) "Re-send all jobs" sends records without reading',
    file: 'sync.js',
    from: "const recs = opts.pull ? _syncRecordsHalf(c, uid, st) : Promise.resolve(null);",
    to:   "const recs = _syncRecordsHalf(c, uid, st);",
    why:  'the button is jobs only, and its run does not read first',
  },
  {
    name: 'M209 (V82) clearing a held client clears a job with the same id',
    file: 'sync.js',
    from: "  const out = list.filter(e => !(e.id === sid && e.kind === k));",
    to:   "  const out = list.filter(e => !(e.id === sid));",
    why:  'a question about a job is dropped without being answered, and the push then sends over the cloud copy',
  },
  {
    name: 'M210 (V82) a V81 held entry is read as a client',
    file: 'sync.js',
    from: "const kind = (e.kind === undefined) ? 'session' : e.kind;",
    to:   "const kind = (e.kind === undefined) ? 'client' : e.kind;",
    why:  'every job held on a phone upgrading from V81 changes meaning on the first read',
  },
  {
    name: 'M211 (V82) a held client blocks the job with the same id',
    file: 'sync.js',
    from: "    const heldIds = new Set(_syncHeldLoad().filter(e => e.kind === 'session').map(e => e.id));",
    to:   "    const heldIds = new Set(_syncHeldLoad().map(e => e.id));",
    why:  'a job silently stops syncing because of a question about something else',
  },
  {
    name: 'M212 (V82) a new record kind carries on from the old cursor',
    file: 'sync.js',
    from: "  if (rs.kinds !== kindsTag) { rs.pulledAt = null; rs.kinds = kindsTag; }",
    to:   "  rs.kinds = kindsTag;",
    why:  'V83 adds instruments; every instrument the other phone sent before this phone upgraded is behind the cursor and never read',
  },
  {
    name: 'M213 (V82) the comparison matches items by position',
    file: 'sync.js',
    from: "let k = (it.id != null && it.id !== '') ? 'i:' + String(it.id) : 'n:' + i;",
    to:   "let k = 'n:' + i;",
    why:  'one item deleted near the top and every item below it reads as changed \u2014 the comparison would say the opposite of what happened',
  },
  {
    name: 'M214 (V82) a blank field differs from a missing one',
    file: 'sync.js',
    from: "const same = (a, b) => (blankish(a) && blankish(b)) || _syncCanonical(a) === _syncCanonical(b);",
    to:   "const same = (a, b) => _syncCanonical(a) === _syncCanonical(b);",
    why:  'the sheet lists differences an engineer cannot see, which teaches him to stop reading it',
  },
  {
    name: 'M215 (V82) "What\u2019s different?" never opens its sheet',
    file: 'sync.js',
    from: "      if (typeof openSyncDiffSheet === 'function') openSyncDiffSheet(entry, diff);",
    to:   "",
    why:  'the button fetches, compares, and shows nothing',
  },
  {
    name: 'M216 (V82) the comparison button is never offered',
    file: 'render-help.js',
    from: "    const cmp = compare\n",
    to:   "    const cmp = false\n",
    why:  'everything underneath works; nobody can reach it',
  },
  {
    name: 'M217 (V82) the comparison button is left saying Checking',
    file: 'sync.js',
    from: "    state.sync.diffing = null;\n    if (msg) state.sync.message = msg;",
    to:   "    if (msg) state.sync.message = msg;",
    why:  'the page looks stuck for ever after the first tap',
  },
  {
    name: 'M218 (V82) the sheet stops saying what each answer would do',
    file: 'render-help.js',
    from: "  if (diff.onlyCloud.length) effects.push(",
    to:   "  if (false) effects.push(",
    why:  'the whole point: the engineer sees the difference AND what choosing loses',
  },
  {
    name: 'M219 (V82) a deleted-here job goes back to the generic labels',
    file: 'render-help.js',
    from: "      phone = 'Keep it deleted'; cloud = 'Bring it back';\n    } else if (h.reason === 'fewer-items') {",
    to:   "    } else if (h.reason === 'fewer-items') {",
    why:  '\"Keep this phone\u2019s copy\" of a job this phone deleted is a riddle, not a choice',
  },
  {
    name: 'M220 (V82) an unreadable record offers the cloud answer',
    file: 'render-help.js',
    from: "cloud = '';\n    } else {\n      lines.push(",
    to:   "cloud = 'ZZ';\n    } else {\n      lines.push(",
    why:  'there is nothing readable to apply; the button can only fail',
  },
  {
    name: 'M221 (V82) the outcome line leaves clients and sites out',
    file: 'sync.js',
    from: "  if (rec.length) msg += (msg ? ' ' : '') + 'Clients & sites: ' + rec.join(', ') + '.';",
    to:   "",
    why:  'records sync silently; a quiet run and a busy one read the same',
  },
  {
    name: 'M222 (V82) a client change is saved without passing the sync trigger',
    file: 'clients.js',
    from: "      recordTombstone('site', siteId);   // v78: before the filter",
    to:   "      recordTombstone('site', siteId);   // v78: before the filter\n      saveSettings();",
    why:  'the trigger lives in saveSessions(); a direct saveSettings() path writes clients the sync never hears about until something else saves',
  },
  {
    name: 'M223 (V82) pulled records are applied in memory but never saved',
    file: 'sync.js',
    // v84: the pull now saves through _syncSaveLists().
    from: "      _syncSaveLists();\n      _syncRepaintApp();",
    to:   "      _syncRepaintApp();",
    why:  'the client appears, then vanishes on the next reopen \u2014 and its fingerprint says it was applied',
  },
  {
    name: 'M224 (V82) the record fingerprint is taken from the wire JSON',
    file: 'sync.js',
    from: "      const hash = syncHash(_syncCanonical(doc));\n      if (!rs.resend[id] && rs.sent[id] === hash) continue;",
    to:   "      const hash = syncHash(json);\n      if (!rs.resend[id] && rs.sent[id] === hash) continue;",
    why:  'M184 again, for records: jsonb reorders keys, so every pull disagrees with every push and every client is sent on every run',
  },
  {
    name: 'M225 (V82) "Keep it" on a held record is not re-sent',
    file: 'sync.js',
    from: "    st.rec.resend[sid] = true;\n",
    to:   "",
    why:  'the answer is forgotten: the next pull asks the same question again, for ever',
  },

  // ---------------------------------------------------------------- V83
  {
    name: 'M226 (V83) the encoding cache ignores the instrument fields again',
    file: 'storage.js',
    from: "    s.instrumentId || '', s.instrumentSnapshot ? 1 : 0\n",
    to:   "    ''\n",
    why:  'the v66 bug: a deleted instrument\u2019s frozen copy never reaches the disk for any job but the open one, and after a reopen the certificate names today\u2019s tester',
  },
  {
    name: 'M227 (V83) deleting an instrument records no ledger entry',
    file: 'instruments.js',
    from: "      recordTombstone('instrument', id);   // v83",
    to:   "      // (ledger entry removed)",
    why:  'the delete never reaches the other phone, which keeps the instrument for ever',
  },
  {
    name: 'M228 (V83) the ledger does not accept instrument entries',
    file: 'storage.js',
    from: "const TOMBSTONE_KINDS = ['session', 'client', 'site', 'preset', 'instrument', 'template'];",
    to:   "const TOMBSTONE_KINDS = ['session', 'client', 'site', 'preset', 'template'];",
    why:  'recordTombstone silently drops the entry, so an instrument delete is never sent',
  },
  {
    name: 'M229 (V83) loading instruments cuts the list at the Add limit again',
    file: 'instruments.js',
    from: "if (Array.isArray(parsed)) list = parsed.map(makeInstrument).slice(0, INSTRUMENTS_STORED_MAX);",
    to:   "if (Array.isArray(parsed)) list = parsed.map(makeInstrument).slice(0, INSTRUMENTS_MAX);",
    why:  '4A: the sixth synced instrument vanishes on every reopen and the next sync brings it back — a loop, and a delete nobody made',
  },
  {
    name: 'M230 (V83) restoring instruments cuts the list at the Add limit again',
    file: 'instruments.js',
    from: "state.instruments = data.instruments.map(makeInstrument).slice(0, INSTRUMENTS_STORED_MAX);",
    to:   "state.instruments = data.instruments.map(makeInstrument).slice(0, INSTRUMENTS_MAX);",
    why:  'a backup of a synced phone restores short',
  },
  {
    name: 'M231 (V83) a remote instrument delete freezes jobs BEFORE they are read',
    file: 'sync.js',
    from: "    rs.freeze[id] = instrumentSnapshotOf(old);",
    to:   "    freezeInstrumentOntoJobs(id, instrumentSnapshotOf(old));",
    why:  'jobs the other phone already froze arrive looking edited on both phones and are held as clashes nobody made',
  },
  {
    name: 'M232 (V83) the owed copies are never written during a run',
    file: 'sync.js',
    from: "      const freeze = () => { _syncFreezePending(st); };",
    to:   "      const freeze = () => {};",
    why:  'a job only this phone had keeps pointing at a deleted instrument and prints today\u2019s tester',
  },
  {
    name: 'M233 (V83) copies owed by a dead run are not written at boot',
    file: 'sync.js',
    from: "  try { _syncFreezePending(_syncLoad()); }",
    to:   "  try { }",
    why:  'an app closed mid-sync leaves jobs without their instrument until some later run happens to finish',
  },
  {
    name: 'M234 (V83) the tester in use is deleted without asking',
    file: 'sync.js',
    from: "        if (inUse) { hold('deleted-elsewhere', null, inUse); return; }",
    to:   "        if (false) { hold('deleted-elsewhere', null, inUse); return; }",
    why:  'decision 2A: the phone quietly moves to a tester the engineer is not holding, and new certificates name it',
  },
  {
    name: 'M235 (V83) keeping the tester in use does not keep it in use for the account',
    file: 'sync.js',
    from: "    if (kind === 'instrument' && sid === _syncInUseId()) st.rec.resend[SYNC_INUSE_ID] = true;",
    to:   "",
    why:  'the other phone gets the instrument back but stays on whatever it moved to (1B)',
  },
  {
    name: 'M236 (V83) the instrument open in the editor is changed under it',
    file: 'sync.js',
    from: "      if (kind !== 'instrument' || id !== editing) return false;",
    to:   "      return false;",
    why:  'the Save tap writes the old form values back, quietly reverting the other phone\u2019s calibration date',
  },
  {
    name: 'M237 (V83) what the pull deferred is pushed anyway',
    file: 'sync.js',
    from: "      if (skip[id]) continue;",
    to:   "      if (false) continue;",
    why:  'a deferred change is settled on the server in this phone\u2019s favour before it was ever applied',
  },
  {
    name: 'M238 (V83) the tester in use is decided in read order, not last',
    file: 'sync.js',
    from: "      if (SYNC_SETTINGS_IDS.indexOf(id) !== -1) late.push(row);\n      return;",
    to:   "      if (SYNC_SETTINGS_IDS.indexOf(id) !== -1) decideInUse(row);\n      return;",
    why:  'a choice read before the instrument it names waits a whole extra run, and a new phone starts on the wrong tester',
  },
  {
    name: 'M239 (V83) a phone that has never agreed is treated as having switched',
    file: 'sync.js',
    from: "    if (agreed !== null && mine !== agreed && findInstrument(agreed)) { hold('both-changed', row.doc); return; }",
    to:   "    if (agreed === null || (mine !== agreed && findInstrument(agreed))) { hold('both-changed', row.doc); return; }",
    why:  'every new phone is asked a question instead of taking the account\u2019s tester',
  },
  {
    name: 'M240 (V83) a switch made on ONE phone is asked about as if both switched',
    file: 'sync.js',
    from: "    if (hash === rs.sent[id]) return;\n    if (!want) return;",
    to:   "    if (!want) return;",
    why:  'the bug 19k found during V83: the cloud had not moved, so there was nothing to ask',
  },
  {
    name: 'M241 (V83) a move made FOR this phone counts as a switch made here',
    file: 'sync.js',
    from: "    if (agreed !== null && mine !== agreed && findInstrument(agreed)) { hold('both-changed', row.doc); return; }",
    to:   "    if (agreed !== null && mine !== agreed) { hold('both-changed', row.doc); return; }",
    why:  'when the agreed tester was deleted the phone moved by itself; asking about that is a question nobody made',
  },
  {
    name: 'M242 (V83) the tester in use follows the other phone while its delete is being asked',
    file: 'sync.js',
    from: "    if (mine && _syncHeldLoad().some(e => e.kind === 'instrument' && e.id === mine)) { wait(); return; }\n",
    to:   "",
    why:  'the 2A question is answered behind the engineer\u2019s back before he has read it',
  },
  {
    name: 'M243 (V83) "in use" is not settled after instruments arrive',
    file: 'sync.js',
    from: "    if (!list.some(i => i.id === state.activeInstrumentId)) {",
    to:   "    if (false) {",
    why:  'a phone that had no tester stamps new jobs with a blank id, which prints whatever is active at print time',
  },
  {
    name: 'M244 (V83) the quick-pick buttons do not follow an edited preset in use',
    file: 'sync.js',
    from: "  if (ps.length && typeof syncItemTypesFromActivePreset === 'function' && _syncActivePresetSig() !== presetBefore) {",
    to:   "  if (false) {",
    why:  'the preset changes on disk but the entry screen shows the old buttons until a restart',
  },
  {
    name: 'M245 (V83) a phone\u2019s last preset is not held when deleted elsewhere',
    file: 'sync.js',
    from: "        if (kind === 'preset' && _syncRecordList('preset').length <= 1) {",
    to:   "        if (false) {",
    why:  'the delete is neither applied nor asked about, and the phone counts it as done',
  },
  {
    name: 'M246 (V83) the starter preset is never set aside',
    file: 'sync.js',
    from: "    if (starter && presetsAdded && _syncDropStarter(starter)) changed = true;\n",
    to:   "",
    why:  '5A: every new phone arrives with a spare "Default"',
  },
  {
    name: 'M247 (V83) an edited starter preset is set aside too',
    file: 'sync.js',
    from: "  if (!p || p.name !== 'Default' || !Array.isArray(p.items)) return false;",
    to:   "  if (!p) return false; return true;",
    why:  'the engineer\u2019s own buttons are thrown away on first sign-in',
  },
  {
    name: 'M248 (V83) the preset in use is overwritten by the pull',
    file: 'sync.js',
    from: "  if (ps.length && !ps.some(p => p.id === state.activePresetId)) { state.activePresetId = ps[0].id; moved = true; }",
    to:   "  if (ps.length) { state.activePresetId = ps[0].id; moved = true; }",
    why:  '7A: which preset is in use is per phone; a pull must never change it while it still exists',
  },
  {
    name: 'M249 (V83) a held instrument keeps no differing fields',
    file: 'sync.js',
    from: "        if (d.length) entry.diffs = d;",
    to:   "",
    why:  'the card says "changed" and nothing about which calibration date is right',
  },
  {
    name: 'M250 (V83) an unknown settings row stops the cursor',
    file: 'sync.js',
    from: "      if (SYNC_SETTINGS_IDS.indexOf(id) !== -1) late.push(row);\n      return;",
    to:   "      if (SYNC_SETTINGS_IDS.indexOf(id) !== -1) late.push(row); else blocked = true;\n      return;",
    why:  'once V84 pushes a new settings row, a V83 phone re-reads the whole account every run for ever',
  },
  {
    name: 'M251 (V83) the cursor tag leaves out the settings ids',
    file: 'sync.js',
    from: "  return SYNC_RECORD_KINDS.join(',') + '|' + SYNC_SETTINGS_IDS.join(',');",
    to:   "  return SYNC_RECORD_KINDS.join(',');",
    why:  'a later version that adds a settings row never reads the ones pushed before it understood them',
  },
  {
    name: 'M252 (V83) "no tester" is sent as a choice',
    file: 'sync.js',
    from: "      if (kind === 'settings' && id === SYNC_INUSE_ID && !doc.instrumentId) { delete rs.resend[id]; continue; }\n",
    to:   "",
    why:  'a new phone with no instruments tells the account it uses none',
  },
  {
    name: 'M253 (V83) a sent tester in use is not recorded as agreed',
    file: 'sync.js',
    from: "          if (w.inUse !== undefined) rs.inUse = w.inUse;   // v83: now agreed\n",
    to:   "",
    why:  'the next switch on the other phone reads as both phones switching, or none',
  },
  {
    name: 'M254 (V83) the pull repaints a settings form with unsaved typing',
    file: 'sync.js',
    from: "  if (SYNC_NO_REPAINT_VIEWS.indexOf(state.view) !== -1) return false;\n",
    to:   "",
    why:  'MAP rule 3: half-typed calibration details vanish when something arrives',
  },
  {
    name: 'M255 (V83) the outcome line leaves out instruments and presets',
    file: 'sync.js',
    from: "  if (lists.length) msg += (msg ? ' ' : '') + 'Instruments & presets: ' + lists.join(', ') + '.';",
    to:   "",
    why:  'changes happen and the page says everything was already up to date',
  },
  {
    name: 'M256 (V83) a nameless instrument is sent',
    file: 'sync.js',
    from: "    return !!(String(doc.make || '').trim() || String(doc.model || '').trim());",
    to:   "    return true;",
    why:  'the blank record an Add button makes goes up, and the other phone holds it as "Unnamed instrument" for ever',
  },
  {
    name: 'M257 (V83) the last-preset card offers to delete it',
    file: 'render-help.js',
    from: "      phone = 'Keep it here'; cloud = h.onlyOne ? '' : 'Delete it here too';",
    to:   "      phone = 'Keep it here'; cloud = 'Delete it here too';",
    why:  'a button that can only fail, on a question with one answer',
  },
  {
    name: 'M258 (V83) the tester-in-use card does not name the testers',
    file: 'render-help.js',
    from: "      phone = h.localName ? 'Use ' + escapeHTML(h.localName) : phone;\n",
    to:   "",
    why:  'the engineer cannot tell which button keeps the tester in his hand',
  },
  {
    name: 'M259 (V83) the Sync page drops the instruments and presets count',
    file: 'render-help.js',
    from: 'id="sync-list-counts"',
    to:   'id="sync-list-countz"',
    why:  'the page shows nothing about the new lists syncing',
  },
  {
    name: 'M260 (V83) an owed copy is written for an instrument that is back',
    file: 'sync.js',
    from: "    if (!back && typeof freezeInstrumentOntoJobs === 'function') n += freezeInstrumentOntoJobs(id, f[id]);",
    to:   "    if (typeof freezeInstrumentOntoJobs === 'function') n += freezeInstrumentOntoJobs(id, f[id]);",
    why:  'after "Keep it", jobs are frozen to a copy that stops following the live instrument\u2019s recalibration',
  },

  /* ---- V83.1: paging --------------------------------------------------- */
  {
    name: 'M261 (V83.1) the jobs pager asks for rows AFTER the mark again',
    file: 'sync.js',
    from: "    return c.from('sessions')\n      .select('id,doc,deleted,last_modified,updated_at')\n      .gte('updated_at', from)",
    to:   "    return c.from('sessions')\n      .select('id,doc,deleted,last_modified,updated_at')\n      .gt('updated_at', from)",
    why:  'a page that ends part-way through an upload batch steps over the rest of it for good — the V81–V83 bug',
  },
  {
    name: 'M262 (V83.1) the records pager asks for rows AFTER the mark again',
    file: 'sync.js',
    from: "      .in('kind', SYNC_RECORD_KINDS)\n      .gte('updated_at', from)",
    to:   "      .in('kind', SYNC_RECORD_KINDS)\n      .gt('updated_at', from)",
    why:  'the same step-over, for clients, sites, instruments and presets',
  },
  {
    name: 'M263 (V83.1) the jobs pager decides a re-read edge row twice',
    file: 'sync.js',
    // First occurrence is the jobs pager (it comes first in the file).
    from: "          if (!seen.has(key)) { seen.add(key); decide(row); }",
    to:   "          decide(row);",
    why:  'a held job on the page edge is counted twice: "2 jobs need you to decide" for one question',
  },
  {
    name: 'M264 (V83.1) the records pager decides a re-read edge row twice',
    file: 'sync.js',
    from: "      .in('kind', SYNC_RECORD_KINDS)\n      .gte('updated_at', from)\n      .order('updated_at', { ascending: true })\n      .limit(SYNC_PULL_PAGE)\n      .then((r) => {\n        if (r && r.error) throw r.error;\n        const rows = (r && r.data) || [];\n        for (const row of rows) {\n          const u = row && row.updated_at;\n          const key = String(row && row.id) + '|' + String(u);\n          if (!seen.has(key)) { seen.add(key); decide(row); }",
    to:   "      .in('kind', SYNC_RECORD_KINDS)\n      .gte('updated_at', from)\n      .order('updated_at', { ascending: true })\n      .limit(SYNC_PULL_PAGE)\n      .then((r) => {\n        if (r && r.error) throw r.error;\n        const rows = (r && r.data) || [];\n        for (const row of rows) {\n          const u = row && row.updated_at;\n          const key = String(row && row.id) + '|' + String(u);\n          decide(row);",
    why:  'a held client on the page edge is counted twice, and a settings row is queued twice for decideInUse',
  },
  {
    name: 'M265 (V83.1) the jobs guard lets the cursor move past a page it could not finish',
    file: 'sync.js',
    from: "        if (high === from) { blocked = true; return; }\n        return page(high);\n      });\n  }\n\n  return page(since).then(() => {\n    // Recomputed every run",
    to:   "        if (high === from) { return; }\n        return page(high);\n      });\n  }\n\n  return page(since).then(() => {\n    // Recomputed every run",
    why:  'more rows on one timestamp than a page holds: the rest are stepped over instead of the run stopping',
  },
  {
    name: 'M266 (V83.1) the records guard lets the cursor move past a page it could not finish',
    file: 'sync.js',
    from: "        if (high === from) { blocked = true; return; }\n        return page(high);\n      });\n  }\n\n  return page(since).then(() => {\n    // v83, in this order",
    to:   "        if (high === from) { return; }\n        return page(high);\n      });\n  }\n\n  return page(since).then(() => {\n    // v83, in this order",
    why:  'the same, for records',
  },
  {
    name: 'M267 (V83.1) a job the cloud still has as this phone sent it is held when edited since',
    file: 'sync.js',
    from: "    if (hash === st.sent[id]) { _syncHeldClear(id); return; }\n",
    to:   "",
    why:  'push, keep logging, next run reads the push back: a question with only one side to it, and the job stops syncing until answered',
  },
  {
    name: 'M268 (V83.1) a record the cloud still has as this phone sent it is held when edited since',
    file: 'sync.js',
    from: "    if (hash === rs.sent[id]) { _syncHeldClear(id, kind); return; }\n",
    to:   "",
    why:  'the same, for a client renamed twice between runs',
  },
  {
    name: 'M269 (V83.1) an old cursor is trusted — no one-off re-read',
    file: 'sync.js',
    from: "  if (raw.pagerV !== SYNC_PAGER_V) { out.pulledAt = null; out.rec.pulledAt = null; }\n",
    to:   "",
    why:  'a phone that already stepped over rows under V81–V83 never gets them',
  },
  {
    name: 'M270 (V83.1) the pager version is never saved, so every run reads from the start',
    file: 'sync.js',
    from: "hashV: SYNC_HASH_V, pagerV: SYNC_PAGER_V,",
    to:   "hashV: SYNC_HASH_V,",
    why:  'the one-off re-read happens on every run: the whole account downloaded each time the engineer pauses',
  },

  {
    name: "M271 (V84) applying a template rewinds the certificate counter again",
    file: "settings-actions.js",
    from: "      state.reportSettings.certNextNumber = keep.certNextNumber;\n",
    to:   "",
    why:  "the pre-existing bug 21a fixes: the next certificates reuse numbers already issued",
  },
  {
    name: "M272 (V84) stamping no longer skips numbers already on a job",
    file: "report.js",
    from: "used.has(no) && guard <= used.size",
    to:   "false && guard <= used.size",
    why:  "two phones counting independently hand out the same certificate number, and nothing notices",
  },
  {
    name: "M273 (V84) a hand-typed counter is not marked as deliberate",
    file: "settings-actions.js",
    from: "if (rs.certNextNumber !== was) rs.certSetAt = new Date().toISOString();",
    to:   "",
    why:  "resetting the counter for a new prefix is undone by the other phone's higher number",
  },
  {
    name: "M274 (V84) every capture counts as a deliberate set",
    file: "settings-actions.js",
    from: "if (rs.certNextNumber !== was) rs.certSetAt",
    to:   "if (true) rs.certSetAt",
    why:  "every toggle on Report settings would stamp a set time, so a stale counter shown on screen beats the other phone's real one",
  },
  {
    name: "M275 (V84) nothing-made records are pushed while unsent",
    file: "sync.js",
    from: "if (!rs.sent[id] && !rs.resend[id] && _syncNothingMade(kind, id, r)) continue;",
    to:   "",
    why:  "a fresh phone pushes defaults over the account (or makes the branded phone's first sync a question)",
  },
  {
    name: "M276 (V84) an untouched phone does not take the account's report settings",
    file: "sync.js",
    from: "const takeIt = fresh && _syncIsDefaultReport(local.settings);",
    to:   "const takeIt = false;",
    why:  "every new phone is asked about report settings it never touched",
  },
  {
    name: "M277 (V84) taking the cloud's report settings takes its counter too",
    file: "sync.js",
    from: "  next.certNextNumber = keep.certNextNumber;\n  next.certSetAt = keep.certSetAt;\n",
    to:   "",
    why:  "the counter travels on its own rules; riding with the report row rewinds it",
  },
  {
    name: "M278 (V84) held report diffs carry the image itself",
    file: "sync.js",
    from: "if (k === 'logo' || k === 'signature') return v ? (other ? 'An image' : 'Image') : '';",
    to:   "",
    why:  "rule 7: a held entry must never become a store of the cloud document",
  },
  {
    name: "M279 (V84) a default cloud copy does not give way to this phone's",
    file: "sync.js",
    from: "    if (fresh && _syncIsDefaultReport(row.doc.settings)) { _syncHeldClear(id, kind); return; }\n",
    to:   "",
    why:  "a phone that signed in first with nothing set would force a question on the branded one",
  },
  {
    name: "M280 (V84) the counter ignores deliberate sets",
    file: "sync.js",
    from: "(cloud.setAt !== mine.setAt) ? cloud.setAt > mine.setAt : cloud.next > mine.next",
    to:   "cloud.next > mine.next",
    why:  "a reset to 1 is undone by any higher number anywhere",
  },
  {
    name: "M281 (V84) a counter this phone wins is not re-sent",
    file: "sync.js",
    from: "    if (!cloudWins) { delete rs.sent[id]; return; }",
    to:   "    if (!cloudWins) { return; }",
    why:  "a slower phone's lower number stays in the cloud for good",
  },
  {
    name: "M282 (V84) unsaved Report settings are pushed",
    file: "sync.js",
    from: "      if (reportOpen && (id === SYNC_REPORT_ID || id === SYNC_CERT_ID)) continue;\n",
    to:   "",
    why:  "toggles flipped but never saved reach the other phone",
  },
  {
    name: "M283 (V84) report settings are replaced under the open page",
    file: "sync.js",
    from: "    if (reportOpen) { blocked = true; out.skip[id] = true; return; }\n    _syncApplyReport(row.doc);",
    to:   "    _syncApplyReport(row.doc);",
    why:  "its Save then writes every field back over the change",
  },
  {
    name: "M284 (V84) deleting a template leaves no ledger entry",
    file: "settings-actions.js",
    from: "  recordTombstone('template', templateId);\n",
    to:   "",
    why:  "the delete never travels and the template comes back",
  },
  {
    name: "M285 (V84) an untouched starter template is asked about",
    file: "sync.js",
    from: "const takeIt = fresh && _syncIsStarterTemplate(local);",
    to:   "const takeIt = false;",
    why:  "every new phone gets questions about templates it never touched",
  },
  {
    name: "M286 (V84) a starter deleted here before it was ever sent never travels",
    file: "sync.js",
    from: "if (kind === 'template' && !rs.sent[id] && !rs.resend[id]) rs.sent[id] = hash;",
    to:   "",
    why:  "the push thinks the server never had it, so the other phone keeps it for ever",
  },
  {
    name: "M287 (V84) a template's counter is part of what it is",
    file: "sync.js",
    from: "  delete n.certNextNumber;\n  delete n.certSetAt;\n",
    to:   "",
    why:  "templates saved at different counter values look edited on both sides",
  },
  {
    name: "M288 (V84) the certificate counter reports as a change",
    file: "sync.js",
    from: "grp: id === SYNC_CERT_ID ? null : _syncRecordGroup(kind, id),",
    to:   "grp: _syncRecordGroup(kind, id),",
    why:  "every report produced says 'a change sent' — noise that trains people to ignore the page",
  },
  {
    name: "M289 (V84) report cards fall under Instruments & presets",
    file: "render-help.js",
    from: "    ${reps.length ? sub('sync-held-reports', 'Report settings &amp; templates') : ''}\n",
    to:   "",
    why:  "the card appears without a heading that says what it is",
  },
  {
    name: "M290 (V84) the resolve writes the tester-in-use bookkeeping for any settings row",
    file: "sync.js",
    from: "if (kind === 'settings' && sid === SYNC_INUSE_ID) rs.inUse",
    to:   "if (kind === 'settings') rs.inUse",
    why:  "answering a report settings question sets the agreed tester to 'undefined' and the next switch is asked about",
  },
  {
    name: "M291 (V84) saving report settings never reaches the sync trigger",
    file: "storage.js",
    from: "  _writeReportSettings();\n  // v84: report settings sync, and most edits",
    to:   "  // v84: report settings sync, and most edits",
    why:  "a branding change sits unsent until some unrelated save or screen change",
  },
  {
    name: "M292 (V84) the pull re-arms itself",
    file: "sync.js",
    from: "function _syncSaveLists() {\n  if (typeof saveSettings === 'function') saveSettings();",
    to:   "function _syncSaveLists() {\n  if (typeof saveSettings === 'function') saveSettings();\n  if (typeof saveReportSettings === 'function') saveReportSettings();",
    why:  "every pull that changed anything schedules another, for nothing",
  },
  {
    name: "M293 (V84) the deliberate-set time is dropped on load",
    file: "storage.js",
    from: "  out.certSetAt       = (typeof stored.certSetAt === 'string' && !isNaN(Date.parse(stored.certSetAt)))\n    ? stored.certSetAt : '';",
    to:   "  out.certSetAt       = '';",
    why:  "a reset survives only until the next reopen",
  },
  {
    name: "M294 (V84) templates are not in the synced kinds",
    file: "config.js",
    from: "'preset', 'settings', 'template'];",
    to:   "'preset', 'settings'];",
    why:  "templates never read or sent",
  },
  {
    name: "M295 (V84) the page does not count report settings as up to date when there is nothing to send",
    file: "sync.js",
    from: "|| (!sent && grp === 'rp' && _syncNothingMade(kind, id, r))",
    to:   "",
    why:  "a fresh phone shows report settings 'not up to date' for ever",
  },

  // ---- V85: Settings → Cloud and its access code (harness group 22) --------
  {
    name: "M296 (V85) the unlock is never remembered",
    file: "cloud.js",
    from: "try { return localStorage.getItem(CLOUD_UNLOCK_KEY) === '1'; } catch { return false; }",
    to:   "return false;",
    why:  "the code has to be typed on every visit — exactly the chore this release removes",
  },
  {
    name: "M297 (V85) any code opens the Cloud group",
    file: "cloud.js",
    from: "if (typed !== CLOUD_ACCESS_CODE) {",
    to:   "if (!typed) {",
    why:  "the curtain is gone: a free user typing anything lands on a sign-in page they cannot use",
  },
  {
    name: "M298 (V85) the Cloud group shows on a copy with no cloud",
    file: "render-settings.js",
    from: "${SETTINGS_CATEGORIES.filter(settingsCategoryVisible).map(cat =>",
    to:   "${SETTINGS_CATEGORIES.map(cat =>",
    why:  "every copy of the app (localhost, a future host) grows a Cloud row that leads nowhere",
  },
  {
    name: "M299 (V85) settings search walks around the curtain",
    file: "render-settings.js",
    from: "      if (!settingsPageSearchable(cat)) return;   // v85\n",
    to:   "",
    why:  "typing 'sync' in settings search opens the cloud pages without the code",
  },
  {
    name: "M300 (V85) the Cloud group opens without the code",
    file: "render-settings.js",
    from: "if (cat.id === 'catCloud' && !(typeof cloudPagesUnlocked",
    to:   "if (false && cat.id === 'catCloud' && !(typeof cloudPagesUnlocked",
    why:  "the code box never appears — 1A not delivered",
  },
  {
    name: "M301 (V85) a cloud page paints while locked",
    file: "render-core.js",
    from: "    if (typeof cloudPagesUnlocked === 'function' && cloudPagesUnlocked()) {\n      html = v === 'cloudAccount'",
    to:   "    if (true) {\n      html = v === 'cloudAccount'",
    why:  "a stale view (or a future link) shows the sign-in page to a phone that never entered the code",
  },
  {
    name: "M302 (V85) a signed-in phone is not remembered at boot",
    file: "cloud.js",
    from: "  _cloudRememberUnlock();   // v85 2A: a signed-in phone never asks for the code\n",
    to:   "",
    why:  "your test phones, already signed in, get the code box the first time they sign out",
  },
  {
    name: "M303 (V85) signing in does not remember the unlock",
    file: "cloud.js",
    from: "      _cloudRememberUnlock();   // v85 2A\n",
    to:   "",
    why:  "a phone let in by signing in is locked out again after signing out (2A)",
  },
  {
    name: "M304 (V85) a stale code message greets the next visit",
    file: "dispatch.js",
    from: "state.settingsCategory = arg; state.cloudCodeMessage = ''; setView('settingsCategory');",
    to:   "state.settingsCategory = arg; setView('settingsCategory');",
    why:  "'That code isn't right.' shows before anything has been typed",
  },
  {
    name: "M305 (V85) the unlock travels in a backup",
    file: "backup.js",
    from: "    theme: state.theme,\n    hapticsEnabled: state.hapticsEnabled,",
    to:   "    theme: state.theme,\n    cloudUnlocked: localStorage.getItem(CLOUD_UNLOCK_KEY),\n    hapticsEnabled: state.hapticsEnabled,",
    why:  "restoring a backup onto a new phone would open the curtain there too",
  },
];

function main() {
  const filter = process.argv[2];
  const list = MUTATIONS.filter(m => !filter || m.name.includes(filter) || m.file.includes(filter));

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'patgo-mutate-'));
  copyTree(APP_DIR, tmp);

  console.log(`Mutation run — ${list.length} mutation${list.length === 1 ? '' : 's'}\n`);

  const survived = [];
  const aborted  = [];
  let caught = 0;

  for (const m of list) {
    const target = path.join(tmp, m.file);
    const original = fs.readFileSync(target, 'utf8');

    // DEFENCE 2: a mutation that does not apply proves nothing and must never
    // be scored as a pass.
    if (!original.includes(m.from)) {
      aborted.push(m);
      console.log(`  ⛔ ${m.name}\n       ANCHOR NOT FOUND in ${m.file} — the code moved. Update the mutation.`);
      continue;
    }

    fs.writeFileSync(target, original.replace(m.from, m.to));
    const failed = runSuiteExpectingFailure(tmp);
    fs.writeFileSync(target, original);

    if (failed) {
      caught++;
      console.log(`  ✓ ${m.name}`);
    } else {
      survived.push(m);
      console.log(`  ✗ ${m.name}\n       SURVIVED — no assertion catches this. ${m.why}`);
    }
  }

  fs.rmSync(tmp, { recursive: true, force: true });

  console.log('');
  console.log(`${caught} caught, ${survived.length} survived, ${aborted.length} aborted`);
  if (survived.length) {
    console.log('\nA surviving mutation means an assertion is hollow, or the behaviour is untested.');
    console.log('Fix the TEST, not the mutation — unless the mutation itself is wrong.');
  }
  process.exit(survived.length || aborted.length ? 1 : 0);
}

function runSuiteExpectingFailure(dir) {
  let out;
  try {
    // v82: belt and braces with assert.js's group timeout. A suite that never
    // ends is not a pass; it is killed here and scored as caught, because it
    // never reported green.
    out = execFileSync(process.execPath, [path.join(dir, 'harness', 'run.js')], {
      cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000,
    });
  } catch (e) {
    // Non-zero exit is the normal "caught it" path.
    out = String(e.stdout || '') + String(e.stderr || '');
    return !/\d+ passed, 0 failed/.test(out) || /HARNESS CRASHED/.test(out);
  }
  // DEFENCE 1: anchor on the whole phrase. Matching the substring "0 failed"
  // scores "10 failed" as a pass — the V66 runner did exactly this.
  return !/\d+ passed, 0 failed\s*$/.test(out.trim());
}

function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyTree(s, d);
    else fs.copyFileSync(s, d);
  }
}

main();
