/* Standing test — sync, pull (V81)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. sync.js reads jobs back from the cloud as well as
   sending them. What decides a disagreement is the FINGERPRINT, not a
   timestamp: a local job that still hashes to what was last sent has nothing
   unsent, so a differing cloud row is the other phone's newer work. Anything
   else is HELD — the phone's copy untouched, the cursor stopped, the Sync page
   asking which copy to keep.

   ⚠ DRIVES THE REAL VENDORED LIBRARY against a fake server, as 15f and 16 do,
   so the assertions are on the HTTP the library actually sends and on rows it
   actually parsed — not on a hand-rolled stand-in for either.

   ⚠ BOOTS OFFLINE, THEN GOES ONLINE, for the reason group 16 gives: a signed-in
   online boot schedules a run before a test can install the fake server.

   ⚠ WHAT THIS FILE CANNOT PROVE. That the server keeps one engineer's rows from
   another — that is supabase/isolation-test.sql, by hand, every release. Nor
   that two real phones converge: that is the post-deploy checklist. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { tick, CANARY, withSession, withItem } = require('../fixture');

const LIB = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');
const UID_A = '11111111-1111-1111-1111-111111111111';

const T1 = '2026-09-01T10:00:00.000Z';
const T2 = '2026-09-02T10:00:00.000Z';
const T3 = '2026-09-03T10:00:00.000Z';

function storedSession(id = UID_A, email = 'peter@example.com') {
  return JSON.stringify({
    access_token: 'ZZACCESS', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'ZZREFRESH',
    user: { id, email, aud: 'authenticated', role: 'authenticated' },
  });
}

/* A server that actually answers a pull: it applies the `updated_at=gt.` and
   `id=eq.` filters, the ordering and the limit from the URL the library built.
   Filtering here rather than returning the whole array is what makes 17b able
   to tell a cursor that moved from one that did not. */
// Recursively rebuild an object with its keys in a DIFFERENT order, the way
// jsonb does. Content-identical, byte-different under JSON.stringify.
function reorderKeys(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(reorderKeys);
  const out = {};
  for (const k of Object.keys(v).reverse()) out[k] = reorderKeys(v[k]);
  return out;
}

function fakeServer(o = {}) {
  const calls = [];
  const cloud = (o.rows || []).slice();

  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    let body = null;
    try { body = init.body ? JSON.parse(init.body) : null; } catch { body = init.body; }
    calls.push({ url: u, method, body });

    if (u.includes('/rest/v1/sessions')) {
      if (method === 'GET') {
        const q = new URLSearchParams(u.split('?')[1] || '');
        let rows = cloud.slice();
        const gt = q.get('updated_at');
        if (gt && gt.startsWith('gt.')) rows = rows.filter(r => r.updated_at > gt.slice(3));
        const eq = q.get('id');
        if (eq && eq.startsWith('eq.')) rows = rows.filter(r => String(r.id) === eq.slice(3));
        rows.sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)));
        const lim = parseInt(q.get('limit') || '0', 10);
        if (lim > 0) rows = rows.slice(0, lim);
        // ⚠ v81.2. The `doc` column is jsonb, and jsonb does NOT give back the
        // JSON it was handed — Postgres re-sorts object keys. Until this line
        // existed the fake server returned the very object it was given, so a
        // whole class of bug was invisible here and shipped: every phone saw
        // its own pushed job as changed. Reversing the keys is the cheapest
        // way to guarantee the order differs from what any caller built.
        return new Response(JSON.stringify(rows.map(reorderKeys)), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      // An upsert. Land it in the cloud array so a later pull sees it.
      for (const row of (Array.isArray(body) ? body : [])) {
        const i = cloud.findIndex(r => String(r.id) === String(row.id));
        const stored = Object.assign({}, row, { updated_at: o.pushStamp || T3 });
        if (i === -1) cloud.push(stored); else cloud[i] = stored;
      }
      return new Response(null, { status: 201 });
    }

    if (u.includes('/rest/v1/profiles')) {
      return new Response(JSON.stringify([{ plan: 'trial', trial_ends_at: null }]),
        { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ message: 'unexpected ' + u }), { status: 404 });
  };

  return {
    calls, fetchImpl, cloud,
    gets:  () => calls.filter(c => c.url.includes('/rest/v1/sessions') && c.method === 'GET'),
    posts: () => calls.filter(c => c.url.includes('/rest/v1/sessions') && c.method === 'POST'),
    rows:  () => calls.filter(c => c.url.includes('/rest/v1/sessions') && c.method === 'POST')
                      .flatMap(c => Array.isArray(c.body) ? c.body : []),
  };
}

function signedIn(opts = {}) {
  const ls = Object.assign({ 'patgo:cloudAuth:test': storedSession(opts.uid || UID_A) }, opts.localStorage || {});
  const app = bootApp({ localStorage: ls, navigator: { onLine: false } });
  app.fn('load')();
  app.state = () => app.refresh('state').state;
  app.stopTimer = () => app.run('if (_syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }');
  const srv = fakeServer(opts.server || {});
  const sb = app.sandbox;
  for (const k of ['Headers', 'Request', 'Response', 'AbortController', 'TextEncoder',
                   'TextDecoder', 'URLSearchParams', 'URL', 'atob', 'btoa']) sb[k] = globalThis[k];
  if (!sb.crypto) sb.crypto = globalThis.crypto;
  sb.WebSocket = class {};
  sb.fetch = srv.fetchImpl;
  app.run(LIB);
  app.run('navigator.onLine = true');
  app.srv = srv;
  app.stopTimer();
  return app;
}

/* A cloud row for a job this phone has never seen. Shaped as the push builds
   them, because that is the only thing that ever writes one. */
function cloudJob(id, site, items, stamp = T1) {
  return {
    id,
    doc: {
      id, site, name: '', engineer: CANARY.engineer, prefix: '', date: '2026-09-01',
      startNumber: 1, locked: false,
      items: items.map((a, i) => ({ assetNo: a, location: 'ZZPULLED', itemType: 'Kettle', notes: '', result: 'pass', id: id + '-i' + i })),
    },
    deleted: false,
    last_modified: stamp,
    updated_at: stamp,
  };
}

function syncState(app) {
  return JSON.parse(app.storage.getItem('pat:syncState') || 'null');
}

function held(app) {
  return JSON.parse(app.storage.getItem('pat:syncHeld') || '[]');
}

function jobById(app, id) {
  return (app.state().sessions || []).find(s => String(s.id) === String(id));
}

/* Put a job on the phone AND record it as sent, i.e. a clean local copy — the
   state every "the cloud may apply" case starts from. */
function sentJob(app, site) {
  const s = withSession(app, { site });
  withItem(app, { assetNo: CANARY.asset, result: 'pass' });
  app.stopTimer();
  const sess = app.fn('activeSession')();
  // Step out of the job. Decision 7A holds anything open on screen — that is
  // 17d's subject, and leaving it active here would quietly mask every other
  // group in this file by blocking the row before it is ever decided.
  app.run('state.activeId = null');
  const st = syncState(app) || { userId: UID_A, sent: {}, gone: {}, resend: {}, lastPushAt: null, pulledAt: null, lastPullAt: null };
  st.userId = UID_A;
  // v81.2: without this the loader drops `sent` as pre-canonical, and every
  // "clean local copy" fixture would silently become a dirty one.
  st.hashV = 2;
  st.sent[String(sess.id)] = app.fn('syncHash')(app.fn('_syncCanonical')(sess));
  app.storage.setItem('pat:syncState', JSON.stringify(st));
  return sess;
}

/* Edit a job the engineer is NOT currently standing in: open it, log an item,
   step back out. Anything that adds an item has to go through the real entry
   path, and that path needs the job active — so the stepping out has to be
   explicit rather than assumed. */
function editJob(app, id, assetNo, result = 'pass') {
  app.fn('openSession')(id);
  withItem(app, { assetNo, result });
  app.run('state.activeId = null');
  app.stopTimer();
}

module.exports = async function () {
  /* ------------------------------------------------------------------ 17a */
  await t.group('17a — a job from the other phone arrives, and is not sent back', async () => {
    const app = signedIn({ server: { rows: [cloudJob('ZZREMOTE1', 'ZZOTHERSITE', ['R-1', 'R-2'])] } });
    await app.fn('syncPull')();
    await tick(5);

    const got = jobById(app, 'ZZREMOTE1');
    t.ok(got, 'the job is on the phone');
    t.eq(got && got.items.length, 2, 'with both its items');
    t.eq(got && got.site, 'ZZOTHERSITE', 'and its own site, not this phone\u2019s');

    const st = syncState(app);
    t.eq(st.sent['ZZREMOTE1'], app.fn('syncHash')(app.fn('_syncCanonical')(got)),
      'the fingerprint is set to what was applied \u2014 this is what stops it being pushed straight back');
    t.eq(app.srv.rows().filter(r => String(r.id) === 'ZZREMOTE1').length, 0,
      'and the push half of the same run sent it nowhere');

    t.includes(JSON.stringify(app.storage.getItem('pat:sessions')), 'ZZPULLED',
      'it is on disk, not only in memory');
  });

  /* ------------------------------------------------------------------ 17b */
  await t.group('17b — the cursor advances on a clean run and stops at the first unresolved row', async () => {
    const app = signedIn({ server: { rows: [cloudJob('ZZCUR1', 'ZZC1', ['A'], T1)] } });
    await app.fn('syncPull')();
    await tick(5);
    t.eq(syncState(app).pulledAt, T1, 'the mark moves to the newest row read');

    const second = app.fn('syncPull');
    await second();
    await tick(5);
    const url = app.srv.gets().slice(-1)[0].url;
    t.includes(url, encodeURIComponent('gt.' + T1).replace(/%2E/g, '.'),
      'the next pull asks only for rows newer than the mark');

    // Now a row that cannot be resolved: both sides changed.
    const local = sentJob(app, 'ZZBOTH');
    app.srv.cloud.push(cloudJob(String(local.id), 'ZZBOTH', ['X', 'Y'], T2));
    editJob(app, local.id, 'ZZLOCALEDIT');   // local now dirty
    await app.fn('syncPull')();
    await tick(5);
    t.eq(syncState(app).pulledAt, T1,
      'the mark stays where it was \u2014 a cursor past an unread row is a change nobody ever sees again');
    t.eq(syncState(app).lastPullAt !== null, true, 'but the run is still recorded as having happened');
  });

  /* ------------------------------------------------------------------ 17c */
  await t.group('17c — jobs cleared from this phone are never brought back', async () => {
    const app = signedIn({
      localStorage: { 'pat:syncPruned': JSON.stringify([{ id: 'ZZCLEARED', at: T1 }]) },
      server: { rows: [cloudJob('ZZCLEARED', 'ZZOLDJOB', ['A', 'B'])] },
    });
    await app.fn('syncPull')();
    await tick(5);
    t.notOk(jobById(app, 'ZZCLEARED'), 'the cleared job did not come back');
    t.eq(held(app).length, 0, 'and it is not a question either \u2014 clearing already answered it');
    t.eq(syncState(app).pulledAt, T1, 'a deliberately skipped row still lets the cursor move');
  });

  /* ------------------------------------------------------------------ 17d */
  await t.group('17d — the job on screen is never touched (decision 7A)', async () => {
    const app = signedIn();
    const local = sentJob(app, 'ZZOPEN');
    app.srv.cloud.push(cloudJob(String(local.id), 'ZZOPEN', ['A', 'B', 'C'], T2));
    app.fn('openSession')(local.id);
    app.stopTimer();
    t.eq(app.state().activeId, local.id, 'precondition: the job is open');

    await app.fn('syncPull')();
    await tick(5);
    t.eq(jobById(app, local.id).items.length, 1,
      'the open job keeps the items it had \u2014 nothing changes under the engineer\u2019s thumb');
    t.eq(held(app).length, 0, 'and it is not raised as a question: there is nothing to decide, only to finish');
    t.eq(syncState(app).pulledAt, null, 'the cursor waits for it');

    // Leave the job; the next pull applies it.
    app.run('state.activeId = null');
    await app.fn('syncPull')();
    await tick(5);
    t.eq(jobById(app, local.id).items.length, 3, 'once it is not on screen, it applies');
  });

  /* ------------------------------------------------------------------ 17e */
  await t.group('17e — changed in both places: held, and nothing overwritten (decisions 1A/2A)', async () => {
    const app = signedIn();
    const local = sentJob(app, 'ZZCLASH');
    app.srv.cloud.push(cloudJob(String(local.id), 'ZZCLASH', ['C-1', 'C-2', 'C-3'], T2));
    editJob(app, local.id, 'ZZMINE', 'fail');

    await app.fn('syncPull')();
    await tick(5);

    const mine = jobById(app, local.id);
    t.eq(mine.items.length, 2, 'the phone\u2019s copy is exactly as it was');
    t.includes(JSON.stringify(mine.items), 'ZZMINE', 'including the edit that was never sent');

    const h = held(app);
    t.eq(h.length, 1, 'one job is waiting on a decision');
    t.eq(h[0].reason, 'both-changed', 'for the right reason');
    t.eq(h[0].localItems, 2, 'the question names this phone\u2019s count');
    t.eq(h[0].cloudItems, 3, 'and the cloud\u2019s');
    // ⚠ RAW, not through _syncHeldLoad(): the loader whitelists its fields, so
    // reading back through it would hide a document that had been written.
    t.excludes(String(app.storage.getItem('pat:syncHeld')), 'ZZPULLED',
      'and it does NOT keep the cloud document \u2014 held rows are a question, not a second copy of the work');
    t.excludes(String(app.storage.getItem('pat:syncHeld')), '"items"',
      'nor any part of one');
  });

  /* ------------------------------------------------------------------ 17f */
  await t.group('17f — a remote delete runs the same sweeps as deleteSession, in the same order', async () => {
    const app = signedIn();
    const local = sentJob(app, 'ZZDELREMOTE');
    const id = String(local.id);

    const order = [];
    app.run(`
      _t17archive = archiveSessionStats; _t17photos = photosDeleteForSessions; _t17tomb = recordTombstone;
      _t17order = [];
      archiveSessionStats = function (a) { _t17order.push('archive:' + (state.sessions.some(s => String(s.id) === ${JSON.stringify(id)}) ? 'present' : 'gone')); return _t17archive(a); };
      photosDeleteForSessions = function (a) { _t17order.push('photos:' + (state.sessions.some(s => String(s.id) === ${JSON.stringify(id)}) ? 'present' : 'gone')); return _t17photos(a); };
      recordTombstone = function (k, i) { _t17order.push('tombstone:' + (state.sessions.some(s => String(s.id) === ${JSON.stringify(id)}) ? 'present' : 'gone')); return _t17tomb(k, i); };
    `);

    app.srv.cloud.push({ id, doc: {}, deleted: true, last_modified: T2, updated_at: T2 });
    await app.fn('syncPull')();
    await tick(5);
    order.push(...app.run('_t17order'));

    t.notOk(jobById(app, id), 'the job is gone from this phone');
    t.deepEq(order, ['archive:present', 'photos:present', 'tombstone:present'],
      'all three sweeps ran, and every one of them ran BEFORE the removal (MAP rule 5)');
    t.ok((app.state().tombstones || []).some(x => x.kind === 'session' && String(x.id) === id),
      'the delete is in this phone\u2019s ledger too, so it is not re-created from here');
    t.eq(syncState(app).gone[id], true, 'and recorded as the cloud already knowing');
    t.notOk(syncState(app).sent[id], 'with its fingerprint dropped');

    // The reference implementation must still do exactly these three.
    const src = fs.readFileSync(path.join(APP_DIR, 'session.js'), 'utf8');
    const body = src.slice(src.indexOf('function deleteSession('), src.indexOf('function saveItem('));
    for (const sweep of ['archiveSessionStats', 'photosDeleteForSessions', 'recordTombstone']) {
      t.includes(body, sweep, `deleteSession still sweeps ${sweep} \u2014 if it grew a fourth, _syncApplyRemoteDelete must grow it too`);
    }
  });

  /* ------------------------------------------------------------------ 17g */
  await t.group('17g — fewer items in the cloud is held even when the local copy is clean (decision 3A)', async () => {
    const app = signedIn();
    const local = sentJob(app, 'ZZSHRINK');
    editJob(app, local.id, 'ZZSECOND');
    // Re-mark clean at TWO items, so decision 1A alone would apply the cloud row.
    const sess = jobById(app, local.id);
    const st = syncState(app);
    st.sent[String(local.id)] = app.fn('syncHash')(app.fn('_syncCanonical')(sess));
    app.storage.setItem('pat:syncState', JSON.stringify(st));

    app.srv.cloud.push(cloudJob(String(local.id), 'ZZSHRINK', ['ONLY-1'], T2));
    await app.fn('syncPull')();
    await tick(5);

    t.eq(jobById(app, local.id).items.length, 2, 'the phone keeps both items');
    const h = held(app);
    t.eq(h.length, 1, 'and asks');
    t.eq(h[0].reason, 'fewer-items', 'naming the shrink as the reason, not a clash');
    t.eq(h[0].cloudItems, 1, 'with the cloud count');
    t.eq(h[0].localItems, 2, 'and the local one');
  });

  /* ------------------------------------------------------------------ 17h */
  await t.group('17h — an unreadable cloud row is held, not applied and not stepped over (decision 8A)', async () => {
    const app = signedIn({ server: { rows: [
      { id: 'ZZBAD', doc: { id: 'ZZBAD', site: 'ZZBAD', items: 'not-an-array' }, deleted: false, last_modified: T1, updated_at: T1 },
    ] } });
    await app.fn('syncPull')();
    await tick(5);

    t.notOk(jobById(app, 'ZZBAD'), 'nothing was written to the sessions list');
    const h = held(app);
    t.eq(h.length, 1, 'it is raised');
    t.eq(h[0].reason, 'unreadable', 'as unreadable');
    t.eq(syncState(app).pulledAt, null, 'and the cursor does not step past it');

    // A doc filed under the wrong id is the other way this fails.
    const app2 = signedIn({ server: { rows: [
      { id: 'ZZMISFILED', doc: { id: 'SOMETHINGELSE', site: 'X', items: [] }, deleted: false, last_modified: T1, updated_at: T1 },
    ] } });
    await app2.fn('syncPull')();
    await tick(5);
    t.eq(held(app2)[0] && held(app2)[0].reason, 'unreadable', 'a row whose document is filed under another id is unreadable too');
  });

  /* ------------------------------------------------------------------ 17i */
  await t.group('17i — deleted here, live again in the cloud', async () => {
    const app = signedIn();
    const local = sentJob(app, 'ZZRESURRECT');
    const id = String(local.id);

    // The delete has already reached the cloud.
    const st = syncState(app);
    delete st.sent[id];
    st.gone[id] = true;
    app.storage.setItem('pat:syncState', JSON.stringify(st));
    app.run(`state.sessions = state.sessions.filter(s => String(s.id) !== ${JSON.stringify(id)});
             recordTombstone('session', ${JSON.stringify(id)});`);

    app.srv.cloud.push(cloudJob(id, 'ZZRESURRECT', ['BACK-1'], T2));
    await app.fn('syncPull')();
    await tick(5);

    t.notOk(jobById(app, id), 'it is not silently put back');
    t.eq(held(app)[0] && held(app)[0].reason, 'deleted-here', 'it is asked about');

    // The other shape: deleted here, NOT yet pushed — the push settles it, no question.
    const app2 = signedIn();
    const l2 = sentJob(app2, 'ZZPENDINGDEL');
    const id2 = String(l2.id);
    app2.srv.cloud.push(cloudJob(id2, 'ZZPENDINGDEL', ['A'], T2));
    app2.run(`state.sessions = state.sessions.filter(s => String(s.id) !== ${JSON.stringify(id2)});
              recordTombstone('session', ${JSON.stringify(id2)});`);
    await app2.fn('syncPull')();
    await tick(5);
    t.eq(held(app2).length, 0, 'an unsent delete is not a question \u2014 the push in the same run carries it');
    const sentDel = app2.srv.rows().filter(r => String(r.id) === id2 && r.deleted === true);
    t.eq(sentDel.length, 1, 'and it was sent as a delete');
  });

  /* ------------------------------------------------------------------ 17j */
  await t.group('17j — answering "keep this phone\u2019s copy" overwrites the cloud', async () => {
    const app = signedIn();
    const local = sentJob(app, 'ZZKEEPMINE');
    const id = String(local.id);
    app.srv.cloud.push(cloudJob(id, 'ZZKEEPMINE', ['C-1', 'C-2'], T2));
    editJob(app, id, 'ZZKEEPTHIS');
    await app.fn('syncPull')();
    await tick(5);
    t.eq(held(app).length, 1, 'precondition: it is held');

    await app.fn('syncHeldResolve')(id, 'phone');
    await tick(10);

    t.eq(held(app).length, 0, 'the question is answered');
    t.includes(JSON.stringify(jobById(app, id).items), 'ZZKEEPTHIS', 'the phone\u2019s copy is untouched');
    const pushed = app.srv.rows().filter(r => String(r.id) === id);
    t.ok(pushed.length >= 1, 'and it was sent');
    t.includes(JSON.stringify(pushed[pushed.length - 1].doc), 'ZZKEEPTHIS',
      'carrying the phone\u2019s items, so the cloud row is replaced rather than merged');
    t.notOk((syncState(app).resend || {})[id],
      'the re-send marker is cleared once it lands, or every later push would send it again');
  });

  /* ------------------------------------------------------------------ 17k */
  await t.group('17k — answering "use the cloud copy" re-reads it and applies it', async () => {
    const app = signedIn();
    const local = sentJob(app, 'ZZTAKECLOUD');
    const id = String(local.id);
    app.srv.cloud.push(cloudJob(id, 'ZZTAKECLOUD', ['C-1', 'C-2'], T2));
    editJob(app, id, 'ZZDISCARD');
    await app.fn('syncPull')();
    await tick(5);
    const before = app.srv.gets().length;

    await app.fn('syncHeldResolve')(id, 'cloud');
    await tick(10);

    t.ok(app.srv.gets().length > before,
      'the document is fetched at answer time \u2014 it was never stored, which is the point');
    const now = jobById(app, id);
    t.eq(now.items.length, 2, 'the cloud copy is in place');
    t.excludes(JSON.stringify(now.items), 'ZZDISCARD', 'and the local edit is gone, as chosen');
    t.eq(held(app).length, 0, 'the question is answered');
    t.eq(syncState(app).sent[id], app.fn('syncHash')(app.fn('_syncCanonical')(now)),
      'and fingerprinted, so it is not pushed back as if it were new work');
  });

  /* ------------------------------------------------------------------ 17l */
  await t.group('17l — an applied job survives a reload (the v69 encoding-cache trap)', async () => {
    const app = signedIn();
    const local = sentJob(app, 'ZZENCODE');
    const id = String(local.id);
    // Same item COUNT and same session fields as the local copy — the exact
    // shape _sessionSig() cannot see a difference in. Only the item contents move.
    const remote = cloudJob(id, 'ZZENCODE', ['ZZREWRITTEN'], T2);
    remote.doc.date = local.date;
    remote.doc.engineer = local.engineer;
    remote.doc.startNumber = local.startNumber;
    remote.doc.prefix = local.prefix;
    remote.doc.name = local.name;
    app.srv.cloud.push(remote);

    await app.fn('syncPull')();
    await tick(5);
    t.includes(JSON.stringify(jobById(app, id).items), 'ZZREWRITTEN', 'applied in memory');

    const onDisk = app.storage.getItem('pat:sessions');
    t.includes(onDisk, 'ZZREWRITTEN',
      'and written to disk \u2014 a stale cached encoding here would un-happen the change on the next reload');
    t.excludes(onDisk, CANARY.asset, 'with the replaced item gone, not sitting alongside it');
  });

  /* ------------------------------------------------------------------ 17m */
  // ⚠ REVERSED at v81.1. V81 asserted the opposite — that a save pushes without
  // reading — on hot-path grounds. That left a window with no open job in it:
  // the other phone pushes, this phone edits, its debounce fires before anything
  // has pulled, and it overwrites work it never saw. Decision 2A: every run
  // reads before it writes, so a push can only ever follow a look.
  await t.group('17m — every run reads before it writes, the save trigger included (decision 2A)', async () => {
    const app = signedIn({ server: { rows: [cloudJob('ZZBEFOREPUSH', 'ZZOTHER', ['A'])] } });
    const local = sentJob(app, 'ZZSAVEPULLS');
    app.fn('openSession')(local.id);
    withItem(app, { assetNo: 'ZZHOTPATH', result: 'pass' });
    t.notEq(app.run('_syncTimer'), null, 'a save still schedules a run');
    app.stopTimer();

    const before = app.srv.gets().length;
    await app.fn('syncPush')({ pull: true });
    await tick(5);
    t.ok(app.srv.gets().length > before, 'the run reads first');
    t.ok(app.srv.posts().length > 0, 'and then sends');
    t.ok(jobById(app, 'ZZBEFOREPUSH'), 'picking up the other device\u2019s job on the way');

    const src = fs.readFileSync(path.join(APP_DIR, 'sync.js'), 'utf8');
    // ⚠ Slice to syncNoteNav, NOT to syncPushSoon. v81.2 inserted syncNoteNav
    // and _syncIdleCheck between the two, and both of them contain the same
    // '{ pull: true }' — so the wider slice passed even with the save trigger's
    // own read removed. M171 surviving is what exposed it.
    const fn = src.slice(src.indexOf('function syncNoteSave('), src.indexOf('function syncNoteNav('));
    t.includes(fn.replace(/\/\/[^\n]*/g, ''), '{ pull: true }',
      'and the save trigger itself asks for the read \u2014 source-guarded on the CALL, because a debounce that never fires headlessly proves nothing');
  });

  /* ------------------------------------------------------------------ 17n */
  await t.group('17n — the Sync page asks the question and offers both answers', async () => {
    const app = signedIn();
    const local = sentJob(app, 'ZZPAGEASK');
    const id = String(local.id);
    app.srv.cloud.push(cloudJob(id, 'ZZPAGEASK', ['C-1', 'C-2', 'C-3'], T2));
    editJob(app, id, 'ZZPAGEMINE');
    await app.fn('syncPull')();
    await tick(5);

    const html = app.fn('renderCloudSync')();
    t.includes(html, 'Needs a decision', 'the page says there is something to settle');
    t.includes(html, 'ZZPAGEASK', 'naming the job');
    t.includes(html, 'data-action="sync-keep-phone"', 'with the keep-this-phone answer');
    t.includes(html, 'data-action="sync-keep-cloud"', 'and the take-the-cloud answer');
    t.includes(html, 'data-action="sync-pull"', 'and a way to check for updates by hand');
    t.includes(html, 'Last checked', 'and says when it last looked');
    t.excludes(html, 'fingerprint', 'in plain language \u2014 no jargon of ours on a screen a user reads');

    // Through the real dispatch table, not by calling the function.
    const table = app.run('ACTIONS');
    t.ok(table && typeof table['sync-keep-phone'] === 'function', 'the answer is wired into dispatch');
    table['sync-keep-phone'](id);
    await tick(10);
    t.eq(held(app).length, 0, 'and tapping it answers the question');
  });

  /* ------------------------------------------------------------------ 17q */
  // Peter's two-phone test, V81. Phone A is standing in the job; phone B adds a
  // different item and sends it. V81 skipped the open job in the PULL and then
  // sent it anyway in the PUSH — so B's item was overwritten, silently, with no
  // question asked. Decision 1A (V81.1): the open job is still judged, only its
  // application is deferred.
  await t.group('17q — an open job with unsent changes is never sent over the cloud copy', async () => {
    const app = signedIn();
    const local = sentJob(app, 'ZZTWOPHONE');          // one item: the first Lead
    const id = String(local.id);

    // Phone B, online, logs an AC adapter against the same job.
    app.srv.cloud.push(cloudJob(id, 'ZZTWOPHONE', ['LEAD-1', 'AC-ADAPTER'], T2));

    // Phone A is inside the job and logs a second Lead of its own.
    app.fn('openSession')(id);
    withItem(app, { assetNo: 'ZZLEAD-2', result: 'pass' });
    app.stopTimer();
    t.eq(app.state().activeId, id, 'precondition: the job is open on this phone');

    await app.fn('syncPull')();
    await tick(5);

    const sentBack = app.srv.rows().filter(r => String(r.id) === id);
    t.eq(sentBack.length, 0,
      'the phone did NOT send its copy over the other device\u2019s \u2014 a push is an unconditional overwrite, and nothing has decided which copy wins');
    t.includes(JSON.stringify(app.srv.cloud.find(r => String(r.id) === id)), 'AC-ADAPTER',
      'so the other device\u2019s item is still in the cloud');

    const h = held(app);
    t.eq(h.length, 1, 'and it is raised as a question rather than settled quietly');
    t.eq(h[0].reason, 'both-changed', 'for the right reason');

    t.includes(JSON.stringify(jobById(app, id).items), 'ZZLEAD-2',
      'while this phone\u2019s own item stays exactly where it was');
    t.eq(jobById(app, id).items.length, 2,
      'and the open job is not rewritten under the engineer\u2019s thumb \u2014 deciding is not applying');
  });

  /* ------------------------------------------------------------------ 17r */
  await t.group('17r — the open job says when something is waiting for it (decision 3A)', async () => {
    const app = signedIn();
    const local = sentJob(app, 'ZZWAITING');
    const id = String(local.id);
    app.fn('openSession')(id);
    app.stopTimer();

    // Deleted on the other device while this phone sits in it.
    app.srv.cloud.push({ id, doc: {}, deleted: true, last_modified: T2, updated_at: T2 });
    await app.fn('syncPull')();
    await tick(5);

    t.ok(jobById(app, id), 'the job is still here while it is open \u2014 it does not vanish mid-tap');
    const html = app.fn('renderEntry')();
    t.includes(html, 'Deleted on your other device',
      'but the screen says so, instead of letting it disappear the moment you leave');

    // And it does leave, once you do.
    app.run('state.activeId = null');
    await app.fn('syncPull')();
    await tick(5);
    t.notOk(jobById(app, id), 'once out of the job, the delete applies');
    t.eq(app.state().sync.waiting, null,
      'and the notice goes with it \u2014 a line that outlives what it described trains the engineer to ignore it');

    // It must also never appear against a DIFFERENT job.
    const other = sentJob(app, 'ZZUNRELATED');
    app.fn('openSession')(other.id);
    app.stopTimer();
    t.excludes(app.fn('renderEntry')(), 'other device',
      'and says nothing at all on a job with nothing waiting for it');

    // The other half: a waiting change rather than a waiting delete.
    const app2 = signedIn();
    const l2 = sentJob(app2, 'ZZWAITING2');
    const id2 = String(l2.id);
    app2.srv.cloud.push(cloudJob(id2, 'ZZWAITING2', ['A', 'B', 'C'], T2));
    app2.fn('openSession')(id2);
    app2.stopTimer();
    await app2.fn('syncPull')();
    await tick(5);
    t.eq(jobById(app2, id2).items.length, 1, 'the open job is untouched');
    t.includes(app2.fn('renderEntry')(), 'other device',
      'and says a change is waiting for it');
  });

  /* ------------------------------------------------------------------ 17s */
  // v81.2, decision 3A. The `doc` column is jsonb: Postgres re-sorts object
  // keys, so a job comes back byte-different from the one that was sent. Under
  // plain JSON.stringify that reads as a change, and a phone re-applies its own
  // work over itself — which on the open job showed up as "changes from your
  // other device are waiting" when nothing had come from the other device.
  await t.group('17s — a job coming back with its keys reordered is not a change', async () => {
    const app = signedIn();
    const local = sentJob(app, 'ZZJSONB');
    const id = String(local.id);

    // Byte-different, content-identical: exactly what the server gives back.
    const same = reorderKeys(JSON.parse(JSON.stringify(jobById(app, id))));
    t.notEq(JSON.stringify(same), JSON.stringify(jobById(app, id)),
      'precondition: the reordered copy really is byte-different');
    app.srv.cloud.push({ id, doc: same, deleted: false, last_modified: T2, updated_at: T2 });

    const before = app.srv.posts().length;
    await app.fn('syncPull')();
    await tick(5);

    t.eq(held(app).length, 0, 'it raises no question \u2014 nothing has actually changed');
    t.eq(app.state().sync.waiting, null, 'and claims nothing is waiting for any job');
    t.eq(app.srv.posts().length, before, 'and sends nothing back');
    t.eq(syncState(app).pulledAt, T2, 'the row is resolved, so the cursor moves past it');

    // The canonical form is what makes that true, and it must be recursive:
    // nested items are where the reordering actually bites.
    const canon = app.fn('_syncCanonical');
    t.eq(canon({ b: 1, a: { d: 2, c: [{ f: 3, e: 4 }] } }),
         canon({ a: { c: [{ e: 4, f: 3 }], d: 2 }, b: 1 }),
         'key order does not reach the hash, at any depth');
    t.notEq(canon({ a: 1 }), canon({ a: 2 }), 'but a real difference still does');
  });

  /* ------------------------------------------------------------------ 17t */
  // v81.2, decision 1A. Peter's V81.1 report: everything worked and almost
  // nothing showed until he tapped between jobs. The only repaint sync did was
  // the Sync page.
  await t.group('17t — a pull repaints the screen you are on, but never over a field or a sheet', async () => {
    const app = signedIn({ server: { rows: [cloudJob('ZZSHOWME', 'ZZSHOWSITE', ['A'])] } });
    app.run("state.view = 'sessions'");
    const before = app.run('typeof __renders === "number" ? __renders : 0');
    app.run('__renders = ' + before + '; _origRender = render; render = function () { __renders++; return _origRender.apply(null, arguments); };');

    await app.fn('syncPull')();
    await tick(5);
    t.ok(app.run('__renders') > before,
      'the jobs list repaints itself \u2014 correct state that never reaches the screen is indistinguishable from a broken app');

    // Now the unsafe case: a focused field must never be torn down (MAP 2/3).
    app.run('__renders = 0');
    app.run('document.activeElement = { tagName: "INPUT" };');
    app.srv.cloud.push(cloudJob('ZZWHILETYPING', 'ZZTYPE', ['B'], T2));
    await app.fn('syncPull')();
    await tick(5);
    t.eq(app.run('__renders'), 0, 'no repaint while a field is focused');
    t.ok(jobById(app, 'ZZWHILETYPING'), 'though the job itself still arrived');

    // …and it is owed, not dropped: the next safe moment takes it.
    app.run('document.activeElement = null;');
    app.run('_syncFlushRepaint()');
    t.ok(app.run('__renders') > 0, 'the owed repaint happens once the field blurs');
    app.run('render = _origRender;');
  });

  /* ------------------------------------------------------------------ 17u */
  // v81.2, decision 2D. Reading is driven by what the engineer does, with a slow
  // backstop for standing still. The interval is the whole point: each request
  // wakes the cellular modem and holds it awake for seconds afterwards, so a
  // short timer never lets the radio idle. Navigation is free by comparison —
  // it only happens when they are already using the phone.
  await t.group('17u — reading follows what the engineer does, throttled (decision 2D)', async () => {
    const app = signedIn({ server: { rows: [cloudJob('ZZNAV', 'ZZNAVSITE', ['A'])] } });

    // ⚠ SOURCE-GUARDED, deliberately. Three behavioural formulations of this
    // were tried and all three were flaky — waiting for a request to arrive
    // depends on machine load, a zero-delay timer handle can be cleared by its
    // own callback before the next line reads it, and comparing Date.now()
    // against itself tests the clock's resolution. The throttle is a two-line
    // guard whose PRESENCE is the whole contract, and M190 turns this red if it
    // goes. A flaky assertion is worse than an honest source guard: it trains
    // whoever runs the suite to re-run it until it goes green.
    t.ok(app.run('syncActive()'), 'precondition: sync is active on this fixture');
    t.eq(typeof app.run('syncNoteNav'), 'function', 'the navigation trigger exists');

    const navSrc = fs.readFileSync(path.join(APP_DIR, 'sync.js'), 'utf8');
    const nav = navSrc.slice(navSrc.indexOf('function syncNoteNav('), navSrc.indexOf('// \u2026and the backstop'));
    t.includes(nav, 'now - _syncLastNavPull < SYNC_NAV_THROTTLE_MS',
      'and it reads at most once per throttle window \u2014 tapping between jobs is not a reason to wake the radio each time');
    t.includes(nav, '_syncLastNavPull = now', 'stamping the window as it goes');
    t.includes(nav, '{ pull: true }', 'and what it schedules is a read');

    // Only a genuine view CHANGE counts, not any old tap. Source-guarded: the
    // before/after comparison is the whole mechanism.
    const d = fs.readFileSync(path.join(APP_DIR, 'dispatch.js'), 'utf8');
    t.includes(d, 'const viewBefore = state.view;',
      'the view is captured before the action runs');
    t.includes(d, 'if (state.view !== viewBefore && typeof syncNoteNav === \'function\')',
      'and the read only fires when it actually changed \u2014 a quick-pick tap is not navigation');

    // The backstop exists, is slow, and is skipped when the app is hidden.
    const src = fs.readFileSync(path.join(APP_DIR, 'sync.js'), 'utf8');
    const idle = src.slice(src.indexOf('function _syncIdleCheck('), src.indexOf('// opts.pull'));
    t.includes(idle, 'visibilityState', 'the backstop does nothing while the app is in the background');
    t.includes(idle, 'SYNC_IDLE_MS', 'and only when nothing has run for a while');
    const cfg = fs.readFileSync(path.join(APP_DIR, 'config.js'), 'utf8');
    const ms = parseInt((cfg.match(/SYNC_IDLE_MS = (\d+)/) || [])[1], 10);
    t.ok(ms >= 60000,
      `the backstop is at least a minute (${ms}ms) \u2014 a shorter one never lets the radio idle, which is the actual battery cost`);
  });

  /* ------------------------------------------------------------------ 17v */
  // v81.2, decision 3A. Fingerprints written before canonical hashing describe
  // a different calculation, so they can never match again. Dropping them costs
  // one re-send of everything; keeping them would leave every job looking
  // permanently unsent, or permanently in conflict with itself.
  await t.group('17v — fingerprints from before the hashing changed are dropped, not trusted', async () => {
    const app = signedIn();
    const local = sentJob(app, 'ZZUPGRADE');
    const id = String(local.id);

    // Rewrite the stored state the way V81 left it: real fingerprints, no
    // hashV marker at all.
    const st = syncState(app);
    delete st.hashV;
    st.sent[id] = 'pre-canonical-hash';
    st.gone['ZZALREADYDELETED'] = true;
    app.storage.setItem('pat:syncState', JSON.stringify(st));

    await app.fn('syncPull')();
    await tick(5);

    const after = syncState(app);
    t.eq(after.hashV, 2, 'the state is marked as canonical once it has been upgraded');
    t.notEq(after.sent[id], 'pre-canonical-hash', 'the old fingerprint is gone');
    t.eq(after.gone['ZZALREADYDELETED'], true,
      'but a delete already sent stays sent \u2014 re-sending work is cheap, re-deleting is not');

    const pushed = app.srv.rows().filter(r => String(r.id) === id);
    t.eq(pushed.length, 1, 'the job is re-sent exactly once');
    t.eq(syncState(app).sent[id], app.fn('syncHash')(app.fn('_syncCanonical')(jobById(app, id))),
      'and fingerprinted canonically from then on');

    // Second run: nothing to do. The upgrade costs one round, not every round.
    const before = app.srv.rows().length;
    await app.fn('syncPull')();
    await tick(5);
    t.eq(app.srv.rows().length, before, 'and the run after that sends nothing');
  });

  /* ------------------------------------------------------------------ 17w */
  await t.group('17w — one phone, two accounts: state is never read across them', async () => {
    const app = signedIn();
    const local = sentJob(app, 'ZZACCOUNTA');
    const id = String(local.id);
    t.ok(syncState(app).sent[id], 'precondition: account A has fingerprinted its job');

    // The same phone, a different account. Asked of _syncStateFor directly
    // rather than by driving a whole run: the vendored client caches its own
    // session, so swapping the stored one mid-test would be racing the library
    // rather than testing this rule.
    const other = '22222222-2222-2222-2222-222222222222';
    const st = app.run('_syncStateFor(' + JSON.stringify(other) + ')');
    t.eq(st.userId, other, 'the state handed back belongs to the account asking for it');
    t.notOk(st.sent[id],
      'and carries none of the other account\u2019s fingerprints \u2014 believing them would mean this account\u2019s cloud silently never receives those jobs');
    t.eq(Object.keys(st.gone).length, 0, 'nor its deletions');

    // …and the first account's own state is still intact underneath.
    const back = app.run('_syncStateFor(' + JSON.stringify(UID_A) + ')');
    t.ok(back.sent[id], 'while the original account still has its own');
  });

  /* ------------------------------------------------------------------ 17x */
  // v81.3, decision 1A. Peter's report: a change waiting for the job he was in
  // did not apply when he went back to the jobs list — only after he opened a
  // DIFFERENT job. state.activeId survives leaving (the app remembers your last
  // job), and "open" had been taken to mean "current" rather than "on screen".
  await t.group('17x — leaving the job releases the change waiting for it', async () => {
    const app = signedIn();
    const local = sentJob(app, 'ZZRELEASE');
    const id = String(local.id);
    app.srv.cloud.push(cloudJob(id, 'ZZRELEASE', ['A', 'B', 'C'], T2));

    app.fn('openSession')(id);
    app.stopTimer();
    t.eq(app.state().view, 'entry', 'precondition: standing in the job');
    await app.fn('syncPull')();
    await tick(5);
    t.eq(jobById(app, id).items.length, 1, 'while on its entry screen, the change waits');

    // Back to the jobs list. activeId is NOT cleared — that is the app's normal
    // behaviour, and exactly what made this bug.
    app.fn('setView')('sessions');
    app.stopTimer();
    t.eq(String(app.state().activeId), id, 'precondition: the app still remembers it as the current job');

    await app.fn('syncPull')();
    await tick(5);
    t.eq(jobById(app, id).items.length, 3,
      'and on the jobs list it applies \u2014 without having to open a different job first');
    t.eq(app.state().sync.waiting, null, 'with nothing left waiting');

    // Source-guarded, for the reason 17u gives: the throttle bypass is a guard
    // whose presence is the contract, and timing-based checks of it were flaky.
    const src = fs.readFileSync(path.join(APP_DIR, 'sync.js'), 'utf8');
    const nav = src.slice(src.indexOf('function syncNoteNav('), src.indexOf('// \u2026and the backstop'));
    t.includes(nav, "const released = !!w && !(state.view === 'entry' && String(state.activeId) === String(w.id));",
      'leaving the waiting job is recognised as releasing it');
    t.includes(nav, 'if (!released && now - _syncLastNavPull < SYNC_NAV_THROTTLE_MS) return;',
      'and that one screen change is never throttled \u2014 it is the read that matters most');
  });

  /* ------------------------------------------------------------------ 17y */
  // v81.4. Peter, after using V81.3: opening a job to "changes waiting", the
  // instinct was to reach for a button rather than back out and come in again.
  // A tap is the engineer choosing the update, so it does not break 7A.
  await t.group('17y — "Update now" applies the waiting change to the open job, once', async () => {
    const app = signedIn();
    const local = sentJob(app, 'ZZUPDATENOW');
    const id = String(local.id);
    app.srv.cloud.push(cloudJob(id, 'ZZUPDATENOW', ['A', 'B', 'C'], T2));
    app.fn('openSession')(id);
    app.stopTimer();
    await app.fn('syncPull')();
    await tick(5);
    t.eq(jobById(app, id).items.length, 1, 'precondition: the change is waiting');

    const html = app.fn('renderEntry')();
    t.includes(html, 'data-action="sync-apply-waiting"', 'the waiting line offers the button');

    // Through the real dispatch table, as a tap would.
    const table = app.run('ACTIONS');
    t.ok(typeof table['sync-apply-waiting'] === 'function', 'and it is wired into dispatch');
    await app.fn('syncApplyWaiting')();
    await tick(5);

    t.eq(app.state().view, 'entry', 'still standing in the job \u2014 nobody was moved');
    t.eq(jobById(app, id).items.length, 3, 'and the change is applied');
    t.eq(app.state().sync.waiting, null, 'so nothing is waiting any more');
    t.eq(app.run('_syncAllowOpen'), null,
      'and the allowance is gone \u2014 left standing, it would apply every later change under the thumb');

    // One-off: the NEXT change to the same open job waits again.
    app.srv.cloud.find(r => String(r.id) === id).updated_at = T2;
    const again = cloudJob(id, 'ZZUPDATENOW', ['A', 'B', 'C', 'D'], '2026-09-04T10:00:00.000Z');
    const i = app.srv.cloud.findIndex(r => String(r.id) === id);
    app.srv.cloud[i] = again;
    await app.fn('syncPull')();
    await tick(5);
    t.eq(jobById(app, id).items.length, 3, 'a later change to the open job waits again, as it always did');
  });

  /* ------------------------------------------------------------------ 17z */
  await t.group('17z — there is no "Update now" for a delete', async () => {
    const app = signedIn();
    const local = sentJob(app, 'ZZNOBUTTON');
    const id = String(local.id);
    app.fn('openSession')(id);
    app.stopTimer();
    app.srv.cloud.push({ id, doc: {}, deleted: true, last_modified: T2, updated_at: T2 });
    await app.fn('syncPull')();
    await tick(5);

    const html = app.fn('renderEntry')();
    t.includes(html, 'Deleted on your other device', 'precondition: a delete is waiting');
    t.excludes(html, 'sync-apply-waiting',
      'with no button \u2014 applying it would pull the screen out from under the engineer');

    // Even forced, the allowance does not reach deletes.
    app.run('_syncAllowOpen = ' + JSON.stringify(id));
    await app.fn('syncPull')();
    await tick(5);
    app.run('_syncAllowOpen = null');
    t.ok(jobById(app, id), 'and a delete still waits for them to leave, whatever the allowance says');
  });

  /* ------------------------------------------------------------------ 17p */
  await t.group('17p — every trigger reads before it writes (decision 2A)', async () => {
    const app = signedIn({ server: { rows: [cloudJob('ZZREOPEN', 'ZZREOPENSITE', ['A'])] } });

    // Reopening the app is a real listener, so drive the real event.
    const listeners = (app.doc._listeners || {}).visibilitychange || [];
    t.ok(listeners.length > 0, 'the app-reopen listener is registered');
    app.run('document.visibilityState = "visible"');
    for (const fn of listeners) fn({});
    // The reopen trigger is deliberately delayed (SYNC_RESUME_DELAY_MS) so it
    // does not fire into a half-drawn screen, so this genuinely has to wait.
    await tick(1300);
    t.ok(jobById(app, 'ZZREOPEN'), 'reopening the app reads the cloud, not just sends to it');

    // Sign-in is in cloud.js, not this file — source-guarded, because driving a
    // whole sign-in here would prove the sign-in flow, not the trigger.
    // v81.1: the save trigger joined this list (decision 2A); 17m covers it.
    const cloudSrc = fs.readFileSync(path.join(APP_DIR, 'cloud.js'), 'utf8');
    t.includes(cloudSrc, 'syncPushSoon(0, { pull: true })',
      'signing in reads the account \u2014 the moment on a second phone when there is most to fetch');

    const syncSrc = fs.readFileSync(path.join(APP_DIR, 'sync.js'), 'utf8');
    const bootFn = syncSrc.slice(syncSrc.indexOf('function syncBoot('), syncSrc.indexOf('// ---- applying'));
    t.eq((bootFn.match(/pull: true/g) || []).length, 3,
      'and so do all three boot triggers: reopen, back online, and shortly after the first paint');
  });

  /* ------------------------------------------------------------------ 17o */
  await t.group('17o — the held list is local bookkeeping, not the engineer\u2019s data', async () => {
    const app = signedIn();
    const local = sentJob(app, 'ZZNOTBACKED');
    app.srv.cloud.push(cloudJob(String(local.id), 'ZZNOTBACKED', ['C-1', 'C-2'], T2));
    editJob(app, local.id, 'ZZX');
    await app.fn('syncPull')();
    await tick(5);
    t.eq(held(app).length, 1, 'precondition: something is held');

    // The whitelist is the defence, so prove it against a row that already has
    // a document in it — an older build, a hand edit, a future field.
    app.storage.setItem('pat:syncHeld', JSON.stringify([{
      id: 'ZZDOCTORED', at: T1, reason: 'both-changed', name: 'ZZDOCTORED',
      localItems: 1, cloudItems: 2,
      doc: { id: 'ZZDOCTORED', items: [{ assetNo: 'ZZLEAKED' }] },
    }]));
    const back = app.fn('syncHeldList')();
    t.eq(back.length, 1, 'the row still loads');
    t.notOk('doc' in back[0], 'but the document does not come back out with it');
    t.excludes(JSON.stringify(back[0]), 'ZZLEAKED', 'nor any part of it');
    app.storage.removeItem('pat:syncHeld');

    const backup = JSON.stringify(app.fn('buildBackup')());
    t.excludes(backup, 'syncHeld', 'a backup carries no held list');
    t.excludes(backup, 'pulledAt', 'and no pull cursor \u2014 restoring onto another phone must read the cloud from the start');
    t.excludes(backup, 'syncState', 'nor the fingerprints, as since V80');
  });
};
