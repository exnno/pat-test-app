/* Standing test — instrument resolution (MAP rule 7)
   (c) 2026 Peter Birchley. All rights reserved.

   The V66 defect: certificates and CSV read the GLOBAL instrument fields instead
   of the one stamped on the job, so re-exporting an old job printed today's
   instrument. The flat fields on `state` are a MIRROR, not the truth.

   ⚠ buildReportDoc cannot run headlessly (jsPDF is injected on demand and is
   deliberately absent from the stub environment). That is why report.js is
   covered by SOURCE GUARDS below. Without them, reintroducing the exact original
   defect passed 151/151 assertions in V66. Do not delete them in favour of
   "we'll test it properly later". */

'use strict';

const fs = require('fs');
const path = require('path');
const t = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp, withInstrument, addInstrument, withSession, withItem, confirmSheet } = require('../fixture');

module.exports = function run() {

  t.group('04a — a new job is stamped with the instrument in use', () => {
    const app = freshApp();
    const inst = withInstrument(app, { make: 'Seaward Apollo 600' });
    const sess = withSession(app);
    t.eq(sess.instrumentId, inst.id, 'session carries the active instrument id');
    t.eq(app.fn('instrumentForSession')(sess).make, 'Seaward Apollo 600', 'resolution finds it');
  });

  t.group('04b — resolution follows the stamp, not the global', () => {
    // The regression in one group: stamp job A, add and switch to a SECOND
    // instrument, then re-read job A.
    const app = freshApp();
    const first = withInstrument(app, { make: 'Instrument ONE', calCertNo: 'CERT-1' });
    const sessA = withSession(app, { site: 'Site A' });

    const second = addInstrument(app, { make: 'Instrument TWO', calCertNo: 'CERT-2' });
    t.ok(second && second.id !== first.id, 'a genuinely separate second instrument exists');
    t.eq(app.fn('instrumentList')().length, 2, 'the list holds two instruments');
    app.fn('setActiveInstrument')(second.id);
    t.eq(app.state().testerMake, 'Instrument TWO', 'the global mirror now shows the new one');

    const resolvedA = app.fn('instrumentForSession')(sessA);
    t.eq(resolvedA.make, 'Instrument ONE', 'job A still resolves to the instrument that tested it');
    t.eq(resolvedA.calCertNo, 'CERT-1', 'job A keeps its own calibration certificate');
    t.notEq(resolvedA.make, app.state().testerMake, 'resolution did not fall through to the global mirror');

    const sessB = withSession(app, { site: 'Site B' });
    t.eq(app.fn('instrumentForSession')(sessB).make, 'Instrument TWO', 'the NEW job gets the new instrument');
  });

  t.group('04b2 — editing an instrument updates every job that uses it', () => {
    // The deliberate counterpart to 04b, so the rule is not misread as "jobs are
    // frozen". Correcting a typo in a calibration certificate SHOULD propagate;
    // it is the same physical instrument. Only DELETING freezes a snapshot.
    const app = freshApp();
    withInstrument(app, { make: 'Typo Instrment', calCertNo: 'CERT-X' });
    const sess = withSession(app);
    const st = app.state();
    st.testerMake = 'Typo Instrument Fixed';
    app.fn('adoptMirrorIntoInstruments')();
    t.eq(app.fn('instrumentForSession')(sess).make, 'Typo Instrument Fixed',
      'an in-place edit reaches the already-stamped job');
    t.eq(app.fn('instrumentList')().length, 1, 'editing did not create a duplicate record');
  });

  t.group('04c — deleting an instrument snapshots it onto the jobs that used it', () => {
    const app = freshApp();
    const inst = withInstrument(app, { make: 'Doomed Tester', calCertNo: 'CERT-D' });
    const sess = withSession(app);
    t.eq(sess.instrumentId, inst.id, 'stamped before deletion');

    // deleteInstrument raises the .bulk-sheet confirm dialog; the destructive
    // work lives in its onConfirm. Calling deleteInstrument() alone deletes
    // NOTHING, so a test that skips the sheet asserts against untouched data and
    // passes for the wrong reason.
    app.fn('deleteInstrument')(inst.id);
    t.ok(confirmSheet(app, 'yes'), 'delete raised the confirm sheet and it was wired');

    const resolved = app.fn('instrumentForSession')(sess);
    t.ok(resolved, 'the job still resolves to something after the instrument is deleted');
    t.eq(resolved.make, 'Doomed Tester', 'the deleted instrument was snapshotted onto the job');
    t.eq(resolved.calCertNo, 'CERT-D', 'its calibration certificate came with it');
    t.eq(app.fn('findInstrument')(inst.id), null, 'it really is gone from the list');
  });

  t.group('04d — the mirror is adopted, never trusted', () => {
    const app = freshApp();
    withInstrument(app, { make: 'Real Instrument' });
    const st = app.state();
    // Something writes a flat field directly without adopting — the failure mode
    // MAP rule 7 exists to prevent.
    st.testerMake = 'Written Directly, Never Adopted';
    const sess = withSession(app);
    const resolved = app.fn('instrumentForSession')(sess);
    t.notEq(resolved.make, 'Written Directly, Never Adopted',
      'an unadopted mirror write does not leak into resolution');
    app.fn('adoptMirrorIntoInstruments')();
    t.ok(app.fn('instrumentList')().some(i => i.make === 'Written Directly, Never Adopted'),
      'adoption is what puts it in the list');
  });

  t.group('04e — absence vs empty array in storage', () => {
    // An ABSENT instruments key means "never migrated, build from the mirror".
    // An EMPTY ARRAY means "the user deleted them all" and must NOT resurrect.
    const app = freshApp();
    const st = app.state();
    st.instruments = [];
    app.fn('saveInstruments')();
    // Legacy flat keys still populated, as an upgrading user's would be.
    app.storage.setItem('pat:testermake', 'Should Not Resurrect');
    app.storage.setItem('pat:caldate', '2026-01-01');

    const restarted = freshApp({ localStorage: app.storage._snapshot() });
    t.eq(restarted.fn('instrumentList')().length, 0,
      'an explicitly empty list is not re-seeded from the legacy flat keys');
  });

  t.group('04f — calibration warnings cover every saved instrument', () => {
    const app = freshApp();
    withInstrument(app, { make: 'In Date', calDue: '2099-01-01' });
    const st = app.state();
    st.testerMake = 'Overdue One'; st.calDue = '2020-01-01'; st.calDate = '2019-01-01';
    app.fn('adoptMirrorIntoInstruments')();

    const worst = app.fn('worstCalibrationStatus')();
    t.ok(worst, 'worstCalibrationStatus returns something');
    // The point of V66: an overdue instrument that is NOT the active one still warns.
    const flagged = app.fn('instrumentList')().map(i => app.fn('calibrationStatusFor')(i));
    t.ok(flagged.some(f => f && /overdue/i.test(JSON.stringify(f))),
      'an overdue non-active instrument is still flagged');
  });

  t.group('04g — calibration dates can be cleared', () => {
    const app = freshApp();
    const inst = withInstrument(app, { calDate: '2026-01-01', calDue: '2027-01-01' });
    app.fn('openInstrumentEditor')(inst.id);
    app.fn('clearInstrumentDateField')('calDate');
    app.fn('clearInstrumentDateField')('calDue');
    const after = app.fn('findInstrument')(inst.id) || app.state().instrumentEditor;
    const cleared = app.fn('instrumentList')().find(i => i.id === inst.id);
    t.ok(cleared, 'the instrument still exists after clearing dates');
    t.doesNotThrow(() => app.fn('calibrationStatusFor')(cleared), 'status handles a cleared date');
  });

  t.group('04h — SOURCE GUARD: report.js never reads the global mirror', () => {
    // The only defence for a path that cannot execute here. Strip comments first
    // so the ⚠ warning comments in the file do not satisfy their own rule.
    const src = fs.readFileSync(path.join(APP_DIR, 'report.js'), 'utf8')
      .replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const field of ['testerMake', 'testerModel', 'testerSerial', 'calDate', 'calCertNo', 'calDue']) {
      t.notOk(new RegExp(`state\\s*\\.\\s*${field}\\b`).test(src),
        `report.js does not read state.${field}`);
    }
    t.ok(/instrumentForSession\s*\(/.test(src), 'report.js resolves via instrumentForSession()');
  });

  t.group('04i — SOURCE GUARD: csv.js never reads the global mirror', () => {
    const src = fs.readFileSync(path.join(APP_DIR, 'csv.js'), 'utf8')
      .replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const field of ['testerMake', 'testerModel', 'testerSerial', 'calDate', 'calCertNo', 'calDue']) {
      t.notOk(new RegExp(`state\\s*\\.\\s*${field}\\b`).test(src),
        `csv.js does not read state.${field}`);
    }
  });

  t.group('04j — SOURCE GUARD: every flat-field write adopts afterwards', () => {
    // MAP rule 7's second half. Any file that assigns a flat instrument field
    // must call adoptMirrorIntoInstruments() somewhere in the same file.
    const flat = /state\s*\.\s*(testerMake|testerModel|testerSerial|calDate|calCertNo|calDue)\s*=/;
    const skip = new Set(['instruments.js', 'state.js', 'backup.js', 'storage.js']);
    const files = fs.readdirSync(APP_DIR).filter(f => f.endsWith('.js') && f !== 'sw.js');
    for (const f of files) {
      if (skip.has(f)) continue;
      const src = fs.readFileSync(path.join(APP_DIR, f), 'utf8')
        .replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
      if (!flat.test(src)) continue;
      // TWO legitimate reconcilers, not one: adoptMirrorIntoInstruments() for a
      // live edit, and restoreInstrumentsFromBackup() for an incoming backup or
      // Setup bundle (setup.js uses the latter). Naming only the first produced
      // a false failure against correct code the first time this was written.
      const reconciles = /adoptMirrorIntoInstruments\s*\(/.test(src)
        || /restoreInstrumentsFromBackup\s*\(/.test(src);
      t.ok(reconciles, `${f} writes a flat instrument field and reconciles it into the list`);
      // Ordering matters: the reconciler rebuilds one instrument FROM the flat
      // fields, so running it first would read the old values.
      const lastWrite = Math.max(src.lastIndexOf('state.testerMake ='), src.lastIndexOf('state.calDue ='));
      const call = Math.max(src.lastIndexOf('adoptMirrorIntoInstruments('), src.lastIndexOf('restoreInstrumentsFromBackup('));
      t.ok(call > lastWrite, `${f} reconciles AFTER writing the flat fields`);
    }
  });
};
