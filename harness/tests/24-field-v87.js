/* Standing test — V87 field fixes and storage safety
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked: 1A (storage safety + small fixes; photos is
   V88), 2C (ask the browser to keep the data at launch once a real job exists,
   plus a button), 3A (amber at 60%, Jobs banner at 80% once a day), 4A (a failed
   save is caught and the user told), 5B (PDF title from the job) + UK dates and
   no underscores in any file name, 9A/10A/11A (retest by MONTH: due for the
   whole month, chase from the 1st of the month before, certificate shows the
   month). Plus the Android description-list report (8): lists close when the
   keyboard hides or on a tap outside.

   ⚠ buildReportDoc cannot run headlessly (see 04). Its title is built by the
   pure reportDocProperties(), tested directly; the call site is source-guarded.

   ⚠ LISTENER RULE (V67). 24g fires through document and the visualViewport
   object, never by calling the guard; 24e taps through #app. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, scriptOrderFromIndex } = require('../load');
const { freshApp, populated, withSession, withItem, tick } = require('../fixture');

const src = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');

function tap(app, action, arg) {
  const el = app.doc.createElement('button');
  el.dataset.action = action;
  if (arg !== undefined) el.dataset.arg = String(arg);
  app.doc.getElementById('app').dispatchEvent({
    type: 'click', target: el, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
  });
}
const html = (app) => app.doc.getElementById('app').innerHTML;

// ISO date (the 15th) of the month `offset` months from now.
function isoMonthsFromNow(offset) {
  const d = new Date();
  const idx = d.getFullYear() * 12 + d.getMonth() + offset;
  const y = Math.floor(idx / 12), m = ((idx % 12) + 12) % 12 + 1;
  return `${y}-${String(m).padStart(2, '0')}-15`;
}

function makeVV(height = 844) {
  const listeners = {};
  return {
    height, offsetTop: 0, width: 390,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener() {},
    _move(h) { this.height = h; (listeners.resize || []).forEach(fn => fn.call(this, { type: 'resize' })); },
  };
}

module.exports = async function run() {

  /* ------------------------------------------------------------------ 24a */
  t.group('24a — every file name: spaces, not underscores, and a UK date', () => {
    const app = freshApp();
    t.eq(app.fn('fileDateUK')('2026-09-28'), '28-09-2026', 'fileDateUK is day-first');
    t.eq(app.fn('fileDateUK')('garbage'), '', 'fileDateUK: unusable input → empty');
    t.eq(app.fn('fileSafe')('PAT_Report_Office/Block: A'), 'PAT Report Office Block A',
      'fileSafe: underscores → spaces, forbidden characters dropped, spaces collapsed');

    const s = withSession(app, { client: 'Acme', site: 'Office Block' });
    s.date = '2026-09-28';
    const pdf = app.fn('reportFilename')(s);
    t.eq(pdf, 'PAT Report Acme \u2014 Office Block 28-09-2026.pdf',
      'report name from the OLD default pattern comes out with spaces and a UK date');
    t.excludes(pdf, '_', 'no underscore anywhere in the report name');
    t.eq(app.fn('reportFilename')(s, 'Cert_{client}_{date}'), 'Cert Acme 28-09-2026.pdf',
      'a custom pattern with typed underscores gets spaces too');

    const csv = app.fn('csvFilename')(s);
    t.eq(csv, 'PAT Acme \u2014 Office Block 28-09-2026.csv', 'CSV name: spaces, UK date');

    const setup = app.fn('setupFilename')('My Van');
    t.ok(/^PAT setup My Van \d\d-\d\d-\d{4}\.json$/.test(setup), `setup name is UK-dated with spaces (${setup})`);

    t.eq(app.val('REPORT_FILENAME_DEFAULT') || app.run('REPORT_FILENAME_DEFAULT'), 'PAT_Report_{site}_{date}',
      'the STORED default is unchanged (synced report row + V84 "nothing made" rule)');

    t.includes(src('backup.js'), 'a.download = `PAT backup ${fileDateUK(todayISO())}.json`', 'backup file name: UK date, spaces');
    t.includes(src('photos.js'), 'a.download = `PATGo photos ${fileDateUK(todayISO())}.json`', 'photo export name: UK date, spaces');
    t.includes(src('csv.js'), 'const filename = csvFilename(session);', 'CSV share path uses the one name builder');
    t.includes(src('csv.js'), "new File([BOM + buildCSV(s)], csvFilename(s)", 'CSV bulk share uses it too');
  });

  /* ------------------------------------------------------------------ 24b */
  t.group('24b — no date anywhere follows the phone\'s region setting (UK-only app)', () => {
    const offenders = [];
    for (const f of scriptOrderFromIndex()) {
      if (/min\.js$|supabase\.umd\.js$/.test(f)) continue;
      const code = src(f).replace(/^[ \t]*\/\/.*$/gm, '');
      const re = /new Date\([^)]*\)\.toLocale(?:Date|Time)?String\((?!'en-GB')/g;
      const re2 = /\.toLocale(?:Date|Time)?String\(\[\]/g;
      if (re.test(code) || re2.test(code)) offenders.push(f);
    }
    t.deepEq(offenders, [], 'every locale date format names en-GB');
    const app = freshApp();
    t.eq(app.fn('formatDate')('2026-09-28'), '28/09/2026', 'on-screen dates stay DD/MM/YYYY');
  });

  /* ------------------------------------------------------------------ 24c */
  t.group('24c — the PDF carries its own title, built from the job', () => {
    const app = freshApp();
    const s = withSession(app, { client: 'Acme', site: 'Office Block' });
    s.date = '2026-09-28';
    const rs = app.state().reportSettings;
    rs.companyName = 'Birchley Testing';
    const p = app.fn('reportDocProperties')(s, rs);
    t.eq(p.title, 'PAT Test Certificate - Acme, Office Block - 28/09/2026', 'title: client, site, UK date');
    t.eq(p.author, 'Birchley Testing', 'author: the company');
    t.eq(p.creator, 'PATGo', 'creator: PATGo');
    rs.companyName = '';
    t.eq(app.fn('reportDocProperties')(s, rs).author, s.engineer, 'no company → the engineer');

    const rep = src('report.js');
    const made = rep.indexOf("const doc = new JsPDF({ unit: 'pt', format: 'a4', orientation, compress: true });");
    const set = rep.indexOf('doc.setProperties(reportDocProperties(session, rs))');
    t.ok(made > 0 && set > made, 'buildReportDoc sets the properties right after creating the doc');
    t.ok(set - made < 800, '…in the same breath, not somewhere a return could skip it');
  });

  /* ------------------------------------------------------------------ 24d */
  t.group('24d — retest by MONTH: due the whole month, chase from the 1st of the month before', () => {
    const app = freshApp();
    const label = app.fn('retestMonthLabel');
    t.eq(label('2026-09-30', 12), 'September 2027', '30 Sep + 12 → September 2027');
    t.eq(label('2026-08-31', 6), 'February 2027', '31 Aug + 6 → February (the old rollover printed 03/03)');
    t.eq(label('2026-11-01', 3), 'February 2027', 'year boundary');

    const st = app.fn('retestStatus');
    const sess = { retestTrack: true, date: '2026-09-30', retestMonths: 12, retestContact: null };
    const at = (y, m, d) => new Date(y, m - 1, d, 12);
    t.eq(st(sess, at(2027, 7, 31)), 'later',    '31 July: not yet');
    t.eq(st(sess, at(2027, 8, 1)),  'upcoming', '1 August: due next month — the chase starts');
    t.eq(st(sess, at(2027, 8, 31)), 'upcoming', '31 August: still due next month');
    t.eq(st(sess, at(2027, 9, 1)),  'duesoon',  '1 September: due this month');
    t.eq(st(sess, at(2027, 9, 30)), 'duesoon',  '30 September: still due this month (not overdue on the day)');
    t.eq(st(sess, at(2027, 10, 1)), 'overdue',  '1 October: overdue');
    t.eq(st(Object.assign({}, sess, { retestContact: { status: 'booked', at: 'x' } }), at(2027, 10, 1)), 'resolved',
      'booked stays resolved');

    // The live list, against the real clock: one job per bucket, dated relative to today.
    const S = app.state();
    const mk = (id, off) => ({ id, name: id, site: id, date: isoMonthsFromNow(off), items: [],
      retestTrack: true, retestMonths: 12, retestContact: null });
    S.sessions.push(mk('rt-later', -10), mk('rt-next', -11), mk('rt-this', -12), mk('rt-over', -13));
    S.retestRemindersEnabled = true;
    const ids = app.fn('activeRetestReminders')().map(s => s.id);
    t.deepEq(ids, ['rt-over', 'rt-this', 'rt-next'], 'chase list: overdue, this month, next month — later not shown');

    app.fn('setView')('sessions');
    app.fn('render')();
    const h = html(app);
    t.includes(h, 'Retest due this month', 'Jobs chip: due this month');
    t.includes(h, 'Retest due next month', 'Jobs chip: due next month');
    t.includes(h, 'Retest overdue', 'Jobs chip: overdue');

    const rep = src('report.js');
    t.includes(rep, "const rd = retestMonthLabel(session.date, rs.retestMonths);", 'certificate prints the MONTH');
    for (const f of scriptOrderFromIndex()) {
      if (/min\.js$|supabase\.umd\.js$/.test(f)) continue;
      t.excludes(src(f).replace(/^[ \t]*\/\/.*$/gm, ''), 'addMonthsFormatted(', `no day-based retest date left in ${f}`);
    }
  });

  /* ------------------------------------------------------------------ 24e */
  await t.group('24e — a failed save is caught and the user is told at once', async () => {
    const app = populated();
    const before = app.storage.getItem('pat:sessions');
    app.storage._quotaExceededAfter = 0;            // every write now refuses
    t.doesNotThrow(() => withItem(app, { assetNo: 'ZZFULL-0001' }), 'logging an item no longer throws');
    t.ok(app.state().saveFailure && app.state().saveFailure.full === true, 'quota recognised as "full"');
    t.eq(app.storage.getItem('pat:sessions'), before, 'and it really was NOT written');
    await tick(5);
    t.includes(html(app), 'Storage full', 'the sheet is on screen without the caller rendering');
    t.includes(html(app), 'NOT saved', 'it says plainly the item is not saved');
    const backup = app.fn('buildBackup')();
    t.ok(JSON.stringify(backup.sessions).includes('ZZFULL-0001'), '"Back up now" rescues it: the backup is built from what is on screen');

    tap(app, 'save-fail-close');
    t.excludes(html(app), 'NOT saved', 'Close hides it');
    withItem(app, { assetNo: 'ZZFULL-0002' });
    await tick(5);
    t.includes(html(app), 'NOT saved', 'the next failed save shows it again');

    app.storage._quotaExceededAfter = null;
    withItem(app, { assetNo: 'ZZFULL-0003' });
    t.eq(app.state().saveFailure, null, 'a save that works clears the warning');
    t.ok(app.storage.getItem('pat:sessions').includes('ZZFULL-0001'), 'and everything held in memory reaches storage');

    // Through the surface the phone uses: PASS tapped on #app with the phone full.
    // Pre-V87 an unguarded write threw into the dispatcher, which dropped the
    // engineer on the Jobs list with "Something went wrong".
    const app3 = populated();
    app3.fn('setView')('entry');
    app3.state().form.assetNo = 'ZZFULL-TAP'; app3.state().form.itemType = 'Kettle';
    app3.storage._quotaExceededAfter = 0;
    tap(app3, 'log-pass');
    await tick(5);
    t.eq(app3.state().view, 'entry', 'a full phone does NOT throw the engineer back to the Jobs list');
    t.includes(html(app3), 'NOT saved', 'the tap path shows the sheet');
    t.ok(JSON.stringify(app3.fn('buildBackup')().sessions).includes('ZZFULL-TAP'), 'the tapped item is in memory, so the backup has it');

    // The dispatcher's own route, for the ~40 unguarded writes: an action whose
    // write is refused. It must keep the screen and show the sheet — not recover
    // to the Jobs list (the pre-V87 behaviour, still right for ordinary throws).
    const app4 = populated();
    app4.fn('setView')('entry');
    app4.run('ACTIONS["harness-full"] = function () { const e = new Error("full"); e.name = "QuotaExceededError"; throw e; };');
    tap(app4, 'harness-full');
    await tick(5);
    t.eq(app4.state().view, 'entry', 'dispatcher: a refused write keeps the screen');
    t.includes(html(app4), 'NOT saved', 'dispatcher: and shows the sheet');
    app4.run('ACTIONS["harness-other"] = function () { throw new Error("ordinary bug"); };');
    tap(app4, 'harness-other');
    t.eq(app4.state().view, 'sessions', 'an ordinary throw still recovers to the Jobs list (unchanged)');

    // A settings write fails the same way; a non-quota error is reported, not swallowed.
    const app2 = freshApp();
    const real = app2.storage.setItem;
    app2.storage.setItem = function () { throw new Error('disk on fire'); };
    t.doesNotThrow(() => app2.fn('saveSettings')(), 'a failed settings write does not throw');
    t.ok(app2.state().saveFailure && app2.state().saveFailure.full === false, 'non-quota failure: reported, not "full"');
    app2.storage.setItem = real;
    await tick(5);
    t.includes(html(app2), app2.run('escapeHTML')('Couldn\u2019t save'), 'different wording when it isn\'t a full phone');
  });

  /* ------------------------------------------------------------------ 24f */
  await t.group('24f — keep the data: checked at launch, asked once a real job exists, and a button', async () => {
    const fresh = freshApp({ navigator: { persisted: false, persistGrants: true } });
    await tick(5);
    t.eq(fresh.state().storageProtection, 'not', 'no jobs yet: checked only');
    t.notOk(fresh.nav._calls.persist, 'no jobs yet: the browser is NOT asked');

    const seed = populated().storage._snapshot();
    const withJob = freshApp({ localStorage: seed, navigator: { persisted: false, persistGrants: true } });
    await tick(5);
    t.eq(withJob.nav._calls.persist, 1, 'a real job on the phone: asked once at launch');
    t.eq(withJob.state().storageProtection, 'protected', 'and the answer is recorded');

    const already = freshApp({ localStorage: seed, navigator: { persisted: true } });
    await tick(5);
    t.notOk(already.nav._calls.persist, 'already protected: not asked again');

    const none = freshApp({ navigator: { noPersist: true } });
    await tick(5);
    t.eq(none.state().storageProtection, 'unsupported', 'no API: says so, nothing throws');

    const refused = freshApp({ localStorage: seed, navigator: { persisted: false, persistGrants: false } });
    await tick(5);
    refused.fn('setView')('settingsStorage');   // V97: moved to Phone Storage
    t.includes(html(refused), 'Not protected', 'Phone Storage page: not protected');
    t.includes(html(refused), 'data-action="storage-protect"', '…with the button');
    refused.nav._calls.persist = 0;
    tap(refused, 'storage-protect');
    await tick(5);
    t.eq(refused.nav._calls.persist, 1, 'the button (a tap through #app) asks again');

    const granted = freshApp({ localStorage: seed, navigator: { persisted: false, persistGrants: false } });
    await tick(5);
    granted.fn('setView')('settingsStorage');
    const slot = granted.doc.getElementById('storage-protect');
    t.ok(!!slot, 'the status line has its own slot to repaint');
    // The browser now says yes: the answer is painted IN PLACE, not by render().
    granted.nav._calls.granted = true;
    await granted.fn('checkStorageProtection')(false);
    t.includes(slot.innerHTML, 'Protected.', 'the slot is repainted in place with the new answer');
  });

  /* ------------------------------------------------------------------ 24g */
  t.group('24g — headroom: amber note from 60%, Jobs banner from 80%, once a day', () => {
    const CAP = 5 * 1024 * 1024;
    const fill = (app, pct) => {
      app.storage.setItem('zz-fill', '');
      const used = app.fn('getStorageStats')().bytes;
      const want = Math.ceil(CAP * pct / 100) - used;
      app.storage.setItem('zz-fill', 'x'.repeat(Math.max(0, Math.floor(want / 2))));
    };
    const app = populated();
    fill(app, 50);
    app.fn('setView')('sessions');
    t.excludes(html(app), 'storage-banner-dismiss', '50%: no banner');
    app.fn('setView')('settingsStorage');   // V97
    t.excludes(html(app), 'Getting full', '50%: no note');

    fill(app, 65);
    app.fn('setView')('settingsStorage');   // V97
    t.includes(html(app), 'Getting full', '65%: amber note on the Phone Storage page');
    t.includes(html(app), 'storage-bar warn', '65%: bar amber');
    app.fn('setView')('sessions');
    t.excludes(html(app), 'storage-banner-dismiss', '65%: still no Jobs banner');

    fill(app, 85);
    app.fn('setView')('sessions');
    t.includes(html(app), 'storage-banner-dismiss', '85%: Jobs banner');
    tap(app, 'storage-banner-dismiss');
    t.excludes(html(app), 'storage-banner-dismiss', 'dismissed: gone');
    t.eq(app.storage.getItem('pat:storageBannerDay'), app.val('todayISO')(), 'until tomorrow');
    app.storage.setItem('pat:storageBannerDay', '2000-01-01');
    app.fn('render')();
    t.includes(html(app), 'storage-banner-dismiss', 'a new day: back');
    tap(app, 'storage-banner-open');
    t.eq(app.state().view, 'settingsStorage', '"Back up & clear" opens Phone Storage (V97)');
  });

  /* ------------------------------------------------------------------ 24h */
  t.group('24h — suggestion lists close when the keyboard hides, or on a tap outside', () => {
    const vv = makeVV();
    const app = freshApp({ visualViewport: vv });
    const wrap = app.doc.createElement('div');
    wrap.setAttribute('class', 'custom-type-wrap');
    app.doc.body.appendChild(wrap);
    app.doc.register('f-type', 'input');
    const open = () => {
      app.state().suggestions = ['Kettle', 'Kettle lead'];
      app.state().showSuggestions = true;
      app.fn('renderSuggestionsOnly')();
    };
    const listed = () => !!wrap.querySelector('.suggestions');
    const down = (target) => app.doc.dispatchEvent({ type: 'pointerdown', target,
      defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} });

    open();
    t.ok(listed(), 'list open (control)');
    const item = wrap.querySelector('.suggestions');
    const ev = down(item);
    t.ok(listed(), 'a tap INSIDE the field\'s wrap leaves it (that is a pick)');

    const outside = app.doc.createElement('button');
    app.doc.body.appendChild(outside);
    const e2 = { type: 'pointerdown', target: outside, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
    app.doc.dispatchEvent(e2);
    t.notOk(listed(), 'a tap outside closes it');
    t.notOk(app.state().showSuggestions, '…and the state agrees');
    t.notOk(e2.defaultPrevented, 'the outside tap itself is not cancelled — it still does its job');

    open();
    vv._move(844 - 300);                 // keyboard up
    t.ok(listed(), 'keyboard up: list stays');
    vv._move(844);                       // keyboard hidden, field still focused (Android)
    t.notOk(listed(), 'keyboard hidden without a blur: list closes');
  });
};
