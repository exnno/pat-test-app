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
    from: '        if (s && s.instrumentId === id && !s.instrumentSnapshot) {',
    to:   '        if (false) {',
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
    from: "      _scanLogBurst(ctx, _scanChars.join(''), v);\n    }\n    _scanReset();\n    return;",
    to:   "      _scanLogBurst(ctx, _scanChars.join(''), v);\n    }\n    return;",
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
    out = execFileSync(process.execPath, [path.join(dir, 'harness', 'run.js')], {
      cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
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
