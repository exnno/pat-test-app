/* Standing test — photos to the cloud, one way (V88)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Photos go up after their job (1A, one way; V89 brings
   them down on request only, 10A). File first, then the row (2A), so a row always
   means the file is there. Deletes the engineer makes — a photo, an item, a fail
   made a pass, a job — take the cloud copy too (4A); clearing old jobs and
   "Delete all photos" never do (V80 C, 5A). A job can't be cleared until its
   photos are up (6A). The Sync page counts them (9A).

   ⚠ DRIVES THE REAL VENDORED LIBRARY against a fake server (as 16/23 do), so the
   assertions are on the HTTP the library actually sends: storage upload URLs,
   the photos upsert, the PATCH that marks rows deleted, the storage DELETE.

   ⚠ The photo mirror (state.photoMeta) loads on a timer tick after boot, like
   the real IndexedDB. Every app here ticks before it expects photos to move.

   ⚠ WHAT THIS FILE CANNOT PROVE. That another account cannot read these files.
   That is supabase/isolation-test.sql checks 4c and 7a–7d, by hand. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { tick, withSession, withItem, confirmSheet } = require('../fixture');

const LIB = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');
const UID = '11111111-1111-1111-1111-111111111111';

function storedSession() {
  return JSON.stringify({
    access_token: 'ZZACCESS', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'ZZREFRESH',
    user: { id: UID, email: 'peter@example.com', aud: 'authenticated', role: 'authenticated' },
  });
}

const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });

/* One fake Supabase: sessions/records keep what they're sent; photos rows are
   upserted and PATCHed; storage objects are a Map. `o.fail` switches a surface
   to answer 500: 'upload', 'row', 'patch', 'remove', 'sessions'. */
function fakeServer(o = {}) {
  const calls = [];
  const tables = { sessions: (o.sessions || []).slice(), records: [], photos: [] };
  const files = new Map();
  const fail = new Set(o.fail || []);
  let stampN = 0;
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    let body = null;
    if (typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    else body = init.body || null;
    calls.push({ url: u, method, body });
    if (u.includes('/storage/v1/object/photos')) {
      if (method === 'DELETE') {
        if (fail.has('remove')) return json({ message: 'nope' }, 500);
        const list = (body && body.prefixes) || [];
        for (const p of list) files.delete(p);
        return json(list.map(p => ({ name: p })));
      }
      if (fail.has('upload')) return json({ message: 'nope' }, 500);
      const p = decodeURIComponent(u.split('/storage/v1/object/photos/')[1].split('?')[0]);
      files.set(p, true);
      return json({ Key: 'photos/' + p, Id: 'x' });
    }
    if (u.includes('/rest/v1/photos')) {
      if (method === 'PATCH') {
        if (fail.has('patch')) return json({ message: 'nope' }, 500);
        const q = new URLSearchParams(u.split('?')[1] || '');
        const ids = (q.get('id') || '').replace(/^in\.\(/, '').replace(/\)$/, '').split(',').map(s => s.replace(/^"|"$/g, ''));
        for (const r of tables.photos) if (ids.includes(r.id)) Object.assign(r, body);
        return new Response(null, { status: 204 });
      }
      if (method === 'POST') {
        if (fail.has('row')) return json({ message: 'nope' }, 500);
        for (const row of (Array.isArray(body) ? body : [body])) {
          const i = tables.photos.findIndex(r => r.id === row.id);
          if (i === -1) tables.photos.push(Object.assign({}, row)); else tables.photos[i] = Object.assign({}, row);
        }
        return new Response(null, { status: 201 });
      }
      return json([]);
    }
    for (const name of ['sessions', 'records']) {
      if (!u.includes('/rest/v1/' + name)) continue;
      if (method === 'GET') return json(tables[name]);
      if (name === 'sessions' && fail.has('sessions')) return json({ message: 'nope' }, 500);
      stampN++;
      const stamp = '2026-09-29T10:00:' + String(stampN).padStart(2, '0') + '.000Z';
      for (const row of (Array.isArray(body) ? body : [])) {
        const i = tables[name].findIndex(r => String(r.id) === String(row.id));
        const stored = Object.assign({}, row, { updated_at: stamp });
        if (i === -1) tables[name].push(stored); else tables[name][i] = stored;
      }
      return new Response(null, { status: 201 });
    }
    if (u.includes('/rest/v1/profiles')) return json([{ plan: 'trial', trial_ends_at: null }]);
    return json({ message: 'unexpected ' + u }, 404);
  };
  const is = (c, part, m) => c.url.includes(part) && (!m || c.method === m);
  return {
    calls, fetchImpl, tables, files, fail,
    uploads: () => calls.filter(c => is(c, '/storage/v1/object/photos/', 'POST')),
    removes: () => calls.filter(c => is(c, '/storage/v1/object/photos', 'DELETE')),
    rowPosts: () => calls.filter(c => is(c, '/rest/v1/photos', 'POST')),
    patches: () => calls.filter(c => is(c, '/rest/v1/photos', 'PATCH')),
    photoCalls: () => calls.filter(c => c.url.includes('/storage/') || c.url.includes('/rest/v1/photos')),
  };
}

function boot(opts = {}) {
  const app = bootApp(opts);
  app.sandbox.localStorage.setItem('pat:cloudUnlocked', '1');
  app.fn('load')();
  app.state = () => app.refresh('state').state;
  app.stopTimer = () => app.run('if (_syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }');
  return app;
}

async function signedIn(opts = {}) {
  const ls = Object.assign({ 'patgo:cloudAuth:test': storedSession() }, opts.localStorage || {});
  const app = boot({ localStorage: ls, navigator: { onLine: false } });
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
  await tick(5);     // the photo mirror loads (see header)
  return app;
}

/* A fail item with `n` photos, through the real photoAdd(). */
async function failWithPhotos(app, n, asset) {
  const item = withItem(app, { assetNo: asset || ('ZZPH-' + Math.random().toString(36).slice(2, 7)), result: 'fail' });
  const sess = app.fn('activeSession')();
  const ids = [];
  for (let i = 0; i < n; i++) {
    const id = await app.run(`photoAdd(${JSON.stringify(sess.id)}, ${JSON.stringify(item.id)},
      { blob: new Blob(['ZZJPEG${i}'.repeat(50)], { type: 'image/jpeg' }), w: 1280, h: 960, bytes: 400 })`);
    ids.push(id);
    await tick(20);
  }
  app.stopTimer();
  return { item, sess, ids };
}

const syncState = (app) => JSON.parse(app.storage.getItem('pat:syncState') || 'null');
const sentPh = (app) => Object.keys((syncState(app) || { ph: { sent: {} } }).ph.sent);
const idx = (app, pred) => app.srv.calls.findIndex(pred);
async function run(app) { const r = await app.fn('syncPush')({ pull: true }); app.stopTimer(); await tick(20); return r; }

module.exports = async function () {
  /* ------------------------------------------------------------------ 25a */
  await t.group('25a — signed out: nothing leaves; the mirror follows adds and deletes; deletes are still ledgered', async () => {
    const calls = [];
    const app = boot({ fetch: async (u) => { calls.push(String(u)); throw new Error('offline'); } });
    await tick(5);
    t.ok(app.state().photoMetaReady, 'the mirror is ready once the store has been read');
    withSession(app, { site: 'ZZPHOUT' });
    const { item, ids } = await failWithPhotos(app, 2);
    const meta = app.state().photoMeta;
    t.ok(meta[ids[0]] && meta[ids[1]], 'each photo is in the mirror');
    t.eq(meta[ids[0]].i, String(item.id), '…with its item');
    t.eq(meta[ids[0]].s, String(app.fn('activeSession')().id), '…and its job');
    await app.run(`photoDelete(${JSON.stringify(ids[0])})`);
    await tick(20);
    t.notOk(app.state().photoMeta[ids[0]], 'a deleted photo leaves the mirror');
    const ledger = JSON.parse(app.storage.getItem('pat:tombstones') || app.storage.getItem(app.val('TOMBSTONES_KEY')) || '[]');
    t.ok(ledger.some(e => e.kind === 'photo' && e.id === ids[0]), 'the delete is in the SAVED ledger, kind photo — so it reaches the cloud if they sign in later');
    t.ok(app.run('TOMBSTONE_KINDS').includes('photo'), 'photo is a ledger kind');
    t.eq(calls.length, 0, 'no network request at all');
  });

  /* ------------------------------------------------------------------ 25b */
  await t.group('25b — upload: after its job, the FILE first, then the row (2A)', async () => {
    const app = await signedIn();
    withSession(app, { site: 'ZZPHUP' });
    const { item, sess, ids } = await failWithPhotos(app, 2);
    await run(app);
    const sessPost = idx(app, c => c.url.includes('/rest/v1/sessions') && c.method === 'POST');
    const firstUp = idx(app, c => c.url.includes('/storage/v1/object/photos/') && c.method === 'POST');
    const firstRow = idx(app, c => c.url.includes('/rest/v1/photos') && c.method === 'POST');
    t.ok(sessPost !== -1 && firstUp > sessPost, 'the job is sent before any photo');
    t.ok(firstRow > firstUp, 'the file goes before its row');
    t.eq(app.srv.uploads().length, 2, 'both files uploaded');
    t.includes(app.srv.uploads()[0].url, '/storage/v1/object/photos/' + UID + '/', 'into this account\u2019s own folder');
    t.ok(app.srv.files.has(UID + '/' + ids[0] + '.jpg'), 'named {user_id}/{photo_id}.jpg (8A)');
    const row = app.srv.tables.photos.find(r => r.id === ids[0]);
    t.ok(!!row, 'the row is in the photos table');
    t.eq(row.session_id, String(sess.id), 'row: its job');
    t.eq(row.item_id, String(item.id), 'row: its item');
    t.eq(row.storage_path, UID + '/' + ids[0] + '.jpg', 'row: its path');
    t.eq(row.deleted, false, 'row: not deleted');
    t.ok(typeof row.taken_at === 'string' && !isNaN(Date.parse(row.taken_at)), 'row: when it was taken');
    t.eq(row.w, 1280, 'row: its size');
    t.eq(sentPh(app).sort().join(), ids.slice().sort().join(), 'both remembered as in the cloud');
    t.includes(app.state().sync.message, 'Photos: 2 photos sent', 'the run says what it sent');
    await run(app);
    t.eq(app.srv.uploads().length, 2, 'a second run uploads nothing again');
  });

  /* ------------------------------------------------------------------ 25c */
  await t.group('25c — only photos of a job in the cloud, whose item is still there', async () => {
    const app = await signedIn({ server: { fail: ['sessions'] } });
    withSession(app, { site: 'ZZPHNOJOB' });
    await failWithPhotos(app, 1);
    await run(app);
    t.eq(app.srv.uploads().length, 0, 'the job failed to send: its photo waits');
    app.srv.fail.delete('sessions');
    await run(app);
    t.eq(app.srv.uploads().length, 1, 'job sent: now the photo goes');

    // A job held for a decision is not sent; nor are its photos.
    const appH = await signedIn();
    const jh = withSession(appH, { site: 'ZZPHHELD' });
    await failWithPhotos(appH, 1);
    appH.storage.setItem('pat:syncHeld', JSON.stringify([{ id: String(jh.id), kind: 'session', reason: 'both-changed', at: '2026-09-29T09:00:00.000Z' }]));
    await run(appH);
    t.notOk(appH.srv.tables.sessions.some(r => String(r.id) === String(jh.id)), 'the held job was not sent');
    t.eq(appH.srv.uploads().length, 0, 'so its photo waits too');

    // An orphan: the photo's item is no longer in the job.
    const app2 = await signedIn();
    withSession(app2, { site: 'ZZPHORPHAN' });
    const { item } = await failWithPhotos(app2, 1);
    app2.run(`(() => { const s = activeSession(); s.items = s.items.filter(i => i.id !== ${JSON.stringify(item.id)}); })()`);
    await run(app2);
    t.eq(app2.srv.uploads().length, 0, 'a photo whose item is gone is never uploaded');

    // The example job never leaves the phone, and nor do its photos.
    const app3 = await signedIn();
    withSession(app3, { site: 'ZZPHDEMO' });
    await failWithPhotos(app3, 1);
    app3.run(`activeSession()[typeof DEMO_SESSION_FLAG !== 'undefined' ? DEMO_SESSION_FLAG : 'isExample'] = true`);
    await run(app3);
    t.eq(app3.srv.uploads().length, 0, 'the example job\u2019s photos never go');
  });

  /* ------------------------------------------------------------------ 25d */
  await t.group('25d — a refused file or row: not remembered, jobs still sent, tried again', async () => {
    const app = await signedIn({ server: { fail: ['upload'] } });
    withSession(app, { site: 'ZZPHFAIL' });
    const { ids } = await failWithPhotos(app, 1);
    const ok = await run(app);
    t.ok(ok, 'the run still succeeds — photos are fail-soft');
    t.ok(app.srv.tables.sessions.length >= 1, 'the job was still sent');
    t.eq(app.srv.rowPosts().length, 0, 'no row without its file');
    t.eq(sentPh(app).length, 0, 'not remembered as sent');
    t.includes(app.state().sync.message, 'Photos couldn\u2019t be sent this time', 'the page says so');

    // "Re-send all jobs" is jobs only and never reads first: no photos on it.
    app.srv.fail.delete('upload');
    const nUp = app.srv.uploads().length;
    await app.fn('syncPush')({ force: true }); app.stopTimer(); await tick(20);
    t.eq(app.srv.uploads().length, nUp, 'Re-send all jobs sends no photos');

    app.srv.fail.add('row');
    await run(app);
    t.eq(sentPh(app).length, 0, 'file up but row refused: still not remembered');
    app.srv.fail.delete('row');
    await run(app);
    t.eq(sentPh(app).join(), ids[0], 'next time it goes through');
    t.ok(!!app.srv.tables.photos.find(r => r.id === ids[0]), 'and the row is there');
  });

  /* ------------------------------------------------------------------ 25e */
  await t.group('25e — a few per run, oldest first; the rest next time', async () => {
    const app = await signedIn();
    withSession(app, { site: 'ZZPHMANY' });
    const all = [];
    for (let i = 0; i < 9; i++) all.push(...(await failWithPhotos(app, 3, 'ZZMANY-' + i)).ids);
    const per = app.run('SYNC_PHOTOS_PER_RUN');
    t.eq(all.length, 27, '27 photos on the phone');
    await run(app);
    t.eq(app.srv.uploads().length, per, 'only ' + per + ' in one run');
    t.includes(app.state().sync.message, (27 - per) + ' more to send next time', 'and it says how many wait');
    const first = app.srv.uploads().map(c => c.url.split('/').pop().replace('.jpg', ''));
    t.eq(first[0], all[0], 'oldest first');
    t.notOk(first.includes(all[26]), 'the newest waits');
    await run(app);
    t.eq(app.srv.uploads().length, 27, 'the next run takes the rest');
  });

  /* ------------------------------------------------------------------ 25f */
  await t.group('25f — deleting a photo deletes the cloud copy: row marked, file removed', async () => {
    const app = await signedIn();
    withSession(app, { site: 'ZZPHDEL' });
    const { ids } = await failWithPhotos(app, 2);
    await run(app);
    await app.run(`photoDelete(${JSON.stringify(ids[0])})`);
    await tick(20); app.stopTimer();
    app.srv.fail.add('remove');
    await run(app);
    t.ok(sentPh(app).includes(ids[0]), 'file removal refused: still remembered, so it is tried again');
    app.srv.fail.delete('remove');
    await run(app);
    const patch = app.srv.patches().pop();
    t.ok(!!patch, 'the row is updated');
    t.eq(patch.body.deleted, true, '…to deleted');
    t.includes(decodeURIComponent(patch.url), ids[0], '…that row');
    t.notOk(decodeURIComponent(patch.url).includes(ids[1]), '…and not the other photo');
    t.ok(idx(app, c => c.url.includes('/rest/v1/photos') && c.method === 'PATCH') <
         app.srv.calls.lastIndexOf(app.srv.removes().pop()), 'the row is marked before the file goes');
    t.notOk(app.srv.files.has(UID + '/' + ids[0] + '.jpg'), 'the file is gone');
    t.ok(app.srv.files.has(UID + '/' + ids[1] + '.jpg'), 'the other file stays');
    t.notOk(sentPh(app).includes(ids[0]), 'forgotten only once both are done');
    const n = app.srv.removes().length;
    await run(app);
    t.eq(app.srv.removes().length, n, 'not sent twice');
  });

  /* ------------------------------------------------------------------ 25g */
  await t.group('25g — deleting an item takes its cloud photos, even ones cleared from this phone', async () => {
    const app = await signedIn();
    withSession(app, { site: 'ZZPHITEM' });
    const a = await failWithPhotos(app, 2, 'ZZITEM-A');
    const b = await failWithPhotos(app, 1, 'ZZITEM-B');
    await run(app);
    // Free space (5A) — then delete item A.
    // Both of A's photos cleared from the phone (5A): the item has NONE left
    // here, and its cloud copies must still go with it.
    await app.run(`photosClearUploaded((id) => ${JSON.stringify(a.ids)}.includes(id))`);
    await tick(20);
    t.notOk(app.state().photoMeta[a.ids[0]] || app.state().photoMeta[a.ids[1]], 'A\u2019s photos cleared from the phone');
    await app.run(`photosDeleteForItem(${JSON.stringify(a.item.id)})`);
    await tick(20); app.stopTimer();
    await run(app);
    t.notOk(app.srv.files.has(UID + '/' + a.ids[0] + '.jpg'), 'deleting the item deletes its cloud photos anyway');
    t.notOk(app.srv.files.has(UID + '/' + a.ids[1] + '.jpg'), '…both of them');
    t.ok(app.srv.files.has(UID + '/' + b.ids[0] + '.jpg'), 'item B\u2019s photo is untouched');
  });

  /* ------------------------------------------------------------------ 25h */
  await t.group('25h — deleting a job takes its cloud photos; clearing it does not', async () => {
    const app = await signedIn();
    const j1 = withSession(app, { site: 'ZZPHJOB1' });
    const p1 = await failWithPhotos(app, 1);
    const j2 = withSession(app, { site: 'ZZPHJOB2' });
    const p2 = await failWithPhotos(app, 1);
    // Job 2 is old and exported (so it can be cleared below) BEFORE it is sent,
    // so the cloud has its latest version.
    app.run(`(() => { const s = state.sessions.find(x => x.id === ${JSON.stringify(j2.id)});
      s.date = '2020-01-01'; s.exportedAt = '2020-01-02T00:00:00Z'; s.exportDirty = false; state.activeId = null; })()`);
    await run(app);
    t.eq(app.srv.files.size, 2, 'both jobs\u2019 photos are up');

    app.fn('deleteSession')(j1.id);
    await tick(20); app.stopTimer();
    await run(app);
    t.ok(app.srv.tables.sessions.find(r => r.id === j1.id && r.deleted), 'the job delete went');
    t.notOk(app.srv.files.has(UID + '/' + p1.ids[0] + '.jpg'), 'its photo went with it');
    t.eq(app.srv.tables.photos.find(r => r.id === p1.ids[0]).deleted, true, 'and its row is marked');

    // Clear job 2 as old: the cloud keeps it and its photo (V80 C).
    app.fn('pruneOldSessions')();
    t.ok(confirmSheet(app), 'clear confirmed');
    await tick(20); app.stopTimer();
    t.notOk(app.state().sessions.some(s => s.id === j2.id), 'job 2 cleared from the phone');
    const before = app.srv.photoCalls().length;
    await run(app);
    t.eq(app.srv.photoCalls().length, before, 'clearing sends no photo delete');
    t.ok(app.srv.files.has(UID + '/' + p2.ids[0] + '.jpg'), 'the cloud keeps its photo');
  });

  /* ------------------------------------------------------------------ 25i */
  await t.group('25i — the other phone deleted the job: this phone takes the photos it uploaded', async () => {
    const app = await signedIn();
    const j = withSession(app, { site: 'ZZPHREMOTE' });
    const p = await failWithPhotos(app, 1);
    await run(app);
    app.run('state.activeId = null; state.view = "sessions";');
    const row = app.srv.tables.sessions.find(r => r.id === j.id);
    Object.assign(row, { deleted: true, doc: {}, updated_at: '2026-09-29T11:00:00.000Z' });
    await run(app);
    t.notOk(app.state().sessions.some(s => s.id === j.id), 'the job is removed here');
    t.notOk(app.srv.files.has(UID + '/' + p.ids[0] + '.jpg'), 'and the photo this phone uploaded is removed from the cloud');
  });

  /* ------------------------------------------------------------------ 25j */
  await t.group('25j — a photo back on the phone (re-imported) is live: its old delete is not sent', async () => {
    const app = await signedIn();
    withSession(app, { site: 'ZZPHLIVE' });
    const { ids } = await failWithPhotos(app, 1);
    await run(app);
    app.run(`recordTombstone('photo', ${JSON.stringify(ids[0])})`);
    await run(app);
    t.eq(app.srv.removes().length, 0, 'a ledger entry for a photo still on the phone deletes nothing');
    t.ok(app.srv.files.has(UID + '/' + ids[0] + '.jpg'), 'the cloud copy stays');
  });

  /* ------------------------------------------------------------------ 25k */
  await t.group('25k — clearing old jobs waits for their photos (6A)', async () => {
    const app = await signedIn({ server: { fail: ['upload'] } });
    const j = withSession(app, { site: 'ZZPHPRUNE' });
    await failWithPhotos(app, 1);
    const age = `(() => { const s = state.sessions.find(x => x.id === ${JSON.stringify(j.id)});
      if (s) { s.date = '2020-01-01'; s.exportedAt = '2020-01-02T00:00:00Z'; s.exportDirty = false; } state.activeId = null; })()`;
    app.run(age);
    await run(app);   // the job goes (its latest version); the photo is refused
    t.eq(app.fn('syncStatusSummary')().waiting, 0, 'the job itself is up to date in the cloud');
    let g = app.fn('syncPruneFilter')([app.state().sessions.find(s => s.id === j.id)]);
    t.eq(g.kept.length, 1, 'job in the cloud but its photo isn\u2019t: kept');
    const toasts = [];
    app.sandbox.showToast = (m) => toasts.push(String(m));
    app.fn('pruneOldSessions')();
    t.includes(toasts.join('|'), 'or its photos', 'and the toast says photos may be why');

    app.srv.fail.delete('upload');
    await run(app);
    g = app.fn('syncPruneFilter')([app.state().sessions.find(s => s.id === j.id)]);
    t.eq(g.clear.length, 1, 'photo up: now clearable');

    app.run('state.photoMetaReady = false');
    g = app.fn('syncPruneFilter')([app.state().sessions.find(s => s.id === j.id)]);
    t.eq(g.clear.length, 0, 'photo mirror not loaded: nothing is cleared');
  });

  /* ------------------------------------------------------------------ 25l */
  await t.group('25l — Delete all photos, signed in: phone only, uploaded ones only (5A)', async () => {
    const app = await signedIn({ server: { fail: ['upload'] } });
    withSession(app, { site: 'ZZPHWIPE' });
    const a = await failWithPhotos(app, 1, 'ZZWIPE-A');
    await run(app);
    const toasts = [];
    app.sandbox.showToast = (m) => toasts.push(String(m));
    app.run(`ACTIONS['photo-wipe']()`);
    t.includes(toasts.join('|'), 'nothing was cleared', 'none uploaded: says so, clears nothing');
    t.ok(app.state().photoMeta[a.ids[0]], 'the photo is still here');

    app.srv.fail.delete('upload');
    await run(app);
    const b = await failWithPhotos(app, 1, 'ZZWIPE-B');   // not uploaded
    const asked = [];
    const realConfirm = app.sandbox.openConfirmSheet;
    app.sandbox.openConfirmSheet = (o) => { asked.push(String(o && o.title) + '|' + String(o && o.message)); return realConfirm(o); };
    app.run(`ACTIONS['photo-wipe']()`);
    t.includes(asked.join(), 'Clear photos from this phone?', 'the signed-in sheet');
    t.includes(asked.join(), '1 photo hasn\u2019t reached the cloud yet and is kept', 'names what stays');
    const before = app.srv.photoCalls().length;
    t.ok(confirmSheet(app), 'confirmed');
    await tick(20); app.stopTimer();
    t.notOk(app.state().photoMeta[a.ids[0]], 'the uploaded photo is cleared from the phone');
    t.ok(app.state().photoMeta[b.ids[0]], 'the one not yet uploaded is kept');
    t.ok(app.srv.files.has(UID + '/' + a.ids[0] + '.jpg'), 'the cloud keeps it');
    const ledger = app.state().tombstones || [];
    t.notOk(ledger.some(e => e.kind === 'photo' && e.id === a.ids[0]), 'no deletion recorded');
    await run(app);
    t.eq(app.srv.removes().length, 0, 'and no cloud delete follows');
    void before;

    // Signed out: the old wording, and everything goes.
    const out = boot();
    await tick(5);
    withSession(out, { site: 'ZZPHWIPEOUT' });
    await failWithPhotos(out, 2);
    const askedOut = [];
    const realOut = out.sandbox.openConfirmSheet;
    out.sandbox.openConfirmSheet = (o) => { askedOut.push(String(o && o.title)); return realOut(o); };
    out.run(`ACTIONS['photo-wipe']()`);
    t.includes(askedOut.join(), 'Delete all photos?', 'signed out: unchanged');
    confirmSheet(out);
    await tick(20);
    t.eq(Object.keys(out.state().photoMeta).length, 0, 'signed out: all photos deleted, as before');
  });

  /* ------------------------------------------------------------------ 25m */
  await t.group('25m — Sync page counts photos; the delete confirm names the cloud', async () => {
    const app = await signedIn({ server: { fail: ['upload'] } });
    withSession(app, { site: 'ZZPHPAGE' });
    const { ids } = await failWithPhotos(app, 2);
    await run(app);
    let sum = app.fn('syncStatusSummary')();
    t.eq(sum.phTotal, 2, 'two photos counted');
    t.eq(sum.phUp, 0, 'none in the cloud');
    app.fn('setView')('cloudSync');
    t.includes(app.doc.getElementById('app').innerHTML, 'Photos: <strong>0</strong> of 2 in the cloud', 'the page line');
    t.includes(app.doc.getElementById('app').innerHTML, '<strong>2</strong> waiting to send', '…with what waits');
    app.srv.fail.delete('upload');
    await run(app);
    sum = app.fn('syncStatusSummary')();
    t.eq(sum.phUp, 2, 'both up');
    app.run('state.photoMetaReady = false');
    t.eq(app.fn('syncStatusSummary')().phReady, false, 'mirror not loaded: no number at all');
    app.run('state.photoMetaReady = true');

    const asked = [];
    const realConfirm = app.sandbox.openConfirmSheet;
    app.sandbox.openConfirmSheet = (o) => { asked.push(String(o && o.message)); return realConfirm(o); };
    app.run(`state.photoStripItemId = ${JSON.stringify(app.state().photoMeta[ids[0]].i)}`);
    app.fn('deletePhotoFromStrip')(ids[0]);
    t.includes(asked.join(), 'from your cloud copy', 'signed in: the strip delete says the cloud copy goes too');
  });

  /* ------------------------------------------------------------------ 25n */
  t.group('25n — SQL: the taken-time column, and isolation checks for photo rows and a real file', () => {
    const schema = fs.readFileSync(path.join(APP_DIR, 'supabase', 'schema.sql'), 'utf8');
    t.ok(/alter table public\.photos add column if not exists taken_at timestamptz/.test(schema), 'schema adds taken_at, safe to re-run');
    const iso = fs.readFileSync(path.join(APP_DIR, 'supabase', 'isolation-test.sql'), 'utf8');
    for (const k of ['4c|', '4d|', '7a|', '7b|', '7c|', '7d|']) t.includes(iso, k, 'isolation check ' + k.slice(0, -1));
  });
};
