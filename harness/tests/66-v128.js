/* Standing test — V128: the stale-phone check (Stage 12's clean-up job, phone side)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked (14 Oct, Peter): 0A the phone-side guard the
   clean-up job needs before it may clear old "deleted" rows (markers). 1A jobs,
   clients/sites/testers/presets/templates, and the photo note. 2A a table not
   seen whole for SYNC_STALE_DAYS (≈ 9 months) is listed in full before the run
   sends anything. 3A a row this phone knows was in the cloud and that is not
   there at all was deleted: decided as its marker would have been (clean here →
   removed; edited here → asked). 4A a safety copy first, in Backup & Restore.
   5A a check that cannot finish → the run sends nothing.

     66a  when it is due (pure): seen-whole, the cursor stand-in, a fresh state,
          nothing known, the server's time over a clock wound back.
     66b  a stale phone: a job deleted elsewhere, marker gone → removed here,
          bookkeeping right, seen-whole recorded, the next run lists nothing.
     66c  edited here → asked, never sent; "use the cloud" deletes it here (the
          row is gone for good); "keep this phone's" sends it back and the
          remembered answer does not remove it again.
     66d  5A: a save's push reads first; a failed or EMPTY list sends nothing and
          says so; a server that caps pages short still lists everything.
     66e  4A: the safety copy — taken first, only when something here is in
          question, its own slot and label; a refused write asks instead.
     66g  records: a clean client goes; the tester in use is asked about; one
          only in the bookkeeping is put right; settings rows never in question.
     66g2 records: seen whole; no safety copy → asked; "use the cloud" deletes.
     66j  the server's time over a phone clock wound back.
     66h  photos: the note of a photo no longer here is dropped; one still here
          stays noted, so it is never sent back up.
     66i  a run held open by a question reuses the check for an hour.
     66f  release: V128, What's new, cache, changelog. (65f → 66f.)

   Fake server: 44's (filters eq/gt/gte/in, order, limit, select), with a page
   cap (srv.cap) and a failure switch for the id list (srv.failList). */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { tick, withSession, withItem, freshApp, withInstrument } = require('../fixture');

const LIB = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');
const UID = '11111111-1111-1111-1111-111111111111';
const J = JSON.stringify;
const DAY = 86400000;
const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const iso = (ms) => new Date(ms).toISOString();

function storedSession(issuedMs) {
  const life = 3600;
  const exp = Math.floor((issuedMs || Date.now()) / 1000) + life;
  return JSON.stringify({
    access_token: 'ZZACCESS', token_type: 'bearer', expires_in: life,
    expires_at: exp, refresh_token: 'ZZREFRESH',
    user: { id: UID, email: 'peter@example.com', aud: 'authenticated', role: 'authenticated' },
  });
}

const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });

function applyQuery(rows, qs) {
  const q = new URLSearchParams(qs || '');
  let out = rows.slice();
  for (const [k, v] of q) {
    if (k === 'select' || k === 'order' || k === 'limit' || k === 'on_conflict' || k === 'columns') continue;
    const val = (r) => { const m = k.match(/^doc->>(\w+)$/); if (!m) return r[k]; const x = r.doc ? r.doc[m[1]] : undefined; return (x === undefined || x === null) ? null : String(x); };
    if (v.startsWith('eq.')) { const x = v.slice(3); out = out.filter(r => String(val(r)) === x); }
    else if (v.startsWith('gte.')) { const x = v.slice(4); out = out.filter(r => String(r[k]) >= x); }
    else if (v.startsWith('gt.')) { const x = v.slice(3); out = out.filter(r => String(r[k]) > x); }
    else if (v.startsWith('in.(')) {
      const list = v.slice(4, -1).split(',').map(s => s.replace(/^"|"$/g, ''));
      out = out.filter(r => list.includes(String(r[k])));
    }
  }
  const ord = q.get('order');
  if (ord) { const col = ord.split('.')[0]; out.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0)); }
  if (q.get('limit')) out = out.slice(0, parseInt(q.get('limit'), 10));
  const sel = q.get('select');
  if (sel && sel !== '*') {
    const cols = sel.split(',');
    out = out.map((r) => {
      const o = {};
      for (const c of cols) {
        const m = c.match(/^(\w+):doc->>(\w+)$/);
        const m2 = c.match(/^(\w+):doc->(\w+)->>(\w+)$/);
        if (m) { const x = r.doc ? r.doc[m[2]] : undefined; o[m[1]] = (x === undefined || x === null) ? null : String(x); }
        else if (m2) { const p = r.doc ? r.doc[m2[2]] : undefined; const x = (p && typeof p === 'object') ? p[m2[3]] : undefined; o[m2[1]] = (x === undefined || x === null) ? null : String(x); }
        else o[c] = r[c];
      }
      return o;
    });
  }
  return out;
}

function fakeServer() {
  const calls = [];
  const tables = { sessions: [], records: [], photos: [] };
  const files = new Map();
  let stampN = 0;
  const stamp = () => { stampN++; return '2026-10-08T12:' + String(Math.floor(stampN / 60) % 60).padStart(2, '0') + ':' + String(stampN % 60).padStart(2, '0') + '.' + String(stampN).padStart(3, '0') + 'Z'; };
  const srv = { calls, tables, files, stamp, cap: 0, failList: 0 };
  srv.fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    let body = null;
    if (typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    else body = init.body || null;
    calls.push({ url: u, method, body });
    if (u.includes('/storage/v1/object/photos')) {
      if (method === 'DELETE') { const names = (body && body.prefixes) || []; for (const p of names) files.delete(p); return json(names.map(p => ({ name: p }))); }
      const p = decodeURIComponent(u.split('/storage/v1/object/photos/')[1].split('?')[0]);
      files.set(p, true);
      return json({ Key: 'photos/' + p, Id: 'x' });
    }
    const qs = u.split('?')[1] || '';
    for (const name of ['sessions', 'records', 'photos']) {
      if (!u.includes('/rest/v1/' + name + '?') && !u.endsWith('/rest/v1/' + name)) continue;
      const rows = tables[name];
      if (method === 'GET') {
        const q = new URLSearchParams(qs);
        const isList = q.get('select') === 'id';
        if (isList && srv.failList > 0) { srv.failList--; return json({ message: 'ZZ list refused' }, 500); }
        let out = applyQuery(rows, qs);
        if (isList && srv.cap > 0) out = out.slice(0, srv.cap);
        return json(out);
      }
      if (method === 'PATCH') {
        const st = stamp();
        const hit = applyQuery(rows, qs.replace(/(^|&)select=[^&]*/, ''));
        for (const h of hit) { const r = rows.find(x => x.id === h.id); Object.assign(r, body, { updated_at: st }); }
        return new Response(null, { status: 204 });
      }
      const st = stamp();
      for (const row of (Array.isArray(body) ? body : [body])) {
        const i = rows.findIndex(r => String(r.id) === String(row.id));
        const stored = Object.assign({}, i === -1 ? {} : rows[i], row, { updated_at: st });
        if (i === -1) rows.push(stored); else rows[i] = stored;
      }
      return new Response(null, { status: 201 });
    }
    if (u.includes('/rest/v1/profiles')) return json([{ plan: 'trial', trial_ends_at: null }]);
    return json({ message: 'unexpected ' + u }, 404);
  };
  // Requests that list a table's ids — the check's own reads, and nothing else.
  srv.lists = (table) => calls.filter(c => c.method === 'GET' && c.url.includes('/rest/v1/' + table + '?')
    && new URLSearchParams(c.url.split('?')[1] || '').get('select') === 'id');
  srv.posts = (table) => calls.filter(c => c.method === 'POST' && c.url.includes('/rest/v1/' + table));
  srv.sentIds = (table) => srv.posts(table).flatMap(c => (Array.isArray(c.body) ? c.body : [c.body]).map(r => String(r && r.id)));
  srv.firstPost = () => calls.findIndex(c => c.method === 'POST' || c.method === 'PATCH');
  return srv;
}

async function signedIn(o = {}) {
  const ls = Object.assign({ 'patgo:cloudAuth:test': storedSession(o.issuedMs) }, o.localStorage || {});
  const app = bootApp({ localStorage: ls, navigator: { onLine: false } });
  app.sandbox.localStorage.setItem('pat:cloudUnlocked', '1');
  app.fn('load')();
  app.state = () => app.refresh('state').state;
  app.stopTimer = () => app.run('if (_syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }');
  const srv = o.srv || fakeServer();
  const sb = app.sandbox;
  for (const k of ['Headers', 'Request', 'Response', 'AbortController', 'TextEncoder',
                   'TextDecoder', 'URLSearchParams', 'URL', 'atob', 'btoa', 'Blob']) sb[k] = globalThis[k];
  if (!sb.crypto) sb.crypto = globalThis.crypto;
  sb.WebSocket = class {};
  sb.fetch = srv.fetchImpl;
  app.run(LIB);
  app.run('navigator.onLine = true');
  app.srv = srv;
  app.stopTimer();
  await tick(5);
  for (let k = 0; k < 100 && app.run("(state.cloud && state.cloud.status) || ''") !== 'signed-in'; k++) await tick(10);
  app.stopTimer();
  return app;
}

const syncState = (app) => JSON.parse(app.storage.getItem('pat:syncState') || 'null');
const held = (app) => JSON.parse(app.storage.getItem('pat:syncHeld') || '[]');
async function run(app, o = { pull: true }) { const r = await app.fn('syncPush')(o); app.stopTimer(); await tick(30); return r; }
const onPhone = (app, id) => app.state().sessions.some(s => String(s.id) === String(id));
const tombs = (app, kind) => (app.state().tombstones || []).filter(x => x.kind === kind).map(x => String(x.id));
const msg = (app) => String(app.state().sync.message || '');

// A job made on this phone, stepped out of. Returns its id.
function job(app, site) {
  withSession(app, { site });
  withItem(app, { assetNo: 'ZZA-' + site, result: 'pass' });
  const s = app.fn('activeSession')();
  app.run('state.activeId = null; state.view = "sessions";');
  app.stopTimer();
  return String(s.id);
}
const hashOf = (app, id) => app.run(`syncHash(_syncCanonical(state.sessions.find(s => String(s.id) === ${J(id)})))`);
// The cloud row for a job as this phone has it now.
function cloudRow(app, id, o = {}) {
  const doc = JSON.parse(J(app.state().sessions.find(s => String(s.id) === id)));
  const row = { id, user_id: UID, doc, deleted: false, last_modified: '2026-01-01T00:00:00.000Z',
    fp: app.run(`syncHash(_syncCanonical(${J(doc)}))`), updated_at: o.at || app.srv.stamp() };
  app.srv.tables.sessions.push(row);
  return row;
}

// The sync state of a phone last in touch `months` ago: written as V127 left
// it (no seenAllAt), its cursors that old, `sent` = the jobs it knows in the cloud.
function staleState(app, o = {}) {
  const months = o.months == null ? 10 : o.months;
  const old = iso(Date.now() - months * 30.5 * DAY);
  const st = {
    userId: UID, hashV: app.run('SYNC_HASH_V'), pagerV: app.run('SYNC_PAGER_V'), confV: app.run('SYNC_CONF_V'),
    sent: {}, gone: {}, resend: {}, conf: {}, pulledAt: old, lastPullAt: old,
    rec: { sent: {}, gone: {}, resend: {}, pulledAt: old, kinds: app.run('_syncRecordKindsTag()') },
    ph: { sent: {}, pulledAt: old, need: [], mv: {} },
  };
  for (const id of (o.jobs || [])) st.sent[id] = hashOf(app, id);
  Object.assign(st.rec.sent, o.rec || {});
  Object.assign(st.ph.sent, o.ph || {});
  if (o.seenAllAt) { st.seenAllAt = o.seenAllAt; st.rec.seenAllAt = o.seenAllAt; st.ph.seenAllAt = o.seenAllAt; }
  app.storage.setItem('pat:syncState', J(st));
  return st;
}

// A stale phone with two jobs it sent: KEEP (still in the cloud) and GONE
// (deleted elsewhere long ago — no row at all now).
async function staleTwo(o = {}) {
  const app = await signedIn(o);
  const keep = job(app, 'ZZKEEP');
  const gone = job(app, 'ZZGONE');
  cloudRow(app, keep);
  staleState(app, { jobs: [keep, gone] });
  return { app, keep, gone };
}

const snaps = (app) => app.sandbox.indexedDB._stores.get('snapshots') || new Map();

module.exports = async function () {
  /* ------------------------------------------------------------------ 66a */
  await t.group('66a — when the check is due: seen whole, the cursor stand-in, fresh, nothing known, server time', async () => {
    const app = freshApp();
    const now = Date.parse('2026-10-14T12:00:00.000Z');
    const st = (o) => {
      const s = app.run('_syncEmpty("u")');
      s.sent = { J1: 'h' };
      return Object.assign(s, o || {});
    };
    const due = (s, n) => app.fn('syncCheckDue')(s, n === undefined ? now : n);
    const months = (m) => iso(now - m * 30.5 * DAY);
    t.eq(app.run('SYNC_STALE_DAYS'), 274, 'about nine months (2A)');
    t.ok(app.run('SYNC_STALE_DAYS < SYNC_MARKER_DAYS - 60'), 'well inside the server’s marker age — the margin for clocks');
    t.ok(due(st()).jobs, 'never seen whole, never pulled, something known → due');
    t.ok(due(st({ pulledAt: months(10) })).jobs, 'cursor ten months old, no record → due');
    t.notOk(due(st({ pulledAt: months(8) })).jobs, 'cursor eight months old → not due (a V127 phone’s cursor stands in)');
    t.notOk(due(st({ pulledAt: months(10), seenAllAt: months(1) })).jobs, 'seen whole last month → not due, however old the cursor (a quiet account)');
    t.ok(due(st({ pulledAt: months(10), seenAllAt: months(9.5) })).jobs, 'seen whole 9½ months ago → due');
    t.notOk(due(Object.assign(st({ pulledAt: months(10) }), { sent: {} })).jobs, 'nothing known in the cloud → never due (nothing to put back)');
    const r = st({ pulledAt: months(1), seenAllAt: months(1) });
    r.rec.sent = { C1: 'h' }; r.rec.pulledAt = months(11);
    t.deepEq(due(r), { jobs: false, rec: true, ph: false }, 'each table on its own: the quiet clients table is due, jobs not');
    const r2 = st({ pulledAt: months(1) });
    r2.rec.sent = { [app.run('SYNC_INUSE_ID')]: 'h', [app.run('SYNC_REPORT_ID')]: 'h' };
    t.eq(due(r2).rec, false, 'settings rows are never in question (no version deletes them)');
    r2.ph.sent = { P1: { s: 'J1', i: 'I1' } };
    t.eq(due(r2).ph, true, 'photos: a known photo and no seen-whole → due');
    // Time: the later of phone and server decides "now".
    t.notOk(due(st({ seenAllAt: months(8) }), now).jobs, 'by the phone’s clock, 8 months: not due…');
    t.ok(due(st({ seenAllAt: months(8) }), now + 60 * DAY).jobs, '…by the server’s, 10: due');
    // A state made new for an account starts seen-whole now; one loaded without the field does not.
    app.storage.removeItem('pat:syncState');
    const fresh = app.fn('_syncStateFor')('ZZUSER');
    t.ok(fresh.seenAllAt && Date.now() - Date.parse(fresh.seenAllAt) < 60000, 'a new account’s state: seen whole from now');
    t.ok(fresh.rec.seenAllAt && fresh.ph.seenAllAt, '…for all three tables');
    app.storage.setItem('pat:syncState', J({ userId: 'ZZUSER', hashV: 2, sent: { J1: 'h' }, pulledAt: months(3) }));
    t.eq(app.fn('_syncStateFor')('ZZUSER').seenAllAt, null, 'a V127 state keeps no seen-whole of its own (the cursor stands in)');
    app.storage.setItem('pat:syncState', J({ userId: 'ZZUSER', hashV: 2, seenAllAt: months(2), rec: { seenAllAt: months(3) }, ph: { seenAllAt: months(4) } }));
    const kept = app.fn('_syncStateFor')('ZZUSER');
    t.deepEq([kept.seenAllAt, kept.rec.seenAllAt, kept.ph.seenAllAt], [months(2), months(3), months(4)], 'a saved seen-whole survives a reload, per table');
    app.storage.setItem('pat:syncState', J({ userId: 'ZZUSER', hashV: 2, seenAllAt: 'garbage', rec: { seenAllAt: 7 }, ph: { seenAllAt: months(2) } }));
    const g = app.fn('_syncStateFor')('ZZUSER');
    t.eq(g.seenAllAt, null, 'garbage seen-whole → never (the safe direction)');
    t.eq(g.rec.seenAllAt, null, '…for records too');
    t.eq(g.ph.seenAllAt, months(2), 'a good one is kept');
  });

  /* ------------------------------------------------------------------ 66b */
  await t.group('66b — a stale phone: a job deleted elsewhere, its marker gone → removed here, nothing sent back', async () => {
    const { app, keep, gone } = await staleTwo();
    // Another account's row with the same id: the list is this account's own.
    app.srv.tables.sessions.push({ id: gone, user_id: '22222222-2222-2222-2222-222222222222', doc: {}, deleted: false, fp: null, updated_at: '2020-01-01T00:00:00.000Z' });
    await run(app);
    t.ok(app.srv.lists('sessions').length >= 1, 'the jobs table was listed in full');
    t.ok(app.srv.lists('sessions').every(c => c.url.includes('user_id=eq.' + UID)), 'this account’s rows only (V111)');
    t.notOk(onPhone(app, gone), 'the job the cloud no longer has is removed from this phone');
    t.ok(onPhone(app, keep), 'the one still in the cloud stays');
    t.excludes(J(app.srv.sentIds('sessions')), gone, 'and it was NOT sent back up');
    t.notOk(app.srv.tables.sessions.some(r => r.id === gone && r.user_id === UID), 'the cloud still has no row for it');
    t.ok(tombs(app, 'session').includes(gone), 'removed the way a delete arriving removes it (on the delete ledger)');
    const st = syncState(app);
    t.notOk(st.sent[gone], 'no longer counted as sent');
    t.eq(st.gone[gone], true, '…and known as gone, so no delete is sent for it');
    t.eq(msg(app).indexOf('Removed 1 job deleted on your other device.'), 0, 'the Sync page says what happened, in the usual words — opening with a capital');
    t.ok(st.seenAllAt && Date.now() - Date.parse(st.seenAllAt) < 60000, 'the jobs table is now seen whole');
    const lists = app.srv.lists('sessions').length;
    await run(app);
    t.eq(app.srv.lists('sessions').length, lists, 'so the next run lists nothing');
    // A phone in touch eight months ago (cursor stand-in) is not checked at all.
    const b = await signedIn();
    const k2 = job(b, 'ZZB1');
    const g2 = job(b, 'ZZB2');
    cloudRow(b, k2);
    staleState(b, { jobs: [k2, g2], months: 8 });
    await run(b);
    t.eq(b.srv.lists('sessions').length, 0, 'eight months: no list read');
    t.ok(onPhone(b, g2), '…and nothing removed (its marker would still be there)');
  });

  /* ------------------------------------------------------------------ 66c */
  await t.group('66c — edited here: asked, never sent; “use the cloud” deletes it; “keep” sends it and it stays', async () => {
    const { app, gone } = await staleTwo();
    app.fn('openSession')(gone);
    withItem(app, { assetNo: 'ZZEDITED', result: 'pass' });
    app.run('state.activeId = null; state.view = "sessions";');
    app.stopTimer();
    await run(app);
    t.ok(onPhone(app, gone), 'an edited job is not removed');
    const h = held(app).find(e => e.id === gone);
    t.ok(h, 'it is asked about');
    t.eq(h && h.reason, 'deleted-elsewhere', '…as deleted elsewhere');
    t.excludes(J(app.srv.sentIds('sessions')), gone, 'and not sent while the question stands');
    t.eq(syncState(app).seenAllAt, null, 'nothing recorded as seen whole while a question stands');
    // "Use the cloud copy" = the delete. The row is gone for good, so it is done here.
    await app.fn('syncHeldResolve')(gone, 'cloud');
    app.stopTimer(); await tick(30);
    t.notOk(onPhone(app, gone), '“use the cloud” removes it from this phone');
    t.excludes(msg(app), 'has been kept', 'not the old “no longer in the cloud, kept” answer');
    t.excludes(J(app.srv.sentIds('sessions')), gone, 'and it never goes back up');

    // Keep this phone's copy: sent back live, and the remembered answer never
    // removes it. A SECOND question left standing keeps the phone due, so the
    // runs after the answer reuse the remembered check (66i) — the case where an
    // older answer could otherwise take the kept job back off the phone.
    const b = await staleTwo();
    const other = job(b.app, 'ZZGONE2');
    const st0 = syncState(b.app); st0.sent[other] = hashOf(b.app, other);
    b.app.storage.setItem('pat:syncState', J(st0));
    for (const id of [b.gone, other]) {
      b.app.fn('openSession')(id);
      withItem(b.app, { assetNo: 'ZZEDITED-' + id, result: 'pass' });
      b.app.run('state.activeId = null; state.view = "sessions";');
      b.app.stopTimer();
    }
    await run(b.app);
    t.eq(held(b.app).filter(e => e.reason === 'deleted-elsewhere').length, 2, '(both edited jobs asked about)');
    const lists = b.app.srv.lists('sessions').length;
    await b.app.fn('syncHeldResolve')(b.gone, 'phone');
    b.app.stopTimer(); await tick(30);
    t.includes(J(b.app.srv.sentIds('sessions')), b.gone, '“keep this phone’s copy” sends it back');
    t.ok(b.app.srv.tables.sessions.some(r => r.id === b.gone && r.deleted === false), '…live');
    await run(b.app);
    await run(b.app);
    t.eq(b.app.srv.lists('sessions').length, lists, '(the later runs reused the remembered check)');
    t.ok(onPhone(b.app, b.gone), 'the kept job is not removed on the older answer');
    t.ok(held(b.app).some(e => e.id === other), 'the other question still stands');
  });

  /* ------------------------------------------------------------------ 66d */
  await t.group('66d — 5A: a save’s push reads first; a failed or empty list sends nothing; short pages still list all', async () => {
    const { app, gone } = await staleTwo();
    const fresh = job(app, 'ZZNEW');
    await run(app, {});   // a save's quick send: no pull asked for
    const firstList = app.srv.calls.findIndex(c => c.method === 'GET' && new URLSearchParams(c.url.split('?')[1] || '').get('select') === 'id');
    t.ok(firstList > -1, 'even a send-only run lists the table first');
    t.ok(app.srv.firstPost() === -1 || firstList < app.srv.firstPost(), '…before anything is sent');
    t.notOk(onPhone(app, gone), '…and decides it, so the deleted job is not sent back');
    t.excludes(J(app.srv.sentIds('sessions')), gone, 'not sent');
    t.includes(J(app.srv.sentIds('sessions')), fresh, 'new work still goes up in the same run');

    // A list that fails: nothing at all is sent.
    const b = await staleTwo();
    job(b.app, 'ZZNEW2');
    b.app.srv.failList = 5;
    const ok = await run(b.app);
    t.eq(ok, false, 'the run reports failure');
    t.eq(b.app.srv.posts('sessions').length, 0, 'nothing sent');
    t.ok(onPhone(b.app, b.gone), 'nothing removed');
    t.includes(msg(b.app), 'That check couldn’t finish this time, so nothing has been sent', 'the Sync page says why, plainly');
    t.eq(syncState(b.app).seenAllAt || null, null, 'and it is still due');
    t.eq(b.app.fn('syncErrorMessage')({ status: 0, message: 'Failed to fetch', syncStage: 'check' }),
      'Couldn’t reach the server. Your jobs are safe on this phone — try again when you have signal.',
      'no signal says no signal, check or not');

    // An EMPTY list while this phone knows rows: treated as a failed read.
    const c = await signedIn();
    const g1 = job(c, 'ZZE1');
    const g2 = job(c, 'ZZE2');
    staleState(c, { jobs: [g1, g2] });
    await run(c);
    t.ok(onPhone(c, g1) && onPhone(c, g2), 'an empty cloud list removes nothing');
    t.eq(c.srv.posts('sessions').length, 0, '…and sends nothing');
    t.includes(msg(c), 'That check couldn’t finish', '…and says the check could not finish');

    // A server that caps each page below what was asked for.
    const d = await signedIn();
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push(job(d, 'ZZCAP' + i));
    ids.forEach(id => cloudRow(d, id));
    const lost = job(d, 'ZZCAPGONE');
    staleState(d, { jobs: ids.concat([lost]) });
    d.srv.cap = 2;
    await run(d);
    t.ok(ids.every(id => onPhone(d, id)), 'every job still in the cloud stays, though no page held them all');
    t.notOk(onPhone(d, lost), 'and the one really gone is still found');
    t.ok(d.srv.lists('sessions').length >= 4, 'paged until a page came back empty (5 ids, 2 a page → 4 reads)');
  });

  /* ------------------------------------------------------------------ 66e */
  await t.group('66e — 4A: a safety copy first, only when something here is in question; refused → asked', async () => {
    const { app, gone } = await staleTwo();
    await run(app);
    const copy = snaps(app).get('before-cloud-check');
    t.ok(copy, 'a safety copy was kept, in its own slot');
    t.includes(copy && copy.json, 'ZZGONE', '…holding the job that was then removed');
    t.eq(copy && copy.kind, 'before', '…listed with the safety copies');
    t.notOk(onPhone(app, gone), 'the removal went ahead');
    t.ok(snaps(app).get('before-restore') === undefined, 'the restore’s own undo slot is untouched');
    t.eq(app.fn('snapshotLabel')({ id: 'before-cloud-check', kind: 'before', day: '2026-10-14', takenAt: '2026-10-14T09:14:00.000Z' }).indexOf('Before the cloud check'), 0,
      'Backup & Restore names it “Before the cloud check”');
    t.eq(app.fn('snapshotLabel')({ id: 'before-restore', kind: 'before', day: '2026-10-14', takenAt: '2026-10-14T09:14:00.000Z' }).indexOf('Before your last restore'), 0,
      'the restore’s copy keeps its own name');

    // Nothing here in question → no copy.
    const b = await signedIn();
    const k = job(b, 'ZZONLY');
    cloudRow(b, k);
    staleState(b, { jobs: [k] });
    await run(b);
    t.ok(b.srv.lists('sessions').length >= 1, '(the check ran)');
    t.notOk(snaps(b).get('before-cloud-check'), 'nothing in question → no copy taken');

    // A refused write: asked instead of removed.
    const c = await staleTwo();
    c.app.run("snapshotBeforeCloudCheck = () => Promise.reject(new Error('ZZ disk full'))");
    await run(c.app);
    t.ok(onPhone(c.app, c.gone), 'no copy → nothing removed');
    const h = held(c.app).find(e => e.id === c.gone);
    t.eq(h && h.reason, 'deleted-elsewhere', '…it is asked about instead, clean copy or not');
    t.excludes(J(c.app.srv.sentIds('sessions')), c.gone, 'and still not sent back');
    // No snapshots on this phone at all: asked as well.
    const d = await staleTwo();
    d.app.run("snapshotBeforeCloudCheck = () => Promise.resolve('unsupported')");
    await run(d.app);
    t.ok(onPhone(d.app, d.gone), 'no snapshots on this phone → asked, not removed');
  });

  /* ------------------------------------------------------------------ 66g */
  await t.group('66g — records: a clean client goes; the tester in use is asked; bookkeeping-only put right', async () => {
    const app = await signedIn();
    const k = job(app, 'ZZRECJOB');
    cloudRow(app, k);
    withSession(app, { client: 'ZZGONECO', site: 'ZZGONESITE' });
    app.run('state.activeId = null; state.view = "sessions";');
    app.stopTimer();
    const cli = app.state().clients.find(c => c.name === 'ZZGONECO');
    const cid = String(cli.id);
    const hash = app.run(`_syncRecordHash('client', state.clients.find(c => String(c.id) === ${J(cid)}))`);
    // Another record the cloud still has, so the list is not empty.
    app.srv.tables.records.push({ id: 'ZZRECKEEP', user_id: UID, kind: 'client', doc: { id: 'ZZRECKEEP', name: 'ZZKEEPCO' }, deleted: false, last_modified: 'x', updated_at: app.srv.stamp() });
    withInstrument(app, { make: 'ZZ Tester In Use' });
    const inst = app.run('activeInstrument() && String(activeInstrument().id)');
    t.ok(inst, '(precondition: a tester in use on this phone)');
    const rec = { [cid]: hash, ZZRECKEEP: 'h', ZZONLYBOOK: 'h', [app.run('SYNC_INUSE_ID')]: 'h' };
    rec[inst] = app.run(`_syncRecordHash('instrument', activeInstrument())`);
    staleState(app, { jobs: [k], rec });
    await run(app);
    t.ok(app.srv.lists('records').length >= 1, 'the records table was listed');
    t.notOk(app.state().clients.some(c => String(c.id) === cid), 'a clean client gone from the cloud is removed here');
    t.excludes(J(app.srv.sentIds('records')), cid, 'and not sent back');
    const st = syncState(app);
    t.notOk(st.rec.sent.ZZONLYBOOK, 'one only in the bookkeeping: no longer counted as sent');
    t.eq(st.rec.gone.ZZONLYBOOK, true, '…known as gone');
    t.notOk(st.rec.gone[app.run('SYNC_INUSE_ID')], 'a settings row known as sent is never treated as gone');
    t.notOk(held(app).some(e => e.id === app.run('SYNC_INUSE_ID')), 'the tester-in-use row is never in question');
    t.ok(app.run('state.instruments.some(i => String(i.id) === ' + J(inst) + ')'), 'the tester in use is not removed');
    t.ok(held(app).some(e => e.id === inst && e.reason === 'deleted-elsewhere'), '…it is asked about (v83 2A)');
  });

  /* ------------------------------------------------------------------ 66g2 */
  await t.group('66g2 — records: seen whole after a clean check; no safety copy → asked; “use the cloud” deletes', async () => {
    const mk = async (refuse) => {
      const app = await signedIn();
      const k = job(app, 'ZZREC2');
      cloudRow(app, k);
      withSession(app, { client: 'ZZGONECO2', site: 'ZZGONESITE2' });
      app.run('state.activeId = null; state.view = "sessions";');
      app.stopTimer();
      const cid = String(app.state().clients.find(c => c.name === 'ZZGONECO2').id);
      app.srv.tables.records.push({ id: 'ZZRECKEEP', user_id: UID, kind: 'client', doc: { id: 'ZZRECKEEP', name: 'ZZKEEPCO' }, deleted: false, last_modified: 'x', updated_at: app.srv.stamp() });
      const hash = app.run(`_syncRecordHash('client', state.clients.find(c => String(c.id) === ${J(cid)}))`);
      staleState(app, { jobs: [k], rec: { [cid]: hash, ZZRECKEEP: 'h' } });
      if (refuse) app.run("snapshotBeforeCloudCheck = () => Promise.reject(new Error('ZZ disk full'))");
      await run(app);
      return { app, cid };
    };
    const a = await mk(false);
    t.notOk(a.app.state().clients.some(c => String(c.id) === a.cid), 'clean client gone from the cloud: removed');
    const rs = syncState(a.app).rec;
    t.ok(rs.seenAllAt && Date.now() - Date.parse(rs.seenAllAt) < 60000, 'records seen whole after a clean run');
    const b = await mk(true);
    t.ok(b.app.state().clients.some(c => String(c.id) === b.cid), 'no safety copy → the client is kept…');
    t.ok(held(b.app).some(e => e.id === b.cid && e.reason === 'deleted-elsewhere'), '…and asked about');
    t.excludes(J(b.app.srv.sentIds('records')), b.cid, '…and not sent back');
    const key = b.app.fn('syncHeldKey')(held(b.app).find(e => e.id === b.cid));
    await b.app.fn('syncHeldResolve')(key, 'cloud');
    b.app.stopTimer(); await tick(30);
    t.notOk(b.app.state().clients.some(c => String(c.id) === b.cid), '“use the cloud” on a record gone for good deletes it here');
    t.excludes(J(b.app.srv.sentIds('records')), b.cid, '…and it never goes back up');
  });

  /* ------------------------------------------------------------------ 66h */
  await t.group('66h — photos: the note of one no longer here goes; one still here stays noted and is not re-sent', async () => {
    const app = await signedIn();
    for (let k = 0; k < 100 && !app.state().photoMetaReady; k++) await tick(10);
    const k = job(app, 'ZZPHJOB');
    cloudRow(app, k);
    const item = String(app.state().sessions.find(s => String(s.id) === k).items[0].id);
    app.srv.tables.photos.push({ id: 'ZZPHKEEP', user_id: UID, session_id: k, item_id: item, deleted: false, updated_at: app.srv.stamp() });
    app.run(`state.photoMeta['ZZPHHERE'] = { i: ${J(item)}, s: ${J(k)}, at: '2026-01-01T00:00:00.000Z', b: 10 }`);
    app.run(`state.photoMeta['ZZPHKEEP'] = { i: ${J(item)}, s: ${J(k)}, at: '2026-01-01T00:00:00.000Z', b: 10 }`);
    app.run("photoBlob = () => Promise.resolve(new Blob(['ZZIMG'], { type: 'image/jpeg' }))");
    app.run("photoThumbBlob = () => Promise.resolve(new Blob(['ZZTHUMB'], { type: 'image/jpeg' }))");
    const e = { s: k, i: item };
    staleState(app, { jobs: [k], ph: { ZZPHGONE: e, ZZPHHERE: e, ZZPHKEEP: e } });
    await run(app);
    t.ok(app.srv.lists('photos').length >= 1, 'the photos table was listed');
    const ph = syncState(app).ph;
    t.notOk(ph.sent.ZZPHGONE, 'a photo neither here nor in the cloud: its note is dropped');
    t.ok(ph.sent.ZZPHHERE, 'a photo still on this phone stays noted…');
    t.excludes(J(app.srv.sentIds('photos')), 'ZZPHHERE', '…so it is never sent back up to a cloud that deleted it');
    t.ok(app.state().photoMeta.ZZPHHERE, 'and nothing is removed from the phone (1A)');
    t.ok(ph.sent.ZZPHKEEP, 'one still in the cloud is untouched');
    t.ok(ph.seenAllAt && Date.now() - Date.parse(ph.seenAllAt) < 60000, 'photos seen whole');
  });

  /* ------------------------------------------------------------------ 66i */
  await t.group('66i — a run held open by a question reuses the check for an hour', async () => {
    const { app, gone } = await staleTwo();
    app.fn('openSession')(gone);
    withItem(app, { assetNo: 'ZZHOLD', result: 'pass' });
    app.run('state.activeId = null; state.view = "sessions";');
    app.stopTimer();
    await run(app);
    const n = app.srv.lists('sessions').length;
    t.ok(n >= 1 && held(app).some(e => e.id === gone), 'first run: listed, and asked');
    await run(app);
    await run(app, {});
    t.eq(app.srv.lists('sessions').length, n, 'the next runs (a save’s too) do not list again within the hour');
    t.ok(held(app).some(e => e.id === gone), '…and the question still stands');
    t.excludes(J(app.srv.sentIds('sessions')), gone, '…and it is still not sent');
    app.run('_syncCheckMemo.ms -= SYNC_CHECK_MEMO_MS + 1000');
    await run(app);
    t.ok(app.srv.lists('sessions').length > n, 'after the hour, it lists again');
    // Another account on the same page load never borrows the answer.
    t.eq(app.run('_syncCheckMemo.uid'), UID, 'the remembered answer names its account');
  });

  /* ------------------------------------------------------------------ 66j */
  await t.group('66j — the server’s time: a clock wound back cannot put the check off', async () => {
    // The phone says it is 8 months since it was seen whole; the server, 10.
    const app = await signedIn({ issuedMs: Date.now() + 61 * DAY });
    const k = job(app, 'ZZTIME1');
    const g = job(app, 'ZZTIME2');
    cloudRow(app, k);
    staleState(app, { jobs: [k, g], seenAllAt: iso(Date.now() - 8 * 30.5 * DAY) });
    await run(app);
    t.ok(app.srv.lists('sessions').length >= 1, 'due by the server’s time → listed');
    t.notOk(onPhone(app, g), '…and the deleted job removed');
    t.ok(Date.parse(syncState(app).seenAllAt) <= Date.now() + 1000, 'seen whole is recorded at the EARLIER of the two times');
  });

  /* ------------------------------------------------------------------ 66f */
  await t.group('66f — release: V128, What’s new, cache, changelog', () => {
    const app = freshApp();
    t.eq(app.run('APP_VERSION'), 'V128', 'APP_VERSION V128');
    t.eq(app.run('WELCOME_VERSION'), 'V128', 'What’s new rolled to V128');
    t.includes(read('sw.js'), "const CACHE_VERSION = 'pat-v128';", 'cache key pat-v128');
    const core = read('render-core.js');
    t.includes(core, '<li><strong>Safer after a long time away.</strong>', 'V128’s What’s new');
    const sheet = core.slice(core.indexOf('<ul class="welcome-list sheet-scroll">'), core.indexOf('</ul>', core.indexOf('<ul class="welcome-list sheet-scroll">')));
    t.eq((sheet.match(/<li>/g) || []).length, 1, '… one line');
    t.excludes(core, '<li><strong>Your plan, clearly.</strong>', 'V127’s sheet copy gone');
    const help = read('render-help.js');
    const a = help.indexOf('<p><strong>V128</strong>'), b = help.indexOf('<p><strong>V127</strong>'), c = help.indexOf('<p><strong>V126</strong>');
    t.ok(a > -1 && b > a && c > b, 'About: V128, V127, V126');
    t.excludes(help, '<p><strong>V125</strong>', 'V125 rolled off');
    t.excludes(help, 'Export everything: one zip file of everything on this phone', 'V125’s line gone with it');
    t.includes(help, 'Safer after a long time away: a phone that hasn', 'About: V128’s line');
    t.includes(help, 'Your plan, clearly: a signed-in cloud account sees', 'About: V127’s line still there');
    t.includes(help, 'A smoother first start: on a new phone PATGo no longer reloads', 'About: V126’s line still there');
    // The server's rule sits beside the phone's.
    t.includes(read('config.js'), 'const SYNC_MARKER_DAYS = 365;', 'the marker age the clean-up job must respect is written down');
  });
};
