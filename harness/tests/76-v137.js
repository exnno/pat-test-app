/* Standing test — V137: "Show me how ›" on the pages the tutorials cover
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked (18 Oct, Peter — 0A, all defaults): 1A the
   link on the five Settings pages the Settings tutorials cover (Engineer &
   Tester, Company & Branding, Certificate Content, Quick Pick Items, Backup &
   Restore) and on the Sync page; not the Jobs list or the cloud tab. 2A one
   line under the page title. 3A typing the page still holds goes through the
   same Save / Discard changes / Keep editing question as Back, only when
   something changed — Save saves and then opens the tutorial. 4A Quit and
   Finish come back to the page, its return markers (the certificate preview,
   Edit presets) untouched; Finish only, no Next tutorial. 5A no switch. 6A a
   one-line What's new.

     76a  where it shows: on exactly the six pages, under the title, naming
          the page's own tutorial; on no other Settings page or the locked
          cloud page; never inside a tutorial (the practice draws these same
          pages) — 74a's identity holds with that one line left out.
     76b  the tap: opens that page's tutorial, through the dispatch table;
          Finish only on every one; Quit and Finish come back to the page;
          a stale tap from another page, or during a tutorial, does nothing;
          from the Tutorials page Next tutorial is unchanged.
     76c  typing (3A): an untouched page goes straight in; a change asks;
          Keep editing stays with the typing; Discard opens the tutorial and
          saves nothing; Save saves and opens the tutorial, back to the page.
     76d  the return markers (4A): Quick Pick Items from Edit presets and
          Company & Branding from the certificate preview still go back
          there after the tutorial — Save included; a Save that never leaves
          (the hook unused) keeps the marker and is not left armed.
     76e  nothing kept: a page's tutorial run start to finish leaves storage
          and every real value as they were.
     76f  release: V137 … — retired at V138; its lasting checks are 77e.

   How it LOOKS — the line under each title, the gap, a tap height, both
   themes — was checked in Chromium at 390×844 dark and 375×667 light
   (Playwright, not committed). */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp, populated } = require('../fixture');

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const html = (app) => app.doc.getElementById('app').innerHTML;

// The six pages (1A) and the tutorial each one opens.
const PAGES = {
  settingsUser: 'engineer', settingsReport: 'branding', settingsReportContent: 'content',
  settingsItems: 'items', settingsBackup: 'backup', cloudSync: 'sync'
};
const RENDER = {
  settingsUser: 'renderSettingsUser()', settingsReport: 'renderSettingsReport()',
  settingsReportContent: 'renderSettingsReportContent()', settingsItems: 'renderSettingsItems()',
  settingsBackup: 'renderSettingsBackup()', cloudSync: 'renderCloudSync()'
};
const LINK = 'data-action="tut-show-me-how"';

function tap(app, action, arg) {
  const el = app.doc.createElement('button');
  el.dataset.action = action;
  if (arg !== undefined) el.dataset.arg = String(arg);
  app.doc.getElementById('app').dispatchEvent({
    type: 'click', target: el, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
  });
}
const sheet = (app) => app.doc.body.children.find(el => el.getAttribute && el.getAttribute('aria-label') === 'Save your changes?') || null;
const pick = (app, which) => {
  const id = { save: 'choice-sheet-0', discard: 'choice-sheet-1', keep: 'choice-sheet-no' }[which];
  app.doc.getElementById(id).click();
};
// The values a phone's inputs would show (as 49 — the stand-in page keeps no
// value="" from the markup, and the guard reads the inputs).
function pageValues(app) {
  const st = app.state();
  const rs = st.reportSettings;
  return {
    'report-company-name': rs.companyName, 'report-company-address': rs.companyAddress,
    'report-title': rs.reportTitle, 'report-declaration-text': rs.declarationText,
    'report-filename-pattern': rs.reportFilenamePattern, 'report-cert-prefix': rs.certPrefix,
    'report-cert-padding': String(rs.certPadding), 'report-cert-next': String(rs.certNextNumber),
    'report-remedial-text': rs.remedialActionText,
    'report-retest-months': rs.retestMonths == null ? '' : String(rs.retestMonths),
    'settings-engineer': st.engineer,
    'settings-types': app.run("activePreset() ? activePreset().items.join('\\n') : ''"),
  };
}
// Paint the page as the phone shows it, and take the guard's baseline.
function paint(app) {
  app.fn('render')();
  for (const [id, v] of Object.entries(pageValues(app))) {
    const el = app.doc.getElementById(id);
    if (el) el.value = v;
  }
  app.fn('unsavedAfterRender')();
}
// Open a page as the hub does, then paint it (as 49).
function open(app, view, cat) {
  app.state().settingsCategory = cat || null;
  app.fn('setView')(view);
  paint(app);
}
function stepOn(app) {
  app.run('(() => { const s = _tutSteps()[state.tourStep]; if (s.run) s.run(); _tutAdvance(); })()');
}
function runToEnd(app) {
  let n = 0;
  while (app.run('state.tourOpen') && n++ < 40) stepOn(app);
}
function realOf(app) {
  return app.run(`JSON.stringify(Object.keys(state).filter(k => !['view', 'tourOpen', 'tourStep'].includes(k)).sort().reduce((o, k) => {
    o[k] = (k === 'photoMgr' || k === 'jobMgr') ? Object.assign({}, state[k], { gen: 0, thumbGen: 0 }) : state[k];
    return o;
  }, {}))`);
}

module.exports = async function () {

  /* ------------------------------------------------------------------ 76a */
  await t.group('76a — where it shows: the six pages, under the title, never inside a tutorial (1A 2A)', () => {
    const app = populated();
    for (const [view, id] of Object.entries(PAGES)) {
      app.run(`state.view = ${JSON.stringify(view)}`);
      const page = app.run(RENDER[view]);
      const at = page.indexOf(LINK);
      t.ok(at > -1, `${view}: has "Show me how"`);
      t.eq((page.match(/data-action="tut-show-me-how"/g) || []).length, 1, `${view}: once`);
      t.includes(page, `${LINK} data-arg="${id}"`, `${view}: opens its own tutorial (${id})`);
      const header = page.indexOf('</header>');
      const firstAfter = page.slice(header).search(/class="(settings-section|info-card)/);
      t.ok(header > -1 && at > header && at < header + firstAfter, `${view}: under the title, before the page's first section (2A)`);
      t.ok(/Show me how <svg[^]*?<\/svg><\/button>/.test(page.slice(at)) || page.slice(at, at + 400).includes('Show me how'), `${view}: says Show me how`);
    }
    t.eq(app.run("TUTORIALS.filter(d => d.page).map(d => d.id + ':' + d.page).join()"),
      'engineer:settingsUser,branding:settingsReport,content:settingsReportContent,items:settingsItems,backup:settingsBackup,sync:cloudSync',
      'each tutorial names the page it teaches; the practice job, Jobs list and cloud have none (1A)');
    // Every other page: no link. Through render(), as the phone draws them.
    const views = app.run('Object.keys(SETTINGS_PAGE_META)').concat(['settings', 'settingsCategory', 'sessions', 'cloudAccount']);
    const others = [];
    for (const v of views) {
      if (PAGES[v]) continue;
      app.run(`state.settingsCategory = 'catHelp'; state.view = ${JSON.stringify(v)}`);
      try { app.fn('render')(); } catch (e) { continue; }
      if (html(app).includes(LINK)) others.push(v);
    }
    t.deepEq(others, [], 'no other page has it');
    t.ok(views.length > 20, '…of every Settings page there is (' + views.length + ')');
    // The locked cloud pages (no access code yet) draw the access box, not Sync.
    app.run("state.view = 'cloudSync'");
    app.fn('render')();
    if (!app.run("typeof cloudPagesUnlocked === 'function' && cloudPagesUnlocked()")) {
      t.excludes(html(app), LINK, 'Sync locked behind the access code: no link on the code box');
    }
    // Inside a tutorial: never — the practice draws these same pages.
    for (const id of Object.values(PAGES)) {
      const a = populated();
      a.fn('openTutorial')(id, 'settingsTutorials');
      let seen = false;
      for (let i = 0; i < 40 && a.run('state.tourOpen'); i++) {
        if (a.run('_tutInert(_tutScreenHTML())').includes('tut-show-me-how')) seen = true;
        if (html(a).includes(LINK)) seen = true;
        stepOn(a);
      }
      t.notOk(seen, `${id}: never drawn inside its tutorial`);
    }
    t.eq(app.run("(() => { _tut = { id: 'engineer' }; const s = tutShowMeHowHTML('settingsUser'); _tut = null; return s; })()"), '', 'a tutorial open: nothing');
    t.eq(app.run("(() => { state.tourOpen = true; const s = tutShowMeHowHTML('settingsUser'); state.tourOpen = false; return s; })()"), '', 'the tour open: nothing');
    t.eq(app.run("tutShowMeHowHTML('settingsFails')"), '', 'a page no tutorial covers: nothing');
    t.notOk(read('tour.js').includes("SHOW_ME_HOW_KEY") || /show.?me.?how/i.test(app.run('Object.keys(SETTINGS_PAGE_META).join()')), 'no switch, no setting (5A)');
  });

  /* ------------------------------------------------------------------ 76b */
  await t.group('76b — the tap: its tutorial, Finish only, back to the page (4A)', () => {
    for (const [view, id] of Object.entries(PAGES)) {
      const app = populated();
      open(app, view, view === 'cloudSync' ? 'catCloud' : 'catHelp');
      tap(app, 'tut-show-me-how', id);
      t.ok(app.run('state.tourOpen'), `${view}: the tap opens a tutorial`);
      t.eq(app.run('_tut.id'), id, `${view}: …its own (${id})`);
      t.eq(app.run('_tut.from'), view, `${view}: …coming back here`);
      t.eq(app.run('_tut.fromPage'), true, `${view}: …marked as opened from the page`);
      t.eq(app.run('_tutNextDef()'), null, `${view}: Finish only — no Next tutorial`);
      runToEnd(app);
      t.notOk(app.run('state.tourOpen'), `${view}: ran to its end`);
      t.eq(app.run('state.view'), view, `${view}: Finish lands back on the page`);
      // (Sync draws through the cloud lock — a phone without the access code
      // gets the code box at render(); the page's own markup is what matters.)
      t.includes(view === 'cloudSync' ? app.run(RENDER[view]) : html(app), LINK, `${view}: …the page drawn, its link there again`);
      // Quit part-way: also back here.
      paint(app);
      tap(app, 'tut-show-me-how', id);
      stepOn(app);
      tap(app, 'tut-quit');
      t.notOk(app.run('state.tourOpen'), `${view}: Quit closes it`);
      t.eq(app.run('state.view'), view, `${view}: …back on the page`);
    }
    // The last step's buttons, as drawn: Finish, no Next tutorial.
    const app = populated();
    open(app, 'settingsUser', 'catUser');
    tap(app, 'tut-show-me-how', 'engineer');
    for (let i = 0; i < 40 && app.run('state.tourStep < _tutSteps().length - 1'); i++) stepOn(app);
    app.fn('render')();
    t.excludes(html(app), 'data-action="tut-next-tutorial"', 'the last step: no Next tutorial button');
    t.includes(html(app), 'data-action="tut-quit">Finish</button>', '…Finish');
    app.fn('closeTour')();
    // From the Tutorials page, unchanged: Engineer → Next tutorial (V135 8A).
    app.fn('openTutorial')('engineer', 'settingsTutorials');
    t.eq(app.run('_tut.fromPage'), false, 'from Tutorials: not from the page');
    t.eq(app.run('_tutNextDef() && _tutNextDef().id'), 'branding', 'from Tutorials: Next tutorial still offered');
    app.fn('closeTour')();
    // A stale tap: from another page, or for another page's tutorial — nothing.
    open(app, 'settingsFails', 'catTesting');
    tap(app, 'tut-show-me-how', 'engineer');
    t.notOk(app.run('state.tourOpen'), 'a tap from a page the tutorial does not cover: nothing');
    open(app, 'settingsUser', 'catUser');
    tap(app, 'tut-show-me-how', 'branding');
    t.notOk(app.run('state.tourOpen'), 'another page\'s tutorial: nothing');
    tap(app, 'tut-show-me-how', 'nope');
    tap(app, 'tut-show-me-how');
    t.notOk(app.run('state.tourOpen'), 'an unknown or missing id: nothing');
    t.eq(app.run("typeof ACTIONS['tut-show-me-how']"), 'function', 'in the dispatch table');
  });

  /* ------------------------------------------------------------------ 76c */
  await t.group('76c — typing still held: the same question as Back (3A)', () => {
    // Untouched: straight in, no question.
    let app = freshApp();
    app.state().engineer = 'Old Name'; app.fn('save')();
    open(app, 'settingsUser', 'catUser');
    tap(app, 'tut-show-me-how', 'engineer');
    t.eq(sheet(app), null, 'untouched: no question');
    t.ok(app.run('state.tourOpen'), '…straight into the tutorial');
    app.fn('closeTour')();
    // Changed: asks. Keep editing stays with the typing.
    open(app, 'settingsUser', 'catUser');
    app.doc.getElementById('settings-engineer').value = 'Typo';
    tap(app, 'tut-show-me-how', 'engineer');
    t.ok(sheet(app), 'a change: it asks');
    t.notOk(app.run('state.tourOpen'), '…before opening anything');
    pick(app, 'keep');
    t.eq(sheet(app), null, 'Keep editing closes the question');
    t.eq(app.state().view, 'settingsUser', '…on the page');
    t.eq(app.doc.getElementById('settings-engineer').value, 'Typo', '…the typing still there');
    // Discard: the tutorial, nothing saved.
    tap(app, 'tut-show-me-how', 'engineer');
    pick(app, 'discard');
    t.ok(app.run('state.tourOpen'), 'Discard: the tutorial opens');
    t.eq(app.state().engineer, 'Old Name', 'Discard: nothing saved');
    t.notOk(JSON.stringify(app.storage._snapshot()).includes('Typo'), 'Discard: …nor stored');
    app.fn('closeTour')();
    t.eq(app.state().view, 'settingsUser', 'Discard: back on the page after');
    // Save: saved, then the tutorial, then back.
    paint(app);
    app.doc.getElementById('settings-engineer').value = 'New Name';
    tap(app, 'tut-show-me-how', 'engineer');
    pick(app, 'save');
    t.eq(app.state().engineer, 'New Name', 'Save: saved');
    t.includes(JSON.stringify(app.storage._snapshot()), 'New Name', 'Save: …stored');
    t.ok(app.run('state.tourOpen'), 'Save: then the tutorial opens');
    t.eq(app.run('_tut.id'), 'engineer', 'Save: …this page\'s');
    t.eq(app.run('_tut.st.engineer'), '', 'Save: the practice is still a new phone');
    t.eq(app.run('_unsavedThen'), null, 'Save: the hook is not left armed');
    app.fn('closeTour')();
    t.eq(app.state().view, 'settingsUser', 'Save: back on the page after');
    // Quick Pick Items' box and a Report switch ask too (3A on every guarded page here).
    app = freshApp();
    open(app, 'settingsItems', 'catTesting');
    app.doc.getElementById('settings-types').value = 'Only\nThese';
    tap(app, 'tut-show-me-how', 'items');
    t.ok(sheet(app), 'Quick Pick Items: a change asks');
    pick(app, 'discard');
    t.ok(app.run('state.tourOpen'), 'Quick Pick Items: Discard → the tutorial');
    app.fn('closeTour')();
    t.notOk(app.run('activePreset().items.join()').includes('Only'), 'Quick Pick Items: nothing saved');
    app = freshApp();
    open(app, 'settingsReportContent', 'catReports');
    const was = app.state().reportSettings.showFails;
    app.state().reportSettings.showFails = !was;   // a display switch waits for Save
    tap(app, 'tut-show-me-how', 'content');
    t.ok(sheet(app), 'Certificate Content: a switch flipped asks');
    pick(app, 'discard');
    t.eq(app.state().reportSettings.showFails, was, 'Certificate Content: Discard puts it back');
    t.ok(app.run('state.tourOpen'), '…and opens the tutorial');
    app.fn('closeTour')();
    // Back keeps its own Save (lands where Back would) — unchanged by V137.
    app = freshApp();
    open(app, 'settingsUser', 'catUser');
    app.doc.getElementById('settings-engineer').value = 'Back Save';
    tap(app, 'back-to-settings');
    pick(app, 'save');
    t.eq(app.state().engineer, 'Back Save', 'Back → Save: saved');
    t.notOk(app.run('state.tourOpen'), 'Back → Save: no tutorial');
    t.eq(app.state().view, 'settingsCategory', 'Back → Save: lands where Back does, as before');
    // Backup & Restore and Sync hold no typing: straight in.
    for (const [view, id] of [['settingsBackup', 'backup'], ['cloudSync', 'sync']]) {
      app = freshApp();
      open(app, view, 'catData');
      tap(app, 'tut-show-me-how', id);
      t.eq(sheet(app), null, `${view}: no question`);
      t.ok(app.run('state.tourOpen'), `${view}: straight in`);
      app.fn('closeTour')();
    }
  });

  /* ------------------------------------------------------------------ 76d */
  await t.group('76d — the return markers survive the tutorial (4A)', () => {
    // Quick Pick Items opened from the testing screen's Edit presets.
    let app = populated();
    app.state().presetEditReturnView = 'entry';
    app.fn('setView')('settingsItems');
    paint(app);
    tap(app, 'tut-show-me-how', 'items');
    runToEnd(app);
    t.eq(app.state().view, 'settingsItems', 'Edit presets → Show me how → Finish: back on Quick Pick Items');
    t.eq(app.state().presetEditReturnView, 'entry', '…still remembering the testing screen');
    tap(app, 'back-to-settings');
    t.eq(app.state().view, 'entry', 'Back: the testing screen, as before the tutorial');
    // …and with Save asked on the way in.
    app.state().presetEditReturnView = 'entry';
    app.fn('setView')('settingsItems');
    paint(app);
    app.doc.getElementById('settings-types').value = 'Kettle\nToaster';
    tap(app, 'tut-show-me-how', 'items');
    pick(app, 'save');
    t.eq(app.run('activePreset().items.join()'), 'Kettle,Toaster', 'Save: the items saved');
    t.ok(app.run('state.tourOpen'), 'Save: the tutorial opens (not the testing screen)');
    app.fn('closeTour')();
    t.eq(app.state().presetEditReturnView, 'entry', 'Save: the marker kept');
    tap(app, 'back-to-settings');
    t.eq(app.state().view, 'entry', 'Save: Back still goes to the testing screen');

    // Company & Branding opened from the certificate preview's Edit settings.
    app = populated();
    const sid = app.run('state.activeId');
    app.run(`globalThis.__reopened = []; reopenReportPreview = (s) => { __reopened.push(s); return Promise.resolve(); };`);
    app.state().reportPreviewReturnSessionId = sid;
    app.fn('setView')('settingsReport');
    paint(app);
    tap(app, 'tut-show-me-how', 'branding');
    runToEnd(app);
    t.eq(app.state().view, 'settingsReport', 'preview → Show me how → Finish: back on Company & Branding');
    t.eq(app.state().reportPreviewReturnSessionId, sid, '…still remembering the preview');
    tap(app, 'back-to-settings');
    t.eq(app.run('__reopened.join()'), sid, 'Back: the preview again, as before the tutorial');
    // …with Save on the way in: Save would have gone to the preview; it goes to the tutorial instead.
    app.run('__reopened = []');
    app.state().reportPreviewReturnSessionId = sid;
    app.fn('setView')('settingsReport');
    paint(app);
    app.doc.getElementById('report-title').value = 'Changed Title';
    tap(app, 'tut-show-me-how', 'branding');
    t.ok(sheet(app), 'a change on Company & Branding asks');
    pick(app, 'save');
    t.eq(app.run('loadReportSettings().reportTitle'), 'Changed Title', 'Save: saved');
    t.ok(app.run('state.tourOpen'), 'Save: the tutorial opens, not the preview');
    t.eq(app.run('__reopened.length'), 0, 'Save: the preview not rebuilt yet');
    t.eq(app.state().reportPreviewReturnSessionId, sid, 'Save: the marker kept for Back');
    app.fn('closeTour')();
    tap(app, 'back-to-settings');
    t.eq(app.run('__reopened.join()'), sid, 'Save: Back from the page still returns to the preview');

    // A Save that never leaves the page: the hook is never left armed, the marker kept.
    app = populated();
    app.state().reportPreviewReturnSessionId = 'zz-sid';
    app.run(`(() => { const p = { save: () => {} }; unsavedSaveThen(p, () => { throw new Error('should not run'); }); })()`);
    t.eq(app.run('_unsavedThen'), null, 'a save that stops early: the hook disarmed');
    t.eq(app.state().reportPreviewReturnSessionId, 'zz-sid', '…and the marker as it was');
    app.run(`(() => { const p = { save: () => { throw new Error('boom'); } }; try { unsavedSaveThen(p, () => {}); } catch (e) {} })()`);
    t.eq(app.run('_unsavedThen'), null, 'a save that throws: the hook disarmed');
    t.eq(app.state().reportPreviewReturnSessionId, 'zz-sid', '…and the marker as it was');
  });

  /* ------------------------------------------------------------------ 76e */
  await t.group('76e — nothing kept: a page\'s tutorial leaves real work as it was', () => {
    for (const [view, id] of Object.entries(PAGES)) {
      const app = populated();
      app.run("state.engineer = 'ZZ Real Engineer'; save();");
      open(app, view, 'catHelp');
      const storeBefore = JSON.stringify(app.storage._snapshot());
      const dataBefore = realOf(app);
      tap(app, 'tut-show-me-how', id);
      runToEnd(app);
      t.eq(app.state().view, view, `${id}: back on ${view}`);
      t.eq(JSON.stringify(app.storage._snapshot()), storeBefore, `${id}: storage exactly as it was`);
      t.eq(realOf(app), dataBefore, `${id}: every real value exactly as it was`);
    }
  });

  // 76f retired at V138 → 77e (the release checks move with each release).
};
