/* Standing test — V138: Show me how starts on the page
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. V137's residuals (Peter 20 Oct: 1A 2A 3A, all
   defaults). 1A a tutorial opened from its own page ("Show me how ›") starts
   on that page — the steps that walk there from the Settings list ('group',
   'page': tour.js TUT_WALK_KEYS) are left out, and openTutorial runs them
   first so the practice stands exactly where the walk would leave it. From
   Settings → Help → Tutorials nothing changes (the walk is part of what it
   teaches). 2A its last card has Finish alone (V137 4A), so it no longer says
   "Next up…": a done step's `fromPage` words say Finish brings you back to
   this page. 3A the page coming back at the top is left as it is (the link is
   at the top) — no code. What's new one line.

     77a  from its page: the tap (through the dispatch table) starts on that
          page, on all six — no walk step, the page drawn, the count shorter.
     77b  exactly where the walk leaves it; from Tutorials, unchanged — the
          walk, the full count, the old last card.
     77c  the last card (2A): from the page, the `fromPage` words, Finish
          alone, no "Next up"; only the six done steps carry them.
     77d  run through from the page: every step's target on its screen, the
          step count right, Quit on the first step back to the page, nothing
          kept.
     77e  release: V138, cache, What's new (one line), About V138 / V137 /
          V136, plus 76f's lasting checks (76f retired).

   How it LOOKS — the first box on the page itself, both themes — was checked
   in Chromium at 390×844 dark and 375×667 light (Playwright, not committed). */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp, populated } = require('../fixture');

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const html = (app) => app.doc.getElementById('app').innerHTML;

// The six pages and the tutorial each one opens (V137 1A), with each
// tutorial's step count from Tutorials (the walk) and from its page (none).
const PAGES = {
  settingsUser: 'engineer', settingsReport: 'branding', settingsReportContent: 'content',
  settingsItems: 'items', settingsBackup: 'backup', cloudSync: 'sync'
};
const CAT = {
  settingsUser: 'catUser', settingsReport: 'catReports', settingsReportContent: 'catReports',
  settingsItems: 'catTesting', settingsBackup: 'catData', cloudSync: 'catCloud'
};
const FULL      = { engineer: 10, branding: 10, content: 10, items: 11, backup: 7, sync: 9 };
const FROM_PAGE = { engineer: 9,  branding: 8,  content: 8,  items: 9,  backup: 5, sync: 7 };
const BACK_HERE = 'tap <strong>Finish</strong> — it brings you back to this page.';

function tap(app, action, arg) {
  const el = app.doc.createElement('button');
  el.dataset.action = action;
  if (arg !== undefined) el.dataset.arg = String(arg);
  app.doc.getElementById('app').dispatchEvent({
    type: 'click', target: el, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
  });
}
// The values a phone's inputs would show (as 76 — the stand-in page keeps no
// value="" from the markup, and the unsaved-typing guard reads the inputs).
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
// Open a page as the hub does, then paint it as the phone shows it (as 76).
function open(app, view) {
  app.state().settingsCategory = CAT[view];
  app.fn('setView')(view);
  app.fn('render')();
  for (const [id, v] of Object.entries(pageValues(app))) {
    const el = app.doc.getElementById(id);
    if (el) el.value = v;
  }
  app.fn('unsavedAfterRender')();
}
function key(app) { return app.run('_tutSteps()[state.tourStep].key'); }
function stepOn(app) {
  app.run('(() => { const s = _tutSteps()[state.tourStep]; if (s.go && s.run) s.run(); _tutAdvance(); })()');
}
function stepToEnd(app) {
  for (let i = 0; i < 40 && app.run('state.tourOpen && state.tourStep < _tutSteps().length - 1'); i++) stepOn(app);
}
const where = (app) => app.run('JSON.stringify({ view: _tut.st.view, cat: _tut.st.settingsCategory })');
// Does the markup hold an element matching this simple selector? (as 74d)
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
function realOf(app) {
  return app.run(`JSON.stringify(Object.keys(state).filter(k => !['view', 'tourOpen', 'tourStep'].includes(k)).sort().reduce((o, k) => {
    o[k] = (k === 'photoMgr' || k === 'jobMgr') ? Object.assign({}, state[k], { gen: 0, thumbGen: 0 }) : state[k];
    return o;
  }, {}))`);
}

module.exports = async function () {

  /* ------------------------------------------------------------------ 77a */
  await t.group('77a — from its page: starts on that page, all six (1A)', () => {
    for (const [view, id] of Object.entries(PAGES)) {
      const app = populated();
      open(app, view);
      tap(app, 'tut-show-me-how', id);
      t.ok(app.run('state.tourOpen'), `${id}: the tap opens it`);
      t.eq(app.run('_tut.st.view'), view, `${id}: the practice starts on ${view}`);
      t.eq(app.run('state.tourStep'), 0, `${id}: …at its first step`);
      t.notOk(['group', 'page'].includes(key(app)), `${id}: the first step isn't a walk step (${key(app)})`);
      t.deepEq(app.run("_tutSteps().filter(s => s.key === 'group' || s.key === 'page').length"), 0, `${id}: no walk step anywhere`);
      t.eq(app.run('_tutSteps().length'), FROM_PAGE[id], `${id}: ${FROM_PAGE[id]} steps (${FULL[id]} from Tutorials)`);
      const shown = html(app);
      t.includes(shown, `Step 1 of ${FROM_PAGE[id]}`, `${id}: the card counts from here`);
      t.excludes(shown, 'This is Settings.', `${id}: the card doesn't say "This is Settings"`);
      const first = app.run('_tutSteps()[0].target');
      t.ok(first && inMarkup(shown, first), `${id}: the first box's control is on the drawn page (${first})`);
    }
  });

  /* ------------------------------------------------------------------ 77b */
  await t.group('77b — exactly where the walk leaves it; from Tutorials unchanged', () => {
    for (const [view, id] of Object.entries(PAGES)) {
      // The walk, from Tutorials: tap through its own steps to the page.
      const walked = populated();
      walked.fn('openTutorial')(id, 'settingsTutorials');
      t.eq(walked.run('_tut.fromPage'), false, `${id} from Tutorials: not from the page`);
      t.eq(key(walked), 'group', `${id} from Tutorials: still starts on its Settings group`);
      t.eq(walked.run('_tut.st.view'), 'settings', `${id} from Tutorials: …on the Settings list`);
      t.eq(walked.run('_tutSteps().length'), FULL[id], `${id} from Tutorials: all ${FULL[id]} steps`);
      t.includes(html(walked), `Step 1 of ${FULL[id]}`, `${id} from Tutorials: the card counts all of them`);
      let walkSteps = 0;
      while (['group', 'page'].includes(key(walked)) && walkSteps++ < 5) stepOn(walked);
      // From its page: the same place, the same next step.
      const app = populated();
      open(app, view);
      tap(app, 'tut-show-me-how', id);
      t.eq(where(app), where(walked), `${id}: the page and Settings group exactly as the walk leaves them`);
      t.eq(key(app), key(walked), `${id}: …and the same next step (${key(walked)})`);
      t.eq(walkSteps, FULL[id] - FROM_PAGE[id], `${id}: the steps left out are the walk's ${walkSteps}`);
      // The last card from Tutorials keeps its own words.
      stepToEnd(walked);
      const said = walked.run('_tutStepText(_tutSteps()[state.tourStep])');
      t.excludes(said, BACK_HERE, `${id} from Tutorials: the last card keeps its own words`);
      t.includes(html(walked), said, `${id} from Tutorials: …drawn`);
    }
    // Opened from Tutorials, Engineer still ends with Next up and Next tutorial (V135 8A).
    const app = populated();
    app.fn('openTutorial')('engineer', 'settingsTutorials');
    stepToEnd(app);
    t.includes(html(app), 'Next up: your company and logo.', 'Engineer from Tutorials: "Next up" still there…');
    t.includes(html(app), 'data-action="tut-next-tutorial">Next tutorial</button>', '…with Next tutorial');
  });

  /* ------------------------------------------------------------------ 77c */
  await t.group('77c — the last card from the page: Finish brings you back (2A)', () => {
    for (const [view, id] of Object.entries(PAGES)) {
      const app = populated();
      open(app, view);
      tap(app, 'tut-show-me-how', id);
      stepToEnd(app);
      t.eq(key(app), 'done', `${id}: at the last card`);
      const shown = html(app);
      t.includes(shown, BACK_HERE, `${id}: says Finish brings you back to this page`);
      t.excludes(shown, 'Next up', `${id}: no "Next up" (Finish only)`);
      t.excludes(app.run('_tutStepText(_tutSteps()[state.tourStep])'), 'Settings →', `${id}: no directions back through Settings — Finish takes you there`);
      t.includes(shown, 'data-action="tut-quit">Finish</button>', `${id}: …Finish`);
      t.excludes(shown, 'data-action="tut-next-tutorial"', `${id}: …and no Next tutorial`);
    }
    t.eq(populated().run("TUTORIALS.filter(d => d.steps.some(s => s.fromPage)).map(d => d.id).join()"),
      'engineer,branding,content,items,backup,sync', 'the six page tutorials have the words, no other');
    t.eq(populated().run("TUTORIALS.reduce((n, d) => n + d.steps.filter(s => s.fromPage && s.key !== 'done').length, 0)"), 0,
      '…and only on their last card');
    const said = populated().run("TUTORIALS.filter(d => d.page).map(d => d.steps.find(s => s.key === 'done').fromPage)");
    t.ok(said.every(s => s.startsWith('That’s ') && s.includes(BACK_HERE)), '…each names its page and says Finish brings you back');
    t.includes(said[4], 'Nothing in this tutorial made a file.', 'Backup: still says no file was made');
    t.includes(said[5], 'Nothing in this tutorial was sent, checked or changed.', 'Sync: still says nothing was sent');
  });

  /* ------------------------------------------------------------------ 77d */
  await t.group('77d — run through from the page: every box, Quit on the first step, nothing kept', () => {
    for (const [view, id] of Object.entries(PAGES)) {
      const app = populated();
      app.run("state.engineer = 'ZZ Real Engineer'; save();");
      open(app, view);
      const storeBefore = JSON.stringify(app.storage._snapshot());
      const dataBefore = realOf(app);
      tap(app, 'tut-show-me-how', id);
      const missing = [];
      let n = 0, seenDone = false;
      for (; n < 40 && app.run('state.tourOpen'); n++) {
        const s = app.run('(() => { const s = _tutSteps()[state.tourStep]; return { key: s.key, target: s.target, when: !!s.when }; })()');
        const shown = html(app);
        if (s.target && !s.when && !inMarkup(shown, s.target)) missing.push(s.key + ' ' + s.target);
        if (!shown.includes(`Step ${app.run('state.tourStep') + 1} of ${FROM_PAGE[id]}`)) missing.push(s.key + ' count');
        if (s.key === 'done') { seenDone = true; app.fn('closeTour')(); break; }
        stepOn(app);
      }
      t.deepEq(missing, [], `${id}: every step's box on its screen, each counted of ${FROM_PAGE[id]}`);
      t.ok(seenDone, `${id}: ran through to its last card`);
      t.eq(app.state().view, view, `${id}: Finish → back on ${view}`);
      // Quit on the first step: back on the page too.
      open(app, view);
      tap(app, 'tut-show-me-how', id);
      tap(app, 'tut-quit');
      t.notOk(app.run('state.tourOpen'), `${id}: Quit on the first step closes it`);
      t.eq(app.state().view, view, `${id}: …back on ${view}`);
      t.eq(JSON.stringify(app.storage._snapshot()), storeBefore, `${id}: storage exactly as it was`);
      t.eq(realOf(app), dataBefore, `${id}: every real value exactly as it was`);
    }
  });

  /* ------------------------------------------------------------------ 77e */
  await t.group('77e — release: V138, cache, What’s new, About, Tutorials', () => {
    const app = freshApp();
    t.eq(app.run('APP_VERSION'), 'V138', 'APP_VERSION V138');
    t.eq(app.run('WELCOME_VERSION'), 'V138', 'What’s new rolled');
    t.includes(read('sw.js'), "const CACHE_VERSION = 'pat-v138';", 'cache key pat-v138');
    const core = read('render-core.js');
    const at = core.indexOf('<ul class="welcome-list sheet-scroll">');
    const sheetCopy = core.slice(at, core.indexOf('</ul>', at));
    t.eq((sheetCopy.match(/<li>/g) || []).length, 1, 'What’s new: one line');
    t.includes(sheetCopy, '<li><strong>Show me how starts on the page.</strong>', '…Show me how starts on the page');
    t.includes(core, 'New here? Try the practice job.', 'setup offers the practice job');
    t.includes(core, 'You can do it again any time from Settings → Help → Tutorials.', '…and says where it lives');
    const help = read('render-help.js');
    const a = help.indexOf('<p><strong>V138</strong>'), b = help.indexOf('<p><strong>V137</strong>'), c = help.indexOf('<p><strong>V136</strong>');
    t.ok(a > -1 && b > a && c > b, 'About: V138, V137, V136');
    t.excludes(help, '<p><strong>V135</strong>', 'V135 rolled off');
    t.includes(help, 'Show me how now starts on the page you opened it from', 'About: V138’s line');
    t.includes(help, 'Show me how: a link under the title of each Settings page a tutorial covers', 'About: V137’s line still there');
    t.includes(help, 'Your jobs &amp; the cloud tutorials: the Jobs list, finding and bringing back a job', 'About: V136’s line still there');
    t.includes(help, 'A signed-in phone also tells the cloud which version of the app it is running.', 'Privacy unchanged');
    t.includes(help, 'data-action="settings-page" data-arg="settingsTutorials"', 'About points at Tutorials');
    t.eq(app.run("SETTINGS_CATEGORIES.find(c => c.id === 'catHelp').pages[0]"), 'settingsTutorials', 'Tutorials heads the Help group');
    const al = ' ' + app.run('SETTINGS_PAGE_META.settingsTutorials.aliases') + ' ';
    t.ok(/ tutorial /.test(al) && / practice /.test(al), 'search finds it by tutorial or practice');
    t.ok(/ settings /.test(al) && / instrument /.test(al) && / backup /.test(al), '…and by settings, instrument or backup (V135)');
    app.fn('setView')('settingsTutorials');
    const page = html(app);
    t.includes(page, 'data-action="open-practice"', 'the page starts the practice job');
    t.includes(page, 'Nothing you do in it is saved', '…and says nothing is kept');
    const rows = [...page.slice(0, page.indexOf('id="tutorials-cloud-list"')).matchAll(/data-action="open-tutorial" data-arg="([^"]+)"/g)].map(m => m[1]);
    t.deepEq(rows, ['engineer', 'branding', 'content', 'items', 'backup'], 'the page lists the five Settings tutorials under Setting up');
    t.includes(page, 'Nothing you do in them is saved', '…and says nothing is kept');
    t.excludes(page, 'data-action="tut-show-me-how"', 'the Tutorials page itself has no Show me how');
    t.eq(app.run('typeof TOUR_SLIDES'), 'undefined', 'the five picture slides stay retired');
    t.eq(app.run('TUT_STEPS.length'), 21, 'the practice job: 21 steps (V134.1, unchanged)');
    t.includes(read('styles.css'), '.tut-howto-row {', 'the Show me how line has its own style (V137)');
    t.includes(read('dispatch.js'), "'tut-show-me-how': (arg) => tutShowMeHow(arg),", 'the tap is wired (V137)');
  });
};
