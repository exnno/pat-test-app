/* Standing test — V135: Tutorials, part 2 — the Settings tutorials
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked (18 Oct, Peter — all defaults): 1A five
   tutorials: Engineer & Tester, Company & Branding, Certificate Content, Quick
   Pick Items, Backup & Restore. 2A one short tutorial per page, listed on the
   Tutorials page. 3A each starts on the real Settings list (group, then page).
   4A no typing — a practice that starts as a new phone, and tapping a box
   fills in an example. 5A the logo and signature pickers open for real; the
   picture stays in the practice. 6A Backup & Restore look-only — no practice
   backup file. 7A each ends on the result (the testing screen's buttons, or
   the sample certificate). 8A Finish + Next tutorial. 9A a plain list, no
   storage change. 10A opened from the Tutorials page only.

     74a  identical: every Settings screen a tutorial shows is the real render
          function's markup for the practice's data.
     74b  nothing kept, and a new phone: each tutorial run start to finish on a
          phone with real work leaves storage and data exactly as they were;
          the practice starts blank, never this phone's name or company.
     74c  never a real save: no real save, add or export handler runs during
          any tutorial; no live app action on a Settings practice screen; a
          guided tap never does the browser's own thing (a switch flipping).
     74d  the steps: counts, every target on its screen, do-steps have their
          tap, the result each one ends on, Next tutorial walks the five and
          still returns to Tutorials, an open New preset sheet isn't slid in
          again.
     74e  examples and pictures: the fills land in the real boxes; the box can
          frame a whole row or section; the logo / signature pickers take PNG
          or JPEG and the step moves on only for its own picture; Backup is
          look-only; the snapshot list can't be painted into the practice.
     74f  release: V135, cache, What's new (one line), About V135 / V134 / V133,
          Tutorials page lists the five, Help → Tutorials, search, setup's offer,
          Privacy (72f's and 73f's lasting checks, moved here).

   How it LOOKS — the box on every target, the card clear of it, the sample
   certificates, the logo and signature pickers — was checked in Chromium at
   390×844 dark and 375×667 light (Playwright, not committed). */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp, populated } = require('../fixture');

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const html = (app) => app.doc.getElementById('app').innerHTML;

const IDS = ['engineer', 'branding', 'content', 'items', 'backup'];
const COUNTS = { engineer: 10, branding: 10, content: 10, items: 11, backup: 7 };

function step(app) { return app.run('(() => { const s = _tutSteps()[state.tourStep]; return { key: s.key, target: s.target, go: !!s.go, run: typeof s.run === "function" || typeof s.tap === "function", when: !!s.when, box: s.box || "" }; })()'); }
// Step on the way Skip and Next do, without the pause after a fill.
function stepOn(app) {
  app.run('(() => { const s = _tutSteps()[state.tourStep]; if (s.go && s.run) s.run(); _tutAdvance(); })()');
}
function stepTo(app, key) {
  for (let i = 0; i < 30 && app.run('state.tourOpen'); i++) {
    if (app.run('_tutSteps()[state.tourStep].key') === key) return true;
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
// Does the markup hold an element matching this simple selector? (as 72d)
function inMarkup(markup, sel) {
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
// A phone with real work AND its own name, company and next certificate number.
function realPhone() {
  const app = populated();
  app.run("state.engineer = 'ZZ Real Engineer'; state.reportSettings.companyName = 'ZZ Real Company'; state.reportSettings.certNextNumber = 57; save();");
  return app;
}

module.exports = async function () {

  /* ------------------------------------------------------------------ 74a */
  await t.group('74a — identical: the Settings tutorials draw the real pages (2A)', () => {
    const fns = {
      settings: 'renderSettingsHub', settingsCategory: 'renderSettingsCategory', settingsUser: 'renderSettingsUser',
      settingsInstrument: 'renderSettingsInstrument', settingsItems: 'renderSettingsItems', settingsReport: 'renderSettingsReport',
      settingsReportContent: 'renderSettingsReportContent', settingsBackup: 'renderSettingsBackup'
    };
    const seen = new Set();
    for (const id of IDS) {
      const app = populated();
      app.fn('openTutorial')(id, 'settingsTutorials');
      for (let i = 0; i < 30 && app.run('state.tourOpen'); i++) {
        const view = app.run('_tut.st.view');
        if (fns[view] && !app.run('_tutSteps()[state.tourStep].cert')) {
          const practice = app.run('_tutInert(_tutScreenHTML())');
          const st = app.run('JSON.stringify(_tut.st)');
          const other = freshApp();
          other.run(`Object.assign(state, ${st}); state.tourOpen = false;`);
          const real = other.run(`_tutInert(${fns[view]}())`);
          if (!seen.has(id + view)) t.eq(practice, real, `${id}: "${view}" is ${fns[view]}()'s own markup`);
          seen.add(id + view);
          seen.add(view);
        }
        stepOn(app);
      }
    }
    t.deepEq(Object.keys(fns).filter(v => !seen.has(v)), [], 'every Settings screen the tutorials use was compared');
    t.includes(read('tour.js'), "settingsReportContent: () => renderSettingsReportContent(),", 'Certificate Content comes from its own render function');
  });

  /* ------------------------------------------------------------------ 74b */
  await t.group('74b — nothing kept, and a new phone (4A)', () => {
    for (const id of IDS) {
      const app = realPhone();
      app.fn('setView')('settingsTutorials');
      const storeBefore = JSON.stringify(app.storage._snapshot());
      const dataBefore = realOf(app);
      const refused = app.run('_tutRefused');
      app.fn('openTutorial')(id, 'settingsTutorials');
      t.eq(app.run('_tut.st.view'), 'settings', `${id}: starts on the Settings list (3A)`);
      t.eq(app.run('_tut.st.engineer'), '', `${id}: the practice has no name — not this phone's`);
      t.eq(app.run('_tut.st.instruments.length'), 0, `${id}: …and no instruments`);
      // A new phone's one starting preset (found in the browser check: the
      // state taken before load() has none, so the page showed 'Items in ""').
      t.eq(app.run('_tut.st.itemPresets.map(p => p.name).join()'), 'Default', `${id}: …and the starting preset`);
      t.eq(app.run('_tut.st.activePresetId'), app.run('_tut.st.itemPresets[0].id'), `${id}: …in use`);
      t.notOk(/ZZ Real/.test(app.run('JSON.stringify(_tut.st)')), `${id}: nothing of this phone's is in the practice`);
      let n = 0;
      while (app.run('state.tourOpen') && n++ < 30) stepOn(app);
      t.notOk(app.run('state.tourOpen'), `${id}: ran to its end`);
      t.eq(app.run('state.view'), 'settingsTutorials', `${id}: Finish lands back on Tutorials`);
      t.eq(JSON.stringify(app.storage._snapshot()), storeBefore, `${id}: storage exactly as it was`);
      t.eq(realOf(app), dataBefore, `${id}: every real value exactly as it was`);
      t.eq(app.run('_tutRefused'), refused, `${id}: nothing even tried to write`);
      t.notOk(/tutorial-|Alex Smith|Practice PAT Services|PrimeTest/.test(JSON.stringify(app.storage._snapshot()) + app.run('JSON.stringify(state)')), `${id}: no practice value anywhere real`);
    }
    // The practice job itself still copies this phone's name and company (V134).
    const app = realPhone();
    app.fn('openPractice')('sessions');
    t.eq(app.run('_tut.st.engineer'), 'ZZ Real Engineer', 'the practice job still uses this phone\'s name (V134 unchanged)');
    app.fn('closeTour')();
  });

  /* ------------------------------------------------------------------ 74c */
  await t.group('74c — never a real save (R37)', () => {
    const app = realPhone();
    const real = ['save', 'saveUserSettings', 'saveInstrumentFromEditor', 'addInstrument', 'saveReportSettingsForm', 'saveReportSettings',
      'saveItemTypesSettings', 'createPreset', 'downloadBackup', 'exportAllOpen', 'stampCertNumber', 'handleReportLogoFile'];
    app.run(`globalThis.__v135 = {}; ${JSON.stringify(real)}.forEach((n) => { if (typeof globalThis[n] === 'function') { const f = globalThis[n]; globalThis[n] = function () { __v135[n] = (__v135[n] || 0) + 1; return f.apply(this, arguments); }; } });`);
    const wrapped = app.run(`${JSON.stringify(real)}.filter((n) => typeof globalThis[n] === 'function' && /__v135/.test(String(globalThis[n])))`);
    t.ok(wrapped.length >= 10, `the real handlers are watched (${wrapped.length})`);
    for (const id of IDS) {
      app.fn('openTutorial')(id, 'settingsTutorials');
      let n = 0;
      while (app.run('state.tourOpen') && n++ < 30) {
        const shown = html(app);
        const acts = [...shown.matchAll(/\sdata-action="([^"]+)"/g)].map(m => m[1]).filter(a => !/^tut-/.test(a));
        if (acts.length) t.deepEq(acts, [], `${id} ${app.run('_tutSteps()[state.tourStep].key')}: no live app action on the practice screen`);
        stepOn(app);
      }
    }
    t.deepEq(app.run('JSON.stringify(__v135)'), '{}', 'no real save, add, export or certificate number ran');
    // A guided tap never does the browser's own thing (a switch flipping, a
    // box taking the keyboard) — even a tap that doesn't count.
    app.fn('openTutorial')('branding', 'settingsTutorials');
    stepTo(app, 'enable');
    let stopped = 0;
    app.fn('tutTap')('', null, { target: { closest: () => null }, preventDefault: () => { stopped++; } });
    t.eq(stopped, 1, 'a guided tap is stopped from doing the browser\'s own thing');
    t.eq(app.run('_tutSteps()[state.tourStep].key'), 'enable', '…and a tap off the target does nothing');
    app.fn('closeTour')();
  });

  /* ------------------------------------------------------------------ 74d */
  await t.group('74d — the steps, the results, Next tutorial (3A, 7A, 8A)', () => {
    const app = populated();
    t.deepEq(app.run('TUTORIALS.map(d => d.id)'), ['practice'].concat(IDS), 'the practice job, then the five, in order');
    // Each starts at the top of the screen, wherever the Tutorials list was
    // scrolled to (found in the browser check).
    app.run('globalThis.__v135top = 0; globalThis.__v135st = window.scrollTo; window.scrollTo = function (x, y) { if (!x && !y) __v135top++; };');
    app.fn('openTutorial')('items', 'settingsTutorials');
    t.ok(app.run('__v135top') > 0, 'a tutorial starts at the top of the screen');
    app.run('window.scrollTo = __v135st;');
    app.fn('closeTour')();
    // Certificate Content follows the page down — it never jumps back up.
    t.deepEq(app.run("TUTORIALS.find(d => d.id === 'content').steps.map(s => s.key).slice(2, 6)"), ['include', 'declaration', 'numbers', 'prefix'],
      'content: the steps follow the page, top to bottom');
    for (const id of IDS) {
      app.fn('openTutorial')(id, 'settingsTutorials');
      const steps = app.run('_tutSteps().map(s => ({ key: s.key, target: s.target, go: !!s.go, run: typeof s.run === "function" || typeof s.tap === "function", when: !!s.when }))');
      t.eq(steps.length, COUNTS[id], `${id}: ${COUNTS[id]} steps`);
      t.eq(steps[0].key, 'group', `${id}: starts on its Settings group (3A)`);
      t.ok(/^\.settings-row\[data-arg="cat/.test(steps[0].target), `${id}: …the group's row on the Settings list`);
      t.eq(steps[steps.length - 1].key, 'done', `${id}: ends on Done`);
      t.eq(steps[steps.length - 1].target, '', `${id}: …with no box`);
      t.ok(steps.filter(s => s.go).every(s => s.run), `${id}: every do-step has its tap`);
      const missing = [];
      const total = COUNTS[id];
      for (let i = 0; i < 30 && app.run('state.tourOpen'); i++) {
        const s = step(app);
        const shown = html(app);
        if (s.target && !s.when && !inMarkup(shown, s.target)) missing.push(s.key + ' ' + s.target);
        t.includes(shown, `Step ${app.run('state.tourStep') + 1} of ${total}`, `${id} ${s.key}: says which step`);
        if (s.key === 'done') {
          const last = id === 'backup';
          t.includes(shown, last ? '<button class="btn-primary tut-go" data-action="tut-quit">Finish</button>' : 'data-action="tut-next-tutorial">Next tutorial</button>',
            `${id}: ${last ? 'Finish only — the last of the five' : 'Finish and Next tutorial'} (8A)`);
          t.excludes(shown, 'data-action="tut-free"', `${id}: no free practice`);
        }
        if (s.key === 'cert') {
          t.includes(shown, 'class="tut-cert"', `${id}: ends on the sample certificate (7A)`);
          t.eq(app.run('_tut.st.sessions[0].items.length'), 3, `${id}: …of a practice job with three items`);
        }
        if (id === 'items' && s.key === 'result') {
          t.eq(app.run('_tut.st.view'), 'entry', 'items: ends on the testing screen (7A)');
          t.includes(shown, 'data-type="Kettle"', '…with the new Kitchen buttons');
        }
        if (id === 'items' && s.key === 'create') t.includes(shown, 'class="tut-practice tut-still"', 'items: the open New preset sheet isn\'t slid in again');
        stepOn(app);
      }
      t.deepEq(missing, [], `${id}: every step's target is on its screen`);
    }
    // Certificate Content: the sample is numbered from the practice's prefix;
    // the phone's own counter never moves.
    const ph = realPhone();
    ph.fn('openTutorial')('content', 'settingsTutorials');
    stepTo(ph, 'cert');
    t.eq(ph.run('_tut.st.sessions[0].certNo'), 'PAT-' + new Date().getFullYear() + '-0001', 'content: the sample carries the practice\'s number');
    t.eq(ph.run('state.reportSettings.certNextNumber'), 57, '…and this phone\'s next number is untouched');
    ph.fn('closeTour')();
    // Next tutorial: from Engineer's end into Company & Branding, fresh, and
    // still back to Tutorials at the end.
    app.fn('setView')('settingsTutorials');
    app.fn('openTutorial')('engineer', 'settingsTutorials');
    stepTo(app, 'done');
    app.run('ACTIONS["tut-next-tutorial"]()');
    t.ok(app.run('state.tourOpen'), 'Next tutorial opens the next one');
    t.eq(app.run('_tut.id'), 'branding', '…Company & Branding');
    t.eq(app.run('state.tourStep'), 0, '…from its first step');
    t.eq(app.run('_tut.st.engineer'), '', '…starting fresh');
    app.run('ACTIONS["tut-quit"]()');
    t.eq(app.run('state.view'), 'settingsTutorials', '…and Quit still lands on Tutorials');
    t.eq(app.run('typeof ACTIONS["open-tutorial"]'), 'function', 'the Tutorials rows are wired');
    app.fn('setView')('settingsTutorials');
    app.run('ACTIONS["open-tutorial"]("backup")');
    t.eq(app.run('_tut && _tut.id'), 'backup', 'a row opens its tutorial');
    app.fn('closeTour')();
    app.fn('openTutorial')('nonsense', 'settingsTutorials');
    t.notOk(app.run('state.tourOpen'), 'an unknown tutorial opens nothing');
  });

  /* ------------------------------------------------------------------ 74e */
  await t.group('74e — examples, the box, pictures, Backup look-only (4A, 5A, 6A)', async () => {
    const app = populated();
    app.fn('openTutorial')('engineer', 'settingsTutorials');
    stepTo(app, 'add');
    t.includes(html(app), 'value="Alex Smith"', 'engineer: tapping the name box fills in an example');
    stepTo(app, 'inst-save');
    t.includes(html(app), 'value="Seaward"', 'engineer: …the make');
    t.includes(html(app), 'value="PrimeTest 250+"', '…the model');
    t.ok(/value="CAL-\d{4}-0142"/.test(html(app)), '…and the calibration');
    stepTo(app, 'in-use');
    t.includes(html(app), 'class="instrument-badge">In use', 'engineer: the tester is in use');
    app.fn('closeTour')();
    app.fn('openTutorial')('branding', 'settingsTutorials');
    stepTo(app, 'logo');
    t.includes(html(app), 'value="Practice PAT Services"', 'branding: the company');
    t.ok(app.run('_tut.st.reportSettings.enabled'), 'branding: reports switched on in the practice');
    // The box can frame the whole row or section, not just the control.
    app.run(`globalThis.__v135doc = document.getElementById;
      document.getElementById = (id) => id === 'tut-practice'
        ? { querySelector: (sel) => ({ sel, closest: (c) => ({ framed: c }) }) }
        : __v135doc.call(document, id);`);
    t.eq(app.run("JSON.stringify(_tutTarget({ target: '#report-enabled', box: 'row' }))"), '{"framed":".toggle-row"}', 'box: row frames the toggle row');
    t.eq(app.run("JSON.stringify(_tutTarget({ target: '#x', box: 'section' }))"), '{"framed":".settings-section"}', 'box: section frames the page section');
    t.eq(app.run("_tutTarget({ target: '#x' }).sel"), '#x', 'no box: the control itself');
    app.run('document.getElementById = __v135doc;');
    // Pictures (5A): the picker takes PNG / JPEG; only the step's own picture moves it on.
    // The stub page can't look a node up by an id set as a property — catch
    // the file box as it goes onto the page instead.
    app.run("globalThis.__v135box = null; globalThis.__v135ap = document.body.appendChild; document.body.appendChild = function (n) { if (n && n.id === 'tut-photo-file') __v135box = n; return __v135ap.call(this, n); };");
    app.run("_tutPickImage('logo')");
    t.eq(app.run("(__v135box || {}).accept"), 'image/png,image/jpeg', 'the logo picker takes PNG or JPEG, as the real one');
    app.run("_tutPickImage('photo')");
    t.eq(app.run("(__v135box || {}).accept"), 'image/*', '…the practice photo still takes any picture (V134.1)');
    app.run('document.body.appendChild = __v135ap;');
    app.run("_tutPicked('photo')");
    t.notOk(app.run('!!_tutTimer'), 'a photo doesn\'t move the logo step on');
    app.run("_tutPicked('logo')");
    t.ok(app.run('!!_tutTimer'), 'the logo moves it on');
    app.run('clearTimeout(_tutTimer); _tutTimer = null;');
    let toast = '';
    app.run("globalThis.__v135toast = showToast; showToast = (m) => { __v135toast2 = m; };");
    app.run("var __v135toast2 = ''; _tutAddPicture('logo', { type: 'image/gif' })");
    toast = app.run('__v135toast2');
    app.run('showToast = __v135toast;');
    t.includes(toast, 'PNG or JPEG', 'any other picture is turned away');
    t.eq(app.run('_tut.st.reportSettings.logo || ""'), '', '…and nothing is set');
    app.fn('closeTour')();
    // 6A: Backup & Restore — nothing after the page can be done, only looked at.
    app.fn('openTutorial')('backup', 'settingsTutorials');
    const steps = app.run('_tutSteps().map(s => ({ key: s.key, go: !!s.go }))');
    t.deepEq(steps.filter(s => s.go).map(s => s.key), ['group', 'page'], 'backup: only the group and the page are taps — the rest is look-only');
    stepTo(app, 'backup');
    const shown = html(app);
    t.ok(inMarkup(shown, '#export-all-btn'), 'backup: Export everything is on the page (its step)');
    t.excludes(shown, 'id="snapshots-block"', 'backup: the phone\'s snapshot list can\'t be painted into the practice');
    t.includes(shown, 'id="tut-snapshots-block"', '…its box is the practice\'s own (its step)');
    app.fn('closeTour')();
  });

  /* ------------------------------------------------------------------ 74f */
  await t.group('74f — release: V135, cache, What’s new, About, Tutorials', () => {
    const app = freshApp();
    t.eq(app.run('APP_VERSION'), 'V135', 'APP_VERSION V135');
    t.eq(app.run('WELCOME_VERSION'), 'V135', 'What’s new rolled');
    t.includes(read('sw.js'), "const CACHE_VERSION = 'pat-v135';", 'cache key pat-v135');
    const core = read('render-core.js');
    const open = core.indexOf('<ul class="welcome-list sheet-scroll">');
    const sheet = core.slice(open, core.indexOf('</ul>', open));
    t.eq((sheet.match(/<li>/g) || []).length, 1, 'What’s new: one line');
    t.includes(sheet, '<li><strong>Settings tutorials.</strong>', '…the Settings tutorials');
    t.includes(core, 'New here? Try the practice job.', 'setup offers the practice job');
    t.includes(core, 'You can do it again any time from Settings → Help → Tutorials.', '…and says where it lives');
    const help = read('render-help.js');
    const a = help.indexOf('<p><strong>V135</strong>'), b = help.indexOf('<p><strong>V134</strong>'), c = help.indexOf('<p><strong>V133</strong>');
    t.ok(a > -1 && b > a && c > b, 'About: V135, V134, V133');
    t.excludes(help, '<p><strong>V132</strong>', 'V132 rolled off');
    t.includes(help, 'Settings tutorials: short walk-throughs of Engineer &amp; Tester', 'About: V135’s line');
    t.includes(help, 'The practice job: a step-by-step practice on the real testing screen', 'About: V134’s line still there');
    t.includes(help, 'Behind the scenes: a signed-in phone now tells the cloud which version of PATGo it is running', 'About: V133’s line still there');
    t.includes(help, 'A signed-in phone also tells the cloud which version of the app it is running.', 'Privacy unchanged');
    t.includes(help, 'data-action="settings-page" data-arg="settingsTutorials"', 'About points at Tutorials');
    const help0 = app.run("SETTINGS_CATEGORIES.find(c => c.id === 'catHelp').pages[0]");
    t.eq(help0, 'settingsTutorials', 'Tutorials heads the Help group');
    const meta = app.run('SETTINGS_PAGE_META.settingsTutorials');
    const al = ' ' + (meta && meta.aliases) + ' ';
    t.ok(/ tutorial /.test(al) && / practice /.test(al), 'search finds it by tutorial or practice');
    t.ok(/ settings /.test(al) && / instrument /.test(al) && / backup /.test(al), '…and by settings, instrument or backup (V135)');
    app.fn('setView')('settingsTutorials');
    const page = html(app);
    t.includes(page, 'data-action="open-practice"', 'the page starts the practice job');
    t.includes(page, 'Nothing you do in it is saved', '…and says nothing is kept');
    const rows = [...page.matchAll(/data-action="open-tutorial" data-arg="([^"]+)"/g)].map(m => m[1]);
    t.deepEq(rows, IDS, 'the page lists the five Settings tutorials (2A)');
    t.includes(page, 'Nothing you do in them is saved', '…and says nothing is kept');
    t.eq(app.run('typeof TOUR_SLIDES'), 'undefined', 'the five picture slides stay retired');
    t.eq(app.run('TUT_STEPS.length'), 21, 'the practice job: 21 steps (V134.1, unchanged)');
  });
};
