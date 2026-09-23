/* Standing test — sync, clients and sites (V82), and "What's different?"
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Clients and sites travel through the `records` table on
   the rules jobs follow: the fingerprint decides, anything not applied is held,
   a push only follows a pull. Decision 4A: a site whose client was deleted on
   the other phone, and that the other phone never had, goes to Unassigned.
   Held cards now say what differs (names inline for records, 7A; a fetched,
   read-only comparison for jobs, 6A) and every button says what it does.

   ⚠ Same method as group 17: the REAL vendored library against a fake server
   that applies the PostgREST filters it is sent and reorders jsonb keys on the
   way back out. Without the reorder a projection bug in the records fingerprint
   would be invisible here, exactly as the V81.2 jsonb bug was. */

'use strict';

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

module.exports = async function () {
  /* ------------------------------------------------------------------ 18a */
  await t.group('18a — clients and sites from the other phone arrive, and are not sent back', async () => {
    const app = signedIn({ server: { records: [
      recRow('client', 'client_ZZR1', { id: 'client_ZZR1', name: 'ZZ Remote Co' }),
      recRow('site', 'site_ZZR1', { id: 'site_ZZR1', clientId: 'client_ZZR1', name: 'ZZ Remote Yard' }),
    ] } });
    await app.fn('syncPull')();
    await tick(5);
    t.eq(client(app, 'client_ZZR1') && client(app, 'client_ZZR1').name, 'ZZ Remote Co', 'the client is on the phone');
    t.eq(site(app, 'site_ZZR1') && site(app, 'site_ZZR1').clientId, 'client_ZZR1', 'and its site, under it');
    t.ok(syncState(app).rec.sent['client_ZZR1'], 'the client is fingerprinted as applied');
    t.eq(app.srv.rows('records').filter(r => /ZZR1/.test(r.id)).length, 0, 'and neither is pushed straight back');
    t.includes(app.storage.getItem('pat:clients'), 'ZZ Remote Co', 'it is on disk, not only in memory');
    t.includes(app.srv.gets('records')[0].url, 'kind=in.', 'one read covers every synced kind');
  });

  /* ------------------------------------------------------------------ 18b */
  await t.group('18b — what is sent is the projection, so a reload is not a change', async () => {
    const app = signedIn();
    app.run("ensureClient('ZZ Made Here'); save();");
    app.stopTimer();
    await app.fn('syncPull')();
    await tick(5);
    const sent = app.srv.rows('records').find(r => r.doc && r.doc.name === 'ZZ Made Here');
    t.ok(sent, 'a new client is sent');
    t.eq(sent && sent.kind, 'client', 'filed under its kind');
    t.deepEq(sent && Object.keys(sent.doc).sort(), ['id', 'name'], 'carrying only the fields that mean something');
    t.eq(sent && sent.deleted, false, 'as a live row');

    // A close and reopen: loadClients() adds userId/lastModified to every record.
    app.fn('load')();
    const before = app.srv.rows('records').length;
    await app.fn('syncPull')();
    await tick(5);
    t.eq(app.srv.rows('records').length, before,
      'after a reload nothing is re-sent \u2014 the passthrough fields are not part of the fingerprint');
    t.eq(held(app).length, 0, 'and nothing is held: the phone does not see its own work as a clash');
  });

  /* ------------------------------------------------------------------ 18c */
  await t.group('18c — changed on both phones: held, not sent, both names on the card', async () => {
    const app = signedIn({ server: { records: [
      recRow('client', 'client_ZZB', { id: 'client_ZZB', name: 'ZZ Theirs' }),
    ] } });
    local(app, { clients: [{ id: 'client_ZZB', name: 'ZZ Before' }], sent: ['client_ZZB'] });
    rename(app, 'client', 'client_ZZB', 'ZZ Mine');
    await app.fn('syncPull')();
    await tick(5);
    const h = held(app).find(e => e.id === 'client_ZZB');
    t.ok(h, 'the client is held');
    t.eq(h && h.kind, 'client', 'as a client');
    t.eq(h && h.reason, 'both-changed', 'because both sides moved');
    t.eq(client(app, 'client_ZZB').name, 'ZZ Mine', 'the phone\u2019s copy is untouched');
    t.eq(app.srv.rows('records').filter(r => r.id === 'client_ZZB').length, 0, 'and it is not pushed over the cloud copy');
    t.notOk(syncState(app).rec.pulledAt, 'the cursor stays at the first unresolved row');

    const html = app.fn('renderCloudSync')();
    t.includes(html, 'Clients &amp; sites', 'records have their own heading');
    t.includes(html, 'ZZ Mine', 'the card names this phone\u2019s version');
    t.includes(html, 'ZZ Theirs', 'and the cloud\u2019s, without a tap (decision 7A)');
    t.includes(html, 'data-arg="client/client_ZZB"', 'the answers carry the record\u2019s key');
  });

  /* ------------------------------------------------------------------ 18d */
  await t.group('18d — a clean local copy takes the other phone\u2019s rename', async () => {
    const app = signedIn({ server: { records: [
      recRow('client', 'client_ZZD', { id: 'client_ZZD', name: 'ZZ Renamed There' }),
    ] } });
    local(app, { clients: [{ id: 'client_ZZD', name: 'ZZ Original' }], sent: ['client_ZZD'] });
    await app.fn('syncPull')();
    await tick(5);
    t.eq(client(app, 'client_ZZD').name, 'ZZ Renamed There', 'the rename is applied');
    t.eq(held(app).length, 0, 'with nothing to ask');
    t.eq(app.srv.rows('records').filter(r => r.id === 'client_ZZD').length, 0, 'and it is not sent back');
    t.eq(syncState(app).rec.pulledAt, T2, 'the cursor moves on');
  });

  /* ------------------------------------------------------------------ 18e */
  await t.group('18e — a client deleted elsewhere: its shared sites go, a site only here goes to Unassigned (4A)', async () => {
    const app = signedIn({ server: { records: [
      recRow('client', 'client_ZZE', null, T2, true),
      recRow('site', 'site_ZZE1', null, T2, true),
    ] } });
    local(app, {
      clients: [{ id: 'client_ZZE', name: 'ZZ Going' }],
      sites: [{ id: 'site_ZZE1', clientId: 'client_ZZE', name: 'ZZ Shared Site' },
              { id: 'site_ZZE2', clientId: 'client_ZZE', name: 'ZZ Only Here' }],
      sent: ['client_ZZE', 'site_ZZE1'],
    });
    await app.fn('syncPull')();
    await tick(5);
    t.notOk(client(app, 'client_ZZE'), 'the client is gone');
    t.notOk(site(app, 'site_ZZE1'), 'its site the other phone had is gone, by its own delete');
    t.ok(site(app, 'site_ZZE2'), 'the site made only here is kept');
    t.eq(site(app, 'site_ZZE2') && site(app, 'site_ZZE2').clientId, '', 'under Unassigned');
    const tomb = app.state().tombstones || [];
    t.ok(tomb.some(x => x.kind === 'client' && x.id === 'client_ZZE'), 'the delete is in the ledger, as a local delete would be');
    const up = app.srv.rows('records').find(r => r.id === 'site_ZZE2');
    t.eq(up && up.doc && up.doc.clientId, '', 'and the move to Unassigned is sent in the same run');
  });

  /* ------------------------------------------------------------------ 18f */
  await t.group('18f — nothing is tidied on a run that held something', async () => {
    const app = signedIn({ server: { records: [
      recRow('client', 'client_ZZH', { id: 'client_ZZH', name: 'ZZ Theirs H' }),
    ] } });
    local(app, {
      clients: [{ id: 'client_ZZH', name: 'ZZ Before H' }],
      sites: [{ id: 'site_ZZDANGLE', clientId: 'client_ZZMISSING', name: 'ZZ Dangling' }],
      sent: ['client_ZZH'],
    });
    rename(app, 'client', 'client_ZZH', 'ZZ Mine H');
    await app.fn('syncPull')();
    await tick(5);
    t.eq(held(app).length, 1, 'the clash is held');
    t.eq(site(app, 'site_ZZDANGLE').clientId, 'client_ZZMISSING',
      'and a site whose client is missing is left alone \u2014 the missing client may be the question');
  });

  /* ------------------------------------------------------------------ 18g */
  await t.group('18g — deleted elsewhere, edited here: held; keeping it sends it back live', async () => {
    const app = signedIn({ server: { records: [recRow('client', 'client_ZZF', null, T2, true)] } });
    local(app, { clients: [{ id: 'client_ZZF', name: 'ZZ Sent F' }], sent: ['client_ZZF'] });
    rename(app, 'client', 'client_ZZF', 'ZZ Edited F');
    await app.fn('syncPull')();
    await tick(5);
    const h = held(app).find(e => e.id === 'client_ZZF');
    t.eq(h && h.reason, 'deleted-elsewhere', 'held as deleted on the other phone');
    t.ok(client(app, 'client_ZZF'), 'and not deleted here');
    t.includes(app.fn('renderCloudSync')(), 'Delete it here too', 'the buttons say what they do');

    const table = app.run('ACTIONS');
    table['sync-keep-phone']('client/client_ZZF');
    await tick(15);
    const up = app.srv.rows('records').filter(r => r.id === 'client_ZZF').pop();
    t.eq(up && up.deleted, false, 'keeping it sends it back live');
    t.eq(up && up.doc && up.doc.name, 'ZZ Edited F', 'with this phone\u2019s name');
    t.eq(held(app).length, 0, 'and the question is gone');
  });

  /* ------------------------------------------------------------------ 18h */
  await t.group('18h — deleted here, live in the cloud: held; bringing it back re-reads the cloud', async () => {
    const app = signedIn({ server: { records: [
      recRow('client', 'client_ZZG', { id: 'client_ZZG', name: 'ZZ Back Again' }),
    ] } });
    app.run("recordTombstone('client', 'client_ZZG'); save();");
    app.stopTimer();
    const st = { userId: UID_A, hashV: 2, sent: {}, gone: {}, resend: {},
      rec: { sent: {}, gone: { client_ZZG: true }, resend: {}, pulledAt: null, kinds: '' } };
    app.storage.setItem('pat:syncState', JSON.stringify(st));
    await app.fn('syncPull')();
    await tick(5);
    t.eq((held(app)[0] || {}).reason, 'deleted-here', 'held as deleted on this phone');
    const html = app.fn('renderCloudSync')();
    t.includes(html, 'Keep it deleted', 'one button keeps the delete');
    t.includes(html, 'Bring it back', 'the other undoes it');
    t.notOk(client(app, 'client_ZZG'), 'nothing is brought back until asked');

    app.run('ACTIONS')['sync-keep-cloud']('client/client_ZZG');
    await tick(15);
    t.eq(client(app, 'client_ZZG') && client(app, 'client_ZZG').name, 'ZZ Back Again', 'brought back from the cloud copy');
    t.ok(syncState(app).rec.sent['client_ZZG'], 'and fingerprinted, so it is not sent straight back');
    t.eq(held(app).length, 0, 'the question is gone');
  });

  /* ------------------------------------------------------------------ 18i */
  await t.group('18i — an unreadable record is held, never applied, and offers only the safe answer', async () => {
    const app = signedIn({ server: { records: [recRow('client', 'client_ZZU', { id: 'client_ZZU', name: '   ' })] } });
    await app.fn('syncPull')();
    await tick(5);
    t.eq((held(app)[0] || {}).reason, 'unreadable', 'a nameless client is held');
    t.notOk(client(app, 'client_ZZU'), 'not applied \u2014 loadClients() would drop it and it would read as a delete');
    const html = app.fn('renderCloudSync')();
    t.includes(html, 'data-action="sync-keep-phone" data-arg="client/client_ZZU"', 'the phone answer is offered');
    t.excludes(html, 'data-action="sync-keep-cloud" data-arg="client/client_ZZU"', 'the cloud answer is not \u2014 there is nothing to apply');
  });

  /* ------------------------------------------------------------------ 18j */
  await t.group('18j — a broken records table never stops jobs, and never pushes without a read', async () => {
    const app = signedIn({ server: { recordsFail: true } });
    local(app, { clients: [{ id: 'client_ZZJ', name: 'ZZ Unsent J' }] });
    withSession(app, { site: 'ZZ JOB J' });
    withItem(app, { assetNo: CANARY.asset, result: 'pass' });
    app.run('state.activeId = null');
    app.stopTimer();
    await app.fn('syncPull')();
    await tick(5);
    t.ok(app.srv.rows('sessions').some(r => r.doc && String(r.doc.site).indexOf('ZZ JOB J') !== -1), 'the job is still sent');
    t.eq(app.srv.rows('records').length, 0, 'records are not pushed when their read failed');
    // v83: the sentence now names every list the records table carries.
    t.includes(app.run('state.sync.message'), 'Clients, sites, instruments and presets couldn', 'and the page says so plainly');
  });

  /* ------------------------------------------------------------------ 18k */
  await t.group('18k — "Re-send all jobs" is jobs only', async () => {
    const app = signedIn();
    local(app, { clients: [{ id: 'client_ZZK', name: 'ZZ K' }] });
    app.run('ACTIONS')['sync-resend-all']();
    await tick(15);
    t.eq(app.srv.gets('records').length, 0, 'no records read');
    t.eq(app.srv.rows('records').length, 0, 'and none sent \u2014 a run without a read never pushes them');
  });

  /* ------------------------------------------------------------------ 18l */
  await t.group('18l — held entries are kind-aware, and a V81 entry is a job', async () => {
    const app = signedIn();
    app.storage.setItem('pat:syncHeld', JSON.stringify([
      { id: 'ZZSAME', at: T1, reason: 'both-changed', name: 'ZZ Job', localItems: 1, cloudItems: 2 },
      { id: 'ZZSAME', kind: 'client', at: T1, reason: 'both-changed', name: 'ZZ Client', localName: 'a', cloudName: 'b' },
      { id: 'ZZNOPE', kind: 'client', at: T1, reason: 'fewer-items', name: 'x' },
    ]));
    const list = app.fn('syncHeldList')();
    t.eq(list.length, 2, 'both entries load, and a client cannot be held for an item count');
    t.ok(list.some(e => e.kind === 'session' && e.id === 'ZZSAME'), 'the entry with no kind reads as a job');
    t.eq(app.fn('syncHeldKey')(list.find(e => e.kind === 'client')), 'client/ZZSAME', 'a record key names its kind');
    app.fn('_syncHeldClear')('ZZSAME', 'client');
    const after = app.fn('syncHeldList')();
    t.eq(after.length, 1, 'clearing the client');
    t.eq(after[0] && after[0].kind, 'session', 'leaves the job with the same id alone');

    // …and a held client never stops a job with the same id being sent.
    app.storage.setItem('pat:syncHeld', JSON.stringify([
      { id: 'ZZSHARED', kind: 'client', at: T1, reason: 'both-changed', name: 'c', localName: 'a', cloudName: 'b' },
    ]));
    app.run("state.sessions.unshift({ id: 'ZZSHARED', site: 'ZZ SHARED JOB', name: '', items: [] }); saveSessions();");
    app.stopTimer();
    await app.fn('syncPull')();
    await tick(5);
    t.ok(app.srv.rows('sessions').some(r => r.id === 'ZZSHARED'), 'the job is sent');
  });

  /* ------------------------------------------------------------------ 18m */
  await t.group('18m — a new record kind reads from the beginning, not from the old cursor', async () => {
    const app = signedIn();
    app.storage.setItem('pat:syncState', JSON.stringify({ userId: UID_A, hashV: 2, sent: {}, gone: {}, resend: {},
      rec: { sent: {}, gone: {}, resend: {}, pulledAt: T2, kinds: 'client' } }));
    await app.fn('syncPull')();
    await tick(5);
    t.includes(app.srv.gets('records')[0].url, 'updated_at=gt.1970', 'a list that grew resets the cursor');

    // v83: the tag is kinds AND settings ids (_syncRecordKindsTag), so the
    // "same list" case reads the current tag rather than a hard-coded V82 one.
    const app2 = signedIn();
    app2.storage.setItem('pat:syncState', JSON.stringify({ userId: UID_A, hashV: 2, sent: {}, gone: {}, resend: {},
      rec: { sent: {}, gone: {}, resend: {}, pulledAt: T2, kinds: app2.fn('_syncRecordKindsTag')() } }));
    await app2.fn('syncPull')();
    await tick(5);
    t.includes(decodeURIComponent(app2.srv.gets('records')[0].url), 'updated_at=gt.' + T2, 'the same list carries on from its cursor');
  });

  /* ------------------------------------------------------------------ 18n */
  await t.group('18n — the comparison: items by id, fields named, details, nothing invented', () => {
    const app = signedIn();
    const it = (id, assetNo, extra = {}) => Object.assign({ id, assetNo, location: 'ZZ Kitchen', itemType: 'Kettle', notes: '', result: 'pass' }, extra);
    const here = { id: 'J', site: 'ZZ Here Site', engineer: 'E', exportedAt: T1, items: [
      it('a1', '001'), it('b1', '002'), it('c1', '003'), it('e1', '005'),
    ] };
    const cloud = { id: 'J', site: 'ZZ Cloud Site', engineer: 'E', items: [
      // Different ORDER from the phone's, so matching by position cannot pass.
      it('b1', '002', { result: 'fail', notes: 'ZZ cracked plug' }), it('a1', '001'),
      it('d1', '004'), (() => { const x = it('e1', '005'); delete x.notes; return x; })(),
    ] };
    const d = app.fn('syncJobDiff')(here, cloud);
    t.eq(d.onlyHere.length, 1, 'one item only on this phone');
    t.includes(d.onlyHere[0], '003', 'named by its asset number');
    t.eq(d.onlyCloud.length, 1, 'one only in the cloud');
    t.includes(d.onlyCloud[0], '004', 'named too');
    t.eq(d.changed.length, 1, 'one changed');
    t.includes(d.changed[0] && d.changed[0].label, '002', 'the right one');
    const res = (d.changed[0] ? d.changed[0].fields : []).find(f => f.label === 'Result');
    t.eq(res && res.here + '/' + res.cloud, 'Pass/Fail', 'the field that changed, both values, in plain words');
    t.eq(d.unchanged, 2, 'a blank note against no note at all is not a difference');
    t.ok(d.details.some(x => x.label === 'Site' && x.here === 'ZZ Here Site' && x.cloud === 'ZZ Cloud Site'), 'job details that differ are listed');
    t.ok(d.details.some(x => x.label === 'Export'), 'export status is one line, not noise');
    t.notOk(d.none, 'and it says there are differences');

    const same = app.fn('syncJobDiff')(here, JSON.parse(JSON.stringify(here)));
    t.ok(same.none, 'identical copies report no differences');
  });

  /* ------------------------------------------------------------------ 18o */
  await t.group('18o — "What\u2019s different?" through dispatch: fetched, shown, stored nowhere', async () => {
    const app = signedIn();
    const s = withSession(app, { site: 'ZZ DIFF JOB' });
    withItem(app, { assetNo: 'ZZ-HERE-1', result: 'pass' });
    app.run('state.activeId = null');
    app.stopTimer();
    const sess = app.run(`state.sessions.find(x => x.site && x.site.indexOf('ZZ DIFF JOB') !== -1)`);
    const id = String(sess.id);
    const cloudDoc = JSON.parse(JSON.stringify(sess));
    cloudDoc.items = cloudDoc.items.concat([{ id: 'zzc', assetNo: 'ZZ-CLOUD-ONLY', location: 'L', itemType: 'Kettle', notes: '', result: 'pass' }]);
    app.srv.tables.sessions.push({ id, doc: cloudDoc, deleted: false, last_modified: T2, updated_at: T2 });
    app.storage.setItem('pat:syncHeld', JSON.stringify([
      { id, at: T1, reason: 'both-changed', name: 'ZZ DIFF JOB', localItems: 1, cloudItems: 2 },
    ]));
    const html = app.fn('renderCloudSync')();
    t.includes(html, `data-action="sync-held-diff" data-arg="${id}"`, 'a job on both sides offers the comparison');

    app.run('ACTIONS')['sync-held-diff'](id);
    await tick(15);
    const sheet = app.doc.body.children.find(c => c.id === 'sync-diff-sheet');
    t.ok(sheet, 'the comparison opens as a sheet');
    t.includes(sheet && sheet.innerHTML, 'ZZ-CLOUD-ONLY', 'naming the item only in the cloud');
    t.includes(sheet && sheet.innerHTML, 'Only in the cloud', 'under the right heading');
    t.includes(sheet && sheet.innerHTML, 'Keeping this phone\u2019s copy would remove', 'and saying what each answer would do');
    t.eq(app.run('state.sync.diffing'), null, 'the button is not left saying "Checking\u2026"');
    t.excludes(app.storage.getItem('pat:syncHeld'), 'ZZ-CLOUD-ONLY', 'the cloud copy is not stored in the held list');
    t.excludes(app.storage.getItem('pat:syncState'), 'ZZ-CLOUD-ONLY', 'nor in the sync state');
    t.excludes(app.storage.getItem('pat:sessions'), 'ZZ-CLOUD-ONLY', 'and nothing on the phone changed');
    t.eq(held(app).length, 1, 'the question is still open \u2014 looking is not answering');
    void s;
  });

  /* ------------------------------------------------------------------ 18p */
  await t.group('18p — every held card says what its buttons do', () => {
    const app = signedIn();
    app.storage.setItem('pat:syncHeld', JSON.stringify([
      { id: 'ZZDH', at: T1, reason: 'deleted-here', name: 'ZZ Job DH', localItems: null, cloudItems: 3 },
      { id: 'ZZDE', at: T1, reason: 'deleted-elsewhere', name: 'ZZ Job DE', localItems: 3, cloudItems: null },
      { id: 'ZZUN', at: T1, reason: 'unreadable', name: 'ZZ Job UN' },
      { id: 'site_ZZS', kind: 'site', at: T1, reason: 'both-changed', name: 'ZZ Site',
        localName: 'ZZ Site', cloudName: 'ZZ Site', localParent: 'ZZ Client A', cloudParent: null },
    ]));
    const html = app.fn('renderCloudSync')();
    t.includes(html, 'Keep it deleted', 'deleted here: keep the delete');
    t.includes(html, 'Bring it back', 'or undo it');
    t.includes(html, 'Keep this job', 'deleted elsewhere: keep it');
    t.excludes(html, 'data-action="sync-keep-cloud" data-arg="ZZUN"', 'unreadable: no cloud answer');
    t.excludes(html, 'data-action="sync-held-diff" data-arg="ZZDH"', 'no comparison where one side has no job');
    t.includes(html, 'a client not on this phone', 'a site under a client this phone lacks says so');
    t.includes(html, 'ZZ Client A', 'against the client it sits under here');
  });

  /* ------------------------------------------------------------------ 18q */
  await t.group('18q — the outcome line names clients and sites, and leaves the job wording alone', () => {
    const app = signedIn();
    const out = app.fn('_syncOutcome');
    const p0 = { applied: 0, added: 0, removed: 0, held: 0 };
    const r0 = { applied: 0, added: 0, removed: 0, held: 0, unassigned: 0, sent: 0, deleted: 0, error: null };
    t.eq(out({ sent: 0, deleted: 0, pulled: p0, records: r0 }), 'Everything was already up to date.', 'quiet run');
    t.eq(out({ sent: 0, deleted: 0, pulled: p0, records: Object.assign({}, r0, { added: 1, applied: 1, sent: 2 }) }),
      'Clients & sites: 2 changes brought in, 2 changes sent.', 'records only');
    t.eq(out({ sent: 1, deleted: 0, pulled: Object.assign({}, p0, { held: 1 }), records: null }),
      'Sent 1 job. 1 job needs you to decide \u2014 see below.', 'a job-only run reads exactly as it did in V81');
    t.includes(out({ sent: 0, deleted: 0, pulled: p0, records: Object.assign({}, r0, { held: 2 }) }),
      '2 clients or sites need you to decide', 'held records are named as records');
  });

  /* ------------------------------------------------------------------ 18r */
  t.group('18r — every client or site change reaches the sync trigger', () => {
    // save() is saveSessions() + saveSettings(), and the sync trigger lives in
    // saveSessions(). Clients and sites are written by saveSettings(), so they
    // are only covered while nothing calls saveSettings() on its own — except
    // sync.js, which pushes in the same run and must not re-arm itself.
    const files = fs.readdirSync(APP_DIR).filter(f => f.endsWith('.js') && !/min\.js$|umd\.js$/.test(f));
    const offenders = [];
    for (const f of files) {
      if (f === 'storage.js' || f === 'sync.js') continue;
      const src = fs.readFileSync(path.join(APP_DIR, f), 'utf8').replace(/\/\/[^\n]*/g, '');
      if (/(^|[^A-Za-z_$.])saveSettings\s*\(/.test(src)) offenders.push(f);
    }
    t.deepEq(offenders, [], 'no file but storage.js and sync.js calls saveSettings() directly');
    const st = fs.readFileSync(path.join(APP_DIR, 'storage.js'), 'utf8');
    const save = st.slice(st.indexOf('function save() {'), st.indexOf('function save() {') + 80);
    t.includes(save, 'saveSessions();', 'and save() still goes through saveSessions()');
  });
};
