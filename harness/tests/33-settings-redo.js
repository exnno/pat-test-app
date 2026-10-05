/* Standing test — the Settings redo (V96, roadmap Stage 7)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked: 1A structure only (groups, order, names, which
   page lives where — nothing inside a page changes); 3A grouped by what the
   engineer is doing; 4A Account & Sync at the top once unlocked, last while
   locked; 5A Fail Reasons / Descriptions / Engineer & Tester, old names still
   searchable. Claude's calls: a one-page group opens its page from the hub;
   Manage photos and Jobs on this phone get rows in Data; Back from either goes
   where it was opened from; the hub footer stops saying "this device only"
   while syncing.

   ⚠ TAPS GO THROUGH #app (V67 lesson), as in 22. */

'use strict';

const t = require('../assert');
const { bootApp } = require('../load');

const KEY = 'pat:cloudUnlocked';

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

function openHub(app) {
  tap(app, 'open-settings');
  return app.html();
}

// Order in which group ids appear in the hub markup.
function hubOrder(html) {
  const out = [];
  const re = /data-action="settings-category" data-arg="(cat[A-Za-z]+)"/g;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

function search(app, q) {
  app.state().settingsSearchQuery = q;
  const html = app.fn('renderSettingsHubBodyHTML')();
  app.state().settingsSearchQuery = '';
  return html;
}

module.exports = function () {

  /* ------------------------------------------------------------------ 33a */
  t.group('33a — Account & Sync: last while locked, first once unlocked (4A)', () => {
    const locked = boot();
    const lo = hubOrder(openHub(locked));
    t.eq(lo[lo.length - 1], 'catCloud', 'locked: the cloud group is the last row');
    t.eq(lo[0], 'catUser', 'locked: the hub starts with Engineer & Tester');
    t.includes(locked.html(), 'Invite-only test', 'locked: the row still says it is an invite-only test');

    const open = boot({ localStorage: { [KEY]: '1' } });
    const uo = hubOrder(openHub(open));
    t.eq(uo[0], 'catCloud', 'unlocked: the cloud group is the first row');
    t.eq(uo.length, lo.length, 'same groups either way, only the order moves');
    t.includes(open.html(), 'Account &amp; Sync', 'the group is called Account & Sync');
    t.excludes(open.html(), 'Invite-only test', 'unlocked: the ordinary blurb');

    const none = boot({ skip: ['cloud.js'] });
    t.excludes(openHub(none), 'data-arg="catCloud"', 'no cloud group at all without cloud.js (control)');
  });

  /* ------------------------------------------------------------------ 33b */
  t.group('33b — every page lives in exactly one group, and in the agreed one (3A)', () => {
    const app = boot();
    const cats = app.val('SETTINGS_CATEGORIES');
    const meta = app.val('SETTINGS_PAGE_META');
    const where = {};
    let dupes = 0;
    cats.forEach(c => c.pages.forEach(p => { if (where[p]) dupes++; where[p] = c.id; }));
    t.eq(dupes, 0, 'no page sits in two groups');
    const orphans = Object.keys(meta).filter(p => !where[p]);
    t.eq(orphans.join(','), '', 'no page is missing from the hub');
    const missingMeta = Object.keys(where).filter(p => !meta[p]);
    t.eq(missingMeta.join(','), '', 'every listed page has a title');

    t.eq(where.settingsCalculator, 'catTesting', 'the calculator sits with the testing tools');
    t.eq(where.settingsClients, 'catClients', 'Clients has its own group');
    t.eq(where.settingsRetest, 'catClients', '… with Retest Reminders');
    t.eq(where.settingsReport, 'catReports', 'Report settings under Reports & Exports');
    t.eq(where.settingsCsv, 'catReports', 'CSV under Reports & Exports');
    t.eq(where.photoManager, 'catData', 'Manage photos has a row in Data');
    t.eq(where.jobManager, 'catData', 'Jobs on this phone has a row in Data');
    t.eq(where.settingsDisplay, 'catApp', 'Display alone in Phone & Display');
  });

  /* ------------------------------------------------------------------ 33c */
  t.group('33c — new names on rows and pages; old names still found (5A)', () => {
    const app = boot();
    openHub(app);
    tap(app, 'settings-category', 'catTesting');
    const list = app.html();
    t.includes(list, 'Fail Reasons', 'row: Fail Reasons');
    t.includes(list, 'Descriptions', 'row: Descriptions');
    t.excludes(list, 'Quick Pick Fail', 'the old name is gone from the list');
    t.includes(list, 'data-page="settingsCalculator"', 'calculator row is in Logging');

    tap(app, 'settings-page', 'settingsFails');
    t.includes(app.html(), '<div class="site-name">Fail Reasons</div>', 'page header: Fail Reasons');
    tap(app, 'back-to-settings');
    tap(app, 'settings-page', 'settingsDescriptions');
    t.includes(app.html(), '<div class="site-name">Descriptions</div>', 'page header: Descriptions');

    t.includes(search(app, 'quick pick fail'), 'data-page="settingsFails"', 'search: "quick pick fail" finds Fail Reasons');
    t.includes(search(app, 'item description list'), 'data-page="settingsDescriptions"', 'search: the old description page name');
    t.includes(search(app, 'user settings'), 'data-page="settingsUser"', 'search: "user settings" finds Engineer & Tester');
    t.includes(search(app, 'display settings'), 'data-page="settingsDisplay"', 'search: "display settings"');
    t.includes(search(app, 'manage photos'), 'data-page="photoManager"', 'search: Manage photos is a page now');
  });

  /* ------------------------------------------------------------------ 33d */
  t.group('33d — a one-page group opens its page; Back returns to the hub', () => {
    const app = boot();
    openHub(app);
    tap(app, 'settings-category', 'catUser');
    t.eq(app.state().view, 'settingsUser', 'Engineer & Tester opens the page straight away');
    t.includes(app.html(), '<div class="site-name">Engineer &amp; Tester</div>', 'page header: Engineer & Tester');
    tap(app, 'back-to-settings');
    t.eq(app.state().view, 'settings', 'Back goes to the hub, where the user was');

    // V100 (7A): Phone & Display gained Reminders, so it is a list now.
    tap(app, 'settings-category', 'catApp');
    t.eq(app.state().view, 'settingsCategory', 'Phone & Display (two pages since V100) shows its list');
    tap(app, 'back-to-settings');
    t.eq(app.state().view, 'settings', '… and Back to the hub');

    tap(app, 'settings-category', 'catReports');
    t.eq(app.state().view, 'settingsCategory', 'a two-page group shows its list (control)');
    t.eq(app.state().settingsCategory, 'catReports', '… the right one');
    tap(app, 'settings-page', 'settingsCsv');
    tap(app, 'back-to-settings');
    t.eq(app.state().view, 'settingsCategory', 'Back from a listed page returns to its group');
  });

  /* ------------------------------------------------------------------ 33e */
  t.group('33e — Data rows: Manage photos always, Jobs on this phone only while syncing', () => {
    const app = boot();
    openHub(app);
    tap(app, 'settings-category', 'catData');
    const out = app.html();
    t.includes(out, 'data-action="pm-open" data-arg="photoManager"', 'Manage photos row opens through pm-open');
    t.excludes(out, 'data-page="jobManager"', 'signed out: no Jobs on this phone row');
    t.excludes(search(app, 'tidy'), 'data-page="jobManager"', 'signed out: not in search either');

    app.run('syncActive = function () { return true; };');
    app.fn('render')();
    t.includes(app.html(), 'data-action="jm-open" data-arg="jobManager"', 'syncing: the row appears, opening through jm-open');
  });

  /* ------------------------------------------------------------------ 33f */
  t.group('33f — Back from Manage photos goes where it was opened from', () => {
    const app = boot();
    openHub(app);
    tap(app, 'settings-category', 'catData');
    tap(app, 'pm-open');
    t.eq(app.state().view, 'photoManager', 'the row opened the manager');
    t.includes(app.html(), '<div class="site-name">Manage Photos</div>', 'header in the same case as the row');
    tap(app, 'pm-back');
    t.eq(app.state().view, 'settingsCategory', 'opened from Data: Back to Data');
    t.eq(app.state().settingsCategory, 'catData', '… the Data group specifically');

    tap(app, 'settings-page', 'settingsBackup');
    tap(app, 'pm-open');
    tap(app, 'pm-back');
    t.eq(app.state().view, 'settingsBackup', 'opened from the Backup page: Back to Backup (as before)');

    tap(app, 'open-settings');
    tap(app, 'pm-open');
    tap(app, 'pm-back');
    t.eq(app.state().view, 'settings', 'opened from the hub search: Back to the hub');
  });

  /* ------------------------------------------------------------------ 33g */
  t.group('33g — the hub footer says where the data is', () => {
    const app = boot();
    t.includes(openHub(app), 'Saved on this phone only', 'signed out: this phone only');
    t.excludes(app.html(), 'Data stored on this device only', 'the old wording is gone');
    app.run('syncActive = function () { return true; };');
    t.includes(openHub(app), 'Saved on this phone and in your cloud account', 'syncing: phone and cloud');
  });
};
