/* Standing test — V134.1 hotfix: the practice job, round 2
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS HOTFIX DID. Peter tried V134 on his iPhone (18 Oct): the photos
   step and the presets step did nothing when tried, the page jumped about at
   every step (the real testing screen never moves), and the end left a dot in
   the middle of the screen. Locked: 0A a hotfix (cache key only); 1A photos
   work in the practice — the camera opens, the photo shows in the fail sheet,
   nothing is stored; 2A three example presets, a press-and-hold step that
   opens the real preset sheet, then "Tap Kitchen"; 3A the screen stays still —
   the card moves to the clear end instead, and the page scrolls only when a
   control would be off the screen; 4A a clean finish (no box, no dim, no dot)
   and free practice.

     73a  photos: the camera tap waits for a photo; the photo is the
          practice's and is shown in the real strip; logging the fail never
          lets go of the phone's own photo previews; the end lets go of the
          practice's.
     73b  presets: three example presets; the hold step takes a hold, not a
          tap; the hold opens the sheet; Kitchen switches the buttons; the
          phone's own presets untouched.
     73c  the still screen: tutCardEnd puts the card at the clear end and
          scrolls nothing unless it must; no room added below the screen; a
          sheet's control puts the card at the top.
     73d  the finish: no box at all on the last step; Finish and Free practice.
     73e  free practice: the everyday taps work on the practice only; anything
          else just says so; storage and the phone's data untouched.
     73f  (retired V135 → 74f) release: cache pat-v134-1; APP_VERSION and What's new unchanged.

   How it looks — the box on every target with the page at scroll 0 on every
   step, the camera, the hold, free practice — was checked in Chromium at
   390×844 (Playwright, not committed). */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { populated } = require('../fixture');

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const html = (app) => app.doc.getElementById('app').innerHTML;

// As Skip and Next do (Next runs a look step's `run` too — the asset step
// types the location), without the pause after a log.
function stepOn(app) {
  app.run('(() => { const s = TUT_STEPS[state.tourStep]; if (s.run) s.run(); _tutAdvance(); })()');
}
// The stub DOM can't find the photo button, so the photo step (shown only
// when its button is there) passes itself on a render — put the practice on
// it directly, after FAIL has opened the sheet.
function toPhoto(app) {
  stepTo(app, 'fail');
  app.run('TUT_STEPS[state.tourStep].run()');
  app.run("state.tourStep = TUT_STEPS.findIndex(s => s.key === 'photo')");
}
function stepTo(app, key) {
  for (let i = 0; i < 40 && app.run('state.tourOpen'); i++) {
    if (app.run('TUT_STEPS[state.tourStep].key') === key) return true;
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
// A free-practice tap on a control with this action, through the same door a
// real tap uses (#tut-practice's tut-tap → tutTap). The stub DOM has no
// attribute selectors, so the tapped control is a stand-in that answers them.
function freeTap(app, act, arg) {
  app.run(`tutTap('', null, { target: { closest: () => ({ getAttribute: (k) => ({ 'data-tut-action': ${JSON.stringify(act)}, 'data-arg': ${JSON.stringify(arg || '')} })[k] || null }) } })`);
}
const items = (app) => app.run('_tutSession() ? _tutSession().items.map(i => i.itemType + ":" + i.result) : []');

module.exports = async function () {

  /* ------------------------------------------------------------------ 73a */
  await t.group('73a — photos in the practice (1A)', () => {
    const app = populated();
    const realPending = app.run('JSON.stringify(state.pendingPhotos || [])');
    app.fn('openPractice')('sessions');
    toPhoto(app);
    t.eq(app.run('TUT_STEPS[state.tourStep].key'), 'photo', 'on the photo step');
    const at = app.run('state.tourStep');
    // The tap opens the camera (a file box of the practice's own) and waits.
    app.run('_tutDo(false)');
    t.eq(app.run('state.tourStep'), at, 'tapping Add photo waits for the photo — it does not move on');
    // A photo arrives.
    app.run("_tutAddPhoto(new Blob(['jpeg']))");
    t.eq(app.run('_tut.st.pendingPhotos.length'), 1, 'the photo is the practice’s');
    t.eq(app.run('JSON.stringify(state.pendingPhotos || [])'), realPending, 'the phone’s own staged photos untouched');
    t.ok(/class="photo-thumb"><img src="blob:stub\//.test(html(app).replace(/\s+/g, ' ').replace(/> </g, '><')), 'shown in the real fail-sheet strip');
    // Logging the fail must not call photoReleaseObjectUrls (the phone's previews).
    app.run('globalThis.__tutRel = 0; const __r = photoReleaseObjectUrls; photoReleaseObjectUrls = function () { globalThis.__tutRel++; return __r.apply(this, arguments); };');
    app.run("_tutFailReason('Damaged Plug')");
    t.eq(app.run('globalThis.__tutRel'), 0, 'logging the fail never lets go of the phone’s photo previews');
    t.eq(app.run('_tut.st.pendingPhotos.length'), 0, '…the practice’s photo is cleared from the form');
    // The end lets go of the practice's photo.
    app.run('globalThis.__tutRev = 0; const __u = URL.revokeObjectURL; URL.revokeObjectURL = function (u) { globalThis.__tutRev++; return __u.call(URL, u); };');
    app.fn('closeTour')();
    t.eq(app.run('globalThis.__tutRev'), 1, 'the end lets go of the practice photo');
    // Skip moves on without a photo.
    app.fn('openPractice')('sessions');
    toPhoto(app);
    const at2 = app.run('state.tourStep');
    app.fn('tourSkip')();
    t.ok(app.run('state.tourStep') === at2 + 1, 'Skip moves on without one');
    app.fn('closeTour')();
  });

  /* ------------------------------------------------------------------ 73b */
  await t.group('73b — presets in the practice (2A)', () => {
    const app = populated();
    const realPresets = app.run('JSON.stringify([state.itemPresets, state.activePresetId, state.itemTypes])');
    app.fn('openPractice')('sessions');
    t.deepEq(app.run('_tut.st.itemPresets.map(p => p.name)'), ['Office', 'Kitchen', 'Workshop'], 'three example presets');
    t.ok(stepTo(app, 'presets'), 'the practice reaches the presets step');
    const at = app.run('state.tourStep');
    // A tap is not a hold.
    const root = app.doc.getElementById('tut-practice');
    const want = app.doc.createElement('div');
    want.contains = (x) => x === want;
    root.querySelector = () => want;
    app.fn('tutTap')('', root, { target: want });
    t.eq(app.run('state.tourStep'), at, 'a tap on the buttons does not count — it takes a hold');
    app.run('_tutHold()');
    t.ok(app.run('_tut.st.presetSheetOpen'), 'the hold opens the preset sheet');
    t.includes(html(app), 'data-tut-action="preset-sheet-pick" data-arg="tutorial-kitchen"', 'the real preset sheet lists Kitchen');
    t.eq(app.run('TUT_STEPS[state.tourStep].key'), 'preset-pick', '…and the step moves on to it');
    app.fn('tourSkip')();
    t.eq(app.run('_tut.st.activePresetId'), 'tutorial-kitchen', 'Kitchen chosen');
    t.eq(app.run('_tut.st.itemTypes[0]'), 'Kettle', 'the buttons are the kitchen items');
    t.includes(html(app), 'data-type="Kettle"', '…on screen');
    t.eq(app.run('JSON.stringify([state.itemPresets, state.activePresetId, state.itemTypes])'), realPresets, 'the phone’s own presets untouched');
    app.fn('closeTour')();
  });

  /* ------------------------------------------------------------------ 73c */
  await t.group('73c — the screen stays still; the card moves (3A)', () => {
    const app = populated();
    const end = (a, b, c, v) => app.run(`JSON.stringify(tutCardEnd(${a}, ${b}, ${c}, ${v}))`);
    t.eq(end(100, 150, 190, 844), JSON.stringify({ end: 'bottom', dy: 0 }), 'a control near the top: card at the bottom, no scroll');
    t.eq(end(480, 600, 190, 844), JSON.stringify({ end: 'top', dy: 0 }), 'PASS low down: card at the top, no scroll');
    t.eq(end(300, 400, 190, 844), JSON.stringify({ end: 'bottom', dy: 0 }), 'the middle, upper half: bottom');
    t.ok(JSON.parse(end(900, 950, 190, 844)).dy > 0, 'a control below the screen: the page scrolls, the one time it must');
    t.ok(JSON.parse(end(150, 750, 190, 844)).dy !== 0, 'a control too tall for either end: it scrolls rather than hide it');
    const css = read('styles.css');
    const i = css.indexOf('\n.tut-practice {');
    t.excludes(css.slice(i, css.indexOf('}', i)), 'vh', 'no room added below the screen — the page is the real screen’s length');
    t.includes(read('tour.js'), "const pick = sheet ? { end: 'top', dy: 0 } : tutCardEnd(", 'a control in a sheet: the card at the top (browser check)');
    t.includes(read('tour.js'), "if (_tut.screen && _tut.screen !== screen) { try { window.scrollTo(0, 0); }", 'a new screen starts at the top, as in the app');
  });

  /* ------------------------------------------------------------------ 73d */
  await t.group('73d — the finish: no box, no dot; Finish or free practice (4A)', () => {
    const app = populated();
    app.fn('openPractice')('sessions');
    t.ok(stepTo(app, 'done'), 'the practice reaches the end');
    const shown = html(app);
    t.includes(shown, 'data-action="tut-quit">Finish</button>', 'Finish');
    t.includes(shown, 'data-action="tut-free">Free practice</button>', 'Free practice');
    t.excludes(shown, 'data-action="tut-next"', 'no Next on the last step');
    t.ok(/\.tut-ring\.tut-ring-off \{ display: none; \}/.test(read('styles.css')), 'no target: the box and its dim go entirely (the dot)');
    t.includes(read('tour.js'), "ring.classList.add('tut-ring-off');", '…which a step with no target sets');
    app.fn('closeTour')();
  });

  /* ------------------------------------------------------------------ 73e */
  await t.group('73e — free practice: the everyday taps, on the practice only (4A)', () => {
    const app = populated();
    app.fn('setView')('settingsTutorials');
    const storeBefore = JSON.stringify(app.storage._snapshot());
    const dataBefore = realOf(app);
    app.fn('openPractice')('settingsTutorials');
    stepTo(app, 'done');
    app.fn('tutFree')();
    t.ok(app.run('_tut.free'), 'free practice');
    t.eq(app.run('_tut.st.view'), 'entry', 'on the testing screen');
    const shown = html(app);
    t.includes(shown, 'Free practice — nothing is saved', 'the bar says nothing is saved');
    t.includes(shown, 'class="btn-primary tut-bar-done" data-action="tut-quit">Finish</button>', '…with Finish');
    t.excludes(shown, 'id="tut-practice" data-action="tut-tap" aria-hidden="true"', 'the screen is the engineer’s — VoiceOver reads it');
    const n0 = items(app).length;
    freeTap(app, 'quick-pick', 'Toaster');
    freeTap(app, 'log-pass');
    t.eq(items(app).slice(-1)[0], 'Toaster:pass', 'an item button then PASS logs a pass');
    freeTap(app, 'quick-pick', 'Kettle');
    freeTap(app, 'log-fail');
    t.ok(app.run('_tut.st.failModalOpen'), 'FAIL opens the fail sheet');
    freeTap(app, 'fail-reason', 'Damaged Lead');
    t.eq(items(app).slice(-1)[0], 'Kettle:fail', 'a reason logs the fail');
    freeTap(app, 'copy-last');
    t.eq(items(app).length, n0 + 3, 'Copy last result logs another');
    freeTap(app, 'cursor-prev');
    freeTap(app, 'quick-pick', 'Toaster');
    freeTap(app, 'log-pass');
    t.eq(items(app).length, n0 + 3, 'Prev then PASS changes the item on screen, adding none');
    t.eq(items(app)[n0 + 2], 'Toaster:pass', '…the copied fail is now a pass');
    freeTap(app, 'go-overview');
    t.eq(app.run('_tut.st.view'), 'overview', 'Overview');
    freeTap(app, 'overview-back');
    t.eq(app.run('_tut.st.view'), 'entry', '…and back');
    const before = items(app).join('|');
    freeTap(app, 'show-notes');
    t.eq(items(app).join('|'), before, 'anything else does nothing…');
    t.notOk(app.run('state.form && state.form.showNotes'), '…and never runs the app’s own action');
    app.fn('tourNext')();
    app.fn('tourSkip')();
    t.ok(app.run('_tut.free'), 'Next and Skip have no say in free practice');
    // No typing in the practice: a blank location is filled, never a dead end.
    freeTap(app, 'skip-new');
    app.run("_tut.st.form.location = ''");
    freeTap(app, 'quick-pick', 'Fridge');
    freeTap(app, 'log-pass');
    t.eq(items(app).slice(-1)[0], 'Fridge:pass', 'a blank location still logs');
    t.eq(app.run('_tutSession().items.slice(-1)[0].location'), 'Office', '…at the practice’s location');
    app.fn('closeTour')();
    t.eq(app.run('state.view'), 'settingsTutorials', 'Finish lands back on Tutorials');
    t.eq(JSON.stringify(app.storage._snapshot()), storeBefore, 'storage exactly as it was');
    t.eq(realOf(app), dataBefore, 'every real value exactly as it was');
  });

  /* ------------------------------------------------------------------ 73f */
  // 73f retired V135 (→ 74f): the release checks move with each release
  // (cache key, APP_VERSION, What's new). The 21 practice steps are pinned by 72d.
};
