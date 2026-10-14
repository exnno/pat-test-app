/* Standing test — V124: friendlier updates (Stage 12)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked (14 Oct, Peter "0A 1A 2A 3A 4A"):
   Before V124 the app looked for a new version only on a cold launch. An iPhone
   home-screen app is mostly brought back from the background, which never
   looked — hence "close it from the app switcher and reopen twice".
   1A  It looks on launch, on every return to the front (at most once a minute)
       and at least hourly while in use (riding the next touch — no timer).
   2A  It puts the update in BY ITSELF only at a safe moment: the Jobs list,
       showing, nothing open, nothing typed, no push in flight, untouched for
       UPDATE_IDLE_MS. Anywhere else the banner, and the engineer chooses
       (v61.2: never reload under someone mid-job). × hides the banner only.
   3A  The banner names the version, asked of the waiting worker (sw.js
       GET_VERSION on a private port); an older worker never answers.
   4A  No switch (an exception to R30).

     62a  3A: the worker answers GET_VERSION with its key on the port it was
          sent; SKIP_WAITING unchanged; the label ('pat-v124' → 'V124',
          'pat-v124-1' → 'V124.1'); the page asks and keeps only the answer of
          the worker still waiting.
     62b  1A: launch, return to the front, hourly — through the REAL surfaces
          (window load → register; document visibilitychange; pointerdown).
     62c  2A: the safe moment — every blocker on its own refuses; all clear
          applies, once; render() and a touch arm the look; the look fires.
     62d  the banner: names the version, plain words otherwise; × hides it but
          the update stays waiting; a found update never redraws under a sheet
          or the cursor (MAP rule 3).
     62e  v61.2 stands (source): the worker never skips waiting at install; the
          only ways to SKIP_WAITING are Refresh and the safe moment.
     62f  release: V124, What’s new rolled, cache, changelog. (61f → 62f.)

   ⚠ 62c's blocker list is the definition of "safe". A new thing that can be
   open on the Jobs list (a sheet drawn there, a select mode) must be added to
   updateSafeMoment() AND to the list here, or the app could reload under it. */

'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp, tick } = require('../fixture');

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const html = (app) => app.doc.getElementById('app').innerHTML;
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* A fresh app on the Jobs list, past every first-run sheet. */
function ready(opts) {
  const app = freshApp(opts);
  const st = app.state();
  st.welcomeSeen = true;
  st.onboardedV33Seen = true;
  st.migrationPrompt = { show: false, name: '', items: [] };
  st.view = 'sessions';
  st.newForm.show = false;   // a phone with jobs (one with none opens on the form)
  return app;
}

/* A waiting worker that records what it was sent. */
function fakeWorker() {
  const w = { sent: [], postMessage(msg, ports) { w.sent.push({ msg, ports }); } };
  return w;
}

/* An update waiting, nobody touching: every condition of the safe moment met. */
function waiting(app) {
  const st = app.state();
  const w = fakeWorker();
  st.updateAvailable = true;
  st.pendingWorker = w;
  app.run('_updateLastTouch = 0; _updateApplying = false; if (_updateTimer) { clearTimeout(_updateTimer); _updateTimer = null; }');
  return w;
}
const skipped = (w) => w.sent.filter(s => s.msg && s.msg.type === 'SKIP_WAITING').length;
const stopTimer = (app) => app.run('if (_updateTimer) { clearTimeout(_updateTimer); _updateTimer = null; }');

/* sw.js in a box of its own, as the browser runs it. */
function bootWorker() {
  const listeners = {};
  const self = {
    skipped: 0,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    skipWaiting() { self.skipped++; },
    clients: { claim() { return Promise.resolve(); } },
  };
  const ctx = vm.createContext({ self, caches: { open: () => Promise.resolve({ addAll: () => Promise.resolve() }), keys: () => Promise.resolve([]) }, fetch: () => Promise.reject(new Error('offline')), Request: function (u) { this.url = u; }, Promise, console });
  vm.runInContext(read('sw.js'), ctx, { filename: 'sw.js' });
  return { self, listeners, send(data, ports) { (listeners.message || []).forEach(fn => fn({ data, ports })); } };
}

module.exports = async function run() {

  /* ------------------------------------------------------------------ 62a */
  await t.group('62a — the worker says which version it is (3A)', () => {
    const sw = bootWorker();
    const got = [];
    sw.send({ type: 'GET_VERSION' }, [{ postMessage: (m) => got.push(m) }]);
    t.eq(got.length, 1, 'GET_VERSION: one answer, on the port sent');
    t.eq(got[0] && got[0].version, 'pat-v124', '… carrying this worker’s cache key');
    t.doesNotThrow(() => sw.send({ type: 'GET_VERSION' }), 'no port sent: no answer, no throw');
    t.doesNotThrow(() => sw.send({ type: 'GET_VERSION' }, []), 'an empty port list: no throw');
    sw.send({ type: 'SKIP_WAITING' });
    t.eq(sw.self.skipped, 1, 'SKIP_WAITING still activates the worker');
    sw.send({ type: 'GET_VERSION' }, [{ postMessage() {} }]);
    t.eq(sw.self.skipped, 1, 'asking the version never activates it');

    const app = ready();
    const label = app.fn('updateVersionLabel');
    t.eq(label('pat-v124'), 'V124', 'pat-v124 → V124');
    t.eq(label('pat-v124-1'), 'V124.1', 'a hotfix key pat-v124-1 → V124.1');
    t.eq(label('pat-v125-12'), 'V125.12', 'two-figure hotfix');
    t.eq(label('pat-v'), '', 'no number → nothing');
    t.eq(label('<img src=x>'), '', 'anything else → nothing (never drawn)');
    t.eq(label(undefined), '', 'no answer → nothing');

    // The page asks on a private port and keeps the answer of THIS worker only.
    const ports = [];
    app.sandbox.MessageChannel = function () {
      const p1 = { onmessage: null }, p2 = { id: ports.length };
      ports.push(p1);
      this.port1 = p1; this.port2 = p2;
    };
    const w = fakeWorker();
    const st = app.state();
    st.updateAvailable = true; st.pendingWorker = w; st.updateVersion = '';
    t.ok(app.fn('updateAskVersion')(w), 'asked');
    t.eq(w.sent[0] && w.sent[0].msg.type, 'GET_VERSION', 'the worker was sent GET_VERSION');
    t.ok(w.sent[0] && Array.isArray(w.sent[0].ports) && w.sent[0].ports.length === 1, '… with a port to answer on');
    ports[0].onmessage({ data: { version: 'pat-v125' } });
    t.eq(app.state().updateVersion, 'V125', 'the answer becomes the banner’s version');
    t.includes(html(app), 'PATGo V125 is ready', '… and the banner is redrawn with it');

    const w2 = fakeWorker();
    app.fn('updateAskVersion')(w2);
    app.state().pendingWorker = fakeWorker();     // a newer one took its place
    app.state().updateVersion = '';
    ports[1].onmessage({ data: { version: 'pat-v126' } });
    t.eq(app.state().updateVersion, '', 'a worker no longer waiting is not believed');
    stopTimer(app);
  });

  /* ------------------------------------------------------------------ 62b */
  await t.group('62b — it looks: launch, back to the front, hourly (1A)', async () => {
    const app = ready();
    const docL = app.doc._listeners || {};
    t.ok((docL.visibilitychange || []).includes(app.run('updateOnResume')), 'returning to the front is hooked');
    t.ok((docL.pointerdown || []).includes(app.run('updateNoteTouch')), 'every tap is noted');
    t.ok((docL.keydown || []).includes(app.run('updateNoteTouch')), 'every key is noted (a scanner too)');

    // Launch: the real window load → register(), an update already waiting.
    let regCalls = 0;
    const reg = { calls: 0, waiting: fakeWorker(), installing: null, addEventListener() {}, update() { reg.calls++; return Promise.resolve(); } };
    app.nav.serviceWorker.controller = {};
    app.nav.serviceWorker.register = async () => { regCalls++; return reg; };
    app.sandbox.dispatchEvent({ type: 'load' });
    await tick(0);
    t.eq(regCalls, 1, 'launch: the worker is registered (the browser looks)');
    t.ok(app.run('_updateReg') === reg, 'the registration is kept for later looks');
    t.ok(app.state().updateAvailable, 'a worker already waiting shows the update');
    t.ok(app.run('_updateTimer !== null'), '… and looks for the safe moment');
    stopTimer(app);

    // Back to the front, through the document's real event.
    app.run('_updateLastCheck = 0');
    app.doc.visibilityState = 'visible';
    app.doc.dispatchEvent({ type: 'visibilitychange' });
    t.eq(reg.calls, 1, 'back to the front: the server is asked');
    app.doc.dispatchEvent({ type: 'visibilitychange' });
    t.eq(reg.calls, 1, '… not again within the minute');
    app.run('_updateLastCheck = Date.now() - UPDATE_RESUME_GAP_MS - 1');
    app.doc.dispatchEvent({ type: 'visibilitychange' });
    t.eq(reg.calls, 2, '… but again after it');
    app.doc.visibilityState = 'hidden';
    app.run('_updateLastCheck = 0');
    app.doc.dispatchEvent({ type: 'visibilitychange' });
    t.eq(reg.calls, 2, 'going to the background asks nothing');
    app.doc.visibilityState = 'visible';

    // Hourly, riding a tap.
    app.run('_updateLastCheck = Date.now()');
    app.doc.dispatchEvent({ type: 'pointerdown' });
    t.eq(reg.calls, 2, 'a tap inside the hour asks nothing');
    app.run('_updateLastCheck = Date.now() - UPDATE_CHECK_MS');
    app.doc.dispatchEvent({ type: 'pointerdown' });
    t.eq(reg.calls, 3, 'the first tap after an hour asks');
    t.eq(app.run('UPDATE_CHECK_MS'), 60 * 60 * 1000, 'the hour is an hour');
    t.eq(app.run('UPDATE_RESUME_GAP_MS'), 60 * 1000, 'the gap is a minute');

    // Offline: update() rejects — swallowed.
    reg.update = () => { reg.calls++; return Promise.reject(new Error('offline')); };
    t.ok(app.fn('updateCheckNow')(true), 'asked while offline');
    await tick(0);
    t.eq(reg.calls, 4, '… and the refusal is not an error');
    app.run('_updateReg = null');
    t.notOk(app.fn('updateCheckNow')(true), 'no registration (no worker support): nothing to ask');
    stopTimer(app);
  });

  /* ------------------------------------------------------------------ 62c */
  await t.group('62c — it updates itself only at a safe moment (2A)', async () => {
    const app = ready();
    const st = app.state();
    const safe = () => app.fn('updateSafeMoment')();

    waiting(app);
    app.doc.visibilityState = 'visible';
    t.ok(safe(), 'the Jobs list, nothing open, untouched: safe');

    // Each blocker on an app of its own, everything else clear.
    const sheetIn = (a, cls) => { const el = a.doc.createElement('div'); el.className = cls; a.doc.body.appendChild(el); };
    const typing = (a, tag, type) => { const el = a.doc.createElement(tag); if (type) el.setAttribute('type', type); a.doc.body.appendChild(el); el.focus(); };
    const blockers = [
      ['the entry screen',            (a) => { a.state().view = 'entry'; }],
      ['the Overview',                (a) => { a.state().view = 'review'; }],
      ['Settings',                    (a) => { a.state().view = 'settings'; }],
      ['a New job name typed',        (a) => { a.state().newForm.show = true; a.state().newForm.name = 'Kitchen'; }],
      ['a New job site in its box',   (a) => { a.state().newForm.show = true; const el = a.doc.register('nf-site', 'input'); el.value = 'Unit 4'; }],
      ['a New job engineer changed',  (a) => { a.state().newForm.show = true; a.state().engineer = 'Peter'; const el = a.doc.register('nf-engineer', 'input'); el.value = 'Sam'; }],
      ['a New job start number',      (a) => { a.state().newForm.show = true; a.state().newForm.startNo = '200'; }],
      ['the tour',                    (a) => { a.state().tourOpen = true; }],
      ['the not-saved sheet',         (a) => { a.state().saveFailure = { full: true, at: 1 }; a.state().saveFailureDismissed = false; }],
      ['a search typed',              (a) => { a.state().searchQuery = 'kettle'; }],
      ['ticking cloud jobs',          (a) => { a.state().cloudJobs = { selecting: true, selected: {} }; }],
      ['a cloud delete running',      (a) => { a.state().cloudJobs = { busy: 'Deleting…' }; }],
      ['a cloud search typed',        (a) => { a.state().cloudJobs = { q: 'acme' }; }],
      ['a push in flight',            (a) => { a.run('_syncRunning = Promise.resolve()'); }],
      ['a sheet open',                (a) => sheetIn(a, 'bulk-sheet')],
      ['the fail sheet',              (a) => sheetIn(a, 'fail-sheet')],
      ['the certificate preview',     (a) => sheetIn(a, 'report-preview-sheet')],
      ['a backdrop (welcome, setup)', (a) => sheetIn(a, 'modal-backdrop')],
      ['a text box with the cursor',  (a) => typing(a, 'input', 'text')],
      ['a notes box with the cursor', (a) => typing(a, 'textarea')],
      ['a pick list with the cursor', (a) => typing(a, 'select')],
      ['touched a moment ago',        (a) => { a.run('_updateLastTouch = Date.now()'); }],
      ['the app in the background',   (a) => { a.doc.visibilityState = 'hidden'; }],
      ['no worker waiting',           (a) => { a.state().pendingWorker = null; }],
      ['no update',                   (a) => { a.state().updateAvailable = false; }],
    ];
    let all = true;
    for (const [what, make] of blockers) {
      const a = ready();
      a.doc.visibilityState = 'visible';
      const w = waiting(a);
      t.ok(a.fn('updateSafeMoment')(), `(control: safe before — ${what})`);
      make(a);
      const ok = a.fn('updateSafeMoment')();
      t.notOk(ok, `not safe: ${what}`);
      t.notOk(a.fn('updateTryApply')(), `… nothing applied (${what})`);
      t.eq(skipped(w), 0, `… the worker not told to take over (${what})`);
      if (ok) all = false;
      stopTimer(a);
    }
    t.ok(all, 'every blocker refuses on its own');

    // The New job form open with nothing typed (a phone with no jobs opens on
    // it) is safe — or a new user would never update by itself.
    const nf = ready(); waiting(nf); nf.doc.visibilityState = 'visible';
    Object.assign(nf.state().newForm, { show: true, name: '', site: '', clientId: '', siteId: '', prefix: '', startNo: '1', engineer: '' });
    nf.state().engineer = 'Peter';
    nf.doc.register('nf-engineer', 'input').value = 'Peter';
    nf.doc.register('nf-start', 'input').value = '1';
    t.ok(nf.fn('updateSafeMoment')(), 'the New job form open, nothing typed: safe');
    stopTimer(nf);

    // A checkbox or a button holding focus is not typing.
    const cb = ready(); waiting(cb); cb.doc.visibilityState = 'visible';
    const box = cb.doc.createElement('input'); box.setAttribute('type', 'checkbox'); cb.doc.body.appendChild(box); box.focus();
    t.ok(cb.fn('updateSafeMoment')(), 'a ticked checkbox holding focus is still safe');

    // All clear: applied, once.
    const w = waiting(app);
    app.doc.visibilityState = 'visible';
    t.ok(app.fn('updateTryApply')(), 'safe: applied');
    t.eq(skipped(w), 1, 'the waiting worker is told to take over (the reload follows)');
    t.notOk(app.fn('updateTryApply')(), 'not twice');
    t.eq(skipped(w), 1, '… one SKIP_WAITING only');

    // render() arms the look; a touch pushes it back; it fires.
    const r = ready(); r.doc.visibilityState = 'visible';
    const rw = waiting(r);
    r.fn('render')();
    t.ok(r.run('_updateTimer !== null'), 'a redraw with an update waiting arms the look');
    stopTimer(r);
    r.state().updateAvailable = false;
    r.fn('render')();
    t.ok(r.run('_updateTimer === null'), 'no update: a redraw arms nothing');
    r.state().updateAvailable = true;
    r.run('_updateLastTouch = Date.now() - 10000');
    r.doc.dispatchEvent({ type: 'pointerdown' });
    t.ok(r.run('_updateTimer !== null'), 'a tap with an update waiting arms the look');
    t.eq(skipped(rw), 0, 'nothing applied under the tap');
    r.run('_updateLastTouch = Date.now() - 10000');
    await tick(r.run('UPDATE_IDLE_MS') + 60);
    t.eq(skipped(rw), 1, 'untouched for UPDATE_IDLE_MS on the Jobs list: it went in');
    t.eq(r.run('UPDATE_IDLE_MS'), 3000, 'the wait is three seconds');
  });

  /* ------------------------------------------------------------------ 62d */
  await t.group('62d — the banner: which version, ×, never under a sheet', () => {
    const app = ready();
    const st = app.state();
    waiting(app);
    st.updateVersion = 'V125';
    app.fn('render')();
    t.includes(html(app), 'PATGo V125 is ready', 'names the version (3A)');
    t.includes(html(app), 'data-action="update-refresh"', 'Refresh is there');
    st.updateVersion = '';
    app.fn('render')();
    t.includes(html(app), 'New version ready', 'no answer: plain words');
    t.includes(read('styles.css'), 'body.has-update-banner .screen { padding-top: 4rem; }', 'the room for the banner grows with Text size (64px at Standard)');
    t.excludes(html(app), 'Update available', 'the old words are gone');

    // × through the real click dispatcher.
    const x = app.doc.createElement('button');
    x.setAttribute('data-action', 'update-dismiss');
    app.doc.body.appendChild(x);
    app.fn('handleDelegatedClick')({ target: x });
    t.ok(app.state().updateDismissed, '× hides the banner');
    t.ok(app.state().updateAvailable, '… but the update is still waiting (2A goes on)');
    t.excludes(html(app), 'update-banner', 'the banner is not drawn');
    t.notOk(app.doc.body.classList.contains('has-update-banner'), 'and the screen gives its space back');
    app.doc.visibilityState = 'visible';
    app.run('_updateLastTouch = 0');
    t.ok(app.fn('updateSafeMoment')(), 'a dismissed update can still go in at the safe moment');
    stopTimer(app);

    // A found update never redraws under a sheet or the cursor (MAP rule 3).
    const b = ready();
    b.state().view = 'entry';
    b.fn('render')();
    const before = html(b);
    const notes = b.doc.createElement('textarea'); b.doc.body.appendChild(notes); notes.focus();
    b.fn('showUpdateBanner')(fakeWorker());
    t.ok(b.state().updateAvailable, 'found mid-typing: noted');
    t.eq(html(b), before, '… but no redraw under the cursor');
    t.ok(b.doc.activeElement === notes, 'the cursor stays in the notes');
    t.ok(b.run('_updateTimer !== null'), '… yet the safe-moment look is armed (no redraw to arm it)');
    stopTimer(b);
    notes.blur();
    const sheet = b.doc.createElement('div'); sheet.className = 'bulk-sheet'; b.doc.body.appendChild(sheet);
    b.fn('showUpdateBanner')(fakeWorker());
    t.eq(html(b), before, 'found under a sheet: no redraw either');
    b.doc.body.removeChild ? b.doc.body.removeChild(sheet) : (sheet.className = '');
    b.state().updateDismissed = true;           // an earlier one was dismissed
    let asked = 0;
    b.sandbox.MessageChannel = function () { asked++; this.port1 = { onmessage: null }; this.port2 = {}; };
    const nw = fakeWorker();
    b.fn('showUpdateBanner')(nw);
    t.eq(asked, 1, 'a found update asks its version (3A)');
    t.ok(nw.sent.some(x => x.msg && x.msg.type === 'GET_VERSION'), '… of the worker that was found');
    t.includes(html(b), 'update-banner', 'nothing open: the banner shows at once');
    t.ok(b.doc.body.classList.contains('has-update-banner'), '… with its space');
    t.notOk(b.state().updateDismissed, 'a new update un-hides the banner');
    stopTimer(b);
  });

  /* ------------------------------------------------------------------ 62e */
  await t.group('62e — v61.2 stands: it never takes over by itself (source)', () => {
    const sw = strip(read('sw.js'));
    const install = sw.slice(sw.indexOf("addEventListener('install'"), sw.indexOf("addEventListener('activate'"));
    t.excludes(install, 'skipWaiting', 'install: no skipWaiting (it would reload under the engineer)');
    t.eq((sw.match(/skipWaiting\(\)/g) || []).length, 1, 'one skipWaiting in the worker — the message handler');
    const boot = strip(read('boot.js'));
    t.eq((boot.match(/type: 'SKIP_WAITING'/g) || []).length, 1, 'one SKIP_WAITING sent, from applyUpdate');
    const callers = (s) => (s.match(/(?<!function )applyUpdate\(\)/g) || []).length;
    t.eq(callers(boot), 1, 'boot.js calls applyUpdate only from the safe moment');
    t.eq(callers(strip(read('dispatch.js'))), 1, 'dispatch.js only from Refresh');
    const apply = boot.slice(boot.indexOf('function updateTryApply()'), boot.indexOf('function updateTryLater()'));
    t.ok(apply.indexOf('updateSafeMoment()') > -1 && apply.indexOf('updateSafeMoment()') < apply.indexOf('applyUpdate()'), 'the safe moment is checked first');
    t.excludes(boot, 'setInterval', 'no polling timer: the hourly look rides a touch');
    t.includes(boot, "document.addEventListener('pointerdown', updateNoteTouch, true)", 'touches noted in the capture phase');
    const bootTail = read('boot.js').slice(read('boot.js').lastIndexOf('registerServiceWorker();'));
    t.eq(bootTail.trim(), 'registerServiceWorker();', 'registerServiceWorker() is still the last line, outside every block');
  });

  /* ------------------------------------------------------------------ 62f */
  await t.group('62f — release: V124, What’s new rolled, cache, changelog', () => {
    const app = freshApp();
    t.eq(app.run('APP_VERSION'), 'V124', 'APP_VERSION V124');
    t.eq(app.run('WELCOME_VERSION'), 'V124', 'What’s new rolled to V124');
    t.includes(read('sw.js'), "const CACHE_VERSION = 'pat-v124';", 'cache key pat-v124');
    const core = read('render-core.js');
    t.includes(core, '<li><strong>Updates find you.</strong>', 'V124’s What’s new: it looks');
    t.includes(core, '<li><strong>No more closing and reopening.</strong>', 'V124’s What’s new: it goes in by itself');
    t.includes(core, '<li><strong>The banner says which version.</strong>', 'V124’s What’s new: the banner');
    t.excludes(core, '<li><strong>VoiceOver keeps your place.</strong>', 'V123’s sheet copy gone');
    const help = read('render-help.js');
    const a = help.indexOf('<p><strong>V124</strong>'), b = help.indexOf('<p><strong>V123</strong>'), c = help.indexOf('<p><strong>V122</strong>');
    t.ok(a > -1 && b > a && c > b, 'About: V124, V123, V122');
    t.excludes(help, '<p><strong>V121</strong>', 'V121 rolled off');
    t.excludes(help, 'Bigger text if you want it: Settings', 'V121’s line gone with it');
    t.includes(help, 'Updates without the fuss: PATGo checks', 'About: V124’s line');
    t.includes(help, 'VoiceOver keeps your place: after a tap', 'About: V123’s line still there');
    t.includes(help, 'Sessions are now called Jobs everywhere in the app', 'About: V122’s line still there');
  });
};
