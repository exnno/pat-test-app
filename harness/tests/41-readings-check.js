/* Standing test — readings check (V104, roadmap Stage 6 part 2, S10)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. With Test Readings on, a PASS reading DEFINITELY
   outside its usual limit (IET CoP 5th ed., Peter's copy: insulation ≥ 1.0 MΩ
   Class I / ≥ 2.0 MΩ Class II, leakage ≤ 5 mA Class I and II, Class III not
   checked; earth ≤ the engineer's own ceiling, default 0.15 Ω — 2A) gets an
   amber note under its box, repainted in place while typing (MAP rule 3), and
   Save stops once on a read-only step: Change to FAIL (readings carried into the
   fail flow) / Save as PASS anyway (5A). Shorthand is read: '<5' can't be shown
   over, so it is silent (3A). FAIL sheets are never checked (6A). Switch defaults
   ON (7A), earth ceiling 0.10–0.50, both backed up and synced (settings_work).

   ⚠ LISTENER RULE (V67): taps and typing go through #app's delegated handlers.
   ⚠ DEVICE BYTES (V68): ≤ ≥ Ω are fed as the code points an iPhone sends. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp, withSession, confirmSheet, tick, restoreFile } = require('../fixture');

function fire(app, type, el) {
  app.doc.getElementById('app').dispatchEvent({
    type, target: el, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
  });
}
function tap(app, action, arg) {
  const el = app.doc.createElement('button');
  el.dataset.action = action;
  if (arg !== undefined) el.dataset.arg = String(arg);
  fire(app, 'click', el);
}
// Typing into a reading box: the REAL input event on #app, the box's own action.
function type(app, field, text) {
  const el = app.doc.getElementById('f-reading-' + field) || app.doc.createElement('input');
  el.dataset.inputAction = 'f-reading-' + field;
  el.value = text;
  fire(app, 'input', el);
}
function change(app, action, value) {
  const el = app.doc.createElement('input');
  el.dataset.changeAction = action;
  el.value = value;
  fire(app, 'change', el);
  return el;
}
const html = (app) => app.doc.getElementById('app').innerHTML;
const byId = (app, id) => app.doc.getElementById(id);
function toasts(app) {
  const said = [];
  const real = app.sandbox.showToast;
  app.sandbox.showToast = (m) => { said.push(String(m)); return real(m); };
  return said;
}

// An app on the entry screen with Test Readings on and a valid form.
function entryApp(boot) {
  const app = freshApp(boot || {});
  const st = app.state();
  st.readingsEnabled = true;
  st.lastReadingsClass = 'I';
  withSession(app, { site: 'ZZV104SITE' });
  st.view = 'entry';
  app.fn('render')();
  fillForm(app, 'R-001');
  return app;
}
function fillForm(app, asset) {
  const st = app.state();
  st.form.location = 'Office';
  st.form.itemType = 'Kettle';
  st.form.assetNo = asset;
}
const items = (app) => app.fn('activeSession')().items;

module.exports = async function run() {

  /* ------------------------------------------------------------------ 41a */
  t.group('41a — shorthand is read as typed, with the bytes an iPhone sends (3A, V68)', () => {
    const app = freshApp();
    const P = (s) => JSON.stringify(app.fn('parseReadingValue')(s));
    t.eq(P('0.32'), '{"op":"=","n":0.32}', 'a plain number');
    t.eq(P('<0.1'), '{"op":"<","n":0.1}', '< shorthand');
    t.eq(P('\u226519.99'), '{"op":">=","n":19.99}', '≥ as U+2265');
    t.eq(P('\u22640.5'), '{"op":"<=","n":0.5}', '≤ as U+2264');
    t.eq(P('0.32\u03A9'), '{"op":"=","n":0.32}', 'Ω as iOS types it (Greek U+03A9)');
    t.eq(P('0.32\u2126'), '{"op":"=","n":0.32}', 'Ω as the ohm sign U+2126');
    t.eq(P('> 299 M\u03A9'), '{"op":">","n":299}', 'spaces and a unit');
    t.eq(P('.05'), '{"op":"=","n":0.05}', 'a leading point');
    t.eq(P('1,5'), 'null', 'a comma decimal is refused, not guessed');
    t.eq(P('OL'), 'null', 'a word is refused');
    t.eq(P('0.1 0.2'), 'null', 'two numbers are refused');
    t.eq(P(''), 'null', 'empty is nothing');

    const B = app.fn('readingBreaksLimit');
    // max (earth, leakage)
    t.ok(B('0.32', 'max', 0.15), 'max: over');
    t.notOk(B('0.15', 'max', 0.15), 'max: AT the limit is a pass');
    t.notOk(B('<5', 'max', 5), 'max: "<5" against 5 mA is silent');
    t.notOk(B('<8', 'max', 5), 'max: "<8" can\u2019t be shown over — silent, not flagged');
    t.ok(B('>5', 'max', 5), 'max: ">5" is over');
    t.notOk(B('\u22655', 'max', 5), 'max: "≥5" could be exactly 5 — silent');
    t.ok(B('\u22656', 'max', 5), 'max: "≥6" is over');
    // min (insulation)
    t.ok(B('0.8', 'min', 1.0), 'min: under');
    t.notOk(B('1.0', 'min', 1.0), 'min: AT the limit is a pass');
    t.ok(B('<1', 'min', 1.0), 'min: "<1" is under');
    t.notOk(B('\u22641', 'min', 1.0), 'min: "≤1" could be exactly 1 — silent');
    t.ok(B('\u22640.5', 'min', 1.0), 'min: "≤0.5" is under');
    t.notOk(B('\u226519.99', 'min', 2.0), 'min: the "≥19.99" pre-fill never fires');
    t.notOk(B('OL', 'min', 1.0), 'unreadable is silent');
  });

  /* ------------------------------------------------------------------ 41b */
  t.group('41b — the limits are the 5th edition\u2019s, earth is the engineer\u2019s (Q1, 2A)', () => {
    const app = freshApp();
    const L = (f, c, e) => JSON.stringify(app.fn('readingLimitFor')(f, c, e));
    t.eq(L('insulation', 'I'), '{"kind":"min","limit":1}', 'insulation Class I ≥ 1.0 MΩ');
    t.eq(L('insulation', 'II'), '{"kind":"min","limit":2}', 'insulation Class II ≥ 2.0 MΩ');
    t.eq(L('insulation', 'III'), 'null', 'Class III insulation is not checked (no CoP figure)');
    t.eq(L('leakage', 'I'), '{"kind":"max","limit":5}', 'leakage Class I ≤ 5 mA');
    t.eq(L('leakage', 'II'), '{"kind":"max","limit":5}', 'leakage Class II ≤ 5 mA (not the old 0.25)');
    t.eq(L('earth', 'I', 0.2), '{"kind":"max","limit":0.2}', 'earth uses the engineer\u2019s ceiling');
    t.eq(L('earth', 'I', 'junk'), '{"kind":"max","limit":0.15}', '…or the default when it\u2019s garbage');
    t.eq(L('earth', 'II', 0.2), 'null', 'no earth check off Class I');
    t.eq(L('nonsense', 'I'), 'null', 'an unknown field is not checked');

    const N = app.fn('normaliseEarthLimit');
    t.eq(N('0.2'), 0.2, 'a stored string');
    t.eq(N(0.123), 0.12, 'rounded to 2 places');
    t.eq(N('0.5'), 0.5, 'the top of the range');
    t.eq(N('0.1'), 0.1, 'the bottom of the range');
    t.eq(N('0.6'), 0.15, 'over the range → default');
    t.eq(N(0.05), 0.15, 'under the range → default');
    t.eq(N('abc'), 0.15, 'garbage → default');
    t.eq(N(null), 0.15, 'absent → default');
  });

  /* ------------------------------------------------------------------ 41c */
  await t.group('41c — the note appears under the box while typing, in place (5A, MAP rule 3)', async () => {
    const app = entryApp();
    const st = app.state();
    tap(app, 'log-pass');
    t.ok(st.readingsSheetOpen, 'PASS opened the readings sheet');
    t.eq(st.readingsSheetMode, 'pass', '…in pass mode');
    t.includes(html(app), 'id="reading-note-earth"', 'the earth note is in the DOM');
    t.includes(html(app), 'id="reading-note-earth" role="status" hidden', '…hidden while the pre-fill is fine');

    let renders = 0;
    const realRender = app.sandbox.render;
    app.sandbox.render = (...a) => { renders++; return realRender(...a); };
    type(app, 'earth', '0.32');
    const note = byId(app, 'reading-note-earth');
    t.eq(note.hidden, false, 'typing 0.32 Ω shows the note');
    t.includes(note.textContent, '0.15', '…naming the engineer\u2019s limit');
    t.includes(note.textContent, '0.1 \u03A9 plus the lead', '…and the real rule');
    type(app, 'insulation', '0.8');
    t.includes(byId(app, 'reading-note-insulation').textContent, '1.0 M\u03A9 for Class I', 'insulation note names the Class I minimum');
    type(app, 'earth', '0.05');
    t.eq(byId(app, 'reading-note-earth').hidden, true, 'back inside the limit hides it again');
    t.eq(renders, 0, 'none of that rendered — the keyboard stays up');
    app.sandbox.render = realRender;

    // A re-render (class switch) paints the note from the draft.
    tap(app, 'readings-set-class', 'II');
    t.includes(html(app), 'Below the usual minimum of 2.0 M\u03A9 for Class II', 'Class II re-renders with its own minimum');
    tap(app, 'readings-set-class', 'III');
    t.excludes(html(app), 'Below the usual minimum', 'Class III: not checked');

    // Off switch: silent.
    tap(app, 'readings-set-class', 'I');
    st.readingsCheckEnabled = false;
    type(app, 'earth', '0.9');
    t.eq(byId(app, 'reading-note-earth').hidden, true, 'check off: no note');
  });

  /* ------------------------------------------------------------------ 41d */
  await t.group('41d — Save asks once; never fails anything by itself (5A, 3A, 6A)', async () => {
    // Within limits: one tap, as before.
    let app = entryApp();
    let st = app.state();
    tap(app, 'log-pass');
    tap(app, 'readings-commit');
    t.eq(items(app).length, 1, 'pre-filled readings save straight away (the "<5" leakage is silent)');
    t.eq(items(app)[0].readings.leakage, '<5', '…with the pre-fill as before');

    // Over: the confirm step, nothing logged.
    app = entryApp();
    st = app.state();
    tap(app, 'log-pass');
    type(app, 'earth', '0.32');
    type(app, 'leakage', '>5');
    tap(app, 'readings-commit');
    t.eq(items(app).length, 0, 'over the limit: nothing logged yet');
    t.eq(st.readingsSheetStage, 'confirm', '…the confirm step is up');
    const h = html(app);
    t.includes(h, 'Check these readings', 'two readings → plural title');
    t.includes(h, 'data-action="readings-change-to-fail"', 'Change to FAIL offered');
    t.includes(h, 'data-action="readings-pass-anyway"', 'Save as PASS anyway offered');
    t.excludes(h, 'id="f-reading-earth"', 'the step has no inputs (read-only — it may render)');

    tap(app, 'readings-confirm-back');
    t.eq(st.readingsSheetStage, 'entry', 'Back returns to the readings');
    t.eq(st.readingsDraft.earth, '0.32', '…as typed');
    tap(app, 'readings-commit');
    tap(app, 'readings-pass-anyway');
    t.eq(items(app).length, 1, 'Save as PASS anyway logs it');
    t.eq(items(app)[0].result, 'pass', '…as a PASS');
    t.eq(items(app)[0].readings.earth, '0.32', '…with the reading as typed');
    t.notOk(st.readingsSheetOpen, 'the sheet is closed');
    t.eq(st.readingsSheetStage, 'entry', 'the stage is reset for the next item');

    // Check off: straight through.
    app = entryApp();
    app.state().readingsCheckEnabled = false;
    tap(app, 'log-pass');
    type(app, 'earth', '0.9');
    tap(app, 'readings-commit');
    t.eq(items(app).length, 1, 'check off: an over-limit pass saves in one tap');

    // A FAIL sheet is never checked.
    app = entryApp();
    st = app.state();
    tap(app, 'log-fail');
    t.ok(app.fn('pickFailReason'), 'fail flow present');
    app.fn('pickFailReason')('Earth Continuity');
    t.eq(st.readingsSheetMode, 'fail', 'fail readings sheet');
    type(app, 'earth', '0.9');
    t.eq(byId(app, 'reading-note-earth') ? byId(app, 'reading-note-earth').hidden : true, true, 'no note on a FAIL sheet');
    tap(app, 'readings-commit');
    t.eq(items(app).length, 1, 'a fail saves without the step');
    t.eq(items(app)[0].result, 'fail', '…as a fail');
  });

  /* ------------------------------------------------------------------ 41e */
  await t.group('41e — Change to FAIL carries the readings into the fail flow (5A, MAP rule 4)', async () => {
    const app = entryApp();
    const st = app.state();
    tap(app, 'log-pass');
    type(app, 'insulation', '0.5');
    tap(app, 'readings-commit');
    tap(app, 'readings-change-to-fail');
    t.notOk(st.readingsSheetOpen, 'the readings sheet closes');
    t.ok(st.failModalOpen, 'the fail reasons open');
    t.eq(items(app).length, 0, 'still nothing logged');
    t.eq(st.readingsCarry && st.readingsCarry.insulation, '0.5', 'the typed readings are held');

    app.fn('pickFailReason')('Insulation Resistance');
    t.eq(st.readingsSheetMode, 'fail', 'the fail readings sheet opens');
    t.eq(st.readingsDraft.insulation, '0.5', '…with the insulation reading already in');
    t.eq(st.readingsCarry, null, '…and the carry is spent');
    t.includes(html(app), 'value="0.5"', 'the box shows it');
    tap(app, 'readings-commit');
    const it = items(app)[0];
    t.eq(it && it.result, 'fail', 'logged as a FAIL');
    t.eq(it && it.readings.insulation, '0.5', '…with the reading');
    t.eq(it && it.readings.class, 'I', '…and the class');
    t.includes(it && it.notes, 'Insulation Resistance', 'the reason went on as usual');

    // Backing out of the reasons drops the carry: the next fail starts blank.
    fillForm(app, 'R-002');
    tap(app, 'log-pass');
    type(app, 'earth', '0.4');
    tap(app, 'readings-commit');
    tap(app, 'readings-change-to-fail');
    tap(app, 'fail-cancel');
    t.eq(st.readingsCarry, null, 'cancelling the reasons drops the carry');
    tap(app, 'log-fail');
    app.fn('pickFailReason')('Earth Continuity');
    t.eq(st.readingsDraft.earth, '', 'a later fail starts blank — no stale reading');
  });

  /* ------------------------------------------------------------------ 41f */
  await t.group('41f — switch defaults ON; the earth box refuses out-of-range; stored and backed up (7A, 2A)', async () => {
    let app = freshApp();
    t.eq(app.state().readingsCheckEnabled, true, 'no key → on');
    t.eq(app.state().readingsEarthLimit, 0.15, 'no key → 0.15 Ω');
    app = freshApp({ localStorage: { 'pat:readingscheck': '0', 'pat:readingsearthlimit': '0.3' } });
    t.eq(app.state().readingsCheckEnabled, false, 'an explicit 0 is off');
    t.eq(app.state().readingsEarthLimit, 0.3, 'a stored limit is read');
    app = freshApp({ localStorage: { 'pat:readingsearthlimit': '9' } });
    t.eq(app.state().readingsEarthLimit, 0.15, 'a stored garbage limit reads as the default');

    app = freshApp();
    const st = app.state();
    st.readingsEnabled = true;
    st.view = 'settingsReadings';
    app.fn('render')();
    t.includes(html(app), 'data-change-action="readings-check-toggle"', 'the switch is on the Test Readings page');
    t.includes(html(app), 'id="readings-earth-limit"', 'the earth box shows while the check is on');
    const said = toasts(app);
    const box = change(app, 'readings-earth-limit', '0.9');
    t.eq(st.readingsEarthLimit, 0.15, 'out of range is refused');
    t.includes(said.join('|'), '0.10 to 0.50', '…with a toast');
    t.eq(box.value, '0.15', '…and the box put back');
    change(app, 'readings-earth-limit', '');
    t.eq(st.readingsEarthLimit, 0.15, 'empty is refused, not read as 0');
    change(app, 'readings-earth-limit', '0.25');
    t.eq(st.readingsEarthLimit, 0.25, 'in range is taken');
    t.eq(app.storage.getItem('pat:readingsearthlimit'), '0.25', '…and stored');

    const sw = app.doc.createElement('input');
    sw.type = 'checkbox'; sw.checked = false; sw.dataset.changeAction = 'readings-check-toggle';
    fire(app, 'change', sw);
    t.eq(st.readingsCheckEnabled, false, 'the switch turns it off');
    t.eq(app.storage.getItem('pat:readingscheck'), '0', '…stored as an explicit 0');
    t.excludes(html(app), 'id="readings-earth-limit"', 'off: the earth box goes');
    // save() itself must write it both ways (absent reads as ON, so a save that
    // skipped the key would quietly switch the check back on after a restore).
    st.readingsCheckEnabled = true; app.fn('save')();
    t.eq(app.storage.getItem('pat:readingscheck'), '1', 'save() writes 1 when on');
    st.readingsCheckEnabled = false; app.fn('save')();
    t.eq(app.storage.getItem('pat:readingscheck'), '0', 'save() writes an explicit 0 when off');
    st.readingsEarthLimit = 0.25; app.fn('save')();
    t.eq(app.storage.getItem('pat:readingsearthlimit'), '0.25', 'save() writes the limit');

    // Backup round-trip through the real restore path.
    const backup = JSON.stringify(app.fn('buildBackup')());
    t.includes(backup, '"readingsCheckEnabled":false', 'the backup carries the switch (long key)');
    t.includes(backup, '"readingsEarthLimit":0.25', '…and the limit');
    st.readingsCheckEnabled = true; st.readingsEarthLimit = 0.15;
    await restoreFile(app, new app.sandbox.File([backup], 'b.json', { type: 'application/json' }));
    t.ok(confirmSheet(app, 'yes'), 'restore confirmed');
    await tick(30);   // V105: a restore applies once the safety copy (6A) has been kept
    t.eq(app.state().readingsCheckEnabled, false, 'switch restored');
    t.eq(app.state().readingsEarthLimit, 0.25, 'limit restored');

    // An older backup (no keys) leaves the defaults; a garbage limit can't land.
    const app2 = freshApp();
    const old = { appVersion: 'V103', backupVersion: 5, exportedAt: '2026-10-01T00:00:00.000Z', sessions: [], readingsEarthLimit: 7 };
    await restoreFile(app2, new app2.sandbox.File([JSON.stringify(old)], 'o.json', { type: 'application/json' }));
    t.ok(confirmSheet(app2, 'yes'), 'old backup restore confirmed');
    await tick(30);   // V105: a restore applies once the safety copy (6A) has been kept
    t.eq(app2.state().readingsCheckEnabled, true, 'an older backup leaves the check on');
    t.eq(app2.state().readingsEarthLimit, 0.15, 'an out-of-range limit restores as the default');
  });

  /* ------------------------------------------------------------------ 41g */
  t.group('41g — sync: both settings ride settings_work; a V103 row reads as the defaults', () => {
    const app = freshApp();
    const N = (raw) => app.fn('_syncGeneralNormalise')('settings_work', raw);
    const v103 = N({ engineer: 'P', timestamps: true, readings: true, sqp: false, retest: true });
    t.eq(v103.readingsCheck, true, 'a V103 row (no field) reads as ON, not off');
    t.eq(v103.earthLimit, 0.15, '…and the default limit');
    t.eq(N({ readingsCheck: false, earthLimit: 0.3 }).readingsCheck, false, 'an explicit false is carried');
    t.eq(N({ earthLimit: 3 }).earthLimit, 0.15, 'an out-of-range synced limit collapses to the default');

    const st = app.state();
    st.readingsCheckEnabled = false; st.readingsEarthLimit = 0.2;
    const mine = app.fn('_syncGeneralRecord')('settings_work');
    t.eq(mine.readingsCheck, false, 'this phone\u2019s row carries the switch');
    t.eq(mine.earthLimit, 0.2, '…and the limit');

    t.ok(app.fn('_syncApplyGeneral')('settings_work', { id: 'settings_work', engineer: 'P', readingsCheck: true, earthLimit: 0.35 }), 'applied');
    t.eq(st.readingsCheckEnabled, true, 'applying sets the switch');
    t.eq(st.readingsEarthLimit, 0.35, '…and the limit');
    t.notOk(app.fn('_syncGeneralValid')('settings_work', { earthLimit: 'x' }), 'a non-number limit is held as invalid');
    t.ok(app.fn('_syncGeneralValid')('settings_work', {}), 'a V103 row is valid');

    const d = app.fn('_syncGeneralDiffs')('settings_work', { earthLimit: 0.2 }, { earthLimit: 0.3 });
    t.ok(d.some(x => x.label === 'Earth limit' && x.here === '0.20 \u03A9'), 'a limit difference shows on a held card');
  });

  /* ------------------------------------------------------------------ 41h */
  t.group('41h — wiring, release copy and the stale certificate line', () => {
    const dsrc = fs.readFileSync(path.join(APP_DIR, 'dispatch.js'), 'utf8');
    for (const a of ['readings-pass-anyway', 'readings-change-to-fail', 'readings-confirm-back', 'readings-check-toggle', 'readings-earth-limit']) {
      t.includes(dsrc, `'${a}':`, `dispatch wires ${a}`);
    }
    // V105: the V104 version and welcome-copy pins retired (they roll every
    // release, same as 39/40) — group 42 pins V105's.
    const rs = fs.readFileSync(path.join(APP_DIR, 'render-settings.js'), 'utf8');
    t.excludes(rs, 'in a future update', 'the Test Readings page no longer says readings come to the certificate later');
  });
};
