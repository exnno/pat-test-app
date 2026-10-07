/* PATGo test harness — fixtures
   (c) 2026 Peter Birchley. All rights reserved.

   Standard app states, built through the REAL app functions rather than by
   hand-assembling objects. This matters: a hand-built session can drift from
   the shape createSession() actually produces, and then the test passes against
   a shape that never occurs in the field. */

'use strict';

const { bootApp } = require('./load');

/* Distinctive strings, used so a privacy or leakage assertion can search for
   something that could not appear by coincidence. */
const CANARY = {
  client:   'ZZCANARYCLIENT',
  site:     'ZZCANARYSITE',
  location: 'ZZCANARYLOCATION',
  itemType: 'ZZCANARYTYPE',
  notes:    'ZZCANARYNOTES',
  asset:    'ZZCANARY-0001',
  certNo:   'ZZCANARYCERT',
  engineer: 'ZZCANARYENGINEER',
};

/* Boot, run load(), and return the app handle plus a live state accessor.
   state is REASSIGNED by load(), so it must be re-bridged after — capturing it
   once before load() gives a stale object and silently useless assertions. */
function freshApp(opts = {}) {
  const app = bootApp(opts);
  app.fn('load')();
  app.state = () => app.refresh('state').state;
  return app;
}

/* Give the app one saved instrument, marked in use. Routed through the mirror
   adoption path because that is how a real upgrading user gets one. */
function withInstrument(app, fields = {}) {
  const st = app.state();
  st.testerMake  = fields.make    ?? 'Seaward Apollo 600';
  st.testerModel = fields.model   ?? '';
  st.testerSerial = fields.serial ?? 'SN-0001';
  st.calDate     = fields.calDate ?? '2026-01-01';
  st.calCertNo   = fields.calCertNo ?? 'CAL-77';
  st.calDue      = fields.calDue  ?? '2027-01-01';
  app.fn('adoptMirrorIntoInstruments')();
  return app.fn('instrumentList')()[0];
}

/* Add a SECOND (or third) instrument through the real add-then-edit path.

   ⚠ Do NOT use withInstrument() for this. adoptMirrorIntoInstruments() UPDATES
   the active instrument in place when one already exists, and only creates a
   record when the list is empty — so calling it twice gives you one edited
   instrument, not two. That mistake produced four false failures the first time
   these tests were written; the comment is here so it is not made again.

   Drives addInstrument() → renderSettingsInstrument() (which registers the
   editor's input ids via the stub's innerHTML handler) → saveInstrumentFromEditor(). */
function addInstrument(app, fields = {}) {
  app.fn('addInstrument')();
  app.fn('renderSettingsInstrument')();
  const set = (id, v) => { const el = app.doc.getElementById(id); if (el) el.value = v; };
  set('inst-make',     fields.make     ?? 'Second Instrument');
  set('inst-model',    fields.model    ?? '');
  set('inst-cal-date', fields.calDate  ?? '2026-06-01');
  set('inst-cal-cert', fields.calCertNo?? 'CERT-2');
  set('inst-cal-due',  fields.calDue   ?? '2027-06-01');
  app.fn('saveInstrumentFromEditor')();
  const list = app.fn('instrumentList')();
  return list[list.length - 1];
}

/* Create a job through the real createSession() path. */
function withSession(app, o = {}) {
  const st = app.state();
  st.newForm.clientId = o.client ?? CANARY.client;   // holds the typed client NAME
  st.newForm.site     = o.site   ?? CANARY.site;
  st.newForm.engineer = o.engineer ?? CANARY.engineer;
  st.newForm.name     = o.name ?? '';
  st.newForm.prefix   = o.prefix ?? '';
  st.newForm.startNo  = o.startNo ?? '';
  app.fn('createSession')();
  return app.fn('activeSession')();
}

/* Add one item through the real saveItem() path. */
function withItem(app, o = {}) {
  const st = app.state();
  st.form.assetNo  = o.assetNo  ?? CANARY.asset;
  st.form.location = o.location ?? CANARY.location;
  st.form.itemType = o.itemType ?? CANARY.itemType;
  st.form.notes    = o.notes    ?? CANARY.notes;
  app.fn('saveItem')(o.result ?? 'pass', o.readings ?? null);
  const items = app.fn('activeSession')().items;
  return items[items.length - 1];
}

/* A fully populated app: one instrument, one job, three items, one failed. */
function populated(opts = {}) {
  const app = freshApp(opts);
  withInstrument(app);
  withSession(app);
  withItem(app, { assetNo: CANARY.asset, result: 'pass' });
  withItem(app, { assetNo: 'ZZCANARY-0002', itemType: 'Kettle', result: 'pass' });
  withItem(app, { assetNo: 'ZZCANARY-0003', itemType: 'Drill', result: 'fail' });
  return app;
}

/* Drive the .bulk-sheet confirm dialog. Returns true if a sheet was open.
   The sheet's buttons live inside innerHTML; the stub layer registers their ids
   (see stubs.js) so this drives the REAL wiring rather than calling onConfirm
   directly — which would test nothing about the dialog. */
function confirmSheet(app, choice = 'yes') {
  const id = choice === 'yes' ? 'confirm-sheet-yes' : 'confirm-sheet-no';
  const btn = app.doc.getElementById(id);
  if (!btn) return false;
  btn.click();
  return true;
}

/* Let deferred callbacks (FileReader, IDB, setTimeout(0)) run. */
function tick(ms = 0) {
  return new Promise(res => setTimeout(res, ms));
}

// V95: a job date that is always "recent". V93's window brings a job the phone
// has never held down only if it is dated within 30 days of today, so a fixed
// date in a pull fixture is a time bomb: group 17's '2026-09-01' went red on
// 2 Oct 2026 with no code change. Pull fixtures that mean "a normal recent job"
// use this; tests that mean "an OLD job" keep their fixed old dates on purpose.
function recentDate(daysAgo) {
  const d = new Date(); d.setDate(d.getDate() - (daysAgo || 0));
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const RECENT_DATE = recentDate(1);

/* V105: restore a backup file and wait for the FileReader to finish — until a
   new sheet (the confirm, or the "not a backup" info sheet) is on screen, or 2 s.
   Replaces a fixed `await tick(5)`: the stub's readAsText awaits a real
   Blob.text(), which is real async work, and under load 5 ms was not always
   enough — 03f went red about 1 run in 7 alone, and every time with two suites
   side by side. A test that expects NO confirm sheet (03h) was the worse case:
   it passed vacuously whenever the read had not finished. Resolves true when a
   sheet appeared. */
async function restoreFile(app, file, ms = 2000) {
  const count = () => app.doc.querySelectorAll('.bulk-sheet').length;
  const before = count();
  app.fn('restoreBackupFromFile')(file);
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (count() > before) return true;
    await tick(5);
  }
  return false;
}

module.exports = { RECENT_DATE, recentDate, CANARY, freshApp, withInstrument, addInstrument, withSession, withItem, populated, confirmSheet, tick, restoreFile };
