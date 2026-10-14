/* Standing test — V126: a first visit never reloads itself
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked (14 Oct, Peter "0A 1A 2B"):
   Found in V125's browser check, older than V125: on a brand-new phone the new
   worker's clients.claim() (sw.js activate) fires controllerchange, and boot.js
   reloaded the page about a second in — during the setup wizard.
   1A  The page reloads on a worker taking over ONLY when the page loaded under
       a worker already, or after we asked for the update (SKIP_WAITING — from
       Refresh or the safe moment). A first visit is never reloaded. An update
       put in from another tab still reloads this one (it loaded under the old
       worker), so two tabs never run two versions.
   2B  A one-line What's new anyway.

     64a  a first visit: the real window load → register, the real
          controllerchange from the claim — no reload; still none on a second.
     64b  an installed app (loaded under a worker): a takeover reloads, once.
     64c  a first visit that later takes an update: Refresh (the real action)
          and the safe moment each send SKIP_WAITING, and the takeover then
          reloads, once. With no worker waiting, Refresh still just reloads.
     64d  source: sw.js still claims a first-visit page (offline at once —
          the claim is the takeover 1A must survive, not something to remove);
          the controller is read once at boot, before the load handler.
     64f  release: V126, What's new rolled, cache, changelog. (63f → 64f.)

   ⚠ The reload is counted on the window stub's location (_reloads). Every test
   dispatches through the same surface the browser uses — navigator.serviceWorker's
   own controllerchange listener — never by calling the handler directly
   (principles: listener features need a test through the real surface). */

'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp, tick } = require('../fixture');

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* A fresh app on the Jobs list. installed: the page loaded under a worker. */
function ready(installed) {
  const app = freshApp(installed ? { navigator: { swController: { scriptURL: 'sw.js' } } } : {});
  const st = app.state();
  st.welcomeSeen = true;
  st.onboardedV33Seen = true;
  st.migrationPrompt = { show: false, name: '', items: [] };
  return app;
}

/* The browser's window load: registers the worker and hooks controllerchange. */
async function loaded(app) {
  app.sandbox.dispatchEvent({ type: 'load' });
  await tick(0);
}

/* The new worker takes over — what clients.claim() or skipWaiting() does. */
function takeover(app) {
  app.nav.serviceWorker.controller = { scriptURL: 'sw.js', fresh: true };
  app.nav.serviceWorker.dispatchEvent({ type: 'controllerchange' });
}

const reloads = (app) => app.sandbox.location._reloads;
const stopTimer = (app) => app.run('if (_updateTimer) { clearTimeout(_updateTimer); _updateTimer = null; }');

function fakeWorker() {
  const w = { sent: [], postMessage(msg, ports) { w.sent.push({ msg, ports }); } };
  return w;
}
const skipped = (w) => w.sent.filter(s => s.msg && s.msg.type === 'SKIP_WAITING').length;

function bootWorker() {
  const listeners = {};
  let claimed = 0;
  const self = {
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    skipWaiting() {},
    clients: { claim() { claimed++; return Promise.resolve(); } },
  };
  const ctx = vm.createContext({ self, caches: { open: () => Promise.resolve({ addAll: () => Promise.resolve() }), keys: () => Promise.resolve(['pat-v1']), delete: () => Promise.resolve(true) }, fetch: () => Promise.reject(new Error('offline')), Request: function (u) { this.url = u; }, Promise, console });
  ctx.caches.delete = () => Promise.resolve(true);
  vm.runInContext(read('sw.js'), ctx, { filename: 'sw.js' });
  return { listeners, claimed: () => claimed };
}

module.exports = async function run() {

  /* ------------------------------------------------------------------ 64a */
  await t.group('64a — a first visit is never reloaded (1A)', async () => {
    const app = ready(false);
    t.eq(app.nav.serviceWorker.controller, null, 'the page loaded with no worker (a first visit)');
    await loaded(app);
    const hooked = app.nav.serviceWorker._listeners.controllerchange || [];
    t.eq(hooked.length, 1, 'the load hooks controllerchange once');
    t.ok(hooked[0] === app.run('updateOnControllerChange'), '… with the named handler');
    const before = reloads(app);
    takeover(app);
    t.eq(reloads(app), before, 'the new worker claiming the page does NOT reload it');
    t.ok(app.nav.serviceWorker.controller !== null, '… and the page is now under the worker (offline works)');
    takeover(app);
    t.eq(reloads(app), before, 'nor a second takeover nobody asked for');
    t.ok(!app.run('updateShouldReload()'), 'the rule says no');
  });

  /* ------------------------------------------------------------------ 64b */
  await t.group('64b — an installed app still reloads when a worker replaces its own (1A)', async () => {
    const app = ready(true);
    t.ok(app.run('_updateHadController'), 'the page loaded under a worker');
    await loaded(app);
    const before = reloads(app);
    takeover(app);
    t.eq(reloads(app), before + 1, 'a new worker taking over reloads (an update from another tab)');
    takeover(app);
    t.eq(reloads(app), before + 1, '… once only');
  });

  /* ------------------------------------------------------------------ 64c */
  await t.group('64c — a first visit that takes an update later still reloads into it (1A)', async () => {
    // Refresh, through the real action.
    const app = ready(false);
    await loaded(app);
    takeover(app);                                   // the claim: no reload
    const before = reloads(app);
    const st = app.state();
    const w = fakeWorker();
    st.updateAvailable = true;
    st.pendingWorker = w;
    t.ok(!app.run('_updateAsked'), 'nothing asked yet');
    app.run('ACTIONS["update-refresh"]()');
    t.eq(skipped(w), 1, 'Refresh asks the waiting worker to take over');
    t.ok(app.run('_updateAsked'), '… and remembers asking');
    t.eq(reloads(app), before, 'no reload until the worker has taken over');
    takeover(app);
    t.eq(reloads(app), before + 1, 'the takeover we asked for reloads, on a first-visit page too');
    takeover(app);
    t.eq(reloads(app), before + 1, '… once only');
    stopTimer(app);

    // The safe moment (V124 2A), on a first-visit page.
    const app2 = ready(false);
    await loaded(app2);
    takeover(app2);
    const before2 = reloads(app2);
    const st2 = app2.state();
    const w2 = fakeWorker();
    st2.updateAvailable = true;
    st2.pendingWorker = w2;
    app2.run('_updateLastTouch = 0; _updateApplying = false;');
    t.ok(app2.run('updateTryApply()'), 'the safe moment puts the update in');
    t.eq(skipped(w2), 1, '… by asking the worker');
    takeover(app2);
    t.eq(reloads(app2), before2 + 1, 'and the takeover reloads');
    stopTimer(app2);

    // No worker waiting: Refresh reloads straight away, as before.
    const app3 = ready(false);
    await loaded(app3);
    const before3 = reloads(app3);
    app3.state().pendingWorker = null;
    app3.run('ACTIONS["update-refresh"]()');
    t.eq(reloads(app3), before3 + 1, 'Refresh with no worker waiting still reloads');
    stopTimer(app3);
  });

  /* ------------------------------------------------------------------ 64d */
  await t.group('64d — the claim stays; the controller is read at boot (source)', async () => {
    const sw = bootWorker();
    let done = null;
    (sw.listeners.activate || []).forEach(fn => fn({ waitUntil(p) { done = p; } }));
    await done;
    t.eq(sw.claimed(), 1, 'sw.js activate still claims the page (a first visit works offline at once)');
    const boot = strip(read('boot.js'));
    const reg = boot.slice(boot.indexOf('function registerServiceWorker()'));
    const readAt = reg.indexOf('_updateHadController = !!navigator.serviceWorker.controller');
    const loadAt = reg.indexOf("window.addEventListener('load'");
    t.ok(readAt > -1 && loadAt > -1 && readAt < loadAt, 'the controller is read once, at boot, before the load handler');
    t.eq((boot.match(/_updateHadController\s*=/g) || []).length, 3, 'set only there: the declaration, the read and its fallback');
    t.eq((boot.match(/addEventListener\('controllerchange'/g) || []).length, 1, 'one controllerchange listener');
    const apply = boot.slice(boot.indexOf('function applyUpdate()'), boot.indexOf('function dismissUpdateBanner()'));
    t.ok(apply.indexOf('_updateAsked = true') > -1 && apply.indexOf('_updateAsked = true') < apply.indexOf("postMessage({ type: 'SKIP_WAITING' })"), 'asking is remembered BEFORE the message (the takeover may follow at once)');
  });

  // 64f (V126's release checks) moved to 65f at V127 — V126's About line is
  // still pinned there while it rolls.
};
