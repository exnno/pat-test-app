/* Standing test — in-app reminders + the 100th version (V100, roadmap Stage 8 part 3)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked: 1A a job's lock TIME `lockedAt`, absent unless
   locked; jobs locked before V100 have none and never remind. 2B "exported" =
   a clean CSV export OR a certificate made (downloaded/shared) at or after the
   lock — `reportAt`. 3A not-exported after 1 h / 4 h / next morning, off by
   default. 4A unlocked jobs from 4pm…8pm, off by default. 5A the backup reminder
   every 3/7/14/30 days or off, 7 by default. 6A banners on the Jobs screen:
   Review (filters the list) and × (quiet for the rest of the phone's day).
   7A a Reminders page in Phone & Display. 8A per phone, in backups and setup.
   9A the 100 moment in the welcome, replayable from About. 10A seven taps on
   About's title: "PATGo tests itself". 11A neither writes anything, no switch.

   ⚠ TAPS GO THROUGH #app (V67 lesson), as in 33–36. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp, withSession, withItem, tick } = require('../fixture');

const src = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const HOUR = 60 * 60 * 1000;

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
function pick(app, action, value) {
  const el = app.doc.createElement('select');
  el.dataset.changeAction = action;
  el.value = value;
  fire(app, 'change', el);
}
function boot(opts = {}) {
  const app = freshApp(opts);
  app.html = () => app.doc.getElementById('app').innerHTML;
  return app;
}
// A job with one item, locked through the real Session settings path.
function lockedJob(app, site = 'ZZREMSITE') {
  withSession(app, { site });
  withItem(app, { assetNo: 'ZZR1', result: 'pass', notes: '' });
  app.fn('startEditSession')();
  app.state().editForm.locked = true;
  app.fn('saveSessionEdits')();
  return app.fn('activeSession')();
}
const ago = (ms) => new Date(Date.now() - ms).toISOString();

module.exports = async function () {

  /* ------------------------------------------------------------------ 37a */
  t.group('37a — the lock time: stamped on locking, gone on unlocking (1A)', () => {
    const app = boot();
    withSession(app, { site: 'ZZLOCKTIME' });
    const before = app.fn('activeSession')();
    t.ok(!('lockedAt' in before), 'a new job has no lock time');
    app.fn('startEditSession')();
    app.state().editForm.locked = true;
    const t0 = Date.now();
    app.fn('saveSessionEdits')();
    const sess = app.fn('activeSession')();
    t.ok(sess.locked && typeof sess.lockedAt === 'string', 'locking stamps lockedAt');
    t.ok(Date.parse(sess.lockedAt) >= t0 - 5, '… with the time of locking');
    const stored = app.fn('serialiseSessions')(app.state().sessions);
    t.includes(stored, sess.lockedAt, 'and it reaches storage');
    sess.lockedAt = '2026-01-01T00:00:00.000Z';
    app.fn('startEditSession')();
    app.state().editForm.locked = true;
    app.fn('saveSessionEdits')();
    t.eq(app.fn('activeSession')().lockedAt, '2026-01-01T00:00:00.000Z', 're-saving a locked job keeps its time');
    app.fn('startEditSession')();
    app.state().editForm.locked = false;
    app.fn('saveSessionEdits')();
    t.ok(!('lockedAt' in app.fn('activeSession')()), 'unlocking in Session settings removes it (rule 36)');
    app.fn('startEditSession')();
    app.state().editForm.locked = true;
    app.fn('saveSessionEdits')();
    app.fn('unlockActiveSession')();
    t.ok(!('lockedAt' in app.fn('activeSession')()), 'and so does the entry-screen unlock');
    const sig = app.fn('_sessionSig');
    const a = { id: 'x', items: [] }, b = { id: 'x', items: [], lockedAt: 'T', reportAt: 'R' };
    t.ok(sig(a) !== sig(b), 'the encoding signature covers both new fields (section 6 trap)');
  });

  /* ------------------------------------------------------------------ 37b */
  t.group('37b — the timings: defaults, garbage, storage, backup, setup (3A 4A 5A 8A)', () => {
    const app = boot();
    t.deepEq(app.state().reminders, { exportAfter: 'off', unlockedAt: 'off', backupDays: '7' }, 'defaults: two off, backups every 7 days');
    const n = app.fn('normaliseReminders');
    t.deepEq(n({ exportAfter: '4h', unlockedAt: '18', backupDays: '30' }), { exportAfter: '4h', unlockedAt: '18', backupDays: '30' }, 'good values kept');
    t.deepEq(n({ exportAfter: 'soon', unlockedAt: 25, backupDays: 7 }), { exportAfter: 'off', unlockedAt: 'off', backupDays: '7' }, 'odd values fall back per field (a number 7 is still 7)');
    t.deepEq(n('junk'), { exportAfter: 'off', unlockedAt: 'off', backupDays: '7' }, 'junk → defaults');
    const garbage = boot({ localStorage: { 'pat:reminders': '{not json' } });
    t.eq(garbage.state().reminders.backupDays, '7', 'unreadable storage → defaults');
    const stored = boot({ localStorage: { 'pat:reminders': JSON.stringify({ exportAfter: 'morning', unlockedAt: '17', backupDays: 'off' }) } });
    t.eq(stored.state().reminders.exportAfter, 'morning', 'a saved choice loads');
    app.fn('setReminder')('exportAfter', '1h');
    t.eq(JSON.parse(app.storage.getItem('pat:reminders')).exportAfter, '1h', 'a change is saved');
    const b = app.fn('buildBackup')();
    t.eq(b.reminders.exportAfter, '1h', 'backups carry it');
    t.includes(src('backup.js'), "if (data.reminders && typeof data.reminders === 'object' && !Array.isArray(data.reminders)) {", 'restore takes an object only');
    t.includes(src('setup.js'), 'state.reminders = normaliseReminders(pr.reminders);   // V100', 'setup exports carry it, normalised');
    t.ok(!/state\.reminders|REMINDERS_KEY|normaliseReminders/.test(src('sync.js')), 'never in a synced row (8A)');
    app.fn('quietReminder')('exp');
    t.ok(!/reminderQuiet/.test(JSON.stringify(app.fn('buildBackup')())), 'the × day is a nag timer — not in backups');
  });

  /* ------------------------------------------------------------------ 37c */
  t.group('37c — not exported: timing, and what counts as done (2B, 3A)', () => {
    const app = boot();
    const sess = lockedJob(app);
    const due = app.fn('isExportReminderJob');
    t.notOk(due(sess), 'off by default: never');
    app.fn('setReminder')('exportAfter', '1h');
    t.notOk(due(sess), 'just locked: not yet');
    sess.lockedAt = ago(2 * HOUR);
    t.ok(due(sess), 'an hour on: due');
    app.fn('setReminder')('exportAfter', '4h');
    t.notOk(due(sess), '4 hours: not yet at 2');
    t.ok(due(sess, Date.now() + 3 * HOUR), '… due once 4 hours have passed');
    app.fn('setReminder')('exportAfter', 'morning');
    const at = app.fn('exportReminderDueAt');
    const lockMs = new Date(2026, 9, 5, 15, 30).getTime();
    t.eq(at(lockMs, 'morning'), new Date(2026, 9, 6, 8, 0).getTime(), 'next morning = 8am the day after the lock');
    t.eq(at(new Date(2026, 9, 31, 23, 0).getTime(), 'morning'), new Date(2026, 10, 1, 8, 0).getTime(), '… across a month end');
    app.fn('setReminder')('exportAfter', '1h');
    sess.reportAt = new Date(Date.parse(sess.lockedAt) + 1000).toISOString();
    t.notOk(due(sess), 'a certificate made after locking clears it (2B)');
    sess.reportAt = new Date(Date.parse(sess.lockedAt) - 1000).toISOString();
    t.ok(due(sess), 'a certificate made BEFORE locking does not');
    delete sess.reportAt;
    app.fn('markSessionExported')(sess);
    t.notOk(due(sess), 'a clean CSV export clears it');
    sess.exportDirty = true;
    t.ok(due(sess), 'a CSV export changed since does not');
    sess.exportDirty = false; delete sess.exportedAt;
    delete sess.lockedAt;
    t.notOk(due(sess), 'locked with no lock time (before V100): never (1A)');
    sess.lockedAt = ago(2 * HOUR); sess.locked = false;
    t.notOk(due(sess), 'a lock time left on an UNLOCKED job (a V99 phone) is ignored');
    sess.locked = true; sess.isExample = true;
    t.notOk(due(sess), 'the example job never');
  });

  /* ------------------------------------------------------------------ 37d */
  t.group('37d — the Jobs-screen banner: Review filters, × hides for the day (6A)', () => {
    const app = boot();
    const sess = lockedJob(app, 'ZZDUEJOB');
    withSession(app, { site: 'ZZOTHERJOB' });
    withItem(app, { assetNo: 'ZZR2', result: 'pass', notes: '' });
    app.fn('setReminder')('exportAfter', '1h');
    sess.lockedAt = ago(2 * HOUR);
    app.fn('setView')('sessions');
    t.includes(app.html(), 'reminder-export', 'the banner shows');
    t.includes(app.html(), '1 locked job has no certificate or CSV export yet.', 'counting the job');
    t.includes(app.html(), 'value="remindexport"', 'and the Status filter offers it');
    tap(app, 'remind-export-review');
    t.eq(app.state().sessionFilter, 'remindexport', 'Review filters the list');
    t.ok(app.fn('sessionMatchesControlFilters')(sess), '… to the due job');
    const other = app.state().sessions.find(s => s.site && s.site.includes('ZZOTHERJOB'));
    t.notOk(app.fn('sessionMatchesControlFilters')(other), '… and not the other');
    const reloaded = boot({ localStorage: app.storage._snapshot() });
    t.ok(reloaded.state().sessionFilter !== 'remindexport', 'a reload goes back to a saved filter, never this one');
    tap(app, 'remind-export-dismiss');
    t.excludes(app.html(), 'reminder-export', '× hides it');
    const q = JSON.parse(app.storage.getItem('pat:reminderQuiet'));
    t.eq(q.exp, app.fn('reminderLocalDay')(), '… for the rest of the phone\u2019s own day');
    t.eq(app.fn('exportReminderDue')(Date.now() + 24 * HOUR).length, 1, 'and it is back tomorrow');
    app.fn('setReminder')('exportAfter', 'off');
    t.eq(app.state().sessionFilter, 'all', 'switching it off leaves its filter');
  });

  /* ------------------------------------------------------------------ 37e */
  t.group('37e — jobs still unlocked: from the chosen hour, every unlocked job (4A)', () => {
    const app = boot();
    withSession(app, { site: 'ZZOPEN1' });
    withItem(app, { assetNo: 'ZZU1', result: 'pass', notes: '' });
    lockedJob(app, 'ZZSHUT');
    const fn = app.fn('unlockedReminderDue');
    const at = (h) => new Date(2026, 9, 5, h, 10).getTime();
    t.eq(fn(at(19)).length, 0, 'off by default');
    app.fn('setReminder')('unlockedAt', '18');
    t.eq(fn(at(17)).length, 0, 'before the hour: nothing');
    t.eq(fn(at(18)).length, 1, 'from the hour: the unlocked job, not the locked one');
    app.fn('quietReminder')('unl');
    const today = app.fn('reminderLocalDay')();
    t.eq(fn(new Date(today + 'T23:00:00').getTime()).length, 0, '× → quiet for the rest of today');
    // The banner itself, at an hour that has always passed by the time tests run.
    app.fn('setReminder')('unlockedAt', '16');
    app.storage.removeItem('pat:reminderQuiet');
    const due = fn().length;
    app.fn('setView')('sessions');
    if (due) {
      t.includes(app.html(), 'reminder-unlocked', 'after 4pm: the banner shows');
      tap(app, 'remind-unlocked-review');
      t.eq(app.state().lockFilter, 'unlocked', 'Review → the Unlocked filter');
    } else {
      t.excludes(app.html(), 'reminder-unlocked', 'before 4pm: no banner');
      tap(app, 'remind-unlocked-review');
      t.eq(app.state().lockFilter, 'unlocked', 'Review → the Unlocked filter');
    }
  });

  /* ------------------------------------------------------------------ 37f */
  t.group('37f — the backup reminder interval (5A)', () => {
    const app = boot();
    withSession(app, { site: 'ZZBK' });
    app.fn('setView')('sessions');
    const show = app.fn('shouldShowBackupReminder');
    app.state().lastBackupAt = ago(5 * 24 * HOUR);
    t.notOk(show(), '7 days (default): not at 5');
    app.fn('setReminder')('backupDays', '3');
    t.ok(show(), '3 days: shows at 5');
    app.fn('setReminder')('backupDays', 'off');
    t.notOk(show(), 'off: never');
    app.state().lastBackupAt = null;
    t.notOk(show(), 'off: not even when never backed up');
    app.fn('setReminder')('backupDays', '7');
    t.ok(show(), '7: never backed up still reminds, as before');
  });

  /* ------------------------------------------------------------------ 37g */
  t.group('37g — a certificate that leaves the phone stamps the job (2B)', () => {
    const app = boot();
    const sess = lockedJob(app);
    withSession(app, { site: 'ZZSECOND' });   // the locked job is no longer the open one
    const cached = app.fn('serialiseSessions')(app.state().sessions);
    t.ok(!/reportAt/.test(cached), 'no certificate yet');
    app.fn('noteReportMade')(sess.id);
    const s2 = app.state().sessions.find(s => s.id === sess.id);
    t.ok(typeof s2.reportAt === 'string', 'reportAt stamped by id');
    t.includes(app.fn('serialiseSessions')(app.state().sessions), s2.reportAt, 'and it reaches storage on a job that is not open');
    const rp = src('report.js');
    t.includes(rp, "if (await shareOrDownloadReport(blob, currentFilename())) made();", 'Share stamps only when shared');
    t.includes(rp, "return false;   // V100: not shared", 'a cancelled share is not shared');
    t.ok(/triggerDownload\(blob, currentFilename\(\)\);\n\s*made\(\);/.test(rp), 'Download stamps');
    t.excludes(rp.slice(rp.indexOf('async function produceReport'), rp.indexOf('function _reportCloudPhotoChoice')), 'noteReportMade', 'opening the preview alone does not');
    t.includes(src('sync.js'), 'lockedAt: 1, reportAt: 1', 'the comparison sheet does not list the times as unexplained differences');
  });

  /* ------------------------------------------------------------------ 37h */
  t.group('37h — the Reminders page in Phone & Display (7A)', () => {
    const app = boot();
    const cat = app.val('SETTINGS_CATEGORIES').find(c => c.id === 'catApp');
    t.ok(cat.pages.includes('settingsReminders'), 'in Phone & Display');
    app.fn('setView')('settingsReminders');
    const h = app.html();
    t.includes(h, 'data-change-action="remind-export"', 'not-exported choice');
    t.includes(h, 'data-change-action="remind-unlocked"', 'unlocked choice');
    t.includes(h, 'data-change-action="remind-backup"', 'backup choice');
    t.includes(h, 'data-arg="settingsRetest"', 'and the way to Retest Reminders');
    pick(app, 'remind-export', 'morning');
    t.eq(app.state().reminders.exportAfter, 'morning', 'a pick through #app sets it');
    pick(app, 'remind-unlocked', '19');
    pick(app, 'remind-backup', '14');
    t.eq(app.fn('settingsPageSubtitle')('settingsReminders'), 'Not exported · Unlocked jobs · Backups every 14 days', 'the row says what is on');
    t.includes(app.html(), '<option value="morning" selected>', 'the page shows the choice');
    t.eq(app.val('SETTINGS_PAGE_META').settingsDisplay.title, 'Theme & Sound', 'the display row is retitled');
    t.includes(app.val('SETTINGS_PAGE_META').settingsDisplay.aliases, 'phone and display', '… and its old name still searches');
  });

  /* ------------------------------------------------------------------ 37i */
  // V101: the welcome rolled on and no longer opens with the 100 moment — it
  // lives on as About's replay, which is what stays tested here (sparks once,
  // through the replay sheet instead of the welcome).
  t.group('37i — the 100 moment: replay, sparks once (9A); the welcome moved on (V101)', () => {
    t.ok(boot().val('WELCOME_VERSION') !== 'V100', 'the welcome has rolled past V100');
    const app = boot({ localStorage: { 'pat:onboarded': '1' } });
    app.state().onboardedV33Seen = true;
    app.state().welcomeSeen = false;
    app.fn('render')();
    t.excludes(app.html(), 'One hundred versions of PATGo', 'the newer welcome no longer opens with the 100 moment');
    app.state().welcomeSeen = true;
    app.fn('setView')('settingsAbout');
    tap(app, 'party-open');
    t.includes(app.html(), 'One hundred versions of PATGo', 'the replay shows the 100 moment');
    t.ok(app.state().partySparked, 'its sparks are fired once');
    app.fn('render')();
    t.excludes(app.html(), 'id="party-sparks"', 'a repaint does not bring them back');
    tap(app, 'party-close');
    app.fn('setView')('settingsAbout');
    t.includes(app.html(), 'data-action="party-open"', 'About has the replay button');
    tap(app, 'party-open');
    t.ok(app.state().partyOpen, 'it opens the moment');
    t.includes(app.html(), 'party-sheet', '… as a sheet');
    tap(app, 'party-close');
    t.notOk(app.state().partyOpen, 'Close closes');
    tap(app, 'party-open');
    app.fn('setView')('sessions');
    t.notOk(app.state().partyOpen, 'leaving the screen closes it');
  });

  /* ------------------------------------------------------------------ 37j */
  await t.group('37j — seven taps: PATGo tests itself (10A), and writes nothing (11A)', async () => {
    const app = boot();
    withSession(app, { site: 'ZZEGG', engineer: 'ZZEGGMAN' });
    withItem(app, { assetNo: 'ZZE1', result: 'pass', notes: '' });
    withItem(app, { assetNo: 'ZZE2', result: 'fail', notes: '' });
    app.state().engineer = 'ZZEGGMAN';
    app.fn('setView')('settingsAbout');
    t.includes(app.html(), 'data-action="about-title-tap"', 'the title takes taps');
    const snap = JSON.stringify(app.storage._snapshot());
    for (let i = 0; i < 6; i++) tap(app, 'about-title-tap');
    t.eq(app.state().egg, null, 'six taps: nothing yet');
    const toasts = app.doc.body.children.filter(c => c.classList && c.classList.contains('toast'));
    t.ok(toasts.length && /1 more/.test(toasts[toasts.length - 1].textContent), 'counting down quietly');
    app.state().eggTaps.at -= 5000;
    tap(app, 'about-title-tap');
    t.eq(app.state().egg, null, 'a slow tap starts the count again');
    for (let i = 0; i < 6; i++) tap(app, 'about-title-tap');
    t.ok(app.state().egg && app.state().egg.step === 0, 'seven quick taps open it');
    t.includes(app.html(), 'PATGo ' + app.val('APP_VERSION') + ' self-test', 'the self-test sheet');
    t.includes(app.html(), 'class="egg-row is-testing" id="egg-row-0"', 'the first reading is being taken');
    await tick(800);
    t.eq(app.state().egg.step, 1, 'and the test moves on by itself');
    const row0 = app.doc.getElementById('egg-row-0');
    t.ok(row0 && /is-done/.test(row0.className), '… painted in place');
    app.state().egg.step = app.run('EGG_FINAL');
    app.fn('render')();
    t.includes(app.html(), 'egg-sticker is-on', 'the PASS sticker');
    t.includes(app.html(), 'egg-sheet is-flipped', 'then the certificate');
    t.includes(app.html(), 'ZZEGGMAN', 'naming the engineer');
    t.includes(app.html(), '<div class="egg-cert-big">2</div>', 'with the items tested');
    t.includes(app.html(), '1 (50.0%)', 'and the fails');
    tap(app, 'egg-close');
    t.eq(app.state().egg, null, 'Close closes');
    await tick(800);
    t.eq(app.state().egg, null, 'and the timer does not bring it back');
    t.eq(JSON.stringify(app.storage._snapshot()), snap, 'nothing was written to storage (11A)');
    app.sandbox.window.matchMedia = () => ({ matches: true });
    app.sandbox.matchMedia = app.sandbox.window.matchMedia;
    tap(app, 'egg-again');
    t.eq(app.state().egg.step, app.run('EGG_FINAL'), 'Reduce Motion: straight to the result');
    app.fn('setView')('sessions');
    t.eq(app.state().egg, null, 'leaving the screen closes it');
    t.ok(!/egg|party/i.test(src('render-settings.js').slice(0, 2000)), 'no Settings switch (11A)');
  });
};
