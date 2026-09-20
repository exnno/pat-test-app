/* Standing test — sync, push only (V80)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. sync.js copies JOBS one way, phone → cloud, while an
   engineer is signed in. Change detection is a per-job fingerprint of what was
   last sent (sessions carry no edit timestamp). Deletes empty the cloud copy;
   clearing old jobs does not touch the cloud, and while signed in only clears
   jobs whose latest version is already there.

   ⚠ DRIVES THE REAL VENDORED LIBRARY against a fake server, as 15f does, so the
   assertions are on the HTTP the library actually sends — the upsert URL, its
   conflict target, and the rows.

   ⚠ BOOTS OFFLINE, THEN GOES ONLINE. A signed-in ONLINE boot schedules a push
   before any test can install the fake server. Every app here boots with
   navigator.onLine false and flips it once the library is in place.

   ⚠ WHAT THIS FILE CANNOT PROVE. That the server keeps one engineer's rows from
   another. That is supabase/isolation-test.sql, by hand, every release. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { tick, CANARY, withSession, withItem, confirmSheet } = require('../fixture');

const LIB = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');
const UID_A = '11111111-1111-1111-1111-111111111111';
const UID_B = '22222222-2222-2222-2222-222222222222';

function storedSession(id = UID_A, email = 'peter@example.com') {
  return JSON.stringify({
    access_token: 'ZZACCESS', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'ZZREFRESH',
    user: { id, email, aud: 'authenticated', role: 'authenticated' },
  });
}

function boot(opts = {}) {
  const app = bootApp(opts);
  app.fn('load')();
  app.state = () => app.refresh('state').state;
  app.stopTimer = () => app.run('if (_syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }');
  return app;
}

/* Signed in, offline at boot (see header), with the real library and a fake
   server installed; then online. */
function signedIn(opts = {}) {
  const ls = Object.assign({ 'patgo:cloudAuth:test': storedSession(opts.uid || UID_A) }, opts.localStorage || {});
  const app = boot({ localStorage: ls, navigator: { onLine: false } });
  const srv = fakeServer(opts.server || {});
  const sb = app.sandbox;
  for (const k of ['Headers', 'Request', 'Response', 'AbortController', 'TextEncoder',
                   'TextDecoder', 'URLSearchParams', 'URL', 'atob', 'btoa']) sb[k] = globalThis[k];
  if (!sb.crypto) sb.crypto = globalThis.crypto;
  sb.WebSocket = class {};
  sb.fetch = srv.fetchImpl;
  app.run(LIB);
  app.online = () => { app.run('navigator.onLine = true'); };
  app.srv = srv;
  return app;
}

function fakeServer(o = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    let body = null;
    try { body = init.body ? JSON.parse(init.body) : null; } catch { body = init.body; }
    const headers = new Headers(init.headers || {});
    calls.push({ url: u, method: init.method || 'GET', body, prefer: headers.get('prefer') || '' });
    if (u.includes('/rest/v1/sessions')) {
      if (o.sessions) return o.sessions(body, calls);
      return new Response(null, { status: 201 });
    }
    if (u.includes('/rest/v1/profiles')) {
      return new Response(JSON.stringify([{ plan: 'trial', trial_ends_at: null }]),
        { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ message: 'unexpected ' + u }), { status: 404 });
  };
  const posts = () => calls.filter(c => c.url.includes('/rest/v1/sessions'));
  const rows = () => posts().flatMap(c => Array.isArray(c.body) ? c.body : []);
  return { calls, fetchImpl, posts, rows };
}

function job(app, site) {
  const s = withSession(app, { site });
  withItem(app, { assetNo: CANARY.asset, result: 'pass' });
  app.stopTimer();
  return app.fn('activeSession')();
}

function syncState(app) {
  return JSON.parse(app.storage.getItem('pat:syncState') || 'null');
}

module.exports = async function () {
  /* ------------------------------------------------------------------ 16a */
  await t.group('16a — signed out: saving schedules nothing and sends nothing', async () => {
    const calls = [];
    const app = boot({ fetch: async (u) => { calls.push(String(u)); throw new Error('offline'); } });
    withSession(app, { site: 'ZZSIGNEDOUT' });
    withItem(app, {});
    t.eq(app.run('_syncTimer'), null, 'no push scheduled by a save while signed out');
    t.eq(await app.fn('syncPush')({ manual: true }), false, 'a push request is refused');
    await tick(5);
    t.eq(calls.length, 0, 'no network request at all');
    t.eq(app.storage.getItem('pat:syncState'), null, 'no sync state written');
    t.notOk('syncPruned' in JSON.parse(JSON.stringify(app.fn('buildBackup')())),
      'a backup from a phone that never synced carries no syncPruned key — byte-identical to before');

    // The reopen/back-online triggers exist on a cloud host and not elsewhere.
    const vis = (a) => ((a.doc._listeners || {}).visibilitychange || []).length;
    t.eq(vis(app), 1, 'test host: syncBoot registered the app-reopen trigger');
    const off = boot({ hostname: 'localhost' });
    t.eq(vis(off), 0, 'no-cloud host: syncBoot registered nothing');
  });

  /* ------------------------------------------------------------------ 16b */
  await t.group('16b — signed in: the real save path arms the debounced push', async () => {
    const app = signedIn();
    withSession(app, { site: 'ZZDEBOUNCE' });
    app.stopTimer();
    t.eq(app.run('_syncTimer'), null, 'timer clear before the item');
    withItem(app, {});
    t.ok(app.run('_syncTimer') !== null, 'logging an item (saveItem → saveSessions) armed a push');
    app.stopTimer();
    // App reopened: the visibilitychange listener schedules a push.
    (app.doc._listeners.visibilitychange || []).forEach(fn => fn({ type: 'visibilitychange' }));
    t.ok(app.run('_syncTimer') !== null, 'reopening the app armed a push');
    app.stopTimer();
  });

  /* ------------------------------------------------------------------ 16c */
  await t.group('16c — the REAL library: first push, nothing-changed, one edit, re-send all', async () => {
    const app = signedIn();
    const a = job(app, 'ZZJOBA');
    const b = job(app, 'ZZJOBB');
    app.online();
    t.ok(await app.fn('syncPush')({ manual: true }), 'first push resolved true');
    const posts = app.srv.posts();
    t.eq(posts.length, 1, 'one upload request for two small jobs');
    t.eq(posts[0] && posts[0].method, 'POST', 'as a POST');
    t.includes(posts[0] && decodeURIComponent(posts[0].url), 'on_conflict=user_id,id', 'upsert on the composite key');
    t.includes(posts[0] && posts[0].prefer, 'merge-duplicates', 'an edit UPDATES the row rather than failing on the duplicate');
    const rows = app.srv.rows();
    t.eq(rows.length, 2, 'both jobs sent');
    const ra = rows.find(r => r.id === String(a.id));
    t.ok(!!ra, 'job A sent under its own id');
    t.eq(ra && ra.user_id, UID_A, 'owned by the signed-in account');
    t.eq(ra && ra.deleted, false, 'as a live row');
    t.includes(ra && ra.doc && ra.doc.site, 'ZZJOBA', 'the whole job as a readable document');
    t.eq(ra && ra.doc && ra.doc.items && ra.doc.items[0] && ra.doc.items[0].assetNo, CANARY.asset,
      'long keys, as in a backup — not the storage codec');
    t.ok(ra && !isNaN(Date.parse(ra.last_modified)), 'last_modified is a timestamp');
    t.eq(app.state().sync.message, 'Sent 2 jobs.', 'plain-language result');
    t.eq(app.state().sync.busy, false, 'busy cleared');
    const st = syncState(app);
    t.eq(st && st.userId, UID_A, 'sync state records whose account it describes');
    t.ok(st && st.lastPushAt, 'and when');

    t.ok(await app.fn('syncPush')({ manual: true }), 'second push resolved');
    t.eq(app.srv.posts().length, 1, 'nothing changed → no request at all');
    t.eq(app.state().sync.message, 'Everything was already up to date.', 'and says so');

    app.run(`state.activeId = ${JSON.stringify(b.id)}`);
    withItem(app, { assetNo: 'ZZCANARY-EDIT' });
    app.stopTimer();
    await app.fn('syncPush')({});
    const third = app.srv.posts()[1];
    t.ok(!!third, 'an edit is noticed without any edit timestamp');
    t.eq(third && third.body.length, 1, 'only the edited job goes');
    t.eq(third && third.body[0].id, String(b.id), 'and it is the right one');

    await app.fn('syncPush')({ force: true, manual: true });
    const fourth = app.srv.posts()[2];
    t.eq(fourth && fourth.body.length, 2, 'Re-send all ignores the fingerprints');
    const sum = app.fn('syncStatusSummary')();
    t.eq(sum.total, 2, 'summary: two jobs');
    t.eq(sum.waiting, 0, 'summary: none waiting');
  });

  /* ------------------------------------------------------------------ 16d */
  await t.group('16d — the example job never leaves the phone', async () => {
    const app = signedIn();
    const ex = job(app, 'ZZEXAMPLEJOB');
    app.run(`state.sessions.find(s => s.id === ${JSON.stringify(ex.id)}).isExample = true`);
    job(app, 'ZZREALJOB');
    app.online();
    await app.fn('syncPush')({});
    const rows = app.srv.rows();
    t.eq(rows.length, 1, 'one row');
    t.excludes(JSON.stringify(rows), 'ZZEXAMPLEJOB', 'the example job is not in it');
    t.eq(app.fn('syncStatusSummary')().total, 1, 'and is not counted on the Sync page');
  });

  /* ------------------------------------------------------------------ 16e */
  await t.group('16e — deletes empty the cloud copy; unsent deletes send nothing', async () => {
    const app = signedIn();
    const a = job(app, 'ZZDELETEME');
    app.online();
    await app.fn('syncPush')({});
    app.fn('deleteSession')(a.id);
    app.stopTimer();
    await app.fn('syncPush')({});
    const del = app.srv.posts()[1];
    t.ok(!!del, 'the delete was sent');
    const row = del && del.body[0];
    t.eq(row && row.id, String(a.id), 'for the deleted job');
    t.eq(row && row.deleted, true, 'marked deleted');
    t.eq(row && JSON.stringify(row.doc), '{}', 'with the contents emptied (decision 4A)');
    t.excludes(JSON.stringify(del.body), 'ZZDELETEME', 'no trace of the job in the request');
    await app.fn('syncPush')({});
    t.eq(app.srv.posts().length, 2, 'a sent delete is not sent again');

    // Deleted before it was ever sent: the server never had it.
    const b = job(app, 'ZZNEVERSENT');
    app.fn('deleteSession')(b.id);
    app.stopTimer();
    await app.fn('syncPush')({});
    t.eq(app.srv.posts().length, 2, 'deleting a never-sent job sends nothing');

    // A job that is live AND in the ledger (restored after a delete) is live.
    const c = job(app, 'ZZBACKAGAIN');
    await app.fn('syncPush')({});
    app.run(`state.tombstones.push({ kind: 'session', id: ${JSON.stringify(String(c.id))}, at: new Date().toISOString() })`);
    app.run(`state.sessions.find(s => s.id === ${JSON.stringify(c.id)}).items[0].notes = 'ZZEDITED'`);
    await app.fn('syncPush')({});
    const last = app.srv.posts()[app.srv.posts().length - 1];
    t.eq(last.body.filter(r => r.id === String(c.id)).length, 1, 'one row for it');
    t.eq(last.body.find(r => r.id === String(c.id)).deleted, false, 'and it is live, not a delete');
  });

  /* ------------------------------------------------------------------ 16f */
  await t.group('16f — an edit made DURING a push is not marked as sent', async () => {
    let release;
    const gate = new Promise(r => { release = r; });
    const app = signedIn({ server: { sessions: async () => { await gate; return new Response(null, { status: 201 }); } } });
    const a = job(app, 'ZZINFLIGHT');
    app.online();
    const p = app.fn('syncPush')({});
    await tick(20);
    t.ok(app.srv.posts().length === 1, 'upload in flight');
    app.run(`state.activeId = ${JSON.stringify(a.id)}`);
    withItem(app, { assetNo: 'ZZMIDPUSH' });
    app.stopTimer();
    release();
    await p;
    t.eq(app.fn('syncStatusSummary')().waiting, 1, 'the mid-push edit is still waiting to send');
    await app.fn('syncPush')({});
    t.includes(JSON.stringify(app.srv.posts()[1].body), 'ZZMIDPUSH', 'and the next push sends it');
  });

  /* ------------------------------------------------------------------ 16g */
  await t.group('16g — sync state belongs to one account', async () => {
    const other = JSON.stringify({ userId: UID_A, sent: {}, gone: {}, lastPushAt: '2026-09-01T00:00:00Z' });
    const app = signedIn({ uid: UID_B, localStorage: { 'pat:syncState': other } });
    const a = job(app, 'ZZACCOUNTB');
    // Pretend account A had sent this exact job.
    const h = app.fn('syncHash')(JSON.stringify(app.state().sessions.find(s => s.id === a.id)));
    app.storage.setItem('pat:syncState', JSON.stringify({ userId: UID_A, sent: { [String(a.id)]: h }, gone: {}, lastPushAt: null }));
    t.eq(app.fn('syncStatusSummary')().waiting, 1, 'account B does not count what A sent');
    app.online();
    await app.fn('syncPush')({});
    const rows = app.srv.rows();
    t.eq(rows.length, 1, 'account B sends the job itself');
    t.eq(rows[0] && rows[0].user_id, UID_B, 'as B');
    t.eq(syncState(app).userId, UID_B, 'and the state now describes B');
  });

  /* ------------------------------------------------------------------ 16h */
  await t.group('16h — a failed upload records nothing and says so plainly', async () => {
    const app = signedIn({ server: { sessions: async () => new Response(
      JSON.stringify({ code: '42501', message: 'ZZSERVERSAID' }), { status: 403, headers: { 'content-type': 'application/json' } }) } });
    job(app, 'ZZFAILS');
    app.online();
    t.eq(await app.fn('syncPush')({ manual: true }), false, 'push resolved false');
    t.includes(app.state().sync.message, 'safe on this phone', 'message reassures');
    t.eq(app.state().sync.busy, false, 'busy cleared after a failure');
    t.eq(app.fn('syncStatusSummary')().waiting, 1, 'the job is still waiting — nothing marked sent');

    // No signal: a button press explains; no request is made.
    const off = signedIn();
    job(off, 'ZZOFFLINE');
    t.eq(await off.fn('syncPush')({ manual: true }), false, 'offline push resolved false');
    t.includes(off.state().sync.message, 'No signal', 'offline explained');
    t.eq(off.srv.calls.length, 0, 'offline: no request');
  });

  /* ------------------------------------------------------------------ 16i */
  await t.group('16i — clearing old jobs: cloud keeps them; unsent ones stay (decision 5A)', async () => {
    const toasts = [];
    const app = signedIn();
    app.sandbox.showToast = (m) => toasts.push(String(m));
    // Record what the confirm sheet was asked to say; the real sheet still opens.
    const asked = [];
    const realConfirm = app.sandbox.openConfirmSheet;
    app.sandbox.openConfirmSheet = (o) => { asked.push(String(o && o.message)); return realConfirm(o); };
    const a = job(app, 'ZZOLDJOB');
    app.run(`(() => { const s = state.sessions.find(x => x.id === ${JSON.stringify(a.id)});
      s.date = '2020-01-01'; s.exportedAt = '2020-01-02T00:00:00Z'; s.exportDirty = false;
      state.activeId = null; })()`);
    app.fn('pruneOldSessions')();
    t.ok(app.state().sessions.some(s => s.id === a.id), 'never-sent old job is NOT cleared while signed in');
    t.includes(toasts.join('|'), 'reached the cloud yet', 'and the toast says why');

    app.online();
    await app.fn('syncPush')({});
    const tombsBefore = (app.state().tombstones || []).length;
    app.fn('pruneOldSessions')();
    t.includes(asked.join('|'), 'Your cloud copy keeps them', 'the confirm says the cloud keeps it');
    t.ok(confirmSheet(app), 'confirm sheet shown');
    app.stopTimer();
    t.notOk(app.state().sessions.some(s => s.id === a.id), 'the sent job is cleared from the phone');
    t.eq((app.state().tombstones || []).length, tombsBefore, 'and it is NOT a deletion');
    const pruned = JSON.parse(app.storage.getItem('pat:syncPruned') || '[]');
    t.ok(pruned.some(e => e.id === String(a.id)), 'its id is remembered so the pull won\u2019t bring it back');
    const posts = app.srv.posts().length;
    await app.fn('syncPush')({});
    t.eq(app.srv.posts().length, posts, 'clearing sends nothing to the server');

    // Signed out: the pre-V80 behaviour, wording included.
    const out = boot();
    const askedOut = [];
    const realOut = out.sandbox.openConfirmSheet;
    out.sandbox.openConfirmSheet = (o) => { askedOut.push(String(o && o.message)); return realOut(o); };
    const b = withSession(out, { site: 'ZZSIGNEDOUTOLD' });
    out.run(`(() => { const s = state.sessions.find(x => x.id === ${JSON.stringify(b.id)});
      s.date = '2020-01-01'; s.exportedAt = '2020-01-02T00:00:00Z'; s.exportDirty = false;
      state.activeId = null; })()`);
    out.fn('pruneOldSessions')();
    t.includes(askedOut.join('|'), 'permanently removes them', 'signed out: the old wording');
    confirmSheet(out);
    t.notOk(out.state().sessions.some(s => s.id === b.id), 'signed out: cleared as before');
    t.eq(out.storage.getItem('pat:syncPruned'), null, 'nothing remembered for a job never sent');
  });

  /* ------------------------------------------------------------------ 16j */
  await t.group('16j — backups carry the cleared list, never the fingerprints; restore merges', async () => {
    const app = signedIn({ localStorage: {
      'pat:syncPruned': JSON.stringify([{ id: 'ZZPRUNEDHERE', at: '2026-09-01T00:00:00Z' }]),
      'pat:syncState': JSON.stringify({ userId: UID_A, sent: { x: 'ZZHASHVALUE' }, gone: {}, lastPushAt: null }),
    } });
    const bk = JSON.parse(JSON.stringify(app.fn('buildBackup')()));
    t.ok(Array.isArray(bk.syncPruned) && bk.syncPruned.some(e => e.id === 'ZZPRUNEDHERE'), 'cleared list in the backup');
    t.excludes(JSON.stringify(bk), 'ZZHASHVALUE', 'fingerprints are not');

    const bk2 = JSON.parse(JSON.stringify(bk));
    bk2.syncPruned = [{ id: 'ZZPRUNEDELSEWHERE', at: '2026-09-02T00:00:00Z' }, { id: 7 }, 'junk', null];
    const file = new app.sandbox.File([JSON.stringify(bk2)], 'b.json', { type: 'application/json' });
    app.fn('restoreBackupFromFile')(file);
    await tick(5);
    t.ok(confirmSheet(app), 'restore confirm shown');
    await tick(5);
    app.stopTimer();
    const list = JSON.parse(app.storage.getItem('pat:syncPruned') || '[]').map(e => e.id);
    t.ok(list.includes('ZZPRUNEDHERE'), 'the phone\u2019s own entry survived the restore (union, not replace)');
    t.ok(list.includes('ZZPRUNEDELSEWHERE'), 'the backup\u2019s entry was added');
    t.ok(list.includes('7'), 'a numeric id is kept as a string');
    t.eq(list.length, 3, 'junk entries dropped');
  });

  /* ------------------------------------------------------------------ 16k */
  await t.group('16k — Sync page: real counts and buttons, through the dispatch table', async () => {
    const app = signedIn();
    job(app, 'ZZPAGE');
    const st = app.state();
    st.view = 'cloudSync';
    app.fn('render')();
    const html = app.doc.getElementById('app').innerHTML;
    t.includes(html, 'id="cloud-sync-page"', 'real Sync page');
    t.includes(html, 'waiting to send', 'shows the job waiting');
    t.includes(html, 'id="sync-push"', 'Push now button');
    t.includes(html, 'id="sync-resend-all"', 'Re-send all button');
    app.online();
    const actions = app.run('ACTIONS');
    actions['sync-push']();
    await tick(30);
    t.eq(app.srv.posts().length, 1, 'the sync-push action sent the job');
    t.includes(app.doc.getElementById('app').innerHTML, 'Sent 1 job', 'result repainted onto the page');
    actions['sync-resend-all']();
    await tick(30);
    t.eq(app.srv.posts().length, 2, 'the sync-resend-all action sends again with nothing changed');

    const out = boot();
    out.state().view = 'cloudSync';
    out.fn('render')();
    t.includes(out.doc.getElementById('app').innerHTML, 'id="sync-signed-out"', 'signed out: sign-in prompt, no buttons');
  });

  /* ------------------------------------------------------------------ 16l */
  await t.group('16l — sign-in is followed by a push', async () => {
    const app = boot({ navigator: { onLine: false } });
    const srv = fakeServer();
    const sb = app.sandbox;
    for (const k of ['Headers', 'Request', 'Response', 'AbortController', 'TextEncoder',
                     'TextDecoder', 'URLSearchParams', 'URL', 'atob', 'btoa']) sb[k] = globalThis[k];
    if (!sb.crypto) sb.crypto = globalThis.crypto;
    sb.WebSocket = class {};
    sb.fetch = async (u, init) => {
      if (String(u).includes('/auth/v1/verify')) {
        return new Response(JSON.stringify({
          access_token: 'ZZACCESS', token_type: 'bearer', expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'ZZREFRESH',
          user: { id: UID_A, email: 'peter@example.com', aud: 'authenticated', role: 'authenticated' },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return srv.fetchImpl(u, init);
    };
    app.run(LIB);
    job(app, 'ZZAFTERSIGNIN');
    app.run('navigator.onLine = true');
    const st = app.state();
    st.cloud.status = 'code-sent';
    st.cloud.email = 'peter@example.com';
    st.view = 'cloudAccount';
    app.fn('render')();
    app.doc.getElementById('cloud-code').value = '123456';
    t.ok(await app.fn('cloudVerifyCode')(), 'signed in');
    await tick(60);
    t.eq(srv.posts().length, 1, 'the jobs were sent straight after sign-in');
    app.stopTimer();
  });

  /* ------------------------------------------------------------------ 16m */
  t.group('16m — without sync.js the app boots, saves, prunes and shows the Sync page', () => {
    const app = boot({ skip: ['sync.js'], localStorage: { 'patgo:cloudAuth:test': storedSession() },
                       navigator: { onLine: false } });
    t.ok(app.doc.getElementById('app').innerHTML.length > 0, 'first screen painted without sync.js');
    t.doesNotThrow(() => { withSession(app, { site: 'ZZNOSYNC' }); withItem(app, {}); }, 'logging works');
    const actions = app.run('ACTIONS');
    for (const a of ['sync-push', 'sync-resend-all']) t.doesNotThrow(() => actions[a](), `${a} is harmless`);
    app.state().view = 'cloudSync';
    t.doesNotThrow(() => app.fn('render')(), 'Sync page renders');
    t.includes(app.doc.getElementById('app').innerHTML, "Sync didn't load", 'and says sync is missing');
    t.doesNotThrow(() => app.fn('pruneOldSessions')(), 'clearing old jobs still works');
    t.notOk('syncPruned' in JSON.parse(JSON.stringify(app.fn('buildBackup')())), 'backup unaffected');
  });

  /* ------------------------------------------------------------------ 16n */
  t.group('16n — sync.js loads straight after cloud.js and is precached', () => {
    const { scriptOrderFromIndex, swAssetScripts } = require('../load');
    const order = scriptOrderFromIndex();
    t.eq(order.indexOf('sync.js'), order.indexOf('cloud.js') + 1, 'index.html: sync.js immediately after cloud.js');
    t.ok(swAssetScripts().includes('sync.js'), 'sw.js ASSETS has sync.js (works offline after an update)');
    const boot = fs.readFileSync(path.join(APP_DIR, 'boot.js'), 'utf8');
    t.ok(boot.indexOf('syncBoot()') > boot.indexOf('cloudBoot()'), 'boot starts sync after cloud sign-in state');
  });
};
