/* Standing test — Settings → Cloud and its access code (V85)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked: 1A a "Cloud" group in Settings, below Help,
   on any copy with a cloud; opening it asks for an access code (1111). 2A once
   entered — or once an account has signed in on the phone — it stays open on
   that phone for good, signing out included. 3A the About long-press and the
   Cloud card on About are gone. 4A the unlocked group is an ordinary settings
   list: Account, Sync, Subscription, each with a live line underneath.

   ⚠ A CURTAIN, NOT A LOCK. The code is in public source. Nothing here is
   evidence of any protection — that is isolation-test.sql's job, and
   shouldCreateUser: false (15f). These tests prove only that the curtain is
   where it was asked to be, and that it never hides the pages from someone
   who has been let in.

   ⚠ TAPS GO THROUGH #app. The delegated click listener lives on the #app
   element (dispatch.js). Every tap here is an event dispatched on #app with a
   data-action button as its target, so a lost listener or a lost ACTIONS entry
   turns these red — calling cloudUnlock() directly would not (V67 lesson). */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');

const KEY = 'pat:cloudUnlocked';

function boot(opts = {}) {
  const app = bootApp(opts);
  app.state = () => app.refresh('state').state;
  app.html = () => app.doc.getElementById('app').innerHTML;
  return app;
}

// A tap exactly as the browser delivers it: a click on #app whose target is
// the button carrying data-action (and data-arg).
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
  app.fn('setView')('settings');
  app.fn('render')();
  return app.html();
}

function storedSession(email = 'peter@example.com') {
  return JSON.stringify({
    access_token: 'ZZACCESS', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'ZZREFRESH',
    user: { id: '11111111-1111-1111-1111-111111111111', email, aud: 'authenticated', role: 'authenticated' },
  });
}

function typeCode(app, value) {
  const el = app.doc.getElementById('cloud-access-code');
  if (el) el.value = value;
  return !!el;
}

module.exports = function run() {
  /* ------------------------------------------------------------------ 22a */
  t.group('22a — the Cloud group is in Settings below Help, only where there is a cloud', () => {
    const app = boot();
    const html = openHub(app);
    const help = html.indexOf('data-arg="catHelp"');
    const cloud = html.indexOf('data-arg="catCloud"');
    t.ok(help >= 0, 'Help group painted');
    t.ok(cloud >= 0, 'Cloud group painted on the test host');
    t.ok(cloud > help, 'Cloud sits below Help');

    const local = boot({ hostname: 'localhost' });
    t.excludes(openHub(local), 'data-arg="catCloud"', 'no Cloud group on a copy with no cloud');

    const none = boot({ skip: ['cloud.js'] });
    t.excludes(openHub(none), 'data-arg="catCloud"', 'no Cloud group without cloud.js');
    none.state().settingsCategory = 'catCloud';
    none.fn('setView')('settingsCategory');
    t.doesNotThrow(() => none.fn('render')(), 'a stale Cloud view renders without cloud.js');
  });

  /* ------------------------------------------------------------------ 22b */
  t.group('22b — locked: the code box, not the pages, and nothing in search', () => {
    const app = boot();
    openHub(app);
    tap(app, 'settings-category', 'catCloud');
    t.eq(app.state().view, 'settingsCategory', 'the tap on #app opened the group');
    const html = app.html();
    t.includes(html, 'id="cloud-access-code"', 'access-code box shown');
    t.excludes(html, 'data-page="cloudAccount"', 'Account row hidden while locked');
    t.excludes(html, 'data-page="cloudSync"', 'Sync row hidden while locked');

    app.state().settingsSearchQuery = 'subscription';
    t.excludes(app.fn('renderSettingsHubBodyHTML')(), 'data-page="cloudSubscription"',
      'cloud pages are not in settings search while locked');
    app.state().settingsSearchQuery = 'glossary';
    t.includes(app.fn('renderSettingsHubBodyHTML')(), 'data-page="settingsGlossary"',
      'search itself still works (control)');
    app.state().settingsSearchQuery = '';
  });

  /* ------------------------------------------------------------------ 22c */
  t.group('22c — the code: wrong stays locked, right opens it and is remembered', () => {
    const app = boot();
    app.state().settingsCategory = 'catCloud';
    app.fn('setView')('settingsCategory');
    app.fn('render')();

    typeCode(app, '1234');
    tap(app, 'cloud-unlock');
    t.includes(app.html(), app.run('escapeHTML')("That code isn't right."), 'wrong code: plain message');
    t.includes(app.html(), 'id="cloud-access-code"', 'still locked');
    t.eq(app.storage.getItem(KEY), null, 'nothing remembered for a wrong code');

    typeCode(app, '');
    tap(app, 'cloud-unlock');
    t.includes(app.html(), 'Enter the access code.', 'empty: asks for it');

    // Leaving and re-opening the group clears the old message.
    tap(app, 'back-to-settings');
    tap(app, 'settings-category', 'catCloud');
    t.excludes(app.html(), 'Enter the access code.', 'stale message cleared on re-opening');

    typeCode(app, ' 11 11 ');
    tap(app, 'cloud-unlock');
    const html = app.html();
    t.eq(app.storage.getItem(KEY), '1', 'right code remembered on this phone');
    t.excludes(html, 'id="cloud-access-code"', 'code box gone');
    for (const p of ['cloudAccount', 'cloudSync', 'cloudSubscription']) {
      t.includes(html, `data-page="${p}"`, `${p} row shown once unlocked`);
    }
  });

  /* ------------------------------------------------------------------ 22d */
  t.group('22d — unlocked stays unlocked: next launch, search, rows, Back', () => {
    const app = boot({ localStorage: { [KEY]: '1' } });
    openHub(app);
    tap(app, 'settings-category', 'catCloud');
    t.includes(app.html(), 'data-page="cloudAccount"', 'next launch: straight to the rows, no code');
    t.includes(app.html(), 'Not signed in', 'Account row says not signed in');
    t.includes(app.html(), 'Sign in first', 'Sync row says sign in first');
    t.includes(app.html(), 'Not built yet', 'Subscription row says not built yet');

    tap(app, 'settings-page', 'cloudAccount');
    t.eq(app.state().view, 'cloudAccount', 'row opens the Account page');
    t.includes(app.html(), 'id="cloud-account-page"', 'the real Account page painted');
    tap(app, 'back-to-settings');
    t.eq(app.state().view, 'settingsCategory', 'Back from Account returns to Cloud');
    t.eq(app.state().settingsCategory, 'catCloud', '… the Cloud group specifically');
    tap(app, 'back-to-settings');
    t.eq(app.state().view, 'settings', 'Back again returns to the hub');

    app.state().settingsSearchQuery = 'subscription';
    t.includes(app.fn('renderSettingsHubBodyHTML')(), 'data-page="cloudSubscription"',
      'cloud pages searchable once unlocked');
    app.state().settingsSearchQuery = '';
  });

  /* ------------------------------------------------------------------ 22e */
  t.group('22e — a signed-in phone never asks, and signing out keeps it open (2A)', () => {
    const app = boot({ localStorage: { 'patgo:cloudAuth:test': storedSession() } });
    t.eq(app.state().cloud.status, 'signed-in', 'boots signed in');
    t.eq(app.storage.getItem(KEY), '1', 'boot remembered the unlock for a signed-in phone');
    app.state().settingsCategory = 'catCloud';
    app.fn('setView')('settingsCategory');
    app.fn('render')();
    t.includes(app.html(), 'Signed in as peter@example.com', 'rows shown, Account row names the account');
    // Signing out (the state the sign-out leaves behind) does not close it.
    app.state().cloud.status = 'signed-out';
    app.fn('render')();
    t.excludes(app.html(), 'id="cloud-access-code"', 'still open after signing out');
  });

  /* ------------------------------------------------------------------ 22f */
  t.group('22f — a cloud page reached while locked paints the code box instead', () => {
    const app = boot();
    for (const v of ['cloudAccount', 'cloudSync', 'cloudSubscription']) {
      app.fn('setView')(v);
      app.fn('render')();
      t.includes(app.html(), 'id="cloud-access-code"', `${v} while locked → code box`);
      t.excludes(app.html(), 'id="cloud-account-page"', `${v} while locked → no Account page`);
      t.excludes(app.html(), 'id="cloud-sync-page"', `${v} while locked → no Sync page`);
    }
  });

  /* ------------------------------------------------------------------ 22g */
  t.group('22g — About: no Cloud card and no long-press any more (3A)', () => {
    const app = boot({ localStorage: { [KEY]: '1' } });
    app.fn('setView')('settingsAbout');
    app.fn('render')();
    t.includes(app.html(), 'id="about-title"', 'About painted (control)');
    t.excludes(app.html(), 'cloud-pages-menu', 'no Cloud card on About, even unlocked');
    const core = fs.readFileSync(path.join(APP_DIR, 'render-core.js'), 'utf8');
    t.excludes(core, 'setupLongPress(', 'render-core no longer wires a long-press');
    t.excludes(core, 'cloudPagesRevealed', 'the V43 reveal flag is gone');
    const actions = app.run('ACTIONS');
    t.eq(actions['open-cloud-page'], undefined, 'the V43 open-cloud-page action is gone');
  });

  /* ------------------------------------------------------------------ 22h */
  t.group('22h — the unlock never travels in a backup or a setup file', () => {
    const app = boot({ localStorage: { [KEY]: '1' } });
    app.fn('load')();
    const backup = JSON.stringify(app.fn('buildBackup')());
    t.excludes(backup, 'cloudUnlocked', 'not in a backup');
    t.excludes(backup, KEY, 'not in a backup (by key)');
    const all = { presets: true, fails: true, descriptions: true, csv: true, report: true,
      clients: true, instruments: true, readings: true, multipick: true };
    const setup = JSON.stringify(app.fn('buildSetupBundle')('x', all));
    t.excludes(setup, 'cloudUnlocked', 'not in a setup file');
  });
};
