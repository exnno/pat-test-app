/* Standing test — V130: the housekeeping release (the stragglers round, part 1)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked (16 Oct, Peter "1B 2A 3A 4A 5A"):
   1B  DEFENCE 3: the mutation runner aborts a mutation whose anchor occurs more
       than once (as it already did for none), and run.js checks every anchor
       the same way (01l, 01m). Harness only.
   2A  The two retired storage keys are gone from the code: the v43 mock
       sign-in (retired V79) and the V115 Classic emoji switch (retired V116),
       with load()'s clean-up of them and their factory-reset rows. 15e and
       53b now pin that nothing names them.
   3A  Manage Photos / Jobs on This Phone / Cloud Storage: the Backup page left
       the "Back goes where you came from" list — it has opened none of them
       since V97. 33f now opens from Phone Storage, where the button is.
   4A  About → Privacy no longer says the app makes no network calls: it says
       the cloud copy and the update check, honestly, until the privacy terms
       replace it.
   5A  About changelog line; no What's new (housekeeping).
   Claude's calls: M82 drops 15j from its hint; the Photos sheet scrolls its
   body, not its shell (MAP rule 14); the 10-second preview time-out in
   _syncThumbUpload gets its own test.

     68a  4A: the Privacy note as drawn — honest about the cloud and updates.
     68b  3A: through the real dispatcher — a manager opened while on the
          Backup page goes Back to Phone Storage (the fallback).
     68c  the Photos sheet: shell does not scroll; body does; buttons pinned.
     68d  the preview time-out: a picture that never decodes gives no preview
          after 10 s and uploads nothing; one that does is uploaded and the
          timer is cleared.
     68f  (retired V131 → 69f) release: V130, cache, What's new stays V129. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp, withSession, tick } = require('../fixture');

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const html = (app) => app.doc.getElementById('app').innerHTML;

function ready() {
  const app = freshApp();
  const st = app.state();
  st.welcomeSeen = true;
  st.onboardedV33Seen = true;
  st.migrationPrompt = { show: false, name: '', items: [] };
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
function draw(app, v) { app.fn('setView')(v); app.fn('render')(); return html(app); }

/* Held timers, as 13's captureTimers: nothing fires until the test says so. */
function holdTimers(app) {
  app.run(`
    globalThis.__held = [];
    globalThis.__realST = setTimeout; globalThis.__realCT = clearTimeout;
    setTimeout = function (fn, ms) { globalThis.__held.push({ fn: fn, ms: ms, live: true }); return globalThis.__held.length; };
    clearTimeout = function (id) { var s = globalThis.__held[id - 1]; if (s) { s.live = false; return; } return globalThis.__realCT(id); };
  `);
  return {
    list() { return app.run('globalThis.__held.map(function (s) { return { ms: s.ms, live: s.live }; })'); },
    fire() { app.run('globalThis.__held.forEach(function (s) { if (s.live) { s.live = false; s.fn(); } });'); },
    restore() { app.run('setTimeout = globalThis.__realST; clearTimeout = globalThis.__realCT;'); },
  };
}

module.exports = async function () {

  /* ------------------------------------------------------------------ 68a */
  await t.group('68a — About → Privacy says the cloud copy and the update check (4A)', () => {
    const app = ready();
    const p = draw(app, 'settingsAbout');
    t.excludes(p, 'makes no network calls', 'the old "no network calls" claim is gone');
    // V141: the records and cloud-copy sentences became the policy summary — 80a.
    t.includes(p, 'The app goes online to check for updates.', 'the update check, said plainly');
    t.includes(p, 'Backups are saved only where you choose to save them.', 'backups: where you choose');
  });

  /* ------------------------------------------------------------------ 68b */
  await t.group('68b — the Backup page is not a place Back returns to (3A)', () => {
    const app = ready();
    const backup = draw(app, 'settingsBackup');
    for (const a of ['pm-open', 'jm-open', 'cs-open', 'cs-photos']) {
      t.excludes(backup, `data-action="${a}"`, `the Backup page has no ${a} button`);
    }
    // Opened while on the Backup page anyway (a stale tap, a search hit): Back
    // falls through to Phone Storage, the shared fallback.
    app.fn('setView')('settingsBackup');
    tap(app, 'pm-open');
    t.eq(app.state().view, 'photoManager', 'Manage Photos opened');
    tap(app, 'pm-back');
    t.eq(app.state().view, 'settingsStorage', 'Back → Phone Storage, not the Backup page');
    app.fn('setView')('settingsBackup');
    tap(app, 'jm-open');
    t.eq(app.state().mgrReturnView, 'settingsStorage', 'Jobs on This Phone notes Phone Storage too');
  });

  /* ------------------------------------------------------------------ 68c */
  await t.group('68c — the Photos sheet scrolls its body; its buttons stay put', () => {
    const app = ready();
    const st = app.state();
    st.photoStripOpen = true;
    st.photoStripLoading = false;
    st.photoStripPhotos = [
      { id: 'ZZP1', cloud: true, bytes: 1000 },
      { id: 'ZZP2', cloud: true, bytes: 2000 },
    ];
    const s = app.fn('renderPhotoStripSheet')();
    t.includes(s, '<div class="bulk-sheet" role="dialog" aria-label="Photos on this item">', 'the shell carries no scroller');
    t.excludes(s, 'bulk-sheet sheet-scroll', '… not even alongside other classes');
    const head = s.indexOf('class="bulk-sheet-header"');
    const scr = s.indexOf('<div class="sheet-scroll">');
    const grid = s.indexOf('photo-strip-grid');
    const pin = s.indexOf('<div class="sheet-pin">');
    const dl = s.indexOf('photo-download-all');
    const add = s.indexOf('id="photo-strip-add-btn"');
    t.ok(head > -1 && scr > head, 'the header sits above the scroller (it stays put)');
    t.ok(grid > scr && grid < pin, 'the photos are inside the scroller');
    t.ok(pin > -1 && dl > pin && add > dl, 'Download all and Add another photo are pinned below it');
    // And the real render path draws the same sheet, on the logging screen.
    withSession(app);
    app.fn('setView')('entry');   // a change of screen closes any open sheet
    st.photoStripOpen = true;
    st.photoStripPhotos = [{ id: 'ZZP1', cloud: true, bytes: 1000 }];
    app.fn('render')();
    const screen = html(app);
    t.includes(screen, '<div class="bulk-sheet" role="dialog" aria-label="Photos on this item">', 'render() draws the same shell on the logging screen');
  });

  /* ------------------------------------------------------------------ 68d */
  await t.group('68d — a preview that never finishes: none after 10 s, nothing uploaded', async () => {
    const app = ready();
    const ups = [];
    const c = { storage: { from: () => ({ upload: (p) => { ups.push(p); return Promise.resolve({}); } }) } };
    const up = app.fn('_syncThumbUpload');

    app.run('photoThumbBlob = function () { return new Promise(function () {}); }');   // never decodes
    let timers = holdTimers(app);
    let done = null;
    up(c, 'ZZU', 'ZZID1', { size: 1 }).then((v) => { done = v; });
    await tick(5);
    let held = timers.list();
    t.eq(held.length, 1, 'one time-out is set');
    t.eq(held[0] && held[0].ms, 10000, '… of 10 seconds');
    t.eq(done, null, 'nothing settles before it fires');
    timers.fire();
    await tick(5);
    t.eq(done, false, 'after 10 s: no preview (false), the photo itself not held up');
    t.eq(ups.length, 0, 'nothing uploaded');
    timers.restore();

    app.run("photoThumbBlob = function () { return Promise.resolve(new Blob(['ZZTHUMB'], { type: 'image/jpeg' })); }");
    timers = holdTimers(app);
    done = null;
    up(c, 'ZZU', 'ZZID2', { size: 1 }).then((v) => { done = v; });
    await tick(5);
    held = timers.list();
    t.eq(done, true, 'a preview that decodes is uploaded (true)');
    t.eq(ups.length, 1, '… once');
    t.includes(String(ups[0]), 'ZZID2', '… under its own id');
    t.ok(held.length === 1 && held[0].live === false, 'and its time-out is cleared, not left to fire');
    timers.restore();
  });

  // 68f retired V131 (→ 69f): the release checks move with each release.
};
