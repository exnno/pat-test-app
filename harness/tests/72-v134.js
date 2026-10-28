/* Standing test — V134: Tutorials, part 1 — the practice job
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked (18 Oct, Peter): 1A tutorials in three
   releases — the engine + the practice job now, Settings V135, the rest V136.
   2A a practice copy that can't touch real work — "but it has to be identical
   to our current testing screen": so the practice draws the REAL screens
   (renderSessions / renderEntry / renderOverview) from its own data. 3B a box
   in PATGo blue that glides from control to control. 4A "look" steps (Next)
   and "do" steps (only the highlighted control works; Skip does it). 5A the
   practice steps. 6A Settings → Help → Tutorials, offered at the end of
   setup. 7A the five picture slides retired.

     72a  identical: every screen the practice shows is the real render
          function's markup for the practice's data, made touch-proof — no
          hand-made copy anywhere.
     72b  nothing kept: a whole practice on a phone with real jobs leaves its
          storage and its data exactly as they were; a write during a practice
          draw is refused, and storage works again afterwards.
     72c  a practice draw that throws still puts the real data back.
     72d  the steps: 19, every target is on the screen it teaches (so a renamed
          button fails here, not on a phone); do-steps have their tap; Finish
          returns to where it was opened.
     72e  touch-proof: no live app action in the practice screen, no box that
          can take the keyboard, and only the highlighted control's tap counts.
     72g  the box and the card: blue, glides as long as TUT_GLIDE_MS, no glide
          with reduced motion, only the highlighted control can be touched, a
          sheet is waited for, an open sheet doesn't slide in again.
     72f  (retired V135 → 74f) release: V134, cache, What's new rolled (one line), About V134 / V133
          / V132, Help → Tutorials, search words, setup's offer, old slides gone.

   How it LOOKS and FEELS (the glide, the card at the far end, the real
   certificate) was checked in Chromium at 390×844 and at iPhone SE size, light
   and dark — not committed. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp, populated } = require('../fixture');

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const html = (app) => app.doc.getElementById('app').innerHTML;

// Step the practice on, the way Skip and Next do, without the pause after a log.
function stepOn(app) {
  app.run('(() => { const s = TUT_STEPS[state.tourStep]; if (s.go && s.run) s.run(); _tutAdvance(); })()');
}
function stepTo(app, key) {
  for (let i = 0; i < 40 && app.run('state.tourOpen'); i++) {
    if (app.run('TUT_STEPS[state.tourStep].key') === key) return true;
    stepOn(app);
  }
  return false;
}
// Everything a phone keeps, minus where it is looking. photoMgr / jobMgr carry
// a counter every setView bumps on the way out (photoMgrLeave, jobMgrLeave) —
// navigation, which Quit is; their other fields are compared.
function realOf(app) {
  return app.run(`JSON.stringify(Object.keys(state).filter(k => !['view', 'tourOpen', 'tourStep'].includes(k)).sort().reduce((o, k) => {
    o[k] = (k === 'photoMgr' || k === 'jobMgr') ? Object.assign({}, state[k], { gen: 0, thumbGen: 0 }) : state[k];
    return o;
  }, {}))`);
}
// Does the markup hold an element matching this simple selector?
// '#id', '.a.b', 'tag', and [attr="v"] parts, as the steps use them.
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

module.exports = async function () {

  /* ------------------------------------------------------------------ 72a */
  await t.group('72a — identical: the practice draws the real screens (2A)', () => {
    const app = populated();
    app.fn('openPractice')('sessions');
    const views = { jobs: 'renderSessions', form: 'renderSessions', screen: 'renderEntry', reason: 'renderEntry', list: 'renderOverview' };
    for (const [key, fn] of Object.entries(views)) {
      t.ok(stepTo(app, key), `the practice reaches "${key}"`);
      const practice = app.run('_tutInert(_tutScreenHTML())');
      const st = app.run('JSON.stringify(_tut.st)');
      // A second, ordinary phone holding exactly the practice's data, drawn by
      // the real function — the two must be the same markup.
      const other = freshApp();
      other.run(`Object.assign(state, ${st}); state.tourOpen = false;`);
      const real = other.run(`_tutInert(${fn}())`);
      t.eq(practice, real, `"${key}" is ${fn}()'s own markup`);
    }
    // And on screen: the practice's PASS is the real PASS button.
    app.fn('closeTour')();
    app.fn('openPractice')('sessions');
    stepTo(app, 'pass');
    const shown = html(app);
    t.includes(shown, 'id="pass-btn" data-tut-action="log-pass"', 'the real PASS button is on screen');
    t.includes(shown, 'id="quick-grid"', 'the real Quick Pick grid');
    t.includes(read('tour.js'), "if (v === 'entry') return renderEntry();", 'the testing screen comes from renderEntry()');
  });

  /* ------------------------------------------------------------------ 72b */
  await t.group('72b — nothing kept: real work, storage and data untouched', () => {
    const app = populated();
    app.fn('setView')('settingsTutorials');
    const storeBefore = JSON.stringify(app.storage._snapshot());
    const dataBefore = realOf(app);
    const jobsBefore = app.run('state.sessions.length');
    app.fn('openPractice')('settingsTutorials');
    let n = 0;
    while (app.run('state.tourOpen') && n++ < 40) stepOn(app);
    t.notOk(app.run('state.tourOpen'), 'the practice ran to its end');
    t.eq(app.run('state.view'), 'settingsTutorials', 'Finish lands back on Tutorials');
    t.eq(JSON.stringify(app.storage._snapshot()), storeBefore, 'storage exactly as it was');
    t.eq(realOf(app), dataBefore, 'every real value exactly as it was');
    t.eq(app.run('state.sessions.length'), jobsBefore, 'no job added');
    t.notOk(/tutorial-/.test(JSON.stringify(app.storage._snapshot()) + app.run('JSON.stringify(state)')), 'no practice id anywhere real');

    // A write while the practice is drawn is refused — and only then.
    app.fn('openPractice')('sessions');
    const refused = app.run('_tutRefused');
    app.storage.setItem('zz-v134-keep', 'kept');
    app.run("_tutDraw(() => { localStorage.setItem('zz-v134', 'x'); localStorage.removeItem('zz-v134-keep'); })");
    t.eq(app.storage.getItem('zz-v134'), null, 'a write during a practice draw is refused');
    t.eq(app.storage.getItem('zz-v134-keep'), 'kept', '…and so is a removal');
    t.eq(app.run('_tutRefused'), refused + 2, 'both counted');
    app.storage.setItem('zz-v134b', 'y');
    t.eq(app.storage.getItem('zz-v134b'), 'y', 'storage works again straight after');
    app.fn('closeTour')();
  });

  /* ------------------------------------------------------------------ 72c */
  await t.group('72c — a practice draw that throws still puts the real data back', () => {
    const app = populated();
    const before = realOf(app);
    app.fn('openPractice')('sessions');
    const sessRef = app.run('state.sessions');
    let threw = false;
    try { app.run("_tutDraw(() => { state.sessions.push({ id: 'tutorial-x' }); throw new Error('boom'); })"); } catch (e) { threw = /boom/.test(e.message); }
    t.ok(threw, 'the error reaches the caller');
    t.ok(app.run('state.sessions') === sessRef, 'the real job list is back in place');
    t.notOk(app.run("state.sessions.some(s => s.id === 'tutorial-x')"), 'the practice push stayed in the practice');
    app.storage.setItem('zz-v134c', 'z');
    t.eq(app.storage.getItem('zz-v134c'), 'z', 'storage is not left refusing');
    app.fn('closeTour')();
    t.eq(realOf(app), before, 'every real value as it was');
  });

  /* ------------------------------------------------------------------ 72d */
  await t.group('72d — the steps: every target is on the screen it teaches (4A, 5A)', () => {
    const app = populated();
    const steps = app.run('TUT_STEPS.map(s => ({ key: s.key, target: s.target, go: !!s.go, run: typeof s.run === "function" || typeof s.tap === "function", when: !!s.when }))');
    t.eq(steps.length, 21, '21 steps (V134.1: + the preset sheet and Kitchen)');
    t.eq(steps[0].key, 'jobs', 'starts on the Jobs list');
    t.eq(steps[steps.length - 1].key, 'done', 'ends on Done');
    t.eq(steps[steps.length - 1].target, '', '…with the whole screen dimmed');
    t.ok(steps.filter(s => s.go).every(s => s.run), 'every do-step has its tap');
    app.fn('openPractice')('sessions');
    const missing = [];
    for (let i = 0; i < 40 && app.run('state.tourOpen'); i++) {
      const s = app.run('TUT_STEPS[state.tourStep]');
      const shown = html(app);
      if (s.target && !inMarkup(shown, s.target)) missing.push(s.key + ' ' + s.target);
      const last = s.key === 'done';
      t.includes(shown, last ? 'data-action="tut-free">Free practice</button>' : (s.go ? 'data-action="tut-skip">Skip</button>' : 'data-action="tut-next">'), `${s.key}: ${last ? 'Free practice' : (s.go ? 'Skip' : 'Next')}`);
      t.includes(shown, `Step ${app.run('state.tourStep') + 1} of 21`, `${s.key}: says which step`);
      stepOn(app);
    }
    t.deepEq(missing, [], 'every step\'s target is on its screen');
    // Setup's "Start the practice job" lands back on the Jobs list.
    app.fn('setView')('settings');
    app.fn('openTour')();
    app.fn('closeTour')();
    t.eq(app.run('state.view'), 'sessions', 'from setup, Quit lands on the Jobs list');
  });

  /* ------------------------------------------------------------------ 72e */
  await t.group('72e — touch-proof: only the highlighted control counts', () => {
    const app = populated();
    app.fn('openPractice')('sessions');
    stepTo(app, 'pass');
    const shown = html(app);
    const acts = [...shown.matchAll(/\sdata-action="([^"]+)"/g)].map(m => m[1]);
    t.deepEq(acts, ['tut-tap', 'tut-quit', 'tut-skip'], 'the only live actions: the practice tap, Quit, Skip');
    const boxes = [...shown.matchAll(/<(input|textarea|select)\b[^>]*>/g)].map(m => m[0]);
    t.ok(boxes.length > 0, 'the testing screen has its boxes');
    t.deepEq(boxes.filter(b => !/\sreadonly tabindex="-1"/.test(b)), [], 'every box readonly, out of the tab order — no keyboard');
    t.excludes(shown, 'id="screen-title" role="heading"', 'the practice screen\'s title is not the page title');

    // A tap: off the box, nothing; on it, the step is done.
    const root = app.doc.getElementById('tut-practice');
    const want = app.doc.createElement('button');
    const other = app.doc.createElement('button');
    want.contains = (x) => x === want;   // the stub has no tree (stubs.js)
    root.querySelector = () => want;
    const at = app.run('state.tourStep');
    app.fn('tutTap')('', root, { target: other });
    t.eq(app.run('state.tourStep'), at, 'a tap elsewhere does nothing');
    t.eq(app.run('_tutSession().items.length'), 0, '…and logs nothing');
    app.fn('tutTap')('', root, { target: want });
    t.eq(app.run('_tutSession().items.length'), 1, 'a tap on PASS logs the practice item');
    t.eq(app.run('_tutSession().items[0].result'), 'pass', '…as a pass');
    app.fn('closeTour')();
    // Next does nothing on a do-step; Skip does nothing on a look-step.
    app.fn('openPractice')('sessions');
    app.fn('tourNext')();
    t.eq(app.run('state.tourStep'), 0, 'Next can\'t pass a do-step');
    stepTo(app, 'screen');
    const s0 = app.run('state.tourStep');
    app.fn('tourSkip')();
    t.eq(app.run('state.tourStep'), s0, 'Skip has no say on a look-step');
    app.fn('closeTour')();
  });

  /* ------------------------------------------------------------------ 72g */
  await t.group('72g — the box and the card (3B), and what the browser check found', () => {
    const css = read('styles.css');
    const tour = read('tour.js');
    const rule = (sel) => { const i = css.indexOf('\n' + sel + ' {'); return i < 0 ? '' : css.slice(i, css.indexOf('}', i)); };
    const ring = rule('.tut-ring');
    t.includes(ring, 'border: 3px solid var(--accent);', 'the box is PATGo blue (3B)');
    t.includes(ring, 'pointer-events: none;', 'the box never takes a tap');
    const ms = Number((tour.match(/const TUT_GLIDE_MS = (\d+);/) || [])[1]);
    // V146 (6A): the box glides by transform (not top/left), same length.
    t.includes(ring, `transition: transform ${ms}ms cubic-bezier(0.22, 1, 0.36, 1), width ${ms}ms cubic-bezier(0.22, 1, 0.36, 1), height ${ms}ms cubic-bezier(0.22, 1, 0.36, 1)`, 'the glide is TUT_GLIDE_MS long');
    t.ok(/@media \(prefers-reduced-motion: reduce\) \{\s*\.tut-ring \{ transition: none; \}/.test(css), 'reduced motion: the box jumps');
    t.includes(rule('.tut-practice'), 'pointer-events: none;', 'nothing in the practice screen can be touched…');
    t.includes(css, '.tut-practice .tut-live,\n.tut-practice .tut-live * { pointer-events: auto;', '…but the highlighted control');
    const dims = (css.match(/--tut-dim: /g) || []).length;
    t.eq(dims, 3, 'the dimmed surround in light, dark and forced dark');
    t.includes(tour, "sheet.getAnimations().filter((a) => a.playState === 'running')", 'a sliding sheet is waited for (browser check)');
    t.includes(css, '.tut-still .fail-sheet,\n.tut-still .bulk-sheet,   /* V135: the New preset sheet */\n.tut-still .modal-backdrop { animation: none; }', 'an open sheet doesn\'t slide in again (V135: + the New preset sheet)');
    t.excludes(tour, 'stampCertNumber(', 'the sample certificate uses no number');
  });

  /* ------------------------------------------------------------------ 72f */
  // 72f retired V135 (→ 74f): the release checks move with each release. Its
  // lasting checks (setup's offer, Tutorials first in Help and found by
  // search, the page starting the practice job, the slides gone, About
  // pointing at Tutorials, Privacy) moved to 74f with it.
};
