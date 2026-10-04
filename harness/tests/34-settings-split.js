/* Standing test — the Settings redo part 2 (V97, roadmap Stage 7)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked: 1A Backup & Restore keeps COPIES (backup,
   restore, photo files, the apostrophe undo); a new page keeps SPACE (protection,
   the meter, clearing old jobs, the ages, Manage Photos, clearing photos);
   2A it is called Phone Storage; 3A a new Logging page, Logging Options, holds
   Undo and item times (item times sync in settings_work, so they never belonged
   under "this phone"); 4A About says where the data is, by sign-in; 5A the moved
   copy says jobs, not sessions. Claude's calls: the storage banner and the "not
   saved" sheet land on Phone Storage; managers return there; a Setup import
   returns to the Setup page; the new views join the sync open-screen lists.

   ⚠ TAPS AND CHANGES GO THROUGH #app (V67 lesson), as in 22 and 33. */

'use strict';

const t = require('../assert');
const { bootApp } = require('../load');
const { confirmSheet, tick } = require('../fixture');

function boot(opts = {}) {
  const app = bootApp(opts);
  app.state = () => app.refresh('state').state;
  app.html = () => app.doc.getElementById('app').innerHTML;
  return app;
}

function tap(app, action, arg) {
  const el = app.doc.createElement('button');
  el.dataset.action = action;
  if (arg !== undefined) el.dataset.arg = String(arg);
  app.doc.getElementById('app').dispatchEvent({
    type: 'click', target: el, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
  });
}

function toggle(app, action, checked) {
  const el = app.doc.createElement('input');
  el.type = 'checkbox';
  el.dataset.changeAction = action;
  el.checked = checked;
  app.doc.getElementById('app').dispatchEvent({ type: 'change', target: el, preventDefault() {}, stopPropagation() {} });
}

function view(app, v) {
  app.fn('setView')(v);
  return app.html();
}

function search(app, q) {
  app.state().settingsSearchQuery = q;
  const html = app.fn('renderSettingsHubBodyHTML')();
  app.state().settingsSearchQuery = '';
  return html;
}

module.exports = async function () {

  /* ------------------------------------------------------------------ 34a */
  t.group('34a — Backup & Restore keeps copies; Phone Storage keeps space (1A)', () => {
    const app = boot();
    const bk = view(app, 'settingsBackup');
    t.includes(bk, 'data-action="backup-export"', 'Backup: export backup');
    t.includes(bk, 'data-action="backup-import"', 'Backup: restore');
    t.includes(bk, 'data-action="photo-import"', 'Backup: the photo files');
    t.excludes(bk, 'id="storage-protect"', 'Backup: no protection line');
    t.excludes(bk, 'prune-age-input', 'Backup: no clear-old age');
    t.excludes(bk, 'storage-bar', 'Backup: no meter');
    t.excludes(bk, 'data-action="pm-open"', 'Backup: no Manage Photos button');

    const st = view(app, 'settingsStorage');
    t.includes(st, '<div class="site-name">Phone Storage</div>', 'the page is called Phone Storage (2A)');
    t.includes(st, 'id="storage-protect"', 'Storage: keep this app\u2019s data');
    t.includes(st, 'storage-bar', 'Storage: the meter');
    t.includes(st, 'prune-age-input', 'Storage: the clear-old age');
    t.includes(st, 'data-action="pm-open"', 'Storage: Manage Photos');
    t.excludes(st, 'data-action="backup-export"', 'Storage: no backup export');
    t.excludes(st, 'data-action="backup-import"', 'Storage: no restore');
  });

  /* ------------------------------------------------------------------ 34b */
  t.group('34b — Data lists Phone Storage after Backup & Restore; its row and search', () => {
    const app = boot();
    const cats = app.val('SETTINGS_CATEGORIES');
    const data = cats.find(c => c.id === 'catData');
    t.eq(data.pages.indexOf('settingsStorage'), data.pages.indexOf('settingsBackup') + 1, 'straight after Backup & Restore');
    tap(app, 'open-settings');
    tap(app, 'settings-category', 'catData');
    const list = app.html();
    t.includes(list, 'data-page="settingsStorage"', 'a row in Data');
    t.ok(/\d+% full/.test(list), 'the row says how full this phone is');
    tap(app, 'settings-page', 'settingsStorage');
    t.eq(app.state().view, 'settingsStorage', 'the row opens it');
    tap(app, 'back-to-settings');
    t.eq(app.state().view, 'settingsCategory', 'Back returns to Data');
    ['storage', 'clear old', 'protect'].forEach(q =>
      t.includes(search(app, q), 'data-page="settingsStorage"', `search "${q}" finds Phone Storage`));
  });

  /* ------------------------------------------------------------------ 34c */
  t.group('34c — Logging Options holds Undo and item times; Phone & Display does not (3A)', () => {
    const app = boot();
    const cats = app.val('SETTINGS_CATEGORIES');
    t.ok(cats.find(c => c.id === 'catTesting').pages.includes('settingsLogging'), 'Logging Options is under Logging');
    const lo = view(app, 'settingsLogging');
    t.includes(lo, '<div class="site-name">Logging Options</div>', 'header');
    t.includes(lo, 'data-change-action="undo"', 'Show Undo is here');
    t.includes(lo, 'data-change-action="timestamps"', 'Record item times is here');
    const di = view(app, 'settingsDisplay');
    t.excludes(di, 'data-change-action="undo"', 'Phone & Display: no Undo');
    t.excludes(di, 'data-change-action="timestamps"', 'Phone & Display: no item times');
    t.includes(di, 'data-change-action="sound"', 'Phone & Display keeps sound (control)');

    view(app, 'settingsLogging');
    toggle(app, 'undo', true);
    t.ok(app.state().undoEnabled, 'the Undo switch works from its new page');
    t.ok(/id="undo-toggle"[^>]*checked/.test(app.html()), 'and the page repaints with it on');
    toggle(app, 'timestamps', true);
    t.ok(app.state().timestampsEnabled, 'the item-times switch works from its new page');

    t.includes(search(app, 'undo'), 'data-page="settingsLogging"', 'search "undo" finds Logging Options');
    t.excludes(search(app, 'undo'), 'data-page="settingsDisplay"', '… not Phone & Display');
    t.includes(search(app, 'display settings'), 'data-page="settingsDisplay"', 'the old name still finds Phone & Display');
  });

  /* ------------------------------------------------------------------ 34d */
  t.group('34d — item times are held back while Logging Options is open, not Phone & Display', () => {
    const app = boot();
    const open = app.fn('_syncGeneralOpen');
    view(app, 'settingsLogging');
    t.ok(open('settings_work'), 'Logging Options open: the engineer row waits');
    view(app, 'settingsDisplay');
    t.notOk(open('settings_work'), 'Phone & Display open: nothing of it is synced any more');
    t.ok(app.run("SYNC_NO_REPAINT_VIEWS.indexOf('settingsLogging') !== -1"), 'no repaint over Logging Options');
    t.ok(app.run("SYNC_NO_REPAINT_VIEWS.indexOf('settingsStorage') !== -1"), 'no repaint over Phone Storage (typing in its age boxes)');
  });

  /* ------------------------------------------------------------------ 34e */
  t.group('34e — the ways in land on Phone Storage, and the managers come back to it', () => {
    const app = boot();
    tap(app, 'storage-banner-open');
    t.eq(app.state().view, 'settingsStorage', 'the Jobs-screen storage banner');
    view(app, 'sessions');
    tap(app, 'save-fail-clear');
    t.eq(app.state().view, 'settingsStorage', 'the "not saved" sheet\u2019s Clear old jobs');

    view(app, 'settingsStorage');
    tap(app, 'pm-open');
    t.eq(app.state().view, 'photoManager', 'Manage Photos opens');
    tap(app, 'pm-back');
    t.eq(app.state().view, 'settingsStorage', 'Back returns to Phone Storage');

    view(app, 'reports');
    tap(app, 'pm-open');
    tap(app, 'pm-back');
    t.eq(app.state().view, 'settingsStorage', 'opened from anywhere else: Back falls back to Phone Storage');
  });

  /* ------------------------------------------------------------------ 34f */
  t.group('34f — About says where the data is (4A)', () => {
    const app = boot();
    const out = view(app, 'settingsAbout');
    t.includes(out, 'Your data stays on this phone. Nothing is uploaded', 'signed out: on this phone, nothing uploaded');
    app.run('syncActive = function () { return true; };');
    const inn = view(app, 'settingsAbout');
    t.includes(inn, 'a copy in your cloud account', 'signed in: a copy in the cloud');
    t.excludes(inn, 'Nothing is uploaded', '… and never "nothing is uploaded"');
  });

  /* ------------------------------------------------------------------ 34g */
  await t.group('34g — importing a setup returns to the Setup page, not Backup & Restore', async () => {
    const app = boot();
    const all = { presets: true, report: true, csv: true, tester: true, prefs: true };
    const bundle = JSON.stringify(app.fn('buildSetupBundle')('x', all));
    view(app, 'settingsSetup');
    const file = new app.sandbox.File([bundle], 'x setup.json', { type: 'application/json' });
    app.fn('importSetupFromFile')(file);
    await tick(5);
    t.ok(confirmSheet(app, 'yes'), 'the import asked first');
    t.eq(app.state().view, 'settingsSetup', 'and came back to the Setup page');
  });

  /* ------------------------------------------------------------------ 34h */
  t.group('34h — the moved copy says jobs (5A)', () => {
    const app = boot();
    const st = view(app, 'settingsStorage');
    t.includes(st, 'Clear old jobs after', 'the age heading');
    t.excludes(st, 'Clear-old-sessions age', 'the old heading is gone');
    t.includes(st, 'No exported jobs', 'signed out, nothing to clear: jobs');
  });
};
