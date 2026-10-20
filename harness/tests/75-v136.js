/* Standing test — V136: Tutorials, part 3 — your jobs & the cloud
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked (18 Oct, Peter — all defaults): 1A three
   tutorials — Your Jobs list, Jobs in the cloud, Syncing between phones;
   Export everything stays a step of Backup & Restore, with a fuller card.
   2A a second heading on the Tutorials page, "Your jobs & the cloud". 3A
   everyone sees them, signed in or not: the practice is a pretend signed-in
   phone. 4A sample jobs — three on the phone, five only in the cloud; nothing
   reaches the internet. 5A in the cloud: Show them, search, Select, tick,
   Bring onto this phone (the job then shows on the phone tab); Delete and
   Cloud Storage look-only. 6A Sync: Push now and Check for updates are taps
   (pretend counts), ending on one held job, look-only. 7A the Jobs list:
   tabs, search → asset history, the reminder banners, Import (look), ending
   on the cloud tab. 8A Finish + Next tutorial; Finish only on the last. 9A
   "Show me how ›" still deferred.

     75a  identical: every screen these tutorials show is the real render
          function's markup for the practice's data (with the practice's
          stand-ins for the phone's sync records).
     75b  nothing kept, nothing sent: each tutorial run start to finish on a
          phone with real work AND real sync records (a held job) leaves
          storage and data exactly as they were; nothing of the phone's shows
          in the practice; no real cloud or sync action runs; no live app
          action on any practice screen.
     75c  the stand-ins are scoped: swapped in only inside a cloud tutorial's
          draw, put back after every draw (even one that throws), never used
          by the practice job or the Settings tutorials.
     75d  the steps: order, counts, every target on its screen, the banners
          and the Cloud Storage link where their steps look for them, the
          result of every tap (history sheet, the cloud list, search, tick,
          bring → on the phone with its shield, Push → up to date, Check →
          a held job), Next tutorial jobs → cloud → sync, Finish only on Sync
          and still on Backup & Restore.
     75e  the Tutorials page's second heading and rows, search finds them, the
          box can frame a whole job card, Backup's fuller Export everything card.
     75f  release: V136 … — retired at V137; its lasting checks are 76f.

   How it LOOKS — the box on every target, the card clear of it, the sheet
   still, the banners — was checked in Chromium at 390×844 dark and 375×667
   light (Playwright, not committed). */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp, populated } = require('../fixture');

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const html = (app) => app.doc.getElementById('app').innerHTML;

const IDS = ['jobs', 'cloud', 'sync'];
const COUNTS = { jobs: 10, cloud: 11, sync: 9 };
const STUBS = ['cloudAvailable', 'cloudPagesUnlocked', 'syncStatusSummary', 'syncHeldList', 'syncJobsSafety', 'planBannerHTML'];

function stepKey(app) { return app.run('_tutSteps()[state.tourStep].key'); }
// Step on the way Skip and Next do (tourSkip / tourNext both run the step's
// own run — a look step's run tidies up after it), without the pause.
function stepOn(app) {
  app.run('(() => { const s = _tutSteps()[state.tourStep]; if (s.run) s.run(); _tutAdvance(); })()');
}
function stepTo(app, key) {
  for (let i = 0; i < 30 && app.run('state.tourOpen'); i++) {
    if (stepKey(app) === key) return true;
    stepOn(app);
  }
  return false;
}
function realOf(app) {
  return app.run(`JSON.stringify(Object.keys(state).filter(k => !['view', 'tourOpen', 'tourStep'].includes(k)).sort().reduce((o, k) => {
    o[k] = (k === 'photoMgr' || k === 'jobMgr') ? Object.assign({}, state[k], { gen: 0, thumbGen: 0 }) : state[k];
    return o;
  }, {}))`);
}
// Does the markup hold an element matching this simple selector? (as 74) A
// descendant selector is judged by its last part.
function inMarkup(markup, selector) {
  const sel = String(selector).trim().split(/\s+/).pop();
  const id = (sel.match(/#([\w-]+)/) || [])[1];
  const classes = [...sel.replace(/\[[^\]]*\]/g, '').matchAll(/\.([\w-]+)/g)].map(m => m[1]);
  const attrs = [...sel.matchAll(/\[([\w-]+)="([^"]*)"\]/g)].map(m => [m[1], m[2]]);
  for (const m of markup.matchAll(/<[a-z][^>]*>/gi)) {
    const tag = m[0];
    if (id && !new RegExp(`\\sid="${id}"`).test(tag)) continue;
    const cls = (tag.match(/\sclass="([^"]*)"/) || [, ''])[1].split(/\s+/);
    if (!classes.every(c => cls.includes(c))) continue;
    if (!attrs.every(([a, v]) => tag.includes(` ${a}="${v}"`))) continue;
    return true;
  }
  return false;
}
// A phone with real work, its own name, and real sync records: a job held
// for an answer and sent fingerprints — what the practice must never show.
function realPhone() {
  const app = populated();
  app.run(`state.engineer = 'ZZ Real Engineer'; save();
    localStorage.setItem(SYNC_HELD_KEY, JSON.stringify([{ id: 'zz-real-held', kind: 'session', at: '2026-01-01T00:00:00.000Z',
      reason: 'both-changed', name: 'ZZ Real Held Job', localItems: 3, cloudItems: 4 }]));
    localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({ userId: 'zz-real-user', sent: { 'zz-real-job': 'abc' }, lastPushAt: '2026-01-01T00:00:00.000Z' }));`);
  return app;
}

module.exports = async function () {

  /* ------------------------------------------------------------------ 75a */
  await t.group('75a — identical: the real Jobs list, cloud tab and Sync page (1A)', () => {
    const fns = { sessions: 'renderSessions', settings: 'renderSettingsHub', settingsCategory: 'renderSettingsCategory', cloudSync: 'renderCloudSync' };
    const seen = new Set();
    for (const id of IDS) {
      const app = populated();
      app.fn('openTutorial')(id, 'settingsTutorials');
      for (let i = 0; i < 30 && app.run('state.tourOpen'); i++) {
        const view = app.run('_tut.st.view');
        const key = stepKey(app);
        if (fns[view]) {
          const practice = app.run('_tutInert(_tutScreenHTML())');
          const tut = app.run('JSON.stringify({ id: _tut.id, st: _tut.st, sync: _tut.sync, held: _tut.held })');
          const other = freshApp();
          other.run(`_tut = ${tut}; Object.assign(globalThis, TUT_CLOUD_STUBS); Object.assign(state, _tut.st); state.tourOpen = false;`);
          const real = other.run(`_tutInert(${fns[view]}())`);
          t.eq(practice, real, `${id} ${key}: "${view}" is ${fns[view]}()'s own markup`);
          seen.add(view);
        }
        stepOn(app);
      }
    }
    t.deepEq(Object.keys(fns).filter(v => !seen.has(v)), [], 'every screen these tutorials use was compared');
    t.includes(read('tour.js'), 'cloudSync: () => renderCloudSync()', 'the Sync page comes from its own render function');
  });

  /* ------------------------------------------------------------------ 75b */
  await t.group('75b — nothing kept, nothing sent, nothing of this phone’s (3A, 4A)', () => {
    const real = ['save', 'jobsTabSet', 'cloudJobsLoad', 'cloudJobsBringSelected', 'cloudJobsDeleteSelected', 'cloudStoreOpen',
      'syncPush', 'syncPull', 'syncHeldResolve', 'syncHeldDiff', 'syncCloudList', 'openAssetHistory', 'downloadBackup'];
    for (const id of IDS) {
      const app = realPhone();
      app.fn('setView')('settingsTutorials');
      app.run(`globalThis.__v136 = {}; ${JSON.stringify(real)}.forEach((n) => { if (typeof globalThis[n] === 'function') { const f = globalThis[n]; globalThis[n] = function () { __v136[n] = (__v136[n] || 0) + 1; return f.apply(this, arguments); }; } });`);
      const watched = app.run(`${JSON.stringify(real)}.filter((n) => typeof globalThis[n] === 'function' && /__v136/.test(String(globalThis[n])))`);
      t.ok(watched.length >= 11, `${id}: the real cloud and sync handlers are watched (${watched.length})`);
      const storeBefore = JSON.stringify(app.storage._snapshot());
      const dataBefore = realOf(app);
      const refused = app.run('_tutRefused');
      const status = app.run('state.cloud.status');
      app.fn('openTutorial')(id, 'settingsTutorials');
      t.eq(app.run('_tut.st.cloud.status'), 'signed-in', `${id}: the practice is signed in (3A)`);
      t.eq(app.run('_tut.st.cloud.email'), 'alex@example.com', `${id}: …to a pretend account`);
      t.eq(app.run('_tut.st.sessions.map(s => s.id).join()'), 'tutorial-job-new,tutorial-job-office,tutorial-job-last-year', `${id}: …with the three sample jobs, none of this phone's (4A)`);
      t.notOk(/ZZ/.test(app.run('JSON.stringify(_tut.st)')), `${id}: nothing of this phone's is in the practice`);
      let n = 0;
      while (app.run('state.tourOpen') && n++ < 30) {
        const shown = html(app);
        t.notOk(/ZZ/.test(shown), `${id} ${stepKey(app)}: nothing of this phone's on screen — not its jobs, not its held job`);
        const acts = [...shown.matchAll(/\sdata-action="([^"]+)"/g)].map(m => m[1]).filter(a => !/^tut-/.test(a));
        if (acts.length) t.deepEq(acts, [], `${id} ${stepKey(app)}: no live app action on the practice screen`);
        stepOn(app);
      }
      t.notOk(app.run('state.tourOpen'), `${id}: ran to its end`);
      t.eq(app.run('state.view'), 'settingsTutorials', `${id}: Finish lands back on Tutorials`);
      t.eq(app.run('JSON.stringify(__v136)'), '{}', `${id}: no real cloud, sync or save handler ran`);
      t.eq(JSON.stringify(app.storage._snapshot()), storeBefore, `${id}: storage exactly as it was — sync records included`);
      t.eq(realOf(app), dataBefore, `${id}: every real value exactly as it was`);
      t.eq(app.run('_tutRefused'), refused, `${id}: nothing even tried to write`);
      t.eq(app.run('state.cloud.status'), status, `${id}: this phone's own cloud status untouched (${status})`);
      t.notEq(status, 'signed-in', `${id}: …which was never signed in`);
      t.notOk(/tutorial-|alex@example|Riverside|Hilltop/.test(JSON.stringify(app.storage._snapshot()) + app.run('JSON.stringify(state)')), `${id}: no practice value anywhere real`);
    }
  });

  /* ------------------------------------------------------------------ 75c */
  await t.group('75c — the stand-ins are scoped to the cloud tutorials’ draws', () => {
    const app = realPhone();
    // A copy of the app with no cloud at all (the free site): the practice
    // must still have one — so a missing stand-in shows.
    app.run('globalThis.cloudAvailable = () => false;');
    app.run(`globalThis.__v136real = {}; ${JSON.stringify(STUBS)}.forEach((n) => { __v136real[n] = globalThis[n]; });`);
    const same = () => app.run(`${JSON.stringify(STUBS)}.filter((n) => globalThis[n] !== __v136real[n])`);
    t.eq(app.run('typeof __v136real.syncStatusSummary'), 'function', 'the real sync summary is there to be protected');
    t.notOk(app.run('cloudAvailable()'), 'this test phone has no cloud (so a missing stand-in shows)');
    for (const id of IDS) {
      app.fn('openTutorial')(id, 'settingsTutorials');
      t.ok(app.run('_tutDraw(() => cloudAvailable() && cloudPagesUnlocked())'), `${id}: inside a draw, the practice has a cloud and its pages are open`);
      t.ok(app.run('_tutDraw(() => syncActive())'), `${id}: …and is signed in`);
      t.eq(app.run('_tutDraw(() => syncHeldList().length)'), 0, `${id}: …with no held jobs — not this phone's`);
      t.eq(app.run('_tutDraw(() => syncStatusSummary().total)'), 3, `${id}: …counting its own three jobs`);
      t.deepEq(same(), [], `${id}: after the draw, every real function is back`);
      t.notOk(app.run('cloudAvailable()'), `${id}: …so outside it, this phone is as it was`);
      t.eq(app.run('syncHeldList().length'), 1, `${id}: …and its own held job is still there`);
      // A draw that throws still puts them back (as 72c for state).
      app.run('try { _tutDraw(() => { throw new Error("boom"); }); } catch (e) {}');
      t.deepEq(same(), [], `${id}: a draw that throws still puts every real function back`);
      app.fn('closeTour')();
    }
    for (const id of ['practice', 'engineer', 'backup']) {
      app.fn('openTutorial')(id, 'settingsTutorials');
      t.eq(app.run('_tutStubs()'), null, `${id}: no stand-ins`);
      t.notOk(app.run('_tutDraw(() => cloudAvailable())'), `${id}: …the phone's own answers, as before`);
      app.fn('closeTour')();
    }
    t.deepEq(same(), [], 'after all of it, every real function is the real one');
  });

  /* ------------------------------------------------------------------ 75d */
  await t.group('75d — the steps, the results, Next tutorial (5A, 6A, 7A, 8A)', () => {
    const app = populated();
    t.deepEq(app.run('TUTORIALS.map(d => d.id)'), ['practice', 'engineer', 'branding', 'content', 'items', 'backup'].concat(IDS),
      'the practice job, the five Settings ones, then the three');
    for (const id of IDS) {
      app.fn('openTutorial')(id, 'settingsTutorials');
      const steps = app.run('_tutSteps().map(s => ({ key: s.key, target: s.target, go: !!s.go, run: typeof s.run === "function", when: !!s.when }))');
      t.eq(steps.length, COUNTS[id], `${id}: ${COUNTS[id]} steps`);
      t.eq(steps[steps.length - 1].key, 'done', `${id}: ends on Done`);
      t.eq(steps[steps.length - 1].target, '', `${id}: …with no box`);
      t.ok(steps.filter(s => s.go).every(s => s.run), `${id}: every do-step has its tap`);
      const missing = [];
      for (let i = 0; i < 30 && app.run('state.tourOpen'); i++) {
        const s = app.run('(() => { const s = _tutSteps()[state.tourStep]; return { key: s.key, target: s.target, when: !!s.when }; })()');
        const shown = html(app);
        if (s.target && !s.when && !inMarkup(shown, s.target)) missing.push(s.key + ' ' + s.target);
        t.includes(shown, `Step ${app.run('state.tourStep') + 1} of ${COUNTS[id]}`, `${id} ${s.key}: says which step`);
        if (s.key === 'done') {
          const last = id === 'sync';
          t.includes(shown, last ? '<button class="btn-primary tut-go" data-action="tut-quit">Finish</button>' : 'data-action="tut-next-tutorial">Next tutorial</button>',
            `${id}: ${last ? 'Finish only — the last of the three' : 'Finish and Next tutorial'} (8A)`);
        }
        stepOn(app);
      }
      t.deepEq(missing, [], `${id}: every step's target is on its screen`);
    }

    // 7A — the Jobs list.
    app.fn('openTutorial')('jobs', 'settingsTutorials');
    let shown = html(app);
    t.ok(inMarkup(shown, '.backup-banner'), 'jobs: the backup reminder is there for its step');
    t.ok(inMarkup(shown, '.cal-banner'), 'jobs: …and the retest reminder for its');
    t.includes(shown, '1 client due for retest', '…last year\'s job, due this month');
    t.eq((shown.match(/class="session-safe"/g) || []).length, 2, 'jobs: the shield on the two jobs safe in the cloud');
    t.ok(inMarkup(shown, '.jobs-tabs'), 'jobs: signed in, the two tabs');
    stepTo(app, 'history');
    shown = html(app);
    t.ok(inMarkup(shown, '.asset-history-card'), 'jobs: searching 1042 offers its history');
    t.includes(shown, 'Tested in 2 jobs', '…in two jobs');
    t.eq(app.run('_tutDraw(() => [...new Set(assetHistoryFor("1042").rows.map(r => r.item.itemType))].length)'), 1, '…the same item both years (browser check)');
    stepOn(app);
    t.eq(stepKey(app), 'history-sheet', 'jobs: the history sheet');
    t.ok(inMarkup(html(app), '.asset-history-sheet'), '…is open');
    app.fn('render')();
    t.includes(html(app), 'class="tut-practice tut-still"', '…and isn\'t slid in again by a redraw');
    stepOn(app);
    t.notOk(app.run('_tut.st.assetHistorySheetOpen'), 'jobs: Next closes the sheet');
    t.eq(app.run('_tut.st.sessionsSearchQuery'), '', '…and clears the search');
    stepTo(app, 'done');
    t.eq(app.run('_tut.st.jobsTab'), 'cloud', 'jobs: ends on the In the cloud tab (7A)');
    t.ok(inMarkup(html(app), '.cloud-tab'), '…drawn');

    // 8A — Next tutorial walks the three, and returns to Tutorials.
    app.fn('setView')('settingsTutorials');
    app.fn('openTutorial')('jobs', 'settingsTutorials');
    stepTo(app, 'done');
    app.run('ACTIONS["tut-next-tutorial"]()');
    t.eq(app.run('_tut.id'), 'cloud', 'Next tutorial: Jobs list → Jobs in the cloud');
    t.eq(app.run('_tut.st.jobsTab'), 'phone', '…starting fresh, on the phone tab');
    t.eq(app.run('_tut.st.cloudJobs.ok'), false, '…the cloud list not read yet');

    // 5A — in the cloud.
    stepTo(app, 'show');
    t.includes(html(app), '>Show them</button>', 'cloud: Show them, before the list is read');
    stepTo(app, 'list');
    shown = html(app);
    t.includes(shown, '5 jobs only in the cloud', 'cloud: Show them reads the five sample jobs');
    t.includes(shown, 'Certificate PAT-', '…with their certificate numbers');
    t.ok(inMarkup(shown, '.cloud-storage-link'), 'cloud: Cloud Storage is there for its step');
    stepTo(app, 'select');
    t.includes(html(app), '2 of 5 jobs match', 'cloud: the search finds the two Riverside jobs');
    stepTo(app, 'delete');
    t.includes(html(app), '1 selected', 'cloud: the first one ticked');
    t.eq(app.run('Object.keys(_tut.st.cloudJobs.selected).join()'), 'tutorial-cloud-1', '…the newest (the list comes newest first)');
    t.ok(inMarkup(html(app), '[data-tut-action="cloud-bring"]'), '…Bring onto this phone on the bar');
    stepTo(app, 'arrived');
    shown = html(app);
    t.eq(app.run('_tut.st.jobsTab'), 'phone', 'cloud: brought back, the phone tab shows it (5A)');
    t.eq(app.run('_tut.st.sessions.find(s => s.id === "tutorial-cloud-1").items.length'), 18, '…a whole job, its 18 items');
    t.ok(/^PAT-\d{4}-0031$/.test(app.run('_tut.st.sessions.find(s => s.id === "tutorial-cloud-1").certNo')), '…and its certificate number');
    t.includes(shown, 'Riverside Dental — Branch Surgery', '…on the Jobs list');
    t.eq((shown.match(/class="session-safe"/g) || []).length, 3, '…safe in the cloud, as it came from there');
    t.eq(app.run('_tut.st.cloudJobs.selecting'), false, '…and nothing left ticked');

    // 6A — Sync.
    app.run('ACTIONS["tut-next-tutorial"]()');
    t.eq(app.run('_tut.id'), 'sync', 'Next tutorial: → Syncing between phones');
    t.eq(app.run('_tut.st.view'), 'settings', 'sync: starts on the Settings list');
    stepTo(app, 'counts');
    shown = html(app);
    t.includes(shown, '<strong>2</strong> of 3 jobs in the cloud and up to date', 'sync: the practice\'s own counts');
    t.includes(shown, '<strong>1</strong> waiting to send', '…one waiting');
    stepTo(app, 'pull');
    shown = html(app);
    t.includes(shown, '<strong>3</strong> of 3 jobs in the cloud and up to date', 'sync: Push now sends it');
    t.includes(shown, 'Sent 1 job.', '…in the real sync\'s own words');
    t.notOk(inMarkup(shown, '.sync-held-row'), '…no held job yet');
    stepOn(app);
    shown = html(app);
    t.eq(stepKey(app), 'held', 'sync: Check for updates');
    t.ok(inMarkup(shown, '.sync-held-row'), '…finds a job held for an answer (6A)');
    t.includes(shown, 'This phone: 12 items &middot; cloud: 13 items', '…changed on both phones');
    t.ok(inMarkup(shown, '[data-tut-action="sync-held-diff"]') && inMarkup(shown, '[data-tut-action="sync-keep-phone"]') && inMarkup(shown, '[data-tut-action="sync-keep-cloud"]'),
      '…with What\'s different? and both answers');
    t.includes(shown, 'needs you to decide', '…and the real sync\'s words say so');
    t.deepEq(app.run('_tutSteps().filter(s => s.go).map(s => s.key)'), ['group', 'page', 'push', 'pull'], 'sync: the held job is look-only (6A)');
    stepTo(app, 'done');
    app.run('ACTIONS["tut-quit"]()');
    t.eq(app.run('state.view'), 'settingsTutorials', 'Finish lands on Tutorials');

    // The headings don't run into each other: Backup & Restore still ends on
    // Finish alone, and the practice job still offers free practice.
    app.fn('openTutorial')('backup', 'settingsTutorials');
    stepTo(app, 'done');
    t.eq(app.run('_tutNextDef()'), null, 'Backup & Restore: no Next tutorial into the cloud ones');
    app.fn('closeTour')();
    app.fn('openTutorial')('practice', 'sessions');
    stepTo(app, 'done');
    t.eq(app.run('_tutNextDef()'), null, 'the practice job: no Next tutorial');
    t.includes(html(app), 'data-action="tut-free"', '…free practice as before');
    app.fn('closeTour')();
  });

  /* ------------------------------------------------------------------ 75e */
  await t.group('75e — the Tutorials page, search, the box, Export everything (1A, 2A)', () => {
    const app = freshApp();
    app.fn('setView')('settingsTutorials');
    const page = html(app);
    t.includes(page, '<h2 class="h2">Setting up</h2>', 'the first heading');
    t.includes(page, '<h2 class="h2">Your jobs &amp; the cloud</h2>', 'the second heading (2A)');
    t.ok(page.indexOf('Setting up') < page.indexOf('Your jobs &amp; the cloud'), '…under the first');
    const at = page.indexOf('id="tutorials-cloud-list"');
    t.ok(at > -1, 'its own list');
    const cloudRows = [...page.slice(at).matchAll(/data-action="open-tutorial" data-arg="([^"]+)"/g)].map(m => m[1]);
    t.deepEq(cloudRows, IDS, '…the three, in order');
    t.includes(page, 'on a pretend account', '…saying it\'s a pretend account (3A)');
    t.includes(page, 'Nothing is sent', '…and nothing is sent');
    t.includes(page, 'Find a job, bring it back', 'the rows say what each one is');
    t.includes(read('styles.css'), '#tutorials-settings-list + .settings-section { margin-top: 28px; }', 'the second heading sits clear of the list above (browser check)');
    const al = ' ' + app.run('SETTINGS_PAGE_META.settingsTutorials.aliases') + ' ';
    t.ok(/ cloud /.test(al) && / sync /.test(al) && / jobs /.test(al), 'search finds Tutorials by cloud, sync or jobs');
    // The box can frame a whole job card (the job just brought back).
    app.run(`globalThis.__v136doc = document.getElementById;
      document.getElementById = (id) => id === 'tut-practice'
        ? { querySelector: (sel) => ({ sel, closest: (c) => ({ framed: c }) }) }
        : __v136doc.call(document, id);`);
    t.eq(app.run("JSON.stringify(_tutTarget({ target: '#x', box: 'card' }))"), '{"framed":".session-card"}', 'box: card frames the whole job card');
    app.run('document.getElementById = __v136doc;');
    // 1A: Export everything is a step of Backup & Restore, with a fuller card.
    const everything = app.run("TUTORIALS.find(d => d.id === 'backup').steps.find(s => s.key === 'everything').text");
    t.includes(everything, 'every certificate you’ve made (no new numbers used)', 'Backup: Export everything — the certificates, no new numbers');
    t.includes(everything, 'Jobs kept only in the cloud aren’t in it', '…and what it leaves out');
  });

  // 75f retired at V137 → 76f (the release checks move with each release).
};
