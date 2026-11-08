/* Standing test — V153: the minimum app version held in memory (audit finding 2)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   Peter, 7 Nov — 1A (a cloud action tapped before this start's run has read
   the minimum reads it first, once per start / return) 2A (a read that fails
   goes by what the phone last knew; never told = no minimum, as V151). Before
   V153 the answer was only ever decided from its STORED copy: a full phone
   told "too old" couldn't store it, read the old copy back and synced anyway,
   every run; and the cloud tab, Cloud Storage, the Business page… went by the
   stored copy without asking. What these pin:
     92a  A full phone: told too old, nothing is read or sent and the line
          shows; told a lower minimum, the stop lifts; the hour is timed from
          the answer held, not re-read every run; held per account.
     92b  1A: the on-request actions read the minimum first — once per start or
          return, one read shared by actions at the same moment, none after a
          run has read it; a raised minimum stops them before anything is
          touched; 2A: a failed read goes by what was known, and the next
          action tries again.
     92c  V153's lasting label checks (its release checks moved to 93e in V154).

   ⚠ WHAT THIS FILE CANNOT PROVE: a real iPhone with genuinely full storage
   (the harness throws on demand). */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { freshApp, tick } = require('../fixture');

const LIB  = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');
const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const html = (app) => app.doc.getElementById('app').innerHTML;
const UID   = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const AUTH  = 'patgo:cloudAuth:test';
const OWN   = 'aaaaaaaa-0000-4000-8000-000000000001';
const KEY   = 'pat:minVersion';
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
const N = Number(/const APP_VERSION = 'V(\d+)/.exec(read('config.js'))[1]);
const TABLES = /\/rest\/v1\/(sessions|records|photos|phones|session_photo_counts)\b|\/rest\/v1\/rpc\/(my_businesses|my_job_moves|move_job)\b|\/storage\/v1\//;

function storedSession() {
  const life = 3600;
  return JSON.stringify({
    access_token: 'ZZACCESS153', token_type: 'bearer', expires_in: life,
    expires_at: Math.floor(Date.now() / 1000) + life, refresh_token: 'ZZREFRESH',
    user: { id: UID, email: 'peter@example.com', aud: 'authenticated', role: 'authenticated' },
  });
}

// A pretend Supabase (as 90-v151.js). my_min_version answers srv.min, or fails.
function fakeServer() {
  const calls = [];
  const srv = { calls, min: N, minFail: false };
  srv.fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    calls.push({ url: u, method });
    if (u.endsWith('/rest/v1/rpc/my_min_version')) {
      return srv.minFail ? json({ message: 'no signal', code: 'PGRST000' }, 503) : json(srv.min);
    }
    if (u.endsWith('/rest/v1/rpc/my_businesses')) return json([{ id: OWN, name: '', role: 'owner', is_default: true, members: 1 }]);
    if (u.endsWith('/rest/v1/rpc/my_job_moves')) return json([]);
    if (u.endsWith('/rest/v1/rpc/my_billing')) return json({ plan: 'comped', role: 'owner', can_manage: true });
    if (u.includes('/rest/v1/')) return method === 'GET' ? json([]) : new Response(null, { status: 201 });
    if (u.includes('/storage/v1/')) return json([]);
    return json({ message: 'unexpected ' + u }, 404);
  };
  srv.rpcs  = (name) => calls.filter(c => c.url.endsWith('/rest/v1/rpc/' + name));
  srv.work  = () => calls.filter(c => TABLES.test(c.url));
  srv.sends = () => calls.filter(c => c.method !== 'GET' && TABLES.test(c.url));
  srv.firstWork = () => calls.findIndex(c => TABLES.test(c.url));
  srv.firstMin  = () => calls.findIndex(c => c.url.endsWith('/rest/v1/rpc/my_min_version'));
  return srv;
}

function stopTimer(app) {
  app.run('if (typeof _syncTimer !== "undefined" && _syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }');
}

async function signedIn(o = {}) {
  const ls = Object.assign({ [AUTH]: storedSession(), 'pat:cloudUnlocked': '1' }, o.localStorage || {});
  const app = bootApp({ localStorage: ls, navigator: { onLine: false } });
  app.fn('load')();
  app.state = () => app.refresh('state').state;
  const srv = fakeServer();
  const sb = app.sandbox;
  for (const k of ['Headers', 'Request', 'Response', 'AbortController', 'TextEncoder',
                   'TextDecoder', 'URLSearchParams', 'URL', 'atob', 'btoa', 'Blob']) sb[k] = globalThis[k];
  if (!sb.crypto) sb.crypto = globalThis.crypto;
  sb.WebSocket = class {};
  sb.fetch = srv.fetchImpl;
  app.run(LIB);
  app.run('navigator.onLine = true');
  app.srv = srv;
  stopTimer(app);
  for (let k = 0; k < 100 && app.run("(state.cloud && state.cloud.status) || ''") !== 'signed-in'; k++) await tick(10);
  const st = app.state();
  st.welcomeSeen = true;
  st.migrationPrompt = { show: false, name: '', items: [] };
  return app;
}

// The phone is full for the minimum's record: every write of it throws, as
// Safari does (QuotaExceededError). Everything else still saves.
function fullFor(app, key) {
  const ls = app.storage, real = ls.setItem;
  ls.setItem = function (k, v) {
    if (String(k) === key) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
    return real.call(this, k, v);
  };
}

function withUnsentJob(app) {
  const st = app.state();
  st.sessions.unshift({ id: 'v153-job', name: 'Unsent job', site: 'Depot', date: '2026-11-07', items: [{ id: 'i1', assetNo: '1', itemType: 'Kettle', result: 'pass' }] });
  app.fn('saveSessions')();
  stopTimer(app);
}

function backAtFront(app) {
  app.run("document.visibilityState = 'visible'");
  app.doc.dispatchEvent({ type: 'visibilitychange' });
  stopTimer(app);
}

const minRec = (min, u = UID, at = Date.now()) => JSON.stringify({ u, min, at });

module.exports = async function () {

  /* ------------------------------------------------------------------ 92a */
  await t.group('92a — a full phone: too old stops it, a lower minimum lifts it, the hour is timed from what is held, per account', async () => {
    // Told too old on a phone with no room to store the answer.
    const app = await signedIn();
    fullFor(app, KEY);
    app.srv.min = N + 1;
    withUnsentJob(app);
    await app.run('syncPull()');
    t.eq(app.srv.rpcs('my_min_version').length, 1, 'the minimum was read');
    t.eq(app.storage.getItem(KEY), null, '…and could not be stored (the phone is full)');
    t.eq(app.srv.work().length, 0, 'still nothing read or sent (before V153 the run carried on)');
    t.ok(app.run('syncTooOld()'), 'too old, from the answer held');
    t.eq(app.run('state.sync.message'), app.run('SYNC_VERSION_STOPPED_WORDS'), 'the Sync page says what happened');
    await app.run('syncPush()');
    t.eq(app.srv.sends().length, 0, 'a save’s quick send: nothing sent');
    app.state().view = 'sessions';
    app.fn('render')();
    t.includes(html(app), 'id="version-banner"', 'the Jobs list shows Update PATGo');
    const list = await app.run('syncCloudList()');
    t.ok(!list.ok && list.error === app.run('SYNC_VERSION_STOPPED_WORDS'), 'the cloud tab: refused');

    // Within the hour: not asked again every run (the time is the held answer's).
    const n0 = app.srv.rpcs('my_min_version').length;
    await app.run('syncPull()');
    await app.run('syncPull()');
    t.eq(app.srv.rpcs('my_min_version').length, n0, 'later runs within the hour: not read again');

    // Stored too old; the cloud lowers it; the phone can't store the new answer.
    const b = await signedIn({ localStorage: { [KEY]: minRec(N + 1) } });
    fullFor(b, KEY);
    t.ok(b.run('syncTooOld()'), 'a new start: the stored copy decides until a read (too old)');
    withUnsentJob(b);
    b.srv.min = N;
    await b.run('syncPull()');
    t.eq(JSON.parse(b.storage.getItem(KEY)).min, N + 1, 'the stored copy is still the old one (full)');
    t.notOk(b.run('syncTooOld()'), 'the lower answer held: no longer too old');
    t.ok(b.srv.sends().some(c => c.url.includes('/rest/v1/sessions')), '…and the waiting job goes up');

    // Held per account: an answer held for one account stops no other.
    const c = await signedIn();
    c.run(`_syncMinHeld = { u: '${OTHER}', min: 999999, at: Date.now() }`);
    t.notOk(c.run('syncTooOld()'), 'another account’s held answer: this account isn’t stopped');
    t.ok(c.run(`syncTooOld('${OTHER}')`), '…while that account would be');
    await c.run('syncPull()');
    t.ok(c.srv.work().length > 0, '…and this account syncs');

    // A phone with room still stores it for the next start.
    const d = await signedIn();
    d.srv.min = N + 1;
    await d.run('syncPull()');
    t.eq(JSON.parse(d.storage.getItem(KEY)).min, N + 1, 'room on the phone: stored for the next start, as before');
  });

  /* ------------------------------------------------------------------ 92b */
  await t.group('92b — 1A: a cloud action before this start’s run reads the minimum first; once; shared; 2A on a failed read', async () => {
    const stopped = (app) => app.run('SYNC_VERSION_STOPPED_WORDS');

    // Told it was fine an hour ago; the cloud has since raised it. No run yet.
    const app = await signedIn({ localStorage: { [KEY]: minRec(N, UID, Date.now() - 1000) } });
    app.srv.min = N + 1;
    const list = await app.run('syncCloudList()');
    t.eq(app.srv.rpcs('my_min_version').length, 1, 'the cloud tab reads the minimum first');
    t.ok(!list.ok && list.error === stopped(app), '…and, now too old, is refused in the stop words');
    t.eq(app.srv.work().length, 0, '…before anything was touched (before V153 the jobs list was read)');
    t.ok(app.run('syncTooOld()'), 'too old now');

    // New enough: carries on, the read first.
    const b = await signedIn({ localStorage: { [KEY]: minRec(N, UID, Date.now() - 1000) } });
    const ok = await b.run('syncCloudList()');
    t.ok(ok.ok, 'new enough: the cloud tab lists');
    t.ok(b.srv.firstMin() > -1 && b.srv.firstMin() < b.srv.firstWork(), '…the minimum read before the list');
    const size = await b.run('syncCloudStorage()');
    t.ok(size.ok, 'Cloud Storage: fine');
    t.eq(b.srv.rpcs('my_min_version').length, 1, 'once per start: the second action doesn’t read it again');
    backAtFront(b);
    await b.run('syncCloudStorage()');
    t.eq(b.srv.rpcs('my_min_version').length, 2, 'back at the front (through document): the next action reads it again');

    // Several at once share one read.
    const c = await signedIn();
    await c.run('Promise.all([syncCloudList(), syncCloudStorage(), businessRefresh()])');
    t.eq(c.srv.rpcs('my_min_version').length, 1, 'three actions at the same moment: one read');

    // After the run has read it, an action doesn't read again.
    const d = await signedIn();
    await d.run('syncPull()');
    const n0 = d.srv.rpcs('my_min_version').length;
    await d.run('syncCloudList()');
    t.eq(d.srv.rpcs('my_min_version').length, n0, 'the run already read it: the cloud tab doesn’t');

    // The Business page too.
    const e = await signedIn({ localStorage: { [KEY]: minRec(N, UID, Date.now() - 1000) } });
    e.srv.min = N + 1;
    await e.run('businessRefresh()');
    t.eq(e.srv.rpcs('my_min_version').length, 1, 'the Business page reads the minimum first');
    t.eq(e.srv.rpcs('my_businesses').length, 0, '…and, too old, never asks for the businesses');

    // 2A: a failed read goes by what was known; the next action tries again.
    const f = await signedIn({ localStorage: { [KEY]: minRec(N + 1) } });
    f.srv.minFail = true;
    const fl = await f.run('syncCloudList()');
    t.ok(!fl.ok && fl.error === stopped(f), 'known too old, the read fails: still refused');
    t.eq(f.srv.work().length, 0, '…nothing touched');
    const g = await signedIn({ localStorage: { [KEY]: minRec(N) } });
    g.srv.minFail = true;
    const gl = await g.run('syncCloudList()');
    t.ok(gl.ok, 'known fine, the read fails: carries on (2A)');
    await g.run('syncCloudStorage()');
    t.eq(g.srv.rpcs('my_min_version').length, 2, '…and the next action tries the read again');
    const h = await signedIn();
    h.srv.minFail = true;
    const hl = await h.run('syncCloudList()');
    t.ok(hl.ok, 'never told, the read fails: no minimum (fails open, as V151)');
  });

  /* ------------------------------------------------------------------ 92c */
  await t.group('92c — V153 carried (release checks → 93e)', () => {
    const rel = freshApp();
    t.eq(rel.fn('updateVersionLabel')('pat-v153'), 'V153', 'the update banner reads pat-v153 as V153');
    t.eq(rel.fn('updateVersionLabel')('pat-v153-1'), 'V153.1', '…and a hotfix key as V153.1');
  });
};
