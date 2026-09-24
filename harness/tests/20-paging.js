/* Standing test — sync, paging (V83.1)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Postgres stamps updated_at with the time the
   TRANSACTION started, so every row in one upload batch shares a timestamp.
   V81–V83 asked each next page for rows AFTER the last one read, so a page that
   ended part-way through a batch stepped over the rest of it — permanently, the
   cursor having moved past. Both pagers now start each page AT the last
   timestamp. That made re-reading rows this phone already knows routine, so a
   cloud row equal to what this phone last sent is now no work even if the phone
   has edited since (it used to be held as changed on both sides). And every
   phone reads once from the start (SYNC_PAGER_V).

   ⚠ No test before this file ever pulled more than one page. The rows below are
   stamped the way Postgres stamps them (one stamp per batch) — that is the whole
   point; a distinct stamp per row passes on the broken pager.

   Helpers below are copied from 18-records.js (both tables). */

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { tick, withSession, withItem, CANARY } = require('../fixture');

const LIB = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');
const UID_A = '11111111-1111-1111-1111-111111111111';
const T1 = '2026-09-01T10:00:00.000Z';
const T2 = '2026-09-02T10:00:00.000Z';
const T3 = '2026-09-03T10:00:00.000Z';

function storedSession(id = UID_A) {
  return JSON.stringify({
    access_token: 'ZZACCESS', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'ZZREFRESH',
    user: { id, email: 'peter@example.com', aud: 'authenticated', role: 'authenticated' },
  });
}

function reorderKeys(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(reorderKeys);
  const out = {};
  for (const k of Object.keys(v).reverse()) out[k] = reorderKeys(v[k]);
  return out;
}

function json(rows, status = 200) {
  return new Response(JSON.stringify(rows), { status, headers: { 'content-type': 'application/json' } });
}

/* Both tables. Applies updated_at=gt., id=eq. and kind=in.(…), orders, limits. */
function fakeServer(o = {}) {
  const calls = [];
  const tables = { sessions: (o.sessions || []).slice(), records: (o.records || []).slice() };

  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    let body = null;
    try { body = init.body ? JSON.parse(init.body) : null; } catch { body = init.body; }
    calls.push({ url: u, method, body });

    for (const name of ['sessions', 'records']) {
      if (!u.includes('/rest/v1/' + name)) continue;
      if (name === 'records' && o.recordsFail) return json({ message: 'ZZ records broken' }, 500);
      const cloud = tables[name];
      if (method === 'GET') {
        const q = new URLSearchParams(u.split('?')[1] || '');
        let rows = cloud.slice();
        const gt = q.get('updated_at');
        if (gt && gt.startsWith('gt.')) rows = rows.filter(r => r.updated_at > gt.slice(3));
        // v83.1: the pagers ask "at or after" (gte) — honoured, or every read returns everything.
        else if (gt && gt.startsWith('gte.')) rows = rows.filter(r => r.updated_at >= gt.slice(4));
        const eq = q.get('id');
        if (eq && eq.startsWith('eq.')) rows = rows.filter(r => String(r.id) === eq.slice(3));
        const kin = q.get('kind');
        if (kin && kin.startsWith('in.(')) {
          const set = kin.slice(4, -1).split(',').map(s => s.replace(/^"|"$/g, ''));
          rows = rows.filter(r => set.includes(r.kind));
        }
        rows.sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)));
        const lim = parseInt(q.get('limit') || '0', 10);
        if (lim > 0) rows = rows.slice(0, lim);
        return json(rows.map(reorderKeys));
      }
      for (const row of (Array.isArray(body) ? body : [])) {
        const i = cloud.findIndex(r => String(r.id) === String(row.id));
        const stored = Object.assign({}, row, { updated_at: o.pushStamp || T3 });
        if (i === -1) cloud.push(stored); else cloud[i] = stored;
      }
      return new Response(null, { status: 201 });
    }
    if (u.includes('/rest/v1/profiles')) return json([{ plan: 'trial', trial_ends_at: null }]);
    return json({ message: 'unexpected ' + u }, 404);
  };

  const on = (table, method) => calls.filter(c => c.url.includes('/rest/v1/' + table) && c.method === method);
  return {
    calls, fetchImpl, tables,
    gets: (table) => on(table, 'GET'),
    rows: (table) => on(table, 'POST').flatMap(c => Array.isArray(c.body) ? c.body : []),
  };
}

function signedIn(opts = {}) {
  const ls = Object.assign({ 'patgo:cloudAuth:test': storedSession() }, opts.localStorage || {});
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

const recRow = (kind, id, doc, stamp = T2, deleted = false) =>
  ({ id, kind, doc: deleted ? {} : doc, deleted, last_modified: stamp, updated_at: stamp });

function syncState(app) { return JSON.parse(app.storage.getItem('pat:syncState') || 'null'); }
function held(app) { return JSON.parse(app.storage.getItem('pat:syncHeld') || '[]'); }
const client = (app, id) => (app.state().clients || []).find(c => String(c.id) === id) || null;
const site = (app, id) => (app.state().sites || []).find(s => String(s.id) === id) || null;

/* Put records on the phone, saved, and (optionally) recorded as already sent —
   the "clean local copy" every may-apply case starts from. */
function local(app, { clients = [], sites = [], sent = [] } = {}) {
  app.run(`state.clients = state.clients.concat(${JSON.stringify(clients)});
           state.sites = state.sites.concat(${JSON.stringify(sites)}); save();`);
  app.stopTimer();
  const st = syncState(app) || {};
  st.userId = UID_A; st.hashV = 2;
  st.sent = st.sent || {}; st.gone = st.gone || {}; st.resend = st.resend || {};
  st.rec = st.rec || { sent: {}, gone: {}, resend: {}, pulledAt: null, kinds: '' };
  for (const id of sent) {
    const c = client(app, id), s = site(app, id);
    const kind = c ? 'client' : 'site';
    st.rec.sent[id] = app.fn('_syncRecordHash')(kind, c || s);
  }
  app.storage.setItem('pat:syncState', JSON.stringify(st));
}

function rename(app, kind, id, name) {
  app.run(`(${kind === 'client' ? 'state.clients' : 'state.sites'}).find(r => r.id === ${JSON.stringify(id)}).name = ${JSON.stringify(name)}; save();`);
  app.stopTimer();
}


/* ---- v83.1 fixtures ---- */

// One stamp per upload batch, as Postgres gives them.
const stamp = (n) => `2026-09-10T10:${String(n).padStart(2, '0')}:00.000Z`;

// Sizes [10, 25 x 9]: a short first batch, so page 1 (200 rows) ends 15 rows
// into batch 8 — the shape that lost rows. BOUNDARY is batch 8's first row.
const SIZES = [10, 25, 25, 25, 25, 25, 25, 25, 25, 25];
const TOTAL = 235;
const BOUNDARY = 185;

function batched(make) {
  const rows = [];
  SIZES.forEach((size, b) => { for (let i = 0; i < size; i++) rows.push(make(`${b}_${i}`, stamp(b))); });
  return rows;
}

function jobRow(id, items, at) {
  return {
    id,
    doc: { id, site: 'ZZ PAGED', name: '', engineer: CANARY.engineer, prefix: '', date: '2026-09-10',
      startNumber: 1, locked: false,
      items: items.map((a, i) => ({ assetNo: a, location: 'ZZPAGED', itemType: 'Kettle', notes: '', result: 'pass', id: id + '-i' + i })) },
    deleted: false, last_modified: at, updated_at: at,
  };
}

const zzJobs = (app) => (app.state().sessions || []).filter(s => String(s.id).startsWith('ZZJ'));
const zzClients = (app) => (app.state().clients || []).filter(c => String(c.id).startsWith('client_ZZP'));
const jobById = (app, id) => (app.state().sessions || []).find(s => String(s.id) === String(id));

// A job on the phone, recorded as sent (clean), then stepped out of.
function sentJob(app, site) {
  withSession(app, { site });
  withItem(app, { assetNo: CANARY.asset, result: 'pass' });
  app.stopTimer();
  const sess = app.fn('activeSession')();
  app.run('state.activeId = null');
  const st = syncState(app) || { userId: UID_A, sent: {}, gone: {}, resend: {}, pulledAt: null };
  st.userId = UID_A; st.hashV = 2;
  st.sent = st.sent || {};
  st.sent[String(sess.id)] = app.fn('syncHash')(app.fn('_syncCanonical')(sess));
  app.storage.setItem('pat:syncState', JSON.stringify(st));
  return sess;
}

function editJob(app, id, assetNo) {
  app.fn('openSession')(id);
  withItem(app, { assetNo, result: 'pass' });
  app.run('state.activeId = null');
  app.stopTimer();
}

async function run(app) { await app.fn('syncPull')(); await tick(10); }

module.exports = async function () {
  /* ------------------------------------------------------------------ 20a */
  await t.group('20a — jobs: a batch split by a page edge is read in full', async () => {
    const app = signedIn({ server: { sessions: batched((k, s) => jobRow('ZZJ' + k, ['A'], s)) } });
    await run(app);
    t.eq(zzJobs(app).length, TOTAL, 'every job in the cloud reaches the phone, including the rest of the split batch');
    t.eq(held(app).length, 0, 'nothing is held');
    t.eq(syncState(app).pulledAt, stamp(SIZES.length - 1), 'the cursor ends on the newest batch');
    await run(app);
    t.eq(zzJobs(app).length, TOTAL, 'a second run changes nothing');
    t.includes(app.run('state.sync.message'), 'up to date', 'and says so — re-reading the last batch is no work');
  });

  /* ------------------------------------------------------------------ 20a2 */
  await t.group('20a2 — jobs: a row on the page edge is decided once per run, not twice', async () => {
    const app = signedIn();
    const mine = sentJob(app, 'ZZ EDGE');
    editJob(app, mine.id, 'ZZMINE');                        // changed here…
    const rows = batched((k, s) => jobRow('ZZJ' + k, ['A'], s));
    rows[BOUNDARY] = jobRow(String(mine.id), ['THEIRS-1', 'THEIRS-2', 'THEIRS-3'], stamp(8));  // …and there
    for (const r of rows) app.srv.tables.sessions.push(r);
    await run(app);
    t.eq(zzJobs(app).length, TOTAL - 1, 'every other job arrives');
    t.eq(held(app).filter(e => e.kind === 'session').length, 1, 'the clash is held');
    t.includes(app.run('state.sync.message'), '1 job needs you to decide',
      'and counted once, though the page edge read it twice');
  });

  /* ------------------------------------------------------------------ 20b */
  await t.group('20b — records: a batch split by a page edge is read in full', async () => {
    const app = signedIn({ server: { records: batched((k, s) =>
      recRow('client', 'client_ZZP' + k, { id: 'client_ZZP' + k, name: 'ZZ Paged ' + k }, s)) } });
    await run(app);
    t.eq(zzClients(app).length, TOTAL, 'every client in the cloud reaches the phone');
    t.eq(held(app).length, 0, 'nothing is held');
    t.eq(syncState(app).rec.pulledAt, stamp(SIZES.length - 1), 'the cursor ends on the newest batch');
  });

  /* ------------------------------------------------------------------ 20b2 */
  await t.group('20b2 — records: a row on the page edge is decided once per run, not twice', async () => {
    const app = signedIn();
    local(app, { clients: [{ id: 'client_ZZHB', name: 'ZZ Before' }], sent: ['client_ZZHB'] });
    rename(app, 'client', 'client_ZZHB', 'ZZ Mine');
    const rows = batched((k, s) => recRow('client', 'client_ZZP' + k, { id: 'client_ZZP' + k, name: 'ZZ Paged ' + k }, s));
    rows[BOUNDARY] = recRow('client', 'client_ZZHB', { id: 'client_ZZHB', name: 'ZZ Theirs' }, stamp(8));
    for (const r of rows) app.srv.tables.records.push(r);
    await run(app);
    t.eq(zzClients(app).length, TOTAL - 1, 'every other client arrives');
    t.includes(app.run('state.sync.message'), '1 client or site needs you to decide',
      'the clash is counted once, though the page edge read it twice');
  });

  /* ------------------------------------------------------------------ 20c */
  await t.group('20c — a cursor from an older version is read again from the start, once', async () => {
    const app = signedIn({ server: {
      sessions: [jobRow('ZZJOLD', ['A'], T1)],
      records: [recRow('client', 'client_ZZPOLD', { id: 'client_ZZPOLD', name: 'ZZ Stepped Over' }, T1)],
    } });
    // A V83 phone whose cursors are PAST rows it never read (T2 > T1).
    app.storage.setItem('pat:syncState', JSON.stringify({ userId: UID_A, hashV: 2, sent: {}, gone: {}, resend: {},
      pulledAt: T2, rec: { sent: {}, gone: {}, resend: {}, pulledAt: T2, kinds: app.fn('_syncRecordKindsTag')() } }));
    await run(app);
    t.ok(jobById(app, 'ZZJOLD'), 'the job it had stepped over arrives');
    t.ok(client(app, 'client_ZZPOLD'), 'and the client');
    t.eq(syncState(app).pagerV, app.run('SYNC_PAGER_V'), 'the new pager version is saved');
    await run(app);
    const url = (tbl) => decodeURIComponent(app.srv.gets(tbl).slice(-1)[0].url);
    t.includes(url('sessions'), 'updated_at=gte.' + T1, 'after which jobs carry on from their cursor');
    t.includes(url('records'), 'updated_at=gte.' + T1, 'and so do records — it happens once, not every run');
  });

  /* ------------------------------------------------------------------ 20d */
  await t.group('20d — jobs: this phone\u2019s own push, read back after it logged more, is not a clash', async () => {
    const app = signedIn();
    const s = withSession(app, { site: 'ZZ OWN' });
    withItem(app, { assetNo: 'ZZOWN-1', result: 'pass' });
    app.run('state.activeId = null'); app.stopTimer();
    await run(app);                                          // pushed, one item
    editJob(app, s.id, 'ZZOWN-2');                           // logged more
    await run(app);                                          // reads its own push back
    t.eq(held(app).length, 0, 'nothing is held — the cloud is only what this phone sent');
    const row = app.srv.tables.sessions.find(r => String(r.id) === String(s.id));
    t.eq(row && row.doc.items.length, 2, 'and the new item is sent');
    await run(app);
    t.eq(held(app).length, 0, 'and it stays settled');
  });

  /* ------------------------------------------------------------------ 20e */
  await t.group('20e — records: this phone\u2019s own push, read back after a rename, is not a clash', async () => {
    const app = signedIn();
    app.run("ensureClient('ZZ Own Co'); save();");
    app.stopTimer();
    await run(app);
    const c = (app.state().clients || []).find(x => x.name === 'ZZ Own Co');
    rename(app, 'client', c.id, 'ZZ Own Co Ltd');
    await run(app);
    t.eq(held(app).length, 0, 'nothing is held');
    const row = app.srv.tables.records.find(r => r.id === c.id);
    t.eq(row && row.doc.name, 'ZZ Own Co Ltd', 'and the rename is sent');
  });

  /* ------------------------------------------------------------------ 20f */
  await t.group('20f — jobs: a full page all on one timestamp stops safely instead of skipping', async () => {
    const rows = [];
    for (let i = 0; i < 210; i++) rows.push(jobRow('ZZJSAME' + i, ['A'], stamp(0)));
    const app = signedIn({ server: { sessions: rows } });
    await run(app);
    t.notOk(syncState(app).pulledAt, 'the cursor does not move past rows it may not have read');
    t.ok(app.srv.gets('sessions').length <= 2, 'and the run ends rather than asking for the same page for ever');
  });

  /* ------------------------------------------------------------------ 20f2 */
  await t.group('20f2 — records: a full page all on one timestamp stops safely instead of skipping', async () => {
    const rows = [];
    for (let i = 0; i < 210; i++) rows.push(recRow('client', 'client_ZZPS' + i, { id: 'client_ZZPS' + i, name: 'ZZ Same ' + i }, stamp(0)));
    const app = signedIn({ server: { records: rows } });
    await run(app);
    t.notOk(syncState(app).rec.pulledAt, 'the cursor does not move past rows it may not have read');
    t.ok(app.srv.gets('records').length <= 2, 'and the run ends');
  });
};
