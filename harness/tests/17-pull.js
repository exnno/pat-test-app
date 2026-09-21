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
        return new Response(JSON.stringify(rows), {
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
  st.sent[String(sess.id)] = app.fn('syncHash')(JSON.stringify(sess));
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
    t.eq(st.sent['ZZREMOTE1'], app.fn('syncHash')(JSON.stringify(got)),
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
    st.sent[String(local.id)] = app.fn('syncHash')(JSON.stringify(sess));
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
    t.eq(syncState(app).sent[id], app.fn('syncHash')(JSON.stringify(now)),
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
    const fn = src.slice(src.indexOf('function syncNoteSave('), src.indexOf('function syncPushSoon('));
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
